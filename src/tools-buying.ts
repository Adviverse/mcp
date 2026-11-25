import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';

type Tool = <S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>,
) => void;

const strList = z.array(z.string()).optional();

/** Advertiser buying tools: reach, bid suggestions, per-placement performance (server.ts is at the length cap). */
export function registerBuyingTools(tool: Tool, client: AdNetClient) {
  tool('bid_recommendation', 'Recommended bid range for a format (optionally scoped to a geo), from recent clearing prices.', { format: z.string(), geo: z.string().optional() }, (a) => client.campaigns.bidRecommendation({ format: a.format, geo: a.geo }));
  tool('reach_estimate', 'Estimate daily ad requests (last 7 days) for a draft targeting spec. Applied: format, geoInclude, geoExclude, deviceTypes, os, browsers, dayparting (168 ints, UTC), placementWhitelist, placementBlacklist, propertyCategoryInclude/Exclude. Audience/contextual/language/ISP/radius/freq-cap are not applied (upper bound).', {
    format: z.string().optional(), geoInclude: strList, geoExclude: strList, deviceTypes: strList, os: strList, browsers: strList,
    dayparting: z.array(z.number().int()).optional(), placementWhitelist: strList, placementBlacklist: strList,
    propertyCategoryInclude: z.array(z.number().int()).optional(), propertyCategoryExclude: z.array(z.number().int()).optional(),
  }, (a) => client.campaigns.reachEstimate(a));
  tool('bid_suggestion', 'Min / recommended / top bid for a campaign BEFORE creating it, from the last 7 days of clearing prices (min never below the lowest placement floor). CPC/CPA bids are converted with observed CTR/CVR (or engine defaults, flagged rateSource=default).', {
    format: z.string(), geo: strList, device: strList, model: z.enum(['cpm', 'cpc', 'cpa', 'cpi']).optional(),
  }, (a) => client.buying.bidSuggestion(a));
  tool('campaign_placement_performance', "Per-placement impressions/clicks/conversions/spend/CTR/eCPA for a campaign (last `days`, default 30) with allow/block status and custom bid multiplier. Block/allow via update_campaign targeting.placementBlacklist/placementWhitelist; custom bid via bidModifiers.placement { <placementId>: multiplier }.", {
    campaignId: z.string(), days: z.number().int().optional(),
  }, (a) => client.buying.placementPerformance(a.campaignId, a.days));
}
