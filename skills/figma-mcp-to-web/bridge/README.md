# Figma local bridge

This process combines two roles:

1. an MCP server over stdio for Pi;
2. a WebSocket relay on `ws://localhost:3081` for the skill's bundled **Figma MCP to Web Plugin** development plugin.

It exposes only read-oriented tools. The bundled plugin's `get_reactions` implementation is also read-only and does not highlight or modify canvas nodes.

## Asset export policy

Call `export_node_as_image` with `format: "SVG"` for small vector icons, logos, marks, and line art. Use `format: "PNG"` for full-screen references, photos, image-fill nodes, textures, and large raster backgrounds. The bridge forwards the requested format and detects PNG, JPEG, SVG, and PDF payload signatures instead of blindly trusting plugin metadata.

The bundled plugin exports SVG directly with the Figma Plugin API. The bridge returns SVG as **two text blocks** (MIME/node label, then exact UTF-8 SVG source), without the former 512 KiB cutoff or an unsupported SVG image block (subject to the bridge's WebSocket payload limit). Pi may truncate model-facing text over 20 KiB to a temp file, but `codemode` receives the complete `CallToolResult`: save `result.content[1].text` directly to a `.svg` file through `tools.write()` without copying it into model output. PNG/JPEG exports remain MCP image blocks; PDF is a binary resource that Pi saves as a file. The bridge verifies payload signatures and warns if an SVG request unexpectedly returns raster bytes or if the SVG contains an embedded raster `<image>`. Treat either warning as disqualifying for icons that must remain purely vector.

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
      "enabled": false,
      "exposure": "codemode",
      "description": "Read the open Figma Desktop document through the bundled local read-only bridge"
    }
  }
}
```

Pi's `timeout` is a per-request limit in **seconds** (default 60); the example uses 300 seconds, above the bridge's 120-second inactivity limit. Plugin progress refreshes the bridge's WebSocket timeout but is **not** forwarded as MCP progress, so Pi's total request timer can still expire on an exceptionally long operation. Set a higher Pi timeout if needed; reduce overly broad Figma reads first.

Pi 1.1.0 has **no configuration-only automatic lazy MCP startup or idle shutdown**. The example uses `enabled: false` to avoid launching a global bridge (and occupying port 3081) in every session. When beginning a Figma workflow, use `/mcp` to enable the server, wait for it to connect, then run the Figma plugin. Disable it again through `/mcp` after the workflow to stop the server. These changes persist; a trusted project's `.pi/mcp.json` can instead override a global entry by name with `{ "enabled": true }` so it starts only in that project. A project-only entry (without a global entry) also restricts startup to trusted projects using it, but still starts on every session in those projects. The first `bridge_status` call **checks**, not starts, an enabled bridge. Neither `codemode` exposure nor a loaded Skill starts a disabled server; a user must enable it with `/mcp` first. Do not use adapter-only `lifecycle`, `idleTimeout`, `requestTimeoutMs`, or `includeTools` fields.

If you previously installed `pi-mcp-adapter`, remove/disable it first: an extension registering `/mcp` replaces Pi's built-in MCP support. After editing configuration, run `/reload` (or restart Pi) and check `/mcp` for the server's disabled/connected state. `pi mcp list` can validate configuration from a shell **before** launching Pi; do not start a second instance while port 3081 is occupied. Ensure no other process uses that port.

With `exposure: "codemode"`, discover tools using `searchTools("Figma bridge_status")` in Pi's built-in `codemode`, then inspect the returned name with `describeTool()`. For the server name in the example above, call `tools.mcp__figma_mcp_to_web_bridge__bridge_status({})`; if your installation uses another name, use the actual tool name returned by discovery. Tool calls return MCP `CallToolResult` (check `isError`; forward only PNG/JPEG image blocks with `image(block)`, not SVG source text). Alternatively set `exposure: "deferred"` and load tools via `tool_search`, or `"direct"` to expose all bridge tools immediately. Verify the effective exposure in `/mcp`.

Figma does not allow an external process to install or launch a plugin. First import `<skill-dir>/plugin/manifest.json` through **Plugins → Development → Import plugin from manifest…**. Enable the server via `/mcp`, then run **Figma MCP to Web Plugin** in Figma Desktop after Pi connects the bridge (or before; it will retry). The plugin connects automatically. Do not consider setup complete until it displays:

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
