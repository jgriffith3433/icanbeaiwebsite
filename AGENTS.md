# I Can Be (icanbe.ai): notes for agents

**Lanes, local dev and deploys:** `LANES.md` (branches dev -> beta -> main; `dev.bat`, `deploy-beta.bat`, `deploy-prod.bat`, `status.bat`, `links.bat`, `sync.bat`; beta and live links).

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
  the box figure, which is never drawn while `control.model` is set: he shows as Small Weather or not at all. His GLB loads
  into an asset container and joins the scene only once it is on him; a failed load tries twice more, then he stays hidden).

- **The city:** a few blocks in `day.config.js` `city` (avenues, crosses, the park, solid blocks). Three of the blocks have a stair up the north face onto the roof (`stair`). His rooms and the office stay the cutaway interiors; the office origin is a few blocks east on the main avenue (`street`). Untextured shapes; the art pass is later.
- **City density** (`js/cityscape.js`, after `look.js`): procedural facades (brick, concrete, glass, stone canvas textures with an emissive lit-window map) on the `city.blocks` shells (data and stairs unchanged), ~1000 merged filler buildings in every free lot (inner ones get colliders; `world.solids` / `world.addSolids`), lit shopfront bands, a skyline ring with beacons, crosswalks, stop lines, lane dashes, edge lines, and street lamps with light pools. Windows, shops and lamps follow `look.info().sky` (about 55% at dusk, full at night). `day.cityscape.info()`. Playtest: `photos`.
- **Filling it out** (`js/props.js`, called by `js/cityscape.js`; `day.cityscape.info().props`): street props along the kerbs (trees, benches, hydrants, bins, bus stops), lit shop signs with neon spill on the pavement, the park (lawn, pond, bandstand, flowerbeds, path lamps), a plaza (x 106–130, z 16.8–36: fountain, cafe tables, lamps) and three landmarks (the Clock Tower in the plaza, the Needle spire at 60,86, the Storm Tank at 190,44), rooftop AC units, tanks, vents and antennas. All vertex-coloured merged meshes; the plaza and landmarks are in `reserved()` so fillers keep off them. Signs, lamp globes and tower faces follow the dusk/night weights and the bloom weight swells at night. **Reflections are ability weather only:** the road's clear coat, its gloss and the mirror puddles use `wet × abilityK` (`weather.now().reflect`, `manual`), i.e. only while the weather was set by the player (keys, wheel, Storm) and during its hold after let-go; the forecast's rain still darkens the road and falls, but doesn't shine. Playtest: `fill-out`.
- **The crowd** (`js/crowd.js`, curve and budget in `day.config.js` `crowd`; imported after `cityscape.js`): the district's people and cars, on the day's clock. Thin instances only (legs, torso, head, umbrella; car body, cabin, wheels, head/tail lamps, wipers: ~12 draw calls whatever the count), updated in `scene.onBeforeRenderObservable`. `crowd.curve` is `[hour, people, cars]` (0..1 of `budget`, 260 people and 64 cars): commuters (cars peak 8:30 and 18:00), lunch (people peak 12–13:15), dinner (19:30), near-empty 2–5. People walk a graph of corner nodes (`SIDE` 3.5 m off each avenue and cross street): on, turn, or wait for the signal and cross at the crosswalk; they go into buildings at door sites (a shrink into the doorway; the ones over budget walk to the next door) and come out of others (a grow). Cars take two lanes per avenue and cross street, follow the car ahead, stop at the stop lines on red (`signalAt`, a 36 s cycle per junction; people cross only when the road they cross is red), slow in rain/snow/fog, light up at dusk, and brake for him or his car in the lane. Rain: umbrellas and wipers; storm: they run. Budget: `look.quality() === "low"` scales by `crowd.lowScale` (0.4), and a frame-time guard thins it down to 50% (60% on low) when frames run over 40 ms and brings it back. The day paused = the crowd frozen; jumping the clock re-seeds it for that hour. The 8 old ambient cars in `world.js` are hidden once the crowd is up (`world.crowd`); `world.streetNow()` adds the crowd's umbrellas and wipers. `day.crowd`: `info()` (people, cars, targets, near the camera, walking/crossing/waiting, entering/leaving, stopped, phase, scale), `positions()`, `signal(x, z)`, `targets(hour)`, `step(dt)` (the checks). `npm test` runs `scripts/check-crowd.mjs`. **Reactions** (`rKind` in `js/crowd.js`): while `weather.now().manual` is set by an ability, citizens answer it: storm/Lightning = stop and look up (1.6–3 s), then run; rain = run, the ones without an umbrella duck into the nearest door; wind = slow, lean, a hand on the hat (`crowd-hand` instance); fog = slower walkers and cars (x0.6); sun break = stroll, hop, hands up. Each blends in after a 0–0.6 s delay and out in 0.8 s once `manual` ends. `info()` has `reaction, reacting, lookingUp, hats, cheering, running`. Playtest: `crowd-reacts`. Playtest: `crowd`. Not done: cars turning at junctions, parking, buses, sprite/animated limbs (the people bob and sway only), a photo-real art pass.
- **The weather** (`js/weather.js`, the forecast and the lines in `day.config.js` `weather`): clear, clouds, rain, storm, fog, wind and snow. The sky is calm and clear by default: the date-seeded forecast is off (`AUTOMATIC_WEATHER`, `ABILITY_HOLD_SEC`, `ABILITY_FADE_SEC` at the top of `js/weather.js`). Lightning and Storm set weather that eases out ~3 s after the last call. Take control and 1–7, hold Q, or a tap on a phone sets it; it blends over a few seconds on top of the time-of-day sky. After let-go it **holds** for `weather.hold` real seconds (`react` lines in the log), then drifts back to the forecast. Rain and storm wet the road; street people open umbrellas and cars use wipers (`world.streetNow()`). Steps and pools can use `when: { weather: "rain" }` against the forecast. `weather.now()` and `weather.set(state, intensity)` are what the rest of the page reads.
- **The score** (`js/score.js`, paths in `day.config.js` `score`, recipes in `hawkes.assets.json`): loopable music beds per weather (clear, clouds, rain, storm, fog, snow; wind reuses clear), crossfaded as the weather changes; sampled rain, wind, city hum and thunder; a short sting on take control (`day:control`). Respects the Sound button and autoplay (silent until Sound is on). Missing files leave the procedural noise in `weather.js`. Playtest: `weather-audio`.
- **His powers** (`js/powers.js`, numbers and lines in `day.config.js` `powers`): while he's the player's, a Pressure meter fills over time (faster in a storm) and each call spends some. Hold F (gamepad Y, or Storm on a phone) and a cloud gathers over him, then the sky goes to storm and it rains. E (X, right-click, Bolt) throws lightning at the reticle: a flash, thunder delayed by distance, a scorch, knocked props, a car alarm, and the nearest building's lights out for a few seconds. G (left trigger, Gust) shoves bins and umbrellas in a cone; T (right trigger, Tornado) sends a funnel down the street for a few seconds. Camera shake sells each one. The model plays `cast` / `throw`. `day.powers` / `window.powers`: `now()`, `command(name, via)`, `hold(on)`, `pose()`.
- **Abilities** (`js/abilities.js`, `powers.cooldowns/durations/names` in `day.config.js`): every power is an ability in a registry (id, name, key, cost, cooldown, duration) and is called through `abilities.use(id)`, which refuses on `cooldown` or `energy` and changes nothing. Energy is the Pressure meter. The ability bar (`#abilitybar`, `#ability-<id>`, `#energy`; hidden on touch, where the power pad stays) shows key, cost, a cooldown sweep and countdown, and the Energy bar. `powers.now()` has `energy` and `abilities[]`; `day:power` denied events carry `reason`. Lightning (E) is `bolt` there. Playtest: `smoke` (bar, spend, cooldown refusal).
- **Weather abilities** (`js/powers.js` `weatherCall`, `weather.sunbreak()` in `js/weather.js`): Rain (R), Gale (V), Fog (C) and Sun break (X), beside Lightning (E), registered in the ability bar. Each sets the sky with `weather.set(state, 1, "power")`, so it lasts `ABILITY_HOLD_SEC` (3 s) and eases out over `ABILITY_FADE_SEC` (2 s). Own looks: rain streaks and splashes; Gale = wind state plus dust streaks, trees leaning and a street-wide shove of bins and umbrellas; Fog = dense fog plus drifting mist banks (`mistPs`); Sun break = clear sky with warm gold light (`weather.now().sun`, gold motes, `motesPs`). Own procedural sounds (hiss, rising sweep, low pad, chime), no files. No touch buttons yet. Playtest: `weather-abilities`.
- **His voice** (`js/voice.js`, lines in `day.config.js` `voice`): the same DoD ElevenLabs voice (Eric, `cjVigY5qzO86Huf0OWal`). Short first-person lines for powers (chance + cooldown, not every call), each weather state when it starts, episode open/close on take control and let go, glide while floating, and a few autopilot mutters on his day. MP3s under `audio/voice/` from Hawkes Gen `audio.voice`. `day.voice` / `window.voice`: `now()`, `say(group)`, `play(id)`.
- **Neighbors** (`js/neighbors.js`, data in `day.config.js` `neighbors`; imported after `episodes.js`): three people on his avenue, plain box figures (art pass later) with their own look, home and day: **Birdie Alvarez** (gardener, yellow raincoat and straw hat, the apt block; pots at -21,9.5, the park bench at noon), **Dex Moreno** (courier, orange jacket, white helmet, parcel box on his back; the shop stoop, the plaza at lunch) and **Ines Quill** (stargazer, violet coat, glasses, a telescope; the annex, out from 16:30 through the night, in by day). Stops are `[hour, x, z, "inside"?]` and they walk between them at 80 m per sim minute. Each has an **ask** (a speech bubble when he comes within `near` 9 m in its window; answered by calling its ability — rain, sun break, lightning — within `range` 16 m; the `day:power` event is what counts), a **thanks** (1.1 s after the ask is answered) and a **surprise** (its own hour window and proximity only). Each finished thanks/surprise pays its `reward`: score (kept in localStorage `icanbe.neighbors`), Pressure back into the meter (`abilities.reset`), a toast (`#neighbor-toast`), a floating +score, stars on the name tag and a log line. Beats reset each day key. Name tags (`#nb-<id>`) show within 90 m and the Neighbors button (`#neighbors-btn`, hidden on touch) lists who is where, how far and which way. `day.neighbors`: `now()`, `events()`; the `day:neighbor` event feeds analytics `feature neighbor`. Canon: they call him by his first name only in their lines' tone, never "they" for him. Playtest: `neighbors`; `npm test` runs `scripts/check-neighbors.mjs` (data, routines, and the module in a NullEngine scene). Not done: voices, real models, neighbors on touch (no button), beats that need the player to carry something.
- **Tutorial episode** (`tutorial: true`, first in `day.config.js` `episodes.list`; `js/episodes.js`, `abilities.lock/unlock` in `js/abilities.js`): "Learn the weather" teaches Lightning, Rain, Gale, Fog and Sun break one at a time. On start every ability is locked (dashed, grey on the bar; a call is refused with reason `locked`), the first opens, and using each one (goal kind `ability`, with a `prompt` in the HUD) opens the next with a toast (`#ability-toast`, the slot glows) and tops Pressure up. Finishing or the HUD's Skip opens all; letting go only pauses it. It's offered once on a new player's first take control (localStorage `icanbe.episodes.tutorial` = done or skip; "Just walk" also counts as skip), never by chapter, and always in the Episodes menu. A bot's tab (`?playtest=` other than `tutorial-episode`) isn't offered it. Events: `day:episode` unlock / tutorial-done / tutorial-skip / tutorial-pause. Playtest: `tutorial-episode`. No touch buttons for the weather abilities yet, so on a phone only Bolt can be used (Skip is there).
- **Story parts 1 and 2** (`docs/story-arc-beat-sheet.md`; `dry-park` "Part 1: Dry" and `still-blades` "Part 2: Still" in `day.config.js` `episodes.list`, play in `js/episodes.js`): Part 1 (offered 11:40-12:15) wants Rain (R) on the park, a Sun break (X) over the plaza market, then 20 s in the plaza while the stalls fill; rain on the market soaks the stock (`kick:soak`, the stay goal waits for a sun break). Part 2 (offered 16:20-17:45 at work) wants him at Ines (154, 9.8), 10 s of Gale (V) on the annex roof (turbines spin) and every plaza stall left standing; a gale in the plaza topples one (goal fails, part scarred). Goal kinds `ability-in` (power inside a `zones` rect), `stay`, `wind-time`, `intact`. **Strain** (`episodes.strain`, per part `strain.budget` 4 / 7): each call adds its cost (lightning 2, others 1; the same call inside 60 s doubles); over budget the part is *scarred*: kick-backs (flood patch on the pond, scorch patch, blades overspeed and shut, a stall down), the HUD meter goes red, the card loses 25% and says "scarred" with a `.strainline` listing the scars; under budget it says "clean". Dialogue is data (`say["start"|"goal:<id>"|"edgy"|"kick:<id>"|"end:clean"|"end:scarred"]` = `[who, text]`), shown in `#episode-say` and the log; events `day:story` (say, kick). `day.episodes.story()` / `said()`. Not done: the Board's voice, power state (office lights). Playtest: `story-parts`.
- **Story part 3 and the endings** (`low-tank` "Part 3: Low", `episodes.endings` in `day.config.js`; logic in `js/episodes.js`): offered 22:20-23:30 in the bedtime chapter, only once Part 2 has been played (`afterPart: 2`; always in the Episodes menu). He charges the Storm Tank's mast (goal `charge`: Lightning (E) twice, `ability-in` with a `count`, standing in the `tank` zone) then rain (R) on the Tank until the new glass gauge by the tank (`ep-gauge`, `story.gauge`) fills (goal `fill`, kind `weather-time`: 5 s of weather state `rain`; lightning's own storm doesn't count). Part 3's Strain is the whole day's: `carryStrain` adds each earlier part's final Strain less 1 per sim hour since it ended (`strain.perHour`), plus its own calls (cost 1 each, no doubling: its own `strain.costs`/`stackSec: 0`). Budget 6: Strain 7-9 fires `kick:flood` (patch on the avenue, market closed for the night), 10+ fires `kick:overcast` (storm set, Board warning). **The arc** is kept in localStorage `icanbe.story.arc` (`{ parts: {1,2,3: { scarred, strain, kicks, goals, at }}, ending }`; starting Part 1 clears it). When Part 3 ends and its score card is dismissed, `pickEnding` chooses **A Fair Weather** (all three parts played clean, Tank Strain 6 or less), **C Overcast** (Tank Strain 10+, or all three scarred) or **B Heavy Weather**, and the ending card (`#ending-card`: name, scene, one line per need from `cityFared` (`park`, `turbines`, `market`, `reservoir`: ok / scar / open), his last line, the Strain total; button "Walk the city", the day carries on) is shown. `day.episodes.arc()`, `ending()`, `showEnding(id)`, `resetArc()`; events `day:episode` `arc` / `ending` and `day:story` `ending`; analytics `feature episode` has `ending`. Playtest: `story-ending` (Part 1, 2 clean, then three Part 3 runs: A, B, C). Not done: the ending stills and stings (GPU), the Board's voice, the world changing for the ending (grey sky for a week, neighbors at windows).
- **Lunch: Rooftop storm** (`lunch` in `day.config.js`; story in `docs/story-arc-beat-sheet.md` "The lunch storm"; logic in `js/episodes.js` under "rescue episodes"): a storm nobody called strands people; goals are `help` kinds, one per set piece in `ep.pieces` (Shelter: Sun break near Odile, Pim and Gus in the plaza; Rescue: Lightning near the shop for Hollis on the roof, a bolt that lands on the shop rod adds a precision bonus; Clear the street: Gale or Gust near Nell and Ravi in the avenue). A call helps the nearest unhelped person within the piece's `range` of him; a rescue refills Pressure and cooldowns. The twist fires when the roof piece is done: the sky is held on fog (`rescue.sky`, re-set whenever an ability's own weather ends), debris spawns in the avenue and the street piece begins. Each piece pays `rank.help` inside its `limit` seconds, `rank.late` after; the clock (`timer`) adds up to `rank.time`; the card shows rank S/A/B/C (`rankFor`, points over `rank.max`) and an ending line `say["end:<rank>"]`. `day.episodes.now().rescue` has score, helped, piece, twisted, rank. Events `day:story` `help` / `twist`, `day:episode` `piece` / `precision`. Playtest: `lunch-rescue`.
- **Commute home: Hurricane drive** (`commute-home` in `day.config.js`; same rescue engine as the lunch storm): the way home (west along the avenue from the office lot) is shut in four places, one set piece each: Clear the road (fallen sign, x~120: Gale/Gust/Tornado), Drain the underpass (x~97, flood-water prop: Sun break), Start the stranded bus (x~66, bus prop: Lightning jump-starts it; this piece fires the **twist**, the sky goes to `twistSky` storm), Hold the bridge open (x~10, gate prop that lowers as the window runs out: Fog calms the wind sensor). Each piece has `powers` (help) and `hurts` (a call made near the stranded: `rank.hurt` points off, the full-points window shortened by `hurtSecs` 15, `hurt:<piece>` line, the scenery gets worse: water rises, the gate lowers faster); the same key is right at one and wrong at another (Gale helps the road, hurts the bus and bridge; Rain hurts the road and the underpass). Then Get home (reach). Points: help 100 / late 60 / hurt -40 / time up to 150, max 950, rank S/A/B/C on the card (the detail line counts wrong calls). He is on foot, as before (Take control is locked in the car): driving the car himself isn't built. `day.episodes.now().rescue` has `hurt`. Events `day:story` `hurt`. Playtest: `hurricane-drive`; `npm test` checks the data in `scripts/check-episodes.mjs`.
- **Score, ranks and Challenge** (`scoring` and `challenge` in `day.config.js` `episodes`; `liveScore`, `scoreBreakdown`, `rankOf`, `challengeEp`, `challengeOpen` in `js/episodes.js`): every non-tutorial episode ends on the same card: People helped (or goals done) 400, Time left 200, Damage avoided 250 (wrong calls, Sky, kick-backs), Ability variety 150 (distinct abilities used over the episode's `variety`), as a four-row `.breakdown`, a percent and a rank S/A/B/C (`scoring.bands`); the HUD shows the live points and rank. The best (by percent, with `rank`, `points`, `cleared`) is kept per id in `icanbe.episodes.best`. A clear (every goal done) sets `cleared` for good and unlocks the **Challenge** (an indented row under the episode in the Episodes menu, `#ep-challenge-<id>`, locked until then; `episodes.start(id, via, { challenge: true })` refuses while locked): timer x `challenge.timer`, Sky budget `budget` lower, and the episode's `challenge.extra` people in its set pieces (lunch, drive). Its best is kept as `<id>#challenge`; it never touches the story arc or endings. Playtest: `score-ranks`; `npm test` checks it in `scripts/check-episodes.mjs`.
- **Episode select and progress** (`js/episodes.js`): the score card has **Next: <title>** (`.next`) and **Replay** (`.replay`) beside OK (Replay reruns the same mode, Challenge included; both wait for the ending card on Part 3). The Episodes menu rows (`#ep-row-<id>`, `data-locked`, `data-rank`) show best rank and "finished", and later episodes are locked until the one before them in `episodes.list` is finished (`episodeLock`, `episodeDone`, `nextEpisode`; the tutorial is outside the chain). `icanbe.episodes.best[id]` gained `done` (a run that reached its end: clear, time up or scarred; a let-go doesn't count). The API `start()` and in-world offers are not gated. Playtest: `episode-select`.
- **Episodes** (`js/episodes.js`, list in `day.config.js` `episodes`): four playable weather missions on his day's chapters — Morning (clear the sky), Lunch (Rooftop storm, a rescue: see the next entry), Commute home (Hurricane drive, a rescue: see the next entry; starts on the lot, not in the car), Night (timed lightning show). Taking control in a matching chapter offers that episode; the Episodes menu jumps the clock there. Goals show in a HUD; finishing (or time / let-go) shows a forecast-style score card kept in localStorage. Playtest: `episodes`.

### Taking control: how it's built

- `js/control.js` is a real module (imported by `js/app.js`, then `js/weather.js`, then `js/score.js`, then `js/powers.js`). `createMover(world, cfg)` is the movement alone:
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
  the public site too (it isn't part of the HUD). On such a screen `html.touch-ui` is set (`js/control.js`), and the
  phone layout hangs off it: stick bottom left, Jump bottom right, the power pad above Jump, Weather top left with
  Pressure under it, Quality top right, Let go top centre, Episodes bottom centre, all 44 px or more and inside the
  safe areas (`env(safe-area-inset-*)`; `index.html` has `viewport-fit=cover`). The `first-visit` playtest checks
  that none is off screen or overlapping. Quality picks low by itself on a phone (`js/look.js`; `look.info()` says
  `qualityHow`: url, saved or auto).
- **First visit** (`js/tutorial.js`, lines in `day.config.js` `tutorial`): a card the first time the page opens:
  take control, walk, jump, one lightning strike, let go (keyboard or touch hints). Skip ends it; done or skipped,
  localStorage `icanbe.tutorial` keeps it away. While it's up, the episode offer waits. A bot's tab (`?playtest=`
  other than `first-visit`, or `navigator.webdriver`) never shows it; `day.tutorial.reset()` shows it again.

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
  flight and floats down, walks back to the bed through the doors, and the stand-in plays every clip. `scripts/check-powers.mjs`
  (also under `npm test`) spends the Pressure meter dry and checks the cone, thunder delay and street helpers. `npm run build` must pass too (it takes about 4 minutes: Babylon is big).
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

**Where it's loaded.** The SDK is Hawkes Gen's, `https://hawkesgen.ai/sdk/analytics@1.js`: never a copy here
(J, 2026-10-27), so a Gen deploy updates every site at once. It's loaded with `data-product="icanbe"` on every page people see: `index.html`
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
- `feature`, one per interaction: `take_control` {via key/button/touch/gamepad}, `let_go` {via}, `glide` {via, y,
  speed} when he starts floating down, `control` {action: take or let-go, via; then back, how: walk or catch-up; glide,
  soft-land, updraft: the older list, kept}, `weather` {state, via key/wheel/touch, intensity} (only what the player
  sets, not the forecast), `power` {action: storm/bolt/gust/tornado or denied, via, power, pressure} for each power,
  `voice` {id, group, via} when a spoken line plays, `episode` {action: offer/start/goal/score/…, id, goal, pct, why},
  `tutorial` {action: show, step, skip or done, step id, seconds},
  `speed` {value, via key/click}, `pause`, `play`, `live` (back to now), `scrub`
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
