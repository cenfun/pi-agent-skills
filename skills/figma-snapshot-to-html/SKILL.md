---
name: figma-snapshot-to-html
description: Converts plugin-exported .temp/figma-snapshot.json screens and component states into high-fidelity, responsive, interactive HTML/CSS or the existing React, Vue, Svelte, or other web stack. Use when implementing web UI from a local Figma snapshot without requiring Figma MCP.
compatibility: Requires Node.js. Designed for Figma-to-AI JSON v1.x snapshots containing _meta and tree; token maps may be empty.
---

# Figma Snapshot to HTML

Translate a local Figma snapshot (normally `.temp/figma-snapshot.json`) into production UI in the target repository. The snapshot is the structural source of truth; a source screenshot, when available, is the visual source of truth.

This skill intentionally covers only **Figma/snapshot → web code**: screen selection, design extraction, component/token mapping, assets, responsive layout, interaction reconstruction, and visual validation. It does not create or edit Figma files, generate design libraries, or configure Code Connect.

## Non-negotiable rules

1. **Inspect the target app before coding.** Read repository instructions and identify framework, routes, styling, tokens, fonts, shared components, state/data patterns, assets, and validation commands.
2. **Never dump a large snapshot into context.** Use `scripts/inspect-snapshot.mjs` and progressively inspect only the target screen and relevant states.
3. **Select an exact screen/state.** The plugin exports only its first selected visible node; that root may be one screen or a board containing many screens. Do not implement the whole board or silently choose among same-named candidates.
4. **Snapshot nodes are evidence, not paste-ready DOM.** Produce semantic, maintainable code in the project's conventions; do not mirror every Figma wrapper or absolutely position everything.
5. **Reuse before creating.** Priority: matching project component → project token/style → snapshot component/semantic hint → new page-local implementation.
6. **Match both appearance and behavior.** A clickable-looking control must have its evidenced behavior or be explicitly reported as unresolved; do not ship decorative dead controls.
7. **Do not invent product behavior or missing artwork.** Separate explicit snapshot evidence from reasonable web conventions and assumptions requiring confirmation.
8. **Do not install an icon/UI package merely to approximate supplied design assets.** Reuse a visibly matching project asset/component, use an exported asset, or report the missing node.
9. **Do not convert or generate ARIA labeling attributes.** Ignore metadata that could map to `aria-label`, `aria-labelledby`, `aria-describedby`, or related ARIA labeling attributes. Prefer native semantic elements and visible labels, but do not add ARIA labeling attributes in this workflow.
10. Keep generated inspection files under the target project's `.temp/` directory and avoid unrelated refactors.
11. Run all repository-required build, typecheck, lint, stylelint, filename, and test commands before completion.

## Snapshot inspector

Resolve this skill's directory from the loaded `SKILL.md`, then use:

```bash
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json summary
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json meta
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json outline --depth 3 --max 160
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json screens --width 375 --height 812
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json search "资产全览" --type frame --max 40
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json inventory tree/ch/4/ch/7
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json diagnostics tree/ch/4/ch/7
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json interactions tree/ch/4/ch/7
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json assets tree/ch/4/ch/7 --max 100
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json get tree/ch/4/ch/7 --depth 8 --with-tokens --out .temp/figma-screen.json
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json tokens tree/ch/4/ch/7
node <skill-dir>/scripts/inspect-snapshot.mjs .temp/figma-snapshot.json css-vars tree/ch/4/ch/7
```

`outline`, `screens`, and `search` return child-index paths such as `tree/ch/4/ch/7`; they remain valid for that unchanged snapshot, not across re-exports. Use `meta` to inspect the embedded contract without printing the tree. `get --with-tokens` includes only tokens referenced by the extracted subtree and reports unresolved references. `tokens` and `css-vars` are likewise subtree-scoped when given a path. Read the snapshot's `_meta`, then [references/snapshot-schema.md](references/snapshot-schema.md) for current exporter behavior and [references/fidelity-and-interactions.md](references/fidelity-and-interactions.md) for reconstruction and QA rules.

## Required workflow

### 1. Establish implementation context

Before reading detailed design data:

- confirm the snapshot version and inspect `_meta`; prefer its contract if it differs from this skill;
- identify the requested route, screen, state, viewport, framework, and expected interaction scope;
- inspect neighboring pages and existing components rather than starting from an empty abstraction;
- locate color/type/spacing/radius/shadow tokens and actual font loading;
- locate existing image/icon assets and project-approved libraries;
- identify routing, state management, form, modal, tabs, carousel, animation, and data-fetch conventions;
- record the commands that define completion.

