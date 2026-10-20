# I Can Be (icanbe.ai): notes for agents

How the site works, how to run it, versions, playtests and Hawkes Gen are in [README.md](README.md). The day is
`day.config.js`.

## Direction

I Can Be is becoming a **third-person game** (J, 2026-10-19, memory m_b34b3a2627df). The character is **Small Weather**
(he/him; canon m_9743a1dfe970: the same Small Weather as Dose Of Destruction's storm caller, art in
`AllTheCharacters/SmallWeather`). He lives his developer's day on autopilot, the simulated day in `day.config.js`; a
player can take control, walk the city in third person and command the weather, and feel like a god doing it. The
levels get redone over time. The page is the day playing on its own until someone takes control (below).

- **His name and voice:** the day's lines call him "He", plainly, and name him "Small Weather" at a few moments (the
  alarm, out the door, the work lot, home, setting the alarm, the first line of work). `person.name` in
  `day.config.js` is what the side panel shows. Keep lines short and matter-of-fact, as they are; no "they" for him.
  Other people (coworkers, someone in the elevator) are still "they".
- **Taking control** (`js/control.js`, lines and feel in `day.config.js` `control`): "Take control" (Enter, a
  gamepad's Start, a tap) takes him off his day at that moment. The clock and the day keep running without him (if
  the day was paused, it plays). He's the player's in third person: WASD/arrows, a gamepad, or the touch stick on a
  phone; Shift (a bumper, the stick pushed to its edge) runs; Space jumps, twice more in the air, and held while
  falling he floats down (his Dose Of Destruction fighter's two extra jumps and floaty fall). The camera orbits him
  (drag, right stick, wheel or pinch to zoom) and pulls in rather than go through a wall. "Let go" (Esc, B) and he
  walks back by the day's own routes (`DayEngine.route`, through the doors) to where his day says he should be by
  now, then the day has him again. Where he can't walk to (the day has him driving, or in the other building) he
  catches up with it in a quick fade. He can't be taken while he's driving. The log gets a line for each of these
  (`day.note()`), and the panel says `control.lines.steering` while he's the player's.
- **His look:** a rigged 3D model made in Hawkes Gen from his Dose Of Destruction art (below, "His 3D model"): black
  messy hair, glasses, the navy tech jacket with glowing blue seams, cargo pants, glowing boots; lightning coils his
  arms while he's the player's. It's the same him all day (no pyjamas or towel colours: `person.outfits` only colours
  the box figure, which shows until the model loads or if it fails).
- **The city:** a few blocks in `day.config.js` `city` (avenues, crosses, the park, solid blocks). Three of the blocks have a stair up the north face onto the roof (`stair`). His rooms and the office stay the cutaway interiors; the office origin is a few blocks east on the main avenue (`street`). The look is `js/look.js`: PBR asphalt, wet concrete, brick, glass and rooftops (Gen textures in `textures/city/` when `manifest.json` is there; painted stand-ins until then), neon and electric-blue windows after dusk, a sky dome that blends day, dusk and night. Daylight stays bright. **Quality** (`#quality`, also on the public site; `day.look.quality("low"|"high")`, remembered in `icanbe.quality`) drops bloom, MSAA, FXAA and the shadow map and renders at CSS pixels, so a phone stays smooth. A coarse pointer, a window 700 px wide or less, or `navigator.deviceMemory` ≤ 4 starts on low. The weather system blends the sky with `day.look.setSky({ day, dusk, night, fogDensity, fogColor, exposure })` (pass `null` to follow the clock again).
- **The weather** (`js/weather.js`, the forecast and the lines in `day.config.js` `weather`): clear, clouds, rain, storm, fog, wind and snow. With nobody in control the day follows a forecast seeded by the date. Take control and 1–7, hold Q, or a tap on a phone sets it; it blends over a few seconds on top of the time-of-day sky. Rain and storm wet the road. `weather.now()` and `weather.set(state, intensity)` are what the rest of the page reads.
- **Not yet:** his storm-caller powers (the model has `cast` and `throw` clips for them). The weather above is the sky, not those.

### Taking control: how it's built

