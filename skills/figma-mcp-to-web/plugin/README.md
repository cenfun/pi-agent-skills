# Figma MCP to Web Plugin

This bundled development plugin implements only the read commands used by this skill and exports SVG directly through the Figma Plugin API.

## Install in Figma Desktop

1. Start the skill's bundled bridge by calling `bridge_status` from Pi.
2. In Figma Desktop, open **Plugins → Development → Import plugin from manifest…**.
3. Select this directory's `manifest.json`.
4. Run **Figma MCP to Web Plugin** from **Plugins → Development**.
5. Click **Connect** and wait for `Connected to server in channel: …`.

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
