# Figma local bridge

This process combines two roles:

1. an MCP server over stdio for Pi;
2. a WebSocket relay on `ws://localhost:3081` for the skill's bundled **Figma MCP to Web Plugin** development plugin.

It exposes only read-oriented tools. The bundled plugin's `get_reactions` implementation is also read-only and does not highlight or modify canvas nodes.

## Asset export policy

Call `export_node_as_image` with `format: "SVG"` for small vector icons, logos, marks, and line art. Use `format: "PNG"` for full-screen references, photos, image-fill nodes, textures, and large raster backgrounds. The bridge forwards the requested format and detects PNG, JPEG, SVG, and PDF payload signatures instead of blindly trusting plugin metadata.

The bundled plugin exports SVG directly with the Figma Plugin API. For SVGs up to 512 KiB, the bridge returns the exact SVG source as text alongside the MCP image attachment so the asset can be written without tracing or reconstruction. It also verifies the payload signature and warns if an SVG request unexpectedly returns raster bytes or if the SVG contains an embedded raster `<image>`. Treat either warning as disqualifying for icons that must remain purely vector.

## One-time installation

Install dependencies in the final installed skill directory, not in a temporary checkout:

```bash
cd <skill-dir>/bridge
npm ci --ignore-scripts
```

Configure Pi's **built-in MCP** in `~/.pi/agent/mcp.json` (user-level) or `.pi/mcp.json` (trusted project). Use the absolute path to the **installed** skill directory; in JSON, escape Windows backslashes or use forward slashes:

```json
{
  "mcpServers": {
    "figma-mcp-to-web-bridge": {
      "command": "node",
      "args": ["<absolute-skill-dir>/bridge/server.mjs"],
      "timeout": 300,
      "exposure": "codemode",
      "description": "Read the open Figma Desktop document through the bundled local read-only bridge"
    }
  }
}
```

Pi's `timeout` is a per-request limit in **seconds** (default 60). Set it above the bridge's own 120-second inactivity limit for long reads; Figma plugin progress refreshes the bridge's WebSocket command timeout, but is not forwarded as MCP progress notifications, so Pi's request limit can still expire first. No adapter-only `lifecycle`, `idleTimeout`, `requestTimeoutMs`, or `includeTools` fields are supported by Pi's built-in MCP. If you previously installed `pi-mcp-adapter`, remove/disable that extension first: an extension that registers `/mcp` replaces Pi's built-in MCP support and prevents Pi from reading `mcp.json` in a session. Then run `/reload` (or restart Pi) and check `/mcp` in Pi to confirm the server connects and exposes its tools. You can run `pi mcp list` from a shell **before** launching the Pi session; do not start a second bridge instance on port 3081 while Pi already has one running. Pi starts enabled stdio MCP servers in the background at session startup; the first `bridge_status` call **checks** the running bridge rather than starting it. The bridge runs while its MCP connection is open; there is no built-in idle shutdown. Ensure no other process uses port 3081. For occasional use, disable the server via `/mcp` when not needed and re-enable it before a Figma session.

With `exposure: "codemode"`, discover tools using `searchTools("Figma bridge_status")` in Pi's built-in `codemode`, then inspect the returned name with `describeTool()`. For the server name in the example above, call `tools.mcp__figma_mcp_to_web_bridge__bridge_status({})`; if you registered the bridge under a different name (such as `talk-to-figma`), use its actual normalized prefix (such as `tools.mcp__talk_to_figma__bridge_status({})`). Tool calls return MCP `CallToolResult` (check `isError`; forward image blocks with `image(block)`). Alternatively set `exposure: "deferred"` and load tools via `tool_search`, or `"direct"` to expose all bridge tools immediately. Verify the effective exposure in `/mcp`.

Figma does not allow an external process to install or launch a plugin. First import `<skill-dir>/plugin/manifest.json` through **Plugins → Development → Import plugin from manifest…**. Run **Figma MCP to Web Plugin** in Figma Desktop after Pi connects the bridge (or before; it will retry). The plugin connects automatically. Do not consider setup complete until it displays:

```text
Connected to server in channel: <channel>
```

The plugin automatically joins the generated channel after connecting. If it was opened before the bridge started, leave it running; it retries with exponential backoff capped at five seconds and reconnects after bridge restarts. **Disconnect** deliberately pauses retries and enables port editing; **Connect** resumes automatic connection. Pi should then call `bridge_status` and continue only when `ready` is `true` and `connectionMessage` confirms the active channel.

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `FIGMA_BRIDGE_HOST` | `localhost` | WebSocket bind host; keep this loopback-only |
| `FIGMA_BRIDGE_PORT` | `3081` | WebSocket port expected by the plugin |
| `FIGMA_BRIDGE_TIMEOUT_MS` | `120000` | Per-command inactivity timeout; progress updates reset it. Pi's MCP `timeout` is separate; plugin progress does not reset Pi's timer. |
| `FIGMA_BRIDGE_MAX_PAYLOAD_BYTES` | `67108864` | Maximum incoming WebSocket message size |

## Validation

```bash
npm test
npm run check
npm audit --omit=dev
```
