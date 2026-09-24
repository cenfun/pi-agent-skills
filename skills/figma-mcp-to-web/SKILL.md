---
name: figma-mcp-to-web
description: Implements high-fidelity, responsive, interactive web UI from the currently open Figma Desktop document through the bundled read-only Figma plugin and local MCP bridge. Use for Figma-to-HTML/CSS, React, Vue, Svelte, or another existing web stack without the Figma REST API or snapshot JSON exports.
compatibility: Requires Node.js, Figma Desktop, this skill's bundled local Figma development plugin, and its local MCP/WebSocket bridge configured in Pi.
---

# Figma MCP to Web UI

Implement production UI from the live Figma Desktop document through **Figma MCP to Web Plugin** and **figma-mcp-to-web-bridge**. Work read-only in Figma: inspect the selected design, export visual references, then modify only the target code repository.

This workflow accepts only live Figma data through the bundled read-only development plugin and Node.js MCP/WebSocket bridge. It does not accept local JSON exports or use the Figma REST API.

## Non-negotiable rules

1. **Inspect the target app before coding.** Read repository instructions and identify its framework, routes, styling, tokens, fonts, shared components, assets, state patterns, and validation commands.
2. **Verify the live bridge first.** The bundled process combines the MCP server and WebSocket relay, while the bundled Figma development plugin remains a separate peer. A connected plugin alone does not prove that the current agent can call its MCP tools.
3. **Use read-only Figma operations.** Do not create, delete, rename, move, resize, restyle, annotate, reparent, or select nodes unless the user explicitly asks to modify Figma.
4. **Require one exact target screen/state.** Ask the user to select the smallest complete target frame in Figma. Do not retrieve a whole page when a screen selection is sufficient.
5. **Avoid oversized tool responses.** Start with document and selection summaries. Call `get_node_info` for one selected node; use small batches only when comparison is necessary.
6. **Treat MCP node data as incomplete evidence, not final DOM.** The bundled plugin filters Figma's `JSON_REST_V1` export before sending it through the bridge and omits several layout, vector, image-reference, variable-binding, and interaction fields.
7. **Use a rendered Figma image as the visual source of truth.** Node JSON supplies hierarchy, text, colors, and bounds; the screenshot resolves composition, clipping, fonts, masks, vectors, and effects omitted by the bridge.
8. **Reuse before creating.** Priority: matching project component → exact project SVG/image asset → project token/style → Figma component/style evidence → new page-local implementation.
9. **Icons must remain vector.** Request SVG first for small icons, marks, logos, and other vector-like artwork. Never ship a PNG fallback for an icon and never trace or fabricate an SVG from a screenshot. Use PNG for screen references, large photographic/textured backgrounds, and nodes that are intrinsically bitmap.
10. **Do not invent missing behavior or artwork.** Use exact project assets when visually verified. Otherwise report the unresolved node instead of drawing an approximate SVG or substituting an unrelated icon.
11. **Do not convert or generate ARIA labeling attributes.** Ignore metadata that could map to `aria-label`, `aria-labelledby`, `aria-describedby`, or related ARIA labeling attributes. Prefer native controls and visible labels without adding ARIA labeling attributes in this workflow.
12. Keep temporary screenshots and analysis artifacts under the target project's `.temp/` directory.
13. Run every repository-required build, typecheck, lint, stylelint, filename, and test command before completion.

## Required MCP capabilities

Discover the active tool names because the client may prefix them with the MCP server name. The workflow requires these local bridge tools:

- `bridge_status`
- `list_channels`
- `join_channel` when more than one plugin/channel is connected
- `get_document_info`
- `get_selection`
- `get_node_info`
- `export_node_as_image`

Use these only when needed:

- `get_nodes_info`
- `scan_nodes_by_types`
- `scan_text_nodes`
- `get_styles`
- `get_local_components`
- `get_annotations`
- `get_reactions`

Read [references/figma-mcp-to-web.md](references/figma-mcp-to-web.md) before using these tools. Read [references/fidelity-and-interactions.md](references/fidelity-and-interactions.md) before implementation and visual QA.

If the required MCP tools are unavailable, stop and report that the bundled bridge must be installed, configured in Pi, and reloaded. Do not fall back to a snapshot file.

## Bundled plugin and bridge setup

Resolve this skill's directory from the loaded `SKILL.md`. Import `<skill-dir>/plugin/manifest.json` once through Figma Desktop's **Plugins → Development → Import plugin from manifest…**. This local plugin exposes only the read operations required by the skill, has no telemetry, and exports SVG directly through the Figma Plugin API.

Install the bridge once with:

```bash
cd <skill-dir>/bridge
npm ci --ignore-scripts
```

