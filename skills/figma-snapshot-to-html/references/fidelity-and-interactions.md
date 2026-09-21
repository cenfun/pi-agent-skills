# Fidelity and interaction playbook

Use this reference after selecting a concrete screen subtree. It focuses on the failure modes that most affect Figma-to-web accuracy and on turning static state frames into maintainable behavior.

## 1. Fidelity hierarchy

Fix discrepancies from high impact to low impact:

1. **Source correctness** — right frame, state, viewport, text, and assets.
2. **Fonts and assets** — a fallback font or substitute icon invalidates downstream measurements.
3. **Outer geometry** — viewport, page shell, content width, section heights, and scroll boundaries.
4. **Layout model** — row/column/grid, fill/hug/fixed behavior, wrapping, alignment, and absolute layers.
5. **Spacing and text metrics** — padding, gap, line-height, letter-spacing, and wrap width.
6. **Decoration** — fills, borders, radii, shadows, blur, opacity.
7. **Micro-alignment** — one-pixel offsets and optical adjustments.

Do not compensate for a wrong font by changing container dimensions. Correct the root cause and compare again.

## 2. Measurement rules

- Measure parent content boxes before children.
- Distinguish outer size from content size: borders and padding affect CSS box dimensions.
- Determine whether `gap`, margins, or parent padding creates each space; do not combine them accidentally.
- Treat repeated equal spacing as a likely token, but resolve it against project tokens by value and purpose.
- Preserve fractional values when the snapshot provides them, but recognize that the current exporter already rounds container dimensions and absolute offsets; do not imply unavailable subpixel precision.
- Check browser default styles on headings, paragraphs, buttons, inputs, and images. Reset locally or use project primitives.
- For transformed/rotated elements, compare the untransformed layout box and visual bounding box separately.
- Check z-order and clipping together; a correctly positioned child can still disappear under the wrong overflow ancestor.

## 3. Figma sizing to CSS

| Snapshot evidence | Likely web implementation | Verify |
|---|---|---|
| `fill` in auto layout | flex growth or width/height 100% | sibling competition and min-width |
| `hug` | intrinsic/fit-content/auto | wrapping and max constraints |
| fixed numeric size | fixed design size | whether parent later scales/collapses |
| row/column with gap | flex or grid | wrap, alignment, equal columns |
| absolute x/y | positioned child in a positioned ancestor | anchor edge, z-index, clipping |
| min/max dimensions (future/external exports) | CSS min/max constraints | current upstream exporter does not emit these keys |
| clipped overflow | hidden/clip/scroll as evidenced | focus rings, menus, scrollbars |
| repeated tracks | CSS grid or data-driven flex | column count and responsive collapse |

Figma `fill` does not always mean `width: 100%`; in a flex row it often means `flex: 1 1 0` plus `min-width: 0`. Likewise, `hug` should not become a fixed measurement merely because the exported frame has a measured width.

## 4. Typography checks

For every distinct text style verify:

- loaded font family and real available weight;
- browser weight mapping (a missing 500 may synthesize or fall back);
- font size, line-height unit/value, and letter-spacing;
- text transform and decoration;
- explicit/implicit width and resulting line breaks;
- paragraph spacing and mixed-style ranges;
- CJK punctuation, fallback fonts, and baseline differences;
- ellipsis line count and overflow conditions.

When source and render wrap differently, check font loading first, then text container width, padding, letter-spacing, and line-height—in that order.

## 5. Responsive reconstruction

Classify each region independently:

- **fixed:** icon, avatar, control height, art crop;
- **fluid:** main content, search field, card width;
- **bounded:** centered container with min/max width;
- **wrapping:** chips, toolbar actions, cards;
- **collapsing:** columns become stack, desktop nav becomes compact control;
- **scrolling:** table, tab strip, carousel, long modal body;
- **conditional:** content exists only in a specific breakpoint/state.

Use explicit desktop/mobile sibling frames as stronger evidence than inferred constraints. If only one frame exists, make the smallest robust interpretation: keep the design exact at its viewport, prevent overflow, and follow existing project breakpoints. Do not invent a dramatically different mobile information architecture.

