# Tornado rebuild: plaza wreck that stays

## What was wrong
The old tornado was five stacked boxes and six decorative debris cubes parented to the funnel. Loose props were only a few bins/umbrellas on the home avenue; nothing wrecked the plaza, nothing settled onto the ground, and nothing persisted in district memory.

## What changed
- **`js/tornado.js` (new):** 3 twisted cylinder shells (2 on low quality) with scrolling noise alpha, condensation core, debris band, dust ring (spray over water/puddles), rotating cloud deck that leans with the path. Havok debris pool (bins, cones, chairs, planters, signs, awning, papers, leaves), cap 30 / 12 on low. Lift → orbit → fling → settle with a ground raycast; second casts wake wrecked props. Crowd `day:crowd` scatter; shake by distance.
- **`js/powers.js`:** wires the module; plaza casts use `plazaCourse` through the café; gale shove limited to 16 m; skips settled props.
- **`day.config.js`:** denser `powers.loose` set on the plaza so a cast lifts 8+.
- **`js/memory.js`:** `noteDebris` keeps up to 4 solid wreck marks per cast (skips paper/leaf so scorches aren't flooded out).
- **`js/sfx.js` / `js/crowd.js`:** scream + scare on scatter.
- **Playtest `tornado-plaza`** (+ `{"touch":true}`): lifts, layers, settle, cap, fps. Named in `.hawkes/scenario.txt`.
- **`scripts/check-tornado.mjs`** in `npm test`.

Did not touch the other agent's render-pipeline / look / cityscape / world files.

## Checks
- `npm test` passed (including `check-tornado`).
- `npm run build` transformed modules then was killed (OOM) during chunk render — known sandbox limit; Studio's own build is the authority.

## Reviews
- **Fun reviewer: thin** (not demo). Gaps left for later: permanent plaza stalls in the debris set, a day-after cleanup/remembers beat, steerable funnel with episode stakes. Those are beyond this effect's acceptance criteria.
- **Reviewer: revise → addressed:** Havok wait before pool build, bounding-box ground check after tip, fling-then-snap settle, repeat-cast wake, debris mark cap, gale range, duplicate scare removed.

## GPU
None used / none needed. No Gen estimate.

## Try
See `.hawkes/try.md`. Scenario: `tornado-plaza` with `{"touch":true}`.
