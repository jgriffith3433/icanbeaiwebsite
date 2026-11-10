# I Can Be AI: world bible

Status: **plan for the whole district.** Built pieces are marked *in* under each area; gaps are marked *short*. Tone from `AGENTS.md` and `docs/voice-style.md`: he is He, plainly; lines short and matter-of-fact; weather is the drama; he never gloats. Story overlay lives in `docs/story-arc-beat-sheet.md` and playable parts in `day.config.js` `episodes` (Parts 1–3, lunch rescue, hurricane drive, light show). Open beat-sheet questions stay candidate until J settles them; this bible does not invent answers that contradict what already plays.

**Vertical slice start:** West Avenue Home Block + the Park (Alarm through Birdie's rain ask). Finish that bar before widening art or new districts. Slice definition of done: always-on park state (straw/damp/scar without an episode flag), Birdie's full ask as voice + world change, apt crown landmark readable from the plaza approach, and no quiet stretch over 10 s on the walk from driveway to bandstand.

**Density bar:** a player walking under control never goes more than about 10 seconds without something to see, hear or do. Every area below lists dressing, a landmark, life, ambient sound and several kinds of interaction. Where the build falls short today, the shortfalls are named so the next agent builds to this, not past it.

**Always-on rule (fixes the "between missions" empty air):** park lawn/pond, plaza stalls and cafe life, and annex turbines exist in the world every hour of the day key, driven by day-keyed state flags — not only while an episode HUD is up. Episodes change those states; they do not spawn the only copy of the scenery.

## Areas

### West Avenue Home Block
- **Mood:** quiet navy morning, then the street wakes. His cutaway apt is warm and small; outside is kerb trees, shop signs starting to glow, Birdie's pots.
- **Look / sound:** apt cutaway (bed, bath, kitchen, couch); stair ramp on the north face onto the roof; street lamps, hydrants, bins, a bus stop. Birds in fair weather; his coffee cup and alarm; footsteps on sidewalk 0.06. Rain he calls wets the road with ability reflections only.
- **Size:** apt block about 16×12 m at x −24, z 0.5; walkable strip from driveway (~x −2) west to the park edge (~x −34) and east toward the shops (~x 50). Roof reachable by the north stair.
- **In / out:** day starts in bed; Take control anywhere outdoors or in cutaways (not while driving). Doors into the apt; Let go walks him back by the day's routes. East along the main avenue (z ≈ 12.6) toward the shops and plaza; north into the park.
- **In:** cutaway home, stair, street props, Birdie's pots and morning ask, his day spine (alarm → shower → coffee → out).
- **Short:** neighbor models are boxes; south of the avenue (z −34 row) is thinner dressing; no one knocks or visits the apt; interior has no ambient radio or fridge hum yet.

### The Park
- **Mood:** green that wants rain. Straw lawn at arc start; damp and drinking after Birdie's ask. Bandstand string lights at dusk.
- **Look / sound:** lawn 0.03, pond, flowerbeds, path lamps, benches, bandstand. Soft park hush under city hum; rain hiss when he calls it; pond splash on over-hold (kick-back).
- **Size:** rect x −34..30, z 20..68 (~64×48 m).
- **In / out:** from the home block north across the sidewalk; east toward mid-avenue and the Needle's south approach; roofs look down on it from the apt stair.
- **In:** park props, Birdie at the noon bench (−6, 22.5), Part 1 rain-on-park goal, crowd walkers on edges.
- **Required next (not optional flavour):** day-keyed lawn/pond mesh or material states always visible; three micro-loops on a timer so a non-episode walk still breathes — (1) pigeons on the bandstand rail that scatter on Gust or a nearby bolt, (2) a second gardener pass with a dry can when the lawn is straw, (3) pond ripples that swell when weather is rain. Wildlife stays light; no combat critters.

### Shop Strip (mid avenue)
- **Mood:** deliveries, damp parcels, a low shopfront glow. Dex's orange moves through it.
- **Look / sound:** shop block at x 50; neon signs (BAR, NOODLES, 24H, CAFE…); stoop; stair to shop roof (Hollis's lunch rod). Car pass-bys scale with the crowd; umbrellas in rain.
- **Size:** shop ~16×12 m plus stoop and roof; strip along the avenue roughly x 36..100.
- **In / out:** avenue east/west; roof stair; door sites crowd enter/leave.
- **In:** Dex morning ask (sun break), shop roof rescue in Rooftop storm, street props and signs, crowd doors.
- **Short:** interiors of shops are facades only (no enterable shops); Dex is a box figure; between shop and plaza the filler lots still read as samey walls for stretches of walk.

### The Plaza Market
- **Mood:** the district's open lung. Heat spoils stock until a sun break; night becomes a stage for the light show.
- **Look / sound:** paving 0.07, fountain, cafe tables, planters, Clock Tower faces lit; stalls fill on Part 1 stay goal. Fountain water, plaza chatter from crowd density, neon spill; show beams and aurora at night finale.
- **Size:** x 106–130, z 16.8–36.
- **In / out:** avenue and crosses; from shop strip west/east; from office lot further east; roofs of corner/mid blocks overlook it.
- **In:** fountain, Clock Tower, Dex lunch, Part 1 market goals, lunch Shelter set piece (Odile, Pim, Gus), Light show stage and spectators, ending/closing cards staged here in feel.
- **Required next:** permanent stall shells and produce crates at noon–evening whenever market state is open (scarred = one awning down; shut = crates stacked); one cafe server loop (wipe table → stand → bubble ambient, no dialogue tree); busker on the Clock Tower steps at dinner hour (guitar sfx, tips hat if Sun break lands in the plaza). Board stays on the Tank speaker only.

### Office Lot and Annex East
- **Mood:** work light, then tired evening power. Elevator crawl when turbines are still; annex roof is Ines's sky.
- **Look / sound:** office cutaway a few blocks east on the main avenue; work lot parking; annex block x 157 with roof stair and turbines (Part 2). Keyboard taps on his day; office hum; gale whoosh on the roof; lifts/lights react to power state in the arc.
- **Size:** office cutaway rooms + lot (~parkWork 133.5, 7.8); annex 16×12 m; roofs connected by play.
- **In / out:** drive arrives at lot (Take control locked in the car); on foot from plaza west; annex stair; Hurricane drive starts on the lot heading west home.
- **In:** day spine at the desk, Part 2 Gale on annex roof, Ines routine and lightning ask, Hurricane drive open, three rooftop turbines in the episode.
- **Required next:** the three annex turbines stay on the roof all day and spin from `weather.now()` wind / gale; Part 2 only changes power state and overspeed scar. At least two hallway coworkers as walking figures on his office spine (nod already in day lines). Half-lights are a room-wide emissive dim when power is rationed, readable without the episode card.

### Storm Tank Yard
- **Mood:** industrial calm that turns critical at night. Blue neon band, mast that wants charge, loudspeaker of the District Board (candidate faction voice).
- **Look / sound:** gasholder at ~190, 44; lattice ribs; glass gauge in Part 3; thunder delayed by distance; Board lines as spoken dialogue when wired; rain filling the gauge.
- **Size:** tank footprint ~14 m across plus yard; east end of the district.
- **In / out:** avenue/cross from the annex; Part 3 offer in bedtime chapter; walk from plaza east.
- **In:** landmark mesh, Part 3 charge + fill goals, Strain kick floods on the avenue, ending pick after Part 3.
- **Required next:** a physical loudspeaker mesh on the Tank that animates (grille pulse + duck music) whenever Board dialogue plays; glass gauge visible whenever he is in the yard (needle tracks reservoir state even off-episode); one yard worker with a clipboard loop by day; Overcast ending keeps the Weather Warning as a looping speaker line in the world for the rest of that day key, not only on a card.

### Needle Approach (north skyline)
- **Mood:** far signal. Red beacon and lit deck; the district's "you are here" spike.
- **Look / sound:** spire at 60, 86 (~44 m); wind around it; beacon pulse; city hum from below.
- **Size:** reserved clear around the Needle; north of the park/cross grid.
- **In / out:** north from the park or along north avenue z 76.
- **In:** landmark mesh, skyline ring/beacons in cityscape.
- **Required life loop (must ship before treating this area as done):** a maintenance worker on a ground loop around the base (tool cart roll sfx); a short deck-elevator ride to a lookout ledge (30 s, skippable) that frames the Clock Tower and Tank; Sun break or Fog within 20 m syncs the beacon to a brighter pulse (one sting + Ines night chart line if she is out and in tag range). No quiet walk to the Needle over 10 s: kerb props and the worker cover the approach from the park's north edge.

### The Roofs
- **Mood:** his playground. Stairs on apt, shop, annex; AC units, tanks, vents, antennas; lightning coils on his arms while the player steers.
- **Look / sound:** rooftop props; storm gather over him on hold F; bolt crack and scorch; updraft float; camera orbit with wall pull-in.
- **Size:** three stair roofs plus filler rooftops with units; ramps and parapets.
- **In / out:** north-face stairs; jump/float between; can't Take control while driving.
- **In:** control movement (run, triple jump, float), Storm/Bolt/Gust/Tornado, lunch Hollis rescue, Part 2 turbines, smoke playtest roof bolt.
- **Short:** most filler roofs are props-only (no second stair set pieces); no roof garden or water tower climb verb beyond parkour.

### Main Avenue Commute
- **Mood:** the day's artery. Morning clear drive; evening can be his own storm's debris.
- **Look / sound:** asphalt 0.04, lane dashes, crosswalks, signals on a 36 s cycle; cars in two lanes; people on SIDE 3.5 m graphs. Score beds crossfade with weather; rain ambience; far siren at night.
- **Size:** avenues z 12.6 / −34 / 76 from x −48..210; crosses at x −42, 36, 100, 168.
- **In / out:** his car on the day spine; on foot under control anywhere; Hurricane drive west from lot to parkHome.
- **In:** crowd + cars, signals, weather reactions, four hurricane closures, lunch street clear (Nell, Ravi).
- **Required next:** kerb micro-events spaced so a walk east from shop → plaza → Tank never exceeds ~8 s without one — rotating pool of vendor cart, signal-box spark (reacts to nearby bolt), newspaper box flap in wind, waiting busker move-along, puddle mirror only under ability rain. Cars turning at junctions and a daytime bus route are the next motion pass after density holds.

## Landmarks

One far-off steer-by per area (player can aim the camera and walk toward it):

| Area | Landmark | Where | Read from far |
|---|---|---|---|
| West Avenue Home Block | Apt crown + Birdie's tomato wall (raised parapet light strip) | apt north face, x ≈ −28..−17 | warm window band and tomato wall readable from mid-avenue; stair wedge |
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
Same storm caller as Dose Of Destruction (`AllTheCharacters/SmallWeather`). Black messy hair, glasses, navy tech jacket with glowing blue seams, cargo pants, glowing boots. Lives a developer's day on autopilot (`day.config.js` spine); player Take control for third-person walk/run/jump/float and weather powers. Voice: DoD Eric, short first-person; log/barks say "He", never "they". Pressure meter fuels abilities; Strain ("Sky") is what the district absorbs in the arc. Reacts with barks to needs and sky changes; crowd answers his *manual* weather.

### Birdie Alvarez
Gardener, yellow raincoat and straw hat; apt block. Stops: inside overnight, pots at −21,9.5 from 7, park bench −6,22.5 at noon, home by 20. Ask: rain for tomatoes; thanks; evening surprise (tomatoes). Canon: she asks him for rain for her tomatoes.

### Dex Moreno
Courier, orange jacket, white helmet, parcel on his back; lives over the shop. Stoop by day, plaza at lunch. Ask: sun break for damp parcels; thanks; evening humming parcel surprise. Briefs and closes the lunch rescue.

### Ines Quill
Stargazer, violet coat, glasses, telescope; annex. Inside by day, out from 16:30 through the night. Ask: one bolt for her lens (not at her); thanks; night surprise. Reads the sky in Part 2; names the lunch cell as something "clearing its throat."

### The District Board *(candidate loudspeaker faction)*
Utilities voice on the Storm Tank speaker. Plain official tone; does not name him. Reservoir advisories and Weather Warning. *Not settled as full canon* until J answers beat-sheet Q3; lines already play in Parts 1/3 dialogue data.

### Crowd citizens and drivers
Up to ~260 people / 64 cars on the day curve (commute, lunch, dinner, thin 2–5). Walk graph, cross on red for cars, enter/leave doors. React to ability weather: storm look-up then run; rain run / duck indoors; wind lean + hat; fog slow; sun break cheer. Named lunch/drive stranded: Odile, Pim, Gus, Hollis, Nell, Ravi, Marlo, Cass, Tamsin, Wren, Hale, Odette, Sorrel, Pike, Juno (challenge).

### Creatures
No wild animals as characters yet. Birds are daytime fair-weather sfx. *Plan (not yet):* park pigeons Birdie mentions, one stray cat on the shop stoop at dawn — life, not combat.

### How they react to the player
Crowd reacts to weather he sets, not to his face (half-know in Heavy Weather ending: nods). Neighbors speak when he is near in their window and answer asks when he calls the right ability in range. Cars brake for him in lane. Episode stranded thank him with voice/bubble lines.

## What happens

### West Avenue Home Block
- **Interactions:** Take control / Let go; walk, run, jump, float; call Rain for Birdie; climb apt stair; knock props with Gust; look through cutaway rooms.
- **On their own:** his autopilot morning; Birdie's pot watering path; crowd thin→commute; lamps by sky; day-end moment card when the clock rolls.
- **Ambient:** birds, city hum, footsteps, alarm/coffee diegetic day sounds, title/score beds under the page.
- **Over time:** outfits are model-constant (no pyjama swap); windows and lamps follow dusk/night; opening once per new player.
- **Short:** no fridge/radio loop; few porch interactions after Birdie goes in.

### The Park
- **Interactions:** Rain (and over-hold overflow), sit near Birdie for ask/thanks, bolt scorch grass, explore pond/bandstand, photo angles for playtests.
- **On their own:** Birdie noon bench; park lamps; lawn state after Part 1; crowd on edges.
- **Ambient:** softer bed under trees; rain on leaves when wet; bandstand quiet creak *planned*.
- **Over time:** straw→damp→scar brown patch across the arc day.
- **Short:** need 2–3 always-on microevents (kid with umbrella, gardener second pass, pond ripples) so a non-episode walk still breathes.

### Shop Strip
- **Interactions:** Dex sun break; shop roof bolt/rod precision; shove bins; enter crowd doors as observation; Storm hold.
- **On their own:** Dex routine; shop neon; people enter shops; umbrellas.
- **Ambient:** neon buzz *planned*, car pass-bys, courier shoes.
- **Over time:** dusk neon weight; lunch cell drifts east toward Tank.
- **Short:** enterable shop interior or window shoppers would kill empty-facade feel.

### Plaza Market
- **Interactions:** Sun break / Fog for stock; stay while stalls fill; Shelter sun breaks; Light show cues (E/R/C/V/X on beat); fountain visit; neighbor tags.
- **On their own:** Dex lunch; spectators walk in for finale; fountain; Clock faces; stall topple on bad gale.
- **Ambient:** fountain, crowd lunch peak, show whoosh/thunder, closing card city-fared lines voiced.
- **Over time:** market open/scar/shut flags; night show aurora.
- **Short:** permanent stall dressing + one busker or cafe server loop still missing for off-episode noon.

### Office Lot and Annex East
- **Interactions:** Gale hold on turbines; Ines bolt ask; start Hurricane drive; desk is autopilot until Take control.
- **On their own:** lights/lifts with power; Ines telescope; evening commute crowd.
- **Ambient:** HVAC, keyboard (day), roof wind, Board distant *from Tank*.
- **Over time:** still blades → spinning → overspeed scar.
- **Short:** coworkers as bodies in the hall; turbine meshes on more roofs.

### Storm Tank Yard
- **Interactions:** Lightning charge mast (count); Rain fill gauge; read Strain kick-backs (flood, overcast hold).
- **On their own:** neon band; Board advisories at part beats; gauge motion in Part 3.
- **Ambient:** industrial hum, thunder, loudspeaker grit.
- **Over time:** reservoir empty→full / flood / warning loop (ending C).
- **Short:** idle yard life; physical loudspeaker prop animation when Board speaks.

### Needle Approach
- **Interactions:** walk around base; deck-elevator lookout (skippable); Sun break or Fog beacon-sync; hear Ines night chart line when in range.
- **On their own:** maintenance worker loop, beacon, skyline lamps, wind.
- **Ambient:** high wind bed, cart roll, distant avenue, beacon sting on sync.
- **Over time:** beacon brighter in storm; worker packs up in heavy rain.

### The Roofs
- **Interactions:** full power set; parkour; lunch Hollis; Part 2 gale; smoke bolt.
- **On their own:** AC fans *planned* spin with wind; antennas; crowd below.
- **Ambient:** wind, city below, ability whoosh/crack.
- **Over time:** dusk→night bloom; wet sheen only on ability weather.
- **Short:** more traverse routes between the three stairs.

### Main Avenue Commute
- **Interactions:** weather abilities; Gust/Tornado debris; Hurricane four closures (help vs hurt powers); crosswalk timing; brake-test by standing in lane carefully.
- **On their own:** crowd curve, signals, weather forecast (off by default) vs ability weather, sirens at night.
- **Ambient:** score + ambience beds, cars, birds, siren.
- **Over time:** rush hours; episode debris; flood patches.
- **Short:** junction turns; kerb micro-events every ~8 s of walk east.

## Story beats

Every beat below is lived as gameplay, an in-world staged event (camera, props, crowd), sound, and/or a Hawkes Gen voice line. HUD copy is at most one short prompt line; a beat that is only a paragraph on a card is a fail until voiced or acted.

1. **Title and first Play** — Title skyline orbit; Play hands him over. *Sound:* title bed. *Voice/event:* opening five beats on his model (`js/opening.js`) must stay spoken or skipped — never a silent text wall. *When/where:* every new visit / first Play. *Short:* opening still image / theme sting (GPU).

2. **You take over** — Camera push to shoulder + one first-person line (`moments.takeover`) + control sting. *Where:* wherever he stands. Skip by move/tap.

3. **Learn the weather (tutorial episode)** — Lock→unlock five abilities with toasts, Pressure top-ups, real casts (E/R/V/C/X). *Where:* anywhere under control. Skip opens all.

4. **Birdie's rain (neighbor + Part 1)** — Speech bubble ask; Rain near her; thanks voice; park drinks (toast ≤1 line); lawn/pond respond. *When:* morning–noon, pots or park. Strain watches over-hold.

5. **Dex's sun break / market opens (Part 1)** — Ask + Sun break on plaza; stay while stalls and citizens fill; Dex thanks. Kick: second sun scorches lawn. Board evening advisory on Tank speaker (voice), not a text dump.

6. **Rooftop storm lunch rescue** — Uncalled cell; Dex phone brief (voice); Shelter / Hollis rod / street clear set pieces; fog twist with debris; Ines throat line (voice); rank card with spoken end line. *When:* ~12:20.

7. **Still blades (Part 2)** — Dim office feel as event (lights), not only a log sentence; Ines on annex; Gale 10 s spins turbines (visible + whoosh); intact plaza stalls; thanks. Kick: overspeed + stall topple.

8. **Hurricane drive home** — Board wind advisory (voice); four closures with help/hurt powers; bus twist to storm; reach parkHome; Board close-out by rank (voice) + his one line.

9. **Tank low (Part 3)** — Board critical on the pulsing Tank speaker (voice + duck); Ines "charge the mast" (voice); two Lightning hits in zone with mast flash/thunder; Rain fills the yard gauge (storm-from-bolt does not count); Strain branches as visible flood patch or held storm + Weather Warning on the speaker. **Ending:** an in-engine camera move (or Gen still once budgeted) over the district's four needs as they stand, then his one last voiced line (Eric); the card's scene paragraph is a caption under that, never the beat alone. Day continues on "Walk the city".

10. **Light show finale** — Walk into plaza (show clock starts); 18 cues on beat; stage beams/pools/aurora; grand salvo; **closing:** camera holds the plaza crowd (Birdie, Dex, Ines visible) while cityFared lines play as short Board or neighbor voice stingers and his last line by rank is spoken; any card text captions that audio. *When:* ~22:05.

11. **Neighbor surprises** — Evening tomatoes / humming parcel / star line: bubble + reward toast + Pressure, each once per day key; surprise lines are spoken when clips exist, else babble + bubble (never a silent log-only beat).

12. **Day end recap** — Not a text wall. When the clock rolls: dim the score, play his sign-off voice line, stage three quick in-world flashes (camera whip or freeze-frame props) tied to three log events (early / player's note / late), then one last spoken breath. Skip/Esc/timer still closes it. Card copy, if any, is one line under the flashes.

13. **Crowd weather breath (always)** — Manual weather → look-up, run, hats, cheer, umbrellas, wipers; hold then fade. This is the district answering him, every day, arc or not.

### Beats that must not stay text-only
- Opening lines → voice (Eric) or cut.
- Board advisories → loudspeaker mesh pulse + voice + world audio duck.
- Ending / closing → camera or still of the district + voiced last line; card text is caption only.
- Day end recap → sign-off voice + three staged flashes; no recap that is only a list of sentences.
- Part 2 power ration → office lights dim and lift audio crawl *before* any log line; the log may echo after.

### What already exists vs short
- **In:** neighbors, Parts 1–3, lunch rescue, hurricane drive, light show, tutorial, opening, moments, crowd reactions, landmarks, cityscape density, spoken dialogue pipeline for story/neighbor lines.
- **Must build next (ordered, matches fun-review gaps):** (1) always-on park / plaza stalls / annex turbines + day-keyed states; (2) Needle life loop + avenue kerb micro-events; (3) Tank loudspeaker staging + day-end flashes and ending camera/voice so no story beat is card-text alone. Then: neighbor/crowd art pass, junction turns, home crown landmark, GPU music-day/night and ending stills/stings when J approves budget.

### Canon flags (do not quietly flip)
- Storm Tank as reservoir, District Board identity, how much the district "knows," and Ines's larger "pulling" hook stay tied to `docs/story-arc-beat-sheet.md` open questions / story-spec recommendations. Playable arc uses the recommendations; bible treats them as **working canon for builds** until J overrides.
- He/him only for Small Weather; neighbors use his first name in tone, never "they" for him.
- Main character model is always Small Weather, never a placeholder while loading.
