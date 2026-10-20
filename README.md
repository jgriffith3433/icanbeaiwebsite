# A day

Small Weather living through today, in real time, one action at a time. Open the site and you see what he's doing right now. Drag the day bar to look around the day, or play it at 10×–1200×.

Where it's going: a third-person game. Small Weather (he/him, the storm caller from Dose Of Destruction) lives his developer's day on autopilot; the player can take control, walk the city and command the weather. Today the day plays on autopilot and you can take control of him (walk, run, jump, then let go and he walks back to his day), on Babylon.js 9 with Havok physics and colliders for the world. More in [AGENTS.md](AGENTS.md#direction).

**The whole day is defined in [`day.config.js`](day.config.js).** Change it, save it, and reload the page.

## Run it locally

Double-click `auto-start.bat`. The first time, it installs the packages (Vite, Babylon.js 9, Havok). Then it serves the site at **http://localhost:8092** and opens your browser. `auto-stop.bat` stops whatever is running on port 8092. From a terminal you can also use `npm run dev`, `npm test` (builds the day and the world in Node and checks the physics), `npm run build` (the site in `dist/`, about 4 minutes), or `npm run preview` (serves `dist/` on port 8093).

The page needs Vite: opening `index.html` straight from disk no longer works, because Babylon and Havok come from npm.

## How it fits together

| File | What it does |
| --- | --- |
| `day.config.js` | **Everything about the day:** rooms and spots, the clock spine, behavior pools, body stats, things in the world, his name (`person.name`) |
| `js/app.js` | The page's entry (Vite): Babylon 9 (`js/babylon.js`), then the files below in order, then Havok physics |
| `js/schedule.js` | The engine. It compiles the config into one continuous timeline (about 700 actions) for each date. |
| `js/world.js` | The 3D stage (Babylon.js 9). Furniture is placed from the spots in the config, and props react to the things. `enablePhysics` gives the ground, buildings and furniture Havok colliders. |
| `js/main.js` | Clock, playback, the action log, body meters, the things panel |
| `js/analytics.js` | Hawkes Analytics: what viewers watch and touch (see [AGENTS.md](AGENTS.md#analytics-hawkes-analytics)) |
| `js/control.js` | Taking control: the player moves him in third person (Havok character controller, keys, gamepad, touch stick, orbit camera), and Let go walks him back to his day |
| `js/avatar.js` | How his rigged model (a GLB with idle/walk/run/jump/fall/float/cast clips) replaces the stand-in figure |
| `simulation-checklist.md` | The original rules the simulation follows |

## Versions and publishing

Going live is Hawkes Studio's go live (beta, playtested, then J types `DEPLOY icanbe`). Before it, Studio runs
`node scripts/stamp-build.mjs` on beta: it stamps `?v=<hash of the files>` on every local file link in `index.html` and
the same hash in `<meta name="build">`, so browsers fetch fresh CSS and JS the moment it's live. The page also asks
browsers not to cache it (GitHub Pages can't send cache headers, so `<meta>` tags do it, and Pages may still hold
`index.html` for about 10 minutes). On the live site an open tab checks the build every 10 minutes and reloads when it
changes. The local dev server sends `no-store`.

The version is a release (Hawkes Studio `src/releases.ts`): a semver bumped at each go live (minor when there's
something new, patch for fixes), tagged `v<version>` in git. Studio adds it to `releases.json` with the notes J approved;
`whatsnew.html`, the corner label in the public view and the side panel read it through `js/hawkes-release.js` (a copy
of `hawkesstudio/clients/web/hawkes-release.js`). Don't bump it by hand.

## Editing the day

### Change when something happens

Every line on the clock is a **block** in `spine`:

```js
{
  time: "12:00",
  title: "Microwave",
  chapter: "lunch",
  steps: [
    { go: "microwave", for: "1.5-2m", do: "He walks to the break room." },
    { at: "microwave", hand: "reach", for: "20-40s", set: { microwave: "on" }, do: "Container into the microwave." },
    { chance: 0.35, at: "microwave", for: "10-20s", do: "They open it early, check, and close it again." },
  ],
},
```

- A block runs until the next block starts. Step durations are random within their range, then fitted to the block.
- A step with `fill: true` soaks up whatever time is left (useful for "They work.").
- `chance: 0.35` means the step happens on about a third of days.
- `go` walks to a spot. The route goes through doorways, and the walk takes as long as walking takes.
- Steps are **never stretched** to fill the clock. Give each step its real duration, and mark one step `fill: true` as what the person does with spare time (waiting for toast, sitting in the parked car). If a block has no fill, leftover time becomes idle time: small fidgets from the `idle` pool. More than 3 minutes of that shows a note in the console.

### Add a small behavior

Add an entry to one of the `pools`. It gets sprinkled into any step whose `micro` uses that pool:

```js
{ do: "They reach for the water. The glass is empty. They put it back.", for: "4-8s",
  hand: "reach", when: { deskGlass: "empty" }, likes: { thirst: 3 } },
```

- `when` limits the entry to certain conditions (things or body stats like `thirst: ">0.5"`).
- `likes` makes it more likely as a stat rises.
- `set` changes the world. The glass stays empty until a later step fills it.
- `steps` with `go: "$back"` covers multi-part trips ("walk to the fridge, look, close it, come back").

### Move furniture

Each spot is `[x, z, faceDegrees]` inside its room. The bed, couch, desks, toilet, fridge and so on are built around their spots, so moving a spot moves the furniture with it.

### Make every day the same

Set `seed: "any text"`. With `seed: "date"`, each date gets its own repeatable variation.

## If something is wrong

When the config has a problem (a misspelled spot, a bad duration, an unknown pool), a red panel lists exactly which block and step to fix. Softer notes, like a block whose steps were squeezed to fit, go to the browser console.

From the console:

```js
day.jump("14:20")   // go to a time
day.speed(60)       // play at 60×
day.live()          // back to now
day.today()         // the compiled timeline
```

## Keys

`Space` play/pause · `←` `→` 5 minutes (`Shift` for 1) · `1`–`5` speeds · `Esc` back to now · `Enter` take control

While he's yours: `WASD` or arrows move · `Shift` runs · `Space` jumps (twice more in the air; hold to float down) ·
drag to look, wheel to zoom · `1`–`7` the weather (clear, clouds, rain, storm, fog, wind, snow) or hold `Q` for the
wheel · `Esc` lets go. A gamepad works too (Start takes and lets go, A jumps, a bumper runs, B lets go), and on a
phone there's a touch stick (push it to the edge to run), a jump button and a Weather button.

## Playtests

The page implements the Hawkes playtest contract v1 (spec: `C:\Projects\hawkesstudio\docs\playtest.md`), so the
daily runner in Hawkes Gen can play it. `js/hawkes-playtest.js` is a copy of the shared helper (source of truth:
`hawkesstudio/clients/web/hawkes-playtest.js`); the scenarios are in `js/playtest.js`. Nothing runs until the runner
calls `window.hawkesPlaytest.start()` or the URL has `?playtest=<id>`.

| Scenario | What it does |
| --- | --- |
| `smoke` (~25 s) | Boot, check Small Weather is on screen, watch the live clock tick, play one day-minute at 10×, pause, Esc back to live. Then an `engine` event (Babylon version, Havok, the colliders), `collider-under-person`, and his name: `name-in-panel`, then the day bar to the alarm for `name-in-log`, and Esc back to live. |
| `day` (~75 s) | Drag the day bar to the start of the day, play at 1200× to the end, and check every block in today's timeline started and every action was reached. `?speed=` multiplies the speed. |
| `control` (~100 s) | From a quiet moment at home (the day bar): Enter takes control; WASD walks, Shift sprints, a drag orbits the camera, Space jumps three times in one flight and holds to float; Esc lets go and it checks he walks back (no teleport) to where his day puts him, the log says so and the day carries on. Then the phone's touch stick and jump button (shown with `day.control.touch(true)` on a desktop window), and letting go again by tapping. |
| `look` (~80 s) | Beside the car (the day bar): Enter, walk to the shop front. Scrub holds noon, dusk and night for shots (PBR, neon, sky weights). Then the Quality button: low drops bloom and shadows and records frame time. |
| `weather` (~110 s) | From the front door (the day bar): Sound on, Enter, walk to the avenue, then keys 1–7 through clear, clouds, rain, storm, fog, wind and snow. Each blends over a few seconds; rain and storm leave the road wet. Hold Q for the wheel, then the phone's Weather button. |
| `analytics` (~4 min) | Camera, speed buttons and keys, the day bar, the panels, with every analytics event that goes out on the timeline; then waits for the 3-minute question ("What would you want this to be?") and dismisses it. |

Problems it reports: a block (activity) that never starts, actions never reached, the clock stopping, NaN in the
body stats or the person's position, the person mesh not where the engine puts them, config errors and warnings,
the person off screen, Babylon or `day.config.js` not loading. Spine blocks with `chance` that today's draw skipped
are listed as `skipped-today` events, not problems.

Try it: open http://localhost:8092/?playtest=day and, when it's done, run `hawkesPlaytest.report()` in the console.

Hooks it uses in the game: `day.engineInfo()` in `js/app.js`, `world.groundAt()` in `js/world.js`, `day.now()` and `day.watch(fn)` in `js/main.js` (a frame callback, empty unless a
playtest runs) and `world.person` in `js/world.js`. `main.js` caps a frame at 0.1 s, so on a slow renderer
(software WebGL in a headless browser runs at 1–2 fps) playback is slower than its label; the `day` scenario raises
the speed every few seconds to finish in about 75 s.

## Generative AI: Hawkes Gen

Images, textures, video, 3D, music, voice, sound and Claude all go through **Hawkes Gen**
(`C:\Projects\hawkesgen`, dashboard http://127.0.0.1:8790; start it with `hawkesgen\auto-start.bat`). It holds
the API and AWS keys and runs the shared GPU fleet. This project never holds those keys.

- **Agents:** the `hawkesgen` MCP server is in this folder's `.mcp.json`. Use `hawkesgen_presets` (project
  `icanbe`) for the art direction, then `hawkesgen_run`.
- **Command line:** `C:\Projects\hawkesgen\hawkesgen.cmd run - --project icanbe --preset <name> --param prompt="..." --out <folder>`
- **Art direction:** `hawkesgen/presets/icanbe.json` (style line and named presets). Edit it there.
- **Code:** copy `hawkesgen/clients/js/hawkesgen.mjs` into `tools/` and use `new HawkesGen({ project: 'icanbe' })`.
- GPU tools cost money while a server runs. Ask J before starting servers or running big batches.