Configure `pi-mcp-adapter` once as shown in [bridge/README.md](bridge/README.md), using an absolute path to `<skill-dir>/bridge/server.mjs`, `lifecycle: "lazy"`, and `idleTimeout: 30`. Calling `bridge_status` starts the combined stdio MCP server and `ws://localhost:3081` relay when needed. After 30 minutes without an MCP tool call, the adapter stops the bridge and closes the plugin connection; a still-open plugin reconnects automatically after a later tool call restarts the bridge. Use `idleTimeout: 0` instead to keep the bridge alive until the Pi session ends. Ensure no other process is using port 3081.

The installed **Figma MCP to Web Plugin** connects automatically and retries with a capped exponential backoff if the bridge is not yet available or later restarts. The agent must not ask the user to wait for or confirm this automatic connection. After starting the bridge with `bridge_status`, wait briefly and retry status checks until the plugin is connected, then continue immediately. The UI's **Disconnect** action deliberately pauses retries and enables port editing; **Connect** resumes automatic connection. Do not run another plugin against the same bridge at the same time.

## Required workflow

### 1. Establish project context

Before querying detailed Figma data:

- determine the requested route, screen/state, viewport, framework, and interaction scope;
- inspect neighboring pages, shared components, tokens, fonts, assets, routing, and state conventions;
- record all required validation commands;
- avoid replacing the project's architecture with generated React/Tailwind-style output.

### 2. Connect and verify the live Figma session

1. Locate the bridge tools in the active MCP registry.
2. Call `bridge_status` and inspect its `ready` field. When exactly one plugin is connected, the bridge selects its channel automatically.
3. If `ready` is `false` and no channel is connected, let the plugin's automatic connection proceed: delay for 1 second, call `bridge_status` again, then use delays of 2, 3, and at most 5 seconds between subsequent checks. Keep retrying with the 5-second cap until a channel connects. Do not busy-poll, ask the user to wait, or ask for connection confirmation. As soon as status becomes ready, continue automatically to the next step.
4. If multiple channels are connected, call `list_channels`, ask the user which Figma file/plugin to use, then call `join_channel` with that exact channel. Never guess or persist a channel value in source control.
5. Continue when `bridge_status.ready` is `true` and `connectionMessage` reports `Connected to server in channel: <channel>`. Treat missing tools, bridge process failure, port conflicts, or explicit `Automatic connection paused` state as setup errors rather than an ordinary connection wait; report the concrete error instead of silently polling a condition that cannot recover automatically.
6. Call `get_document_info` and confirm the returned current page matches the user's intended page. The bundled plugin does not return the Figma file name, so confirm file identity with the user when it is ambiguous.
7. Call `get_selection` and verify that exactly the intended screen or component is selected.

A transient disconnected state is handled by the automatic delayed retry loop above, without human confirmation. If nothing is selected, multiple unrelated nodes are selected, or the document does not match, stop and ask the user to complete only that required Figma action. Do not compensate by scanning and guessing across the entire page.

### 3. Acquire the target progressively

For the selected node ID:

1. Call `get_node_info({ nodeId })`.
2. Call `export_node_as_image({ nodeId, format: "PNG", scale: 1 })` for the full-screen visual reference. A screen reference is intentionally raster.
3. Use `get_styles` only when local style identities are relevant.
4. Use `get_local_components` only when mapping instances to project components; it scans all pages and may be slow.
5. Use `get_annotations({ nodeId })` when implementation notes are expected.
6. Use `scan_nodes_by_types` for a bounded asset inventory, especially `VECTOR`, `BOOLEAN_OPERATION`, `LINE`, `ELLIPSE`, `POLYGON`, and `STAR` nodes.
7. Classify each needed asset before export:
   - small icon, mark, logo, or vector-like node → `export_node_as_image({ nodeId: assetNodeId, format: "SVG", scale: 1 })`;
   - intrinsic bitmap, photo, texture, or large raster background → `export_node_as_image({ nodeId: assetNodeId, format: "PNG", scale: 1 })`;
   - ambiguous asset → inspect its node type, bounds, screenshot, and project assets first; do not default an icon to PNG.
8. Use `get_nodes_info` only for a small set of identified comparison/state nodes.

Do not call `read_my_design` on a broad or multi-node selection: it recursively exports every selected subtree and can exceed the model context or bridge timeout.

Save any durable screenshot or analysis output under `.temp/`; do not commit temporary artifacts unless requested.

### 4. Build an evidence ledger

Before implementation, record:

| Concern | Strong evidence | Caveat |
|---|---|---|
| target | selected node ID/name/type | selection can change while working |
| geometry | `absoluteBoundingBox` plus screenshot | convert absolute child bounds relative to parent |
| hierarchy/text | filtered node tree | Vector children are removed from detailed node output; scan them separately by type |
| colors/type | fills, strokes, basic text style, local styles | variable bindings and many advanced fields are removed |
| assets | full-screen PNG, per-icon SVG requests, returned MIME types, scanned node IDs | some plugin versions return PNG even when SVG is requested; that PNG is reference-only for icons |
| behavior | explicit reactions or demonstrated state | heuristics and visible affordances are not business logic |
| responsive behavior | multiple explicit viewport frames/project conventions | current node response omits much Auto Layout metadata |

