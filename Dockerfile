# The MCP server is a self-contained tsup bundle (noExternal — @adnet/sdk and
# npm deps are inlined). Build the bundle INSIDE the image from source with a
# frozen lockfile so the artifact is reproducible, instead of trusting a
# dev-machine `dist`. Build context is the repo root: `docker build -f
# packages/mcp/Dockerfile .`
FROM node:22-alpine AS build
ENV CI=true
WORKDIR /repo
RUN npm install -g pnpm@11.5.1
# Whole repo (the root .dockerignore keeps node_modules/dist/.git out), so the
# workspace + lockfile are intact for a deterministic, filtered install.
COPY . .
# Install only the @adviverse/mcp subtree (mcp + its workspace deps sdk/shared),
# pinned to the lockfile. The filter avoids pulling control-plane's argon2 etc.
RUN pnpm install --filter @adviverse/mcp... --frozen-lockfile
# Build @adviverse/sdk first (it now emits dist/); mcp's tsup bundles that dist.
RUN pnpm --filter @adviverse/sdk build
RUN pnpm --filter @adviverse/mcp build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /repo/packages/mcp/dist ./dist
ENV PORT=8787
EXPOSE 8787
CMD ["node", "dist/http.js"]
