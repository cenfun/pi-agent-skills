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

Run `node setup.mjs` **after `npm ci`** in the installed skill's `bridge/` directory. It installs a tiny shim in `~/.pi/agent/extensions/` pointing to the installed skill's extension. It also **disables** any previously configured always-on `figma-mcp-to-web-bridge` in `~/.pi/agent/mcp.json`, preserving other MCP entries. Reload Pi once. Do not remove the installed skill directory while the shim is in use; rerun setup after relocating the skill.

Pi 1.1.0 cannot lazily start a file-configured MCP server with `enabled: false`. This bundled extension instead exposes `start_figma_bridge`, which calls Pi's **built-in** `pi.registerMcpServer()` on demand with a distinct runtime name (`figma-mcp-to-web-lazy`). Only this small starter tool loads at session startup. Calling it launches the stdio MCP server and localhost WebSocket relay; idle periods of 10 minutes and session shutdown call `pi.unregisterMcpServer()` to release port 3081. This is not `pi-mcp-adapter` and does not replace native MCP. A file-configured entry of the **same name as the runtime server** would override extension registration: do not create one. Don't enable the legacy entry at the same time, or the two bridges will compete for port 3081. Other Pi sessions accessing Figma concurrently can also conflict on that port.

The extension sets a native MCP per-request `timeout` of 300 **seconds**, above the bridge's 120-second inactivity limit. Plugin progress resets the WebSocket timer but not Pi's total request timer; reduce overly broad Figma reads first. Remove/disable `pi-mcp-adapter` if installed because it replaces Pi's built-in MCP.

When using the Skill, call `start_figma_bridge({})` first, then discover tools through Pi's `codemode`: `searchTools("Figma bridge_status")`, inspect with `describeTool()`, and call the discovered tool (normally `tools.mcp__figma_mcp_to_web_lazy__bridge_status({})`). MCP results have `isError`, `content`, and `structuredContent`; forward only PNG/JPEG image blocks with `image(block)`, not SVG source text. `/mcp` shows the runtime bridge only after the starter tool is called. `pi mcp list` runs without extensions, so it will show only the disabled legacy entry, not the on-demand bridge.

Figma does not allow an external process to install or launch a plugin. First import `<skill-dir>/plugin/manifest.json` through **Plugins → Development → Import plugin from manifest…**. Call `start_figma_bridge`, then run **Figma MCP to Web Plugin** in Figma Desktop after Pi connects the bridge (or before; it will retry). The plugin connects automatically. Do not consider setup complete until it displays:

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
