Fix: first-five counted 160 words on screen in the first minute (limit 40).

Studio's first-five counts each distinct line of `document.body.innerText` (visibility:hidden/display:none text is excluded, clip-hidden text and every changing number is not). The cold page showed: loading card with four rotating messages, a screen-reader title span, the title's clock (changes every minute), the day's request, "0 of N episodes" progress, "First: ..." goal and the key hint, then after the first bolt the whole HUD (status card, clock, tools, weather/Pressure, control hint, episode offer, Charge N and cooldown numbers that change every tick).

Changes:
- `index.html`: the loading card says one fixed "Loading…".
- `js/title.js`: a stranger's first title (cold open pending) shows only logo and buttons; daily/yesterday/progress/next/clock/hint stay hidden (returning players unchanged); the logo's sr text is an aria-label.
- `js/coldopen.js` + `css/hud.css`: `html.first-min` for 56 s from the cold open's start hides the status card, tools, side panel, hud-left, control hint/button, episode offer and the ability bar's Charge/cost/cooldown numbers (icons stay).
Cold-open lines are unchanged (their text is ~23 words with speaker names).

Checked: no browser here and node_modules aren't installed, so `npm test` couldn't run; `check-hud.mjs` passes, JS syntax checked. Word count is estimated (~35: loading 1-3, title 5, cold-open captions+prompt ~23, name tag, ability icons). Playtest `first-minute` (already in js/playtest.js) measures it; beta's first-five is the judge.
Watch: other scenarios that arm the cold open now have the HUD hidden for 56 s after it starts.
