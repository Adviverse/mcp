import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { ContributeSegmentRequest } from '@adviverse/sdk';
import { type Tool, fields } from './shared.js';

/** audience tools (createServer registers each domain file). */
export function registerAudienceCoreTools(tool: Tool, client: AdNetClient) {
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

  /* ---- identity resolution ---- */
  tool('identity_resolve', 'Resolve a canonical identity from signals (shared graph; you become an owner of the signals you supply, and only your own signals are returned; unifiedId is per-advertiser, not comparable across accounts). fields: { email?, phone?, cookieId?, deviceId? }.', { fields }, (a) => client.identity.resolve(a.fields as Parameters<typeof client.identity.resolve>[0]));
  tool('identity_link', 'Link signals to a canonical id you own (404 otherwise; 409 if a signal sits on another identity and you never supplied it). fields: { canonicalId, signals: [{type,value}] }.', { fields }, (a) => client.identity.link(a.fields as Parameters<typeof client.identity.link>[0]));
  tool('identity_consent', 'Set consent for a canonical id you own (404 otherwise). fields: { canonicalId, state: granted|denied }.', { fields }, (a) => client.identity.setConsent(a.fields as Parameters<typeof client.identity.setConsent>[0]));
  tool('identity_stats', 'Identity stats for your own identities/signals (admins: graph-wide).', {}, () => client.identity.stats());
  tool('get_identity', 'Get an identity you own by canonical id, with only the signals you supplied (404 if you own none of its signals).', { canonicalId: z.string() }, (a) => client.identity.get(a.canonicalId));
}
