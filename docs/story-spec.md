# Story spec: the first day, and what J has to answer

Status: **spec + opening built.** Sits on `docs/story-arc-beat-sheet.md` (candidate canon). The game still opens
without a story: nothing here is needed to play, and everything is skippable.

## Player fantasy
He is Small Weather (he/him), the only main character model. The page is his developer's day playing on its own;
the player takes the sky. The story is an overlay: the district has four needs (park, turbines, market, reservoir)
and asks him for weather; overuse has a price (Strain); three endings.

## Structure (what exists, what is new)
| Piece | State |
|---|---|
| Opening (first Play) | **Built**, `js/opening.js`, `day.config.js` `opening` |
| Parts 1-3, Strain meter, endings | Parts, Strain and endings exist in `js/episodes.js` already (see AGENTS.md); the beat sheet's Board voice, turbines, reservoir gauge art are not built |
| The District Board voice, ending stills | Blocked on the answers below, then GPU/voice |

## The opening
Plays once, on a player's first **Play** from the title (never for a returning player, never in a bot's tab other
than `?playtest=opening`). The day's own camera stays on Small Weather's model (never the box figure) with five
plain lines, ~18 s, then he is the player's (Take control):

1. "This is Small Weather."
2. "He lives a developer's day. Alarm, coffee, a long drive, a desk."
3. "The sky over the district has been calm and clear for a long while." (the beat sheet's premise: candidate)
4. "He can change that. A little rain. A little sun. Lightning, if he must."
5. "Your turn."

**Skip:** the Skip button, Esc, Enter or a tap on the card. Skipped or finished, it is remembered
(`icanbe.opening`). The HUD is hidden while it runs; the day keeps running. Lines 3-4 are the only story claims and
are candidate; 1, 2 and 5 are fact. Events: `day:opening` start / beat / skip / end. API: `day.opening`.

## Questions for J (filed in the Inbox, each with a recommendation)
1. One day or several? Recommend: **one day**.
2. Is the Storm Tank the water reservoir? Recommend: **yes**.
3. Who is the District Board? Recommend: **a faction of utilities, plain official voice, does not name him**.
4-6. Does the district know it is him; why overuse backfires; Ines's "something is pulling" hook? Recommend:
**they half-know; a rule of the world (the sky has a limit); cut the hook**.
7-10. DoD cast; neighbors per day only; day continues after an ending; score is the currency. Recommend: **yes to all**.

Until answered, nothing past the opening is built; line 3 of the opening is the only canon-dependent line.

## Not done / costs
Opening still image or theme, ending stills and stings, Board voice lines (cents each, no GPU). The GPU part could not
be priced: `hawkesgen_estimate` returned "No access to project" for `icanbe` and `i-can-be-ai`. Expected GPU work:
4 stills (opening plus three endings), up to 4 music stings, optional turbine 3D prop. J needs to approve a budget
once it is priced.