Do not replace the project's architecture with generated React/Tailwind-style output. Adapt to what is present.

### 2. Locate the exact screen and related states

Run `summary` → `outline` → `screens`/`search`. For ambiguous candidates compare:

- ancestor/board name and viewport dimensions;
- child count, visible text, component names, and variant props;
- state-specific content such as selected tab, open modal, error text, or changed button label;
- nearby sibling frames that may represent hover, expanded, loading, empty, success, or error states.

Remember that the current exporter removes hidden nodes and defaults to a maximum parse depth. Missing children do not prove that hidden/omitted states do not exist. If the necessary state is outside the selected root, request a broader or separate export.

If multiple candidates remain materially different, ask one focused question. Otherwise state which path you selected and why.

Extract the target with `get --with-tokens`. Also extract sibling state frames only when present and needed; do not pull the entire board.

### 3. Create an evidence-based design inventory

Run `inventory`, `diagnostics`, `interactions`, and `assets` on the selected path. Treat diagnostic findings as risks to investigate, not unconditional blockers. Before implementation, capture:

- **geometry:** viewport, section order, content bounds, layout direction, wrapping, gap, padding, alignment, constraints, overflow, and true absolute layers;
- **visual tokens:** backgrounds, text colors, borders, radii, opacity, shadows, blur, and blend mode;
- **type:** exact content, family, size, weight, line-height, letter-spacing, alignment, decoration, and wrapping/truncation;
- **reuse:** instances, component names, variants, repeated rows/cards, and project equivalents;
- **assets:** images, vectors, image node IDs, fit/crop, displayed dimensions, and unresolved bytes;
- **behavior:** prototype reactions, heuristic roles/patterns/states, variants, and sibling state frames;
- **responsive evidence:** fill/hug/fixed sizing, min/max dimensions, constraints, wrapping, clipping, and repeated desktop/mobile frames.

Resolve `$cN`, `$fN`, and `$sN` through the included tokens. Token maps can legitimately be empty when extraction was disabled. Map values to an existing project token when the computed value and purpose match; do not map by similar name alone.

Treat `sm`, `pi`, and `rs.breakpoint` as heuristics produced from layer names and geometry, not authored requirements. Also account for exporter lossiness: text/image nodes omit many common geometry/style fields, ordinary node IDs are not retained, and image `oS` is currently the displayed node box rather than decoded bitmap intrinsic dimensions.

Maintain a short decision ledger for ambiguity:

| Item | Evidence | Decision | Confidence |
|---|---|---|---|
| target frame | path/name/size | selected state | high |
| card click | `ia` action or sibling frame | route/state change | high/medium |
| mobile layout | constraints or mobile frame | breakpoint behavior | high/medium |
| missing icon | vector without path | unresolved asset | high |

Never silently turn low-confidence guesses into product behavior.

### 4. Reconstruct layout from intent

Map snapshot layout to web primitives:

- `l: row|col` → flex row/column;
- `g`, `p`, `j`, `al`, `wr` → gap, padding, justification, alignment, wrapping;
- `w/h: fill` → available space; `hug` → intrinsic/content size; current exports commonly use rounded numeric sizes plus `rs.fluid`/`rs.grow` instead of `fill`;
- `minW/maxW/minH/maxH` and `cn` → CSS constraints and responsive anchoring when present (the current exporter emits `cn` but not min/max keys);
- numeric dimensions → design pixels at that frame's viewport, often rounded by the exporter;
- `ps: abs` plus `x/y` → absolute positioning only where layering is intentional;
- `of` → clipping, visible overflow, or scrolling; preserve it deliberately.

Use normal flow, flex, and grid for structural layout. Reserve absolute positioning for overlays, badges, floating artwork, and other explicitly absolute nodes. Do not assign fixed width/height to every layer. Preserve fixed geometry for icons, controls, and art; let text/content containers size naturally unless the design proves clipping.

For responsive behavior, derive rules from constraints and multiple frames rather than scaling the whole page. Establish container max-width, fluid/fixed columns, wrap/collapse behavior, edge padding, and overflow per region. Test one narrower and one wider viewport in addition to the design viewport.

Typography is geometry: exact font availability, weight mapping, line-height, letter-spacing, and wrap width often explain major pixel drift. Verify Chinese/CJK fallback and do not default to Inter.

### 5. Map and componentize before styling details

For each visible building block, choose in this order:

1. an existing project component with matching visual contract and behavior;
2. an existing component extended through its supported variants/slots;
3. a local reusable component for repeated or stateful UI;
4. page-only semantic markup for genuinely unique composition.

