import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { Tool } from './shared.js';

/** Web push notifications (subscriber-based push). */
export function registerPushTools(tool: Tool, client: AdNetClient) {
  tool('get_push_placement', 'For a push placement you own (format "push"): the service-worker file to host at your site root as /adviverse-sw.js, the subscribe snippet (adviverse.push.subscribe), whether web push is configured, and active subscriber counts (total, new in 7 days, sent today, by country and device).', { placementId: z.string() }, (a) => client.push.placement(a.placementId));
  tool('push_subscribe', 'Register a browser PushSubscription (PushSubscription.toJSON(): endpoint + keys.p256dh + keys.auth) for a push placement tag. Deduped by endpoint. Normally the service worker does this itself.', { tag: z.string(), endpoint: z.string(), p256dh: z.string(), auth: z.string() }, (a) => client.push.subscribe(a.tag, { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }));
  tool('push_unsubscribe', 'Mark a web push subscription unsubscribed by its endpoint URL.', { endpoint: z.string() }, (a) => client.push.unsubscribe(a.endpoint));
}
