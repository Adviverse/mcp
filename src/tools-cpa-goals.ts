import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';

type Tool = <S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>,
) => void;

const metric = z.enum(['conversions', 'ecpa']);
const op = z.enum(['lt', 'lte', 'gt', 'gte']);

/** CPA Goal tools (kept out of server.ts, which is at the file-length cap). */
export function registerCpaGoalTools(tool: Tool, client: AdNetClient) {
  tool('list_cpa_goals', "List a campaign's CPA Goal rules, plus trackingConfigured (S2S postbacks set up) and applicable (CPM/CPC campaign).", { campaignId: z.string() }, (a) => client.cpaGoals.list(a.campaignId));
  tool('create_cpa_goal', 'Create a CPA Goal rule: auto-block a placement for this campaign once it spent >= spendThreshold and (metric=conversions, op lt|lte) conversions < value, or (metric=ecpa, op gt|gte) spend/max(conversions,1) > value. Evaluated ~every 10 min; only ADDS to the placement blacklist.', { campaignId: z.string(), metric, op, value: z.number(), spendThreshold: z.number().optional(), windowDays: z.number().int().optional(), enabled: z.boolean().optional() },
    ({ campaignId, ...body }) => client.cpaGoals.create(campaignId, body));
  tool('update_cpa_goal', 'Update a CPA Goal rule (any subset of metric, op, value, spendThreshold, windowDays, enabled).', { campaignId: z.string(), ruleId: z.string(), metric: metric.optional(), op: op.optional(), value: z.number().optional(), spendThreshold: z.number().optional(), windowDays: z.number().int().optional(), enabled: z.boolean().optional() },
    ({ campaignId, ruleId, ...body }) => client.cpaGoals.update(campaignId, ruleId, body));
  tool('delete_cpa_goal', 'Delete a CPA Goal rule (placements it blocked stay blocked).', { campaignId: z.string(), ruleId: z.string() }, (a) => client.cpaGoals.delete(a.campaignId, a.ruleId));
  tool('preview_cpa_goals', 'Dry run: placements the enabled CPA Goal rules would block right now, with spend/conversions/eCPA.', { campaignId: z.string() }, (a) => client.cpaGoals.preview(a.campaignId));
  tool('cpa_goal_actions', 'Log of placements CPA Goal blocked for a campaign, newest first.', { campaignId: z.string(), limit: z.number().optional() }, (a) => client.cpaGoals.actions(a.campaignId, a.limit));
}
