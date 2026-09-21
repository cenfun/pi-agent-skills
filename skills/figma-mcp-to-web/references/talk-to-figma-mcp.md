# Talk to Figma MCP reference

This reference targets the Community **Talk to Figma MCP Plugin** used with this skill's bundled `bridge/server.mjs`. The Node.js process combines the local WebSocket relay and read-oriented MCP server. Tool names may be namespaced by the host client; discover the installed tools instead of assuming a prefix.

## Connection model

```text
AI client -> bundled Node.js bridge (MCP stdio + localhost WebSocket) -> Figma plugin UI -> Figma Plugin API
```

The bundled bridge is one process. After it starts, explicitly prompt the user to open **Talk To Figma MCP Plugin** in Figma Desktop and click **Connect**. Do not continue until the plugin displays `Connected to server in channel: <channel>` and `bridge_status.ready` is `true`. This confirms both the plugin's WebSocket connection and the current AI client's MCP access before `get_document_info` and `get_selection` are called.

The bridge automatically selects a channel when exactly one plugin is connected. With multiple plugins, use `list_channels` and `join_channel` to select one. A channel is session routing data; do not guess it, log it unnecessarily, or commit it to the repository.

## Read tools

| Tool | Use | Important behavior |
|---|---|---|
| `bridge_status` | Show WebSocket listener, plugin count, channels, active channel, and pending requests | Call first |
| `list_channels` | List connected plugin channels | Use when multiple Figma plugins/files are open |
| `join_channel` | Select one connected plugin channel | Optional when exactly one plugin is connected |
| `get_document_info` | Confirm current page and list its top-level children | Current implementation reports the current page only; its `pages` array is not a full-document page list |
| `get_selection` | Obtain selected node IDs/names/types | Lightweight; always call before detailed extraction |
| `read_my_design` | Recursively export every selected node | Avoid for broad/multiple selections because output is unbounded |
| `get_node_info` | Recursively inspect one node by ID | No depth/max-node argument in the reviewed implementation |
| `get_nodes_info` | Inspect multiple explicit IDs | Keep batches small |
| `scan_nodes_by_types` | Find descendants of specified Figma node types | Useful because vectors are omitted from detailed node output |
| `scan_text_nodes` | Find text nodes in a subtree | Uses chunking but can still be slow on large files |
| `get_styles` | Read local paint/text/effect/grid style summaries | Does not provide complete effect/grid definitions or variable bindings |
| `get_local_components` | Scan local components across loaded pages | Potentially slow; use only for component mapping |
| `get_annotations` | Read annotations for a node | Requires an explicit node ID |
| `get_reactions` | Recursively inspect prototype reactions | Has canvas side effects; see below |
| `export_node_as_image` | Return a rendered node image | Verify returned MIME type and avoid excessive scale |

## Current node response shape

`get_node_info` and `read_my_design` call Figma's `exportAsync({format: "JSON_REST_V1"})`, then the Community plugin applies its own filter before sending the result through the local bridge. The result is not raw REST JSON.

The filter retains primarily:

- `id`, `name`, `type`;
- fills, excluding `boundVariables` and `imageRef`;
- strokes, excluding `boundVariables`;
- `cornerRadius`;
- `absoluteBoundingBox`;
- non-empty text `characters`;
- basic text style: family, style, weight, size, horizontal alignment, letter spacing, and pixel line height;
- recursively filtered children.

The filter explicitly removes `VECTOR` nodes and omits many properties, including Auto Layout, constraints, effects, opacity, masks, component properties, style bindings, and prototype data. Never infer that omitted values are defaults.

When deriving local geometry from absolute boxes:

```text
localX = child.absoluteBoundingBox.x - parent.absoluteBoundingBox.x
localY = child.absoluteBoundingBox.y - parent.absoluteBoundingBox.y
```

Account separately for parent borders, transforms, clipping, and rotation; the subtraction is only a starting point.

## Screenshots and assets

Use `export_node_as_image` for the selected root screenshot. The MCP schema accepts `PNG`, `JPG`, `SVG`, and `PDF`, but the reviewed Community plugin implementation currently forces `PNG` internally. Always trust the returned `mimeType`, not the requested format.

Because vectors are removed from detailed node output:

1. call `scan_nodes_by_types` with vector-like Figma types;
2. retain returned IDs and bounding boxes;
3. try individual export only when needed;
4. verify whether the installed plugin version truly returns SVG;
5. otherwise use an exact project asset or request a direct SVG export.

A full-screen PNG is a comparison reference, not a substitute for reusable image/icon assets.

## Interaction warning

`get_reactions` recursively searches nodes, temporarily applies orange strokes to matches, and restores them on a timer. Its MCP response also directs the caller toward `reaction_to_connector_strategy` and `create_connections`, which would add nodes to the Figma canvas.

For this skill:

- obtain user approval before calling `get_reactions`;
- do not execute its automatic connector follow-up;
- do not use any Figma mutation tool;
- report whether the call was made and that temporary highlighting may have occurred.

## Known operational risks

- Large recursive reads and all-page component scans can hit the bridge's command timeout.
- Selection and current page can change between calls; re-check before implementation if the user interacts with Figma.
- The bundled bridge returns MCP `isError` results for relay/plugin failures instead of wrapping them as successful text.
- The Community plugin manifest permits localhost WebSocket access and Google Analytics. Follow the user's privacy policy and do not assume the bridge is telemetry-free.
- Keep the relay bound to localhost. Do not follow Windows/WSL instructions that bind to `0.0.0.0` unless the user explicitly accepts network exposure and has appropriate firewall controls.

## Failure handling

- **Tools missing:** the bundled bridge is not installed/configured in the current AI client. Stop; do not use snapshot fallback.
- **No plugin connected:** stop and prompt the user to open the Community plugin in Figma Desktop, click **Connect**, wait for `Connected to server in channel: <channel>`, and confirm completion. Then call `bridge_status` again; do not poll repeatedly while waiting. The plugin connects to `ws://localhost:3055` but does not continuously retry after an earlier connection failure.
- **Multiple channels:** list them, ask the user which file/plugin to target, and call `join_channel`.
- **Wrong document/page:** ask the user to activate the intended Figma file/page.
- **Empty or ambiguous selection:** ask the user to select one exact frame/state.
- **Timeout:** reduce selection scope; do not repeatedly retry a broad recursive call.
- **Missing vectors/assets:** report IDs and request direct exports.
- **Tool returns text beginning with `Error`:** treat it as failure even if the MCP transport itself succeeded.