Compare candidates by purpose, props, hierarchy, states, and rendered appearance—not filename alone. Repeated structures must be data-driven. Keep route composition in the page, generic behavior in shared components, and avoid premature global abstractions.

Use the project's tokens when they reproduce the design. If the snapshot has a genuinely missing value, prefer a narrowly scoped variable or style over scattering literals; do not alter global tokens just to force one page to match.

### 6. Reconstruct static designs into working interactions

Treat interaction evidence in this order:

1. explicit `ia` trigger/action/destination-name data;
2. sibling frames or variants showing before/after states;
3. `variantProps`, `sm.state`, `pi.pattern`, and component identity (all except `variantProps` may be heuristic);
4. visible affordances plus established project convention;
5. assumption—confirm or report rather than inventing domain behavior.

Build a behavior matrix before coding any non-trivial interaction:

| Element | Initial state | Trigger | Transition/action | Result/target | Evidence |
|---|---|---|---|---|---|

Then implement with the project's existing router and state primitives:

- links/navigation change route or URL instead of using inert click handlers;
- tabs/segmented controls maintain one selected value and switch the matching panel;
- accordions, dropdowns, drawers, and modals have explicit open/closed state and deterministic close behavior;
- forms use labels visible in the design, preserve values, validate at the appropriate time, and expose evidenced error/success/loading states;
- carousels/pagers update active item, controls, indicators, and overflow consistently;
- hover/focus/pressed/selected/disabled/loading states use CSS state selectors for transient visuals and application state for persistent transitions;
- animations express the demonstrated transition, honor project motion tokens, and avoid decorative motion not evidenced by the design.

Use native `button`, `a`, `input`, `select`, and other semantic controls where applicable. Preserve keyboard behavior available from native controls and the project's existing primitives, while honoring the rule not to generate ARIA labeling attributes.

If only one static frame exists, implement safe platform behavior (for example button activation and text input) but do not invent destinations, API effects, destructive actions, hidden panels, or business rules. Report unresolved actions.

### 7. Handle assets without approximation

- Preserve the image's displayed box, `object-fit`, crop rectangle, clipping, radius, and opacity when evidenced. Do not treat `oS` as intrinsic bitmap size in current exports.
- Prefer an exact existing project asset or component; verify visually, not just by name.
- Use provided/exported raster or SVG files for complex artwork rather than rebuilding them with CSS.
- A vector record without path data cannot be faithfully reconstructed from name, size, and color alone.
- Explicitly size icons/images to prevent layout shift and accidental intrinsic sizing.
- Do not commit placeholder URLs or use emoji/unrelated glyphs as stand-ins.

When required bytes are absent, finish unaffected structure, list exact unresolved node paths/IDs, and request the needed export or screenshot.

### 8. Implement and validate incrementally

Implement one major section or behavior at a time. After each unit:

1. render at the exact design viewport;
2. verify hierarchy, computed bounds, overflow, and text wrapping;
3. exercise the interaction and every evidenced state;
4. compare against the source screenshot/state frame if available;
5. fix the current unit before building on it.

Prefer targeted fixes over page-wide rewrites. Validate both visuals and behavior; a visually accurate default state with broken transitions is incomplete.

### 9. Perform final QA

At minimum verify:

- section dimensions, alignment, spacing, clipping, scroll containers, and layering;
- font loading, text metrics, wrapping, truncation, and CJK fallback;
- exact fills, borders, radii, shadows, opacity, images, icons, and crops;
- repeated item count/content/order and correct component variants;
- default, hover, focus, pressed, selected, disabled, loading, empty, success, and error states that are evidenced or required by existing components;
- navigation targets, modal/dropdown dismissal, form state, keyboard-native behavior, and reduced-motion compatibility where the project supports it;
- design viewport plus one narrower and one wider viewport;
- no console errors, broken assets, dead controls, placeholder content, or unrelated regressions.

Use side-by-side comparison first; use a semi-transparent overlay or pixel diff when screenshot tooling exists. Diagnose discrepancies in this order: font/assets → outer geometry → layout mode/constraints → spacing → typography → decoration → micro-alignment. Do not polish shadows while the font or container width is wrong.

Finally run all repository validation commands and summarize implemented paths, interaction decisions, validation performed, and any unresolved fidelity blockers.

## Completion contract

Do not claim pixel-perfect or 1:1 fidelity unless an actual rendered screenshot was compared at the same viewport. If no source screenshot or asset bytes exist, say that structural/style fidelity was implemented from snapshot data and precisely list what could not be visually verified.
