---
name: figma-mcp-to-web
description: Implements high-fidelity, responsive, interactive web UI from the currently open Figma Desktop document through the Talk to Figma MCP plugin and channel. Use for Figma-to-HTML/CSS, React, Vue, Svelte, or another existing web stack without the Figma REST API or snapshot JSON exports.
compatibility: Requires Node.js, Figma Desktop, the Talk to Figma MCP Plugin, and this skill's bundled local MCP/WebSocket bridge configured in Pi.
---

# Figma MCP to Web UI

Implement production UI from the live Figma Desktop document through Talk to Figma MCP. Work read-only in Figma: inspect the selected design, export visual references, then modify only the target code repository.

This workflow accepts only live Talk to Figma data through the bundled Node.js MCP/WebSocket bridge. It does not accept local JSON exports or use the Figma REST API.

## Non-negotiable rules

1. **Inspect the target app before coding.** Read repository instructions and identify its framework, routes, styling, tokens, fonts, shared components, assets, state patterns, and validation commands.
2. **Verify the live bridge first.** The bundled process combines the MCP server and WebSocket relay, while the Figma plugin remains a separate peer. A connected plugin alone does not prove that the current agent can call its MCP tools.
3. **Use read-only Figma operations.** Do not create, delete, rename, move, resize, restyle, annotate, reparent, or select nodes unless the user explicitly asks to modify Figma.
4. **Require one exact target screen/state.** Ask the user to select the smallest complete target frame in Figma. Do not retrieve a whole page when a screen selection is sufficient.
5. **Avoid oversized tool responses.** Start with document and selection summaries. Call `get_node_info` for one selected node; use small batches only when comparison is necessary.
6. **Treat MCP node data as incomplete evidence, not final DOM.** The Community plugin filters the Figma export before sending it through the bridge and omits several layout, vector, image-reference, variable-binding, and interaction fields.
7. **Use a rendered Figma image as the visual source of truth.** Node JSON supplies hierarchy, text, colors, and bounds; the screenshot resolves composition, clipping, fonts, masks, vectors, and effects omitted by the bridge.
8. **Reuse before creating.** Priority: matching project component → project token/style → Figma component/style evidence → new page-local implementation.
9. **Do not invent missing behavior or artwork.** Use exact project assets when visually verified. Otherwise report the unresolved node instead of drawing an approximate SVG or substituting an unrelated icon.
10. **Do not convert or generate ARIA labeling attributes.** Ignore metadata that could map to `aria-label`, `aria-labelledby`, `aria-describedby`, or related ARIA labeling attributes. Prefer native controls and visible labels without adding ARIA labeling attributes in this workflow.
11. Keep temporary screenshots and analysis artifacts under the target project's `.temp/` directory.
12. Run every repository-required build, typecheck, lint, stylelint, filename, and test command before completion.

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

Read [references/talk-to-figma-mcp.md](references/talk-to-figma-mcp.md) before using these tools. Read [references/fidelity-and-interactions.md](references/fidelity-and-interactions.md) before implementation and visual QA.

If the required MCP tools are unavailable, stop and report that the bundled bridge must be installed, configured in Pi, and reloaded. Do not fall back to a snapshot file.

## Bundled bridge setup

Resolve this skill's directory from the loaded `SKILL.md`. Install the bridge once with:

```bash
cd <skill-dir>/bridge
npm ci --ignore-scripts
```

Configure `pi-mcp-adapter` once as shown in [bridge/README.md](bridge/README.md), using an absolute path to `<skill-dir>/bridge/server.mjs` and `lifecycle: "keep-alive"`. Pi will then start the combined stdio MCP server and `ws://localhost:3055` relay automatically at session startup. Do not run `cursor-talk-to-figma-socket` or `cursor-talk-to-figma-mcp` alongside it.

A Skill cannot launch a Figma Community plugin inside Figma Desktop. The user must open **Talk To Figma MCP Plugin** once and click **Connect** if it was opened before the bridge became available.

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
3. If `ready` is `false` and no channel is connected, stop and tell the user: **Open Talk To Figma MCP Plugin in Figma Desktop, click “Connect”, and wait until the plugin shows “Connected to server in channel: …”.** Ask the user to confirm after that message appears, then call `bridge_status` again. Do not poll repeatedly or continue to Figma reads before the connection is confirmed.
4. If multiple channels are connected, call `list_channels`, ask the user which Figma file/plugin to use, then call `join_channel` with that exact channel. Never guess or persist a channel value in source control.
5. Continue only when `bridge_status.ready` is `true` and `connectionMessage` reports `Connected to server in channel: <channel>`.
6. Call `get_document_info` and confirm the returned current page matches the user's intended page. The Community plugin does not return the Figma file name, so confirm file identity with the user when it is ambiguous.
7. Call `get_selection` and verify that exactly the intended screen or component is selected.

