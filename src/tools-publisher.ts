import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';

type Tool = <S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>,
) => void;

/** Shared report window/dimension params (used by every report tool in server.ts). */
export const reportQuery = {
  from: z.string().optional().describe('ISO date/datetime, inclusive start'),
  to: z.string().optional().describe('ISO date/datetime, inclusive end'),
  dim: z.string().optional().describe("Group-by dimension, e.g. 'day', 'geo', 'device'"),
};

/** Combinable filters for publisher_report / publisher_placements_report / report_breakdown. */
const list = (what: string) => z.string().optional().describe(`Filter: comma-separated ${what} (max 20); AND-combined with the other filters`);
export const reportFilters = {
  country: list('ISO-3166 alpha-2 country codes'),
  device: list('device types'),
  format: list('ad formats'),
  placement: list('placement ids'),
  property: list('property ids'),
  os: list('OS names'),
  browser: list('browser names'),
};

/** Publisher payout + Smartlink tools (kept out of server.ts, which is at the file-length cap). */
export function registerPublisherTools(tool: Tool, client: AdNetClient) {
  tool('get_payment_methods', 'List the configured deposit + payout rails and the minimum payout (USD).', {}, () => client.finance.methods());
  tool(
    'create_smartlink',
    "Create a Smartlink: a direct_link placement whose URL (returned as directUrl) can go in social bios/posts, messengers, buttons or APKs and redirects each visitor to the best-paying eligible offer for their geo/device/OS. No website needed (filed under the account's auto-provisioned Smartlink property, which starts CPA-only and is trust-promoted on clean volume). passbackUrl = where visitors go when nothing matches.",
    {
      name: z.string(),
      trafficType: z.enum(['social', 'website', 'apk', 'messenger', 'mixed']).optional(),
      passbackUrl: z.string().optional(),
      propertyId: z.string().optional().describe('Optional: put it on one of your own properties instead'),
    },
    (a) => client.placements.createSmartlink(a),
  );
}
