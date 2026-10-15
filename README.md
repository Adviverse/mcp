# @adnet/mcp — Adviverse MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI
agents manage an Adviverse account through a curated, typed toolset (backed by
[`@adnet/sdk`](../../services/sdk)).

## What it exposes (20 tools)

- **Account** — `whoami`
- **Campaigns** — `list_campaigns`, `get_campaign`, `create_campaign`, `update_campaign`, `submit_campaign`, `set_campaign_status`
- **Creatives** — `list_creatives`, `create_creative`
- **Inventory** — `list_properties`, `create_property`, `verify_property`, `list_placements`, `create_placement`, `get_placement_tag`
- **Finance (read-only)** — `get_balance`, `list_ledger`
- **Reporting** — `advertiser_report`, `publisher_report`
- **Deals** — `list_deals`

Treasury moves (deposits/payouts) and API-key minting are intentionally **not**
exposed — those stay human-gated in the dashboard.

## Auth

Create a scoped key in the dashboard (**Settings → API keys**) — pick **Read-only**
for a monitoring agent or **Read & write** for one that manages campaigns/inventory.
The server reads it from the environment:

| Env var | Required | Default |
|---|---|---|
| `ADVIVERSE_API_KEY` | yes | — (`ak_<prefix>.<secret>`) |
| `ADVIVERSE_BASE_URL` | no | `https://adviverse.com` |

A read-only key makes every mutating tool return a `403 missing scope: write` —
scopes are enforced server-side.

## Hosted (no install) — `https://mcp.adviverse.com/mcp`

A multi-tenant Streamable-HTTP server is hosted for you. Point any remote-MCP
client at the URL and pass **your own** key in the `Authorization` header — the
server runs a per-session client bound to that key (keys are never shared):

```json
{
  "mcpServers": {
    "adviverse": {
      "url": "https://mcp.adviverse.com/mcp",
      "headers": { "Authorization": "Bearer ak_xxx.yyy" }
    }
  }
}
```

No key → `401`. The hosted server (`src/http.ts`) talks to the control-plane
internally; see `deploy/docker-compose.yml` for the service definition.

## Run locally (stdio)

```bash
pnpm --filter @adnet/mcp build          # bundles standalone dist/index.js (stdio) + dist/http.js
ADVIVERSE_API_KEY=ak_xxx.yyy node dist/index.js
```

### Claude Desktop / other MCP clients

```json
{
  "mcpServers": {
    "adviverse": {
      "command": "node",
      "args": ["/abs/path/packages/mcp/dist/index.js"],
      "env": { "ADVIVERSE_API_KEY": "ak_xxx.yyy" }
    }
  }
}
```

The build is bundled (no `node_modules` needed at the run site), so the single
`dist/index.js` is all you ship.

## Regenerating against API changes

The MCP is hand-curated on top of `@adnet/sdk`; the full machine-readable surface
lives at `GET /v1/docs-json` (and Swagger UI at `/v1/docs`). Regenerate the spec
with `pnpm --filter @adnet/control-plane openapi` if you want to codegen clients
for the long-tail endpoints not surfaced here.
