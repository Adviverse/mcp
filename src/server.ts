import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AdNetClient } from '@adviverse/sdk';
import type {
  CreateCampaignRequest,
  CreateCreativeRequest,
  UpdateCreativeRequest,
  CreatePropertyRequest,
  CreatePlacementRequest,
  UpdatePlacementRequest,
  CreateComboRequest,
  CreateDealRequest,
  BrandSafetyConfig,
  CreateFeedRequest,
  CapiEvent,
  DepositRequest,
  PayoutRequest,
  TaxFormRequest,
  RunExportRequest,
  VerificationSettings,
  CreateAutomationRuleRequest,
  CreateAppRequest,
  ReportQuery,
  CreateWebhookRequest,
  CreateApiKeyRequest,
  OnboardingProfile,
  UpsertGuideRequest,
  UpsertPostRequest,
  ContributeSegmentRequest,
  MarketplaceCatalogItem,
  CreatePromoteCampaignRequest,
  CreateWorldRequest,
  CreatePortalConfigRequest,
  FundPoolRequest,
  CreateOnchainPoolRequest,
} from '@adviverse/sdk';

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (data: unknown): Result => ({
  content: [{ type: 'text', text: JSON.stringify(data ?? { ok: true }, null, 2) }],
});

const fields = z.record(z.any());
const page = {
  limit: z.number().optional().describe('Max rows to return (omit for all).'),
  offset: z.number().optional().describe('Rows to skip (for paging).'),
};
const idem = z.string().optional().describe('Idempotency-Key: reuse to make a retried create safe (no duplicate).');
const reportQuery = {
  from: z.string().optional().describe('ISO date/datetime, inclusive start'),
  to: z.string().optional().describe('ISO date/datetime, inclusive end'),
  dim: z.string().optional().describe("Group-by dimension, e.g. 'day', 'geo', 'device'"),
};

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

  /* ---- account ---- */
  tool('whoami', 'Return the account the API key belongs to.', {}, () => client.auth.me());
  tool('public_stats', 'Public network stats: total ads served and total paid out (Redis-cached).', {}, () => client.stats.public());

  /* ---- campaigns (advertiser) ---- */
  tool('list_campaigns', "List the advertiser account's campaigns.", page, (a) => client.campaigns.list(a));
  tool('get_campaign', 'Get one campaign by id.', { id: z.string() }, (a) => client.campaigns.get(a.id));
  tool('create_campaign', 'Create a campaign. `fields` follows the API CreateCampaign body (name, format, pricingModel, bidAmount, budgetDaily, …). Optional `utm` object ({enabled,source,medium,campaign,content,term}) tags the landing URL for the advertiser\'s own analytics; omit for the default (enabled, auto values).', { fields, idempotencyKey: idem }, (a) => client.campaigns.create(a.fields as CreateCampaignRequest, a.idempotencyKey));
  tool('update_campaign', 'Update a campaign (partial fields).', { id: z.string(), fields }, (a) => client.campaigns.update(a.id, a.fields as Partial<CreateCampaignRequest>));
  tool('delete_campaign', 'Delete a campaign (soft-delete): stops serving and removes it from the list; past spend/stats stay in reporting.', { id: z.string() }, (a) => client.campaigns.remove(a.id));
  tool('submit_campaign', 'Submit a campaign for review.', { id: z.string() }, (a) => client.campaigns.submit(a.id));
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

  /* ---- terminal (CLI status-line) self-network serving ---- */
  tool('serve_terminal_ad', "Fetch ONE rotated terminal (CLI status-line) ad from YOUR OWN active terminal campaigns. Auth: a public `token` (ts_…) if given, else this key. Rotation/eligibility/frequency capping applied server-side. Optional campaignId narrows to one campaign; uid is a stable per-install id. Returns { text, cta, url, impression_url, ... } or {} on no-fill.", { token: z.string().optional(), campaignId: z.string().optional(), uid: z.string().optional() }, (a) => client.terminal.serve({ token: a.token, campaignId: a.campaignId, uid: a.uid }));
  tool('create_terminal_token', "Mint a PUBLIC terminal serve token (ts_…) — a non-secret, serve-only credential SAFE to embed in a distributed CLI/desktop app. Optionally pin it to one terminal campaign, and/or arm adaptive mode-switching (`switch`) so the engine flips each install from YOUR ads to the marketplace after it engages. Returns { id, token, ... }.", { name: z.string().optional(), campaignId: z.string().optional(), switch: z.object({ flipAfter: z.number().int().min(0).optional(), flipOnClick: z.boolean().optional(), fallbackTag: z.string().optional() }).optional() }, (a) => client.terminal.createToken({ name: a.name, campaignId: a.campaignId, switch: a.switch }));
  tool('list_terminal_tokens', 'List your public terminal serve tokens (includes each token\'s switch policy).', {}, () => client.terminal.listTokens());
  tool('set_terminal_token_policy', "Arm / update / disable a terminal serve token's adaptive mode-switching policy IN PLACE (the ts_ value keeps working). `flipAfter` flips an install to the marketplace after N self-network impressions; `flipOnClick` flips once it clicks your ad; `fallbackTag` (tk_…, one of your own placements) is served post-flip (omit = flip to no ad). Needs a campaign-pinned token. Pass all-zero/empty to disable.", { id: z.string(), flipAfter: z.number().int().min(0).optional(), flipOnClick: z.boolean().optional(), fallbackTag: z.string().optional() }, (a) => client.terminal.setTokenPolicy(a.id, { flipAfter: a.flipAfter, flipOnClick: a.flipOnClick, fallbackTag: a.fallbackTag }));
  tool('rotate_terminal_token', 'Rotate a terminal serve token by id (its old value stops working immediately). Returns the new token. The switch policy is preserved.', { id: z.string() }, (a) => client.terminal.rotateToken(a.id));
  tool('revoke_terminal_token', 'Revoke (delete) a terminal serve token by id.', { id: z.string() }, (a) => client.terminal.revokeToken(a.id));

  /* ---- properties (publisher inventory) ---- */
  tool('list_properties', 'List publisher properties (sites, CLIs, apps).', page, (a) => client.properties.list(a));
  tool('create_property', 'Register a property. fields: { kind: website|cli|mobile_app|ctv, domain, name?, verificationMethod? }.', { fields, idempotencyKey: idem }, (a) => client.properties.create(a.fields as CreatePropertyRequest, a.idempotencyKey));
  tool('update_property', 'Update a property. fields: { name?, domain?, category?, verificationMethod? }. Changing the domain resets verification.', { id: z.string(), fields }, (a) => client.properties.update(a.id, a.fields as Parameters<typeof client.properties.update>[1]));
  tool('verify_property', 'Trigger ownership verification for a property.', { id: z.string() }, (a) => client.properties.verify(a.id));
  tool('set_serving_domain', 'Set a first-party ad-serving domain on a property (anti-adblock). The publisher CNAMEs this host to our edge; returns the CNAME target. Pass domain:null to remove.', { id: z.string(), domain: z.string().nullable() }, (a) => client.properties.setServingDomain(a.id, a.domain));
  tool('verify_serving_domain', 'Verify a property custom serving domain CNAMEs to our edge (routes traffic + proves control). On success the tag serves first-party.', { id: z.string() }, (a) => client.properties.verifyServingDomain(a.id));

  /* ---- placements ---- */
  tool('list_placements', 'List ad placements.', page, (a) => client.placements.list(a));
  tool('create_placement', 'Create a placement. fields: { propertyId, name, format, floorCpm, … }.', { fields, idempotencyKey: idem }, (a) => client.placements.create(a.fields as CreatePlacementRequest, a.idempotencyKey));
  tool('get_placement_tag', 'Get the ad tag / install code for a placement.', { id: z.string() }, (a) => client.placements.tag(a.id));
  tool('rotate_placement_signing_secret', 'Generate/rotate a placement signing secret (Layer 3, returned once). With a secret set, the engine only serves /terminal requests carrying a valid HMAC signature.', { id: z.string() }, (a) => client.placements.rotateSigningSecret(a.id));
  tool('disable_placement_signing', 'Disable signed-tag enforcement on a placement.', { id: z.string() }, (a) => client.placements.disableSigning(a.id));

  /* ---- combos (layout presets — provision several placements + one embed snippet) ---- */
  tool('list_combo_presets', 'List the static combo / layout presets (each bundles several ad units: standard_combo, leaderboard_pop, social_push, sticky_interstitial, full_monetization).', {}, () => client.placements.comboPresets());
  tool('create_combo', 'Provision several ad units as placements on a property at once and get ONE combined embed snippet back (paste once before </body>). Provide EITHER a preset (presetKey) OR a custom set of units [{format,label?,width?,height?}]. fields: { presetKey?, units?, namePrefix?, floorCpm?, revShare?, auctionType?, passbackUrl?, houseOnly?, houseShare?, houseBackfill?, floorFallback? }.', { propertyId: z.string(), fields }, (a) => client.placements.createCombo(a.propertyId, a.fields as CreateComboRequest));

  /* ---- finance (read-only) ---- */
  tool('get_balance', "Get the account balance (available / held). The balance currency may be a tenant's own platform-token code (not an ISO code).", {}, () => client.finance.balance());
  tool('list_ledger', 'List ledger entries.', { limit: z.number().optional(), offset: z.number().optional() }, (a) => client.finance.ledger({ limit: a.limit, offset: a.offset }));

  /* ---- reporting ---- */
  tool('advertiser_report', 'Advertiser spend/performance report.', reportQuery, (a) => client.reporting.advertiser(a as ReportQuery));
  tool('publisher_report', 'Publisher revenue/delivery report.', reportQuery, (a) => client.reporting.publisher(a as ReportQuery));
  tool('publisher_placements_report', 'Per-placement publisher rollup: impressions, clicks, CTR, revenue, RPM, eCPM, fill rate and viewable rate.', reportQuery, (a) => client.reporting.publisherPlacements(a as ReportQuery));
  tool('anti_adblock_report', 'Anti-adblock: impressions recovered from visitors running an adblocker (served first-party), with daily series + recovered %.', reportQuery, (a) => client.reporting.antiAdblock(a as ReportQuery));

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

  /* ---- audiences (advertiser retargeting / lists / lookalikes) ---- */
  tool('list_audiences', "List the advertiser's audiences with their current size.", {}, () => client.audiences.list());
  tool('audience_suggestions', "Audience Builder: ready-to-create first-party audiences suggested from the account's own harvested pixel events (all visitors, engaged, cart/checkout abandoners, purchasers, high-value, per-product viewers) over the last N days. Each suggestion's `rule` can be passed to create_rule_audience.", { days: z.number().optional() }, (a) => client.audiences.suggestions(a.days ?? 30));
  tool(
    'create_audience',
    "Create an audience. type 'uploaded' (paste hashes) or 'retargeting' (grows from a pixel). pixelId scopes it to one pixel (agency = one per client); omit for account-wide.",
    { name: z.string(), type: z.enum(['uploaded', 'retargeting']).optional(), pixelId: z.string().optional() },
    (a) => client.audiences.create({ name: a.name, type: a.type, pixelId: a.pixelId }),
  );
  tool('add_audience_members', 'Bulk-add hashed user ids / emails to an audience.', { id: z.string(), hashes: z.array(z.string()) }, (a) => client.audiences.addMembers(a.id, a.hashes));
  tool('create_lookalike', 'Build a lookalike audience modeled from a seed audience (geo/device profile-match heuristic). size = target modeled users.', { id: z.string(), size: z.number().optional() }, (a) => client.audiences.lookalike(a.id, a.size));
  tool(
    'create_modeled_lookalike',
    "Build an IN-HOUSE MODELED lookalike from a seed audience using first-party pixel data: learns the content keywords / event types / value buckets DISTINCTIVE to the seed (vs your overall audience, so everywhere-common signals can't dominate) and materializes the top similar users. Privacy-safe (k-anonymity floors on seed + output, consent/opt-out honored). size = target modeled users; minScore (0..1) = optional per-candidate affinity threshold. Returns { audienceId, size, modeledFrom, note }.",
    { seedAudienceId: z.string(), size: z.number().optional(), minScore: z.number().min(0).max(1).optional() },
    (a) => client.audiences.createModeledLookalike(a.seedAudienceId, { size: a.size, minScore: a.minScore }),
  );
  tool(
    'preview_modeled_lookalike',
    'Preview the modeled lookalike for a seed audience WITHOUT creating it: returns seed/background sizes, whether it clears the k-anonymity floor (eligible), and the features most distinctive to the seed (the "why this lookalike" explainer).',
    { seedAudienceId: z.string() },
    (a) => client.audiences.modeledLookalikePreview(a.seedAudienceId),
  );
  tool('get_audience_pixel', 'Get the retargeting pixel (image + JS embeds) for a retargeting audience.', { id: z.string() }, (a) => client.audiences.pixel(a.id));
  tool(
    'create_rule_audience',
    "Create an event-rule audience (Meta-Pixel style): people who fired `event` within windowDays, optionally minus excludeEvent (e.g. AddToCart but not Purchase = cart abandoners).",
    {
      name: z.string(),
      event: z.string().describe('Event that includes a user, e.g. AddToCart, Purchase, ViewContent.'),
      windowDays: z.number().optional().describe('Lookback window in days (default 30).'),
      excludeEvent: z.string().optional().describe('Exclude users who also fired this event.'),
      pixelId: z.string().optional().describe('Scope to one pixel (agency = one per client); omit for account-wide.'),
    },
    (a) => client.audiences.create({ name: a.name, rule: { event: a.event, windowDays: a.windowDays, excludeEvent: a.excludeEvent }, pixelId: a.pixelId }),
  );
  tool(
    'create_tree_audience',
    "Create a FULL-DEPTH audience from a boolean rule TREE (AND/OR/NOT) over event AND trait predicates. `rule` is a RuleNode: {kind:'and'|'or', children:[...]} | {kind:'not', child:{...}} | {kind:'event', event, windowDays?, minCount?, filters?:[{param:'value'|'content_id'|'url', op?:'gte'|'lte'|'eq', value}]} | {kind:'trait', trait, cmp:'eq'|'neq'|'gt'|'gte'|'lt'|'lte'|'contains'|'exists', value?}. Example — pro users who abandoned cart: {kind:'and',children:[{kind:'event',event:'AddToCart',windowDays:14},{kind:'not',child:{kind:'event',event:'Purchase'}},{kind:'trait',trait:'plan',cmp:'eq',value:'pro'}]}.",
    { name: z.string(), rule: fields, pixelId: z.string().optional() },
    (a) => client.audiences.create({ name: a.name, rule: a.rule as Parameters<typeof client.audiences.create>[0]['rule'], pixelId: a.pixelId }),
  );
  tool(
    'set_user_traits',
    "Set CDP profile traits for a user (server-side). Identify the user via `am` (hashed email/phone). traits is a flat map, e.g. { plan:'pro', ltv:540 }. With real-time audiences on, trait-based rule audiences re-evaluate live.",
    { pixelId: z.string(), traits: fields, am: z.object({ em: z.string().optional(), ph: z.string().optional() }).optional() },
    (a) => client.track.traits({ pixelId: a.pixelId, traits: a.traits as Record<string, string | number>, am: a.am }),
  );
  tool('update_audience', 'Update an audience name and/or rule (flat or RuleNode tree). Re-resolves membership. fields: { name?, rule? }.', { id: z.string(), fields }, (a) => { const f = a.fields as { name?: string; rule?: unknown }; return client.audiences.update(a.id, f as Parameters<typeof client.audiences.update>[1]); });
  tool('estimate_audience', 'Estimate reach (distinct matching users) for a rule WITHOUT creating it. rule = flat rule or RuleNode tree. pixelId scopes the estimate to one pixel.', { rule: fields, pixelId: z.string().optional() }, (a) => client.audiences.estimate(a.rule as Parameters<typeof client.audiences.estimate>[0], a.pixelId));
  tool('list_audience_destinations', 'List an audience\'s external sync destinations.', { audienceId: z.string() }, (a) => client.audiences.destinations(a.audienceId));
  tool('add_audience_destination', "Add a sync destination to an audience. type: 'webhook' (config {url, secret?}) | 'meta_custom_audience' (config {audienceId, accessToken}) | 'google_customer_match' (config {customerId, userListId, accessToken, developerToken, loginCustomerId?}).", { audienceId: z.string(), type: z.enum(['webhook', 'meta_custom_audience', 'google_customer_match']), config: fields }, (a) => client.audiences.addDestination(a.audienceId, { type: a.type, config: a.config as Record<string, unknown> }));
  tool('sync_audience_destination', 'Push an audience to a destination now (returns { status, count }).', { destinationId: z.string() }, (a) => client.audiences.syncDestination(a.destinationId));
  tool('update_audience_destination', 'Update a destination (config and/or active flag). fields: { config?, active? }.', { destinationId: z.string(), fields }, (a) => client.audiences.updateDestination(a.destinationId, a.fields as Parameters<typeof client.audiences.updateDestination>[1]));
  tool('delete_audience_destination', 'Delete a destination.', { destinationId: z.string() }, (a) => client.audiences.deleteDestination(a.destinationId));
  tool('delete_audience', 'Delete an audience.', { id: z.string() }, (a) => client.audiences.delete(a.id));

  /* ---- Audience Cloud (DMP segments / interest taxonomy / data co-op) ---- */
  tool('segment_taxonomy', 'Get the shared interest taxonomy (IAB-style nodes: id, parent, name, contextual keywords, sensitive flag).', {}, () => client.segments.taxonomy());
  tool('segment_catalog', "Browse the segment catalog: for each interest, the CONTEXTUAL keywords (always usable — add to a campaign's targeting.contextual_include) and the BEHAVIORAL network preset when present ({ segmentId, size, dataCpm } — add segmentId to targeting.audience_include) or its build progress ({ size, needed }).", {}, () => client.segments.catalog());
  tool('contribute_segment', "Contribute one of the account's audiences to the privacy-safe co-op. The niche is AUTO-DETECTED from the audience's members' keywords — taxonomyId is optional (usually omit it). fields: { audienceId, revShare?, taxonomyId? }. Returns segmentId, revShare, and the resolved niche.", { fields }, (a) => client.segments.contribute(a.fields as ContributeSegmentRequest));
  tool('detect_niche', "Preview the auto-detected interest/niche for an audience (from its members' harvested keywords), before contributing it to the co-op.", { audienceId: z.string() }, (a) => client.segments.detectNiche(a.audienceId));
  tool('my_contributions', 'List segments the account has contributed to the co-op (id, name, taxonomy_id, size, rev_share, licensees).', {}, () => client.segments.contributions());
  tool('revoke_contribution', 'Withdraw a contributed segment from the co-op.', { id: z.string() }, (a) => client.segments.revoke(a.id));
  tool('license_segment', "License a network behavioral segment for targeting. Returns { segmentId, dataCpm, note } — add segmentId to a campaign's targeting.audience_include.", { id: z.string() }, (a) => client.segments.license(a.id));
  tool('my_licenses', 'List segments the account has licensed (target each by its segment_id in targeting.audience_include).', {}, () => client.segments.licenses());
  tool('segment_earnings', "Co-op data-fee statement: { totalEarned (rev-share you've accrued as a contributor, held until maturation), totalSpent (data fees you've paid as a licensee), bySegment ([{segmentId,name,earned}]), recentEarnings, recentSpend }.", {}, () => client.segments.earnings());
  tool('generate_cli_link_code', "Mint a one-time CLI link code (single-use, ~10-min TTL). The terminal/CLI user sets it as the ADVIVERSE_LINK_CODE env var to link that CLI's coding activity + audiences to this account's identity. Returns { code, expiresInSec }.", {}, () => client.segments.cliLinkCode());

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

  /* ---- team seats + per-pixel RBAC (agencies) ---- */
  tool('list_team', "List agency team members (seats): each member's role (admin = full account; manager = assigned pixels, read+write; analyst = assigned pixels, read-only), status, and assigned pixel ids. The account owner is implicit and not listed.", {}, () => client.team.list());
  tool('invite_team_member', "Invite a team member by email. role 'admin' grants full account access; 'manager'/'analyst' are confined to the given pixelIds (managers can write, analysts read-only). allPixels:true grants every pixel (implied for admin). Emails a single-use accept link.", { email: z.string(), name: z.string().optional(), role: z.enum(['admin', 'manager', 'analyst']), allPixels: z.boolean().optional(), pixelIds: z.array(z.string()).optional() }, (a) => client.team.invite({ email: a.email, name: a.name, role: a.role, allPixels: a.allPixels, pixelIds: a.pixelIds }));
  tool('update_team_member', "Change a member's role, pixel grants (pixelIds / allPixels), name, or status ('disabled' revokes access + kills their sessions; 'active' re-enables).", { id: z.string(), role: z.enum(['admin', 'manager', 'analyst']).optional(), allPixels: z.boolean().optional(), pixelIds: z.array(z.string()).optional(), status: z.enum(['active', 'disabled']).optional(), name: z.string().optional() }, (a) => client.team.update(a.id, { role: a.role, allPixels: a.allPixels, pixelIds: a.pixelIds, status: a.status, name: a.name }));
  tool('remove_team_member', "Remove a team seat entirely by member id (revokes their sessions).", { id: z.string() }, (a) => client.team.remove(a.id));

  /* ---- agency clients + per-client invoicing ---- */
  tool('list_clients', "List the agency's billable clients (name, billing email, linked pixel, tagged-campaign count). A client collects the spend of campaigns tagged to it.", {}, () => client.clients.list());
  tool('create_client', "Create an agency client. Optionally link a pixelId (the client's data side) so its spend + pixel-attributed revenue line up.", { name: z.string(), billingEmail: z.string().optional(), pixelId: z.string().optional(), notes: z.string().optional() }, (a) => client.clients.create({ name: a.name, billingEmail: a.billingEmail, pixelId: a.pixelId, notes: a.notes }));
  tool('update_client', "Update a client's name / billing email / linked pixel / notes / status ('active'|'archived').", { id: z.string(), name: z.string().optional(), billingEmail: z.string().optional(), pixelId: z.string().optional(), notes: z.string().optional(), status: z.enum(['active', 'archived']).optional() }, (a) => client.clients.update(a.id, { name: a.name, billingEmail: a.billingEmail, pixelId: a.pixelId, notes: a.notes, status: a.status }));
  tool('tag_campaign_client', "Tag a campaign to a client (clientId=null to untag) so its spend rolls up onto that client's invoices.", { campaignId: z.string(), clientId: z.string().nullable() }, (a) => client.clients.tagCampaign(a.campaignId, a.clientId));
  tool('client_spend', "Spend + delivery (impressions/clicks/conversions) for a client over a period (YYYY-MM-DD; defaults to last 30d), summed across its tagged campaigns.", { id: z.string(), from: z.string().optional(), to: z.string().optional() }, (a) => client.clients.spend(a.id, a.from, a.to));

  tool('list_invoices', "List agency invoices (optionally for one clientId). Each has status draft|sent|paid|void, total, and line items.", { clientId: z.string().optional() }, (a) => client.invoices.list(a.clientId));
  tool('get_invoice', "Get one invoice with its line items.", { id: z.string() }, (a) => client.invoices.get(a.id));
  tool('create_invoice', "Create a DRAFT invoice for a client. With periodStart/periodEnd (YYYY-MM-DD) it auto-adds the client's tagged-campaign spend as a line; markupPct adds an agency-fee line (% of spend). Extra manual items may be supplied.", { clientId: z.string(), periodStart: z.string().optional(), periodEnd: z.string().optional(), currency: z.string().optional(), dueAt: z.string().optional(), notes: z.string().optional(), markupPct: z.number().optional(), includeSpend: z.boolean().optional(), items: z.array(z.object({ description: z.string(), kind: z.string().optional(), quantity: z.number().optional(), unitAmount: z.number().optional(), amount: z.number().optional() })).optional() }, (a) => client.invoices.create(a as Parameters<typeof client.invoices.create>[0]));
  tool('add_invoice_item', "Add a manual line item to a DRAFT invoice (amount, or quantity*unitAmount).", { id: z.string(), description: z.string(), kind: z.string().optional(), quantity: z.number().optional(), unitAmount: z.number().optional(), amount: z.number().optional() }, (a) => client.invoices.addItem(a.id, { description: a.description, kind: a.kind, quantity: a.quantity, unitAmount: a.unitAmount, amount: a.amount }));
  tool('send_invoice', "Send a draft invoice: mints a public pay link and emails the client. Returns the invoice with payLink.", { id: z.string() }, (a) => client.invoices.send(a.id));
  tool('mark_invoice_paid', "Record an offline/out-of-band payment on an invoice (marks it paid).", { id: z.string() }, (a) => client.invoices.markPaid(a.id));
  tool('void_invoice', "Void an unpaid invoice.", { id: z.string() }, (a) => client.invoices.void(a.id));

  /* ---- pixel ownership transfer (agency → client's own account) ---- */
  tool('initiate_pixel_transfer', "Transfer a pixel (and its pixel-scoped audiences) to a client's own Adviverse account by email. The recipient accepts while logged into their account; current audience membership carries over, historical ClickHouse data stays with you.", { pixelId: z.string(), email: z.string() }, (a) => client.transfers.initiate(a.pixelId, a.email));
  tool('list_pixel_transfers', "List pixel-ownership transfers you've initiated (with status pending|accepted|cancelled|expired).", {}, () => client.transfers.list());
  tool('cancel_pixel_transfer', "Cancel a pending pixel transfer by id.", { id: z.string() }, (a) => client.transfers.cancel(a.id));
  tool('accept_pixel_transfer', "Accept an incoming pixel transfer by token — the pixel + its audiences move to YOUR account.", { token: z.string() }, (a) => client.transfers.accept(a.token));

  /* ---- consent (publisher privacy config) ---- */
  tool('get_consent_config', "Get the publisher's consent configuration (CMP framework + default behavior).", {}, () => client.consent.getConfig());
  tool(
    'save_consent_config',
    'Save the publisher consent config. mode: tcf_v2|gpp|custom; defaultConsent: opt-in (true) or opt-out (false). consentSource selects how the bridge reads the ads decision (tcf|gpp|cookie|global) — point it at ANY CMP. The remaining flags are honored client-side by the generated snippet.',
    {
      mode: z.enum(['tcf_v2', 'gpp', 'custom']),
      defaultConsent: z.boolean(),
      honorGpc: z.boolean().optional().describe('Honor the GPC browser flag as an explicit opt-out.'),
      collectTcf: z.boolean().optional().describe('Snippet reads & forwards the IAB TCF v2 string.'),
      collectGpp: z.boolean().optional().describe('Snippet reads & forwards the IAB GPP string.'),
      collectGpc: z.boolean().optional().describe('Snippet reads the GPC browser flag.'),
      resendOnChange: z.boolean().optional().describe('Re-send when the user changes consent.'),
      consentSource: z.enum(['tcf', 'gpp', 'cookie', 'global']).optional().describe('How the bridge reads the ads decision. tcf/gpp = IAB APIs; cookie/global = your CMP value.'),
      consentKey: z.string().optional().describe('Cookie name (source=cookie) or JS global path (source=global).'),
      consentGrantValue: z.string().optional().describe('The value that means "ads allowed" for cookie/global sources (default "true").'),
      tcfPurpose: z.number().optional().describe('TCF purpose required for ads (default 1 = storage).'),
      tcfVendorId: z.number().optional().describe('Our IAB vendor id to require in the TCF string (optional).'),
    },
    (a) => client.consent.saveConfig(a),
  );
  tool('list_consent_log', "List the publisher's recent recorded consent signals.", {}, () => client.consent.log());

  /* ---- public seller listing (sellers.json opt-in) ---- */
  tool('get_seller_listing', "Get this publisher's public sellers.json listing preference (confidential by default).", {}, () => client.consent.getSellerListing());
  tool(
    'save_seller_listing',
    'Opt into (or out of) a public sellers.json listing. sellerPublic:true lists your account name/domain publicly; false keeps it confidential (name/domain withheld). sellerDomain is an optional declared hostname.',
    { sellerPublic: z.boolean(), sellerDomain: z.string().optional().describe('Declared seller domain (hostname-ish; scheme/path stripped).') },
    (a) => client.consent.saveSellerListing(a),
  );

  /* ---- terminal ad integrity (publisher) ---- */
  tool(
    'terminal_integrity',
    "Detect terminal ad circumvention: machines running your tag that ALSO run a foreign tag (competing daemon), and — with `client` — installs reporting that client id but serving a tag you don't own (tag swap).",
    { client: z.string().optional(), days: z.number().optional() },
    (a) => client.integrity.report({ client: a.client, days: a.days }),
  );
  tool(
    'terminal_liveness',
    "Per-install liveness of the terminal ad daemon: which installs are alive & serving, alive but switched OFF, or gone silent (alive = pinged within ~95 min). Pass `client` to scope to your branded installs (e.g. a host app).",
    { client: z.string().optional(), days: z.number().optional() },
    (a) => client.integrity.liveness({ client: a.client, days: a.days }),
  );

  /* ---- campaigns: targeting / brand-safety / bids / conversion config ---- */
  tool('get_campaign_targeting', "Get a campaign's resolved targeting configuration.", { id: z.string() }, (a) => client.campaigns.targeting(a.id));
  tool('set_campaign_brand_safety', 'Set brand-safety rules for a campaign. fields: { categories?, keywords?, domains?, sensitivity?, options? }.', { id: z.string(), fields }, (a) => client.campaigns.setBrandSafety(a.id, a.fields as BrandSafetyConfig));
  tool('bid_recommendation', 'Recommended bid range for a format (optionally scoped to a geo), from recent clearing prices.', { format: z.string(), geo: z.string().optional() }, (a) => client.campaigns.bidRecommendation({ format: a.format, geo: a.geo }));
  tool('reach_estimate', 'Estimate reach for a targeting spec. fields = the targeting body.', { fields }, (a) => client.campaigns.reachEstimate(a.fields));
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

  /* ---- properties: extra ---- */
  tool('property_domain_connect', 'Initiate DomainConnect DNS automation for a property.', { id: z.string() }, (a) => client.properties.domainConnect(a.id));
  tool('delete_property', 'Delete a publisher property.', { id: z.string() }, (a) => client.properties.delete(a.id));
  tool('property_mfa_score', "A property's Made-For-Advertising quality score + guidance.", { id: z.string() }, (a) => client.properties.mfa(a.id));

  /* ---- placements: update ---- */
  tool('update_placement', 'Update a placement (partial fields: floorCpm, floorSoft, revShare, status, houseShare, …). Set floorAuto:true to let the yield optimizer manage floorCpm + floorSoft automatically from recent clearing prices (floorAuto:false = full manual control).', { id: z.string(), fields }, (a) => client.placements.update(a.id, a.fields as UpdatePlacementRequest));

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
  tool('track_conversion', 'Record a conversion by click id (S2S postback). fields: { clickId|click_id, value?, postbackId? }.', { fields }, (a) => client.track.conversion(a.fields as Parameters<typeof client.track.conversion>[0]));
  tool('track_event', 'Ingest a pixel event server-side (same payload pixel.js sends). fields = event object.', { fields }, (a) => client.track.event(a.fields as Record<string, unknown>));

  /* ---- billing & invoices ---- */
  tool('list_invoices', 'List invoices (advertiser sees own; admin can pass accountId).', { accountId: z.string().optional() }, (a) => client.billing.invoices({ accountId: a.accountId }));
  tool('get_invoice', 'Get one invoice by id.', { id: z.string() }, (a) => client.billing.invoice(a.id));
  tool('get_statement', 'Account financial statement (opening/charges/payments/closing).', { from: z.string().optional(), to: z.string().optional(), accountId: z.string().optional() }, (a) => client.billing.statement(a));
  tool('render_invoice', 'Rendered HTML of an invoice.', { id: z.string() }, (a) => client.billing.renderInvoice(a.id));
  tool('generate_invoice', 'Generate a draft invoice for an account+period (admin).', { accountId: z.string(), periodStart: z.string(), periodEnd: z.string() }, (a) => client.billing.generateInvoice(a));
  tool('issue_invoice', 'Issue a draft invoice (admin).', { id: z.string() }, (a) => client.billing.issueInvoice(a.id));
  tool('pay_invoice', 'Pay an invoice (advertiser own; admin any).', { id: z.string() }, (a) => client.billing.payInvoice(a.id));
  tool('void_invoice', 'Void an invoice (admin).', { id: z.string() }, (a) => client.billing.voidInvoice(a.id));

  /* ---- finance writes (funding) ---- */
  tool('deposit_funds', "Request a deposit / account top-up. fields: { amount, provider?: stripe|card|paypal|crypto|wire|paxum|mock, currency? }. card=Stripe card checkout; wire/paxum are instruction-based — the response carries where to send funds + a reference, and the balance is credited once receipt is confirmed. Accounts on a tenant network transact in that tenant's own platform token: currency is the token code and amount is denominated in it.", { fields }, (a) => client.finance.deposit(a.fields as DepositRequest));
  tool('list_deposits', 'List deposit history.', {}, () => client.finance.deposits());
  tool('request_payout', 'Request a publisher payout. fields: { amount, method: crypto|paxum|wire, destination? }. crypto→OxaPay, paxum→Paxum wallet email (destination.email), wire→bank transfer (destination bank fields; settled once ops confirms it was sent).', { fields }, (a) => client.finance.requestPayout(a.fields as PayoutRequest));
  tool('list_payouts', 'List payout history.', {}, () => client.finance.payouts());
  tool('get_tax_form', 'Get the saved payout tax form (W-9 / W-8BEN).', {}, () => client.finance.taxForm());
  tool('list_currencies', 'List all registered platform tokens / currencies and their USD rates. Feed-backed tokens also show their live price-feed URL (rate_url), the JSON dot-path (rate_json_path), and last_rate_at (when the feed last synced usd_micro).', {}, () => client.currencies.list());
  tool('register_currency', "Register or update YOUR tenant's own token and its USD rate. Provide EITHER a static `usdMicro` (micro-USD per unit, 1_000_000 = $1.00) OR a live `rateUrl` — a price API returning the token's USD price, polled to keep the rate current — with an optional `rateJsonPath` dot-path to the numeric price in the response (e.g. 'price' or 'data.usd'; empty = the body is the bare number or a { price: ... }). A code owned by another account cannot be overwritten.", { code: z.string(), name: z.string(), usdMicro: z.number().optional(), rateUrl: z.string().optional(), rateJsonPath: z.string().optional() }, (a) => client.currencies.register({ code: a.code, name: a.name, usdMicro: a.usdMicro, rateUrl: a.rateUrl, rateJsonPath: a.rateJsonPath }));
  /* ---- first-party DOOH (digital-out-of-home) screen network ---- */
  tool('list_dooh_screens', "List the account's DOOH screens (physical screens running the Adviverse player), each with venue, resolution, loop length, status, and a live `online` flag derived from the screen's heartbeat.", {}, () => client.dooh.listScreens());
  tool('dooh_proof_of_play_report', 'Proof-of-play report over a date range (default last 30 days). scope="advertiser" verifies YOUR ads actually ran on real screens (what creative/campaign played, on which screen/venue, when, duration, completed, spend, screenshots if present); scope="publisher" is your screen-fleet earnings. Returns { summary, rows }.', { scope: z.enum(['advertiser', 'publisher']).optional(), from: z.string().optional(), to: z.string().optional() }, (a) => (a.scope === 'publisher' ? client.dooh.plays({ from: a.from, to: a.to }) : client.dooh.advertiserPlays({ from: a.from, to: a.to })));
  /* ---- metaverse ad network: worlds + ad surfaces + proof-of-view ---- */
  tool('create_metaverse_world', "Onboard a metaverse world integration. Returns a signing_secret ONCE — the world's server signs proofs of view with it (attestation). fields: { name, networkId? (the tenant network these surfaces belong to) }.", { fields }, (a) => client.metaverse.createWorld(a.fields as CreateWorldRequest));
  tool('list_metaverse_surfaces', "List the account's metaverse ad surfaces (screens/posters/portals placed in shops), each with venue, status, and a live `online` flag.", {}, () => client.metaverse.listSurfaces());
  tool('metaverse_proof_of_view_report', 'Proof-of-view report over a date range (default last 30 days). scope="advertiser" verifies YOUR ads were actually seen by real avatars (dwell, distance, portal completions, spend); scope="publisher" is your surface earnings. Returns { summary, rows }.', { scope: z.enum(['advertiser', 'publisher']).optional(), from: z.string().optional(), to: z.string().optional() }, (a) => (a.scope === 'publisher' ? client.metaverse.views({ from: a.from, to: a.to }) : client.metaverse.advertiserViews({ from: a.from, to: a.to })));
  tool('metaverse_trust_scores', "ADMIN: the automatic world TRUST-SCORING snapshot. Each world's last-7-day proof-of-view traffic is scored 0..1 (attested-identity rate, IVT valid rate, unique-user ratio, dwell plausibility); clean high-volume worlds are auto-promoted from CPA-only ('unverified') to CPM ('trusted'), degraded ones demoted. Returns per-world { current_tier, auto_tier, score, views_7d, valid_rate, attested_rate, unique_user_ratio, dwell_cv, factors }.", {}, () => client.metaverse.adminTrustScores());
  /* ---- portal experience template builder (prebuilt HTML5 portals) ---- */
  tool('list_portal_templates', "List the prebuilt HTML5 portal experience templates an advertiser can configure WITHOUT authoring a bundle (e.g. product-showcase, spin-to-win, 360-viewer). Each returns { key, name, description, fields:[{ key, label, type, required? }] } — the `fields` define that template's config shape.", {}, () => client.portalTemplates.listTemplates());
  tool('create_portal_experience', "Create a configured portal experience from a template. fields: { template (a key from list_portal_templates), config (the template's fields, e.g. { title, productImage, ctaUrl, bgColor }) }. Returns { id, url } — the hosted template URL. Pass that url as an `html5` creative's assetUrl (via create_creative) and the config's ctaUrl as landingUrl to make a normal creative attachable to a metaverse PORTAL surface campaign.", { fields }, (a) => client.portalTemplates.createConfig(a.fields as CreatePortalConfigRequest));
  /* ---- rewarded-crypto experiences (metaverse portal completions) ---- */
  tool('fund_reward_pool', "Fund (or top up) a metaverse portal/experience campaign's REWARD POOL. Each VERIFIED completion pays the end-user a crypto reward — TENANT-CUSTODIED (Adviverse escrows your money + emits a signed payout webhook; the metaverse operator fulfils the on-chain payout in its own coin). fields (camelCase): { campaignId, perCompletion (fixed reward per completion), amount (escrowed now from your balance), token? (reward denomination; defaults to your account currency), perUserDailyCap?, perWalletDailyCap? }. Escrow reduces your available balance; insufficient funds is refused.", { fields }, (a) => client.rewards.fundPool(a.fields as FundPoolRequest));
  tool('create_onchain_reward_pool', "Create an ADVERTISER-CUSTODIED, on-chain-in-the-creative reward pool. Your OWN dApp/contract inside the portal experience pays the end-user on-chain in a coin YOU choose (BTC/ETH/USDC/…); Adviverse never touches the crypto — it only verifies each completion (attested real user + per-user/per-wallet daily caps + no replay) and hands the creative a single-use signed ELIGIBILITY VOUCHER your contract verifies before paying. NO escrow / no funding. fields (camelCase): { campaignId, perCompletion (display amount; real amount enforced by your contract), token (coin symbol), chain? (e.g. bitcoin/ethereum/base), perUserDailyCap?, perWalletDailyCap? }. Returns the pool plus a one-time `voucher_secret` — embed it in your contract/backend to verify vouchers.", { fields }, (a) => client.rewards.createOnchainPool(a.fields as CreateOnchainPoolRequest));
  tool('reward_voucher_secret', "Fetch a campaign's on-chain reward VOUCHER SECRET (the HMAC key your contract/backend uses to verify the eligibility voucher Adviverse issues on each verified completion). Applies to on-chain reward pools only. fields: { campaignId }.", { campaignId: z.string() }, (a) => client.rewards.voucherSecret(a.campaignId));
  tool('reward_report', 'Reward-payout report over a date range (default last 30 days): completions, amount paid, distinct recipients, sent/pending/failed webhook counts (tenant-custodied) + attributed/tx-confirmed on-chain counts (advertiser-custodied), a per-campaign breakdown, your pools (funded/spent/mode), and per-payout rows (incl. tx_hash for on-chain payouts).', { from: z.string().optional(), to: z.string().optional() }, (a) => client.rewards.report({ from: a.from, to: a.to }));

  tool('submit_tax_form', 'Submit/update the payout tax form. fields: { formType: w9|w8ben, legalName, taxId, address, country, certified, taxClassification? }.', { fields }, (a) => client.finance.submitTaxForm(a.fields as TaxFormRequest));

  /* ---- exports ---- */
  tool('run_export', 'Export analytics to a warehouse format. fields: { dataset: events|conversions|spend, from, to, format?: ndjson|csv }.', { fields }, (a) => client.exports.run(a.fields as RunExportRequest));
  tool('list_exports', 'List export jobs.', {}, () => client.exports.list());

  /* ---- verification / brand-safety vendor ---- */
  tool('list_verification_categories', 'List the brand-safety category catalog.', {}, () => client.verification.categories());
  tool('get_verification_settings', 'Get measurement/brand-safety vendor settings.', {}, () => client.verification.settings());
  tool('save_verification_settings', 'Configure the measurement vendor. fields: { vendor?: none|ias|doubleverify|moat, measurementEnabled?, viewabilityTarget?(0-1), brandSafetyCategories?, blockedDomains?, blockedKeywords?, apiKey? }. brandSafetyCategories + blockedDomains + blockedKeywords are enforced rule-based at serve time by the ad-engine; blocked categories are auto-expanded into common keyword synonyms server-side.', { fields }, (a) => client.verification.saveSettings(a.fields as VerificationSettings));

  /* ---- automation & alerts ---- */
  tool('list_automation_rules', 'List automation rules.', {}, () => client.automation.rules());
  tool('create_automation_rule', 'Create an automation rule. fields: { name?, scope?: campaign|all, targetId?, metric?: cpa|ctr|spend|conversions|fill_rate, operator?: gt|lt, threshold?, windowHours?, action?: pause|resume|notify|adjust_bid, actionValue?, enabled? }.', { fields }, (a) => client.automation.createRule(a.fields as CreateAutomationRuleRequest));
  tool('delete_automation_rule', 'Delete an automation rule.', { id: z.string() }, (a) => client.automation.deleteRule(a.id));
  tool('set_automation_rule_enabled', 'Enable or disable an automation rule (pause it without deleting).', { id: z.string(), enabled: z.boolean() }, (a) => client.automation.setRuleEnabled(a.id, a.enabled));
  tool('optimizer_log', 'Recent automated budget-reallocation actions.', { limit: z.number().optional() }, (a) => client.automation.optimizerLog(a.limit));
  tool('list_alerts', 'List anomaly/optimizer alerts.', {}, () => client.automation.alerts());
  tool('ack_alert', 'Acknowledge (mark read) an alert.', { id: z.string() }, (a) => client.automation.ackAlert(a.id));

  /* ---- identity resolution ---- */
  tool('identity_resolve', 'Resolve a canonical identity from signals. fields: { email?, phone?, cookieId?, deviceId? }.', { fields }, (a) => client.identity.resolve(a.fields as Parameters<typeof client.identity.resolve>[0]));
  tool('identity_link', 'Link signals to a canonical id. fields: { canonicalId, signals: [{type,value}] }.', { fields }, (a) => client.identity.link(a.fields as Parameters<typeof client.identity.link>[0]));
  tool('identity_consent', 'Set consent for a canonical id. fields: { canonicalId, state: granted|denied }.', { fields }, (a) => client.identity.setConsent(a.fields as Parameters<typeof client.identity.setConsent>[0]));
  tool('identity_stats', 'Identity graph stats.', {}, () => client.identity.stats());
  tool('get_identity', 'Get an identity record by canonical id.', { canonicalId: z.string() }, (a) => client.identity.get(a.canonicalId));

  /* ---- publisher apps (mobile / CTV) ---- */
  tool('list_apps', 'List publisher mobile/CTV apps.', {}, () => client.apps.list());
  tool('get_app', 'Get one app by id.', { id: z.string() }, (a) => client.apps.get(a.id));
  tool('create_app', 'Register a mobile/CTV app. fields: { kind: mobile_app|ctv, name, bundleId, platform, storeUrl?, appStoreId?, category?, ctvMeta? }.', { fields }, (a) => client.apps.create(a.fields as CreateAppRequest));
  tool('update_app', 'Update an app. fields: { appAdsTxt?, skadnetworkIds?, ctvMeta?, storeUrl?, platform? }.', { id: z.string(), fields }, (a) => client.apps.update(a.id, a.fields as Record<string, unknown>));
  tool('get_app_ads_txt', "An app's generated app-ads.txt content.", { id: z.string() }, (a) => client.apps.appAdsTxt(a.id));

  /* ---- reporting: advanced ---- */
  tool('report_ivt', 'Invalid-traffic breakdown.', reportQuery, (a) => client.reporting.ivt(a as ReportQuery));
  tool('report_reach', 'Reach & frequency (unique users): total reach, average frequency, a frequency-distribution histogram (impressions per user), and daily unique reach.', reportQuery, (a) => client.reporting.reach(a as ReportQuery));
  tool('report_breakdown', "Impressions/clicks/CTR/revenue/eCPM broken down by a dimension the hourly rollup drops: bdim = 'os' | 'browser' | 'deal' (PMP) | 'page' (site, by host) | 'page_url' (individual page, host+path — earnings per page) | 'app' (in-app/in-game app id — earnings per app) | 'property' (owning property) | 'region' | 'make'/'model' (device) | 'sub1'..'sub5' (affiliate sub-ids). revenue is publisher earnings or advertiser spend depending on the account. Defaults to os.", { ...reportQuery, bdim: z.enum(['os', 'browser', 'deal', 'page', 'page_url', 'app', 'property', 'region', 'make', 'model', 'sub1', 'sub2', 'sub3', 'sub4', 'sub5']).optional().describe('os | browser | deal | page | page_url | app | property') }, (a) => client.reporting.breakdown(a as ReportQuery & { bdim?: 'os' | 'browser' | 'deal' | 'page' | 'page_url' | 'app' | 'property' | 'region' | 'make' | 'model' | 'sub1' | 'sub2' | 'sub3' | 'sub4' | 'sub5' }));
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

  /* ---- webhooks ---- */
  tool('list_webhooks', 'List webhook subscriptions.', {}, () => client.webhooks.list());
  tool('list_webhook_events', 'List available webhook event types.', {}, () => client.webhooks.events());
  tool('create_webhook', 'Subscribe to webhook events. fields: { url (https), events: [...] }.', { fields }, (a) => client.webhooks.create(a.fields as CreateWebhookRequest));
  tool('delete_webhook', 'Delete a webhook subscription.', { id: z.string() }, (a) => client.webhooks.delete(a.id));

  /* ---- API keys ---- */
  tool('list_api_keys', 'List API keys.', {}, () => client.keys.list());
  tool('create_api_key', 'Create an API key (returned once). fields: { name?, scopes?: [read|write|admin] }.', { fields }, (a) => client.keys.create(a.fields as CreateApiKeyRequest));
  tool('delete_api_key', 'Revoke an API key.', { id: z.string() }, (a) => client.keys.delete(a.id));

  /* ---- account lifecycle: KYC / onboarding / connections / referrals ---- */
  tool('get_kyc', 'KYC verification status for the account.', {}, () => client.account.kyc());
  tool('start_kyc', 'Start hosted identity verification → returns a URL to visit.', {}, () => client.account.startKyc());
  tool('get_onboarding', 'Onboarding progress/state.', {}, () => client.account.onboarding());
  tool('save_onboarding_profile', 'Save the onboarding profile. fields: { goal?, name?, company?, country?, currency?, timezone?, marketingOptIn? }.', { fields }, (a) => client.account.saveOnboardingProfile(a.fields as OnboardingProfile));
  tool('list_connections', 'List linked social-login providers.', {}, () => client.auth.connections());
  tool('disconnect_provider', 'Disconnect a linked social-login provider.', { provider: z.string() }, (a) => client.auth.disconnect(a.provider));
  tool('set_password', 'Set or change the account password. Omit currentPassword when the account is SSO-only (setting a password for the first time so email+password login also works); required when changing an existing password.', { newPassword: z.string(), currentPassword: z.string().optional() }, (a) => client.auth.setPassword(a.newPassword, a.currentPassword));
  tool('list_referrals', 'Referral program overview.', {}, () => client.referrals.list());

  /* ---- regions (public discovery) ---- */
  tool('list_regions', 'List active edge regions.', {}, () => client.regions.list());
  tool('nearest_region', 'Resolve the nearest region for a country/geo.', { country: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() }, (a) => client.regions.nearest(a));
  tool('regions_health', 'Per-region engine health.', {}, () => client.regions.health());

  /* ---- privacy ---- */
  tool('submit_dsar', 'Submit a data-subject access (access) or deletion (delete) request.', { kind: z.enum(['access', 'delete']), email: z.string() }, (a) => client.privacy.submitDsar(a));

  /* ---- admin (requires admin role / admin-scoped key) ---- */
  tool('admin_list_accounts', 'List accounts (searchable).', { q: z.string().optional() }, (a) => client.admin.accounts({ q: a.q }));
  tool('admin_set_account_status', 'Set an account status (active|pending|suspended|banned|closed).', { id: z.string(), status: z.enum(['active', 'pending', 'suspended', 'banned', 'closed']) }, (a) => client.admin.setAccountStatus(a.id, a.status));
  tool('admin_moderation_queue', 'List moderation queue items.', { type: z.string().optional() }, (a) => client.admin.moderation({ type: a.type }));
  tool('admin_decide_moderation', 'Approve/reject a moderation item.', { id: z.string(), decision: z.enum(['approved', 'rejected']), notes: z.string().optional() }, (a) => client.admin.decideModeration(a.id, a.decision, a.notes));
  tool('admin_rescan_creative', 'Re-scan a creative for cloaking + screenshot.', { creativeId: z.string() }, (a) => client.admin.rescanCreative(a.creativeId));
  tool('admin_blocklist', 'List fraud block-list entries.', {}, () => client.admin.blocklist());
  tool('admin_add_blocklist', 'Add a block-list entry. kind: ip|domain|asn|device|user_agent|country|subnet.', { kind: z.enum(['ip', 'domain', 'asn', 'device', 'user_agent', 'country', 'subnet']), value: z.string(), reason: z.string().optional() }, (a) => client.admin.addBlocklist(a));
  tool('admin_fraud_quality', 'Quality scores across placements (IVT/fill).', {}, () => client.admin.fraudQuality());
  tool('admin_payouts', 'List pending payouts.', {}, () => client.admin.payouts());
  tool('admin_process_payout', 'Process a payout request.', { id: z.string() }, (a) => client.admin.processPayout(a.id));
  tool('admin_get_config', 'Get platform config / feature flags.', {}, () => client.admin.getConfig());
  tool('admin_set_config', 'Set a platform config value.', { key: z.string(), value: z.any().optional() }, (a) => client.admin.setConfig(a.key, a.value));
  tool('admin_audit_log', 'Recent admin audit-log entries.', {}, () => client.admin.audit());
  tool('admin_mfa_ranking', 'Properties ranked by Made-For-Advertising risk.', { limit: z.number().optional() }, (a) => client.admin.mfaRanking(a.limit));
  tool('admin_create_region', 'Create an edge region. fields: { code, name, public_endpoint, lat, lng, country_codes?, status?, priority? }.', { fields }, (a) => client.admin.createRegion(a.fields as Parameters<typeof client.admin.createRegion>[0]));
  tool('admin_update_region', 'Update an edge region. fields: { status?, public_endpoint?, priority?, country_codes?, name? }.', { id: z.string(), fields }, (a) => client.admin.updateRegion(a.id, a.fields as Record<string, unknown>));
  tool('admin_list_dsar', 'List data-subject requests.', {}, () => client.admin.dsarList());
  tool('admin_complete_dsar', 'Mark a DSAR complete.', { id: z.string() }, (a) => client.admin.completeDsar(a.id));

  /* ---- docs CMS (guides) ---- */
  tool('list_guides', 'List published docs/guides (optionally by category).', { locale: z.string().optional(), category: z.string().optional() }, (a) => client.guides.list(a));
  tool('get_guide', 'Get one published guide by slug (markdown body).', { slug: z.string(), locale: z.string().optional() }, (a) => client.guides.get(a.slug, a.locale));
  tool('admin_list_guides', 'List all guides incl. drafts (admin).', { locale: z.string().optional() }, (a) => client.guides.adminList(a.locale));
  tool('admin_create_guide', 'Create/upsert a guide (admin). fields: { slug, title, category?, summary?, body (markdown), position?, published?, locale? }.', { fields }, (a) => client.guides.create(a.fields as Parameters<typeof client.guides.create>[0]));
  tool('admin_update_guide', 'Update a guide (admin). fields: any of { slug, title, category, summary, body, position, published }.', { id: z.string(), fields }, (a) => client.guides.update(a.id, a.fields as UpsertGuideRequest));
  tool('admin_delete_guide', 'Delete a guide (admin).', { id: z.string() }, (a) => client.guides.delete(a.id));

  /* ---- blog ---- */
  tool('list_posts', 'List published blog posts (optionally by tag), newest first.', { locale: z.string().optional(), tag: z.string().optional() }, (a) => client.blog.list(a));
  tool('get_post', 'Get one published blog post by slug (markdown body).', { slug: z.string(), locale: z.string().optional() }, (a) => client.blog.get(a.slug, a.locale));
  tool('admin_list_posts', 'List all blog posts incl. drafts (admin).', { locale: z.string().optional() }, (a) => client.blog.adminList(a.locale));
  tool('admin_create_post', 'Create/upsert a blog post (admin). fields: { slug, title, tag?, author?, excerpt?, body (markdown), cover_image?, published_at?, position?, published?, locale? }.', { fields }, (a) => client.blog.create(a.fields as Parameters<typeof client.blog.create>[0]));
  tool('admin_update_post', 'Update a blog post (admin). fields: any of { slug, title, tag, author, excerpt, body, cover_image, published_at, position, published }.', { id: z.string(), fields }, (a) => client.blog.update(a.id, a.fields as UpsertPostRequest));
  tool('admin_delete_post', 'Delete a blog post (admin).', { id: z.string() }, (a) => client.blog.delete(a.id));

  return server;
}
