#!/usr/bin/env node
/**
 * @adnet/mcp (stdio) — local MCP server for the Adviverse control plane.
 * Each user runs this with their own scoped API key.
 *
 * Env: ADVIVERSE_API_KEY (required), ADVIVERSE_BASE_URL (default https://adviverse.com)
 * For the hosted multi-tenant variant see http.ts.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AdNetClient } from '@adviverse/sdk';
import { createServer } from './server.js';

const apiKey = process.env.ADVIVERSE_API_KEY;
const baseUrl = process.env.ADVIVERSE_BASE_URL || 'https://adviverse.com';
if (!apiKey) {
  console.error('ADVIVERSE_API_KEY is required (create one in Settings → API keys).');
  process.exit(1);
}

async function main() {
  const server = createServer(new AdNetClient({ baseUrl, apiKey }));
  await server.connect(new StdioServerTransport());
  console.error(`adviverse-mcp ready (stdio, ${baseUrl})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
