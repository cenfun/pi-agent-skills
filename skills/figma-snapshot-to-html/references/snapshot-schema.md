# Compact Figma snapshot schema

The snapshot is self-describing through its top-level `_meta` object. Always prefer `_meta` when a future export changes meaning. This reference summarizes the current format.

## Top level

| Key | Meaning |
|---|---|
| `v` | format version |
| `_meta` | schema descriptions and HTML/CSS mapping hints |
| `name` | Figma file/document name |
| `tokens` | deduplicated `colors`, `fonts`, and `shadows` |
| `tree` | root node |

Token references use `$cN`, `$fN`, and `$sN`, resolved through `tokens.colors.cN`, `tokens.fonts.fN`, and `tokens.shadows.sN`.

## Base node keys

| Key | Meaning / CSS mapping |
|---|---|
| `t` | node type: `frame`, `text`, `img`, `rect`, `ellipse`, `vector`, `group`, `instance` |
| `n` | layer name |
| `ch` | children |
| `w`, `h` | width/height; number = px, `fill` = available space, `hug` = intrinsic |
| `minW`, `maxW`, `minH`, `maxH` | size constraints |
| `l` | layout: `row` or `col` |
| `g` | gap |
| `p` | padding: number or `[top,right,bottom,left]` |
| `j` | justify: `start`, `center`, `end`, `between` |
| `al` | alignment: `start`, `center`, `end`, `stretch` |
| `wr` | wrapping |
| `ps` | position: `abs` or `rel` |
| `x`, `y` | left/top offsets |
| `cn` | constraints |
| `bg` | background/token |
| `o` | opacity |
| `r` | radius |
| `bd` | border `{w,c,style}` |
| `sh` | shadow/token |
| `bl`, `bbl` | blur/backdrop blur |
| `bm` | blend mode |
| `rt` | rotation |
| `ar` | aspect ratio |
| `z`, `ord` | z-index/order |
| `iF`, `iL` | first/last-child hints |
| `of` | overflow |
| `rs` | responsive metadata |
| `sm` | semantic role/state metadata |
| `ia` | interaction metadata |
| `pi` | pattern metadata such as list/grid/carousel/tabs |
| `di` | developer/designer notes |

## Text keys

| Key | Meaning |
|---|---|
| `c` | characters/content |
| `f` | font family/token |
| `s` | font size px |
| `wt` | font weight |
| `cl` | text color/token |
| `lh` | line height |
| `ls` | letter spacing |
| `ta` | text alignment |
| `td` | decoration |
| `tt` | transformation |
| `tr` | truncation/ellipsis hint |
| `psp` | paragraph spacing |
| `ars` | text auto-resize behavior |
| `rT` | rich-text/mixed-style ranges |

Text nodes may omit `w`/`h`; derive behavior from parent layout and text auto-resize rather than assigning zero dimensions.

## Images

| Key | Meaning |
|---|---|
| `alt` | alternative text |
| `ft` | fit/object-fit |
| `iR` | image hash/reference, if exported |
| `nId` | source Figma node ID, useful for asset export |
| `oS` | original dimensions `{w,h}` |
| `cR` | normalized crop rectangle `{x,y,w,h}` |

The `src` field may only be a placeholder. Never commit a placeholder or manufacture artwork when the referenced bytes are absent.

## Instances and vectors

`instance` nodes can include `componentName` and `variantProps`. Use these as reusable-component hints, not as a guarantee that an equivalent component already exists in the web project.

A `vector` node in this compact format may have no path data. Dimensions, color, semantics, and name are insufficient to reconstruct the original glyph exactly.

## Semantics and patterns

`sm.role` may suggest `button`, `input`, `card`, `nav`, `header`, `footer`, `modal`, `badge`, `avatar`, `icon`, `link`, `list`, or `listItem`. Prefer the corresponding semantic HTML when appropriate.

`pi.pattern` can identify list, grid, carousel, tabs, or form behavior. Implement behavior using an existing project component/library when available.

`ia` can contain prototype triggers/actions. Treat them as interaction requirements to map to routes, state changes, overlays, or links; do not emit inert clickable-looking elements.
