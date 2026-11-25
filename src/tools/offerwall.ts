import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { Tool } from './shared.js';

const wallFields = {
  currencyName: z.string().optional().describe('Virtual currency name, e.g. "Gems".'),
  exchangeRate: z.number().optional().describe('Currency units credited per USD of publisher payout.'),
  iconUrl: z.string().optional().describe('https icon shown on the wall.'),
  callbackUrl: z.string().optional().describe('https S2S endpoint that receives the signed completion callback.'),
  userCap: z.number().int().optional().describe('Max completions per user per offer (default 1).'),
};

/** Offerwall tools: publisher walls + callbacks, advertiser opt-in. */
export function registerOfferwallTools(tool: Tool, client: AdNetClient) {
  tool('list_offerwalls', 'List your offerwalls (one per property): currency config, callback URL and the hosted wall URL to open in an iframe/webview.',
    {}, () => client.offerwall.list());
  tool('create_offerwall',
    'Create an offerwall on a property. Returns callbackSecret ONCE. Callbacks: GET callbackUrl?user_id&offer_id&payout&currency_amount&transaction_id&sig where sig = hex HMAC-SHA256(secret, "transaction_id:user_id:offer_id:payout:currency_amount"); retried with backoff; credit once per transaction_id.',
    { propertyId: z.string(), ...wallFields }, (a) => client.offerwall.create(a));
  tool('update_offerwall', 'Update an offerwall config or pause/resume it.',
    { placementId: z.string(), ...wallFields, status: z.enum(['active', 'paused']).optional() },
    ({ placementId, ...body }) => client.offerwall.update(placementId, body));
  tool('rotate_offerwall_secret', 'Issue a new callback HMAC secret (returned once).', { placementId: z.string() },
    (a) => client.offerwall.rotateSecret(a.placementId));
  tool('offerwall_completions', 'Offerwall delivery log: credited completions with callback status/attempts, newest first.',
    { placementId: z.string(), limit: z.number().optional().describe('1-500, default 100.') },
    (a) => client.offerwall.completions(a.placementId, a.limit));
  tool('retry_offerwall_callback', 'Re-queue a failed/pending completion callback for immediate delivery.', { completionId: z.string() },
    (a) => client.offerwall.retryCallback(a.completionId));
  tool('offerwall_earnings', 'Per-wall completions, USD earned, currency awarded and callback outcomes over the last N days.',
    { days: z.number().int().optional().describe('1-365, default 30.') }, (a) => client.offerwall.earnings(a.days));
  tool('get_campaign_offerwall', 'Advertiser: is this CPA campaign shown in publisher offerwalls, and is it eligible?', { campaignId: z.string() },
    (a) => client.offerwall.getOptIn(a.campaignId));
  tool('set_campaign_offerwall',
    'Advertiser: show/hide a CPA campaign (flat payout, USD) in publisher offerwalls, with optional user-facing instructions (e.g. "Install and reach level 5").',
    { campaignId: z.string(), enabled: z.boolean(), instructions: z.string().optional() },
    ({ campaignId, ...body }) => client.offerwall.setOptIn(campaignId, body));
}
