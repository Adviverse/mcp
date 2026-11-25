import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { CreateWebhookRequest, CreateApiKeyRequest, UpsertGuideRequest, UpsertPostRequest } from '@adviverse/sdk';
import { type Tool, fields } from './shared.js';

/** platform tools (createServer registers each domain file). */
export function registerPlatformCoreTools(tool: Tool, client: AdNetClient) {
  /* ---- webhooks ---- */
  tool('list_webhooks', 'List webhook subscriptions (secrets omitted: has_secret + secret_hint only).', {}, () => client.webhooks.list());
  tool('reveal_webhook_secret', 'Return a webhook endpoint\'s HMAC signing secret (whsec_...).', { id: z.string() }, (a) => client.webhooks.revealSecret(a.id));
  tool('list_webhook_events', 'List available webhook event types.', {}, () => client.webhooks.events());
  tool('create_webhook', 'Subscribe to webhook events. fields: { url (https), events: [...] }.', { fields }, (a) => client.webhooks.create(a.fields as CreateWebhookRequest));
  tool('delete_webhook', 'Delete a webhook subscription.', { id: z.string() }, (a) => client.webhooks.delete(a.id));

  /* ---- API keys ---- */
  tool('list_api_keys', 'List API keys.', {}, () => client.keys.list());
  tool('create_api_key', 'Create an API key (returned once). fields: { name?, scopes?, expiresInDays? }. scopes: read | write | admin | <area>:<read|write> (e.g. publisher:read, finance:write) | <area>.<resource>:<read|write> (e.g. publisher.placements:write); write implies read. A key can only mint scopes it holds.', { fields }, (a) => client.keys.create(a.fields as CreateApiKeyRequest));
  tool('delete_api_key', 'Revoke an API key.', { id: z.string() }, (a) => client.keys.delete(a.id));

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
  tool('admin_trust_properties', 'Properties with trust tier, lock, detected niches and progress toward auto-promotion. q filters by domain/name.', { q: z.string().optional(), limit: z.number().optional() }, (a) => client.admin.trustProperties(a));
  tool('admin_set_property_trust', "Override a property's trust tier (trusted = full demand, unverified = CPA-only) and lock it against automatic changes.", { id: z.string(), tier: z.enum(['trusted', 'unverified']).optional(), locked: z.boolean(), note: z.string().optional() }, (a) => client.admin.setPropertyTrust(a.id, { tier: a.tier, locked: a.locked, note: a.note }));
  tool('admin_trust_events', 'Trust audit log: auto promotions/demotions, domain resets and admin overrides, with metrics.', { propertyId: z.string().optional(), limit: z.number().optional() }, (a) => client.admin.trustEvents(a));
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
}
