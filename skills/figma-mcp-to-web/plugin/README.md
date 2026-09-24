# Figma MCP to Web Plugin

This bundled development plugin implements only the read commands used by this skill and exports SVG directly through the Figma Plugin API.

## One-time import in Figma Desktop

1. Open **Plugins → Development → Import plugin from manifest…**.
2. Select this directory's `manifest.json`.

## Use in each session

1. Call `bridge_status` from Pi to start the skill's lazy bundled bridge.
2. Run **Figma MCP to Web Plugin** from **Plugins → Development**.
3. Wait for the automatic connection to show `Connected to server in channel: …`.
4. Confirm that Pi's next `bridge_status` result has `ready: true` before using read tools.

The plugin may also be opened before the bridge starts. It retries automatically with exponential backoff, capped at five seconds, and reconnects after bridge restarts. **Disconnect** pauses automatic retries so the port can be changed; **Connect** resumes them.

Do not run another Figma MCP plugin against the same bridge at the same time. Multiple plugin connections require explicit channel selection and can make it easy to target the wrong Figma file.

## Supported commands

- `get_document_info`
- `get_selection`
- `read_my_design`
- `get_node_info`
- `get_nodes_info`
- `scan_nodes_by_types`
- `scan_text_nodes`
- `get_styles`
- `get_local_components`
- `get_annotations`
- `get_reactions` (read-only; no highlighting)
- `export_node_as_image`

`export_node_as_image` requires an explicit `format`. SVG and PDF exports do not receive raster scale constraints. PNG and JPG honor `scale`.

## Security and privacy

The manifest permits only the localhost bridge URL. This plugin has no analytics or remote telemetry. All commands are read-only and unknown commands are rejected.
