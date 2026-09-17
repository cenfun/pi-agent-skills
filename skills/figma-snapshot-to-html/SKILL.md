---
name: figma-snapshot-to-html
description: Extracts screens, design tokens, layout, typography, reusable patterns, and asset references from plugin-exported .temp/figma-snapshot.json files, then implements faithful HTML/CSS or framework pages in an existing web project. Use when converting a local Figma snapshot JSON to HTML/CSS, Vue, React, or another web UI without relying on the Figma MCP design-context tool.
compatibility: Requires Node.js. Designed for Figma to AI JSON snapshots containing _meta, tokens, and tree.
---

# Figma Snapshot to HTML/CSS

Convert a local plugin export (normally `.temp/figma-snapshot.json`) into production code in the target project's existing stack. The snapshot is the primary design source; do not require a live Figma MCP connection.

This workflow adapts the useful design-to-code principles from the local Figma skills: inspect before coding, treat generated structure as reference rather than paste-ready code, reuse the project's components/tokens, preserve assets, componentize repeated UI, and validate visually.

## Hard rules

1. **Read project instructions and inspect the existing app first.** Identify framework, routes, styling conventions, shared components, tokens, fonts, assets, and validation commands.
2. **Do not read or print the entire snapshot into model context.** It may contain thousands of nodes. Use `scripts/inspect-snapshot.mjs` to progressively disclose only the relevant subtree.
3. **Select a concrete screen frame before coding.** A board/group frame may contain labels and many phone mockups. Never implement the whole Figma canvas when the requested deliverable is one screen.
4. **Treat snapshot structure as design evidence, not final DOM.** Adapt it to semantic HTML, the project's framework, responsive behavior, and existing component system.
5. **Reuse existing components and design tokens.** Do not create duplicate buttons, cards, sliders, headers, icons, or CSS variables when suitable project equivalents exist.
6. **Do not invent missing image/vector content.** A snapshot vector may contain dimensions but no path data. Use a clearly matching existing project asset, export the referenced Figma node through an available asset workflow, or report the missing asset. Never hand-draw an approximate SVG and present it as faithful.
7. **Do not convert or generate ARIA labeling attributes.** Ignore any snapshot, plugin, semantic, accessibility, layer-name, note, or text metadata that could map to `aria-label`, `aria-labelledby`, `aria-describedby`, or related ARIA labeling attributes. Do not add these attributes to generated markup as part of this workflow.
8. **Preserve temporary outputs under the project's `.temp/` directory.**
9. **Finish by running all project-required build, lint, stylelint, and filename checks.**

## Locate the helper

Resolve this skill's directory from the loaded `SKILL.md`, then run:

```bash
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json summary
```

All commands accept the snapshot as the first argument:

```bash
node <skill-dir>/scripts/inspect-snapshot.mjs <snapshot> summary
node <skill-dir>/scripts/inspect-snapshot.mjs <snapshot> outline --depth 3 --max 160
node <skill-dir>/scripts/inspect-snapshot.mjs <snapshot> screens --width 375 --height 812
node <skill-dir>/scripts/inspect-snapshot.mjs <snapshot> search "资产全览" --type frame --max 40
node <skill-dir>/scripts/inspect-snapshot.mjs <snapshot> get tree/ch/4/ch/7 --depth 4
node <skill-dir>/scripts/inspect-snapshot.mjs <snapshot> get tree/ch/4/ch/7 --out .temp/figma-screen.json
node <skill-dir>/scripts/inspect-snapshot.mjs <snapshot> assets --max 100
node <skill-dir>/scripts/inspect-snapshot.mjs <snapshot> css-vars
```

Paths returned by `outline`, `screens`, and `search` are stable child-index paths such as `tree/ch/4/ch/7` and can be passed to `get`.

## Required workflow

### 1. Understand the request and project

- Determine which route/page/state is requested and the target viewport.
- Inspect nearby source files and shared UI before creating anything.
- Search for the product font in CSS, theme files, and component styles. Do not default to Inter when the snapshot or project specifies another family.
- Record the project's normal validation commands.

### 2. Index the snapshot progressively

Run `summary`, then `outline`. The export commonly has:

