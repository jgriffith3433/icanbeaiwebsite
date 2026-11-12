# Small Weather's voice: style note for the log and barks

Status: **built** for the log (`js/barks.js`, data in `day.config.js` `barks` and `weather.react`) and for spoken
barks (`voice.spoken`, director in `js/voice.js`, clips via `audio/dialogue` / DoD Eric). Spoken lines are first
person and follow the same temper.

## Who he is on the page
A quiet developer who happens to command the sky. Dry, patient, a little amused, never loud. He notices his body
and the weather the way someone does who is used to both. The storm is where he is calmest.

## Rules
1. **He, plainly.** Log lines say "He" (he/him), never "they" for him, and name him "Small Weather" only at the
   day's few named moments. Other people stay "they". Spoken lines are **first person** ("I", "my").
2. **Short and matter-of-fact.** One or two sentences, present tense, about 4 to 14 words. No exclamation marks, no
   questions, no emoji, no jokes that need a setup.
3. **One concrete thing.** A body sensation or a small action (a blink, a tap, a breath), not a feeling named in
   the abstract. "His mouth is dry", not "He feels thirsty and uncomfortable". Spoken: "Rain. Good.", not "I feel
   powerful."
4. **Understated.** He grins at thunder and keeps the joke to himself. Never gloat about the power.
5. **Needs read as body, weather reads as mood.** Hunger, thirst, tired, bladder, stress and boredom are small,
   physical and a little wry. Rain, storm, fog, wind, snow and clear sky are what he likes or lets be.
   Rain with a need can combine (`hunger@rain`).
6. **No repeats in a day.** A line is used once per in-game day (`day.barks.fresh/take`, which the weather log
   uses too); a pool that runs out stays quiet rather than say it twice. Needs wait `gap` minutes between any two
   barks and `again` for the same need, so he never chatters. Spoken director: same line id waits ~5 real minutes;
   lines never overlap.
7. **Don't duplicate the labels.** The plain "Rain." label stays as the fact; the bark is what he does about it.
   It arrives about a second and a half later.
8. **No game words.** No "Pressure", "ability", "cooldown", "Orchestrator" in barks or spoken lines; he doesn't know
   he's in a game.

## Spoken barks (`voice.spoken`)
Groups the director plays with a caption and a quiet log line: `take`, `letgo`, each power (`bolt`, `rain`,
`gale`, `fog`, `sunbreak`, `storm`, `gust`, `tornado` — first use always), `rooftop` (a rescue help), `neighbor`
(thanks), `dayend`, `idle`. 2–4 variants each. Clips are dialogue table reads (`dlg-he-*.mp3`). Voices mute
(`icanbe.voices`) is separate from Sound (music and effects).

## Pilot (the day AI)
Pilot is the calm, dry, faintly fond AI that keeps him on schedule (`day.config.js` `pilot`, director in
`js/pilot.js`). Second person to the player ("You have the sky"), third/first for him as "he" only when needed.
Same shortness and understatement as his lines; radio-filtered; caption labelled **Pilot**. Never talks over
Small Weather: queued through `voice.speakPilot`. Groups: `schedule` (one nudge per spine block), `take`,
`letgo` (names the deed from `day.memory.justDid()`), `worried` (chaos), `night`. Clips under `audio/pilot/`.

## Adding a line
Put it in `barks.needs.<need>.lines` or `barks.weather.<state>`, or in `voice.spoken.<group>`, or in
`pilot.lines` / `pilot.schedule` / `pilot.take` / `pilot.letgo` / `pilot.worried` / `pilot.night`, check it against the
rules above, and run `npm test` (`scripts/check-barks.mjs`, `scripts/check-pilot.mjs`). After changing spoken lines, run `node scripts/sync-dialogue.mjs`.
