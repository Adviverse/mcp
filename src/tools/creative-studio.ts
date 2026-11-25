import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { Tool } from './shared.js';

const format = z.enum(['native', 'banner', 'push', 'interstitial']);
const variant = z.object({ format, headline: z.string(), body: z.string(), cta: z.string() });

/** AI Creative Studio + creative auto-optimization (Thompson sampling) tools. */
export function registerCreativeStudioTools(tool: Tool, client: AdNetClient) {
  tool('generate_creative_copy', 'AI Creative Studio: read a landing page (title/description/og tags) and/or a brief and generate `count` (1-8) headline/body/CTA variants per format (native, banner, push = push/social bar, interstitial). Nothing is saved; pass chosen variants to save_creative_copy. 503 if the server has no AI key, 429 past the hourly limit.',
    { landingUrl: z.string().optional(), brief: z.string().optional(), formats: z.array(format).min(1), count: z.number().int().optional() },
    (a) => client.creativeStudio.generate(a));
  tool('save_creative_copy', 'Save selected AI variants as library creatives (native/banner/interstitial -> native, push -> push; normal moderation applies). Defaults: landingUrl from the generation, mainImageUrl from the page og:image. campaignId also attaches them to that ad set.',
    { generationId: z.string(), variants: z.array(variant).min(1), landingUrl: z.string().optional(), mainImageUrl: z.string().optional(), iconUrl: z.string().optional(), brandName: z.string().optional(), campaignId: z.string().optional() },
    (a) => client.creativeStudio.save(a));
  tool('creative_studio_history', 'Past AI Creative Studio generations, newest first, with variants and saved creative ids.', { limit: z.number().int().optional() },
    (a) => client.creativeStudio.history(a.limit));
  tool('get_creative_optimization', "An ad set's \"Auto-optimize creatives\" state plus each creative's 30-day impressions, clicks, CTR and impression share.", { campaignId: z.string() },
    (a) => client.creativeStudio.getOptimization(a.campaignId));
  tool('set_creative_optimization', 'Turn "Auto-optimize creatives" on/off for an ad set: when on, the ad server rotates its creatives by Thompson sampling on CTR (better CTR gets more impressions, the rest keep being explored); off = weighted rotation.', { campaignId: z.string(), enabled: z.boolean() },
    (a) => client.creativeStudio.setOptimization(a.campaignId, a.enabled));
}
