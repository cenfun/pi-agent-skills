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

Configure `pi-mcp-adapter` with an absolute path:

```json
{
  "mcpServers": {
    "figma-mcp-to-web-bridge": {
      "command": "node",
      "args": ["<absolute-skill-dir>/bridge/server.mjs"],
      "lifecycle": "lazy",
      "idleTimeout": 30,
      "requestTimeoutMs": 120000,
      "includeTools": [
        "bridge_status",
        "list_channels",
        "join_channel",
        "get_document_info",
        "get_selection",
        "read_my_design",
        "get_node_info",
        "get_nodes_info",
        "scan_nodes_by_types",
        "scan_text_nodes",
        "get_styles",
        "get_local_components",
        "get_annotations",
        "get_reactions",
        "export_node_as_image"
      ]
    }
  }
}
```

Use `~/.config/mcp/mcp.json` for a shared global MCP configuration, `.mcp.json` for a project configuration, or the Pi adapter's own override file. Run `/reload` after changing configuration.

With `lifecycle: "lazy"`, Pi does not start or connect to the combined MCP/WebSocket process at session startup. The process starts only when a `figma-mcp-to-web-bridge` tool is first called, avoiding connection errors in sessions that do not use Figma. The example sets the adapter's per-server `idleTimeout` to 30 minutes; after 30 minutes without an MCP tool call, the adapter stops the stdio process, and the plugin's WebSocket connection closes with it. A later tool call restarts the bridge, and the open plugin reconnects automatically with exponential backoff. Set `idleTimeout` to `0` instead to disable idle shutdown for the Pi session. Ensure no other process is listening on port 3081 when starting a Figma workflow.

Figma does not allow an external process to install or launch a plugin. First import `<skill-dir>/plugin/manifest.json` through **Plugins → Development → Import plugin from manifest…**. Start the bridge by calling `bridge_status` (or another `figma-mcp-to-web-bridge` tool), then run **Figma MCP to Web Plugin** in Figma Desktop. The plugin connects automatically. Do not consider setup complete until it displays:

```text
Connected to server in channel: <channel>
```

The plugin automatically joins the generated channel after connecting. If it was opened before the bridge started, leave it running; it retries with exponential backoff capped at five seconds and reconnects after bridge restarts. **Disconnect** deliberately pauses retries and enables port editing; **Connect** resumes automatic connection. Pi should then call `bridge_status` and continue only when `ready` is `true` and `connectionMessage` confirms the active channel.

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `FIGMA_BRIDGE_HOST` | `localhost` | WebSocket bind host; keep this loopback-only |
| `FIGMA_BRIDGE_PORT` | `3081` | WebSocket port expected by the plugin |
| `FIGMA_BRIDGE_TIMEOUT_MS` | `120000` | Per-command inactivity timeout; progress updates reset it. This does not control bridge process idle shutdown. |
| `FIGMA_BRIDGE_MAX_PAYLOAD_BYTES` | `67108864` | Maximum incoming WebSocket message size |

## Validation

```bash
npm test
npm run check
npm audit --omit=dev
```
