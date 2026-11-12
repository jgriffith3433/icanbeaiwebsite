# The Needs of the District: a 3-part story arc (beat sheet)

Status: **design only.** Nothing here is built. It sits on what the game already has: Small Weather (he/him), the
four chapter episodes, the tutorial, the three neighbors, the Pressure meter and the 3 s ability weather. Where a
beat needs something new, it says so under **Needs**. Open canon questions are in their own section at the end.

Tone rules, from AGENTS.md: he is "He", plainly; lines are short and matter-of-fact; other people are "they". Weather
is the drama. He never gloats. He feels like a god, and the city is the one that has to live with it.

## The idea in one paragraph

The district has four needs it can't meet on its own: **the park** is dry, **the wind turbines** on the roofs are
still, **the market** in the plaza is losing its stock to damp and heat, and **the reservoir** (the Storm Tank,
Needle and roofs already draw its water) is low. Four people ask I Can Be for help, one per need, three parts. He
does it with weather. Each call works. Each call also costs: the sky doesn't forget what it was asked to do, and a
district that is asked too often starts to answer back. The ending depends on how he balanced it.

## The asks: who, what, where

| Need | Asker | Where | Ability it wants | Anchor already in game |
|---|---|---|---|---|
| Park (dry, dying lawn, pond low) | **Birdie Alvarez**, gardener | Park, bench at noon (-6, 22.5); pots at -21, 9.5 | Rain, then Sun break | Birdie's rain ask; park pond and flowerbeds in `js/props.js` |
| Wind turbines (still blades, power rationed) | **Ines Quill**, stargazer, who reads the sky and the roofs | Annex roof, east end (154, 9.8) | Gale, held steady | `rooftop AC units, tanks, vents and antennas`; the Gale ability |
| Market (stock spoils, stalls can't open) | **Dex Moreno**, courier, who carries it | Plaza, x 106-130, z 16.8-36, at lunch | Sun break and Fog (dry the day, cool the night) | Dex's sun break ask; plaza cafe tables and fountain |
| Reservoir (low, one tank for the district) | **The District Board**, a voice on the Storm Tank's loudspeaker (new: see Q3) | Storm Tank, 190, 44 | Storm: Rain + Lightning together | The Storm Tank landmark and lightning mast |

Order of play: the asks are given in Part 1, answered across Parts 1 to 3, and the reservoir is the last, biggest one.

## How overuse backfires: the Strain rule

A new meter beside Pressure, called **Strain** (HUD name: "Sky"). Pressure is what he can spend this minute. Strain is
what the district has absorbed today.

- Every ability call adds Strain by its **kind**: Rain +1, Gale +1, Sun break +1, Fog +1, Lightning +2. A storm
  (rain + lightning in the same window) adds both.
- Strain falls by 1 every sim hour. It is kept per day key.
- **Same-weather stacking:** the same ability within 60 s adds double. Spamming one thing is the fastest way up.
- Thresholds, with what the street does (all reuse the crowd's reaction layer, so it reads at once):

| Strain | Name | What backfires |
|---|---|---|
| 0-3 | Calm | Nothing. Gratitude lines as written. |
| 4-6 | Edgy | Citizens react longer and later (reaction hold 3 s becomes 6 s). Neighbors' thanks lines turn dry: "Enough now?" |
| 7-9 | Backlash | Each call also pulls a **kick-back**: rain brings a flood on the low road, gale knocks market stalls, sun break scorches the lawn (a brown patch), fog hides the crowd and a car stops dead, lightning blacks out the nearest block for 8 s (the existing lights-out, longer). Rewards pay half. |
| 10+ | Overcast | The sky stays on what he last called for 20 s after the hold ends, and a **Weather Warning** line plays on the loudspeaker. The part's goal can still be met, but it scores as a *scar* (see endings). |

Each part has a **Strain budget**: finishing with Strain at or under the budget when the part's goal completes counts as
a **clean** part, over it a **scarred** part. The three parts' results decide the ending.

## Part 1: Dry (the park and the market)

**Chapters it sits on:** Morning and Lunch, reusing the *Clear the sky* and *Rooftop storm* episodes' places (Morning
first, Lunch second). **Strain budget:** 4.

**Premise:** The city has had no rain in a long while (the sky has been calm and clear; it is the game's default).
That's the problem. Nobody has anything to ask for yet, so the first scenes show it.

### Scenes

**1.1 The lawn (07:55, Morning).** He leaves the apt. The park lawn is straw. Birdie is at the bench with a watering
can that has run dry. Kicks off the arc.
- BIRDIE: "There you are. My tomatoes are sulking. The whole lawn is."
- BIRDIE: "A little rain. Not a lot. A little."
- HE (voice bark, existing group "episode open"): "Morning air. His to rewrite."
- **Goal:** Call Rain (R) within range 16 m of Birdie. Reuses her existing ask beat.
- **Pays:** Birdie's thanks (50 score, 25 Pressure). Park state flips to *damp*: lawn green, pond up a notch. Reward
  line (toast): "The park drank."
- **Fail/limit:** Rain held longer than 6 s in one go reads as Edgy (Strain +1 extra); the pond overflows onto the path
  and Birdie says: "That's plenty. That's — plenty."

**1.2 The market opens (noon, Lunch).** The plaza has a few stalls, no stock: it spoiled in the heat of the long dry.
Dex is there, parcels piled and sweating.
- DEX: "Parcels, produce, everything's gone soft. You can't sell soft."
- DEX: "Sun break. Two minutes. Dry the plaza out, then I'll carry the rest."
- HE: "Sun's here."
- **Goal:** Sun break (X) within range of the plaza fountain. Then a second goal: stay in the plaza while the
  stalls fill (a 20 s timer of citizens arriving through the crowd system).
- **Pays:** Dex's thanks (50 score, 25 Pressure). Market state: *open* (stalls up, more people at the plaza).
- **Kick-back on overuse:** a second sun break inside 60 s scorches the lawn behind him: brown patch.

**1.3 Lightning rods (12:20, Lunch episode).** Not a story beat for the arc's goals; it is the existing *Rooftop
storm* episode and is the **Strain test** of Part 1: the three rods are the first moment the player is asked to
throw more than two things. Finishing it with Strain 4 or lower is clean.
- HE: "Three rods. One sky."
- **Goal:** the episode's own: call the storm, strike three rods.

**Part 1 closes (evening, home).** The loudspeaker clicks on for the first time (the District Board, see Q3).
- BOARD: "Reservoir level: low. Two days. Maybe three."
- HE: "Two days."
- **Hook:** the reservoir is the true need; the park and market were what the city *noticed*.

**Part 1 result:** *clean* (Strain at or under 4) or *scarred*. Scarred = brown patch on the lawn, one stall stays
shut, the Board's line becomes "Reservoir level: low. And the sky's been busy."

**Needs:** Strain meter, a park state and a market state, both as simple day-keyed flags; Birdie and Dex beats exist.

## Part 2: Still (the wind turbines and the commute)

**Chapters it sits on:** Work and the commute home, reusing *Hurricane drive*. **Strain budget:** 7.

**Premise:** The roofs' wind turbines (new props, see Needs) have been still all week. Without them the lights in the
office go to half and the lifts crawl. Ines notices because her telescope's clock drive runs on the roof's power.

### Scenes

**2.1 The still blades (09:30, Work).** He is at the desk on autopilot. A bar of text appears in the log
(`day.note()`), then the player can take him.
- Log: "The elevator crawls. The lights are low. Roofs are quiet."
- HE (mutter): "Pull request. Push weather."

**2.2 Ines on the annex roof (evening, out from 16:30).** The annex roof is where the biggest turbine stands. Ines has
her telescope aimed at the blades.
- INES: "Seventeen blades on this roof. Not one has turned since Tuesday."
- INES: "A gale. Steady, not a tantrum. They only turn if the wind is kind."
- HE: "Steady."
- **Goal:** Call a Gale (V) and keep wind on the roofs for a total of 10 s (on the annex roof). The turbines spin up
  with the wind strength. Pushing past 10 s of continuous gale is Edgy.
- **Kick-back (Backlash, Strain 7+):** too much wind and the blades "overspeed": they shut, a stall in the plaza
  loses its awning, and the goal resets.
- **Pays:** Ines's thanks (50 score, 25 Pressure): "They're turning. Do you see how they turn?" The lights in the
  office and lifts come up; a mild toast: "The roofs have power."

**2.3 Hurricane drive (17:53, the lot).** Reuse the existing episode. In story terms the storm he makes to get the
turbines moving is the same storm he has to walk home through. Its debris goals (shove two bits of debris) are the
cost of the gale from 2.2.
- HE: "The lot. Home is through what he makes."
- **Goal:** the episode's own: whip up storm or wind, shove debris twice, get home.
- **Pays:** episode score card as now.
- **Strain read:** if Strain is 6 or lower at home the rooftop turbines hold at a good rate through the night; over 7,
  one turbine tears loose and falls into the avenue (a prop that blocks the road; cars route around).

**2.4 Night, first sign (21:00+).** Ines's surprise beat in Part 2 is changed to point forward:
- INES: "The charts moved. The reservoir isn't just low. Something has been pulling the sky toward it."
- HE: "Pulling."
- INES: "Something wants the water gone. Or the weather very much on."
- **Hook:** the Board's second line plays: "Reservoir level: critical." Part 3 opens.

**Part 2 result:** clean (Strain at or under 7 on completion) or scarred (a turbine is down; the avenue has a gap).

**Needs:** wind turbine props on the roofs (all vertex-coloured, spinning with `weather.now().wind` if present), power
state (lights low/normal), and a way to count total gale seconds. Both new props and the power state are small.

## Part 3: Low (the reservoir)

**Chapters it sits on:** Night, reusing *Light show*, with the Storm Tank. **Strain budget:** 10 across the whole day
(carried from Parts 1 and 2: the player's total Strain at the Tank).

**Premise:** The reservoir wants the storm. He can give it one. But it must be the **right size**: too little leaves
it low, too much floods the avenue and the market and tips the whole district into Overcast.

### Scenes

**3.1 The tank (22:00).** The Storm Tank, a gasholder with a blue neon band and a lightning mast. The Board's
loudspeaker is on it. A gauge needle lies at the bottom.
- BOARD: "Reservoir level: critical. Please. Anyone with weather."
- HE: "Weather's here."
- INES (from the annex, by the telescope): "Not all at once. Charge the mast first."
- **Goal A:** Strike the Tank's lightning mast with Lightning (E) three times in the *Light show* timing window
  (cue every 4.2 s, window 1.6 s). Each hit fills the gauge a third.

**3.2 The rain (22:30).** The gauge needs water: the rain he calls over the Tank.
- **Goal B:** Call Rain (R) near the Tank and let the gauge fill. It fills while the weather is rain; it stops
  filling the moment the hold runs out, so the player must call again, and the count on Strain rises. The right
  play is to call rain in as few, well-timed calls as possible, between bolts.
- HE: "Down it goes."

**3.3 The sky answers (23:10).** Whether it fills or overflows depends on Strain. Branch:
- **Strain at or under 6:** the gauge reaches full and holds. The loudspeaker: "Reservoir level: full." Quiet.
- **Strain 7 to 9:** it fills, then the avenue floods a hand deep; the market closes for the night (a kick-back).
- **Strain 10 or more:** the sky doesn't stop on its own for 20 s after the last call. Overcast kicks in: the
  loudspeaker: "Weather Warning. Please stay indoors."

**3.4 The last line (midnight).** Whatever the branch, he goes home, the day ends. The ending plays (below).

**Part 3 result:** the ending is chosen from the three parts' clean/scarred marks and the final Strain at the Tank.

**Needs:** Tank gauge prop and logic; Light show window logic (exists, in `js/episodes.js`); a rain-fills-gauge rule.

## The lunch storm (rebuilt Part 1.3: "Rooftop storm")

At 12:20 a storm arrives that nobody called: a cell the forecast never had, sitting on the district at lunch. It is
not his. People are stranded in it, and the episode is him getting them out with what he has. It is also the first
sign of the pull on the sky that Ines names at the end of Part 2: the cell is drifting east, toward the Storm Tank.

- **Opening.** Dex, on his phone from the plaza: the plaza, the shop roof and the avenue each have someone stuck.
- **Set piece 1, Shelter (the plaza cafe).** Three people under dripping awnings. A Sun break (X) near each lets them
  out. Odile, Pim, Gus.
- **Set piece 2, Rescue (the shop roof).** Hollis, a roofer, is stuck up there with the ladder gone and the sky
  full of charge. A Lightning call (E) from near the shop grounds the roof; if the strike lands on the lightning
  rod it grounds it clean (a precision bonus).
- **The twist.** The moment Hollis is down, the rain stops and fog comes in thick: the cell is *moving*, not
  passing. Debris is in the avenue and two people cannot see the crosswalk. Ines, passing: "That wasn't rain. That
  was something clearing its throat." It will come back each time he lets it, until the street is clear.
- **Set piece 3, Clear the street (the avenue).** Nell and Ravi at the crosswalk. A Gale (V) or a Gust (G) near
  each blows the fog and the debris off their side. Nothing here is the Board's voice: that stays Part 1's evening.
- **Ending line.** By rank (S to C): Dex says how it went, and He answers in one line.
- **Pressure.** A 4:20 clock, and each set piece is worth full points for 70 s; after that the rescue still counts
  but for less ("late"). Rank is points out of the maximum: help (100 each, 60 late), the rod precision (25), time
  left (up to 150): S 90%, A 70%, B 45%, C below.

## The hurricane drive (rebuilt Part 2.3)

Evening, 17:53. The wind he stirred up in the afternoon has the avenue shut in four places between the office and
home, and the Board is reading advisories. The car is no use, so the way home is on foot along the drive. Each set
piece has an ability that helps and one or two that hurt, and the same key is right at one and wrong at the next.

- **Opening.** The Board: wind advisory, avenue closed, stay indoors. He: "Home is west along it. Four closures."
- **1. Clear the road (the fallen sign).** Marlo and Cass are blocked. Gale or Gust lifts it. Rain soaks the junk and pins it down (hurts).
- **2. Drain the underpass.** Tamsin and Wren, water to the doors. Sun break dries it. Rain or a storm raises it (hurts).
- **3. Start the stranded bus.** Hale and Odette; a flat battery. A Lightning call near it jump-starts it. A gale or a funnel tears the shelter roof (hurts). **The twist:** when it moves, the wind turns to a storm cell on the avenue.
- **4. Hold the bridge open.** Sorrel and Pike; the bridge arm drops when the wind sensor trips. Fog gives still air and holds it. Gale, funnel or storm trips it (hurts).
- **Ending line.** By rank S to C the Board closes the advisory (S: "No further closures." C: "Please do not do that again."), and He answers in one line. Get home to finish.
- **Points.** Help 100 (60 late, 65 s per piece), wrong call -40 and 15 s off the window, time left up to 150; max 950; S 90%, A 70%, B 45%.

## Three endings

Chosen when Part 3's score card is dismissed. All three are the same sky, different weather; none of them is only
a text card. Each plays an in-engine scene of at most 40 s (camera path clear of geometry, neighbour bodies, the
score's resolution or failure sting, one caption line + Skip). The scene ends on the Part 3 rank stamp. The outcome
persists in `icanbe.memory` for the rest of the real day (A keeps the park green on reload).

| Ending | Condition | Scene (lived) | Spoken lines |
|---|---|---|---|
| **A. Fair Weather** | All three parts clean; Strain 6 or lower at the Tank. | Rain on the Storm Tank, park lawn blooms in a time-lapse, neighbours and crowd dance in the rain on the plaza. | BIRDIE: "The lawn drank. Thank you." / HE: "Clear skies. I stopped." / PILOT: "Fair weather. Logged." |
| **B. Heavy Weather** | One or two parts scarred, or Strain 7 to 9 at the Tank. | Park half green, Dex patching a turbine on the annex roof, bittersweet exchange. | DEX: "Half green. Half still broken." / HE: "It worked. It cost." |
| **C. Overcast** | Strain 10 or more at the Tank, or all three parts scarred. | Flood or scorch aftermath on the avenue, crowd silent under umbrellas, Pilot then He. | PILOT: "Sky's still thinking. Stay in." / HE: "I asked for everything." |

Endings are reachable in one day of play for A and B; C needs deliberate overuse (about twice the Strain budget).
The sheet's older third-person "last" lines stay as quiet narration labels in data; the scene speaks the lines above.

## Consistency with the four existing episodes

- **Morning (Clear the sky)** is Part 1.1's staging; its weather goals (gather clouds, clear, reach the car) are the
  episode's own and are untouched. The Birdie ask is placed so the rain call comes before the clear-sky call.
- **Lunch (Rooftop storm)** is Part 1.3, rebuilt as a rescue (next section): three rods became three set pieces.
- **Commute home (Hurricane drive)** is Part 2.3, rebuilt as a drive home through four closures (next section).
- **Night (Light show)** is Part 3.1 as the Tank's mast timing; its cue and window numbers are reused.
- The **tutorial** still teaches the five abilities first; the arc never asks for an ability the player hasn't unlocked.
- Existing neighbor beats (ask, thanks, surprise) stay as they are. New lines here are *additions* to what those three
  say, never replacements. Their surprise beats are what point the arc forward.
- A player who ignores the arc and just walks still gets the day and the episodes. The arc is an overlay.

## What to build, in order (not part of this sheet's scope)

1. A `story` block in `day.config.js` holding the beats above as data, plus a `js/story.js` that reads it.
2. Strain: meter, thresholds, kick-backs (reusing crowd reactions, weather and powers).
3. Park, market and power states; wind turbine and Tank gauge props.
4. The Board's loudspeaker (voice lines, Gen `audio.voice`).
5. The three ending cards.
6. A playtest scenario: Part 1 first.

## Costs (not approved; GPU not used)

Priced with `hawkesgen_estimate` at build time, not now. The expected GPU work is: three ending stills (one image each),
a short music sting per ending, and an optional 3D turbine prop. Voice lines for the Board are cents each (not GPU).

## Open canon questions (to settle before the arc is built)

1. **Is this one day or several?** The game is one simulated day on loop, with episodes on its chapters. The arc is
   written as one day (with Strain per day key). If it spans days, the Strain falls and the parts need a "day 1, 2, 3"
   marker. Which?
2. **Where do wind turbines and the reservoir live?** The city has no turbines and no reservoir today. The sheet uses
   the roofs for turbines and the **Storm Tank** (a gasholder) as the reservoir. Is the Tank a water reservoir in
   canon, or must it stay a landmark and the reservoir be a new building?
3. **Who is the District Board?** Invented here as a loudspeaker voice. Is it a person, a faction, an AI? Does it have
   a name and a voice (Gen voice, not Small Weather's)? Does it know what Small Weather is?
4. **What does the district know about him?** Do citizens know the weather is his doing? Today the crowd reacts to the
   weather, not to him. The sheet assumes they half-know and "nod to him" in Heavy Weather. If they don't, Ending B's
   scene must change.
5. **Why does overuse backfire?** The sheet says "the sky doesn't forget." Is that a rule of the world (weather has a
   limit), a cost of his powers (Pressure's other side), or something someone is doing (Ines's "something is pulling")?
   Part 2.4 hints at a cause; none is chosen.
6. **Is Ines's line "something pulling the sky" a hook for a bigger story?** If yes, a Season 2 of this arc needs it
   named. If no, cut 2.4's last two lines.
7. **Does the Dose Of Destruction canon constrain this?** Small Weather is the same storm caller as in Dose Of
   Destruction. Does the arc need to avoid contradicting the DoD seasons' stories, and does anyone from there
   (the Orchestrator, Blog Man) show up here?
8. **Neighbors' fate:** can a neighbor be hurt or leave if the arc ends in Overcast, or is that a permanent state?
   (Sheet assumes a state for the day, not permanent.)
9. **The ending gate:** does an ending end the run, or does the day continue afterwards (a free-play day)?
10. **Reward economy:** Strain pays half in Backlash; is score (kept in `icanbe.neighbors`) the right currency, or a new
    "District standing" stat?