If the plugin is not connected, nothing is selected, multiple unrelated nodes are selected, or the document does not match, stop and ask the user to complete the required action. Do not compensate by scanning and guessing across the entire page.

### 3. Acquire the target progressively

For the selected node ID:

1. Call `get_node_info({ nodeId })`.
2. Call `export_node_as_image({ nodeId, format: "PNG", scale: 1 })` for a visual reference.
3. Use `get_styles` only when local style identities are relevant.
4. Use `get_local_components` only when mapping instances to project components; it scans all pages and may be slow.
5. Use `get_annotations({ nodeId })` when implementation notes are expected.
6. Use `scan_nodes_by_types` for a bounded asset inventory, especially `VECTOR`, `BOOLEAN_OPERATION`, `LINE`, `ELLIPSE`, `POLYGON`, and `STAR` nodes.
7. Use `get_nodes_info` only for a small set of identified comparison/state nodes.

Do not call `read_my_design` on a broad or multi-node selection: it recursively exports every selected subtree and can exceed the model context or bridge timeout.

Save any durable screenshot or analysis output under `.temp/`; do not commit temporary artifacts unless requested.

### 4. Build an evidence ledger

Before implementation, record:

| Concern | Strong evidence | Caveat |
|---|---|---|
| target | selected node ID/name/type | selection can change while working |
| geometry | `absoluteBoundingBox` plus screenshot | convert absolute child bounds relative to parent |
| hierarchy/text | filtered node tree | Vector children are removed by the Community plugin |
| colors/type | fills, strokes, basic text style, local styles | variable bindings and many advanced fields are removed |
| assets | rendered PNG plus scanned node IDs | current exporter may return PNG even when SVG is requested |
| behavior | explicit reactions or demonstrated state | heuristics and visible affordances are not business logic |
| responsive behavior | multiple explicit viewport frames/project conventions | current node response omits much Auto Layout metadata |

Maintain a short decision log for assumptions. Ask a focused question instead of turning uncertain evidence into navigation, API calls, destructive actions, or unseen content.

### 5. Interpret current bridge output correctly

The current Talk to Figma Community plugin uses `JSON_REST_V1` internally and filters it before returning it through the local bridge. Expect mainly:

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

`get_reactions` is not strictly read-only in the current plugin: it temporarily changes matching nodes' strokes to highlight them, and its MCP response instructs the caller to create connector nodes. Therefore:

- do not call `get_reactions` without user approval;
- if approved, warn that temporary canvas highlighting occurs;
- never call `create_connections` as an automatic follow-up in this web-implementation workflow;
- use the returned reactions only as evidence for the web implementation.

Never use mutation tools such as `create_*`, `set_*`, `move_node`, `resize_node`, `delete_*`, `clone_node`, `rename_node`, or `set_parent` during this workflow.

### 7. Reconstruct layout and components

- Derive element offsets from `absoluteBoundingBox` relative to the selected root or nearest known parent.
- Use the screenshot to determine overlap, mask behavior, clipping, stacking, and visual grouping.
- Use normal flow, flex, and grid for maintainable structure; use absolute positioning only where the rendered composition requires it.
- Preserve fixed dimensions for icons/art and fluid behavior for content regions according to project conventions.
- Verify actual font files and weights before compensating with spacing changes.
- Map repeated structures to one data-driven component.
- Prefer existing project components and tokens when their rendered contract matches.

### 8. Handle assets

- Use `export_node_as_image` on the selected screen for visual grounding.
- Verify the returned MIME type. In the currently reviewed bridge implementation, the plugin forces PNG internally even when the MCP schema accepts JPG/SVG/PDF.
- Use `scan_nodes_by_types` to locate omitted vector-like nodes by ID.
- Prefer exact existing project SVG/image assets after visual comparison.
- Do not treat a rasterized screenshot as reusable semantic SVG.
- If an exact vector or image cannot be obtained through the installed bridge, report the node ID and request a direct Figma export rather than fabricating it.

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
- unresolved assets, omitted bridge data, and remaining assumptions.

Do not claim 1:1 or pixel-perfect fidelity unless an actual rendered screenshot was compared against the Figma export at the same viewport.
