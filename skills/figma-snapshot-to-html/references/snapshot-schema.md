# Figma to AI JSON snapshot schema

This reference describes the **currently emitted** `figma-to-ai-json` v1.0 data, based on its parser and transformer—not only the broader TypeScript interfaces or older format documentation. Read the snapshot's own `_meta` first because a later exporter can change the contract.

## Export boundaries and important lossiness

- The plugin exports only the **first selected visible Figma node**. It is not necessarily a page or board.
- Hidden nodes are discarded by the parser, so a hidden menu, modal, or alternate state cannot be recovered from that export.
- Children are optional in the plugin UI and parsing is depth-limited (currently 50 by default). A leaf in JSON does not prove that the Figma node had no descendants.
- Most container dimensions and exported `x`/`y` values are rounded to integer pixels. Coordinates are emitted only when `layoutPositioning` is `ABSOLUTE`; in real freeform frames this can leave multiple children with no usable coordinates or flow layout, making exact placement unrecoverable from JSON alone.
- Ordinary nodes do not currently retain their Figma `id`. Image nodes retain `nId`; prototype destinations retain a destination **name**, not destination ID.
- Text and image nodes take specialized early-return transformation paths. They omit many common properties that containers can carry; absence of those properties is not reliable proof of default styling or positioning.
- Current text and border color extraction drops paint opacity, while background fills preserve it. A source screenshot is needed to catch that alpha loss.

These limitations matter when selecting states, resolving interactions, and claiming fidelity. Export a broader visible parent or separate state selections when needed.

## Top level

| Key | Meaning |
|---|---|
| `v` | format version, currently `1.0` |
| `_meta` | embedded schema/mapping guidance from the exporter |
| `name` | selected root node name |
| `tokens` | `colors`, `fonts`, and `shadows`; always present, possibly empty |
| `tree` | transformed selected node |

With token extraction enabled, references use `$cN`, `$fN`, and `$sN`, resolved through `tokens.colors.cN`, `tokens.fonts.fN`, and `tokens.shadows.sN`. With extraction disabled, properties contain raw values and all three token maps are empty.

## Container/common keys actually emitted

| Key | Meaning / interpretation |
|---|---|
| `t` | `frame`, `text`, `img`, `rect`, `ellipse`, `vector`, `group`, or `instance` |
| `n` | layer name |
| `ch` | visible, included children in source order |
| `w`, `h` | rounded pixel number or `hug`; the format describes `fill`, but the current transformer generally emits numeric sizes plus `rs` hints instead |
| `l` | auto-layout direction: `row` or `col` |
| `g` | positive item spacing; zero is omitted |
| `p` | non-zero padding, number or `[top,right,bottom,left]` |
| `j` | non-default main-axis alignment: `center`, `end`, or `between`; omitted means start |
| `al` | non-default cross-axis alignment: `center` or `end`; Figma baseline is normalized to omitted/start, and current mapping does not emit `stretch` |
| `wr` | auto-layout wrapping is enabled |
| `ps`, `x`, `y` | absolute positioning and rounded offsets; absence inside a non-auto-layout parent can mean lost geometry, not normal document flow |
| `cn` | non-default constraints `{h,v}`; horizontal: `left/right/center/stretch/scale`, vertical: `top/bottom/center/stretch/scale` |
| `bg` | first visible solid fill or linear/radial gradient; image fills become `img` nodes instead |
| `o` | opacity below 1, rounded to two decimals |
| `r` | positive radius or `[top-left,top-right,bottom-right,bottom-left]` |
| `bd` | first visible solid stroke as `{w,c,style}`; stroke alignment is not retained |
| `sh` | comma-separated visible drop/inner shadows |
| `bl` | currently sourced from Figma `BACKGROUND_BLUR`; implement as backdrop/background blur |
| `bbl` | currently sourced from Figma `LAYER_BLUR`; despite the key name, implement as layer/filter blur |
| `bm` | supported CSS-like blend mode |
| `rt` | non-trivial rotation in degrees |
| `ar` | aspect ratio only when close to one of several common ratios |
| `z` | source sibling index + 1 for absolute children; a hint, not a complete stacking-context model |
| `ord`, `iF`, `iL` | original sibling order and first/last hints when the source had multiple children |
| `of` | `hidden` when the source clips content; other overflow values are defined by the format but not currently emitted by the parser |
| `rs` | heuristic responsive metadata |
| `di` | description, layer-name note, or shared plugin data |
| `sm` | heuristic semantic role/interactive/state metadata |
| `ia` | exported prototype reactions |
| `pi` | heuristic UI-pattern metadata |

