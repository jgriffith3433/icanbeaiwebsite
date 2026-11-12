# I Can Be AI: world bible

Status: **plan for the whole district.** Built pieces are marked *In*; gaps are marked *Short* or *Build*. Tone from `AGENTS.md` and `docs/voice-style.md`: he is He, plainly; lines short and matter-of-fact; weather is the drama; he never gloats. Story overlay lives in `docs/story-arc-beat-sheet.md` and playable parts in `day.config.js` `episodes` (Parts 1–3, lunch rescue, hurricane drive, light show). Open beat-sheet questions stay candidate until J settles them; this bible does not invent answers that contradict what already plays.

**Fun-review bar:** a plan that leaves between-mission emptiness, soft "planned" wishes, or text-only story beats is a **thin** world. This bible treats those as hard fails for later agents. Soft "maybe later" is not allowed under Areas / What happens / Story beats — only *In*, *Short* (named gap) or *Build* (named deliverable + acceptance).

**Vertical slice (finish before widening art or new districts):** West Avenue Home Block + the Park, Alarm through Birdie's rain ask.
Definition of done (all required):
1. Park lawn/pond day-keyed states (straw / damp / scar) visible with **no** episode HUD open.
2. Birdie's ask: speech + Rain → thanks voice + visible lawn/pond change + ≤1-line toast.
3. Apt crown landmark (parapet light strip + tomato wall) readable from the plaza approach.
4. Playtest walk driveway → bandstand: `quality.maxQuietSeconds` ≤ 10 (events every ≤8 s along the path below).

**Density bar:** under control, never more than about 10 seconds without something new to see, hear or do. Measured walk paths and their event beads are under **What happens → Density walks**. A later `micro-events` scenario must fail if two beads on a path are more than 8 s apart.

**Always-on rule (blocks "between missions" demo air):** park lawn/pond, plaza stall shells + crates, and annex turbines are **world props driven by day-keyed flags**, not episode-only meshes that dispose when the card closes. Episodes change those states; they do not own the only copy. *Today's short:* those pieces still live in `js/episodes.js` and go away when the episode ends — that is the first build queue item, not flavour.

**Build queue (ordered; do not skip ahead):**
1. **Always-on district state** — park / plaza / annex turbines permanent + day keys; acceptance: walk at noon with no episode, see stalls, spinning blades (if wind), straw or damp lawn; `micro-events` or `fill-out` extended check.
2. **Micro-life beads + night coverage** — park pigeons + second gardener pass + pond ripples; plaza cafe wipe + dusk busker; avenue signal-box spark / newspaper flap / puddle under ability rain; night beads (lit-window silhouettes, late diner, street sweeper, dog-walker, stoop cat); south avenue (z −34) and Tank→east on the same ≤8 s / ≤30 m spacing table; acceptance: `micro-events` at 03:00, 12:00 and 21:00 on every avenue segment, gap ≤8 s.
3. **Non-weather verbs (Pressure at 0 still has things to do)** — at least four verbs that never spend Pressure or start an episode: (a) pick up and carry Dex's dropped parcel to the stoop / Birdie's watering can to the pots; (b) sit on a park bench or bandstand (camera settle + ambient duck); (c) knock/enter one shop bay or the apt door (fridge hum, radio, one short interact); (d) toss a coin in the fountain and tip the busker (sfx). Acceptance: slice walk with Pressure 0 logs ≥4 distinct non-weather interactions.
4. **Story staging** — Tank loudspeaker mesh pulse + duck on Board voice; Part 2 office dim + lift crawl *before* log; ending/closing camera over four needs + voiced last line; day-end sign-off + three flashes; opening spoken or cut; acceptance: no `say`/`ending`/`day-end` beat with text alone (`quality.textOnlyBeats` = 0).
5. **Neighbor life past the ask** — each of Birdie / Dex / Ines gets 3–4 repeatable idle barks/gestures after their ask (lawn-state line, route joke, star point); one second day-keyed beat each; readable silhouettes (hat, helmet, scope) even before Gen models. Acceptance: `check-neighbors` fires non-ask lines in a 10-min walk; three frames show distinct silhouettes.
6. **Needle life** — worker + cart + skippable deck lookout; beacon sync sting; only after 1–4.
7. **Second slice gate** — shop → plaza must pass the same density + non-weather + always-on checks as the home/park vertical slice before treating the district plan as "living".
8. **Art / GPU (needs J budget)** — neighbor models, music-day/night, ending stills/stings, optional turbine Gen mesh.

## Areas

### West Avenue Home Block
- **Mood:** quiet navy morning, then the street wakes. His cutaway apt is warm and small; outside is kerb trees, shop signs starting to glow, Birdie's pots.
- **Look / sound:** apt cutaway (bed, bath, kitchen, couch); stair ramp on the north face onto the roof; street lamps, hydrants, bins, a bus stop. Birds in fair weather; his coffee cup and alarm; footsteps on sidewalk 0.06. Rain he calls wets the road with ability reflections only.
- **Size:** apt block about 16×12 m at x −24, z 0.5; walkable strip from driveway (~x −2) west to the park edge (~x −34) and east toward the shops (~x 50). Roof reachable by the north stair.
- **In / out:** day starts in bed; Take control anywhere outdoors or in cutaways (not while driving). Doors into the apt; Let go walks him back by the day's routes. East along the main avenue (z ≈ 12.6) toward the shops and plaza; north into the park.
- **In:** cutaway home, stair, street props, Birdie's pots and morning ask, his day spine (alarm → shower → coffee → out).
- **Short:** neighbor models are boxes; south of the avenue (z −34 row) is thinner dressing; no one knocks or visits the apt; interior has no ambient radio or fridge hum yet.
- **Build (slice):** apt crown light strip + tomato wall readable from mid-avenue; fridge hum + soft radio bed when inside (procedural sfx, no GPU).

