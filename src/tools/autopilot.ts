import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { Tool } from './shared.js';

const goal = z.enum(['target_cpa', 'target_roas', 'max_conversions', 'max_clicks']);
const limit = z.number().optional().describe('Max rows (1-500, default 100).');

/** Advertiser Autopilot + Publisher Yield Autopilot tools. */
export function registerAutopilotTools(tool: Tool, client: AdNetClient) {
  tool('list_autopilots', 'List Advertiser Autopilot configs, optionally for one campaign group (groupId) or ad set (campaignId).',
    { groupId: z.string().optional(), campaignId: z.string().optional() }, (a) => client.autopilot.list(a));
  tool('set_autopilot',
    'Create/update Autopilot for exactly one of groupId (campaign group) or campaignId (ad set). Every ~15 min it steps manual CPM/CPC bids toward the goal (±maxStepPct per run, within minBid..maxBid), shifts daily budget between a group\'s ad sets toward the most efficient (budget-neutral, dailyBudgetCap caps the total), and with blockPlacements (target_cpa) adds one CPA Goal rule per ad set. dryRun defaults to true (proposals only).',
    { groupId: z.string().optional(), campaignId: z.string().optional(), goal, target: z.number().optional().describe('Target CPA (currency) or ROAS ratio; required for target_* goals.'),
      minBid: z.number().optional(), maxBid: z.number().optional(), dailyBudgetCap: z.number().optional(), maxStepPct: z.number().optional(),
      windowHours: z.number().int().optional(), blockPlacements: z.boolean().optional(), dryRun: z.boolean().optional(), enabled: z.boolean().optional() },
    (a) => client.autopilot.upsert(a));
  tool('delete_autopilot', 'Delete an Autopilot config (changes already made stay).', { configId: z.string() }, (a) => client.autopilot.delete(a.configId));
  tool('autopilot_actions', 'Autopilot action log: bid/budget/CPA-Goal-rule changes and dry-run proposals with before/after + reason, newest first.',
    { configId: z.string(), limit }, (a) => client.autopilot.actions(a.configId, a.limit));
  tool('run_autopilot', 'Run one Autopilot pass now (dry-run configs only log proposals).', { configId: z.string() }, (a) => client.autopilot.run(a.configId));
  tool('revert_autopilot', 'Revert the latest applied Autopilot run (hand-edited values are kept) and switch the config to dry-run.', { configId: z.string() },
    (a) => client.autopilot.revert(a.configId));

  tool('list_yield_autopilots', 'List Publisher Yield Autopilot configs, optionally for one placementId or propertyId.',
    { placementId: z.string().optional(), propertyId: z.string().optional() }, (a) => client.yieldAutopilot.list(a));
  tool('set_yield_autopilot',
    'Create/update Yield Autopilot for exactly one of placementId or propertyId. Hourly: lowers the floor by maxStepPct when paid fill < minFill; raises it by maxStepPct only while projected fill stays >= minFill; within minFloor..maxFloor (CPM). dryRun defaults to true.',
    { placementId: z.string().optional(), propertyId: z.string().optional(), minFill: z.number().optional().describe('0.01-0.99, default 0.6'),
      maxStepPct: z.number().optional(), minFloor: z.number().optional(), maxFloor: z.number().optional(), windowHours: z.number().int().optional(),
      dryRun: z.boolean().optional(), enabled: z.boolean().optional() },
    (a) => client.yieldAutopilot.upsert(a));
  tool('delete_yield_autopilot', 'Delete a Yield Autopilot config (floors already set stay).', { configId: z.string() }, (a) => client.yieldAutopilot.delete(a.configId));
  tool('yield_autopilot_actions', 'Yield Autopilot floor-change log (and dry-run proposals) with fill metrics + reason, newest first.',
    { configId: z.string(), limit }, (a) => client.yieldAutopilot.actions(a.configId, a.limit));
  tool('yield_autopilot_recommendations', 'Combo presets that would add formats the property does not run yet (recommendation only).', { configId: z.string() },
    (a) => client.yieldAutopilot.recommendations(a.configId));
  tool('run_yield_autopilot', 'Run one Yield Autopilot pass now.', { configId: z.string() }, (a) => client.yieldAutopilot.run(a.configId));
  tool('revert_yield_autopilot', 'Revert the latest applied Yield Autopilot run and switch the config to dry-run.', { configId: z.string() },
    (a) => client.yieldAutopilot.revert(a.configId));
}
