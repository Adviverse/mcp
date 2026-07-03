# @adviverse/mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the
[Adviverse](https://adviverse.com) ad network API as tools for AI agents —
campaigns, creatives, audiences, the pixel, reporting, publisher properties &
placements, agency clients & invoicing, and more.

Self-contained: it bundles [`@adviverse/sdk`](https://github.com/Adviverse/sdk)
and its dependencies into a single file — runs with just Node, no install step
at the call site.

## Run

```bash
# stdio (for a local MCP client like Claude Desktop / an IDE)
npx @adviverse/mcp
```

Provide your Adviverse credentials via environment variables:

```bash
ADVIVERSE_BASE_URL=https://adviverse.com
ADVIVERSE_API_KEY=ak_...        # a scoped API key
```

### Claude Desktop / MCP client config

```json
{
  "mcpServers": {
    "adviverse": {
      "command": "npx",
      "args": ["-y", "@adviverse/mcp"],
      "env": {
        "ADVIVERSE_BASE_URL": "https://adviverse.com",
        "ADVIVERSE_API_KEY": "ak_..."
      }
    }
  }
}
```

## HTTP mode

The package also ships an HTTP entrypoint (`dist/http.js`) for hosting the server
behind a URL (used for the managed endpoint at `mcp.adviverse.com`).

## Tools

The server curates a focused tool per API action (list/create/update campaigns,
manage creatives & audiences, configure the pixel, pull reports, manage agency
clients & invoices, etc.). The underlying HTTP client is
[`@adviverse/sdk`](https://github.com/Adviverse/sdk).

## License

Proprietary — see [LICENSE](LICENSE).
