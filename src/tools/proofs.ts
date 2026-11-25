import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { Tool } from './shared.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('UTC day, YYYY-MM-DD.');
const record = z.object({
  kid: z.string(), request_id: z.string(), campaign_id: z.string(), creative_id: z.string(), placement_id: z.string(),
  ts_ms: z.number().int(), price_micros: z.number().int(), currency: z.string(), ivt: z.string(),
});

/** Signed impression proofs (docs/proofs.md). */
export function registerProofsTools(tool: Tool, client: AdNetClient) {
  tool('get_proof_public_key', 'Ed25519 public keys (JWKS-style) that sign billed impressions and daily Merkle roots. enabled=false means signing is off.', {}, () => client.proofs.publicKey());
  tool('list_proof_roots', 'Your signed daily Merkle roots (one per closed UTC day with billed impressions), newest first.', { from: day.optional(), until: day.optional() },
    (a) => client.proofs.roots({ from: a.from, until: a.until }));
  tool('get_proof_bundle', "Download one day's proof bundle as NDJSON (root line, one signed record per billed impression, all leaf hashes). Verify offline with scripts/verify-impression-proofs.mjs.", { day, campaignId: z.string().optional() },
    (a) => client.proofs.bundle(a.day, a.campaignId));
  tool('verify_impression_proof', 'Verify a signed impression record + signature and/or a signed daily root against the network keys.', {
    record: record.optional(), signature: z.string().optional(),
    root: z.object({ advertiserId: z.string(), day: z.string(), recordCount: z.number().int(), merkleRoot: z.string(), kid: z.string(), signature: z.string(), createdAt: z.string().optional() }).optional(),
  }, (a) => client.proofs.verify({ record: a.record, signature: a.signature, root: a.root }));
}