- `js/control.js` is a real module (imported by `js/app.js`, then `js/weather.js`). `createMover(world, cfg)` is the movement alone:
  a Havok `PhysicsCharacterController` (capsule 1.7 × 0.28 m, steps up 0.3 m) or, if Havok didn't load, a flat
  mover without colliders; `step(dt, input)` for the player, `walkBack(dt, target)` for the way back (kinematic along
  the route, like the day's own walks, dropping off whatever he stood on but never climbing furniture). `npm test`
  drives it. The rest of the file is the page: the button, keys, gamepad, the touch pad, the orbit camera.
- `main.js` calls the controller every frame through `day.pilot(fn)` before drawing; while it returns
  `{ x, y, z, yaw, speed, anim, text }`, `world.update(fr, dt, { player })` leaves him and the camera to it and
  draws the rest of the day as usual. `null` = the day has him.
- He's drawn through an **avatar**: `{ place(x, feetY, z, yaw), play(clip, speed, dt), show(on) }`: `world.avatar`,
  the box-built figure with a pose per clip (`idle walk run jump fall float cast`, POSE and gesture in `world.js`).
  His model is worn over that figure (below), so `day.control.setAvatar()` isn't needed for it.
- The key handler runs in the capture phase and swallows the keys it uses only while he's the player's, so ← →,
  Space and Esc keep their day meanings otherwise. `day.control` (console, playtest): `mode()`, `state()`,
  `take()`, `letGo()`, `touch(on)` (show the phone controls on any screen; `?touch=1` too).
- Touch controls show while he's the player's on a coarse pointer or a window 700 px wide or less. The button is on
  the public site too (it isn't part of the HUD).

### His 3D model

- **The file:** `models/small-weather.glb` (GLB only, under 10 MB; `npm test` checks), named by `day.config.js`
  `control.model` (null = the box figure). Its recipe is `hawkes.assets.json` (`small-weather`): an A-pose front
  sheet from `AllTheCharacters/SmallWeather/anims/_reference.png` (image.edit), a textured mesh (mesh.textured, best
  of a few, judged on mesh.rig's turntables), then Gen's auto-rig (mesh.rig) with 14 clips. Gen entity
  `icanbe/small-weather` keeps the takes.
- **The clips** are made here, not downloaded: `node scripts/small-weather-clips.mjs` writes
  `art/small-weather/clips/*.glb` from PH Origins' ch33 hero's Mixamo rig (`phoriginswebsite/assets/models/ch33-hero.glb`
  next to this repo): Idle, Walk, Run, Jump (push-off to the top) and Sitting Idle in place, and posed ones (fall,
  float, cast with both arms up, a lightning throw, and the day's type, phone, lie, side, recline), by bone directions
  (`scripts/gltf-skeleton.mjs`). Upload a changed clip to the entity's `clip-src/<name>` slot and rig again.
- **In the page:** `js/app.js` imports `js/small-weather.js` (its own chunk, with `@babylonjs/loaders`) once the page
  is up and calls `world.setSkin()`. The model is parented to the figure's `spin` node, so the day's placing, tilting
  (in bed) and seating still work; the boxes hide (the phone, cup and bag stay). The clip comes from the controller's
  anim under control, and from the figure's pose and hand on his day (`skinClip` in `world.js`: walk, sit, type, phone,
  lie, side, recline, cast for a stretch, else idle). Each clip's hips height (its first Hips key) lifts or lowers the
  model so his hips sit where the figure's pelvis is; the model is scaled so standing hips match the figure's.
- **Glow and lightning:** the texture's bright blue pixels (the jacket seams, the boot lights) become an emissive map
  in the page, in the glow layer. While he's the player's, jagged tubes along each arm flicker (`BOLTS` per clip:
  strongest for cast and throw). `day.engineInfo().model` says `small-weather`, `loading` or `figure`.
- **Playtest:** the `model` scenario watches which clip the model plays on his day (walk, idle, work) and under
  control (still, WASD, Shift, Space, Space held).

## How it's built (Babylon 9, Havok, Vite)

- **Packages:** `@babylonjs/core` 9 and `@babylonjs/havok` from npm (`package.json`, exact versions), bundled by
  Vite. No CDN. `index.html` loads one module, `js/app.js`, which imports in order: `js/babylon.js` (sets
  `window.BABYLON`), `day.config.js`, `js/schedule.js`, `js/world.js`, `js/main.js`, `js/analytics.js`. Those files
  are still plain-JS IIFEs that put their API on `window` (`DAY_CONFIG`, `DayEngine`, `DayWorld`, `day`); keep that
  pattern so the order is the only coupling. New code can be a real module imported from `js/app.js`.
- **Physics:** `js/app.js` loads Havok after the page is up (`HavokPhysics` with the wasm URL from Vite) and calls
  `world.enablePhysics(havok)`. If Havok fails, the day still plays and `day.engineInfo().physics` is `off`.
  `enablePhysics` (`js/world.js`) builds three static bodies of box colliders: `ground` (a slab under the ground plane,
  the road and sidewalks), `town` (houses, shops, tree trunks, lamp posts: the `solids` list, since those are thin
  instances) and `rooms` (building floors and walls, and every furniture mesh at least 25 cm tall or a big flat one;
  doors that swing or slide and the bag are left out). The person isn't a physics body yet: the day still moves him.
  `world.groundAt(x, z, from)` raycasts straight down (the playtest uses it; a future walker can too).
  `day.engineInfo()` says `{ babylon, physics, bodies, colliders }`, and the side panel's foot shows it.
- **New furniture** gets a collider by itself if it's built in the furniture section of `world.js` (between
  `furnitureFrom` and the parked cars). Something that moves must be added to the `moving` list there.
- **Checks:** `npm test` (`scripts/check-world.mjs`) builds the day and the world under Babylon's NullEngine in Node,
  turns Havok on and checks Babylon 9, no config errors, colliders under the field, the road, the home floor, a wall
  and the bed, a person-sized capsule coming to rest on the ground, and that two weeks of days name Small Weather and
  never say "they" for him. Then taking control: he stands up beside the couch, walks, runs, makes three jumps in one
  flight and floats down, walks back to the bed through the doors, and the stand-in plays every clip. `npm run build` must pass too (it takes about 4 minutes: Babylon is big).
- **Publishing:** `.github/workflows/pages.yml` builds `dist/` (tests, then `vite build`) and deploys it to GitHub
  Pages on main; `vite.config.js` copies the static pages, their classic scripts, `css/`, `releases.json` and the
  CNAME into `dist/`. The first time pages.yml reaches main, Studio switches the repo's Pages source to Actions (the
  github-pages skill). **Studio's staging site needs a build recipe** for `icanbe` in `hawkesstudio/src/previews.ts`
  (`{ build: 'npm run build', site: 'none', out: { from: 'dist', to: '' } }`): without it the beta site copies the
  source, and the page can't load `@babylonjs/core`. The playtests use `npm run dev`, which works without it.

## Hawkes Gen art direction (for a later Gen change)

`hawkesgen/presets/icanbe.json` lives in Gen; change it there. Its notes still say "direction undecided" and its style
line still describes the old matte diorama. Replace that style line with:

> Stylized 3D cartoon render, same look as Dose Of Destruction: clean shapes, bold readable silhouettes. The city is
> dark and cinematic: navy and black, electric blue light, rain-wet surfaces. Daylight stays readable (a noon street
> is not pitch black). Weather is the drama: storm light, rain sheets, lightning, clouds breaking open. Small Weather:
> young man, black messy hair, glasses, dark navy tech jacket with glowing blue seams, grey tee, black cargo pants,
> knee armor, glowing boots.

Notes for the preset: "Third-person game: Small Weather (he/him) lives a developer's day on autopilot; the player can
take control and command the weather. Same art as DoD (AllTheCharacters/SmallWeather). City materials, neon, the
day/dusk/night skies and the quality toggle are js/look.js." Negative: `text, watermark, extra limbs`.

## Analytics (Hawkes Analytics)

Hawkes Analytics is the only analytics here (J, 2026-10-18): never add another tracker. The contract is
`hawkesgen/docs/analytics.md`. The product id is `icanbe` (`hawkesgen/analytics/products.json`, beta `icanbe`).

**Where it's loaded.** `js/hawkes-analytics.js` is a copy of `hawkesgen/clients/js/hawkes-analytics.js`. Don't edit
it here: copy it again from Gen. It's loaded with `data-product="icanbe"` on every page people see: `index.html`
(a classic script in `<head>`, then `loadStart()` straight after it, so `game_ready.ms` includes the bundle's download),
`whatsnew.html` and `privacy.html`. A new public page needs the same two lines (`HAWKES_BUILD` and the script tag).

**The build.** Each page has `window.HAWKES_BUILD = { version: "dev" }`. `scripts/stamp-build.mjs`, which is Studio's
`deploy.prebuild` through `bump-version.mjs`, writes `{ version: "<releases.json current>+<build stamp>", commit:
<HEAD>, date }` into all three pages. When the version hasn't changed it keeps the commit and date, so running it
again changes nothing. Don't commit stamped output from a task branch: Studio stamps beta, and that way the commit
is beta's.

**What the page sends** (`js/analytics.js`, imported by `js/app.js` after `main.js`). It only listens to the controls, the
keys, the canvas and `day.watch()`, and it never changes the day.
- Automatic (the SDK): `session_start`, `page_view`, `page_load`, `perf`, `error`, `rage_click`, `outbound`, `exit`,
  `session_end`.
- `game_ready` on the first rendered frame (`view`: public or hud). If WebGL fails, you get `screen unsupported` and
  an `error` instead.
- Context on every event: `time` (simulated clock, 24 h "HH:MM"), `activity` (the spine block's title in
  day.config.js), `chapter` (its label), `mode` (live, play or pause), `speed`, `view`.
- `screen`: `live`, `playback`, `paused` (the playback mode), or `unsupported`.
- `progress` for each block of the day the viewer reaches. `step` is the block's place in today's timeline (1…n),
  plus 100 for each later day. It only grows in a session (kept in sessionStorage `icanbe.progress`). `label` is the
  block title, plus `chapter`, `clock`, and `via` (live, play, or jump; a jump counts after 1.5 s on the block).
- `feature`, one per interaction: `control` {action: take or let-go, via key/button/touch/gamepad; then back,
  how: walk or catch-up}, `weather` {state, via key/wheel/touch, intensity}, `speed` {value, via key/click}, `pause`, `play`, `live` (back to now), `scrub`
  {to, activity} once the day bar settles, `step` {presses, to} for ← →, `camera` {action: turn, zoom, pinch, tap;
  `on` for a tap: person, car, the spot name (`at-<spot>` node), room, nothing}, `sound`, `details`, `quality`
  {value: high or low, via click or api}, `whatsnew`, `privacy`.
- Custom: `watch_time` {minutes} at 1, 3, 5, 10, 20, 30, 60… minutes on screen. Watching needs no input, so the SDK's
  active time undercounts it: use this for "how long people watch". `day_end` when the clock rolls into the next day
  while playing or live. `feedback_prompt` {action: shown, answered or dismissed, context, commented}.
- The question: `ask({ id: "direction", question: "What would you want this to be?" })`, thumbs then an optional
  comment, styled like the panels. It comes after 3 minutes on screen (`ASK_AFTER`) or at `day_end`, only after 4 s
  without input, at most once a session, and not for 7 days after a close (the SDK).

No per-frame events and nothing personal. If you add a control, add its `feature` here and in `js/analytics.js`.
If you rename a spine block, its `progress` label changes too.

**Privacy.** `privacy.html` (linked in the public view's corner, in the side panel and on `whatsnew.html`) says what is
collected: anonymous viewing statistics, no cookies, no personal data, no IP stored. It has an opt-out button.

**Seeing it.** `?hawkes-analytics-debug=1` logs each event to the console and keeps it on
`hawkesAnalytics.debugLog`, each with `sent` once its batch went out. A bot's tab (`navigator.webdriver` or
`?playtest=`) gets the flag added by `index.html`. The `analytics` playtest scenario (`js/playtest.js`, about 4 min)
uses the camera, speeds, day bar and keys, puts every sent event on the timeline, waits for the question, and
dismisses it. Open any page once with `?hawkes-internal=1` to mark J's own browser.
