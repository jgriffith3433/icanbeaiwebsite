# I Can Be: UI art kit

Storm-navy HUD language (Persona-bold frames, electric cyan accents, cream type). One kit for every player-facing screen.

## Pieces

| Piece | Path | Notes |
|---|---|---|
| Verb icons lit/unlit | `textures/ui/verb-<bolt\|rain\|wind\|fog\|sunbreak>-<lit\|unlit>.svg` (webp when Gen lands) | 5 verbs × 2 states |
| Panel frame | `textures/ui/panel-frame.svg` | 9-slice via `border-image` / `--ui-frame` |
| Rank stamps | `textures/ui/rank-{S,A,B,C}.svg` | Score card + Episodes rows |
| Busts | `textures/ui/bust-{birdie,dex,ines}.svg` | Neighbors panel + captions |
| Pilot glyph | `textures/ui/pilot.svg` | Voice caption when Pilot speaks |
| Display face | `fonts/fraunces-display.woff2` | ≤80 KB with Outfit |
| Text face | `fonts/outfit-text.woff2` | Body / HUD copy |

## Code

- `js/ui-art.js` — resolves webp over svg, `verbIcon` / `rankStamp` / `bust` / `goalVerb` / `stripKeyLetters`, installs `createUiKit`
- `css/ui-kit.css` — fonts, frames, ready glow, press scale, radial wipe helpers, 150 ms menu slides
- `js/abilities.js` — painted icons, `.wipe` conic cooldown, `.ready` glow, press on `.face`
- Goals / prompts: icons + words; no `(E)` / `Press R` style key letters (`day.config.js` tutorial prompts)

## Gen (blocked on credits)

Recipes in `hawkes.assets.json`: `ui-verbs-lit`, `ui-verbs-unlit`, `ui-panel-frame`, `ui-ranks`, `ui-busts`, `ui-pilot`. Estimate ~$0.26 GPU for 6 generates + 6 cutouts (org project `org_eb0d5c82e8da8c2d.icanbe`). Crop sheets into per-icon webp ≤40 KB via `studio_gen_import`.

## Playtest

`ui-art-kit` (`{"touch":true}` for 390x844).
