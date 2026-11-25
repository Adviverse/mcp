import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';

type Tool = <S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>,
) => void;

const strList = z.array(z.string()).optional();
const status = z.enum(['pending', 'active', 'paused', 'rejected']);

/** DSP partner (RTB demand) tools: public apply + admin management (server.ts is at the length cap). */
export function registerDspTools(tool: Tool, client: AdNetClient) {
  tool('dsp_apply', 'Apply as a DSP partner to bid on Adviverse supply over OpenRTB 2.6 (public, created as pending until an admin approves). endpointUrl must be an https bid endpoint on a public host. formats e.g. banner/video/native, geos ISO-2; empty = all.', {
    name: z.string(), contactEmail: z.string(), endpointUrl: z.string(), company: z.string().optional(),
    formats: strList, geos: strList, qpsLimit: z.number().int().optional(), notes: z.string().optional(),
  }, (a) => client.dspPartners.apply(a));
  tool('admin_list_dsp_partners', 'ADMIN: every DSP partner (all statuses) with stats over the last `days` (default 7): bid requests sent, bids, SSP auction wins, spend (USD clearing value of won bids). Secrets are never returned (has_auth_secret only).', { days: z.number().int().optional() }, (a) => client.dspPartners.list(a));
  tool('admin_create_dsp_partner', 'ADMIN: create a DSP partner. fields: { name, contactEmail, endpointUrl (https), company?, status? (default pending), timeoutMs? (10-1000), qpsLimit? (0 = unlimited), formats?, geos?, authHeader?, authSecret? (stored encrypted), notes? }.', { fields: z.object({ name: z.string(), contactEmail: z.string(), endpointUrl: z.string() }).passthrough() }, (a) => client.dspPartners.create(a.fields as Parameters<typeof client.dspPartners.create>[0]));
  tool('admin_update_dsp_partner', "ADMIN: update a DSP partner. Approve with status 'active'; pause with 'paused'. fields: any of { name, company, contactEmail, endpointUrl, status, timeoutMs, qpsLimit, formats, geos, authHeader, authSecret ('' clears), notes }.", {
    id: z.string(), fields: z.object({ status: status.optional() }).passthrough(),
  }, (a) => client.dspPartners.update(a.id, a.fields as Parameters<typeof client.dspPartners.update>[1]));
  tool('admin_delete_dsp_partner', 'ADMIN: delete a DSP partner (stops bid requests to it).', { id: z.string() }, (a) => client.dspPartners.delete(a.id));
  tool('admin_dsp_partner_stats', 'ADMIN: per-UTC-day bid requests, bids, wins and spend for one DSP partner over the last `days` (default 7, max 40).', { id: z.string(), days: z.number().int().optional() }, (a) => client.dspPartners.stats(a.id, { days: a.days }));
}