- `tokens`: deduplicated colors, fonts, and shadows.
- `tree`: the root Figma canvas.
- board frames: large containers grouping related screens.
- screen frames: often repeated viewport-sized frames (for example 375×812) representing states or variants.

Use `screens` and `search` to find candidates. If names repeat, compare each candidate's parent path, child count, text, component names, and state-specific content. Extract only the chosen screen with `get --out .temp/...`.

Read [references/snapshot-schema.md](references/snapshot-schema.md) when interpreting compact keys.

### 3. Build a design inventory before implementation

From the selected subtree, list:

- hierarchy and major sections;
- exact viewport and content dimensions;
- layout direction, gap, padding, alignment, overflow, and positioning;
- typography and text content;
- colors, borders, radii, shadows, and opacity;
- instances and repeated structures;
- images, vectors, and asset references;
- semantic roles, patterns, responsive hints, and interactions, excluding any ARIA labeling metadata.

Resolve `$cN`, `$fN`, and `$sN` through `tokens`; `css-vars` can generate a starting token block. Prefer meaningful existing project variables over introducing raw generated names.

### 4. Map the design to web layout

Use semantic markup and normal flow first. Semantic element selection must not generate or infer `aria-label` or related ARIA labeling attributes:

- `l: "row" | "col"` → flex row/column.
- `g`, `p`, `j`, and `al` → gap, padding, justify-content, align-items.
- `w: "fill"` / `h: "fill"` → fill available space; `"hug"` → intrinsic size.
- numeric dimensions are CSS pixels at the design viewport.
- `ps: "abs"` with `x`/`y` is genuine absolute positioning evidence.
- `of` controls overflow; do not discard clipping or scrolling behavior.

Do not mechanically assign fixed width/height to every node. Preserve fixed dimensions for icons, artwork, and true fixed controls, but use flow/flex/grid for content and containers. Scale or constrain mobile screens using the project's established responsive strategy rather than globally shrinking the page.

For text, preserve family, size, weight, line-height, letter-spacing, alignment, and wrapping. Check Chinese font fallback and verify the font files/loading already used by the product.

### 5. Reuse and componentize

Apply hints in this order:

1. existing project component that visibly and behaviorally matches;
2. existing project token or shared style;
3. snapshot `instance`, `componentName`, semantic role, and pattern metadata;
4. raw visual properties.

Repeated rows/cards/navigation items or source-level reusable concepts should be one component rendered from data, not duplicated markup. Keep page-specific composition in the page and generic behavior in shared components, matching project conventions.

### 6. Handle assets faithfully

Run `assets` for image/vector inventory.

- `img.nId` is a Figma node ID that may support later export; `oS`, `ft`, and `alt` describe rendering.
- Some plugin exports omit `imageRef`; absence of a hash does not authorize approximation.
- Vector records may not include SVG path data. Search project assets/components for a clear glyph match. A matching glyph matters more than a similar filename.
- Explicitly set both width and height for icons/images and preserve object-fit/crop behavior.
- Use snapshot/provided artwork as files rather than recreating complex imagery in CSS.

If required artwork is unavailable, implement the surrounding layout, clearly identify the unresolved nodes/paths, and ask for exports or screenshots instead of silently replacing them.

### 7. Implement incrementally

Build one major section at a time. After each section:

- verify DOM/layout structure;
- check text wrapping and overflow;
- check repeated elements are data-driven/components;
- compare dimensions and tokens against the selected snapshot subtree.

Avoid unrelated refactors.

### 8. Validate

- Run the app at the target viewport.
- Capture a screenshot if browser tooling is available and compare against a Figma screenshot/reference. The JSON describes structure but is not itself a visual oracle.
- Check at least: spacing, type metrics, clipping, scroll behavior, backgrounds, borders, shadows, icons/images, repeated item count, and interaction states.
- Also test one narrower and one wider viewport unless the route is intentionally fixed-canvas.
- Run every validation required by project instructions (build, ESLint, stylelint, filename checks, tests).

## Ambiguity and limitations

Ask a focused question when multiple same-named screen states remain indistinguishable. Do not guess which state the user wants.

A snapshot can encode geometry and styles without screenshots or vector/image bytes. State this limitation precisely when it blocks pixel fidelity; do not treat missing binary artwork as a reason to discard reliable layout/text/token data.
