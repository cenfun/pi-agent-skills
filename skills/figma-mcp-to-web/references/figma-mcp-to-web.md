# figma-mcp-to-web reference

This reference targets the skill's bundled **Figma MCP to Web Plugin** development plugin used with `bridge/server.mjs`. The Node.js process combines the local WebSocket relay and read-oriented MCP server. Tool names may be namespaced by the host client; discover the installed tools instead of assuming a prefix.

## Connection model

```text
AI client -> bundled Node.js bridge (MCP stdio + localhost WebSocket) -> Figma plugin UI -> Figma Plugin API
```

The bundled bridge is one process. After it starts, explicitly prompt the user to open **Figma MCP to Web Plugin** under Figma Desktop's Development plugins. The plugin connects automatically and retries if the bridge is unavailable or restarts. Do not continue until the plugin displays `Connected to server in channel: <channel>` and `bridge_status.ready` is `true`. This confirms both the plugin's WebSocket connection and the current AI client's MCP access before `get_document_info` and `get_selection` are called.

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
| `get_reactions` | Recursively inspect prototype reactions | Read-only in the bundled plugin; no canvas highlighting |
| `export_node_as_image` | Return a rendered node image | Request SVG for vector icons; request PNG for screens/bitmaps; verify returned MIME type |

## Current node response shape

`get_node_info` and `read_my_design` call Figma's `exportAsync({format: "JSON_REST_V1"})`, then the bundled plugin applies a compatibility filter before sending the result through the local bridge. The result is not raw REST JSON.

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

Use `export_node_as_image({ nodeId, format: "PNG", scale: 1 })` for the selected root screenshot. This PNG is a visual comparison reference, not a reusable source for icons.

For each required asset, choose the format from its content:

| Asset kind | First export request | Rule |
|---|---|---|
| small icon, logo, mark, line art, compact vector decoration | `SVG`, scale `1` | final implementation must remain vector |
| photo, image-fill/bitmap node, texture, large raster background | `PNG`, scale `1` unless higher density is demonstrably needed | preserve intrinsic raster content |
| large vector illustration | `SVG` when practical | do not classify as bitmap from size alone |
| full frame/screen reference | `PNG`, scale `1` | comparison only |

The MCP schema requires one of `PNG`, `JPG`, `SVG`, and `PDF`. The bundled plugin honors that format and calls Figma's Plugin API directly; SVG/PDF omit raster scale constraints. The bridge independently detects common payload signatures and reports a warning when an SVG request comes back as a raster MIME type. SVG source up to 512 KiB is returned as text alongside the MCP image attachment so it can be saved exactly. Always trust the verified returned MIME type rather than a requested format or filename.

Because vectors are removed from detailed node output:

1. call `scan_nodes_by_types` with `VECTOR`, `BOOLEAN_OPERATION`, `LINE`, `ELLIPSE`, `POLYGON`, and `STAR` as appropriate;
2. retain returned IDs and bounding boxes;
3. request `SVG` for each needed vector/icon node rather than cropping it from the screen PNG;
4. accept it as an implementation asset only when the returned MIME type is `image/svg+xml`, no embedded raster warning is present, and it visually matches;
5. if the result is raster or contains an embedded `<image>`, use it only as reference, then find an exact project SVG or request a corrected vector source.

Never rename PNG bytes to `.svg`, wrap a PNG in SVG, auto-trace a screenshot, or approximate missing icon paths.

## Interaction reads

The bundled plugin's `get_reactions` recursively searches only the requested subtrees. It does not highlight nodes, alter strokes, create connectors, or expose any mutation command. Use its output only as implementation evidence and report when the call was made.

## Known operational risks

- Large recursive reads and all-page component scans can hit the bridge's command timeout.
- Selection and current page can change between calls; re-check before implementation if the user interacts with Figma.
- The bundled bridge returns MCP `isError` results for relay/plugin failures instead of wrapping them as successful text.
- The bundled plugin manifest permits only the localhost WebSocket bridge and contains no analytics or remote telemetry.
- Keep the relay bound to localhost. Do not follow Windows/WSL instructions that bind to `0.0.0.0` unless the user explicitly accepts network exposure and has appropriate firewall controls.

## Failure handling

- **Tools missing:** the bundled bridge is not installed/configured in the current AI client. Stop; do not use snapshot fallback.
- **No plugin connected:** stop and prompt the user to run **Figma MCP to Web Plugin** under Plugins → Development, wait for its automatic connection to show `Connected to server in channel: <channel>`, and confirm completion. If it is already open, leave it running while it retries; if it shows `Automatic connection paused`, click **Connect** once to resume retries. Then call `bridge_status` again; do not poll repeatedly while waiting.
- **Multiple channels:** list them, ask the user which file/plugin to target, and call `join_channel`.
- **Wrong document/page:** ask the user to activate the intended Figma file/page.
- **Empty or ambiguous selection:** ask the user to select one exact frame/state.
- **Timeout:** reduce selection scope; do not repeatedly retry a broad recursive call.
- **SVG request returns PNG:** retain it only as reference and report the node ID; this indicates the wrong/legacy plugin may be connected or the export payload is invalid.
- **SVG contains embedded raster:** do not use it for a vector-only icon; use an exact project SVG or request a corrected vector source.
- **Missing vectors/assets:** report IDs and request direct exports; do not rasterize icons as the fallback.
- **Tool returns text beginning with `Error`:** treat it as failure even if the MCP transport itself succeeded.
