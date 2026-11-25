import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import { type Tool } from './shared.js';

/** agency tools (createServer registers each domain file). */
export function registerAgencyCoreTools(tool: Tool, client: AdNetClient) {
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
}
