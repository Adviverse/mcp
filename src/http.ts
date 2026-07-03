/**
 * @adnet/mcp (HTTP) — hosted, multi-tenant MCP server (Streamable HTTP).
 *
 * One endpoint, `POST/GET/DELETE /mcp`. Each caller passes their own scoped API
 * key — `Authorization: Bearer ak_<prefix>.<secret>` (or `x-api-key`) — and the
 * server spins up a per-session MCP bound to that key, so one process serves
 * many tenants without sharing credentials.
 *
 * Env: ADVIVERSE_BASE_URL (default https://adviverse.com), PORT (default 8787).
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { AdNetClient } from '@adviverse/sdk';
import { createServer } from './server.js';

const baseUrl = process.env.ADVIVERSE_BASE_URL || 'https://adviverse.com';
const port = Number(process.env.PORT || 8787);

const transports = new Map<string, StreamableHTTPServerTransport>();

function extractKey(req: http.IncomingMessage): string | undefined {
  const a = req.headers['authorization'];
  if (typeof a === 'string' && a.toLowerCase().startsWith('bearer ')) return a.slice(7).trim();
  const x = req.headers['x-api-key'];
  return typeof x === 'string' && x ? x : undefined;
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : undefined);
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

const rpcError = (res: http.ServerResponse, code: number, message: string, status = 400) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
};

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname !== '/mcp') {
    res.writeHead(404).end('not found');
    return;
  }

  try {
    const sid = req.headers['mcp-session-id'] as string | undefined;

    // Existing session → route to its transport.
    if (sid && transports.has(sid)) {
      const t = transports.get(sid)!;
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      await t.handleRequest(req, res, body);
      return;
    }

    // New session: must be an `initialize` POST carrying an API key.
    if (req.method !== 'POST') {
      rpcError(res, -32000, 'No valid session — send initialize first.');
      return;
    }
    const body = await readBody(req);
    if (!isInitializeRequest(body)) {
      rpcError(res, -32000, 'No valid session — send initialize first.');
      return;
    }
    const key = extractKey(req);
    if (!key) {
      rpcError(res, -32001, 'Missing API key (Authorization: Bearer ak_<prefix>.<secret>).', 401);
      return;
    }

    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => {
        transports.set(id, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    const server = createServer(new AdNetClient({ baseUrl, apiKey: key }));
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error('mcp http error', e);
    if (!res.headersSent) res.writeHead(500).end('internal error');
  }
});

srv.listen(port, () => {
  console.error(`adviverse-mcp http listening on :${port} (api ${baseUrl})`);
});
