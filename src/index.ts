#!/usr/bin/env node
/**
 * @adnet/mcp (stdio) — local MCP server for the Adviverse control plane.
 * Each user runs this with their own scoped API key.
 *
 * Env: ADVIVERSE_API_KEY, ADVIVERSE_BASE_URL (default https://adviverse.com).
 * Without ADVIVERSE_API_KEY it uses the key saved by `adviverse login` (the CLI's
 * config.json). For the hosted multi-tenant variant see http.ts.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AdNetClient } from '@adviverse/sdk';
import { createServer } from './server.js';

/** Same path as Go's os.UserConfigDir() + adviverse/config.json (where the CLI saves its login). */
function cliConfigPath(): string {
  const env = process.env;
  const dir =
    process.platform === 'win32' ? env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support')
    : env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(dir, 'adviverse', 'config.json');
}

interface CliConfig { api_key?: string; base_url?: string; expires_at?: string }

function cliConfig(): CliConfig {
  try {
    return JSON.parse(readFileSync(cliConfigPath(), 'utf8'));
  } catch {
    return {};
  }
}

const saved: CliConfig = process.env.ADVIVERSE_API_KEY ? {} : cliConfig();
const apiKey = process.env.ADVIVERSE_API_KEY || saved.api_key;
const baseUrl = process.env.ADVIVERSE_BASE_URL || saved.base_url || 'https://adviverse.com';
if (!apiKey) {
  console.error(
    `No API key: set ADVIVERSE_API_KEY (Settings → API keys) or run \`adviverse login\` (looked in ${cliConfigPath()}).`,
  );
  process.exit(1);
}
if (saved.expires_at && Date.parse(saved.expires_at) < Date.now()) {
  console.error(`The saved CLI key expired at ${saved.expires_at}; run \`adviverse login\` again.`);
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
