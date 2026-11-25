import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { DepositRequest, PayoutRequest, RunExportRequest, VerificationSettings } from '@adviverse/sdk';
import { type Tool, fields } from './shared.js';

/** money tools (createServer registers each domain file). */
export function registerMoneyCoreTools(tool: Tool, client: AdNetClient) {
  /* ---- finance (read-only) ---- */
  tool('get_balance', "Get the account balance (available / held). The balance currency may be a tenant's own platform-token code (not an ISO code).", {}, () => client.finance.balance());
  tool('list_ledger', 'List ledger entries.', { limit: z.number().optional(), offset: z.number().optional() }, (a) => client.finance.ledger({ limit: a.limit, offset: a.offset }));

  /* ---- billing & invoices ---- */
  tool('list_billing_invoices', 'List platform billing invoices (advertiser sees own; admin can pass accountId).', { accountId: z.string().optional() }, (a) => client.billing.invoices({ accountId: a.accountId }));
  tool('get_billing_invoice', 'Get one platform billing invoice by id.', { id: z.string() }, (a) => client.billing.invoice(a.id));
  tool('get_statement', 'Account financial statement (opening/charges/payments/closing).', { from: z.string().optional(), to: z.string().optional(), accountId: z.string().optional() }, (a) => client.billing.statement(a));
  tool('render_invoice', 'Rendered HTML of an invoice.', { id: z.string() }, (a) => client.billing.renderInvoice(a.id));
  tool('generate_invoice', 'Generate a draft invoice for an account+period (admin).', { accountId: z.string(), periodStart: z.string(), periodEnd: z.string() }, (a) => client.billing.generateInvoice(a));
  tool('issue_invoice', 'Issue a draft invoice (admin).', { id: z.string() }, (a) => client.billing.issueInvoice(a.id));
  tool('pay_invoice', 'Pay an invoice (advertiser own; admin any).', { id: z.string() }, (a) => client.billing.payInvoice(a.id));
  tool('void_billing_invoice', 'Void a platform billing invoice (admin).', { id: z.string() }, (a) => client.billing.voidInvoice(a.id));

  /* ---- finance writes (funding) ---- */
  tool('deposit_funds', "Request a deposit / account top-up. fields: { amount, provider?: stripe|card|paypal|crypto|wire|paxum|mock, currency? }. card=Stripe card checkout; wire/paxum are instruction-based — the response carries where to send funds + a reference, and the balance is credited once receipt is confirmed. Accounts on a tenant network transact in that tenant's own platform token: currency is the token code and amount is denominated in it.", { fields }, (a) => client.finance.deposit(a.fields as DepositRequest));
  tool('list_deposits', 'List deposit history.', {}, () => client.finance.deposits());
  tool('request_payout', 'Request a publisher payout. fields: { amount, method: crypto|paxum|paypal|wire, destination? }. Use get_payment_methods for the available rails and the minimum. crypto→OxaPay, paxum/paypal→wallet email (destination.email), wire→bank transfer (destination bank fields; settled once ops confirms it was sent).', { fields }, (a) => client.finance.requestPayout(a.fields as PayoutRequest));
  tool('list_payouts', 'List payout history.', {}, () => client.finance.payouts());
  tool('get_tax_form', 'Get the saved payout tax form (W-9 / W-8BEN).', {}, () => client.finance.taxForm());
  tool('list_currencies', 'List all registered platform tokens / currencies and their USD rates. Feed-backed tokens also show their live price-feed URL (rate_url), the JSON dot-path (rate_json_path), and last_rate_at (when the feed last synced usd_micro).', {}, () => client.currencies.list());
  tool('register_currency', "Register or update YOUR tenant's own token and its USD rate. Provide EITHER a static `usdMicro` (micro-USD per unit, 1_000_000 = $1.00) OR a live `rateUrl` — a price API returning the token's USD price, polled to keep the rate current — with an optional `rateJsonPath` dot-path to the numeric price in the response (e.g. 'price' or 'data.usd'; empty = the body is the bare number or a { price: ... }). A code owned by another account cannot be overwritten.", { code: z.string(), name: z.string(), usdMicro: z.number().optional(), rateUrl: z.string().optional(), rateJsonPath: z.string().optional() }, (a) => client.currencies.register({ code: a.code, name: a.name, usdMicro: a.usdMicro, rateUrl: a.rateUrl, rateJsonPath: a.rateJsonPath }));
  /* ---- exports ---- */
  tool('run_export', 'Export analytics to a warehouse format. fields: { dataset: events|conversions|spend, from, to, format?: ndjson|csv }.', { fields }, (a) => client.exports.run(a.fields as RunExportRequest));
  tool('list_exports', 'List export jobs.', {}, () => client.exports.list());

  /* ---- verification / brand-safety vendor ---- */
  tool('list_verification_categories', 'List the brand-safety category catalog.', {}, () => client.verification.categories());
  tool('get_verification_settings', 'Get measurement/brand-safety vendor settings.', {}, () => client.verification.settings());
  tool('save_verification_settings', 'Configure the measurement vendor. fields: { vendor?: none|ias|doubleverify|moat, measurementEnabled?, viewabilityTarget?(0-1), brandSafetyCategories?, blockedDomains?, blockedKeywords?, apiKey? }. brandSafetyCategories + blockedDomains + blockedKeywords are enforced rule-based at serve time by the ad-engine; blocked categories are auto-expanded into common keyword synonyms server-side.', { fields }, (a) => client.verification.saveSettings(a.fields as VerificationSettings));
}