Maintain a short decision log for assumptions. Ask a focused question instead of turning uncertain evidence into navigation, API calls, destructive actions, or unseen content.

### 5. Interpret current bridge output correctly

The bundled local plugin uses `JSON_REST_V1` internally and filters it before returning it through the local bridge. Expect mainly:

- `id`, `name`, `type`;
- fills and strokes;
- corner radius;
- `absoluteBoundingBox`;
- text characters and a limited text style;
- recursively filtered children.

Do not assume omitted fields are defaults. In particular:

- Vector nodes are currently removed from `get_node_info` output.
- Fill `imageRef` and `boundVariables` are removed.
- Auto Layout details, constraints, opacity, effects, masks, component properties, and full interactions may be absent.
- `get_document_info` describes only the current page in the current implementation, even though its response contains a `pages` array.
- `get_node_info` can return a large recursive subtree and has no depth argument.

Use the screenshot and project primitives to close these gaps. If exact structure or assets remain unavailable, report the limitation rather than claiming pixel-perfect fidelity.

### 6. Handle interactions safely

Use native HTML and the project's router/state primitives. Implement only behavior supported by explicit Figma evidence, demonstrated states, or existing project requirements.

The bundled plugin's `get_reactions` implementation is read-only: it scans the requested subtrees without highlighting nodes or creating connectors. Use the returned reactions only as evidence for the web implementation. The bundled bridge and plugin do not expose mutation tools such as `create_*`, `set_*`, `move_node`, `resize_node`, `delete_*`, `clone_node`, `rename_node`, or `set_parent`.

### 7. Reconstruct layout and components

- Derive element offsets from `absoluteBoundingBox` relative to the selected root or nearest known parent.
- Use the screenshot to determine overlap, mask behavior, clipping, stacking, and visual grouping.
- Use normal flow, flex, and grid for maintainable structure; use absolute positioning only where the rendered composition requires it.
- Preserve fixed dimensions for icons/art and fluid behavior for content regions according to project conventions.
- Verify actual font files and weights before compensating with spacing changes.
- Map repeated structures to one data-driven component.
- Prefer existing project components and tokens when their rendered contract matches.

### 8. Handle assets

Apply this format policy in order:

1. **Small icons and vector artwork:** request `SVG` first, including icons, logos, marks, line art, and compact decorative vectors. Keep `scale: 1`; SVG is resolution-independent.
2. **Existing project assets:** if the plugin cannot provide SVG, use an exact existing project SVG only after visual comparison confirms the match.
3. **Raster content:** request `PNG` for photographs, bitmap/image-fill nodes, textured artwork, large raster backgrounds, and full-screen comparison references.
4. **Unknown content:** inspect node type and visual evidence before choosing. Size alone is not sufficient: a large vector illustration may still belong in SVG, while a tiny photo remains PNG.

Always verify the returned MIME type and, when exposed, the export warning. The bundled plugin exports SVG directly through `node.exportAsync({ format: "SVG" })`, and the bridge independently sniffs the returned payload. For SVGs up to 512 KiB, use the exact SVG source returned alongside the image attachment; do not redraw it. If an SVG request unexpectedly returns `image/png`:

- keep that PNG only as a visual reference;
- do not save, rename, embed, or ship it as the icon implementation;
- look for an exact project SVG;
- otherwise report the node ID and request a direct SVG export from Figma.

Use `scan_nodes_by_types` to locate omitted vector-like nodes by ID. If the bridge warns that an SVG contains an embedded raster `<image>`, do not use it for an icon that must be purely vector. Do not auto-trace a raster image, reconstruct paths from a screenshot, inline a screenshot as a data URI, or substitute an unrelated icon. Optimize obtained SVGs only if the target repository already has an SVG optimization convention and the rendered result remains exact.

### 9. Implement and validate incrementally

For each major section:

1. implement structure and behavior in the target repository;
2. render at the selected Figma frame's exact width and height;
3. compare with the exported Figma PNG;
4. fix font/assets, outer geometry, layout, spacing, typography, decoration, then micro-alignment—in that order;
5. exercise every implemented interaction and evidenced state.

Also test one narrower and one wider viewport unless the target is intentionally fixed-format, such as print/A4 output.

### 10. Completion contract

Run all project validation commands. Report:

- the user-confirmed Figma document when known, returned page, selected node ID, and viewport used;
- MCP calls made and whether any had side effects;
- implemented components and interactions;
- screenshot comparison viewports;
- exported assets with node ID, requested format, returned MIME type, and final project path;
- unresolved vector assets, omitted bridge data, and remaining assumptions.

Do not claim 1:1 or pixel-perfect fidelity unless an actual rendered screenshot was compared against the Figma export at the same viewport.
