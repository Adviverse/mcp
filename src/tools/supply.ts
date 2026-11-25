import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { CreatePropertyRequest, CreatePlacementRequest, UpdatePlacementRequest, CreateComboRequest, TaxFormRequest, CreateAppRequest, UpdateAppRequest, CreateWorldRequest, CreatePortalConfigRequest, FundPoolRequest, CreateOnchainPoolRequest } from '@adviverse/sdk';
import { type Tool, fields, page, idem } from './shared.js';

/** supply tools (createServer registers each domain file). */
export function registerSupplyCoreTools(tool: Tool, client: AdNetClient) {
  /* ---- terminal (CLI status-line) self-network serving ---- */
  tool('serve_terminal_ad', "Fetch ONE rotated terminal (CLI status-line) ad from YOUR OWN active terminal campaigns. Auth: a public `token` (ts_…) if given, else this key. Rotation/eligibility/frequency capping applied server-side. Optional campaignId narrows to one campaign; uid is a stable per-install id. Returns { text, cta, url, impression_url, ... } or {} on no-fill.", { token: z.string().optional(), campaignId: z.string().optional(), uid: z.string().optional() }, (a) => client.terminal.serve({ token: a.token, campaignId: a.campaignId, uid: a.uid }));
  tool('create_terminal_token', "Mint a PUBLIC terminal serve token (ts_…) — a non-secret, serve-only credential SAFE to embed in a distributed CLI/desktop app. Optionally pin it to one terminal campaign, and/or arm adaptive mode-switching (`switch`) so the engine flips each install from YOUR ads to the marketplace after it engages. Returns { id, token, ... }.", { name: z.string().optional(), campaignId: z.string().optional(), switch: z.object({ flipAfter: z.number().int().min(0).optional(), flipOnClick: z.boolean().optional(), fallbackTag: z.string().optional() }).optional() }, (a) => client.terminal.createToken({ name: a.name, campaignId: a.campaignId, switch: a.switch }));
  tool('list_terminal_tokens', 'List your public terminal serve tokens (includes each token\'s switch policy).', {}, () => client.terminal.listTokens());
  tool('set_terminal_token_policy', "Arm / update / disable a terminal serve token's adaptive mode-switching policy IN PLACE (the ts_ value keeps working). `flipAfter` flips an install to the marketplace after N self-network impressions; `flipOnClick` flips once it clicks your ad; `fallbackTag` (tk_…, one of your own placements) is served post-flip (omit = flip to no ad). Needs a campaign-pinned token. Pass all-zero/empty to disable.", { id: z.string(), flipAfter: z.number().int().min(0).optional(), flipOnClick: z.boolean().optional(), fallbackTag: z.string().optional() }, (a) => client.terminal.setTokenPolicy(a.id, { flipAfter: a.flipAfter, flipOnClick: a.flipOnClick, fallbackTag: a.fallbackTag }));
  tool('rotate_terminal_token', 'Rotate a terminal serve token by id (its old value stops working immediately). Returns the new token. The switch policy is preserved.', { id: z.string() }, (a) => client.terminal.rotateToken(a.id));
  tool('revoke_terminal_token', 'Revoke (delete) a terminal serve token by id.', { id: z.string() }, (a) => client.terminal.revokeToken(a.id));

  /* ---- properties (publisher inventory) ---- */
  tool('list_properties', 'List publisher properties (sites, CLIs, apps).', page, (a) => client.properties.list(a));
  tool('get_property', 'Get one property (incl. trust_progress and the resolved consent switches contextual_without_consent / enhanced_capping).', { id: z.string() }, (a) => client.properties.get(a.id));
  tool('create_property', 'Register a property. fields: { kind: website|cli|mobile_app|ctv, domain, name?, verificationMethod? }.', { fields, idempotencyKey: idem }, (a) => client.properties.create(a.fields as CreatePropertyRequest, a.idempotencyKey));
  tool('update_property', 'Update a property. fields: { name?, domain?, category? (site-niche id from list_site_niches; manual, 0 = back to auto-detect), verificationMethod?, crossFill?, contextualWithoutConsent? (Ads before consent), enhancedCapping? (Enhanced frequency capping, outside EEA/UK only) }. Changing the domain resets verification and trust.', { id: z.string(), fields }, (a) => client.properties.update(a.id, a.fields as Parameters<typeof client.properties.update>[1]));
  tool('get_property_ads_txt', "A property's ads.txt line(s), to publish at https://<domain>/ads.txt.", { id: z.string() }, (a) => client.properties.adsTxt(a.id));
  tool('verify_property', 'Trigger ownership verification for a property. On failure returns error + message (why) and check (URL/DNS name, HTTP status, Age, cf-cache-status).', { id: z.string() }, (a) => client.properties.verify(a.id));
  tool('classify_property', "Re-detect a website property's niche from its pages; returns the top-3 niches. Updates category only if it was auto-detected.", { id: z.string() }, (a) => client.properties.classify(a.id));
  tool('list_site_niches', 'The site-niche taxonomy (IAB v1 tier-1 ids + names) used by property category and campaign targeting propertyCategoryInclude/Exclude.', {}, () => client.properties.niches());
  tool('set_serving_domain', 'Set a first-party ad-serving domain on a property (anti-adblock). The publisher CNAMEs this host to our edge; returns the CNAME target. Pass domain:null to remove.', { id: z.string(), domain: z.string().nullable() }, (a) => client.properties.setServingDomain(a.id, a.domain));
  tool('verify_serving_domain', 'Verify a property custom serving domain CNAMEs to our edge (routes traffic + proves control). On success the tag serves first-party.', { id: z.string() }, (a) => client.properties.verifyServingDomain(a.id));

  /* ---- placements ---- */
  tool('list_placements', 'List ad placements. has_signing_secret says whether signed-tag enforcement is on (the secret itself is only returned by rotate_placement_signing_secret).', page, (a) => client.placements.list(a));
  tool('create_placement', 'Create a placement. fields: { propertyId | appId (exactly one; an app id from list_apps works — a direct_link may omit both, see create_smartlink), name, format, floorCpm, trafficType? (direct_link only), … }. Apps accept banner, native, interstitial, rewarded, app_open, video, audio, carousel, pod, direct_link (no popunder/social_bar/in_page_push). Optional render: per-format skin/template/native styling/caps — see update_placement.', { fields, idempotencyKey: idem }, (a) => client.placements.create(a.fields as CreatePlacementRequest, a.idempotencyKey));
  tool('delete_placement', 'Delete a placement (its tag stops serving). Placement names are unique per property.', { id: z.string() }, (a) => client.placements.remove(a.id));
  tool('get_placement_tag', 'Get the ad tag / install code for a placement (responsive banners also return autoAdsScript, the one-line site-wide auto-ads tag; AI chat placements — native with settings.surface=ai_chat — return surface + endpoint for the @adviverse/ai SDK).', { id: z.string() }, (a) => client.placements.tag(a.id));
  tool('rotate_placement_signing_secret', 'Generate/rotate a placement signing secret (Layer 3, returned once). With a secret set, the engine only serves /terminal requests carrying a valid HMAC signature.', { id: z.string() }, (a) => client.placements.rotateSigningSecret(a.id));
  tool('disable_placement_signing', 'Disable signed-tag enforcement on a placement.', { id: z.string() }, (a) => client.placements.disableSigning(a.id));

  /* ---- combos (layout presets — provision several placements + one embed snippet) ---- */
  tool('list_combo_presets', 'List the static combo / layout presets (each bundles several ad units: standard_combo, leaderboard_pop, social_push, sticky_interstitial, full_monetization).', {}, () => client.placements.comboPresets());
  tool('create_combo', 'Provision several ad units as placements on a property at once and get ONE combined embed snippet back (paste once before </body>). propertyId may be an app id; on apps use presetKey in_app (banner + interstitial), web-only presets are refused. Provide EITHER a preset (presetKey) OR a custom set of units [{format,label?,width?,height?}]. fields: { presetKey?, units?, namePrefix?, floorCpm?, revShare?, auctionType?, passbackUrl?, houseOnly?, houseShare?, houseBackfill?, floorFallback? }.', { propertyId: z.string(), fields }, (a) => client.placements.createCombo(a.propertyId, a.fields as CreateComboRequest));

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
      contextualWithoutConsent: z.boolean().optional().describe('Ads always load: visitors who have not answered (or rejected) the CMP get contextual ads with no identifier; personalized still waits for consent.'),
      enhancedCapping: z.boolean().optional().describe('Enhanced frequency capping: outside the EEA/UK, for visitors with no opt-out signal (GPC, US-privacy opt-out), contextual frequency caps also use browser signals and an SDK canvas hash (daily-rotating, per-site, never stored on the device). Off: caps use IP + user agent only and unusual contextual traffic is not served. Declare it in your privacy policy if you turn it on.'),
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

  /* ---- properties: extra ---- */
  tool('property_domain_connect', 'Initiate DomainConnect DNS automation for a property.', { id: z.string() }, (a) => client.properties.domainConnect(a.id));
  tool('delete_property', 'Delete a publisher property.', { id: z.string() }, (a) => client.properties.delete(a.id));
  tool('property_mfa_score', "A property's Made-For-Advertising quality score + guidance.", { id: z.string() }, (a) => client.properties.mfa(a.id));

  /* ---- placements: update ---- */
  tool('update_placement', 'Update a placement (partial fields: width, height (banner size px), floorCpm, floorSoft, revShare, status, houseShare, noBackfill (true = empty slot instead of an Adviverse promo ad when nothing paid fills), frequencyCap {impressions, windowSeconds} — {} or null removes it, …). Set floorAuto:true to let the yield optimizer manage floorCpm + floorSoft automatically from recent clearing prices (floorAuto:false = full manual control). autoAds tunes auto ads on a responsive banner placement (stored at settings.auto_ads, wins over the page\'s data-max): { enabled?, max?(1-10), every?(paragraphs between ads, 2-12), min_paragraph_chars?(0-2000), exclude_paths?["/checkout*"], selectors?[css] } — null clears. render sets per-format look + client caps (merged into settings; 400 on a key the format does not take; numbers clamped): social_bar { skin: bar|in_page_push|icon_notification|custom_widget|interstitial, position: top|bottom|top-left|top-right|bottom-left|bottom-right }; in_page_push { position: corner }; interstitial { template: card|fullscreen|split, close_delay_sec 0-15 (default 5), cover 45-100 (% of screen), freq_hours 0-720, per_session }; popunder { freq_hours, per_session } (also sets frequencyCap to 1 per freq_hours unless frequencyCap is sent); native { native: { rows 1-4, cols 1-4 (grid of ads), title_color/text_color/bg_color hex, font_size 11-20, font_family inherit|system|serif, image_position top|left } }; video { skin: player|outstream (in-article outstream player), sticky (float in a corner), position: corner }; rewarded (web reward-unlock content locker) { unlock_hours 0-720 (0 = session), verify_url (https, "" clears; server-side verification — SDK POSTs {tag, request_id, reward_url}, your server calls reward_url and answers {unlocked:true, html?}) }. create_placement accepts the same render object.', { id: z.string(), fields }, (a) => client.placements.update(a.id, a.fields as UpdatePlacementRequest));

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

  /* ---- publisher apps (mobile / CTV) ---- */
  tool('list_apps', 'List publisher mobile/CTV apps.', {}, () => client.apps.list());
  tool('get_app', 'Get one app by id.', { id: z.string() }, (a) => client.apps.get(a.id));
  tool('create_app', 'Register a mobile/CTV app or browser extension. fields: { kind: mobile_app|ctv, name, bundleId (extension id for an extension), platform (ios|android|roku|firetv|appletv|androidtv|web|chrome|edge|firefox), storeUrl?, appStoreId?, category?, ctvMeta?, developerPropertyId? (your website property whose /app-ads.txt proves the app) }. Starts pending; then verify_app. Test tag tk_test fills before verification.', { fields }, (a) => client.apps.create(a.fields as CreateAppRequest));
  tool('update_app', 'Update an app. fields: { appAdsTxt?, skadnetworkIds?, ctvMeta?, storeUrl?, platform?, developerPropertyId? (website property id; null unlinks) }.', { id: z.string(), fields }, (a) => client.apps.update(a.id, a.fields as UpdateAppRequest));
  tool('delete_app', 'Delete an app (soft-deletes it and its placements).', { id: z.string() }, (a) => client.apps.delete(a.id));
  tool('verify_app', "Verify an app. developer_site (default): the linked, verified developer website must serve /app-ads.txt with 'adviverse.com, <your account id>, DIRECT' (see get_app_ads_txt). store_listing: also checks the apps.apple.com / play.google.com listing. On failure returns error + message saying what to fix.", { id: z.string(), method: z.enum(['developer_site', 'store_listing']).optional() }, (a) => client.apps.verify(a.id, a.method));
  tool('get_app_ads_txt', "An app's generated app-ads.txt content.", { id: z.string() }, (a) => client.apps.appAdsTxt(a.id));
}
