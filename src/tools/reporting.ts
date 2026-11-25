import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { CreateAutomationRuleRequest, ReportQuery } from '@adviverse/sdk';
import { type Tool, fields, page } from './shared.js';
import { reportFilters, reportQuery } from '../tools-publisher.js';

/** reporting tools (createServer registers each domain file). */
export function registerReportingCoreTools(tool: Tool, client: AdNetClient) {
  /* ---- reporting ---- */
  tool('advertiser_report', 'Advertiser spend/performance report.', reportQuery, (a) => client.reporting.advertiser(a as ReportQuery));
  tool('publisher_report', 'Publisher revenue/delivery report (dim=day|hour|geo|device|format|placement_id|campaign_id), narrowed by any combination of filters.', { ...reportQuery, ...reportFilters }, (a) => client.reporting.publisher(a as ReportQuery));
  tool('publisher_placements_report', 'Per-placement publisher rollup: impressions, clicks, CTR, revenue, RPM, eCPM, fill rate, paid fill rate (paid_fill_rate: house/self-promo fills excluded), viewable rate, and layout shift the slot causes (cls_avg per measured impression, cls_poor_rate = share with CLS > 0.1; reserve the slot box size to fix). Accepts the combinable filters.', { ...reportQuery, ...reportFilters }, (a) => client.reporting.publisherPlacements(a as ReportQuery));
  tool('publisher_fill_report', 'Publisher fill summary: requests, filled, fill_rate, paid_filled + paid_fill_rate (paid demand only, house/self-promo excluded; rates are %), and no-fill counts by reason.', reportQuery, (a) => client.reporting.publisherFill(a as ReportQuery));
  tool('anti_adblock_report', 'Anti-adblock: impressions recovered from visitors running an adblocker (served first-party), with daily series + recovered %.', reportQuery, (a) => client.reporting.antiAdblock(a as ReportQuery));

  /* ---- automation & alerts ---- */
  tool('list_automation_rules', 'List automation rules.', {}, () => client.automation.rules());
  tool('create_automation_rule', 'Create an automation rule. fields: { name?, scope?: campaign|all, targetId?, metric?: cpa|ctr|spend|conversions|fill_rate, operator?: gt|lt, threshold?, windowHours?, action?: pause|resume|notify|adjust_bid, actionValue?, enabled? }.', { fields }, (a) => client.automation.createRule(a.fields as CreateAutomationRuleRequest));
  tool('delete_automation_rule', 'Delete an automation rule.', { id: z.string() }, (a) => client.automation.deleteRule(a.id));
  tool('set_automation_rule_enabled', 'Enable or disable an automation rule (pause it without deleting).', { id: z.string(), enabled: z.boolean() }, (a) => client.automation.setRuleEnabled(a.id, a.enabled));
  tool('optimizer_log', 'Recent automated budget-reallocation actions.', { limit: z.number().optional() }, (a) => client.automation.optimizerLog(a.limit));
  tool('list_alerts', 'List anomaly/optimizer alerts.', {}, () => client.automation.alerts());
  tool('ack_alert', 'Acknowledge (mark read) an alert.', { id: z.string() }, (a) => client.automation.ackAlert(a.id));

  /* ---- reporting: advanced ---- */
  tool('report_ivt', 'Invalid-traffic breakdown.', reportQuery, (a) => client.reporting.ivt(a as ReportQuery));
  tool('report_reach', 'Reach & frequency (unique users): total reach, average frequency, a frequency-distribution histogram (impressions per user), and daily unique reach.', reportQuery, (a) => client.reporting.reach(a as ReportQuery));
  tool('report_breakdown', "Impressions/clicks/CTR/revenue/eCPM broken down by a dimension the hourly rollup drops: bdim = 'os' | 'browser' | 'deal' (PMP) | 'page' (site, by host) | 'page_url' (individual page, host+path — earnings per page) | 'app' (in-app/in-game app id — earnings per app) | 'property' (owning property) | 'region' | 'make'/'model' (device) | 'sub1'..'sub5' (affiliate sub-ids). revenue is publisher earnings or advertiser spend depending on the account. Defaults to os. Accepts the combinable filters.", { ...reportQuery, ...reportFilters, bdim: z.enum(['os', 'browser', 'deal', 'page', 'page_url', 'app', 'property', 'region', 'make', 'model', 'sub1', 'sub2', 'sub3', 'sub4', 'sub5']).optional().describe('os | browser | deal | page | page_url | app | property') }, (a) => client.reporting.breakdown(a as ReportQuery & { bdim?: 'os' | 'browser' | 'deal' | 'page' | 'page_url' | 'app' | 'property' | 'region' | 'make' | 'model' | 'sub1' | 'sub2' | 'sub3' | 'sub4' | 'sub5' }));
  tool('report_creatives', 'Per-creative performance for the advertiser: impressions, clicks, CTR, conversions, CVR per creative, plus a daily-CTR fatigue series for the top creative.', reportQuery, (a) => client.reporting.creatives(a as ReportQuery));
  tool('report_roas', 'Advertiser ROAS / conversion-value daily trend: spend, conversions, conversion value, and ROAS (value/spend) per day.', reportQuery, (a) => client.reporting.roas(a as ReportQuery));
  tool('report_time_to_click', 'Time-to-click engagement latency: average, median, and a distribution histogram (<1s / 1-3s / 3-10s / 10-30s / 30s+).', reportQuery, (a) => client.reporting.timeToClick(a as ReportQuery));
  tool('report_delivery_funnel', 'Publisher delivery waterfall: ad requests → filled → rendered impressions → measurable → viewable, including the filled-but-not-rendered discrepancy and each stage rate.', reportQuery, (a) => client.reporting.deliveryFunnel(a as ReportQuery));
  tool('report_serve_latency', 'Ad-serving decision latency for the publisher: average, p50/p95/p99 of the engine decision time (ms), the slow-response rate (over the soft SLA), and a daily p95 trend.', reportQuery, (a) => client.reporting.serveLatency(a as ReportQuery));
  tool('report_consent_rate', 'Consent / GPC analytics: share of pixel events measured in personalized mode vs aggregate-only (consent granted / no GPC), with totals and a daily trend.', reportQuery, (a) => client.reporting.consentRate(a as ReportQuery));
  tool('report_benchmark', "Network benchmark for a publisher: your eCPM, fill rate and viewable rate vs the network — each with your value, the network median, your percentile rank and the sample size. Privacy-safe (no other publisher's data).", reportQuery, (a) => client.reporting.benchmark(a as ReportQuery));
  tool('report_sustainability', 'Sustainability / margin metrics.', { periodDays: z.number().optional() }, (a) => client.reporting.sustainability(a as ReportQuery));
  tool('report_funnel', 'Conversion funnel (impression→click→conversion).', reportQuery, (a) => client.reporting.funnel(a as ReportQuery));
  tool('report_realtime', 'Real-time KPI snapshot (last ~15 min).', {}, () => client.reporting.realtime());
  tool('report_geo', 'Geographic (country-level) performance.', reportQuery, (a) => client.reporting.geo(a as ReportQuery));
  tool('report_auction', 'Auction dynamics (requests/fills/fill-rate/no-fill reasons).', reportQuery, (a) => client.reporting.auction(a as ReportQuery));
  tool('report_pivot', 'Cross-tab of two dimensions.', { dim1: z.string(), dim2: z.string(), from: z.string().optional(), to: z.string().optional() }, (a) => client.reporting.pivot(a));
  tool('report_bid_landscape', 'Clearing-price percentiles + estimated win-rate curve.', {}, () => client.reporting.bidLandscape());
  tool('report_delivery_pacing', 'Delivery pacing for goal/booked campaigns.', {}, () => client.reporting.deliveryPacing());
  tool('report_journey', 'Top cross-site user-path sequences.', { from: z.string().optional(), to: z.string().optional(), topN: z.number().optional() }, (a) => client.reporting.journey(a));
  tool('report_incrementality', 'Per-campaign incrementality / lift vs holdout.', reportQuery, (a) => client.reporting.incrementality(a as ReportQuery));
  tool('report_closed_loop', 'Closed-loop full-funnel attribution for house campaigns.', reportQuery, (a) => client.reporting.closedLoop(a as ReportQuery));
  tool('report_personal_network', 'Personal Network (house ads) infra fees + delivery.', reportQuery, (a) => client.reporting.personalNetwork(a as ReportQuery));
  tool('report_viewability', 'Viewability metrics grouped by placement or campaign.', { groupBy: z.enum(['placement', 'campaign']).optional(), from: z.string().optional(), to: z.string().optional() }, (a) => client.reporting.viewability(a));
  tool('report_video', "Video completion analytics from quartile tracking: a funnel (starts → firstQuartile → midpoint → thirdQuartile → completes) with completionRate (completes÷starts), per-quartile retention, skips/skipRate and VAST error counts, plus a breakdown by placement (publisher) or campaign (advertiser). Returns { funnel, breakdown }.", { from: z.string().optional(), to: z.string().optional() }, (a) => client.reporting.video(a));
  tool('report_affiliate', "Affiliate sub-id performance: the FULL funnel per sub-id — impressions → clicks → conversions with CTR, CVR, revenue and payout. `sub` groups by sub1..sub5 (default sub1). Conversions/payout/CVR populate on advertiser scope (conversions carry no publisher_id).", { sub: z.enum(['sub1', 'sub2', 'sub3', 'sub4', 'sub5']).optional(), from: z.string().optional(), to: z.string().optional() }, (a) => client.reporting.affiliate(a));
  tool('report_carousel', 'Per-card carousel click attribution: clicks per card (0-based index) of each carousel creative, with the card title/price. Advertiser-scoped.', { from: z.string().optional(), to: z.string().optional() }, (a) => client.reporting.carousel(a));
  tool('list_saved_reports', 'List saved report configs.', {}, () => client.reporting.saved());
  tool('save_report', 'Save a report configuration. fields: { name?, config? }.', { fields }, (a) => client.reporting.saveSaved(a.fields as Parameters<typeof client.reporting.saveSaved>[0]));
  tool('delete_saved_report', 'Delete a saved report.', { id: z.string() }, (a) => client.reporting.deleteSaved(a.id));
  tool('list_scheduled_reports', 'List scheduled (emailed) reports.', {}, () => client.reporting.scheduled());
  tool('create_scheduled_report', 'Create a scheduled email report. fields: { name?, config?, cadence?: daily|weekly, email? }.', { fields }, (a) => client.reporting.createScheduled(a.fields as Parameters<typeof client.reporting.createScheduled>[0]));
  tool('delete_scheduled_report', 'Delete a scheduled report.', { id: z.string() }, (a) => client.reporting.deleteScheduled(a.id));

  /* ---- advertiser insights (auction-insight tooling) ---- */
  tool(
    'insights_bid_simulator',
    'Bid simulator: empirical win-rate curve extended with projected impressions + spend per day for ~10 candidate bids (plus your own `bid`, if given). Directional — see the response `note`. Prices are per-impression (CPM = price x 1000).',
    { format: z.string().describe('Ad format, e.g. banner / native / video.'), geo: z.string().optional().describe('ISO country code; omit for all geos.'), bid: z.number().optional().describe('Your own candidate bid (per-impression) to fold into the points.') },
    (a) => client.insights.bidSimulator(a),
  );
  tool(
    'insights_creative_performance',
    'Per-creative rollup (impressions, clicks, conversions, ctr, cvr, spend, ecpm) for one of your campaigns, sorted by spend.',
    { campaignId: z.string() },
    (a) => client.insights.creativePerformance(a.campaignId),
  );
  tool(
    'insights_competitiveness',
    "Competitiveness (low/moderate/high) of a targeting slice from the market's recent clearing-price distribution, with clearingP50/P90 and sampleSize.",
    { format: z.string(), geo: z.string().optional() },
    (a) => client.insights.competitiveness(a),
  );
  tool(
    'insights_shading_savings',
    'Directional bid-shading savings estimate from the active shading factors + your recent spend (optionally scoped to one campaign).',
    { campaignId: z.string().optional() },
    (a) => client.insights.shadingSavings({ campaignId: a.campaignId }),
  );
  tool(
    'insights_pacing',
    'Per-campaign delivery pacing: deliveredPct vs flightPct and whether each booked/goal campaign is on pace.',
    {},
    () => client.insights.pacing(),
  );

  /* ---- publisher insights (own-inventory auction tooling) ---- */
  tool(
    'publisher_insights_clearing',
    "Your OWN placement's clearing distribution: for ~10 candidate floors, fillRate = P(a bid clears >= floor) and expectedRevenue = floor x fillRate, plus clearing P50/P90 and sampleSize. This is your own revenue data — never exposes competitor identities.",
    { placementId: z.string() },
    (a) => client.publisherInsights.clearing(a.placementId),
  );
  tool(
    'publisher_insights_floor_recommendation',
    'Revenue-maximizing floor recommendation for one of your placements (the yield optimizer\'s pick), with the expected-revenue lift over your current floor and recommended soft reserve. Thin data => keeps your current floor with a "not enough data" note.',
    { placementId: z.string() },
    (a) => client.publisherInsights.floorRecommendation(a.placementId),
  );
  tool(
    'publisher_insights_no_fill',
    "Per-placement no-fill reason breakdown over the last 30 days: totalRequests, filled, fillRate and the top no-fill reasons (count + pct), sorted desc.",
    { placementId: z.string() },
    (a) => client.publisherInsights.noFill(a.placementId),
  );
  tool(
    'publisher_insights_deals',
    "Delivery performance for all your deals: per-deal impressions, clicks, revenue and ecpm (keyed by deal_id attribution).",
    {},
    () => client.publisherInsights.deals(),
  );
}
