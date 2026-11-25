import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { CreateCampaignRequest, CreateCreativeRequest, UpdateCreativeRequest, CreateDealRequest, BrandSafetyConfig, CreateFeedRequest, CapiEvent, OnboardingProfile, MarketplaceCatalogItem, CreatePromoteCampaignRequest, AgentSignupRequest } from '@adviverse/sdk';
import { type Tool, fields, page, idem } from './shared.js';

/** advertiser tools (createServer registers each domain file). */
export function registerAdvertiserCoreTools(tool: Tool, client: AdNetClient) {
  /* ---- account ---- */
  tool('whoami', 'Return the account the API key belongs to.', {}, () => client.auth.me());
  tool('agent_signup', 'No account yet? Create one headlessly (no captcha/browser/password) and start using its API key in this session. The owner gets a verification email; payouts wait for it. fields: { email, type?: advertiser|publisher, companyName?, country?, scopes?, expiresInDays? }.', { fields: z.object({ email: z.string() }).passthrough() },
    async (a) => { const r = await client.auth.agentSignup(a.fields as AgentSignupRequest); client.setApiKey(r.apiKey.key); return r; });
  tool('public_stats', 'Public network stats: total ads served and total paid out (Redis-cached).', {}, () => client.stats.public());

  /* ---- campaigns (advertiser) ---- */
  tool('list_campaigns', "List the advertiser account's campaigns.", page, (a) => client.campaigns.list(a));
  tool('get_campaign', 'Get one campaign by id.', { id: z.string() }, (a) => client.campaigns.get(a.id));
  tool('create_campaign', 'Create a campaign. `fields` follows the API CreateCampaign body (name, format, pricingModel, bidAmount, budgetDaily, …). Optional `utm` object ({enabled,source,medium,campaign,content,term}) tags the landing URL for the advertiser\'s own analytics; omit for the default (enabled, auto values). Routing booleans (both default true): `autoOwnPlacements` — a house/backfill-tier campaign also runs on every placement your account publishes, even if not on its placement whitelist; `networkExpansion` — smart routing weights delivery toward sites where similar ads perform well (false = pure targeting).', { fields, idempotencyKey: idem }, (a) => client.campaigns.create(a.fields as CreateCampaignRequest, a.idempotencyKey));
  tool('update_campaign', 'Update a campaign (partial fields, incl. autoOwnPlacements / networkExpansion routing booleans).', { id: z.string(), fields }, (a) => client.campaigns.update(a.id, a.fields as Partial<CreateCampaignRequest>));
  tool('delete_campaign', 'Delete a campaign (soft-delete): stops serving and removes it from the list; past spend/stats stay in reporting.', { id: z.string() }, (a) => client.campaigns.remove(a.id));
  tool('submit_campaign', 'Submit a campaign for review. Returns status active right away when all its creatives are already approved (verified account); else pending_review until they are.', { id: z.string() }, (a) => client.campaigns.submit(a.id));
  tool('set_campaign_status', 'Set a campaign status (e.g. active, paused).', { id: z.string(), status: z.string() }, (a) => client.campaigns.setStatus(a.id, a.status as Parameters<typeof client.campaigns.setStatus>[1]));

  /* ---- retail media: marketplace catalog + promote-products campaigns ---- */
  tool('upsert_marketplace_catalog', 'Bulk upsert marketplace catalog items (create or update by external_id). fields.items = [{ external_id, title, description?, image_url?, price?, currency?, landing_url?, brand?, category?, keywords?: string[], availability? }]. These SKUs become eligible to be promoted as sponsored products in search.', { items: z.array(fields) }, (a) => client.marketplaceCatalog.upsert(a.items as MarketplaceCatalogItem[]));
  tool('list_marketplace_catalog', 'List the marketplace catalog items the account has uploaded.', {}, () => client.marketplaceCatalog.list());
  tool('create_promote_campaign', 'Create a seller "promote products" campaign (sponsored products). fields (camelCase): { name, pricingModel: cpc|cpa, bidAmount (max CPC, or the flat CPA rate — required unless cpaMode=percent), cpaMode?: flat|percent (CPA basis), cpaPercent? (fraction of order value billed per checkout when cpaMode=percent, 0–1 e.g. 0.15=15%), minOrderValue? (anti-fraud floor; checkouts below it never bill), budgetDaily?, budgetTotal?, pacing?, currency?, itemSelector ({item_ids:[]} | {keywords:[]} | {all:true}), targeting? }.', { fields }, (a) => client.promoteCampaigns.create(a.fields as CreatePromoteCampaignRequest));
  tool('list_promote_campaigns', "List the account's promote-products campaigns.", {}, () => client.promoteCampaigns.list());
  tool('submit_promote_campaign', 'Submit a promote-products campaign for review.', { id: z.string() }, (a) => client.promoteCampaigns.submit(a.id));
  tool('set_promote_campaign_status', 'Set a promote-products campaign status (e.g. active, paused).', { id: z.string(), status: z.string() }, (a) => client.promoteCampaigns.setStatus(a.id, a.status));

  /* ---- retail media: conversion tracking (per-checkout CPA settlement) ---- */
  tool('report_conversion', 'Report an attributed purchase (advertiser postback / S2S) for per-checkout (CPA) settlement. clickId = the ad click id (adclid) captured on the landing page; orderId = the marketplace order id (dedup key); orderValue = gross order amount (sent as order_value). Optional: value (billable-value override), eventId (at-most-once ingestion), campaignId (attribution hint). A verified, deduped Purchase debits the advertiser (CPA) and credits the publisher (rev-share).', { clickId: z.string(), orderId: z.string(), orderValue: z.number(), value: z.number().optional(), eventId: z.string().optional(), campaignId: z.string().optional() }, (a) => client.conversions.purchase({ clickId: a.clickId, orderId: a.orderId, orderValue: a.orderValue, value: a.value, eventId: a.eventId, campaignId: a.campaignId }));
  tool('report_refund', 'Report a refund / chargeback for a previously reported order — reverses its CPA settlement with a compensating (append-only) ledger entry. orderId = the marketplace order id to reverse; advertiserId optionally scopes the reversal.', { orderId: z.string(), advertiserId: z.string().optional() }, (a) => client.conversions.refund({ orderId: a.orderId, advertiserId: a.advertiserId }));

  /* ---- creatives (library, independent of campaigns) ---- */
  tool('list_creatives', "List the advertiser's whole creative library.", {}, () => client.creatives.list());
  tool('list_campaign_creatives', 'List creatives serving a campaign (authored + attached).', { campaignId: z.string() }, (a) => client.creatives.listForCampaign(a.campaignId));
  tool('get_creative', 'Get one creative by id.', { id: z.string() }, (a) => client.creatives.get(a.id));
  tool('create_creative', 'Create a creative (full Studio parity — camelCase fields). fields: { type: image|native|popunder_url|push|html5|video|audio, landingUrl, assetUrl?, title?, description?, iconUrl?, mainImageUrl?, cta?, brandName?, starRating?(0-5), width?, height?, weight?, campaignId? (omit for library-only), duration?(sec 1-600), skipOffsetSec?(0-600, >0 = skippable), vpaidUrl?(https), companions?[{width,height,staticUrl(https),staticMime?,clickUrl?}] (max 5), vastTagUrl?(https third-party VAST tag; video/audio only) }. A video creative needs assetUrl OR vastTagUrl — with only vastTagUrl it serves as a VAST Wrapper around your own ad server\'s tag (duration is probed from the tag when omitted). type html5 = a playable (interactive HTML5) — host the ZIP via POST /v1/advertiser/creatives/playable first (returns assetUrl), then create with type html5 + that assetUrl on a full-screen/interstitial placement. Use upload to host a static asset, then add DCO variants via add_creative_component / set_creative_dco.', { fields }, (a) => client.creatives.create(a.fields as CreateCreativeRequest));
  tool('update_creative', 'Update a creative\'s content (camelCase fields: assetUrl, landingUrl, title, description, iconUrl, mainImageUrl, cta, brandName, starRating, width, height, weight, carouselItems, duration, skipOffsetSec, vpaidUrl, companions, vastTagUrl (null clears)). Changing assetUrl/landing/text/vastTagUrl/vpaidUrl/companions re-enters moderation. type & campaignId are fixed at creation.', { id: z.string(), fields }, (a) => client.creatives.update(a.id, a.fields as UpdateCreativeRequest));
  tool('delete_creative', 'Delete a creative.', { id: z.string() }, (a) => client.creatives.delete(a.id));
  tool('attach_creative', 'Attach a library creative to a campaign (optional rotation weight).', { id: z.string(), campaignId: z.string(), weight: z.number().optional() }, (a) => client.creatives.attach(a.id, a.campaignId, a.weight));
  tool('detach_creative', 'Detach a library creative from a campaign.', { id: z.string(), campaignId: z.string() }, (a) => client.creatives.detach(a.id, a.campaignId));
  tool('creative_campaigns', 'List campaigns a library creative is attached to.', { id: z.string() }, (a) => client.creatives.campaigns(a.id));

  /* ---- deals (PMP) ---- */
  const dealRole = z
    .enum(['advertiser', 'publisher'])
    .optional()
    .describe('Which side to view: deals where the account is the publisher (seller) or advertiser (buyer). Omit for the account default.');
  tool('list_deals', 'List private marketplace deals.', { ...page, role: dealRole }, (a) => client.deals.list(a));
  tool(
    'create_deal',
    'Create a PMP deal. Omit advertiserId to create an "open" deal — the response includes a claim_token to share. fields: { name, advertiserId?, placementId?, dealType?, floorCpm?, currency? }.',
    { fields, idempotencyKey: idem },
    (a) => client.deals.create(a.fields as CreateDealRequest),
  );
  tool('lookup_deal_advertiser', 'Resolve an advertiser account by exact email, to target a deal at them.', { email: z.string() }, (a) => client.deals.lookupAdvertiser(a.email));
  tool('set_deal_status', 'Set a deal status (active, paused, pending, expired). Publisher (seller) side only.', { id: z.string(), status: z.string() }, (a) => client.deals.setStatus(a.id, a.status));
  tool('accept_deal', 'Accept a deal offered to the advertiser → it goes active.', { id: z.string() }, (a) => client.deals.accept(a.id));
  tool('preview_deal_claim', 'Preview an open deal from its claim token before claiming.', { token: z.string() }, (a) => client.deals.previewClaim(a.token));
  tool('claim_deal', 'Claim an open deal via its token → the caller becomes the advertiser and the deal goes active.', { token: z.string() }, (a) => client.deals.claim(a.token));

  /* ---- account pixel (Meta-Pixel-style event tag) ---- */
  tool('list_pixels', "List all pixels on the account. An account can run many pixels (e.g. an agency with one pixel per client); each pixel's events, config and reporting are isolated by pixel id.", {}, () => client.pixel.list());
  tool('create_pixel', "Create a new pixel under the account (returns its id + base snippet).", { name: z.string().optional() }, (a) => client.pixel.create(a.name));
  tool('delete_pixel', "Delete a pixel by id. An account always keeps at least one pixel.", { id: z.string() }, (a) => client.pixel.delete(a.id));
  tool('get_pixel', "Get one pixel's id, base snippet and standard event names. Pass pixelId for a specific pixel, else the account's primary.", { pixelId: z.string().optional() }, (a) => client.pixel.get(a.pixelId));
  tool('pixel_events', "Per-event pixel activity (count/users/value) over the last N days. Optionally scope to one pixelId.", { days: z.number().optional(), pixelId: z.string().optional() }, (a) => client.pixel.events(a.days ?? 30, a.pixelId));
  tool('pixel_insights', "Pixel funnel (users per stage) + conversions/revenue/spend/ROAS summary + daily trend over the last N days. Optionally scope to one pixelId.", { days: z.number().optional(), pixelId: z.string().optional() }, (a) => client.pixel.insights(a.days ?? 30, a.pixelId));
  tool('pixel_attribution', "Closed-loop source attribution over the last N days (distinct users, USD-normalized revenue): visitors, checkouts, sales closed, lost (explicitly reported lost sales), abandoned (started checkout, didn't buy), revenue, lost would-be revenue and conversion rate by last-touch source + UTM campaign; plus a lostReasons breakdown and a byFirstTouch (origination) view. Optionally scope to one pixelId.", { days: z.number().optional(), pixelId: z.string().optional() }, (a) => client.pixel.attribution(a.days ?? 30, a.pixelId));
  tool('pixel_products', "Product/content-level analytics over the last N days: distinct users who viewed / added-to-cart / purchased / lost each product (by content_id) and the revenue + lost would-be revenue it drove. Optionally scope to one pixelId.", { days: z.number().optional(), pixelId: z.string().optional() }, (a) => client.pixel.products(a.days ?? 30, a.pixelId));
  tool('get_user_traits', "Look up a user's CDP trait profile by canonical id (id_…), cookie uid, or email. Pass pixelId to see ONLY the traits that pixel set (agency client isolation); omit for account-wide.", { user: z.string(), pixelId: z.string().optional() }, (a) => client.pixel.traits(a.user, a.pixelId));
  tool('set_pixel_realtime', "Toggle real-time, action-based audiences. When enabled, each pixel event updates rule audiences instantly (add on the include event, remove on the exclude event) instead of the ~2-min batch, and an `assign: '<key>'` param on a tracked event drops the user into that audience — auto-creating it the first time the key is seen.", { enabled: z.boolean(), pixelId: z.string().optional() }, (a) => client.pixel.setRealtime(a.enabled, a.pixelId));
  tool('update_pixel_settings', "Update per-pixel configuration: name, defaultConsent (personalize events that carry no explicit consent signal — false = aggregate-only until consent), and allowedDomains (allowlist of page hosts that may fire the pixel; empty = any). Pass pixelId to target a specific pixel, else the primary.", { pixelId: z.string().optional(), name: z.string().optional(), defaultConsent: z.boolean().optional(), allowedDomains: z.array(z.string()).optional() }, (a) => client.pixel.updateSettings({ pixelId: a.pixelId, name: a.name, defaultConsent: a.defaultConsent, allowedDomains: a.allowedDomains }));

  /* ---- campaigns: targeting / brand-safety / bids / conversion config ---- */
  tool('get_campaign_targeting', "Get a campaign's resolved targeting configuration.", { id: z.string() }, (a) => client.campaigns.targeting(a.id));
  tool('set_campaign_brand_safety', 'Set brand-safety rules for a campaign. fields: { categories?, keywords?, domains?, sensitivity?, options? }.', { id: z.string(), fields }, (a) => client.campaigns.setBrandSafety(a.id, a.fields as BrandSafetyConfig));
  tool('get_conversion_config', "Get a campaign's conversion-tracking config.", { id: z.string() }, (a) => client.campaigns.getConversionConfig(a.id));
  tool('set_conversion_config', "Set a campaign's conversion-tracking config (fields = config body).", { id: z.string(), fields }, (a) => client.campaigns.setConversionConfig(a.id, a.fields));

  /* ---- creatives: transcode + DCO components ---- */
  tool('transcode_creative', 'Transcode a video creative to HLS for SSAI (fire-and-forget).', { id: z.string() }, (a) => client.creatives.transcode(a.id));
  tool('add_creative_component', 'Add a DCO component to a creative pool. slot: headline|body|image|cta|logo|bg_color.', { id: z.string(), slot: z.string(), value: z.string() }, (a) => client.creatives.addComponent(a.id, { slot: a.slot, value: a.value }));
  tool('list_creative_components', "List a creative's DCO component pool.", { id: z.string() }, (a) => client.creatives.components(a.id));
  tool('remove_creative_component', 'Remove a DCO component from a creative pool.', { id: z.string(), componentId: z.string() }, (a) => client.creatives.removeComponent(a.id, a.componentId));
  tool('set_creative_dco', 'Toggle DCO / dynamic-product-ad flags. fields: { isDco?, dcoContext?, productAd?, defaultProductId? }.', { id: z.string(), fields }, (a) => client.creatives.setDco(a.id, a.fields as Parameters<typeof client.creatives.setDco>[1]));
  tool(
    'upload_creative_asset',
    'Host a creative asset (image/video/HTML5 bundle) on the Adviverse CDN and malware-scan it; returns { assetUrl, scan }. Provide EITHER `base64` (the raw file bytes, base64-encoded) OR `url` (a remote asset the server fetches & re-hosts). Then pass the returned assetUrl into create_creative/update_creative.',
    {
      base64: z.string().optional().describe('Raw file bytes, base64-encoded.'),
      url: z.string().optional().describe('Remote asset URL to fetch and host instead of base64.'),
      filename: z.string().optional().describe('Filename (sets the upload type, e.g. ad.png / promo.mp4).'),
      contentType: z.string().optional().describe('MIME type, e.g. image/png, video/mp4.'),
    },
    async (a) => {
      let part: BlobPart;
      let name = a.filename;
      if (a.base64) {
        part = Buffer.from(a.base64, 'base64') as unknown as BlobPart;
      } else if (a.url) {
        const r = await fetch(a.url);
        if (!r.ok) throw new Error(`fetch ${a.url} -> ${r.status} ${r.statusText}`);
        part = await r.arrayBuffer();
        if (!name) {
          try { name = new URL(a.url).pathname.split('/').pop() || undefined; } catch { /* keep undefined */ }
        }
      } else {
        throw new Error('provide either `base64` or `url`');
      }
      const blob = new Blob([part], a.contentType ? { type: a.contentType } : undefined);
      return client.creatives.upload(blob, {}, name || 'upload');
    },
  );

  /* ---- feeds (dynamic product ads) ---- */
  tool('list_feeds', 'List product feeds.', {}, () => client.feeds.list());
  tool('create_feed', 'Create a product feed. fields: { name, url, format: csv|xml|google_merchant, scheduleCron? }.', { fields }, (a) => client.feeds.create(a.fields as CreateFeedRequest));
  tool('fetch_feed', 'Trigger an immediate feed fetch/refresh.', { id: z.string() }, (a) => client.feeds.fetch(a.id));
  tool('list_feed_products', 'List products parsed from a feed.', { id: z.string(), ...page }, (a) => client.feeds.products(a.id, { limit: a.limit, offset: a.offset }));

  /* ---- CAPI (server-side conversions) ---- */
  tool('rotate_capi_token', 'Generate/rotate the CAPI access token (revokes the previous one).', {}, () => client.capi.rotateToken());
  tool('list_capi_events', 'Recent CAPI events received.', { limit: z.number().optional() }, (a) => client.capi.events(a.limit));
  tool('send_capi_events', 'Ingest server-side conversions. Auth is the CAPI token (from rotate_capi_token), NOT the session key.', { capiToken: z.string(), events: z.array(z.any()) }, (a) => client.capi.send(a.capiToken, a.events as CapiEvent[]));

  /* ---- public tracking (server-side) ---- */
  tool('track_conversion', 'Record a conversion by click id (S2S postback). fields: { clickId|click_id, value?, orderId?, orderValue?, payout?, revenue? (payout/revenue = tracker conversion value aliases), postbackId? }.', { fields }, (a) => client.track.conversion(a.fields as Parameters<typeof client.track.conversion>[0]));
  tool('track_event', 'Ingest a pixel event server-side (same payload pixel.js sends). fields = event object.', { fields }, (a) => client.track.event(a.fields as Record<string, unknown>));

  /* ---- account lifecycle: KYC / onboarding / connections / referrals ---- */
  tool('get_kyc', 'KYC verification status for the account.', {}, () => client.account.kyc());
  tool('start_kyc', 'Start hosted identity verification → returns a URL to visit.', {}, () => client.account.startKyc());
  tool('get_onboarding', 'Onboarding progress/state.', {}, () => client.account.onboarding());
  tool('save_onboarding_profile', 'Save the onboarding profile. fields: { goal?, name?, company?, country?, currency?, timezone?, marketingOptIn? }.', { fields }, (a) => client.account.saveOnboardingProfile(a.fields as OnboardingProfile));
  tool('list_connections', 'List linked social-login providers.', {}, () => client.auth.connections());
  tool('disconnect_provider', 'Disconnect a linked social-login provider.', { provider: z.string() }, (a) => client.auth.disconnect(a.provider));
  tool('set_password', 'Set or change the account password. Omit currentPassword when the account is SSO-only (setting a password for the first time so email+password login also works); required when changing an existing password.', { newPassword: z.string(), currentPassword: z.string().optional() }, (a) => client.auth.setPassword(a.newPassword, a.currentPassword));
  tool('list_referrals', 'Referral program overview.', {}, () => client.referrals.list());
  tool('get_affiliate', 'Refer & earn (Referalli affiliate program): joined?, ?via= link, clicks, sign-ups, commissions pending/credited, terms.', {}, () => client.referrals.affiliate());
  tool('join_affiliate', 'Join Refer & earn: enroll this account as an affiliate and get its ?via= link (idempotent).', {}, () => client.referrals.joinAffiliate());
}
