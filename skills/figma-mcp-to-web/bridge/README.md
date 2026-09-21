# Figma local bridge

This process combines two roles:

1. an MCP server over stdio for Pi;
2. a WebSocket relay on `ws://localhost:3055` for the Community **Talk To Figma MCP Plugin**.

It exposes only read-oriented tools. `get_reactions` is the sole exception with a known temporary canvas-highlight side effect in the Community plugin and should remain approval-gated.

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
    "talk-to-figma": {
      "command": "node",
      "args": ["<absolute-skill-dir>/bridge/server.mjs"],
      "lifecycle": "keep-alive",
      "idleTimeout": 0,
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
      ],
      "approveTools": ["get_reactions"]
    }
  }
}
```

Use `~/.config/mcp/mcp.json` for a shared global MCP configuration, `.mcp.json` for a project configuration, or the Pi adapter's own override file. Run `/reload` after changing configuration.

With `lifecycle: "keep-alive"`, Pi starts the combined MCP/WebSocket process automatically at session startup. Do not run `cursor-talk-to-figma-socket` or `cursor-talk-to-figma-mcp` at the same time because only one process can listen on port 3055.

Figma itself does not allow an external process to launch a Community plugin. Open Figma Desktop and run **Talk To Figma MCP Plugin**, then click **Connect**. Do not consider setup complete until the plugin displays:

```text
Connected to server in channel: <channel>
```

The plugin automatically joins the generated channel after connecting. If it was opened before the bridge started, click **Connect** again. Pi should then call `bridge_status` and continue only when `ready` is `true` and `connectionMessage` confirms the active channel.

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `FIGMA_BRIDGE_HOST` | `localhost` | WebSocket bind host; keep this loopback-only |
| `FIGMA_BRIDGE_PORT` | `3055` | WebSocket port expected by the plugin |
| `FIGMA_BRIDGE_TIMEOUT_MS` | `120000` | Inactivity timeout for plugin commands |
| `FIGMA_BRIDGE_MAX_PAYLOAD_BYTES` | `67108864` | Maximum incoming WebSocket message size |

## Validation

```bash
npm test
npm run check
npm audit --omit=dev
```
