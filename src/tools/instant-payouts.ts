import { z } from 'zod';
import type { AdNetClient } from '@adviverse/sdk';
import type { Tool } from './shared.js';

/** Instant USDC payouts (publisher) + the admin overview. */
export function registerInstantPayoutTools(tool: Tool, client: AdNetClient) {
  tool('get_instant_payouts', 'Publisher: instant USDC payout status — saved wallet, auto-payout rule, whether an instant payout would pass the risk gates now (eligibility.reasons lists what blocks it), limits and recent instant/auto payouts.', {}, () => client.instantPayouts.status());
  tool(
    'save_instant_payout_settings',
    'Publisher: save the USDC payout wallet and/or the auto-payout rule. Changing the wallet pauses instant payouts for a cooldown and emails the account owner. autoThreshold (USD, >= minimum payout) is required when autoEnabled.',
    {
      address: z.string().optional().describe('USDC wallet address (0x… for BSC/Ethereum, base58 for Solana).'),
      network: z.enum(['BSC', 'Solana', 'Ethereum']).optional(),
      memo: z.string().optional(),
      autoEnabled: z.boolean().optional().describe('Pay the whole available balance automatically when it reaches autoThreshold.'),
      autoThreshold: z.number().optional(),
      autoCadence: z.enum(['daily', 'weekly']).optional(),
    },
    (a) => client.instantPayouts.saveSettings(a),
  );
  tool(
    'instant_payout',
    'Publisher: cash out the available balance in USDC to the saved wallet NOW. Real money, irreversible on-chain — confirm with the user first. mode=instant means it was sent; mode=queued means a risk gate failed and it went to the manual payout queue (reasons lists why).',
    { amount: z.number().optional().describe('USD amount, max 2 decimals. Omit for the whole available balance.') },
    (a) => client.instantPayouts.payout(a.amount),
  );
  tool('admin_instant_payouts', 'Admin: instant payout kill-switch state (env INSTANT_PAYOUTS_ENABLED), provider readiness, limits, last-24h volume and the latest instant/auto payouts.', {}, () => client.instantPayouts.adminOverview());
}