### The Park
- **In (slice, `js/slice.js`):** always-on straw/damp lawn (damp after Birdie's reward), pond ripples, bandstand pigeons that scatter on walk-up/Gust/bolt, bandstand creak, coin toss at the pond (Y, no Pressure), apt crown light strip + tomato wall. Playtest `slice`.
- **Mood:** green that wants rain. Straw lawn at arc start; damp and drinking after Birdie's ask. Bandstand string lights at dusk.
- **Look / sound:** lawn 0.03, pond, flowerbeds, path lamps, benches, bandstand. Soft park hush under city hum; rain hiss when he calls it; pond splash on over-hold (kick-back).
- **Size:** rect x −34..30, z 20..68 (~64×48 m).
- **In / out:** from the home block north across the sidewalk; east toward mid-avenue and the Needle's south approach; roofs look down on it from the apt stair.
- **In:** park props, Birdie at the noon bench (−6, 22.5), Part 1 rain-on-park goal, crowd walkers on edges.
- **Short:** lawn/pond state flips only while Part 1 owns the props; quiet if you walk here with no episode.
- **Build (queue 1–2):** day-keyed lawn/pond mesh or material always visible; three micro-loops on a timer — (1) pigeons on the bandstand rail that scatter on Gust or a nearby bolt, (2) a second gardener pass with a dry can when the lawn is straw, (3) pond ripples that swell when weather is rain. Wildlife stays light; no combat critters.

### Shop Strip (mid avenue)
- **Mood:** deliveries, damp parcels, a low shopfront glow. Dex's orange moves through it.
- **Look / sound:** shop block at x 50; neon signs (BAR, NOODLES, 24H, CAFE…); stoop; stair to shop roof (Hollis's lunch rod). Car pass-bys scale with the crowd; umbrellas in rain.
- **Size:** shop ~16×12 m plus stoop and roof; strip along the avenue roughly x 36..100.
- **In / out:** avenue east/west; roof stair; door sites crowd enter/leave.
- **In:** Dex morning ask (sun break), shop roof rescue in Rooftop storm, street props and signs, crowd doors.
- **Short:** interiors of shops are facades only (no enterable shops); Dex is a box figure; between shop and plaza the filler lots still read as samey walls for stretches of walk.
- **Build (queue 2, then 5):** kerb beads on the shop→plaza stretch; dawn stoop cat (life, not combat); window shoppers or one enterable shop bay when art budget allows.

### The Plaza Market
- **Mood:** the district's open lung. Heat spoils stock until a sun break; night becomes a stage for the light show.
- **Look / sound:** paving 0.07, fountain, cafe tables, planters, Clock Tower faces lit; stalls fill on Part 1 stay goal. Fountain water, plaza chatter from crowd density, neon spill; show beams and aurora at night finale.
- **Size:** x 106–130, z 16.8–36.
- **In / out:** avenue and crosses; from shop strip west/east; from office lot further east; roofs of corner/mid blocks overlook it.
- **In:** fountain, Clock Tower, Dex lunch, Part 1 market goals, lunch Shelter set piece (Odile, Pim, Gus), Light show stage and spectators, ending/closing cards staged here in feel.
- **Short:** stall shells and produce crates dispose with the episode; off-episode noon can read as empty paving + fountain.
- **Build (queue 1–2):** permanent stall shells and crates whenever market state is open (scarred = one awning down; shut = crates stacked); one cafe server loop (wipe → stand → ambient bubble, no dialogue tree); busker on the Clock Tower steps at dinner hour (guitar sfx; tips hat if Sun break lands in the plaza). Board stays on the Tank speaker only.

### Office Lot and Annex East
- **Mood:** work light, then tired evening power. Elevator crawl when turbines are still; annex roof is Ines's sky.
- **Look / sound:** office cutaway a few blocks east on the main avenue; work lot parking; annex block x 157 with roof stair and turbines (Part 2). Keyboard taps on his day; office hum; gale whoosh on the roof; lifts/lights react to power state in the arc.
- **Size:** office cutaway rooms + lot (~parkWork 133.5, 7.8); annex 16×12 m; roofs connected by play.
- **In / out:** drive arrives at lot (Take control locked in the car); on foot from plaza west; annex stair; Hurricane drive starts on the lot heading west home.
- **In:** day spine at the desk, Part 2 Gale on annex roof, Ines routine and lightning ask, Hurricane drive open, three rooftop turbines while Part 2 runs.
- **Short:** turbines are episode props today; no hallway coworker bodies; half-lights are not a room-wide readable dim outside the card.
- **Build (queue 1, 3):** three annex turbines stay on the roof all day and spin from `weather.now()` wind / gale; Part 2 only changes power state and overspeed scar. At least two hallway coworkers as walking figures on his office spine. Half-lights = room-wide emissive dim when power is rationed, fired as an event before any log line.

### Storm Tank Yard
- **Mood:** industrial calm that turns critical at night. Blue neon band, mast that wants charge, loudspeaker of the District Board (candidate faction voice).
- **Look / sound:** gasholder at ~190, 44; lattice ribs; glass gauge in Part 3; thunder delayed by distance; Board lines as spoken dialogue when wired; rain filling the gauge.
- **Size:** tank footprint ~14 m across plus yard; east end of the district.
- **In / out:** avenue/cross from the annex; Part 3 offer in bedtime chapter; walk from plaza east.
- **In:** landmark mesh, Part 3 charge + fill goals, Strain kick floods on the avenue, ending pick after Part 3.
- **Short:** gauge and Board are episode/card anchored; no physical speaker mesh pulse; yard idle is empty.
- **Build (queue 3):** loudspeaker mesh on the Tank that animates (grille pulse + duck music) whenever Board dialogue plays; glass gauge visible whenever he is in the yard (needle tracks reservoir state even off-episode); one yard worker with a clipboard loop by day; Overcast ending keeps the Weather Warning as a looping speaker line for the rest of that day key, not only on a card.

### Needle Approach (north skyline)
- **Mood:** far signal. Red beacon and lit deck; the district's "you are here" spike.
- **Look / sound:** spire at 60, 86 (~44 m); wind around it; beacon pulse; city hum from below.
- **Size:** reserved clear around the Needle; north of the park/cross grid.
- **In / out:** north from the park or along north avenue z 76.
- **In:** landmark mesh, skyline ring/beacons in cityscape.
- **Short:** no worker, no lookout ride, approach from park north can feel empty past props.
- **Build (queue 4 — area not "done" until this ships):** maintenance worker on a ground loop around the base (tool cart roll sfx); short deck-elevator ride to a lookout ledge (30 s, skippable) that frames the Clock Tower and Tank; Sun break or Fog within 20 m syncs the beacon to a brighter pulse (one sting + Ines night chart line if she is out and in tag range). Kerb props + worker cover the park→Needle approach under the 8 s rule.

### The Roofs
- **Mood:** his playground. Stairs on apt, shop, annex; AC units, tanks, vents, antennas; lightning coils on his arms while the player steers.
- **Look / sound:** rooftop props and distinct surface zones (gravel ballast bed, metal grating and AC decks, dark tar membrane seams, and a wet roof-drain puddle basin with gutter pipe); layered weather soundscape (light rain patter on roofs vs heavy downpour, gurgling roof gutters, rain drumming on umbrellas below, 3D-panned wind gusts and flapping canvas awnings, rolling thunder delayed by strike distance vs close cracks, sunlit rooftop birds and brightened city hum, and snow-muffled street tone); Small Weather's footsteps change across gravel, metal, tar, and splash in puddles; storm gather over him on hold F; bolt crack and scorch; updraft float; camera orbit with wall pull-in.
- **Rain (js/rain.js):** a Rain cast is heavy and wet: velocity-stretched streaks leaning with the wind, a ring and a crown of droplets where each drop lands (roofs, car roofs, umbrellas, puddles, his shoulders), runnels down the facade windows, drips off gutters and awnings, three curtains of rain sweeping the skyline under the cloud deck, drops that bead and slide on the camera when it looks level or up (not on a phone), and a thicker fog so the far avenue goes soft. The existing rain sound (hiss, roof patter) is untouched.
- **Size:** three stair roofs plus filler rooftops with units; ramps and parapets.
- **In / out:** north-face stairs; jump/float between; can't Take control while driving.
- **In:** control movement (run, triple jump, float), rooftop surface zones and surface footsteps (`gravel`, `metal`, `tar`, `puddle`), layered weather soundscape with equal-power loop and state crossfades, five weather verbs (Lightning/Rain/Wind/Fog/Sun; Storm and Tornado are hold depths), lunch Hollis rescue, Part 2 turbines, smoke playtest roof bolt.
- **Short:** most filler roofs are props-only (no second stair set pieces); no roof garden or water tower climb verb beyond parkour.
- **Build:** AC fans spin with wind (code); one extra traverse prop between shop and annex roofs after queue 1.

### Main Avenue Commute
- **Mood:** the day's artery. Morning clear drive; evening can be his own storm's debris.
- **Look / sound:** asphalt 0.04, lane dashes, crosswalks, signals on a 36 s cycle; cars in two lanes; people on SIDE 3.5 m graphs. Score beds crossfade with weather; rain ambience; far siren at night.
- **Size:** avenues z 12.6 / −34 / 76 from x −48..210; crosses at x −42, 36, 100, 168.
- **In / out:** his car on the day spine; on foot under control anywhere; Hurricane drive west from lot to parkHome.
- **In:** crowd + cars, signals, weather reactions, four hurricane closures, lunch street clear (Nell, Ravi).
- **Short:** long filler walls between shop and plaza; no junction turns; micro-events not spaced yet.
- **Build (queue 2):** kerb micro-events so shop → plaza → Tank never exceeds ~8 s without one — rotating pool of vendor cart, signal-box spark (reacts to nearby bolt), newspaper box flap in wind, waiting busker move-along, puddle mirror only under ability rain. Cars turning at junctions and a daytime bus route are the next motion pass after density holds.

## Landmarks

One far-off steer-by per area (player can aim the camera and walk toward it):

| Area | Landmark | Where | Read from far |
|---|---|---|---|
| West Avenue Home Block | Apt crown + Birdie's tomato wall (raised parapet light strip) | apt north face, x ≈ −32..−29 (west of the roof ramp, which fills −28.5..−17) | warm window band and tomato wall readable from mid-avenue; stair wedge |
| The Park | Bandstand with string lights | inside park rect | warm bulbs over the lawn |
| Shop Strip | Shop roof lightning rod | shop roof | metal rod catches bolts in lunch rescue |
| Plaza Market | **Clock Tower** | plaza north edge (~tower at plaza) | four lit faces, tallest plaza piece |
| Office Lot and Annex East | Annex roof turbines (when spinning) | annex ~154, 9.8 | blades catch dusk light |
| Storm Tank Yard | **Storm Tank** + mast | 190, 44 | blue neon band, red mast beacon |
| Needle Approach | **The Needle** | 60, 86 | observation deck cyan, red tip beacon |
| The Roofs | Skyline ring beacons | district ring | night beads over fillers |
| Main Avenue Commute | Signal lights + lane dashes toward Clock Tower / Tank | junctions | red/green cycle reads the street's pulse |

Home Block landmark is a vertical-slice deliverable (crown light strip + tomato wall), not a soft wish — west must steer as clearly as the Clock Tower does from the east.

## Who lives here

### Small Weather (he/him)
Same storm caller as Dose Of Destruction (`AllTheCharacters/SmallWeather`). Black messy hair, glasses, navy tech jacket with glowing blue seams, cargo pants, glowing boots. Lives a developer's day on autopilot (`day.config.js` spine); player Take control for third-person walk/run/jump/float and weather powers. Voice: DoD Eric, short first-person; log/barks say "He", never "they". Spoken barks (`voice.spoken`, director in `js/voice.js`): take control, let go, each power's first use, rooftop rescue, neighbour thanks, day end, idle — caption clear of the ability bar, no overlap, ~5 min per-line cooldown; Voices mute separate from Sound. **Five verbs, one Charge:** Lightning (E; hold → Storm), Rain (R), Wind (V; tap Gust, hold Gale, full Tornado; G aliases Gust), Fog (C), Sun (X). Only Charge shows on the ability bar (amber bolt); the old Pressure chip is gone; Body panel **Energy** is fatigue only. Keys 1–7 and hold Q are **Sky studio** in Settings (off by default). On a phone the five verbs sit in an arc on the right with Charge as a ring; the Storm/Bolt/Gust/Tornado pad is gone. Strain ("Sky") is what the district absorbs in the arc. Reacts with barks to needs and sky changes; crowd answers his *manual* weather. Main character model is always Small Weather, never a placeholder while loading. Live log shows only what has happened; when the clock is held, status and clock say Paused.

### Birdie Alvarez
Gardener, yellow raincoat and straw hat; apt block. Stops: inside overnight, pots at −21,9.5 from 7, park bench −6,22.5 at noon, home by 20. Ask: rain for tomatoes; thanks; evening surprise (tomatoes). Canon: she asks him for rain for her tomatoes. *Short:* box figure until GPU neighbor pass. *Build (queue 5):* 3–4 idle barks/gestures after the ask (wave from pots, lawn-state comment); second day-keyed beat when lawn is damp; readable hat silhouette before Gen model.

### Dex Moreno
Courier, orange jacket, white helmet, parcel on his back; lives over the shop. Stoop by day, plaza at lunch. Ask: sun break for damp parcels; thanks; evening humming parcel surprise. Briefs and closes the lunch rescue. *Short:* box figure until GPU neighbor pass. *Build (queue 5):* idle route jokes and helmet silhouette; parcel-carry handoff as a non-weather verb.

### Ines Quill
Stargazer, violet coat, glasses, telescope; annex. Inside by day, out from 16:30 through the night. Ask: one bolt for her lens (not at her); thanks; night surprise. Reads the sky in Part 2; names the lunch cell as something "clearing its throat." *Short:* box figure until GPU neighbor pass. *Build (queue 5):* dusk star-point gesture and chart mutter; scope silhouette readable at range.

### The District Board *(candidate loudspeaker faction)*
Utilities voice on the Storm Tank speaker. Plain official tone; does not name him. Reservoir advisories and Weather Warning. *Not settled as full canon* until J answers beat-sheet Q3; lines already play in Parts 1/3 dialogue data. *Build:* physical speaker staging (queue 3).

### Pilot
The calm, dry, faintly fond AI that runs Small Weather's day — the "AI" in I Can Be AI. Keeps him on schedule and safe; the player is the part of him that wants the sky. Speaks schedule nudges at each spine block, take-over and let-go lines (let-go names the deed just done), worried lines when the sky goes chaotic, and quiet night lines. Diegetic presence: a soft holographic ring on his left wrist that pulses with Pilot's voice; radio filter on the audio; one caption line labelled Pilot. Never talks over Small Weather (queued through `js/voice.js`). Data in `day.config.js` `pilot`; director in `js/pilot.js`. See **Characters → Pilot**.

### Crowd citizens and drivers
Up to ~260 people / 64 cars on the day curve (commute, lunch, dinner, thin 2–5). Walk graph, cross on red for cars, enter/leave doors. React to ability weather: storm look-up then run; rain run / duck indoors; wind lean + hat; fog slow; sun break cheer. Named lunch/drive stranded: Odile, Pim, Gus, Hollis, Nell, Ravi, Marlo, Cass, Tamsin, Wren, Hale, Odette, Sorrel, Pike, Juno (challenge).

### Creatures and micro-life *(Build queue 2; not combat)*
- Park pigeons on the bandstand (scatter on Gust / nearby bolt).
- Dawn stoop cat on Dex's shop (sits, leaves if Storm).
- Birds remain daytime fair-weather sfx until pigeon meshes exist.

### How they react to the player
Crowd reacts to weather he sets, not to his face (half-know in Heavy Weather ending: nods — candidate until J settles Q4). Neighbors speak when he is near in their window and answer asks when he calls the right ability in range. Cars brake for him in lane. Episode stranded thank him with voice/bubble lines. Pilot comments on take-over, let-go and chaos, and nudges the schedule while the day runs itself.

## Characters

### Small Weather
- Want: to keep a quiet developer day while the sky stays his to call when something needs weather.
- Arc: lives on Pilot's schedule → player takes the sky → deeds reshape his day and the district → night rest under Pilot again.
- Moment: Take control / Let go; cold-open bolt; Birdie's rain; the light show.
- Personality: dry, patient, understated.
- Voice: DoD Eric `cjVigY5qzO86Huf0OWal`.
- Animations: idle, walk, talk (idle stance with a small hand gesture while his voiced line plays; the caption and wrist ring pulse with it), run, jump, fall, float, cast, throw, sit, type, phone, lie, side, recline (`models/small-weather.glb`); hero beats lookup (clear-sky idle look up), windbolt (Lightning wind-up; Mixamo-posed stand-in), windrain (Rain/Fog wind-up; Gen), triumph (fist after Storm/Tornado), shelter (rain shrug), window (evening sit-at-the-window) in `models/clips/` (lookup/windrain/triumph/shelter/window Gen-baked); two-bone foot IK plants boots on roofs, stairs and the ramp.

### Pilot
- Want: keep Small Weather on schedule and safe; hand the sky back by five.
- Arc: runs the quiet day alone → yields the sky on take-over with a dry aside → names what the player did on let-go → worries when chaos spikes → holds the night while he sleeps.
- Moment: every Take control and Let go (voiced Pilot line + wrist-ring pulse); schedule nudge at each spine block on a 1200× day.
- Personality: calm, dry, fond.
- Voice: gv_c2c9cdffeae27b99
- Animations: idle (dim wrist-ring pulse), walk (ring follows the left wrist while he moves), talk (bright voice-synced pulse). No separate body — Pilot is the ring and the radio voice.

### Birdie Alvarez
- Want: rain for her tomatoes.
- Arc: morning ask → rain thanks → evening tomato surprise.
- Moment: Rain near her pots or park bench; lawn drinks.
- Personality: warm, plain, grateful.
- Voice: dialogue cast `birdie` (ElevenLabs id in `day.config.js` `dialogue.cast`).
- Animations: idle, walk, talk (peoplekit; Gen model later).

### Dex Moreno
- Want: dry parcels and a clear lunch plaza.
- Arc: sun-break ask → thanks → briefs the lunch rescue.
- Moment: Sun break over the shop stoop or plaza.
- Personality: brisk, practical, upbeat.
- Voice: dialogue cast `dex`.
- Animations: idle, walk, talk (peoplekit; Gen model later).

### Ines Quill
- Want: a clean sky reading for her lens and charts.
- Arc: bolt ask → thanks → night surprise; names the lunch cell.
- Moment: Lightning near the annex (not at her); dusk telescope.
- Personality: precise, quiet, curious.
- Voice: dialogue cast `ines`.
- Animations: idle, walk, talk (peoplekit; Gen model later).

## What happens

### Density walks (acceptance beads; ≤8 s / ≤30 m between)
A later playtest walks these under control at walk speed and fails if quiet > 10 s (`quality.maxQuietSeconds`). Each bead is something new to see, hear or do. Spacing is a table in metres on every avenue segment (auto-checked from placed beads), not only the three hand walks.

1. **Driveway → bandstand (slice path):** kerb tree → Birdie pots (ask, watering can carry, or idle wave) → bus stop panel → park path lamp → pond ripple or gardener → bandstand pigeons/string lights / sit → Birdie noon bench if in window.
2. **Shop → plaza → Tank (second slice):** shop neon buzz → Dex stoop / parcel carry / door knock → signal-box spark or crosswalk wait → vendor cart → fountain coin toss + Clock faces → cafe wipe or stall crates / tip busker → annex turbines (spin or still) → Tank neon + speaker idle hiss → yard clipboard worker by day.
3. **Park north → Needle:** path lamp → park edge crowd → cart roll / worker → Needle beacon pulse → (optional) deck lookout sting.
4. **South avenue z −34 (full length):** same kerb pool as the main avenue; no stretch without a bead every ≤30 m.
5. **Night (23:00–06:00) and 2–5 lull:** *In:* lit-window rooms on schedules (dusk on ~18:00–20:00, bedtime off after 23:30; apt/office follow Small Weather's day), neon flicker/buzz, lamp pools (8 nearest dynamic / 4 on phone), car headlight flares, wet-street reflections (SSR high, reflection probe low), bolt flicker on windows. *Build (queue 2):* late diner, street sweeper, dog-walker, stoop cat — lights alone do not meet the ≤8 s night density rule. Playtest: `night-glow`.
6. **Apt ↔ shop ↔ annex roofs:** spinning AC / vent puff / antenna sway with wind, plus one parkour prop bead between stairs — roofs are on the density table, not only parkour and powers.

### West Avenue Home Block
- **Interactions:** Take control / Let go; walk, run, jump, float; call Rain for Birdie; climb apt stair; knock props with Gust; look through cutaway rooms; **Build:** carry watering can to pots; knock/enter apt (fridge hum, radio); sit on stoop.
- **On their own:** his autopilot morning; Birdie's pot watering path; crowd thin→commute; lamps by sky; day-end moment when the clock rolls.
- **Ambient:** birds, city hum, footsteps, alarm/coffee diegetic day sounds, title/score beds under the page.
- **Over time:** model-constant look; windows follow occupant schedules (dusk on, bedtime off) and Small Weather's apt lights; lamps and neon by dusk/night; opening once per new player.
- **Short:** no fridge/radio loop; few porch interactions after Birdie goes in.

### The Park
- **Interactions:** Rain (and over-hold overflow), sit near Birdie for ask/thanks, bolt scorch grass, explore pond/bandstand; **Build:** sit on bench/bandstand (camera + ambient); pigeon scatter without spending Pressure (walk-up or Gust).
- **On their own:** Birdie noon bench; park lamps; lawn state after Part 1 (*should* persist — Build queue 1); crowd on edges.
- **Ambient:** softer bed under trees; rain on leaves when wet; bandstand quiet creak (Build).
- **Over time:** straw→damp→scar brown patch across the arc day.
- **Short:** need always-on state + 2–3 microevents so a non-episode walk still breathes.

### Shop Strip
- **Interactions:** Dex sun break; shop roof bolt/rod precision; shove bins; observe crowd doors; Storm hold; **Build:** carry Dex's dropped parcel to the stoop; knock/enter one shop bay; dawn stoop cat pet/leave.
- **On their own:** Dex routine; shop neon; people enter shops; umbrellas.
- **Ambient:** neon tube buzz (sfx under the signs at night), car pass-bys, courier shoes.
- **Over time:** dusk neon weight with Gen textures when present (`textures/neon/*.webp`); lunch cell drifts east toward Tank.
- **Short:** enterable shop or window shoppers would kill empty-facade feel (queue 5 / art).

### Plaza Market
- **Interactions:** Sun break / Fog for stock; stay while stalls fill; Shelter sun breaks; Light show cues (E/R/C/V/X on beat); fountain visit; neighbor tags; **Build:** toss coin in fountain; tip dusk busker; sit at cafe table.
- **On their own:** Dex lunch; spectators walk in for finale; fountain; Clock faces; stall topple on bad gale.
- **Ambient:** fountain, crowd lunch peak, show whoosh/thunder, closing city-fared lines voiced.
- **Over time:** market open/scar/shut flags; night show aurora.
- **Short:** permanent stall dressing + cafe/busker loops missing for off-episode noon.

### Office Lot and Annex East
- **Interactions:** Gale hold on turbines; Ines bolt ask; start Hurricane drive; desk is autopilot until Take control.
- **On their own:** lights/lifts with power (*should* be visible — Build); Ines telescope; evening commute crowd.
- **Ambient:** HVAC, keyboard (day), roof wind, Board distant from Tank.
- **Over time:** still blades → spinning → overspeed scar.
- **Short:** coworkers as bodies; turbines permanent.

### Storm Tank Yard
- **Interactions:** Lightning charge mast (count); Rain fill gauge; read Strain kick-backs (flood, overcast hold).
- **On their own:** neon band; Board advisories at part beats; gauge motion in Part 3.
- **Ambient:** industrial hum, thunder, loudspeaker grit.
- **Over time:** reservoir empty→full / flood / warning loop (ending C).
- **Short:** idle yard life; speaker prop animation when Board speaks.

### Needle Approach
- **Interactions:** walk around base; deck-elevator lookout (skippable, Build); Sun break or Fog beacon-sync; hear Ines night chart line when in range.
- **On their own:** maintenance worker loop (Build), beacon, skyline lamps, wind.
- **Ambient:** high wind bed, cart roll, distant avenue, beacon sting on sync.
- **Over time:** beacon brighter in storm; worker packs up in heavy rain.

### The Roofs
- **Interactions:** full power set; parkour; walk across gravel, metal grates, tar seams and puddle drain basins (surface footsteps and splashes); lunch Hollis; Part 2 gale; smoke bolt.
- **On their own:** AC fans spin with wind (Build); antennas; roof gutters trickle when wet; crowd below.
- **Ambient:** layered weather soundscape (roof rain patter vs heavy downpour, gutters, umbrella patter below, 3D-panned wind gusts, flapping awnings, distance-delayed thunder, sunlit birds, muffled snow city), ability whoosh/crack.
- **Over time:** dusk→night bloom; wet sheen only on ability weather.
- **Short:** more traverse routes between the three stairs.

### Main Avenue Commute
- **Interactions:** weather abilities; Gust/Tornado debris; Hurricane four closures (help vs hurt powers); crosswalk timing; brake-test by standing in lane carefully.
- **On their own:** crowd curve, signals, weather forecast (off by default) vs ability weather, sirens at night.
- **Ambient:** score + ambience beds, cars, birds, siren.
- **Over time:** rush hours; episode debris; flood patches.
- **Short:** junction turns; kerb micro-events every ~8 s of walk east.

## Story beats

Every beat below is lived as gameplay, an in-world staged event (camera, props, crowd), sound, and/or a Hawkes Gen voice line. HUD copy is at most one short prompt line; a beat that is only a paragraph on a card is a **fail** (`quality.textOnlyBeats`).

| # | Beat | Where / when | How it is lived (must have ≥1 of: gameplay, camera/prop event, sfx, voice) | Text allowed |
|---|---|---|---|---|
| 1 | Title and first Play | every visit / first Play | Title skyline orbit + title bed; opening five beats on his model spoken (Eric) or Skip/cut — never a silent text wall | Skip label only |
| 2 | You take over | on `day:control` take | Camera push to shoulder + one first-person line + control sting | none beyond the line if voiced |
| 3 | Learn the weather | under control, first offer | Lock→unlock five abilities; real casts E/R/V/C/X; toast ≤1 line | prompt ≤1 line |
| 4 | Birdie's rain | morning–noon, pots or park | Bubble ask; Rain near her; thanks voice; lawn/pond respond; toast ≤1 line | toast ≤1 line |
| 5 | Dex / market opens | noon plaza | Ask + Sun break; stay while stalls/citizens fill; Dex thanks; Board evening advisory on Tank **speaker** (voice + pulse) | toast ≤1 line |
| 6 | Rooftop storm lunch | ~12:20 | Uncalled cell; Dex phone brief (voice); Shelter / Hollis rod / street clear; fog twist + debris; Ines throat line (voice); rank end line spoken | HUD goals ≤1 line each |
| 7 | Still blades | work / evening annex | Office lights dim + lift crawl **before** any log; Ines; Gale 10 s spins turbines (visible + whoosh); intact stalls; kick: overspeed + stall topple | log may echo after |
| 8 | Hurricane drive | ~17:53 lot→home | Board wind advisory (voice); four closures help/hurt; bus twist; reach parkHome; Board close-out by rank (voice) + his one line | HUD ≤1 line |
| 9 | Tank low + ending | ~22:20 Tank / after Part 3 | Board critical on pulsing speaker; Ines charge line; two Lightning hits + mast flash/thunder; Rain fills gauge (bolt-storm does not count); Strain as flood patch or held storm + Warning on speaker; **ending:** in-engine camera (or Gen still once budgeted) over four needs, then his last voiced line; card is caption only | caption under camera |
| 10 | Light show finale | ~22:05 plaza | Walk into plaza; 18 cues on beat; stage beams/pools/aurora; grand salvo; closing holds crowd (Birdie, Dex, Ines) while cityFared stingers + his last line by rank are spoken | card captions audio |
| 11 | Neighbor surprises | evening windows | Bubble + reward + Pressure; spoken when clips exist, else babble + bubble — never log-only | toast ≤1 line |
| 12 | Day end recap | clock rolls next day | Dim score; sign-off voice; three in-world flashes tied to log events; one last spoken breath; Skip/Esc/timer | ≤1 line under flashes |
| 13 | Crowd weather breath | any day under control | Manual weather → look-up, run, hats, cheer, umbrellas, wipers; hold then fade | none |
| 14 | Pilot on the wrist | every day / take / let-go | Schedule nudge + radio chirp + wrist-ring pulse; take-over and let-go Pilot lines (let-go names the deed); worried on chaos; night hold | caption ≤1 line labelled Pilot |

### Beats that must not stay text-only (hard fails until fixed)
- Opening lines → voice (Eric) or cut.
- Board advisories → loudspeaker mesh pulse + voice + world audio duck.
- Ending / closing → camera or still of the district + voiced last line; card text is caption only.
- Day end recap → sign-off voice + three staged flashes; no recap that is only a list of sentences.
- Part 2 power ration → office lights dim and lift audio crawl *before* any log line.

### What already exists vs short
- **In:** neighbors (box figures + beats), Parts 1–3, lunch rescue, hurricane drive, light show, tutorial, opening (text beats), moments, crowd reactions, landmarks, cityscape density, spoken dialogue pipeline for story/neighbor lines (~104 clips), Strain/endings as cards.
- **Must build next (matches fun-review gaps, same order as Build queue):** (1) always-on park / plaza stalls / annex turbines + day-keyed states; (2) micro-life + night/south-avenue density beads + playtest; (3) four non-weather verbs with Pressure at 0; (4) Tank loudspeaker + day-end flashes + ending camera/voice (`textOnlyBeats` = 0); (5) neighbor idle life past the ask + silhouettes; (6) Needle life; (7) second-slice gate shop→plaza; (8) GPU art when J approves budget.

### Canon flags (do not quietly flip)
- Storm Tank as reservoir, District Board identity, how much the district "knows," and Ines's larger "pulling" hook stay tied to `docs/story-arc-beat-sheet.md` open questions / story-spec recommendations. Playable arc uses the recommendations; bible treats them as **working canon for builds** until J overrides.
- He/him only for Small Weather; neighbors use his first name in tone, never "they" for him.
- Main character model is always Small Weather, never a placeholder while loading.

## Cold open (first Play)
- **Story beat:** dusk on the apt roof (19:00). A storm cell he didn't call rolls in over the avenue; the shop roof's lightning rod is the only thing he says is his. His first bolt lights the avenue: the lamps stutter, the street looks up, Birdie (on the avenue below the apt block) calls up that her tomatoes want rain, and he says "Rain. I can do that." That is the seed of her morning rain ask.
- **Voice lines:** He "That storm isn't mine. The rod on the shop roof is." / Birdie "Small Weather, up on the roof! If you're throwing weather, send my tomatoes some rain." / He "Rain. I can do that."

## The city remembers (js/memory.js)

- **Areas:** the park lawn (green after rain), the avenue (scorch, puddles, toppled bins, a leaning sign), roofs and plaza (scorch where a bolt landed), Birdie's tomato wall (fuller after her rain).
- **Landmarks:** the scorch on the road, the leaning sign by the kerb, the green lawn seen from the bandstand.
- **Who lives here:** Birdie's tomatoes answer her rain; the pigeons and the crowd are unchanged. No new characters.
- **What happens:** the deeds he does under control (asks answered or botched, each power by zone, rescues, scars, endings) are kept by real local date in `icanbe.memory`. Marks are full for the rest of that real day and fade over 3 real days; 20 decals at most, 6 on a phone.
- **Story beats:** none new. The city simply shows what he did, the way the Goose's bell pile does: come back later the same day and it's still there.

## He remembers (Let go, his day, the neighbors; js/deeds.js, js/schedule.js `remembers`)

Letting go hands him back as someone who noticed what you did together. Deeds (memory.js) become **facts** (`birdieRain`, `parkFlood`, `storm`, `roofRide`, `botched`, `answered`, `botched.dex`...) for today and yesterday.
- **Let go:** he says one first-person line naming the deed just done (`voice.spoken` `deed-<birdie|botched|flood|roofs|storm|wind|fog|sun|rain|rescue|answered>`), most telling first; a phone shows it on one line.
- **His day changes** (a step or pool entry with `remembers`, spoken through its `say`; time only from `fill` steps, so no block ever starts late): morning, he steps out with his coffee to Birdie's pots after her rain (she waves) and checks the sky on the step after a storm; at the desk he walks to the window to watch the clouds; lunch, he keeps his eyes off the window after a botched ask and rereads a thanks; the drive home slows by the green park; at dusk home, after roof riding, a minute up on the apt roof (the city's stair), and a nod to Birdie packing up; on the couch he mutes the TV to watch the sky; at the computer he opens a photo someone sent.
- **Birdie, Dex and Ines** each have a voiced greeting for each tone (`remember: { helped, botched }`), once a day when he walks up: Birdie's tomatoes still talk about the rain; Dex's parcels stayed dry, or came out soggy "no hard feelings, some"; Ines still has the blue on her sensor, or stayed up anyway.
- **Barks warm** over the days he has played with the sky (`barks.warm`: from 1, 3 and 6 days).
- **The day-end card** speaks two deeds of the day (`recap-<deed>`), one caption line at a time; a quiet day shows two log rows.

## Today's request (js/daily.js, config `daily`)

- **Areas:** the title screen (one line under his name), and wherever the asker stands: Birdie's stoop at the apt block, the shop stoop (Dex, Hollis), the annex (Ines), the plaza stalls (Odile, Pim, Gus), the crosswalk (Nell) and the paper stand (Ravi) on the avenue.
- **Landmarks:** the reward each answer leaves for the rest of that real day: bunting on two posts (Birdie, Odile, Hollis, Nell), a string of glowing lanterns (Dex, Pim, Gus, Ravi, Hollis), spinning pinwheels (Dex, Gus, Nell, Ravi) and an easel with Ines's photograph of the weather he called (fog, wind, sun).
- **Who lives here:** Birdie, Dex and Ines ask three times each across the 21-day cycle; Odile, Pim, Gus, Hollis, Nell and Ravi (the people he helped in the lunch storm and the plaza market) ask twice each and stand at their spot all day while the ask is theirs. Same voices as their story lines; the thanks keeps each one's own turn of phrase.
- **What happens:** each real local date one ask is picked (date times 5 modulo 21, so no ask repeats in any 21 dates): a weather moment at a place and in a time window ("Fog over the plaza at dusk for Ines's photo", "Wind to spin the annex turbines before 6 PM"). The title says it. A "!" over the asker (a 52 px tap target) says it again and the asker says it aloud, voiced, when he walks up. Calling the power inside the place and window answers it: a voiced thanks, Charge handed back, askAnswered and dailyAnswered in day.memory (so the neighbors' remembered greetings and his Let go line follow), and the reward stays until the date turns. Next day the title adds "Yesterday: you brought Dex the sun". When the daily ask is a neighbor's, that neighbor's usual morning ask gives way to it.
- **Story beats:** the retention loop: a neighbour you know asks for one thing, you do it, and the street keeps the thanks. No new canon: citizens keep their episode names, Birdie's pots and Ines's sensor stay as they are.

## Turning points (js/moments.js `play`, `moments.turning` in day.config.js)

Each episode's big beat is seen and heard in the city, not read as a toast: a short moment (8 s at most, skippable with Skip, a tap or Esc) where the camera leaves him, orbits the place and the event happens there, a music sting swells, and the episode's own voiced line is the one caption.
- **Part 1, the drought breaks (the park):** the high camera over the lawn as the rain lands; the straw lawn greens, Birdie: "Look at them drink. Bless you."
- **Part 2, the roofs have power (the annex and the office):** the blades spin up, the lamps stutter, then the office lights come back from their brown-out; Ines: "They're turning. Do you see how they turn?"
- **Part 3, the Tank is full (the Storm Tank):** the glass gauge flares full and the Board's horn on its post by the gauge lights and pulses; the Board: "Reservoir level: full." (or "...And the sky is not done." when scarred).
- **Rooftop storm, the twist (the shop roof and the avenue):** the rain stops, the fog comes in and the lamps stutter, junk in the avenue; Ines: "That wasn't rain. That was something clearing its throat." He: "It's moving. Not passing."
- **Hurricane drive, the bridge closes (the bridge):** the camera down the avenue, the gate arm swings down as the Board warns "The bridge will close on high wind."
The stings are synthesized (`score.momentSting`): warm swell and rain shimmer, rising saws, low brass and the Board's two flat tones, a minor cluster and thunder, two far tolls. The episode's clock waits while a moment plays.

## Wind and fog you can see (js/windfog.js, config `windfog`)

- **Areas:** everywhere he can stand. The wind is felt most where the district has cloth and green: the street trees and planters along the avenues, the park's flowerbeds, the shop and annex roofs (a laundry line each on the west edge), the apt roof (the corner flag pole and a bedsheet on a line, both hero cloth), and the plaza (a flag pole at each north corner, one of them hero cloth). The fog comes from the river, which lies north of the district (+z, past the north avenue).
- **Landmarks:** the flags on the roof corners of nine blocks, streaming downwind; the hero flag on the apt roof, the bedsheet beside it, and the plaza's flag: three small simulated cloths that whip and snap when he calls a Gust (desktop; a phone gets the same flags in a vertex shader).
- **Who lives here:** the walkers. Ones who carry an umbrella open it when the wind comes up, and a strong gust turns it inside out, spinning off downwind on its stick; the pavement's litter (leaves, papers) is pulled into three slow eddies.
- **What happens:** a Gust (tap Wind) is a strong wind for about three seconds that dies away over ten: ribbons of white streak along the way he faces, leaves and papers swirl through the eddies, the crowns of the trees lean and shiver, the awnings flap, the flags snap out, umbrellas flip. A Gale holds it. Fog (C) slides a bank of ground-fog slices in from the north in about three seconds: the streets fill with layered drifting white, the lamps at dusk hang light shafts in it, cars cut headlight cones, and three veil rings take the far skyline out a ring at a time. Both ease out with the weather's own timing.
- **Story beats:** none of its own. It is the sky answering him: the beat is the street reacting (umbrella snaps, a leaf storm, the skyline swallowed), told by picture and sound, with no text.
- **Not done:** the Babylon cloth is a small verlet sim (no collisions with the pole or the roof); tree shadows don't sway; wind through the neighbours' own clothes, the model's coat, and the Fog's sound bed need art and Gen audio.

## The five chapters (js/moments.js `chapter`, config `arc`; canon, supersedes `docs/story-arc-beat-sheet.md` where they disagree)

The episodes are one arc of five chapters. Each chapter has a line (what he wants), its episodes, and an opener: an in-engine scene of 20 s at most that plays before the first episode started in that chapter (once per player; the Episodes menu groups episodes by chapter under the chapter's name and line, and the story order is the chapters' order).
- **Areas:** each opener hangs its title 34 m up over a place and orbits it, above every roof: Ch1 over the apt block and avenue, Ch2 over the park, Ch3 over the annex and its turbines, Ch4 over the shop and the avenue, Ch5 over the plaza.
- **Landmarks:** the title itself. Ch1-4: white cloud puffs that form the letters one by one (shaded undersides). Ch5: a lit neon billboard that flickers on. It scales to the screen so a phone shows the whole title. Never a text card.
- **Who lives here:** Small Weather (his Eric voice, `dlg-He-*` clips) and Pilot (`gv_c2c9cdffeae27b99`, radio filter, `pilot-chapter-N` clips) speak in each opener. Birdie, Dex and Ines are the "street" Ch2 is about.
- **Characters:** Small Weather wants the sky (Ch1), to answer what the street asks (Ch2), to learn what each call costs (Ch3), to reach the people stuck in it (Ch4), and to give the city a show (Ch5). Pilot goes from schedule-keeper (Ch1: "The sky is not on it"), to bookkeeper (Ch2, Ch3: "You are close to the limit"), to doubter (Ch4: "You can also hurt them"), to the one who hands over the sky (Ch5: "Tonight the whole sky is yours").
- **What happens:** Opener = the camera sweeps round the sign, the four-note motif plays (A C E D) with the chapter's sting, he and Pilot trade two spoken lines (one caption line at a time), then the episode starts. Skip: the bottom button (48 px), a tap anywhere, or Esc; it still starts the episode.
- **Story beats:** Ch1 The Sky ("He wants it": Learn the weather, Clear the sky). Ch2 The Neighbours ("The city needs him": Part 1 Dry). Ch3 The Long Drought ("Power has a cost": Part 2 Still, Part 3 Low; Strain and the endings). Ch4 Storm Chasers ("He saves people. Pilot doubts him": Rooftop storm, Hurricane drive). Ch5 The Night Show ("Pilot gives him the sky": the Light show and its closing). The Episodes chain follows this order.
- **Lines:** Ch1 He "Every day runs on rails. The sky is the one thing that doesn't." / Pilot "Schedule says desk. The sky is not on it." Ch2 He "Birdie's tomatoes. Dex's parcels. The whole street is asking." / Pilot "Seven requests logged. Answer them in order." Ch3 He "Every call costs something. The district keeps count." / Pilot "So do I. You are close to the limit." Ch4 He "Somebody is stuck out there. I can reach them." / Pilot "You can also hurt them. Think before you call." Ch5 Pilot "Tonight the whole sky is yours. No schedule." / He "Then let's give them a show."

## The painted sky (js/sky.js, config `sky`)

The sky is a painted, moving thing: dawn peach at 6:30, a bright cumulus noon, a golden-hour sun low in the west, an amber-and-navy dusk, and a starry night with the moon to the right of the default view. Weather is the drama: a Storm or Lightning thickens and darkens the cloud deck and brings in the storm shelf cloud; every strike lights the deck from inside; Sun break tears a ragged gap with a sun in it and god rays through it (high quality), and the glass and wet streets reflect whichever sky is up. No new characters or areas; Small Weather's line "Sky's mine for a minute." is the beat this serves.

## Sun-break aftermath (js/aftermath.js, config `aftermath`)

- **Areas:** the whole district under an open sky — roofs, asphalt, car bonnets, gutters, awnings, the apt/shop/annex roofs where pigeons land.
- **Landmarks:** the rainbow arc opposite the sun at 42° (shader ribbon; always on, including phone), steam wisps off wet surfaces, dripping gutters after the rain stops.
- **Who lives here:** the crowd (umbrellas fold, a few shop doors open), bandstand pigeons that relocate to a roof, Dex Moreno when he is near (his existing dry-parcels thanks).
- **Characters:** Dex — Want: dry parcels; Moment: Sun break after rain, he says "Dry as a bone. I owe you a delivery." if he is within ~28 m (no new line).
- **What happens:** Rain or a storm marks the game clock; a Sun break within 2 game minutes fires the aftermath — steam ~20 s, rainbow ~28 s (fades with cloud cover), drips ~30 s (js/rain.js `afterDrip`), puddle sparkles, birds home, umbrellas close, shop owners step out; the render grade already warms from `weather.now().sun`. Phone: half steam and drip counts; rainbow stays. Playtest: `sun-aftermath`.
- **Story beats:** clearing a storm feels like a reward — told by steam, the rainbow, dripping gutters, umbrellas folding and Dex's voice, not a text card.
