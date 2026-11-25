import { z } from 'zod';

/** The tool registrar createServer() builds; every tools file registers through it. */
export type Tool = <S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>,
) => void;

export const fields = z.record(z.any());
export const page = {
  limit: z.number().optional().describe('Max rows to return (omit for all).'),
  offset: z.number().optional().describe('Rows to skip (for paging).'),
};
export const idem = z.string().optional().describe('Idempotency-Key: reuse to make a retried create safe (no duplicate).');
