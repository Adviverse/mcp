import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import { registerCpaGoalTools } from './tools-cpa-goals.js';
import { registerPublisherTools } from './tools-publisher.js';
import { registerBuyingTools } from './tools-buying.js';
import { registerDspTools } from './tools-dsp.js';
import { registerProofsTools } from './tools/proofs.js';
import { registerAdvertiserCoreTools } from './tools/advertiser.js';
import { registerSupplyCoreTools } from './tools/supply.js';
import { registerMoneyCoreTools } from './tools/money.js';
import { registerReportingCoreTools } from './tools/reporting.js';
import { registerAudienceCoreTools } from './tools/audience.js';
import { registerAgencyCoreTools } from './tools/agency.js';
import { registerPlatformCoreTools } from './tools/platform.js';
import { registerCreativeStudioTools } from './tools/creative-studio.js';
import { registerAutopilotTools } from './tools/autopilot.js';
import { registerPushTools } from './tools/push.js';
import { registerOfferwallTools } from './tools/offerwall.js';
import { registerInstantPayoutTools } from './tools/instant-payouts.js';
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (data: unknown): Result => ({
  content: [{ type: 'text', text: JSON.stringify(data ?? { ok: true }, null, 2) }],
});

/**
 * Build an MCP server bound to a given API client. One per stdio process or, for
 * the hosted HTTP server, one per session (so each caller uses their own key).
 */
export function createServer(client: AdNetClient): McpServer {
  const server = new McpServer({ name: 'adviverse', version: '0.1.0' });

  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    run: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>,
  ) {
    const handler = async (args: z.objectOutputType<S, z.ZodTypeAny>): Promise<Result> => {
      try {
        return ok(await run(args));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    };
    // McpServer.tool is heavily overloaded; cast to the exact (name, description,
    // shape, cb) overload we use rather than `any`.
    type ToolRegistrar = (
      name: string,
      description: string,
      shape: S,
      cb: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<Result>,
    ) => void;
    (server.tool as unknown as ToolRegistrar)(name, description, shape, handler);
  }

  registerAdvertiserCoreTools(tool, client);
  registerSupplyCoreTools(tool, client);
  registerMoneyCoreTools(tool, client);
  registerReportingCoreTools(tool, client);
  registerAudienceCoreTools(tool, client);
  registerAgencyCoreTools(tool, client);
  registerPlatformCoreTools(tool, client);
  registerCpaGoalTools(tool, client);
  registerPublisherTools(tool, client);
  registerBuyingTools(tool, client);
  registerDspTools(tool, client);
  registerProofsTools(tool, client);
  registerCreativeStudioTools(tool, client);
  registerAutopilotTools(tool, client);
  registerPushTools(tool, client);
  registerOfferwallTools(tool, client);
  registerInstantPayoutTools(tool, client);

  return server;
}
