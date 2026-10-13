# A day

A person living through today, in real time, one action at a time. Open `index.html` and you see what they're doing right now. Drag the day bar to look around the day, or play it at 10×–1200×.

**The whole day is defined in [`day.config.js`](day.config.js).** Change it, save it, and reload the page.

## Run it locally

Double-click `auto-start.bat`. The first time, it installs Vite. Then it serves the site at **http://localhost:8090** and opens your browser. `auto-stop.bat` stops whatever is running on port 8090. From a terminal you can also use `npm run dev`, `npm run build`, or `npm run preview` (which serves on port 8091).

## How it fits together

| File | What it does |
| --- | --- |
| `day.config.js` | **Everything about the day:** rooms and spots, the clock spine, behavior pools, body stats, things in the world |
| `js/schedule.js` | The engine. It compiles the config into one continuous timeline (about 700 actions) for each date. |
| `js/world.js` | The 3D stage (Babylon.js). Furniture is placed from the spots in the config, and props react to the things. |
| `js/main.js` | Clock, playback, the action log, body meters, the things panel |
| `simulation-checklist.md` | The original rules the simulation follows |

## Publishing a new version

1. Double-click `bump-version.bat` (or run `npm run bump`). Press Enter for a patch bump (1.0.0 → 1.0.1), or type `minor`, `major`, or an exact version.
2. Commit and push.

The bump updates the version in `package.json` and stamps `?v=<version>` on every local file link in `index.html`, so browsers fetch fresh CSS and JS the moment it's live. The page also asks browsers not to cache it. GitHub Pages can't send cache headers, so this is done with `<meta>` tags, and Pages may still hold `index.html` for up to about 10 minutes. On the live site, an open tab checks for a new version every 10 minutes and reloads itself when one is published. The local dev server sends `no-store`, so nothing is ever cached while you test.

## Editing the day

### Change when something happens

Every line on the clock is a **block** in `spine`:

```js
{
  time: "12:00",
  title: "Microwave",
  chapter: "lunch",
  steps: [
    { go: "microwave", for: "1.5-2m", do: "They walk to the break room." },
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

`Space` play/pause · `←` `→` 5 minutes (`Shift` for 1) · `1`–`5` speeds · `Esc` back to now