## 6. Interaction reconstruction

### Evidence levels

- **A — explicit:** prototype `ia` describes trigger/action and possibly a destination name or URL; the current exporter does not retain destination node IDs.
- **B — demonstrated:** sibling frame or variant shows the result.
- **C — heuristic:** component identity plus `sm`/`pi` metadata suggests tabs, modal, input, carousel, link, etc.; current `sm`/`pi` values are inferred from names/geometry and require corroboration.
- **D — conventional:** visible affordance and project behavior imply a safe interaction.
- **Unknown:** business result, route, network mutation, destructive effect, or hidden content is absent.

Implement A/B. Implement C using the existing component contract. Use D only for platform-safe behavior. Ask or report Unknown behavior.

### State model

For each stateful unit, record:

```text
state: selectedTab | menuOpen | modalOpen | fieldValue | validation | pageIndex
initial: value evidenced by selected/default frame
trigger: click | input | submit | key | route
transition: previous -> next
visual delta: layers/text/styles added, removed, or changed
side effect: navigation/API/storage (only with evidence/project requirement)
```

Compare state frames structurally rather than rebuilding each as separate markup. Stable nodes form the component; changed nodes become state-dependent props/content/styles.

### Common mappings

- **Button:** transient hover/focus/pressed styles; persistent loading/disabled state only when evidenced or already in component API.
- **Tabs:** one selected key; tab activation changes panel and selected visual together.
- **Accordion:** item identity plus expanded set/key; preserve content in the DOM strategy used by the project.
- **Dropdown/popover:** trigger, anchor, open state, selection, outside/Escape dismissal through existing primitives.
- **Modal/drawer:** open state, backdrop, close controls, deterministic dismissal, scroll ownership; use the project's focus/portal primitive.
- **Carousel:** active index, bounds/wrap rule, next/previous controls, indicators, and drag behavior only if supported/evidenced.
- **Form:** controlled/uncontrolled convention of the project, visible label, value, validation timing, submitting, error, and success states.
- **Navigation:** use a real link/router primitive when a target is known; do not simulate navigation with a no-op button.

### Static-only source

A single static frame cannot establish every transition. It is acceptable to implement native control behavior and project-standard hover/focus visuals. It is not acceptable to invent URLs, API calls, destructive actions, confirmation rules, or unseen modal contents.

## 7. Visual comparison loop

1. Render at the exact source viewport and device pixel ratio when possible.
2. Freeze non-determinism: stable data, time, animation, random values, and network responses.
3. Capture source and implementation at identical crop dimensions.
4. Compare side by side for structural errors.
5. Overlay at roughly 50% opacity to expose doubled edges and baseline drift.
6. Use pixel diff as a locator, not as the only acceptance criterion; font rasterization and antialiasing can differ.
7. Fix one discrepancy class at a time and recapture.

For long pages, compare section crops as well as the full page. Full-page scaling hides typography errors, clipped text, wrong variants, and missing one-pixel borders.

## 8. Behavioral validation

Exercise every implemented path instead of checking only the initial screenshot:

- activate all visible controls;
- verify state and visuals stay synchronized;
- verify close/back/reset paths;
- verify native keyboard activation and tab order supplied by semantic elements/project primitives;
- verify repeated components do not leak state into one another;
- verify rapid/repeated activation does not create impossible state;
- verify loading/error handling where it exists;
- verify browser back/forward for route-driven state;
- verify narrow viewport menus, overlays, and scroll ownership.

Do not add ARIA labeling attributes as part of this skill. Native semantics, visible labels, and established project components remain preferred.

## 9. Reporting fidelity honestly

Use precise completion language:

- **Visually validated:** compared rendered screenshots at named viewports; describe remaining differences.
- **Structurally validated:** snapshot geometry/tokens implemented and app checks pass, but no source screenshot was available.
- **Partially blocked:** list missing image/vector node paths, unavailable fonts, ambiguous states, or unknown destinations.

Never claim 1:1 or pixel-perfect output from JSON inspection alone.