The interfaces also declare `minW`, `maxW`, `minH`, `maxH`, `vs`, and `ps: "rel"`, but the current parser/transformer does not emit them. Handle them if present in a future or externally produced snapshot, but do not expect them.

## Text nodes

| Key | Meaning |
|---|---|
| `c` | text content |
| `f` | font family or token |
| `s` | font size px |
| `wt` | numeric font weight |
| `cl` | solid text color/token |
| `lh` | pixel line height, or ratio when Figma uses percent |
| `ls` | letter spacing converted to pixels |
| `ta` | non-left alignment |
| `td` | underline or line-through |
| `tt` | uppercase, lowercase, or capitalize |
| `tr` | `true` for one-line ending truncation, number for multiline clamp |
| `psp` | paragraph spacing |
| `ars` | `height` or `width-height` text auto-resize hint |
| `rT` | mixed-style segments when more than one segment exists |

Rich-text segments can include `text`, `f`, `s`, `wt`, `cl`, `italic`, `underline`, `strikethrough`, and `link`.

**Current limitation:** text nodes do not emit `w`, `h`, `x`, `y`, opacity, rotation, vertical alignment, constraints, or common container styling. A single-style italic face is also not retained (italic is recorded only on mixed-style segments). Derive geometry from parent layout and rendered text metrics; never interpret missing dimensions as zero.

## Image nodes

Any supported node with an image fill is transformed into `t: "img"`, regardless of its original Figma node type.

| Key | Meaning |
|---|---|
| `n`, `alt` | both currently copied from the layer name |
| `w`, `h` | transformed displayed box size (`hug` or rounded pixels) |
| `r` | corner radius |
| `ft` | `cover`, `contain`, or `fill` from Figma image scale mode |
| `iR` | Figma image hash/reference when available |
| `nId` | source Figma node ID |
| `oS` | named “original size” by the format, but currently populated from the node's displayed width/height—not decoded bitmap intrinsic size |
| `cR` | approximate normalized crop rectangle when a non-default image transform is detected |

The image bytes and a usable `src` are not embedded. The specialized image path also drops children, interactions, semantic metadata, opacity, borders, shadows, absolute positioning, and other common properties. Consult a screenshot or source export rather than assuming those omitted values are defaults.

## Instances and vectors

`instance` nodes can include `componentName`, `variantProps`, and `componentDesc`. These are component-reuse and state clues, not proof that a matching web component exists.

A `vector` record contains no SVG path data in the current exporter. Name, bounds, color, and heuristic semantics cannot reproduce the glyph. Obtain an exact asset or use a visually verified project asset.

## Responsive metadata

`rs` is heuristic:

- `breakpoint` is inferred from layer-name keywords/numbers; for unnamed clues, width inference is only applied to nodes at least 1024 px wide;
- `fluid: true` comes from horizontal `STRETCH` or `SCALE` constraints;
- `grow` comes from positive `layoutGrow` under parent auto layout;
- `shrink: 0` is emitted when `layoutGrow` is zero under parent auto layout.

Treat `rs` as supporting evidence. Explicit sibling desktop/mobile designs and target-project breakpoints are stronger evidence.

## Semantics, patterns, states, and interactions

`sm`, `pi`, and part of `rs` are generated by regex and geometry heuristics. Layer names such as “menu”, “card”, “active”, or “mobile” can produce false positives. Do not treat these fields as authored accessibility or behavior specifications.

Current semantic roles are `button`, `input`, `card`, `nav`, `header`, `footer`, `modal`, `badge`, `avatar`, `icon`, `link`, `list`, `listItem`, `tab`, `menu`, `tooltip`, and `dropdown`. Current states are `hover`, `active`, `disabled`, `focus`, `selected`, and `loading` (`default` is omitted). `sm.interactive` is also heuristic.

Current pattern names include `grid`, `list`, `carousel`, `tabs`, `accordion`, `form`, `table`, `breadcrumbs`, `pagination`, `stepper`, and `gallery`. `itemCount`, `columns`, and `rows` are hints inferred from included children and can be wrong when children were filtered or truncated.

`ia` is currently an array of `{trigger, action, dest?, url?, transition?}`:

- triggers: `click`, `hover`, `press`, `drag`;
- actions: `navigate`, `overlay`, `swap`, `scroll`, `url`, `back`, `close`;
- `dest` is the destination node **name**. The parser sees a Figma destination ID but the transformer does not retain it;
- unsupported trigger/action values currently fall back to `click`/`navigate`, so corroborate surprising results with state frames or screenshots.

Evidence priority is: explicit `ia` → demonstrated sibling/variant states → heuristic semantic/pattern metadata → safe platform convention. Missing destinations, hidden states, network effects, destructive behavior, and unseen content must not be invented. Do not generate ARIA labeling attributes from layer names or metadata.
