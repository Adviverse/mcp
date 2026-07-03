import { defineConfig } from 'tsup';

// Bundle everything (incl. the workspace @adnet/sdk and the npm deps) into a
// single standalone ESM file, so `adviverse-mcp` runs with just Node — no
// node_modules needed at the install site.
export default defineConfig({
  entry: ['src/index.ts', 'src/http.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  bundle: true,
  noExternal: [/.*/],
  splitting: false,
  clean: true,
  shims: true,
});
