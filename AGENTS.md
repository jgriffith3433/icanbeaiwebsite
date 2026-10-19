# I Can Be (icanbe.ai): notes for agents

How the site works, how to run it, versions, playtests and Hawkes Gen are in [README.md](README.md). The day is
`day.config.js`. The product's direction is undecided: build what J asks for, and don't invent a direction.

## Analytics (Hawkes Analytics)

Hawkes Analytics is the only analytics here (J, 2026-10-18): never add another tracker. The contract is
`hawkesgen/docs/analytics.md`. The product id is `icanbe` (`hawkesgen/analytics/products.json`, beta `icanbe`).

**Where it's loaded.** `js/hawkes-analytics.js` is a copy of `hawkesgen/clients/js/hawkes-analytics.js`. Don't edit
it here: copy it again from Gen. It's loaded with `data-product="icanbe"` on every page people see: `index.html`
(in `<head>`, then `loadStart()` straight after it, so `game_ready.ms` includes the Babylon download),
`whatsnew.html` and `privacy.html`. A new public page needs the same two lines (`HAWKES_BUILD` and the script tag).

**The build.** Each page has `window.HAWKES_BUILD = { version: "dev" }`. `scripts/stamp-build.mjs`, which is Studio's
`deploy.prebuild` through `bump-version.mjs`, writes `{ version: "<releases.json current>+<build stamp>", commit:
<HEAD>, date }` into all three pages. When the version hasn't changed it keeps the commit and date, so running it
again changes nothing. Don't commit stamped output from a task branch: Studio stamps beta, and that way the commit
is beta's.

**What the page sends** (`js/analytics.js`, a classic script after `main.js`). It only listens to the controls, the
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
- `feature`, one per interaction: `speed` {value, via key/click}, `pause`, `play`, `live` (back to now), `scrub`
  {to, activity} once the day bar settles, `step` {presses, to} for ← →, `camera` {action: turn, zoom, pinch, tap;
  `on` for a tap: person, car, the spot name (`at-<spot>` node), room, nothing}, `sound`, `details`, `whatsnew`,
  `privacy`.
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
