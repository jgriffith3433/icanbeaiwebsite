/* ==========================================================================
   THE DAY
   --------------------------------------------------------------------------
   This one file defines everything Small Weather does, where he does it, and
   how his body and his things change. Edit it, save it, and reload the page.

   QUICK REFERENCE
   ---------------
   Durations:  "45s"  "3m"  "1.5h"  "2-4m"  "30s-1m"   (a range = random pick)
   Clock:      "7:30"  "13:05"   (24h; times earlier than dayStart = after midnight)

   A STEP (one thing the person does):
     do:      "Text shown on screen."  or ["variant", "variant"] (one is picked)
     go:      "spotName"   walk there (the route goes through doors). Lasts exactly as
                           long as the walk; do anything on arrival as its own step.
     at:      "spotName"   step over to it, then stay
     drive:   "spotName" | ["a","b"]   the car drives there (person must be in it)
     reverse: true          drive backwards (backing out)
     for:     "2-3m"        how long it really takes. Steps are never stretched to fit.
     fill:    true          this step soaks up whatever time the block has left.
                            (No fill? Leftover time becomes idle time; see `idle`.)
     micro:   { pools: ["desk","phone"], every: "2-6m" }   sprinkle small behaviors in
     pose:    stand walk sitChair sitCouch sitBed sitCar toilet lie side recline
              ("$sleepPose" reads the value from things)
     hand:    none type phone reach stretch eat drink wash brush hold remote
              cook wheel dress towel face nod
     face:    degrees (0 = toward the camera/front, 180 = toward the back wall)
              or a spot name to look at
     set:     { frontDoor: "locked" }   change things at the start of this step
     body:    { hunger: -0.5 }          change stats over this step
     activity: "sleep" | "rest" | "sit" | "work" | "stand" | "walk" | "drive"
              (which drift rates apply; default comes from the pose)
     chance:  0.3           only happens on 30% of days
     steps:   [ ... ]       a group of steps (use with chance for optional bits)

   A BLOCK (a line on the clock):
     time, title, chapter, steps
     chance, jitter: "20m"   optional block that may move around
     length + then           block runs `length`, then the `then` steps fill
                             the gap until the next block

   A POOL ENTRY (a small behavior the engine can drop into a `micro` step):
     do, for, pose, hand, set, body   (same meaning as a step)
     steps:   [ ... ]       multi-part ("go: '$back'" returns to where they were)
     when:    { deskGlass: "empty", thirst: ">0.5" }   only if these are true
              { weather: "rain" } or { weather: ["rain","storm"] } for the day's forecast
     likes:   { boredom: 2 }   more likely when that stat is high
     after / before: "13:00"   only in that part of the day
     max:     1             at most this many times a day
     weight:  2             base likelihood (default 1)
   ========================================================================== */

/* Reusable steps. Defined once, used in several blocks below. */
const WORK = {
  do: [
    "Small Weather works.",
    "Heads-down work.",
    "Typing.",
    "Reading through a document.",
    "Working down a list.",
    "Writing, then rewriting a sentence.",
    "Thinking it through, then typing.",
    "Scrolling through a long file.",
  ],
  pose: "sitChair",
  hand: "type",
  activity: "work",
  fill: true,
  micro: { pools: ["desk", "computer", "mind", "phone"], every: "2-7m" },
};

const SLEEP = {
  do: ["Asleep.", "Asleep. Breathing slow.", "Deep asleep.", "Asleep."],
  at: "bed",
  pose: "$sleepPose",
  activity: "sleep",
  fill: true,
  micro: { pools: ["night"], every: "25-80m" },
};

const WATCH_TV = {
  do: ["He watches.", "He watches the show.", "He laughs at something.", "He watches, half paying attention."],
  pose: "sitCouch",
  activity: "rest",
  fill: true,
  micro: { pools: ["couch", "mind", "phone"], every: "3-9m" },
};

const WATCH_IN_BED = {
  do: ["He watches, in bed.", "He watches.", "Eyes heavy. He keeps watching."],
  pose: "recline",
  activity: "rest",
  fill: true,
  micro: { pools: ["bedAwake", "phone"], every: "3-8m" },
};

const DRIVE_MICRO = { pools: ["driving"], every: "1-4m" };

window.DAY_CONFIG = {
  /* ------------------------------------------------------------------------
     BASICS
     ------------------------------------------------------------------------ */
  title: "I can be",
  dayStart: "7:30", // the day (and the timeline) begins here; the night before ends here
  seed: "date", // "date" = a different but repeatable day every date. Any other text = always the same day.
  start: { at: "bed", car: "parkHome" },
  sky: { sunrise: "7:05", sunset: "18:25" }, // mid-October // where the person and the car are when the day begins

  person: {
    name: "Small Weather", // shown in the side panel; he/him in every line below
    walkSpeed: 1.25, // world units per second
    skin: "#e2b394",
    hair: "#2a2422",
    shoes: "#241f1c",
    outfits: { // top, bottom, and optional feet (shoes/socks) colours
      sleep: { top: "#8395b0", bottom: "#5b6884", feet: "#e2b394" },
      work: { top: "#c46b52", bottom: "#3a3e46" },
      home: { top: "#6f8f78", bottom: "#4a4f5a" },
      towel: { top: "#e2b394", bottom: "#f1ede4", feet: "#e2b394" },
    },
  },

  /* ------------------------------------------------------------------------
     TAKING CONTROL — the player can take Small Weather off his day
     "Take control" (or Enter) and he's the player's: his day stops steering him
     at that moment, but the clock and the day keep going without him. "Let go"
     (or Esc) and he walks back (the same routes his day uses) to where the day
     says he should be by now, and carries on from there.
     The lines go into the action log at the minute they happen; `steering`
     is what the panel says while the player has him. He is "he", as everywhere.
     ------------------------------------------------------------------------ */
  control: {
    lines: {
      take: "You take over. His day keeps going without him.",
      steering: ["You have him.", "He goes where you go."],
      letGo: "You let go. He walks back to his day.",
      back: "Back where his day says. He carries on.",
      catchUp: "His day is too far off to walk. He catches up with it.",
      driving: "He's driving. Take control once he's out of the car.",
    },
    /* How he moves for the player. Metres and seconds. Floaty on purpose: the same
       two extra jumps as his Dose Of Destruction fighter; hold jump in the air to
       ride the wind (glide) across streets and between roofs. */
    move: {
      walk: 2.4, // walking (the stick or keys alone)
      sprint: 5.6, // Shift; a gamepad bumper or stick click; the touch stick pushed to its edge
      jumpHeight: 1.5, // the first jump, from the ground
      airJumps: 2, // extra jumps in the air
      airJumpHeight: 1.2,
      gravity: 14.5, // crisp third-person gravity; hold jump to engage storm-glide
      jumpSpeed: 6.8,
      airJumpSpeed: 6.4,
      maxFall: 9, // fastest fall
      floatFall: 1.6, // kept for older checks; glide uses glideFall
      glideFall: 0.85, // hold jump in the air: glide down at a readable pace
      glideSpeed: 9.5, // horizontal speed while steering in a glide
      airControl: 0.65, // how much he can steer in the air (1 = like on the ground)
      glideAirControl: 0.9,
      softLand: 2.4, // horizontal speed after a soft glide landing
      updraftCeiling: 22, // rooftop ceiling (~22m, above the 16.6m rooftops)
    },
    /* Storm-riding: wind trails, whoosh, camera pull-back, and updraft columns
       (ambient at avenue crosses in wind/storm; a Gust plants one he can ride). */
    ride: {
      cameraPull: 3.4,
      whoosh: "audio/sfx/glide-whoosh.mp3",
      trails: true,
      updraft: {
        radius: 4.2,
        lift: 8, // m/s upward at the centre of a player gust
        life: 7, // seconds a gust updraft lasts
        ceiling: 22,
        ambient: true,
        weather: { clear: 0, clouds: 0, rain: 0.25, storm: 1, fog: 0, wind: 0.92, snow: 0 },
      },
    },
    /* Small Weather's 3D model: the rigged GLB from Hawkes Gen (hawkes.assets.json), worn
       over the box figure on his day and under control (js/small-weather.js). Clips: idle,
       walk, run, jump, fall, float, cast, throw, and the day's sit, type, phone, lie, side,
       recline. null = the box-built figure. */
    model: "models/small-weather.glb",
  },

  /* ------------------------------------------------------------------------
     TITLE — the first thing the page shows (js/title.js)
     ------------------------------------------------------------------------
     The city's skyline behind his name, Play (takes control of him) and
     Episodes (the Episodes menu). His day keeps running behind it. Play
     turns the Sound on unless the player switched Music off here.
     ------------------------------------------------------------------------ */
  title: {
    kicker: "I Can Be",
    name: "Small Weather",
    line: "His day runs on its own, live. Take it over and command the sky.",
    play: "Play",
    episodes: "Episodes",
    musicOn: "Music on",
    musicOff: "Music off",
    hint: "Enter to play",
    day: "Day",
    night: "Night",
  },

  /* ------------------------------------------------------------------------
     OPENING — the first Play only (js/opening.js), skippable
     ------------------------------------------------------------------------
     Small Weather on screen (his model) with a few plain lines, then he is
     the player's. Candidate canon (docs/story-spec.md): the game opens
     without a story. Lines: "He", short, matter-of-fact; secs is how long
     each shows. Shown once (localStorage storageKey).
     ------------------------------------------------------------------------ */
  opening: {
    storageKey: "icanbe.opening",
    skip: "Skip",
    hint: "Esc to skip",
    beats: [
      { text: "This is Small Weather.", secs: 3.2 },
      { text: "He lives a developer's day. Alarm, coffee, a long drive, a desk.", secs: 4.2 },
      { text: "The sky over the district has been calm and clear for a long while.", secs: 4.2 },
      { text: "He can change that. A little rain. A little sun. Lightning, if he must.", secs: 4.4 },
      { text: "Your turn.", secs: 2.4 },
    ],
  },

  /* ------------------------------------------------------------------------
     MOMENTS — two staged beats (js/moments.js), both skippable
     ------------------------------------------------------------------------
     takeover: when the player takes him, the camera starts wide and pushes in
       to his shoulder (from metres, secs, a little fov) and he says one line
       (first person, his voice; one is picked at random). Any movement, the
       Skip button or a tap ends it. Voice mp3s for the lines are not made yet.
     dayEnd: when the clock rolls into the next day while the page is playing
       or live, a card closes the day: his sign-off, three events from the log
       (a spread across the day; a note from the player's own take-over wins the
       middle slot), and a last line. Skip, Esc, Enter, a tap, or 12 s.
     ------------------------------------------------------------------------ */
  moments: {
    takeover: {
      push: { from: 15, secs: 1.5, fov: 0.22 },
      lineSecs: 3.2,
      skip: "Skip",
      lines: ["Okay. My turn.", "Finally. Let's see the sky.", "All right. Where to?"],
    },
    dayEnd: {
      kicker: "Small Weather",
      title: "That was the day.",
      intro: "Here's what I remember.",
      outro: "Same again tomorrow. Maybe with weather.",
      outroPlayed: "Tomorrow I'd like the sky again.",
      skip: "Skip",
      hint: "Esc to skip",
      secs: 12,
      events: 3,
    },
  },

  /* ------------------------------------------------------------------------
     FIRST VISIT — one minute, then it stays quiet
     ------------------------------------------------------------------------
     The first time the page opens, a card walks the player through taking
     him, walking, a jump, one lightning strike, and letting go. Skip ends
     it. Done or skipped, it is not shown again (localStorage). Lines are
     to the player, short, the same plain voice as control.lines. He is
     "he". An episode offer waits until this card is gone.
     ------------------------------------------------------------------------ */
  tutorial: {
    storageKey: "icanbe.tutorial",
    skip: "Skip",
    done: "That's enough. His day is still running.",
    // The first card also says what the page is (J, 2026-10-27: catch a new visitor in the first seconds).
    intro: {
      title: "This is Small Weather's day, live.",
      line: "He lives it on his own, in real time. Take him over: walk the city, jump the roofs, call down the storm.",
      take: "Take control",
      hint: "Or press Enter.",
    },
    steps: [
      { id: "take", do: "Take control.", hint: "Enter, or the button.", touch: "Tap Take control." },
      { id: "move", do: "Walk him.", hint: "WASD or the arrows. Shift runs.", touch: "Drag the stick. Push it to the edge to run." },
      { id: "jump", do: "Jump.", hint: "Space. Twice more in the air. Hold it to float down.", touch: "Jump. Twice more in the air. Hold it to float down." },
      { id: "bolt", do: "Throw one lightning strike.", hint: "E, at the reticle. It spends Pressure.", touch: "Tap Bolt. It spends Pressure." },
      { id: "letgo", do: "Let go.", hint: "Esc. He walks back to where his day is.", touch: "Tap Let go. He walks back to where his day is." },
    ],
  },

  /* ------------------------------------------------------------------------
     WEATHER — the sky over his day, and what he commands while you have him
     ------------------------------------------------------------------------
     The sky is calm and clear: nothing changes it on its own (the old
     date-seeded forecast is off: AUTOMATIC_WEATHER in js/weather.js). Weather
     starts only when a power is used (lightning, Storm) or he sets it (1–7,
     hold Q, a tap), and a few real seconds after the last call it eases back. The blend is in real seconds.
     Lines are his, short, for the action log. `react` lines go in the log
     while autopilot still has the weather he left behind. Steps and pools
     can use `when: { weather: "rain" }` (or an array) against the forecast.
     ------------------------------------------------------------------------ */
  weather: {
    blend: 3.4,
    // How long a power's weather lasts and how fast it eases out: ABILITY_HOLD_SEC / ABILITY_FADE_SEC at the top of js/weather.js.
    forecast: {
      hours: 3,
      weight: { clear: 26, clouds: 22, rain: 16, storm: 8, fog: 10, wind: 10, snow: 8 },
    },
    lines: {
      clear: "Clear.",
      clouds: "Clouds.",
      rain: "Rain.",
      storm: "A storm.",
      fog: "Fog.",
      wind: "Wind.",
      snow: "Snow.",
    },
    /* Autopilot log while the weather he left still holds (after let-go). */
    react: {
      cooldown: 16,
      clear: ["He looks up. Clear again.", "The sky opened. He notices."],
      clouds: ["Clouds. He glances at the window.", "Grey out there. He keeps going."],
      rain: ["He cancels the walk. It's raining.", "Rain on the glass. He watches a second."],
      storm: ["He watches the storm from the window.", "Thunder. He stays put.", "A storm. He isn't going out in that."],
      fog: ["Fog. Soft edges out the window.", "He can barely see the lot."],
      wind: ["Wind rattles something. He listens.", "Gusty. He pulls his jacket closer."],
      snow: ["Snow. Quiet out there.", "He smiles at the snow for a second."],
    },
  },

  /* ------------------------------------------------------------------------
     BARKS — Small Weather's small reactions in the log (js/barks.js)
     ------------------------------------------------------------------------
     One short log line when a need gets loud (hunger, thirst, tired, bladder, stress, boredom) or the
     sky changes under him. Voice rules: docs/voice-style.md. A line is used once per in-game day (the
     module keeps the day's used lines), so a pool that runs dry stays quiet. `x@rain` pools are for
     the need while it's raining. Gaps are sim minutes (`gap` between any two need barks, `again` for
     the same need); `delay` is real seconds after the weather changes.
     ------------------------------------------------------------------------ */
  barks: {
    gap: 25,
    again: 150,
    delay: 1.6,
    weatherGap: 12,
    needs: {
      hunger: { above: 0.62, lines: [
        "His stomach says something. He agrees with it.",
        "Hungry now. The next meal can't come soon enough.",
        "He thinks about toast. Only toast.",
      ] },
      thirst: { above: 0.64, lines: [
        "His mouth is dry. Water, soon.",
        "He licks his lips and looks for the glass.",
        "Thirsty enough to notice it. Not enough to stop.",
      ] },
      energy: { below: 0.3, lines: [
        "His eyes go heavy. He blinks it off.",
        "He rubs his face. Long day.",
        "He is running low, and knows it.",
      ] },
      bladder: { above: 0.82, lines: [
        "He shifts in place. That can't wait much longer.",
        "He is going to need a bathroom. Soon.",
      ] },
      stress: { above: 0.55, lines: [
        "His shoulders have crept up to his ears. He drops them.",
        "A slow breath out. Then he goes back to it.",
      ] },
      boredom: { above: 0.72, lines: [
        "He taps the desk. Twice. Then again.",
        "He has watched the same patch of wall for a while now.",
      ] },
      "hunger@rain": { above: 0.62, lines: [
        "Rain and an empty stomach. Soup, he decides.",
        "Hungry, and the rain makes it worse.",
      ] },
      "thirst@rain": { above: 0.64, lines: [
        "It is pouring and he is thirsty. He sees the joke and keeps it to himself.",
      ] },
    },
    weather: {
      rain: [
        "Rain. He lets it be a minute before he moves.",
        "The rain suits him. He doesn't say so.",
        "He listens to the rain on the glass.",
      ],
      storm: [
        "Thunder, close. He feels it in his teeth and grins.",
        "A storm. His hands go still, then easy.",
        "The sky goes dark and he is the calmest thing in it.",
      ],
      fog: [
        "Fog takes the far end of the street. He leaves it alone.",
        "The edges of everything go soft. He likes that.",
      ],
      wind: [
        "Wind. He holds his jacket shut and lets it push.",
        "Something loose rattles outside. He knows the sound.",
      ],
      snow: [
        "Snow. He watches the first of it come down.",
        "Everything goes quiet. He lets it.",
      ],
      clear: [
        "Clear sky. He lets out a breath he didn't know he had.",
        "The clouds are gone. He misses them a little.",
      ],
      clouds: [
        "Clouds, low and grey. Good light for thinking.",
      ],
    },
  },

  /* ------------------------------------------------------------------------
     SCORE — adaptive music and ambience that follow the weather (js/score.js)
     ------------------------------------------------------------------------
     Loopable beds from Hawkes Gen audio.music (ACE-Step), ambience and thunder
     from audio.sfx. They crossfade with the weather blend. A short sting plays
     when you take control. Paths are relative to the site root; missing files
     leave the procedural weather noise in place. Sound stays off until the
     Sound button (browser autoplay). Wind reuses the clear bed.
     ------------------------------------------------------------------------ */
  score: {
    fade: 2.8,
    /* The mix, in one place (js/score.js). master: everything the score plays; music: the beds; ambience:
       rain, wind and city hum; sting: take control; thunder: on top of ambience; whoosh: the glide;
       title: the music level while the title screen is up; duck: how far the music dips under his voice;
       nightTone: the low-pass (Hz) that softens the music at night. His voice is `voice.volume`. */
    mix: { master: 0.9, music: 0.3, ambience: 0.55, sting: 0.5, thunder: 0.85, whoosh: 0.55, title: 0.4, duck: 0.45, nightTone: 2400 },
    /* Clear weather plays a calm day bed by day and its night variation from 7:45 PM to 6:15 AM, crossfaded.
       Until Hawkes Gen makes their own files (hawkes.assets.json music-day / music-night: add
       `day: "audio/music/day.mp3", night: "audio/music/night.mp3"` below), they play the clear and snow beds. */
    nightFrom: 19.75,
    nightTo: 6.25,
    /* Pressure scores the music (js/score.js): above `from` of the meter a low drone and pulse swell in
       (top level `gain`), the beds speed up by up to `rate`, and the night low-pass opens. Procedural, no files. */
    pressure: { from: 0.4, gain: 0.5, rate: 0.06 },
    fallback: { day: "clear", night: "snow" },
    music: {
      clear: "audio/music/clear.mp3",
      clouds: "audio/music/clouds.mp3",
      rain: "audio/music/rain.mp3",
      storm: "audio/music/storm.mp3",
      fog: "audio/music/fog.mp3",
      wind: "audio/music/clear.mp3",
      snow: "audio/music/snow.mp3",
    },
    sting: "audio/music/take-control.mp3",
    whoosh: "audio/sfx/glide-whoosh.mp3",
    whooshVol: 0.62,
    ambience: {
      air: "audio/sfx/city-hum.mp3",
      rain: "audio/sfx/rain-asphalt.mp3",
      wind: "audio/sfx/wind.mp3",
      thunderNear: "audio/sfx/thunder-near.mp3",
      thunderFar: "audio/sfx/thunder-far.mp3",
    },
  },

  /* ------------------------------------------------------------------------
     POWERS — what he can call down while you have him
     ------------------------------------------------------------------------
     He is a storm caller. Pressure fills while you have him, and faster in a
     storm. Each call spends some, so they land hard and then he has to wait.
     Hold F (Y, or the Storm button) and the sky darkens over him, then the
     storm spreads and the rain starts. E (X, right-click, Bolt) throws
     lightning where the reticle sits. G (left trigger, Gust) shoves what's
     in front of him. T (right trigger, Tornado) sends one down the street.
     Loose bins and people with umbrellas stand near the avenue so a gust
     has something to take. A Gust also plants a short updraft he can ride.
     `dz` is metres from the avenue's centre line.
     ------------------------------------------------------------------------ */
  powers: {
    max: 100,
    regen: 12, // per second, while you have him
    stormRegen: 14, // added on top while the weather is a storm
    hold: 0.7, // seconds the storm takes to answer
    aim: 3.6, // metres past him the reticle rests, along the camera
    cone: 52, // gust half-angle, degrees
    reach: 11, // gust length, metres
    costs: { storm: 40, bolt: 24, gust: 16, tornado: 48, rain: 18, gale: 20, fog: 16, sunbreak: 22 },
    keys: { storm: "f", bolt: "e", gust: "g", tornado: "t", rain: "r", gale: "v", fog: "c", sunbreak: "x" },
    // js/abilities.js: the bar's cooldown sweep. Seconds before the next call, and how long it lasts.
    cooldowns: { storm: 6, bolt: 1.5, gust: 2, tornado: 8, rain: 4, gale: 5, fog: 4, sunbreak: 6 },
    durations: { storm: 0, bolt: 0.55, gust: 0.42, tornado: 5.4, rain: 3, gale: 3, fog: 3, sunbreak: 3 },
    names: { storm: "Storm", bolt: "Lightning", gust: "Gust", tornado: "Tornado", rain: "Rain", gale: "Gale", fog: "Fog", sunbreak: "Sun break" },
    lines: {
      cooling: "Not ready yet.",
      gather: "The sky draws in over him.",
      storm: "He calls the storm down.",
      bolt: "Lightning. Where he aimed.",
      gust: "A hard gust. The air lifts under him.",
      tornado: "He sends a tornado down the street.",
      rain: "Rain, just here, just for a moment.",
      gale: "A gale tears down the street.",
      fog: "Fog rolls in off the street.",
      sunbreak: "The clouds split. Warm light.",
      dry: "Not enough pressure.",
      locked: "Not unlocked yet.",
    },
    loose: [
      { kind: "umbrella", x: -1.6, dz: -2.6 },
      { kind: "umbrella", x: -2.3, dz: -3.3 },
      { kind: "bin", x: -2.0, dz: -1.3 },
      { kind: "bin", x: -8.5, dz: 2.8 },
      { kind: "umbrella", x: 8.2, dz: 2.8 },
    ],
  },

  /* ------------------------------------------------------------------------
     DIALOGUE — the story parts' lines and the neighbors' beats, spoken (js/dialogue.js).
     Each speaker has an ElevenLabs voice (Hawkes Gen audio.voice); he is DoD Eric as in `voice`. A
     "He" line about him in the third person stays text. Speakers not in `cast` take one of `extras`
     by their name. Files: audio/dialogue/dlg-<who>-<hash>.mp3, recipes in hawkes.assets.json.
     ------------------------------------------------------------------------ */
  dialogue: {
    volume: 0.9,
    model: "eleven_v4",
    cast: {
      He: "cjVigY5qzO86Huf0OWal", // Eric (his voice everywhere)
      Birdie: "EXAVITQu4vr4xnSDxMaL", // Sarah: warm, mature
      Dex: "TX3LPaxmHKxFdv7VOQHJ", // Liam: quick, friendly
      Ines: "Xb7hH8MSUJpSbSDYk0k2", // Alice: clear, precise
      Board: "onwK4e9ZLuTAKqWW03F9", // Daniel: the loudspeaker's broadcaster
      // the people he helps in the story parts, one voice each
      Odile: "cgSgspJ2msm6clMCkdW9", // Jessica
      Hollis: "IKne3meq5aSn9XLyUdCD", // Charlie
      Nell: "FGY2WhTYpPnrIDTdsKH5", // Laura
      Marlo: "bIHbv24MWmeRgasZH58o", // Will
      Tamsin: "pFZP5JQG7iQjIQuC4Bku", // Lily
      Wren: "hpp4J3VqNfWAUOO0d1Us", // Bella
      Hale: "nPczCjzI2devNBz1zQrb", // Brian
      Odette: "XrExE9yKIg1WjnnlVkGX", // Matilda
      Sorrel: "iP95p4xoKVk53GoZ742B", // Chris
      Pike: "CwhRBWXzGAHq8TQ4Fs17", // Roger
    },
    extras: [
      "cgSgspJ2msm6clMCkdW9", // Jessica
      "IKne3meq5aSn9XLyUdCD", // Charlie
      "FGY2WhTYpPnrIDTdsKH5", // Laura
      "bIHbv24MWmeRgasZH58o", // Will
      "pFZP5JQG7iQjIQuC4Bku", // Lily
      "nPczCjzI2devNBz1zQrb", // Brian
      "hpp4J3VqNfWAUOO0d1Us", // Bella
      "iP95p4xoKVk53GoZ742B", // Chris
      "CwhRBWXzGAHq8TQ4Fs17", // Roger
      "XrExE9yKIg1WjnnlVkGX", // Matilda
      "pqHfZKP75CvOlQylNhV4", // Bill
      "SAz9YHcvj6GT2YYXdXww", // River
    ],
  },

  /* ------------------------------------------------------------------------
     VOICE — Small Weather speaks (js/voice.js), same DoD voice (Eric)
     ------------------------------------------------------------------------
     Cocky, calm, a storm god who is also a developer. Lines are short. Each
     has text and an MP3 from Hawkes Gen audio.voice (hawkes.assets.json). A
     cooldown keeps him from chattering. Powers roll a chance so he does not
     bark every call. Weather reactions fire when a state starts. Take control
     / let go are an episode open and a score-card close. Autopilot mutters
     while his day has him. Glide is the floaty fall (Space held).
     ------------------------------------------------------------------------ */
  voice: {
    voiceId: "cjVigY5qzO86Huf0OWal", // DoD Eric (doseofdestructionwebsite/content/voice.json)
    cooldown: 2.6, // seconds between any spoken lines
    powerChance: 0.48, // powers only: he does not talk every call
    volume: 0.88,
    dayEvery: 90, // wall seconds between autopilot mutter rolls while on his day
    dayChance: 0.55,
    lines: [
      // powers
      { id: "bolt-1", group: "bolt", text: "Point and flash.", file: "audio/voice/bolt-1.mp3" },
      { id: "bolt-2", group: "bolt", text: "That one felt personal.", file: "audio/voice/bolt-2.mp3" },
      { id: "bolt-3", group: "bolt", text: "Keep the count. I'll keep the bolts.", file: "audio/voice/bolt-3.mp3" },
      { id: "gust-1", group: "gust", text: "Move.", file: "audio/voice/gust-1.mp3" },
      { id: "gust-2", group: "gust", text: "Wind's on my side.", file: "audio/voice/gust-2.mp3" },
      { id: "gust-3", group: "gust", text: "Bins don't get a vote.", file: "audio/voice/gust-3.mp3" },
      { id: "storm-1", group: "storm", text: "I brought the weather.", file: "audio/voice/storm-1.mp3" },
      { id: "storm-2", group: "storm", text: "Pressure's rising. Good.", file: "audio/voice/storm-2.mp3" },
      { id: "storm-3", group: "storm", text: "Sky's mine for a minute.", file: "audio/voice/storm-3.mp3" },
      { id: "tornado-1", group: "tornado", text: "Watch the street.", file: "audio/voice/tornado-1.mp3" },
      { id: "tornado-2", group: "tornado", text: "Funnel's going.", file: "audio/voice/tornado-2.mp3" },
      { id: "tornado-3", group: "tornado", text: "Drama, delivered.", file: "audio/voice/tornado-3.mp3" },
      { id: "glide-1", group: "glide", text: "Easy.", file: "audio/voice/glide-1.mp3" },
      { id: "glide-2", group: "glide", text: "I don't fall. I float.", file: "audio/voice/glide-2.mp3" },
      // weather reactions (group = weather-<state>)
      { id: "wx-clear", group: "weather-clear", text: "Clear skies. Boring, but fine.", file: "audio/voice/wx-clear.mp3" },
      { id: "wx-clear-2", group: "weather-clear", text: "Sun's out. I'm not.", file: "audio/voice/wx-clear-2.mp3" },
      { id: "wx-clouds", group: "weather-clouds", text: "Clouds. Warming up.", file: "audio/voice/wx-clouds.mp3" },
      { id: "wx-rain", group: "weather-rain", text: "Rain. Finally something useful.", file: "audio/voice/wx-rain.mp3" },
      { id: "wx-rain-2", group: "weather-rain", text: "Wet road. Good.", file: "audio/voice/wx-rain-2.mp3" },
      { id: "wx-storm", group: "weather-storm", text: "There it is.", file: "audio/voice/wx-storm.mp3" },
      { id: "wx-storm-2", group: "weather-storm", text: "This is more like it.", file: "audio/voice/wx-storm-2.mp3" },
      { id: "wx-fog", group: "weather-fog", text: "Fog. Soft edges.", file: "audio/voice/wx-fog.mp3" },
      { id: "wx-wind", group: "weather-wind", text: "Wind's restless.", file: "audio/voice/wx-wind.mp3" },
      { id: "wx-snow", group: "weather-snow", text: "Snow. Quiet drama.", file: "audio/voice/wx-snow.mp3" },
      // episode open (take control) and score-card close (let go)
      { id: "ep-open-1", group: "episode-open", text: "Alright. My turn.", file: "audio/voice/ep-open-1.mp3" },
      { id: "ep-open-2", group: "episode-open", text: "The day's on autopilot. I'm not.", file: "audio/voice/ep-open-2.mp3" },
      { id: "ep-open-3", group: "episode-open", text: "The Orchestrator asked for drama, so I brought the weather.", file: "audio/voice/ep-open-3.mp3" },
      { id: "ep-close-1", group: "episode-close", text: "Back to the day. It kept going without me.", file: "audio/voice/ep-close-1.mp3" },
      { id: "ep-close-2", group: "episode-close", text: "Not bad for a lunch break.", file: "audio/voice/ep-close-2.mp3" },
      { id: "ep-close-3", group: "episode-close", text: "Pressure spent. Worth it.", file: "audio/voice/ep-close-3.mp3" },
      { id: "ep-close-4", group: "episode-close", text: "Clock's still running. So am I.", file: "audio/voice/ep-close-4.mp3" },
      // autopilot mutters on his developer day
      { id: "day-1", group: "day", text: "Another commit. Another cloud somewhere.", file: "audio/voice/day-1.mp3" },
      { id: "day-2", group: "day", text: "Code compiles. Sky doesn't.", file: "audio/voice/day-2.mp3" },
      { id: "day-3", group: "day", text: "Standing desk. Sitting storm.", file: "audio/voice/day-3.mp3" },
      { id: "day-4", group: "day", text: "Coffee's cold. Forecast isn't.", file: "audio/voice/day-4.mp3" },
      { id: "day-5", group: "day", text: "Traffic's nothing. Weather's everything.", file: "audio/voice/day-5.mp3" },
      { id: "day-6", group: "day", text: "Alarm set. Atmosphere optional.", file: "audio/voice/day-6.mp3" },
      { id: "day-7", group: "day", text: "Pull request. Push weather.", file: "audio/voice/day-7.mp3" },
      { id: "day-8", group: "day", text: "Meeting at ten. Storm whenever.", file: "audio/voice/day-8.mp3" },
      { id: "day-9", group: "day", text: "I type. The sky waits.", file: "audio/voice/day-9.mp3" },
    ],
  },

  /* ------------------------------------------------------------------------
     EPISODES — playable weather missions tied to chapters of his day
     ------------------------------------------------------------------------
     Story: Small Weather lives the developer day on autopilot, but when you
     take him he feels like a god — he brought the weather. Four episodes sit
     on the day's chapters (data here, play in js/episodes.js). Taking control
     during a matching chapter offers that episode; the Episodes menu jumps
     the clock there. Each has 2–3 goals, an optional timer, and ends on a
     forecast-style score card kept in localStorage (`storageKey`). He can't
     be taken while driving, so Hurricane drive starts as he walks the work
     lot — you walk or glide home through the storm you made.
     ------------------------------------------------------------------------ */
  episodes: {
    storageKey: "icanbe.episodes.best",
    offerOnTake: true,
    lines: {
      offer: "An episode is open.",
      accept: "Take it",
      decline: "Just walk",
      menu: "Episodes",
      scoreTitle: "Today's forecast",
      best: "Best",
      done: "Episode clear.",
      timeUp: "Time's up.",
      letGo: "Episode paused — score stands.",
    },
    /* Strain (the beat sheet's overuse rule, per story episode): every weather call adds to a meter
       by kind; the same call again inside `stackSec` adds double. Over an episode's `strain.budget`
       the part is scarred: kick-backs happen in the world and the card says so. */
    strain: {
      costs: { rain: 1, gale: 1, sunbreak: 1, fog: 1, bolt: 2, gust: 1, tornado: 2, storm: 2 },
      stackSec: 60,
      perHour: 1, // Strain falls by this much for each sim hour after the part that raised it
      scarPenalty: 25,
      lines: { clean: "Clean", scarred: "Scarred", meter: "Sky", of: "of" },
    },
    /* The ending card after Part 3: chosen from the three parts' marks and the Strain at the Tank (rules.calm /
       rules.overcast). Same sky each time, different weather. `fared` is the line per need and state
       (ok, scar, open = never answered). */
    endings: {
      rules: { calm: 6, overcast: 10 },
      lines: { kicker: "How the district fared", tally: "Sky at the Tank", again: "Walk the city" },
      needs: { park: "The park", turbines: "The turbines", market: "The market", reservoir: "The reservoir" },
      fared: {
        park: { ok: "Green. The pond is up a notch. Birdie's tomatoes are not sulking.", scar: "Green, with a brown patch and a pond that ran over the path.", open: "Still straw." },
        turbines: { ok: "Turning. The roofs have power.", scar: "Turning, but a stall is down in the plaza and a blade shut itself.", open: "Still. Not one has turned." },
        market: { ok: "Open. Stalls up, the plaza full.", scar: "Open, with a stall shut and some stock lost.", open: "Soft produce. Nothing to sell." },
        reservoir: { ok: "Full, and holding.", scar: "Full, then the avenue flooded or the sky wouldn't stop.", open: "Still low." },
      },
      A: {
        name: "Fair Weather",
        scene: "Morning. The park is green, the turbines turn, the market is open, the Tank is full. Birdie waves from the bench. Ines is asleep on the annex roof with her chart.",
        last: ["He", "Clear skies. He did that, and then stopped."],
      },
      B: {
        name: "Heavy Weather",
        scene: "The district has all four things, with scars: a brown patch on the lawn, a stall shut, a wet avenue. People nod to him on the street instead of speaking.",
        last: ["He", "It worked. It cost."],
      },
      C: {
        name: "Overcast",
        scene: "The sky stays grey for a week. The Board's loudspeaker plays the Weather Warning on a loop. The neighbors watch from windows.",
        last: ["He", "He asked the sky for everything. It's still thinking about it."],
      },
    },
    /* One score for every episode (js/episodes.js `liveScore`): people helped (or goals done), time left,
       damage avoided (wrong calls, Sky, kick-backs) and ability variety (distinct abilities used, over the
       episode's `variety`, else `variety` here). Rank from the percent of the max. */
    scoring: {
      weights: { people: 400, time: 200, damage: 250, variety: 150 },
      variety: 3,
      bands: [
        { min: 90, rank: "S" },
        { min: 70, rank: "A" },
        { min: 45, rank: "B" },
        { min: 0, rank: "C" },
      ],
      names: { people: "People helped", time: "Time left", damage: "Damage avoided", variety: "Ability variety" },
      unlockLine: "Challenge unlocked. Find it in the Episodes menu.",
    },
    /* The Challenge (unlocks after the first clear of an episode): timer x `timer`, Sky budget + `budget`, and
       each episode's own `challenge.extra` people in its set pieces. Best rank is kept apart, as `<id>#challenge`. */
    challenge: { timer: 0.7, budget: -1 },
    /* Bands for the score card copy: "N% chance of <word>". */
    bands: [
      { min: 90, word: "awesome" },
      { min: 70, word: "great weather" },
      { min: 40, word: "drama" },
      { min: 0, word: "drizzle" },
    ],
    list: [
      /* The tutorial episode (first in the menu; offered once, on a new player's first take
         control after the first-visit card). It teaches the five weather abilities one at a
         time: every ability is locked, the next one unlocks (a toast says so) when the one
         before it has been used, and when the last is used, or on Skip, everything is open.
         Not tied to a chapter or the clock: it plays wherever he stands. */
      {
        id: "tutorial",
        tutorial: true,
        title: "Learn the weather",
        tagline: "Five abilities, one at a time. Skip any time.",
        goals: [
          { id: "bolt", kind: "ability", power: "bolt", label: "Throw Lightning", prompt: "Press E to throw Lightning where the reticle is." },
          { id: "rain", kind: "ability", power: "rain", label: "Call Rain", prompt: "Press R. Rain, just here, just for a moment.", after: "bolt" },
          { id: "gale", kind: "ability", power: "gale", label: "Call a Gale", prompt: "Press V. A gale shoves bins and umbrellas down the street.", after: "rain" },
          { id: "fog", kind: "ability", power: "fog", label: "Roll in Fog", prompt: "Press C. Fog rolls in off the street.", after: "gale" },
          { id: "sunbreak", kind: "ability", power: "sunbreak", label: "Break the Sun through", prompt: "Press X. The clouds split.", after: "fog" },
        ],
        lines: {
          start: "Five abilities. He learns them one at a time.",
          done: "That's all five. The sky is his.",
          skip: "Skipped. Every ability is open.",
          unlock: "New ability: {name}. Key {key}.",
        },
      },
      {
        id: "morning",
        variety: 2,
        title: "Clear the sky",
        tagline: "Break up the forecast's clouds before he leaves.",
        chapters: ["wake", "ready"],
        clock: "7:55",
        timer: 150,
        goals: [
          { id: "clouds", kind: "weather", state: "clouds", label: "Gather the clouds" },
          { id: "clear", kind: "weather", state: "clear", label: "Clear the sky", after: "clouds" },
          { id: "street", kind: "reach", spot: "carSideHome", r: 6, label: "Reach the car" },
        ],
        lines: {
          start: "Morning air. His to rewrite.",
          done: "Clear skies for the commute. He did that.",
        },
      },
      /* Story arc, Part 1 (docs/story-arc-beat-sheet.md): the park is dry, the market is losing its
         stock. Rain belongs on the park and nowhere near the market; the market wants sun. Lunch
         is when Birdie is on the bench and Dex is in the plaza, so one run needs no clock jump. */
      {
        id: "dry-park",
        variety: 2,
        part: 1,
        title: "Part 1: Dry",
        tagline: "Rain on the park, not the market. Then dry the market out.",
        chapters: ["work", "lunch"],
        after: "11:40",
        before: "12:15",
        clock: "11:50",
        timer: 300,
        zones: {
          park: { rect: [-34, 20, 30, 68], pad: 6, name: "the park" },
          market: { rect: [106, 16.8, 130, 36], pad: 8, name: "the market" },
        },
        market: { open: false },
        strain: { budget: 4 },
        goals: [
          { id: "rain-park", kind: "ability-in", power: "rain", zone: "park", label: "Rain on the park (R, near Birdie)" },
          { id: "sun-market", kind: "ability-in", power: "sunbreak", zone: "market", after: "rain-park", label: "Sun break over the market (X)" },
          { id: "stalls", kind: "stay", zone: "market", seconds: 20, after: "sun-market", label: "Stay while the stalls fill" },
        ],
        lines: {
          start: "The park is straw. The market is soft. Two asks.",
          done: "The park drank. The market opened.",
          scarred: "The park drank. The market opened. It cost.",
        },
        say: {
          start: [
            ["Birdie", "There you are. My tomatoes are sulking. The whole lawn is."],
            ["Birdie", "A little rain. Not a lot. A little."],
            ["He", "Rain's the park's. Not the market's."],
          ],
          "goal:rain-park": [
            ["Birdie", "Look at them drink. Bless you."],
            ["Dex", "Parcels, produce, everything's gone soft. You can't sell soft."],
            ["Dex", "Sun break. Two minutes. Dry the plaza out, then I'll carry the rest."],
          ],
          "goal:sun-market": [["He", "Sun's here."]],
          "edgy": [["Birdie", "Enough now?"]],
          "kick:flood": [["Birdie", "That's plenty. That's — plenty."]],
          "kick:soak": [["Dex", "That's rain. On the produce. On the produce, Small Weather."]],
          "kick:scorch": [["Dex", "It's brown behind you. The grass. It's brown."]],
          "end:clean": [
            ["Board", "Reservoir level: low. Two days. Maybe three."],
            ["He", "Two days."],
          ],
          "end:scarred": [
            ["Board", "Reservoir level: low. And the sky's been busy."],
            ["He", "It cost."],
          ],
        },
        toasts: { "goal:rain-park": "The park drank.", "goal:stalls": "The market is open." },
        scars: { flood: "the pond ran over the path", soak: "the stock got rained on", scorch: "a brown patch on the lawn", shut: "one stall stays shut" },
      },
      /* Rooftop storm (the lunch episode, rebuilt as a rescue; docs/story-arc-beat-sheet.md "The lunch storm"). A storm
         nobody called sits on the district. Three set pieces, each a goal: people to get out of it with the matching
         ability called within `range` of them (the nearest unhelped one per call). Full points inside `limit` s of a
         piece starting, `late` after. The twist fires when the second piece is done (fog, debris, the third piece).
         Rank S..C is points over `max`. Everything the episode says is `say` ([who, text]). */
      {
        id: "lunch",
        title: "Rooftop storm",
        tagline: "A storm nobody called. Get the stranded out of it: the plaza, the shop roof, the avenue.",
        chapters: ["lunch"],
        clock: "12:20",
        timer: 260,
        rods: ["shop"],
        sky: { state: "storm", intensity: 0.85 },
        zones: {
          plaza: { rect: [106, 16.8, 130, 36], pad: 6, name: "the plaza" },
          shop: { rect: [43, -5.5, 57, 6.5], pad: 14, name: "the shop roof" },
          avenue: { rect: [66, 6, 102, 19], pad: 6, name: "the avenue" },
        },
        rank: {
          help: 100,
          late: 60,
          precision: 25,
          time: 150,
          max: 775,
          bands: [
            { min: 90, rank: "S" },
            { min: 70, rank: "A" },
            { min: 45, rank: "B" },
            { min: 0, rank: "C" },
          ],
        },
        variety: 3,
        challenge: {
          timer: 0.7,
          extra: {
            shelter: [{ id: "tobin", name: "Tobin", x: 114, z: 22, color: "#4f9a5b", thanks: "Tobin: The umbrella went first. I went second." }],
            street: [{ id: "juno", name: "Juno", x: 84, z: 11, color: "#a65bb5", thanks: "Juno: I counted the lamp posts. Twice." }],
          },
        },
        pieces: [
          {
            id: "shelter",
            goal: "shelter",
            powers: ["sunbreak"],
            range: 9,
            limit: 70,
            people: [
              { id: "odile", name: "Odile", x: 109.5, z: 27, color: "#d9604a", thanks: "Odile: Go on, go on. The chairs can drown." },
              { id: "pim", name: "Pim", x: 118, z: 31, color: "#4a7fc0", thanks: "Pim: My noodles. My dry noodles." },
              { id: "gus", name: "Gus", x: 126.5, z: 25.5, color: "#a65bb5", thanks: "Gus: Forty years. Never saw it come in sideways." },
            ],
          },
          {
            id: "rescue",
            goal: "rescue",
            powers: ["bolt"],
            range: 16,
            limit: 70,
            rod: "shop",
            twist: true,
            people: [{ id: "hollis", name: "Hollis", x: 53, z: 3, y: 3.3, color: "#e0a53c", thanks: "Hollis: Ladder's in the next street. I'll walk." }],
          },
          {
            id: "street",
            goal: "street",
            powers: ["gale", "gust"],
            range: 13,
            limit: 70,
            debris: true,
            people: [
              { id: "nell", name: "Nell", x: 78, z: 9.6, color: "#4f9a5b", thanks: "Nell: There. There's the crosswalk." },
              { id: "ravi", name: "Ravi", x: 90, z: 15.6, color: "#d9a05a", thanks: "Ravi: I couldn't see my own umbrella." },
            ],
          },
        ],
        goals: [
          { id: "shelter", kind: "help", piece: "shelter", count: 3, label: "Shelter the plaza: Sun break near each (X)" },
          { id: "rescue", kind: "help", piece: "rescue", count: 1, after: "shelter", label: "Rescue the roof: Lightning near the shop (E)" },
          { id: "street", kind: "help", piece: "street", count: 2, after: "rescue", label: "Clear the street: Gale or Gust near each (V / G)" },
        ],
        lines: {
          start: "Lunch break. A storm nobody called.",
          done: "Everyone's inside. The cell drifts east, toward the Tank.",
          timeUp: "The storm took the rest.",
          late: "{name} has waited too long.",
        },
        say: {
          start: [
            ["Dex", "Small Weather. That storm isn't anyone's. Not the forecast's, not mine."],
            ["Dex", "The plaza, the shop roof, the avenue. People are stuck in all three."],
            ["He", "Plaza first."],
          ],
          "piece:shelter": [["He", "Sun break. Near each one."]],
          "late:shelter": [["Odile", "It's coming in sideways! Anyone?"]],
          "piece:rescue": [
            ["Hollis", "Up here! The ladder's gone and the roof is humming."],
            ["He", "Ground it. Lightning."],
          ],
          "late:rescue": [["Hollis", "My hair is standing up. That's not a joke."]],
          "twist": [
            ["Ines", "That wasn't rain. That was something clearing its throat."],
            ["Dex", "The rain stopped. It went to fog. The avenue's blind, and there's junk in the road."],
            ["He", "It's moving. Not passing."],
          ],
          "piece:street": [["He", "Wind. Make it move."]],
          "late:street": [["Nell", "Cars! I can hear cars!"]],
          "end:S": [["Dex", "Everyone. Every single one. Lunch is on me."], ["He", "Lunch."]],
          "end:A": [["Dex", "Everyone's out. Mostly dry."], ["He", "Mostly."]],
          "end:B": [["Dex", "We got out. Some of us waited a long time."], ["He", "He knows."]],
          "end:C": [["Dex", "You got some of us."], ["He", "Not enough."]],
        },
        toasts: { "goal:shelter": "The plaza is out of the storm.", "goal:rescue": "Hollis is down. The fog is in.", "goal:street": "The street is clear." },
      },
      /* Story arc, Part 2: the wind turbines on the annex roof have been still all week. A steady
         gale turns them; too much wind (or wind in the plaza) costs the market its stalls. */
      {
        id: "still-blades",
        variety: 2,
        part: 2,
        title: "Part 2: Still",
        tagline: "Wind for the turbines, not for the market stalls.",
        chapters: ["work"],
        after: "16:20",
        before: "17:45",
        clock: "16:40",
        timer: 240,
        zones: {
          roofs: { rect: [149, -5.5, 165, 6.5], pad: 10, name: "the annex roof" },
          market: { rect: [106, 16.8, 130, 36], pad: 8, name: "the market" },
        },
        turbines: { x: [152, 157, 162], z: 0.5, y: 5.72 },
        market: { open: true },
        strain: { budget: 7 },
        goals: [
          { id: "ines", kind: "reach", x: 154, z: 9.8, r: 8, label: "Find Ines at the annex" },
          { id: "turn", kind: "wind-time", zone: "roofs", seconds: 10, after: "ines", label: "Keep a gale on the roof (V)" },
          { id: "stalls-stand", kind: "intact", after: "turn", label: "Leave every stall standing" },
        ],
        lines: {
          start: "The elevator crawls. The lights are low. Roofs are quiet.",
          done: "The roofs have power.",
          scarred: "The blades turn. Not everything stayed up.",
        },
        say: {
          start: [
            ["He", "Pull request. Push weather."],
            ["Ines", "Seventeen blades on this roof. Not one has turned since Tuesday."],
          ],
          "goal:ines": [
            ["Ines", "A gale. Steady, not a tantrum. They only turn if the wind is kind."],
            ["He", "Steady."],
          ],
          "goal:turn": [["Ines", "They're turning. Do you see how they turn?"]],
          "edgy": [["Ines", "Enough now?"]],
          "kick:topple": [["Dex", "The stalls! Mind the stalls!"]],
          "kick:overspeed": [["Ines", "Too fast. They've shut themselves. Start again, and kinder."]],
          "end:clean": [
            ["Ines", "The charts moved. The reservoir isn't just low. Something has been pulling the sky toward it."],
            ["He", "Pulling."],
            ["Ines", "Something wants the water gone. Or the weather very much on."],
            ["Board", "Reservoir level: critical."],
          ],
          "end:scarred": [
            ["Ines", "They turned. Some things in the plaza didn't stay up."],
            ["Board", "Reservoir level: critical."],
          ],
        },
        toasts: { "goal:turn": "The roofs have power." },
        scars: { topple: "stalls down in the plaza", overspeed: "the blades overspeed and shut" },
      },
      /* The hurricane drive, rebuilt as a rescue (same engine as the lunch storm, `pieces` + `help` goals, rank S..C).
         A wind he is partly responsible for is on the avenue, and the way home (west along it, the office lot to the
         apartment) has four things in it. Each set piece lists the abilities that help (`powers`) and the ones that
         hurt (`hurts`: points off, a shorter full-points window, the scenery gets worse), so the same key is right at
         one and wrong at the next: a Gale clears the road and tips the bus stop; Rain floods the underpass and a Sun
         break dries it. He is on foot (Take control is locked in the car); driving the car himself is not built. */
      {
        id: "commute-home",
        title: "Hurricane drive",
        tagline: "The way home is shut in four places. Wind clears, sun dries, rain floods. Pick the right weather at each.",
        /* Offer as he leaves the office / walks the lot (still "work"), and
           during the drive-home chapter if he isn't in the car. */
        chapters: ["work", "commute"],
        after: "17:45",
        before: "18:55",
        /* 17:53: still on foot in the office (elevator). 17:55+ he's in the car
           and Take control is locked — the episode is a walk/glide home. */
        clock: "17:53",
        timer: 360,
        sky: { state: "wind", intensity: 0.9 },
        twistSky: { state: "storm", intensity: 0.9 },
        zones: {
          debris: { rect: [106, 6, 128, 19], pad: 6, name: "the road by the plaza" },
          underpass: { rect: [88, 6, 106, 19], pad: 6, name: "the underpass" },
          bus: { rect: [58, 6, 74, 19], pad: 6, name: "the bus stop" },
          bridge: { rect: [8, 6, 30, 19], pad: 6, name: "the bridge" },
        },
        rank: {
          help: 100,
          late: 60,
          precision: 0,
          hurt: 40,
          time: 150,
          max: 950,
          bands: [
            { min: 90, rank: "S" },
            { min: 70, rank: "A" },
            { min: 45, rank: "B" },
            { min: 0, rank: "C" },
          ],
        },
        variety: 4,
        challenge: {
          timer: 0.75,
          extra: {
            debris: [{ id: "bea", name: "Bea", x: 116, z: 11, color: "#a65bb5", thanks: "Bea: I only stopped to look." }],
            bus: [{ id: "otto", name: "Otto", x: 66, z: 14, color: "#d9604a", thanks: "Otto: Is it going? It's going." }],
          },
        },
        pieces: [
          {
            id: "debris",
            goal: "debris",
            powers: ["gale", "gust", "tornado"],
            hurts: ["rain", "storm"],
            hurtText: { rain: "rain soaked the junk and pinned it down", storm: "the storm piled more on" },
            range: 14,
            limit: 65,
            debris: { x0: 108, x1: 128, n: 8 },
            people: [
              { id: "marlo", name: "Marlo", x: 121, z: 10, color: "#d9604a", thanks: "Marlo: A shop sign. It came down like a plate." },
              { id: "cass", name: "Cass", x: 112, z: 15.4, color: "#4a7fc0", thanks: "Cass: I was going to push it. I was not going to push it." },
            ],
          },
          {
            id: "underpass",
            goal: "underpass",
            powers: ["sunbreak"],
            hurts: ["rain", "storm"],
            hurtText: { rain: "the water came up another hand", storm: "the water came up another hand" },
            range: 11,
            limit: 65,
            prop: { kind: "water", x: 97, z: 12.6, w: 13, d: 7 },
            people: [
              { id: "tamsin", name: "Tamsin", x: 97, z: 10, color: "#a65bb5", thanks: "Tamsin: It was up to the doors. Now it's a puddle with opinions." },
              { id: "wren", name: "Wren", x: 102, z: 15.4, color: "#e0a53c", thanks: "Wren: I'd have waded. Mum says never wade." },
            ],
          },
          {
            id: "bus",
            goal: "bus",
            powers: ["bolt"],
            hurts: ["gale", "tornado"],
            hurtText: { gale: "the gale tore the shelter's roof", tornado: "the funnel rocked the bus" },
            range: 16,
            limit: 65,
            twist: true,
            prop: { kind: "bus", x: 66, z: 12.6 },
            people: [
              { id: "hale", name: "Hale", x: 63, z: 10, color: "#4f9a5b", thanks: "Hale: Battery was flat. Thirty years, that's a first." },
              { id: "odette", name: "Odette", x: 70, z: 15.4, color: "#d9a05a", thanks: "Odette: Everybody on! Everybody on, it's moving!" },
            ],
          },
          {
            id: "bridge",
            goal: "bridge",
            powers: ["fog"],
            hurts: ["gale", "tornado", "storm"],
            hurtText: { gale: "the gust tripped the wind sensor", tornado: "the funnel tripped the wind sensor", storm: "the storm tripped the wind sensor" },
            range: 14,
            limit: 65,
            prop: { kind: "gate", x: 10, z: 12.6 },
            people: [
              { id: "sorrel", name: "Sorrel", x: 24, z: 10, color: "#d9604a", thanks: "Sorrel: Over. Over and across. I'll buy you a coffee." },
              { id: "pike", name: "Pike", x: 17, z: 15.4, color: "#4a7fc0", thanks: "Pike: The barrier stood up for me. I'll say that for it." },
            ],
          },
        ],
        goals: [
          { id: "debris", kind: "help", piece: "debris", count: 2, label: "Clear the road: Gale or Gust near each (V / G)" },
          { id: "underpass", kind: "help", piece: "underpass", count: 2, after: "debris", label: "Drain the underpass: Sun break near each (X)" },
          { id: "bus", kind: "help", piece: "bus", count: 2, after: "underpass", label: "Start the stranded bus: Lightning near it (E)" },
          { id: "bridge", kind: "help", piece: "bridge", count: 2, after: "bus", label: "Hold the bridge open: Fog near each (C)" },
          { id: "home", kind: "reach", spot: "parkHome", r: 8, after: "bridge", label: "Get home" },
        ],
        lines: {
          start: "The lot. The way home is the avenue, and the avenue is shut.",
          done: "Home. The storm came with him, and most of them got through.",
          timeUp: "The light went. The storm stayed.",
          late: "{name} has waited too long.",
        },
        say: {
          start: [
            ["Board", "Wind advisory. The avenue is closed in several places. Please remain indoors."],
            ["He", "Home is west along it. Four closures."],
            ["He", "Wind first. Clear the road."],
          ],
          "piece:debris": [["He", "Gale. It'll lift it."]],
          "hurt:debris": [["Marlo", "Rain? It's heavier now. It's heavier!"]],
          "late:debris": [["Marlo", "There's a whole sign on my bonnet. Anyone?"]],
          "piece:underpass": [
            ["Tamsin", "The underpass took the car to the doors. The water won't go."],
            ["He", "Sun. Dry it, don't add to it."],
          ],
          "hurt:underpass": [["Tamsin", "It's higher! Don't rain on it, please!"]],
          "late:underpass": [["Wren", "It's at the mirrors. The mirrors."]],
          "piece:bus": [
            ["Hale", "Bus is dead in the road. Flat battery, twelve people on it. Anything with a spark?"],
            ["He", "Lightning. Close, and kind."],
          ],
          "hurt:bus": [["Odette", "The shelter's roof! Wind, no! Wind's the problem here!"]],
          "late:bus": [["Odette", "We can see the lightning, we're just not in it."]],
          "twist": [
            ["Board", "Wind advisory upgraded. Storm cell on the avenue. The bridge will close on high wind."],
            ["He", "It followed him. Or he followed it."],
          ],
          "piece:bridge": [
            ["Sorrel", "The bridge shuts when the wind sensor trips. Still air. We need still air."],
            ["He", "Fog. Heavy, quiet."],
          ],
          "hurt:bridge": [["Sorrel", "It tripped! The arm's coming down again!"]],
          "late:bridge": [["Pike", "It's coming down. The arm's coming down."]],
          "end:S": [["Board", "The avenue is open. No further closures."], ["He", "Home."]],
          "end:A": [["Board", "The avenue is open."], ["He", "Mostly dry."]],
          "end:B": [["Board", "The avenue is open. Some delays."], ["He", "Some."]],
          "end:C": [["Board", "The avenue is open. Please do not do that again."], ["He", "He heard."]],
        },
        toasts: {
          "goal:debris": "The road is clear.",
          "goal:underpass": "The underpass is draining.",
          "goal:bus": "The bus is rolling. The cell is on the avenue.",
          "goal:bridge": "The bridge is open.",
        },
      },
      /* Story arc, Part 3: the reservoir. The Storm Tank is low. Charge the mast with lightning, then bring
         enough rain over it. Strain carries in from the earlier parts (falling an hour at a time), and the
         total at the Tank decides how it ends: 6 or less it fills and holds, 7-9 it floods the avenue, 10 or more
         the sky won't stop. Offered once Part 2 has been played; always in the Episodes menu. */
      {
        id: "low-tank",
        variety: 2,
        part: 3,
        afterPart: 2,
        title: "Part 3: Low",
        tagline: "Charge the Storm Tank's mast, then bring it just enough rain.",
        chapters: ["bedtime"],
        after: "22:20",
        before: "23:30",
        clock: "22:30",
        timer: 300,
        zones: { tank: { rect: [180, 34, 200, 54], pad: 12, name: "the Storm Tank" } },
        gauge: { x: 190, z: 35.4, h: 10 },
        strain: { budget: 6, costs: { bolt: 1, rain: 1, gale: 1, sunbreak: 1, fog: 1, gust: 1, tornado: 2, storm: 2 }, stackSec: 0 },
        goals: [
          { id: "charge", kind: "ability-in", power: "bolt", zone: "tank", count: 2, label: "Charge the mast: Lightning at the Tank (E)" },
          { id: "fill", kind: "weather-time", states: ["rain"], zone: "tank", seconds: 5, after: "charge", label: "Rain on the Tank until the gauge fills (R)" },
        ],
        lines: {
          start: "The Storm Tank. The gauge needle lies at the bottom.",
          done: "The gauge is full. The Tank is quiet.",
          scarred: "The gauge is full. The sky has opinions.",
        },
        say: {
          start: [
            ["Board", "Reservoir level: critical. Please. Anyone with weather."],
            ["He", "Weather's here."],
            ["Ines", "Not all at once. Charge the mast first."],
          ],
          "goal:charge": [["He", "Down it goes."]],
          "edgy": [["Ines", "Enough now? It fills on kind weather."]],
          "kick:flood": [["Board", "Avenue: flooded. Market: closed for the night."]],
          "kick:overcast": [
            ["Board", "Weather Warning. Please stay indoors."],
            ["He", "It won't stop."],
          ],
          "end:clean": [["Board", "Reservoir level: full."], ["He", "Quiet."]],
          "end:scarred": [["Board", "Reservoir level: full. And the sky is not done."]],
        },
        toasts: { "goal:charge": "The mast is charged.", "goal:fill": "The Tank is full." },
        scars: { flood: "the avenue flooded, the market closed for the night", overcast: "the sky stays on and the Board warns the city" },
      },
      /* The finale. The city gathers on the plaza and he plays the sky: a choreographed light show of cues, each an
         ability to call on its beat (`js/episodes.js` show logic, the stage in `js/finale.js`). A call inside `good`
         seconds of its cue's `at` (seconds from the start) is a hit, inside `perfect` a perfect one; a wrong ability
         or a call with no cue near it is off the beat. Score: Timing (perfect 1, good 0.6), Chain (best run of hits),
         Clean calls (off-beat calls cost), Variety (distinct abilities hit, of 5). Afterwards the closing card ties the
         day's stories together from the arc the three parts left (`cityFared`). */
      {
        id: "night",
        variety: 5,
        title: "Light show",
        tagline: "The city is on the plaza. Play the sky on the beat: lightning, rain, fog, wind, sun.",
        chapters: ["computer", "bedtime"],
        clock: "22:05",
        timer: 150,
        zones: { plaza: { rect: [106, 16.8, 130, 36], pad: 6, name: "the plaza" } },
        finale: {
          center: [118, 26],
          spectators: 30,
          gatherSec: 6,
          lead: 8,
          perfect: 0.45,
          good: 1.1,
          beatNeeded: 8,
          rowNames: { people: "Timing", time: "Chain", damage: "Clean calls", variety: "Variety" },
          acts: [
            { at: 7, name: "Pulses" },
            { at: 17, name: "Neon rain" },
            { at: 25, name: "Beams in the fog" },
            { at: 33, name: "Wind" },
            { at: 41, name: "Gold" },
            { at: 49, name: "Grand finish" },
          ],
          cues: [
            { at: 8, power: "bolt" },
            { at: 10.5, power: "bolt" },
            { at: 13, power: "bolt" },
            { at: 18, power: "rain" },
            { at: 21.5, power: "bolt" },
            { at: 26, power: "fog" },
            { at: 29.5, power: "bolt" },
            { at: 34, power: "gale" },
            { at: 37.5, power: "bolt" },
            { at: 42, power: "sunbreak" },
            { at: 45.5, power: "bolt" },
            { at: 50, power: "rain" },
            { at: 54.5, power: "fog" },
            { at: 59, power: "gale" },
            { at: 61, power: "bolt" },
            { at: 63, power: "bolt" },
            { at: 66, power: "sunbreak" },
            { at: 69, power: "bolt" },
          ],
          lines: {
            gather: "They are coming in off the avenue. Faces up.",
            act: { Pulses: "Three pulses. Slow.", "Neon rain": "Rain, so the street can take the colours.", "Beams in the fog": "Fog. The beams need something to hold on to.", Wind: "Wind, and the streamers.", Gold: "A little sun, for the middle.", "Grand finish": "Everything now. Everything he has." },
            perfect: "On the beat",
            good: "Close",
            miss: "Missed",
            off: "Off the beat",
            done: "Curtain call. The sky takes a bow.",
          },
          closing: {
            kicker: "Closing night",
            title: "The district, tonight",
            button: "Walk the city",
            intro: {
              A: "The city stands on the plaza and looks up. Fair Weather: the park is green, the turbines turn, the Tank is full.",
              B: "The city stands on the plaza and looks up. Heavy Weather: it all came back, with scars, and they are here anyway.",
              C: "The city stands on the plaza and looks up. Overcast: the sky would not stop, so he gave it something to do.",
              none: "The city stands on the plaza and looks up. He did not do all three. He did this one.",
            },
            neighbors: [
              ["Birdie", "She brought the straw hat and the front-row seat. The tomatoes are fine."],
              ["Dex", "Parcel box off for once. He counted the bursts, and lost count."],
              ["Ines", "The telescope pointed the wrong way, at him. Then at the aurora, which she hadn't charted."],
            ],
            last: {
              S: ["He", "A whole day of weather, and this was the part he wanted to keep."],
              A: ["He", "Mostly on time. The sky forgives."],
              B: ["He", "Some on the beat. Some of it was just weather."],
              C: ["He", "They stayed anyway. He'll take it."],
            },
            tally: "The show",
          },
        },
        say: {
          start: [
            ["Board", "Plaza assembly. The city has gathered. Please stay behind the cones."],
            ["He", "They came to look up. Fair enough."],
            ["Ines", "Whatever you do, do it on time. The sky keeps a beat."],
          ],
          gather: [["Birdie", "Front row! My tomatoes get the front row."]],
          "act:Neon rain": [["Dex", "Mind the puddles. They are about to be very pink."]],
          "act:Grand finish": [["He", "All of it."]],
          "end:S": [["Ines", "Every cue. I'll put it in the charts."], ["He", "Thank you, everyone."]],
          "end:A": [["Birdie", "Again! Again!"]],
          "end:B": [["Dex", "Some of that was perfect. Some of that was weather."]],
          "end:C": [["Board", "The show has ended. Please go home. Thank you."]],
        },
        goals: [
          { id: "beat", kind: "show-hits", count: 8, label: "Hit eight cues on the beat" },
          { id: "variety", kind: "show-variety", count: 5, label: "Use all five effects: Lightning, Rain, Fog, Wind, Sun" },
          { id: "show", kind: "show-end", label: "Play the whole show" },
        ],
        lines: {
          start: "Night. The plaza is filling. The skyline wants a show.",
          done: "Curtain call. The sky takes a bow.",
          timeUp: "The lights come up. The plaza is still clapping.",
        },
        toasts: { "goal:beat": "The crowd is with him.", "goal:variety": "Every kind of weather, in one night." },
      },
    ],
  },

  /* ------------------------------------------------------------------------
     CHAPTERS — the coloured sections of the day bar
     ------------------------------------------------------------------------ */
  chapters: {
    wake: { label: "Wake", color: "#c4554a" },
    ready: { label: "Ready", color: "#d4a574" },
    commute: { label: "Drive", color: "#4d6d8a" },
    work: { label: "Work", color: "#3d6b58" },
    lunch: { label: "Lunch", color: "#c4a15a" },
    home: { label: "Home", color: "#a8876a" },
    tv: { label: "TV", color: "#6a5a8a" },
    dinner: { label: "Dinner", color: "#a86848" },
    computer: { label: "Computer", color: "#3d6a8a" },
    bedtime: { label: "Bed", color: "#5a4f7a" },
    sleep: { label: "Sleep", color: "#243044" },
  },

  /* ------------------------------------------------------------------------
     BODY — stats from 0 to 1, and how fast they drift per hour
     ------------------------------------------------------------------------ */
  body: {
    start: { energy: 0.72, hunger: 0.45, thirst: 0.5, bladder: 0.62, stress: 0.18, boredom: 0.1 },
    show: ["energy", "hunger", "thirst", "bladder", "stress", "boredom"],
    drift: {
      sleep: { energy: +0.11, hunger: +0.02, thirst: +0.025, bladder: +0.05, stress: -0.04, boredom: -0.05 },
      rest: { energy: +0.01, hunger: +0.04, thirst: +0.05, bladder: +0.08, stress: -0.08, boredom: +0.04 },
      sit: { energy: -0.04, hunger: +0.05, thirst: +0.07, bladder: +0.09, stress: 0, boredom: +0.08 },
      work: { energy: -0.07, hunger: +0.06, thirst: +0.08, bladder: +0.1, stress: +0.03, boredom: +0.1 },
      stand: { energy: -0.05, hunger: +0.06, thirst: +0.08, bladder: +0.1, stress: 0, boredom: +0.02 },
      walk: { energy: -0.08, hunger: +0.08, thirst: +0.1, bladder: +0.1, stress: -0.06, boredom: -0.3 },
      drive: { energy: -0.05, hunger: +0.05, thirst: +0.06, bladder: +0.08, stress: +0.02, boredom: +0.05 },
    },
  },

  /* ------------------------------------------------------------------------
     THINGS — the state of the world. Steps change these with `set`.
     Things stay the way they were left (an empty glass stays empty).
     `show: true` puts it in the Things panel on screen.
     ------------------------------------------------------------------------ */
  things: {
    alarm: { label: "Alarm", value: "off", show: true },
    phone: { label: "Phone", value: "nightstand", show: true },
    outfit: { label: "Wearing", value: "sleep", show: true },
    carrying: { label: "Carrying", value: "nothing", show: true },
    frontDoor: { label: "Front door", value: "locked", show: true },
    car: { label: "Car", value: "locked", show: true },
    mug: { label: "Mug", value: "shelf", show: true },
    deskGlass: { label: "Glass at work", value: "empty", show: true },
    fridge: { label: "Fridge", value: "closed", show: true },
    stove: { label: "Stove", value: "off", show: true },
    tv: { label: "Living room TV", value: "off", show: true },
    bedTv: { label: "Bedroom TV", value: "off", show: true },
    workScreen: { label: "Work screen", value: "off", show: true },
    pc: { label: "Home computer", value: "off", show: true },
    bedroomLamp: { label: "Bedroom lamp", value: "off", show: true },
    bathroomLight: { label: "Bathroom light", value: "off", show: true },
    livingLight: { label: "Living room light", value: "off", show: true },
    kitchenLight: { label: "Kitchen light", value: "off", show: true },
    shower: { label: "Shower", value: "off" },
    microwave: { label: "Microwave", value: "off" },
    headphones: { label: "Headphones", value: "off" },
    headlights: { label: "Headlights", value: "off" },
    engine: { label: "Engine", value: "off" },
    signal: { label: "Traffic light", value: "green" },
    blanket: { label: "Blanket", value: "up" },
    sleepPose: { label: "Sleeping on", value: "side" },
    meeting: { label: "Meeting", value: "off" },
    officeLights: { label: "Office lights", value: "on" },
  },

  /* ------------------------------------------------------------------------
     PLACES
     Buildings have an origin; their rooms use coordinates relative to it.
     Every spot is [x, z, faceDegrees]. Doors are route points, listed from
     inside the room out to the hub (the room with no doors).
     Furniture in the 3D scene is placed from these spots, so moving the
     "bed" spot moves the bed.
     ------------------------------------------------------------------------ */
  buildings: {
    home: {
      origin: [0, 0],
      bounds: [-7, -3.6, 11, 4.6],
      wall: "#e6dfd2",
      floor: "#c6aa7c",
      walls: [
        [-1, -3.6, -1, 0.9],
        [6, -3.6, 6, 0.9],
        [-7, 1.3, -3.4, 1.3],
        [-3.4, 1.3, -3.4, 2.3],
        [-3.4, 3.3, -3.4, 4.6],
      ],
    },
    office: {
      origin: [128, 0],
      bounds: [0, -3.6, 18, 4.6],
      wall: "#d5dbe3",
      floor: "#b9b4aa",
      walls: [
        [3, -3.6, 3, 1.2],
        [9, -3.6, 9, 1.2],
        [12, -3.6, 12, 1.2],
        [15, -3.6, 15, 1.2],
        [3, 1.2, 5.5, 1.2, "glass"],
        [6.5, 1.2, 9, 1.2, "glass"],
        [9, 1.2, 10, 1.2, "glass"],
        [11, 1.2, 12, 1.2, "glass"],
        [15, 1.2, 16, 1.2],
        [17, 1.2, 18, 1.2],
      ],
    },
    street: { origin: [0, 0] },
  },

  rooms: {
    /* ---------------- home ---------------- */
    bedroom: {
      label: "Bedroom",
      building: "home",
      area: [-7, -3.6, -1, 1.3],
      light: "bedroomLamp",
      doors: [[-3.2, -0.8], [-2.2, 1.8]],
      camera: { alpha: 1.3, beta: 0.88, radius: 10.5 },
      spots: {
        bed: [-4.6, -2.15, 0],
        bedEdge: [-3.72, -2.0, 90],
        bedroomWindow: [-2.4, -3.0, 180],
      },
    },
    bathroom: {
      label: "Bathroom",
      building: "home",
      area: [-7, 1.3, -3.4, 4.6],
      light: "bathroomLight",
      floor: "#d6dde0",
      doors: [[-4.0, 2.8], [-2.9, 2.8]],
      camera: { alpha: 1.75, beta: 0.9, radius: 7.5 },
      spots: {
        toilet: [-6.55, 2.1, 90],
        sinkHome: [-5.0, 1.8, 180],
        shower: [-6.2, 3.85, 0],
        bathCenter: [-4.6, 3.3, 0],
      },
    },
    living: {
      label: "Living room",
      building: "home",
      area: [-1, -3.6, 6, 4.6],
      light: "livingLight",
      doors: [], // the hub of the house
      camera: { alpha: 1.5, beta: 0.98, radius: 9 },
      spots: {
        couch: [2.2, 1.0, 180],
        pcChair: [4.55, -1.7, 180],
        frontDoorIn: [1.0, 4.0, 0],
        entryTable: [-0.4, 4.0, 0],
        livingWindow: [0.4, -2.9, 180],
        thermostat: [-0.75, 2.6, 270],
        hallway: [1.5, 2.4, 0],
      },
    },
    kitchen: {
      label: "Kitchen",
      building: "home",
      area: [6, -3.6, 11, 4.6],
      light: "kitchenLight",
      floor: "#d9ccb4",
      doors: [[6.6, 2.0]],
      camera: { alpha: 1.62, beta: 0.95, radius: 8 },
      spots: {
        fridge: [6.75, -2.35, 180],
        stove: [8.2, -2.35, 180],
        kitchenSink: [9.3, -2.35, 180],
        counter: [10.3, -2.35, 180],
        trash: [10.5, -0.6, 90],
        dinnerSeat: [8.6, 1.25, 180],
      },
    },
    yard: {
      label: "Outside the house",
      building: "home",
      area: [-7, 4.6, 11, 10.4],
      doors: [[1.0, 5.3], [1.0, 4.0]],
      camera: { alpha: 1.35, beta: 1.0, radius: 11 },
      spots: {
        frontDoorOut: [1.0, 5.3, 180],
        carSideHome: [0.4, 7.3, 270],
        mailbox: [3.6, 10.2, 0],
      },
    },

    /* ---------------- the street (car only) ---------------- */
    road: {
      label: "On the road",
      building: "street",
      camera: { alpha: 1.15, beta: 0.8, radius: 11 },
      spots: {
        parkHome: [-1.5, 7.6, 180],
        drivewayEnd: [-1.5, 10.6, 180],
        roadHomeE: [2.5, 11.9, 90],
        signalE: [70, 11.9, 90],
        roadWorkE: [130, 11.9, 90],
        lotEntry: [131.5, 10.8, 180],
        lotLane: [133.5, 9.6, 180],
        parkWork: [133.5, 7.8, 180],
        parkWorkFix: [133.5, 7.45, 180],
        backOutWork: [133.5, 9.8, 180],
        lotExit: [131.5, 11.4, 270],
        roadWorkW: [127, 13.3, 270],
        signalW: [74, 13.3, 270],
        roadHomeW: [2.5, 13.3, 270],
      },
    },

    /* ---------------- office ---------------- */
    lot: {
      label: "Work parking lot",
      building: "office",
      area: [0, 4.6, 18, 10.4],
      doors: [[8, 5.4], [8, 3.8]],
      camera: { alpha: 1.3, beta: 1.05, radius: 10 },
      spots: {
        entranceOut: [8, 5.4, 180],
        carSideWork: [7.4, 7.6, 270],
      },
    },
    corridor: {
      label: "Office hall",
      building: "office",
      area: [0, 1.2, 18, 4.6],
      doors: [], // the hub of the office
      camera: { alpha: 1.5, beta: 1.05, radius: 9 },
      spots: {
        lobby: [8, 3.7, 180],
        elevatorCall: [1.3, 2.9, 180],
        officeDoorOut: [6, 2.2, 180],
        hallMid: [9, 2.7, 90],
        hallEnd: [17.2, 3.0, 90],
      },
    },
    elevator: {
      label: "Elevator",
      building: "office",
      area: [0, -0.6, 2.6, 2.2],
      doors: [[1.3, 2.4]],
      camera: { alpha: 1.5, beta: 1.0, radius: 8 },
      spots: { elevatorIn: [1.3, 1.1, 0] },
    },
    workOffice: {
      label: "Office",
      building: "office",
      area: [3, -3.6, 9, 1.2],
      doors: [[6, 0.6], [6, 1.9]],
      camera: { alpha: 1.4, beta: 0.98, radius: 7.5 },
      spots: {
        desk: [6, -1.75, 180],
        deskStand: [6.7, -1.25, 180],
        officeWindow: [7.9, -3.0, 180],
        coworkerDesk: [4.2, -1.75, 180],
      },
    },
    meeting: {
      label: "Meeting room",
      building: "office",
      area: [9, -3.6, 12, 1.2],
      doors: [[10.5, 0.6], [10.5, 1.9]],
      camera: { alpha: 1.5, beta: 0.95, radius: 7.5 },
      spots: {
        meetSeat: [10.5, -1.45, 180],
        meetOther: [10.5, -2.95, 0],
      },
    },
    breakroom: {
      label: "Break room",
      building: "office",
      floor: "#cfc3ac",
      area: [12, -3.6, 15, 1.2],
      doors: [[13.5, 0.6], [13.5, 1.9]],
      camera: { alpha: 1.55, beta: 0.95, radius: 7.5 },
      spots: {
        microwave: [12.8, -2.5, 180],
        breakWater: [14.2, -2.5, 180],
        lunchSeat: [13.5, 0.05, 180],
      },
    },
    officeBath: {
      label: "Office bathroom",
      building: "office",
      floor: "#d6dde0",
      area: [15, -3.6, 18, 1.2],
      doors: [[16.5, 0.4], [16.5, 1.9]],
      camera: { alpha: 1.75, beta: 0.92, radius: 7.5 },
      spots: {
        toiletW: [17.4, -2.6, 270],
        sinkW: [15.9, -2.9, 180],
      },
    },
  },

  /* Other people in the scene. `when` shows them only while things match. */
  people: [
    { at: "coworkerDesk", pose: "sitChair", hand: "type", top: "#5f7d99" },
    { at: "meetOther", pose: "sitChair", hand: "none", top: "#a67b5b", when: { meeting: "on" } },
  ],

  /* The main avenue (his drive) and the blocks around it. Home stays at the
     origin; the office is a few blocks east on the same avenue. `street` is
     that avenue: the checks raycast it. `city` is the rest of the district. */
  street: {
    z: 12.6,
    from: -48,
    to: 210,
    signals: [{ x: 72, thing: "signal" }],
  },

  /* A few blocks, built by hand (J, q_843c2557747c: a made-up city, not a map).
     Avenues run east-west, crosses north-south. Blocks are solid buildings;
     ones with `stair` have a walkable roof (a ramp along +x on the north
     face, from x0 at the ground to x1 at the roof).
     The district is dark and cinematic, navy and black with electric blue at
     night (js/look.js). These colours are the flat fallback under that. */
  city: {
    park: { x0: -34, z0: 20, x1: 30, z1: 68 },
    avenues: [
      { z: 12.6, from: -48, to: 210 },
      { z: -34, from: -48, to: 210 },
      { z: 76, from: -48, to: 210 },
    ],
    crosses: [
      { x: -42, from: -48, to: 90 },
      { x: 36, from: -48, to: 90 },
      { x: 100, from: -48, to: 90 },
      { x: 168, from: -48, to: 90 },
    ],
    blocks: [
      { id: "apt", x: -24, z: 0.5, w: 16, d: 12, h: 6.16, color: "#46525f", stair: { x0: -28.5, x1: -17, z: 7.2, w: 1.45 } },
      { id: "shop", x: 50, z: 0.5, w: 16, d: 12, h: 3.3, color: "#5a4550", stair: { x0: 43, x1: 50.5, z: 7.2, w: 1.45 } },
      { id: "annex", x: 157, z: 0.5, w: 16, d: 12, h: 5.72, color: "#3c4a58", stair: { x0: 150, x1: 163, z: 7.2, w: 1.45 } },
      { id: "row-west", x: -24, z: -20, w: 18, d: 10, h: 5, color: "#4c433e" },
      { id: "row-south", x: 52, z: -20, w: 22, d: 10, h: 8, color: "#554940" },
      { id: "mid", x: 86, z: 0.5, w: 12, d: 12, h: 11, color: "#3a4654" },
      { id: "corner", x: 112, z: 0.5, w: 10, d: 12, h: 9, color: "#343e4c" },
      { id: "north-mid", x: 68, z: 46, w: 36, d: 22, h: 15, color: "#2f3a48" },
      { id: "north-east", x: 140, z: 48, w: 32, d: 20, h: 20, color: "#2a3340" },
      { id: "south-office", x: 146, z: -20, w: 24, d: 10, h: 8, color: "#4a4540" },
    ],
  },

  /* ------------------------------------------------------------------------
     THE CROWD (js/crowd.js) — the district's people and cars, on the day's clock.
     `curve` is [hour, people, cars], each 0..1 of the budget: commuters in the morning, a lunch crowd,
     the evening commute and dinner, then a quiet night. Counts are the most that are ever out
     (thin instances, so the cost barely moves); the quality scale (`lowScale`) and a frame-time guard
     thin them on slow devices. Rain, storm and snow thin them too.
     ------------------------------------------------------------------------ */
  crowd: {
    budget: { people: 260, cars: 64 },
    lowScale: 0.4,
    curve: [
      [0, 0.03, 0.06], [4, 0.025, 0.06], [5.5, 0.06, 0.14], [6.5, 0.25, 0.4], [7.5, 0.7, 0.85], [8.5, 0.85, 1], [9.5, 0.5, 0.6],
      [11, 0.45, 0.45], [12, 0.92, 0.6], [13.25, 0.95, 0.65], [14.5, 0.5, 0.45], [16, 0.55, 0.6], [17, 0.8, 0.95], [18, 0.85, 1],
      [19.5, 0.9, 0.6], [21, 0.55, 0.35], [22.5, 0.2, 0.18], [24, 0.03, 0.06],
    ],
    phases: [
      [0, "night"], [5.5, "early morning"], [6.5, "morning commute"], [9.5, "mid-morning"], [11.5, "lunch"], [14.5, "afternoon"],
      [16.5, "evening commute"], [18.5, "dinner"], [21, "evening"], [22.5, "night"],
    ],
  },

  /* ------------------------------------------------------------------------
     NEIGHBORS (js/neighbors.js) — three people who live on his avenue, each with their own
     look, home and day. Their stops are [hour, x, z] (arrive at that hour, stay till they
     leave for the next); `inside` hides them behind their door. Beats go in order: an
     `ask` (open while the window lasts; done when he calls its ability within `range` m of
     them), a `thanks` (right after the ask), and a `surprise` (its own window). Each beat
     triggers by the clock (`from`/`to` hours, wrapping past midnight) and by proximity
     (`near` m). A finished beat pays its `reward`: score, and Pressure back in the meter.
     The people are plain figures (boxes: `parts` are shape, size, position, colour); the art pass is later.
     ------------------------------------------------------------------------ */
  neighbors: {
    storageKey: "icanbe.neighbors",
    near: 9, // m: how close for a beat to start
    range: 16, // m: how close he must be when he answers an ask
    tagRange: 90, // m: name tags show this far
    lines: {
      open: "Neighbors",
      title: "Your neighbors",
      score: "Good neighbor",
      reward: "{name}: +{score} {label}",
      here: "here",
      inside: "at home",
    },
    list: [
      {
        id: "birdie", name: "Birdie Alvarez", role: "Gardener, apt block", home: "the apt block, west end", scale: 0.88, color: "#f2c230",
        look: { skin: "#e0b794", top: "#f2c230", pants: "#4a5a3a", shoes: "#5a3a22", hair: "#7a5a3a", bun: true, coat: 0.5, hat: { type: "straw", brim: 0.62, color: "#c9a85a", band: "#4f9a5b" }, carry: "basket" },
        stops: [[0, -26.5, 9.2, "inside"], [7, -21, 9.5], [11.8, -6, 22.5], [16.6, -21, 9.5], [20, -26.5, 9.2, "inside"]],
        beats: [
          { id: "birdie-ask", kind: "ask", from: 7, to: 11.5, ability: "rain", text: "There you are. My tomatoes are sulking. A little rain, if you've got any?", reward: null },
          { id: "birdie-thanks", kind: "thanks", text: "Look at them drink. Bless you.", reward: { score: 50, pressure: 25, label: "for the tomatoes" } },
          { id: "birdie-surprise", kind: "surprise", from: 17, to: 19.5, text: "Picked these for you. Don't tell the pigeons.", reward: { score: 100, pressure: 60, label: "and a bag of tomatoes" } },
        ],
      },
      {
        id: "dex", name: "Dex Moreno", role: "Courier, the shop", home: "the shop, mid avenue", scale: 1, color: "#ff7a1a",
        look: { skin: "#8a5a3c", top: "#ff7a1a", pants: "#24262c", shoes: "#e8e8e8", build: 1.1, hat: { type: "helmet", color: "#e8e8e8" }, carry: "parcel" },
        stops: [[0, 47, 9.8, "inside"], [7, 46, 9.8], [11.4, 110, 17.5], [15.4, 46, 9.8], [20, 47, 9.8, "inside"]],
        beats: [
          { id: "dex-ask", kind: "ask", from: 7, to: 15, ability: "sunbreak", text: "Parcels sat out in the damp all night. Any chance of a sun break? Two minutes.", reward: null },
          { id: "dex-thanks", kind: "thanks", text: "Dry as a bone. I owe you a delivery.", reward: { score: 50, pressure: 25, label: "for the dry parcels" } },
          { id: "dex-surprise", kind: "surprise", from: 16, to: 19.5, text: "Parcel for you. No return address. It hums a bit.", reward: { score: 100, pressure: 60, label: "and a humming parcel" } },
        ],
      },
      {
        id: "quill", name: "Ines Quill", role: "Stargazer, the annex", home: "the annex, east end", scale: 1.1, color: "#7a5cd6",
        look: { skin: "#e3c4a8", top: "#7a5cd6", pants: "#1c1c2a", shoes: "#1c1c2a", hair: "#2a2038", glasses: "#9fd4ff", coat: 0.55, carry: "telescope" },
        stops: [[0, 154, 9.8], [6.5, 154, 9.8, "inside"], [16.5, 154, 9.8]],
        beats: [
          { id: "quill-ask", kind: "ask", from: 17, to: 5, ability: "bolt", text: "Thirty nights and no lightning in my lens. One bolt, if you would. Not at me.", reward: null },
          { id: "quill-thanks", kind: "thanks", text: "Got it. Look at that blue.", reward: { score: 50, pressure: 25, label: "for the photograph" } },
          { id: "quill-surprise", kind: "surprise", from: 20.5, to: 5, text: "Look up. My charts and your weather agree: tonight you're the brightest thing out.", reward: { score: 100, pressure: 60, label: "and a star named for him" } },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------------
     IDLE — when a block's steps finish early and there is no `fill` step,
     the spare time becomes idle time (never stretched actions). These are
     the words for it, by pose, plus the pool of small things done meanwhile.
     ------------------------------------------------------------------------ */
  idle: {
    every: "15-45s",
    pools: ["idle"],
    text: {
      stand: ["He stands there a moment.", "A pause.", "He looks around."],
      sitChair: ["He sits back for a moment.", "A pause."],
      sitCouch: ["He sits there.", "A pause."],
      sitBed: ["He sits on the bed a moment."],
      sitCar: ["He sits in the car a moment."],
      lie: ["He lies there."],
      side: ["He lies there."],
      recline: ["He lies back."],
      default: ["A pause."],
    },
  },

  /* ------------------------------------------------------------------------
     THE SPINE — where they have to be, and when.
     Each block runs until the next one starts. Each step takes about as long
     as it really takes (sampled from its range). Time left over goes to the
     block's `fill` step, the thing a real person would spend spare time on.
     A `go` step lasts exactly as long as the walk.
     ------------------------------------------------------------------------ */
  spine: [
    /* ======================= MORNING ======================= */
    {
      time: "7:30",
      title: "Alarm",
      chapter: "wake",
      steps: [
        { at: "bed", pose: "lie", for: "3.5-4.5m", activity: "rest", set: { alarm: "ringing" },
          do: ["The alarm goes off. Small Weather stays on his back.", "The alarm. Small Weather doesn't move.", "Still the alarm. Small Weather, still on his back."] },
        { pose: "lie", hand: "reach", for: "3-6s", set: { alarm: "snoozed" }, do: "He reaches to the nightstand and hits snooze." },
        { pose: "side", for: "4.5-5.5m", activity: "sleep", set: { sleepPose: "side" }, do: ["Eyes closed again.", "Five more minutes.", "Half asleep."] },
        { pose: "lie", for: "2.5-3.5m", activity: "rest", set: { alarm: "ringing" }, do: ["The alarm goes off again. He lies there.", "Again. He stares at the ceiling."] },
        { pose: "lie", hand: "reach", for: "3-5s", set: { alarm: "off" }, do: "He reaches over and turns it off." },
        { pose: "recline", hand: "phone", for: "1.2-2.2m", set: { phone: "in hand" }, micro: { pools: ["phone"], every: "20-40s" }, do: ["Phone in bed. The time.", "One notification."] },
        { pose: "recline", hand: "reach", for: "3-5s", set: { phone: "nightstand" }, do: "The phone goes back on the nightstand." },
        { at: "bedEdge", pose: "sitBed", fill: true, set: { blanket: "down" }, micro: { pools: ["groggy"], every: "20-40s" },
          do: ["He sits on the edge of the bed.", "Feet on the floor.", "He sits there, not quite awake."] },
      ],
    },
    {
      time: "7:46",
      title: "Bathroom, shower, dressed",
      chapter: "ready",
      steps: [
        { pose: "stand", for: "2-4s", do: "He stands." },
        { go: "bathCenter", set: { bathroomLight: "on" }, do: "He walks to the bathroom." },
        { at: "bathCenter", hand: "reach", for: "1-2s", do: "Light on." },
        { at: "toilet", pose: "toilet", for: "2-3.5m", body: { bladder: -1 }, do: "He uses the toilet." },
        { at: "toilet", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { chance: 0.15, at: "toilet", pose: "stand", hand: "reach", for: "4-8s", do: "He flushes again." },
        { chance: 0.25, at: "toilet", pose: "stand", for: "3-5s", do: "The toilet paper is getting low. He makes a mental note." },
        { at: "sinkHome", hand: "wash", for: "15-35s", do: ["He washes his hands.", "He washes his hands, longer than he meant to."] },
        { at: "shower", hand: "reach", for: "15-25s", set: { shower: "on" }, do: "Shower on. He waits for the water to warm up." },
        { at: "shower", hand: "dress", for: "20-35s", set: { outfit: "towel" }, do: "Clothes off." },
        { at: "shower", hand: "wash", fill: true, activity: "stand", body: { stress: -0.1, energy: +0.05 },
          micro: { pools: ["shower", "mind"], every: "40s-1.5m" }, do: ["He showers.", "Hot water. He stands under it.", "He washes his hair.", "Soap."] },
        { at: "shower", hand: "reach", for: "3-5s", set: { shower: "off" }, do: "Shower off." },
        { at: "bathCenter", hand: "towel", for: "1-1.6m", do: "Towel." },
        { at: "sinkHome", hand: "face", for: "8-15s", do: "Deodorant." },
        { at: "sinkHome", hand: "brush", for: "1.6-2.3m", do: "He brushes his teeth." },
        { at: "sinkHome", hand: "wash", for: "5-10s", do: "Rinse. Spit." },
        { chance: 0.35, at: "sinkHome", hand: "face", for: "10-25s", do: ["He notices something in the mirror and leans in.", "He fixes his hair in the mirror."] },
        { at: "bathCenter", hand: "dress", for: "2-3m", set: { outfit: "work" }, do: ["He gets dressed.", "Socks."] },
        { at: "bathCenter", hand: "reach", for: "1-2s", set: { bathroomLight: "off" }, do: "Bathroom light off." },
      ],
    },
    {
      time: "8:05",
      title: "Coffee, then out the door",
      chapter: "ready",
      steps: [
        { go: "counter", set: { kitchenLight: "on" }, do: "He walks to the kitchen." },
        { at: "counter", hand: "reach", for: "1-2s", do: "Light on." },
        { at: "counter", hand: "cook", for: "20-35s", set: { mug: "in hand" }, do: "Coffee on. Bread in the toaster." },
        { at: "counter", hand: "phone", fill: true, micro: { pools: ["phone"], every: "20-40s" }, do: ["He waits for the coffee, looking at the phone.", "The toaster ticks."] },
        { at: "counter", hand: "cook", for: "15-30s", do: "Toast up. A little butter." },
        { at: "counter", hand: "drink", for: "2-3m", body: { hunger: -0.35, thirst: -0.25, energy: +0.2 }, do: ["Coffee and toast, eaten standing.", "A bite of toast. A sip of coffee."] },
        { at: "kitchenSink", hand: "wash", for: "15-30s", set: { mug: "sink" }, do: "He rinses the mug. It stays in the sink." },
        { at: "kitchenSink", hand: "reach", for: "1-2s", set: { kitchenLight: "off" }, do: "Kitchen light off." },
        { go: "entryTable", do: "To the front door." },
        { at: "entryTable", hand: "reach", for: "30-50s", set: { carrying: "bag, keys, lunch", phone: "pocket" }, do: "Bag, keys, wallet, phone, lunch container." },
        { chance: 0.3, at: "entryTable", hand: "face", for: "3-6s", do: "He pats his pocket. Phone? Yes." },
        { at: "frontDoorIn", hand: "reach", for: "25-45s", do: "Shoes on." },
        { at: "frontDoorOut", hand: "reach", for: "3-5s", set: { frontDoor: "open" }, do: "Small Weather opens the front door and steps out." },
        { at: "frontDoorOut", hand: "reach", for: "3-6s", set: { frontDoor: "locked" }, do: "He locks it from outside." },
        { chance: 0.45, at: "frontDoorOut", hand: "reach", for: "2-3s", do: "He tugs the handle. Locked. He knew that." },
        { go: "carSideHome", hand: "hold", do: "He walks to the car." },
        { at: "carSideHome", hand: "reach", for: "2-4s", set: { car: "unlocked" }, do: "Unlock." },
        { at: "carSideHome", pose: "sitCar", hand: "hold", for: "8-15s", set: { carrying: "bag on the seat" }, do: "He gets in. Bag on the passenger seat." },
        { pose: "sitCar", hand: "reach", for: "4-8s", do: "Seatbelt." },
        { pose: "sitCar", hand: "reach", for: "3-5s", set: { engine: "on" }, do: "He starts the engine." },
      ],
    },

    /* ======================= DRIVE TO WORK ======================= */
    {
      time: "8:13",
      title: "Driveway and the neighborhood",
      chapter: "commute",
      steps: [
        { chance: 0.4, pose: "sitCar", hand: "reach", for: "8-15s", do: "The mirror needs a nudge." },
        { pose: "sitCar", hand: "reach", for: "10-20s", do: ["He puts music on.", "He connects the phone. A podcast."] },
        { drive: "drivewayEnd", reverse: true, for: "25-40s", do: "He backs out of the driveway." },
        { drive: "roadHomeE", for: "15-25s", do: "Onto the street." },
        { drive: "signalE", for: "10-14s", micro: DRIVE_MICRO, do: ["Through the neighborhood.", "Onto the avenue.", "Past the buildings."] },
        { pose: "sitCar", hand: "wheel", fill: true, micro: DRIVE_MICRO, do: ["The light at the corner. The line stops.", "He waits in the line."] },
      ],
    },
    {
      time: "8:28",
      title: "Red light",
      chapter: "commute",
      steps: [
        { pose: "sitCar", hand: "wheel", fill: true, set: { signal: "red" }, micro: { pools: ["driving", "mind"], every: "30s-1m" }, do: ["A red light. Traffic is backed up.", "Still red.", "The line inches forward."] },
        { pose: "sitCar", hand: "wheel", for: "3-5s", set: { signal: "green" }, do: "Green. Go." },
      ],
    },
    {
      time: "8:32",
      title: "The rest of the drive",
      chapter: "commute",
      steps: [
        { drive: "roadWorkE", for: "10-14s", micro: DRIVE_MICRO, do: ["The rest of the drive.", "Along the avenue.", "Traffic moves."] },
        { pose: "sitCar", hand: "wheel", fill: true, micro: DRIVE_MICRO, do: ["The lot is just ahead. He waits to turn."] },
      ],
    },
    {
      time: "8:46",
      title: "Park, then up to the desk",
      chapter: "commute",
      steps: [
        { drive: "lotEntry", for: "30-45s", do: "Small Weather turns into the work lot." },
        { drive: "lotLane", for: "25-40s", do: "He looks for a spot. One is too tight." },
        { drive: "parkWork", for: "20-35s", do: "He pulls into a spot." },
        { chance: 0.45, drive: "parkWorkFix", for: "8-15s", do: "He pulls forward to sit inside the lines." },
        { pose: "sitCar", hand: "reach", for: "2-4s", set: { engine: "off" }, do: "Engine off." },
        { pose: "sitCar", hand: "phone", fill: true, micro: { pools: ["phone", "mind"], every: "30s-1m" },
          do: ["Early. He sits in the parked car with the phone.", "He lets the song finish.", "A few more minutes in the car."] },
        { pose: "sitCar", hand: "hold", for: "10-20s", set: { carrying: "bag, phone, lunch" }, do: "Phone, bag, and lunch in hand." },
        { chance: 0.3, pose: "sitCar", hand: "reach", for: "6-12s", do: "The lunch was in the back seat. He reaches back for it." },
        { at: "carSideWork", hand: "hold", for: "4-8s", do: "He gets out." },
        { at: "carSideWork", hand: "reach", for: "2-4s", set: { car: "locked" }, do: "He locks the car." },
        { chance: 0.4, at: "carSideWork", hand: "reach", for: "2-3s", do: "He tugs the handle to check." },
        { go: "entranceOut", hand: "hold", do: "He walks to the entrance." },
        { at: "entranceOut", hand: "reach", for: "3-5s", do: "He opens the building door." },
        { go: "elevatorCall", hand: "hold", do: "Across the lobby to the elevator." },
        { at: "elevatorCall", hand: "reach", for: "2-3s", do: "He presses the button." },
        { at: "elevatorCall", hand: "hold", for: "30s-1.5m", micro: { pools: ["waiting"], every: "10-25s" }, do: ["He waits for the elevator.", "Still waiting."] },
        { chance: 0.3, at: "elevatorCall", hand: "hold", for: "5-10s", do: "Someone steps out first. He waits for them." },
        { go: "elevatorIn", hand: "hold", do: "He steps in." },
        { at: "elevatorIn", hand: "reach", for: "2-3s", do: "He presses the floor." },
        { at: "elevatorIn", hand: "hold", for: "25-45s", do: "The doors close. He rides up." },
        { go: "officeDoorOut", hand: "nod", do: "Down the hall. A nod to someone passing." },
        { at: "officeDoorOut", hand: "reach", for: "3-5s", do: "He opens the office door." },
        { go: "deskStand", hand: "hold", do: "He walks to the desk." },
        { at: "deskStand", hand: "dress", for: "8-15s", set: { carrying: "nothing" }, do: "Coat on the chair. Bag down." },
        { at: "desk", pose: "sitChair", for: "3-5s", do: "He sits." },
      ],
    },

    /* ======================= MORNING WORK ======================= */
    {
      time: "9:00",
      title: "Email and messages",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "20-40s", set: { workScreen: "on" }, do: "Monitor on. Password." },
        { chance: 0.3, pose: "sitChair", hand: "type", for: "6-10s", do: "Wrong password. He types it again." },
        { pose: "sitChair", hand: "none", for: "20-50s", do: "He waits for everything to load." },
        { pose: "sitChair", hand: "type", for: "9-11m", activity: "work", micro: { pools: ["computer", "desk"], every: "1.5-4m" },
          do: ["He reads email.", "Email. He sends a short reply.", "Another short reply.", "He archives a few."] },
        { pose: "sitChair", hand: "type", for: "5-7m", activity: "work", micro: { pools: ["computer"], every: "1.5-3m" },
          do: ["Work messages. He answers one thread.", "He catches up on the chat."] },
        WORK,
      ],
    },
    {
      time: "10:05",
      title: "Bathroom, then water",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "2-4s", set: { workScreen: "locked" }, do: "He locks the screen." },
        { at: "desk", pose: "stand", for: "2-3s", do: "He stands." },
        { go: "toiletW", do: "He walks to the office bathroom." },
        { at: "toiletW", pose: "toilet", for: "1.5-3m", body: { bladder: -1 }, do: "He uses the toilet." },
        { at: "toiletW", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkW", hand: "wash", for: "15-30s", do: ["He washes and dries his hands.", "He washes his hands and shakes off the water."] },
        { go: "breakWater", do: "He walks toward the break room, not back to the desk yet." },
        { at: "breakWater", hand: "drink", for: "15-30s", set: { deskGlass: "full" }, body: { thirst: -0.2 }, do: "He fills a glass of water and takes a sip." },
        { chance: 0.5, at: "breakWater", hand: "nod", for: "30s-1.5m", body: { boredom: -0.15 }, do: ["A coworker comes in. A little small talk.", "He chats with someone about nothing much."] },
        { at: "breakWater", hand: "phone", fill: true, micro: { pools: ["phone"], every: "20-40s" }, do: ["He leans on the counter with the phone.", "A minute away from the desk."] },
        { go: "desk", hand: "drink", do: "Back to the chair with the water." },
        { at: "desk", pose: "sitChair", hand: "type", for: "4-8s", set: { workScreen: "on" }, do: "He sits and unlocks the screen." },
      ],
    },
    { time: "10:12", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "10:40",
      title: "Work call",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "face", for: "8-15s", set: { headphones: "on" }, do: "Headphones on." },
        { pose: "sitChair", hand: "none", fill: true, activity: "work", body: { stress: +0.04 },
          micro: { pools: ["call"], every: "1-3m" }, do: ["On a work call.", "He listens.", "He talks through a problem.", "He explains something, slowly."] },
        { pose: "sitChair", hand: "face", for: "5-10s", set: { headphones: "off" }, do: "The call ends. Headphones off." },
      ],
    },
    { time: "10:55", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "11:30",
      title: "A text",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "phone", for: "15-30s", set: { phone: "in hand" }, do: "The phone buzzes. He reads a text." },
        { pose: "sitChair", hand: "phone", fill: true, do: ["He types a reply.", "He fixes a word and sends it."] },
        { pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "face down on the desk" }, do: "Phone face down." },
      ],
    },
    { time: "11:32", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "11:50",
      title: "Stretch, snack, save",
      chapter: "work",
      steps: [
        { at: "desk", pose: "stand", hand: "stretch", for: "15-30s", body: { stress: -0.03 }, do: "He stands and stretches." },
        { at: "desk", pose: "stand", hand: "reach", for: "8-15s", do: "He digs a snack out of the bag." },
        { at: "desk", pose: "stand", hand: "eat", for: "1.5-2.5m", body: { hunger: -0.12 }, do: "A snack, standing by the desk." },
        { at: "desk", pose: "sitChair", for: "3-5s", do: "He sits back down." },
        { at: "desk", pose: "sitChair", hand: "type", fill: true, activity: "work", micro: { pools: ["computer"], every: "1-2m" }, do: ["He finishes a thought.", "He wraps up what's open."] },
        { pose: "sitChair", hand: "type", for: "2-4s", do: "Save." },
        { chance: 0.5, pose: "sitChair", hand: "type", for: "2-3s", do: "He saves again, just in case." },
        { at: "desk", pose: "sitChair", hand: "type", for: "2-4s", set: { workScreen: "locked" }, do: "Lock the screen." },
        { at: "desk", pose: "stand", hand: "hold", for: "5-10s", set: { carrying: "lunch container", phone: "pocket" }, do: "He stands and picks up the lunch container." },
      ],
    },

    /* ======================= LUNCH ======================= */
    {
      time: "12:00",
      title: "Microwave",
      chapter: "lunch",
      steps: [
        { go: "microwave", hand: "hold", do: "He walks to the break room." },
        { chance: 0.3, at: "microwave", hand: "hold", for: "40s-1.5m", micro: { pools: ["waiting"], every: "15-30s" }, do: "Someone else is using the microwave. He waits his turn." },
        { at: "microwave", hand: "reach", for: "8-15s", set: { microwave: "on", carrying: "nothing" }, do: "Container in. Two minutes." },
        { at: "microwave", hand: "phone", for: "1.8-2.5m", micro: { pools: ["phone"], every: "20-40s" }, do: ["He waits for the beep, looking at the phone.", "The microwave hums."] },
        { chance: 0.35, at: "microwave", hand: "reach", for: "6-12s", do: "He opens it early, checks, and closes it again." },
        { at: "microwave", hand: "reach", for: "5-10s", set: { microwave: "off", carrying: "lunch" }, do: "It beeps. He takes the container out." },
        { go: "lunchSeat", hand: "hold", do: "He walks to the table." },
        { at: "lunchSeat", pose: "sitChair", for: "3-5s", set: { carrying: "nothing" }, do: "He sits." },
        { at: "lunchSeat", pose: "sitChair", hand: "phone", fill: true, micro: { pools: ["phone"], every: "20-40s" }, do: ["Lid off. It's too hot. He lets it cool.", "He stirs it and waits."] },
      ],
    },
    {
      time: "12:08",
      title: "Eat",
      chapter: "lunch",
      steps: [
        { at: "lunchSeat", pose: "sitChair", hand: "eat", fill: true, activity: "sit", body: { hunger: -0.55, stress: -0.04 },
          micro: { pools: ["eating", "mind"], every: "1.5-4m" }, do: ["He eats.", "He eats, slowly.", "Another bite."] },
      ],
    },
    {
      time: "12:32",
      title: "Phone at the table",
      chapter: "lunch",
      steps: [
        { at: "lunchSeat", pose: "sitChair", hand: "phone", fill: true, set: { phone: "in hand" }, body: { boredom: -0.2 },
          micro: { pools: ["phone"], every: "30s-1.5m" }, do: ["He scrolls.", "Phone. Scrolling.", "He sends another text."] },
        { pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "pocket" }, do: "Phone away." },
      ],
    },
    {
      time: "12:40",
      title: "Clean up",
      chapter: "lunch",
      steps: [
        { at: "lunchSeat", pose: "stand", for: "2-3s", do: "He stands." },
        { at: "breakWater", hand: "reach", for: "4-8s", do: "Napkin in the trash." },
        { at: "breakWater", hand: "wash", fill: true, do: ["He rinses the container.", "He dries it with a paper towel."] },
      ],
    },
    {
      time: "12:42",
      title: "Bathroom",
      chapter: "lunch",
      steps: [
        { go: "toiletW", do: "He walks to the bathroom." },
        { at: "toiletW", pose: "toilet", fill: true, body: { bladder: -1 }, do: "He uses the bathroom." },
        { at: "toiletW", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkW", hand: "wash", for: "15-30s", do: "He washes his hands." },
        { chance: 0.4, at: "sinkW", hand: "face", for: "8-15s", do: "A look in the mirror on the way out." },
      ],
    },
    {
      time: "12:46",
      title: "A short walk",
      chapter: "lunch",
      steps: [
        { go: "hallEnd", activity: "walk", do: "A short walk down the hall." },
        {
          when: { weather: ["rain", "storm"] },
          at: "hallEnd",
          fill: true,
          micro: { pools: ["idle"], every: "20-40s" },
          do: ["He stops at the window. Rain on the glass.", "He watches the storm from the window."],
        },
        {
          when: { weather: "snow" },
          at: "hallEnd",
          fill: true,
          micro: { pools: ["idle"], every: "20-40s" },
          do: ["He stops at the window. Snow over the lot.", "He smiles at the sky for a second."],
        },
        {
          when: { weather: ["clear", "clouds", "fog", "wind"] },
          at: "hallEnd",
          fill: true,
          micro: { pools: ["idle"], every: "20-40s" },
          do: ["He stops at the window and looks out.", "Clouds over the parking lot."],
        },
        { go: "elevatorCall", activity: "walk", do: "He walks the length of the hall." },
        { at: "elevatorCall", for: "20-40s", do: "He reads a notice on the wall." },
        { go: "hallMid", activity: "walk", do: "He heads back." },
      ],
    },
    {
      time: "12:52",
      title: "Back to the desk",
      chapter: "lunch",
      steps: [
        { chance: 0.55, at: "hallMid", hand: "nod", for: "1.5-3m", activity: "stand", body: { boredom: -0.2 }, do: ["A coworker in the hall. A little small talk.", "He talks about the weekend."] },
        { go: "officeDoorOut", do: "He walks back to the office." },
        { go: "desk", do: "Back to the desk." },
        { at: "desk", pose: "sitChair", for: "3-5s", do: "He sits." },
        { at: "desk", pose: "sitChair", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "30s-1m" }, do: ["A few minutes of lunch left. Phone.", "He scrolls."] },
        { at: "desk", pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "face down on the desk" }, do: "Phone down." },
      ],
    },
    {
      time: "12:58",
      title: "Wake the computer",
      chapter: "lunch",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "10-20s", set: { workScreen: "on" }, do: "He wakes the computer. It takes a moment." },
        { at: "desk", pose: "sitChair", hand: "type", for: "5-10s", do: "Password. He's back in." },
        { at: "desk", pose: "sitChair", hand: "type", fill: true, micro: { pools: ["computer"], every: "30s-1m" }, do: "He looks over where he left off." },
      ],
    },

    /* ======================= AFTERNOON ======================= */
    { time: "13:00", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "13:35",
      title: "To the meeting room",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "2-4s", set: { workScreen: "locked" }, do: "He locks the screen." },
        { at: "desk", pose: "stand", for: "2-3s", do: "He stands." },
        { go: "meetSeat", do: "He walks to the meeting room." },
        { at: "meetSeat", pose: "sitChair", for: "3-5s", do: "He sits." },
        { at: "meetSeat", pose: "sitChair", hand: "phone", fill: true, do: "Nobody else is here yet. He waits with the phone." },
      ],
    },
    {
      time: "13:37",
      title: "Meeting",
      chapter: "work",
      steps: [
        { at: "meetSeat", pose: "sitChair", hand: "none", for: "5-10s", set: { meeting: "on" }, do: "The other person sits down." },
        { at: "meetSeat", pose: "sitChair", hand: "none", fill: true, activity: "work", body: { stress: +0.05, boredom: +0.1 },
          micro: { pools: ["meeting"], every: "1-3m" }, do: ["The meeting.", "Someone else talks.", "He talks for a minute.", "The meeting goes on."] },
      ],
    },
    {
      time: "13:52",
      title: "Back from the meeting",
      chapter: "work",
      steps: [
        { at: "meetSeat", pose: "stand", for: "2-4s", set: { meeting: "off" }, do: "It ends. He stands." },
        { go: "desk", do: "He walks back." },
        { at: "desk", pose: "sitChair", hand: "type", for: "4-8s", set: { workScreen: "on" }, do: "He sits and unlocks the screen." },
        { at: "desk", pose: "sitChair", hand: "type", fill: true, do: "He types up a few notes from the meeting." },
      ],
    },
    { time: "13:54", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "14:20",
      title: "Bathroom and water, one walk",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "2-4s", set: { workScreen: "locked" }, do: "He locks the screen." },
        { at: "desk", pose: "stand", for: "2-3s", do: "He stands." },
        { go: "toiletW", do: "He walks to the bathroom." },
        { at: "toiletW", pose: "toilet", for: "2-3m", body: { bladder: -1 }, do: "He uses the toilet. He adjusts his clothes." },
        { at: "toiletW", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkW", hand: "wash", for: "20-35s", do: "He washes and dries his hands." },
        { go: "breakWater", do: "He walks to the break room." },
        { at: "breakWater", hand: "drink", for: "15-30s", set: { deskGlass: "full" }, body: { thirst: -0.15 }, do: "He fills the water." },
        { chance: 0.4, at: "breakWater", hand: "nod", for: "20-60s", do: "A coworker is there. A short hello." },
        { at: "breakWater", hand: "phone", fill: true, micro: { pools: ["phone"], every: "20-40s" }, do: ["He drinks a little and checks the phone.", "He stretches his back."] },
        { go: "desk", hand: "drink", do: "He walks back to the desk." },
        { at: "desk", pose: "sitChair", hand: "type", for: "4-8s", set: { workScreen: "on" }, do: "He sits and unlocks the screen." },
      ],
    },
    { time: "14:28", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "15:15",
      title: "Snack and a text",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "eat", for: "2-3m", body: { hunger: -0.1, energy: +0.03 }, do: "A snack." },
        { pose: "sitChair", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "30s-1m" }, do: ["Phone. One text.", "He reads the reply."] },
        { pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "face down on the desk" }, do: "Phone down." },
      ],
    },
    { time: "15:22", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "16:05",
      title: "Call at the desk",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "phone", for: "3-6s", set: { headphones: "on" }, do: "A call. He picks up." },
        { pose: "sitChair", hand: "none", fill: true, activity: "work", body: { stress: +0.04 }, micro: { pools: ["call"], every: "1-3m" },
          do: ["On a call at the desk.", "He listens and takes notes.", "He answers a question."] },
        { pose: "sitChair", hand: "type", for: "5-10s", set: { headphones: "off" }, do: "The call ends. Back to the keyboard." },
      ],
    },
    { time: "16:18", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "17:20",
      title: "Bathroom",
      chapter: "work",
      steps: [
        { at: "desk", pose: "stand", for: "2-3s", set: { workScreen: "locked" }, do: "He stands." },
        { go: "toiletW", do: "He walks to the bathroom." },
        { at: "toiletW", pose: "toilet", fill: true, body: { bladder: -1 }, do: "He uses the bathroom." },
        { at: "toiletW", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkW", hand: "wash", for: "15-30s", do: "He washes his hands." },
        { go: "desk", do: "Back to the chair." },
        { at: "desk", pose: "sitChair", hand: "type", for: "3-6s", set: { workScreen: "on" }, do: "He sits." },
      ],
    },
    {
      time: "17:24",
      title: "Wrap up",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", fill: true, activity: "work", micro: { pools: ["computer", "desk", "mind"], every: "2-5m" },
          do: ["He clears email.", "A short list for tomorrow.", "He closes out a thread.", "He tidies up what's open."] },
      ],
    },
    {
      time: "17:45",
      title: "Pack up",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", fill: true, micro: { pools: ["computer"], every: "40s-1.5m" }, do: ["One last message before he goes.", "He saves everything."] },
        { at: "desk", pose: "sitChair", hand: "type", for: "20-40s", set: { workScreen: "off" }, do: "He shuts the computer down." },
        { at: "deskStand", hand: "dress", for: "15-30s", set: { carrying: "bag", phone: "pocket" }, do: "Coat on. Bag on the shoulder." },
        { at: "deskStand", hand: "reach", for: "2-4s", do: "He pushes the chair in." },
        { chance: 0.35, at: "desk", hand: "reach", for: "4-8s", do: "He almost leaves the glass. He grabs it." },
      ],
    },
    {
      time: "17:52",
      title: "Out of the building",
      chapter: "work",
      steps: [
        { go: "officeDoorOut", hand: "hold", do: "Office door. Into the hall." },
        { chance: 0.5, at: "officeDoorOut", hand: "nod", for: "1-3m", body: { boredom: -0.15 }, do: ["A coworker catches him in the hall. A minute about tomorrow.", "\"Have a good night.\" A little more small talk."] },
        { go: "elevatorCall", hand: "hold", do: "He walks to the elevator." },
        { at: "elevatorCall", hand: "reach", for: "2-3s", do: "He presses the button." },
        { at: "elevatorCall", hand: "hold", for: "40s-2m", micro: { pools: ["waiting"], every: "10-25s" }, do: ["He waits for the elevator.", "End of day. It's slow."] },
        { go: "elevatorIn", hand: "hold", do: "He steps in." },
        { at: "elevatorIn", hand: "hold", for: "25-45s", do: "He rides down." },
        { go: "entranceOut", hand: "hold", do: "Across the lobby and out the door." },
        { chance: 0.3, at: "entranceOut", for: "5-12s", do: "He looks around for the car, then remembers the row." },
        { go: "carSideWork", hand: "hold", do: "He walks to the car." },
        { at: "carSideWork", hand: "reach", for: "2-4s", set: { car: "unlocked" }, do: "Unlock." },
        { at: "carSideWork", pose: "sitCar", hand: "hold", for: "8-15s", set: { carrying: "bag on the seat" }, do: "He gets in. Bag on the seat." },
        { pose: "sitCar", hand: "phone", fill: true, micro: { pools: ["phone", "mind"], every: "30s-1m" }, do: ["He checks messages before driving.", "A minute in the quiet car."] },
      ],
    },

    /* ======================= DRIVE HOME ======================= */
    {
      time: "18:00",
      title: "The drive home",
      chapter: "commute",
      steps: [
        { pose: "sitCar", hand: "reach", for: "4-8s", do: "Seatbelt." },
        { pose: "sitCar", hand: "reach", for: "3-5s", set: { engine: "on" }, do: "He starts the car." },
        { pose: "sitCar", hand: "reach", for: "10-20s", do: ["A podcast. He turns it up.", "Music on."] },
        { drive: "backOutWork", reverse: true, for: "15-25s", do: "He backs out of the spot." },
        { drive: "lotExit", for: "25-40s", set: { headlights: "on" }, do: "Out of the lot. Headlights on; the sky is getting dim." },
        { drive: "roadWorkW", for: "15-25s", do: "Onto the road." },
        { drive: "signalW", for: "10-16s", micro: { pools: ["driving", "mind"], every: "1.5-4m" }, do: ["The drive home.", "Along the avenue.", "He follows the car ahead."] },
        { pose: "sitCar", hand: "wheel", fill: true, micro: DRIVE_MICRO, do: ["The light near home. A long line.", "He waits."] },
      ],
    },
    {
      time: "18:40",
      title: "A light near home",
      chapter: "commute",
      steps: [
        { pose: "sitCar", hand: "wheel", fill: true, set: { signal: "red" }, micro: DRIVE_MICRO, do: ["A light near home. A long line.", "Still red."] },
        { pose: "sitCar", hand: "wheel", for: "3-5s", set: { signal: "green" }, do: "Green." },
      ],
    },
    {
      time: "18:44",
      title: "The last streets",
      chapter: "commute",
      steps: [
        { drive: "roadHomeW", for: "10-14s", micro: DRIVE_MICRO, do: ["The last streets.", "His street."] },
        { pose: "sitCar", hand: "wheel", fill: true, micro: DRIVE_MICRO, do: ["Almost home. He looks for the driveway."] },
      ],
    },
    {
      time: "18:48",
      title: "Driveway",
      chapter: "commute",
      steps: [
        { drive: ["drivewayEnd", "parkHome"], for: "40s-1m", do: "Into the driveway. He parks." },
        { pose: "sitCar", hand: "reach", for: "3-6s", set: { engine: "off", headlights: "off" }, do: "Engine off. Lights off." },
        { pose: "sitCar", hand: "none", fill: true, micro: { pools: ["phone", "mind"], every: "30s-1m" }, do: ["He sits in the car for a moment.", "The engine ticks as it cools."] },
        { pose: "sitCar", hand: "hold", for: "5-10s", set: { carrying: "bag" }, do: "Bag in hand." },
      ],
    },
    {
      time: "18:52",
      title: "Home",
      chapter: "home",
      steps: [
        { at: "carSideHome", hand: "hold", for: "4-8s", do: "Out of the car." },
        { at: "carSideHome", hand: "reach", for: "2-4s", set: { car: "locked" }, do: "Small Weather locks the car." },
        {
          chance: 0.3,
          when: { weather: ["clear", "clouds", "fog", "wind"] },
          steps: [
            { go: "mailbox", hand: "hold", do: "He walks to the mailbox." },
            { at: "mailbox", hand: "reach", for: "15-30s", do: "He checks the mail. Mostly junk." },
          ],
        },
        {
          chance: 0.55,
          when: { weather: ["rain", "storm"] },
          at: "carSideHome",
          hand: "hold",
          for: "4-8s",
          do: "He cancels the walk to the mailbox. It's raining.",
        },
        {
          chance: 0.4,
          when: { weather: "snow" },
          at: "carSideHome",
          hand: "hold",
          for: "4-8s",
          do: "He skips the mailbox. Snow.",
        },
        { go: "frontDoorOut", hand: "hold", do: "He walks to the front door." },
        { at: "frontDoorOut", hand: "reach", for: "4-10s", set: { frontDoor: "open" }, do: "He finds the right key and unlocks it." },
        { at: "frontDoorIn", hand: "reach", for: "3-5s", set: { frontDoor: "locked" }, do: "Inside. He locks the door." },
        { at: "frontDoorIn", hand: "reach", for: "10-20s", do: "Shoes off." },
        { at: "entryTable", hand: "reach", for: "10-20s", set: { carrying: "nothing", livingLight: "on", kitchenLight: "on" }, do: "Bag down. Keys in his spot. Lights on." },
        { chance: 0.3, at: "frontDoorIn", hand: "reach", for: "2-4s", do: "He checks the lock again." },
        { at: "kitchenSink", hand: "wash", for: "15-30s", do: "He washes his hands at the kitchen sink." },
        { at: "kitchenSink", hand: "drink", for: "15-30s", body: { thirst: -0.3 }, do: "A glass of water." },
        {
          chance: 0.45,
          steps: [
            { go: "bedEdge", do: "He goes to change out of work clothes." },
            { at: "bedEdge", hand: "dress", for: "1-1.8m", set: { outfit: "home" }, do: "Something comfortable." },
          ],
        },
        { go: "couch", do: "He walks to the couch." },
        { at: "couch", pose: "sitCouch", for: "3-5s", do: "He sits." },
        { at: "couch", pose: "sitCouch", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "30s-1m" }, do: ["He sinks into the couch with the phone.", "A minute of nothing."] },
      ],
    },

    /* ======================= EVENING ======================= */
    {
      time: "19:00",
      title: "Television",
      chapter: "tv",
      steps: [
        { at: "couch", pose: "sitCouch", hand: "reach", for: "2-4s", set: { phone: "on the cushion" }, do: "Phone down." },
        { at: "couch", pose: "sitCouch", hand: "remote", for: "10-25s", set: { tv: "on" }, do: "He finds the remote. Television on." },
        { chance: 0.5, pose: "sitCouch", hand: "remote", for: "1.5-4m", do: ["He scrolls the streaming options.", "Nothing looks good. He keeps scrolling."] },
        WATCH_TV,
      ],
    },
    {
      time: "19:35",
      title: "Texting on the couch",
      chapter: "tv",
      steps: [
        { at: "couch", pose: "sitCouch", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "40s-1.5m" },
          do: ["Phone out. A text thread.", "He types a reply.", "He waits for the reply."] },
        { pose: "sitCouch", hand: "reach", for: "2-4s", set: { phone: "on the cushion" }, do: "Phone on the cushion." },
      ],
    },
    { time: "19:42", title: "Television", chapter: "tv", steps: [WATCH_TV] },
    {
      time: "19:58",
      title: "Volume down",
      chapter: "tv",
      steps: [
        { at: "couch", pose: "sitCouch", hand: "none", fill: true, do: "He watches until the scene ends." },
        { at: "couch", pose: "sitCouch", hand: "remote", for: "3-6s", do: "Volume down." },
        { at: "couch", pose: "stand", for: "2-3s", set: { phone: "pocket" }, do: "He stands." },
      ],
    },
    {
      time: "20:00",
      title: "Cook",
      chapter: "dinner",
      steps: [
        { go: "fridge", set: { kitchenLight: "on" }, do: "He walks to the kitchen." },
        { at: "fridge", hand: "reach", for: "15-30s", set: { fridge: "open" }, do: ["He opens the fridge and looks.", "He sniffs a container."] },
        {
          chance: 0.45,
          steps: [
            { at: "fridge", hand: "reach", for: "2-4s", set: { fridge: "closed" }, do: "He closes it. Not sure." },
            { at: "fridge", for: "5-12s", do: "He thinks about it." },
            { at: "fridge", hand: "reach", for: "8-15s", set: { fridge: "open" }, do: "He opens it again and picks something." },
          ],
        },
        { at: "fridge", hand: "hold", for: "5-10s", set: { fridge: "closed" }, do: "Food out. He closes the fridge." },
        { at: "stove", hand: "reach", for: "8-15s", set: { stove: "on" }, do: "One pan. Burner on." },
        { at: "stove", hand: "cook", fill: true, activity: "stand", micro: { pools: ["kitchen"], every: "1-3m" }, do: ["He cooks.", "He stirs.", "It sizzles.", "He waits for it."] },
        { at: "stove", hand: "reach", for: "2-4s", set: { stove: "off" }, do: "Burner off." },
        { at: "stove", hand: "cook", for: "15-30s", do: "Onto a plate." },
        {
          chance: 0.35,
          steps: [
            { go: "dinnerSeat", hand: "hold", do: "He carries the plate to the table." },
            { at: "dinnerSeat", for: "2-4s", do: "No fork." },
            { go: "kitchenSink", do: "Back to the kitchen." },
            { at: "kitchenSink", hand: "reach", for: "5-10s", do: "He opens the wrong drawer, then the right one." },
          ],
        },
        { at: "kitchenSink", hand: "reach", for: "3-5s", do: "A fork." },
        { go: "dinnerSeat", hand: "hold", do: "He carries the plate to the table." },
        { at: "dinnerSeat", pose: "sitChair", for: "3-5s", do: "He sits." },
      ],
    },
    {
      time: "20:20",
      title: "Eat",
      chapter: "dinner",
      steps: [
        { at: "dinnerSeat", pose: "sitChair", hand: "eat", fill: true, body: { hunger: -0.7, stress: -0.05 }, micro: { pools: ["eating", "mind"], every: "1.5-4m" },
          do: ["He eats.", "Dinner.", "He eats and looks at nothing in particular."] },
      ],
    },
    {
      time: "20:42",
      title: "Clean up, back to the show",
      chapter: "dinner",
      steps: [
        { at: "dinnerSeat", pose: "stand", for: "2-4s", do: "He stands with the plate." },
        { at: "kitchenSink", hand: "wash", for: "40s-1.2m", do: "He scrapes the plate and rinses it." },
        { at: "kitchenSink", hand: "reach", for: "5-10s", do: "The pan goes in the sink." },
        { chance: 0.5, at: "kitchenSink", for: "4-8s", do: "The rest of the dishes can wait. He's too tired." },
        { at: "stove", hand: "wash", for: "30-50s", do: "He wipes the counter." },
        { at: "fridge", hand: "reach", for: "4-6s", set: { fridge: "open" }, do: "Leftovers into the fridge." },
        { at: "fridge", hand: "reach", for: "10-25s", do: "He moves things around to make room." },
        { at: "fridge", hand: "reach", for: "2-3s", set: { fridge: "closed" }, do: "He closes it." },
        { at: "stove", for: "2-4s", do: "He glances at the stove. It's off." },
        { at: "stove", hand: "reach", for: "1-2s", set: { kitchenLight: "off" }, do: "Kitchen light off." },
        { go: "couch", do: "Back to the couch. The show is still on." },
        { at: "couch", pose: "sitCouch", for: "3-5s", do: "He sits." },
        { at: "couch", pose: "sitCouch", hand: "none", fill: true, micro: { pools: ["couch", "phone"], every: "2-5m" }, do: ["He watches a bit more.", "Full. He sinks into the couch."] },
        { at: "couch", pose: "sitCouch", hand: "remote", for: "3-5s", set: { tv: "off" }, do: "Television off." },
        { at: "couch", pose: "stand", for: "2-3s", do: "He gets up." },
        { go: "pcChair", do: "He walks to the computer." },
        { at: "pcChair", pose: "sitChair", for: "3-5s", do: "He sits." },
        {
          chance: 0.4,
          steps: [
            { at: "pcChair", pose: "stand", for: "2-3s", do: "He stands again. He forgot water." },
            { go: "kitchenSink", do: "Back to the kitchen." },
            { at: "kitchenSink", hand: "drink", for: "15-30s", body: { thirst: -0.2 }, do: "A glass of water." },
            { go: "pcChair", hand: "drink", do: "Back to the computer." },
            { at: "pcChair", pose: "sitChair", for: "3-5s", do: "He sits." },
          ],
        },
      ],
    },
    {
      time: "21:00",
      title: "Computer",
      chapter: "computer",
      steps: [
        { at: "pcChair", pose: "sitChair", hand: "type", for: "10-20s", set: { pc: "on" }, do: "He opens it." },
        { at: "pcChair", pose: "sitChair", hand: "none", for: "10-30s", do: "He waits for it to wake." },
        { pose: "sitChair", hand: "type", fill: true, activity: "sit", body: { boredom: -0.3 }, micro: { pools: ["computer", "mind", "phone"], every: "2-6m" },
          do: ["On the computer.", "He reads an article.", "A video.", "He browses.", "He looks something up."] },
      ],
    },
    {
      time: "21:25",
      title: "A personal call",
      chapter: "computer",
      steps: [
        { at: "pcChair", pose: "sitChair", hand: "phone", for: "3-6s", set: { phone: "in hand" }, do: "The phone rings. He answers." },
        { at: "pcChair", pose: "sitChair", hand: "phone", fill: true, body: { stress: -0.06, boredom: -0.2 },
          micro: { pools: ["personalCall"], every: "40s-1.5m" }, do: ["A short personal call.", "He laughs at something on the call.", "He catches up.", "He listens."] },
        { pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "on the desk" }, do: "Call over. Back to the computer." },
      ],
    },
    {
      time: "21:32",
      title: "Messages",
      chapter: "computer",
      steps: [
        { at: "pcChair", pose: "sitChair", hand: "type", fill: true, micro: { pools: ["computer", "mind"], every: "2-5m" },
          do: ["A few messages.", "He finishes whatever was open.", "He writes a message, erases half, and writes it again."] },
      ],
    },
    {
      time: "21:50",
      title: "Close the computer",
      chapter: "computer",
      steps: [
        { at: "pcChair", pose: "sitChair", hand: "type", fill: true, micro: { pools: ["computer"], every: "1-2m" }, do: ["He finishes what he was reading.", "One more video. A short one."] },
        { at: "pcChair", pose: "sitChair", hand: "type", for: "10-20s", do: "He closes the tabs." },
        { at: "pcChair", pose: "sitChair", hand: "reach", for: "2-4s", set: { pc: "off", phone: "pocket" }, do: "He closes the computer." },
        { at: "pcChair", pose: "stand", for: "2-3s", do: "He stands." },
      ],
    },
    {
      time: "21:55",
      title: "Teeth, pajamas",
      chapter: "computer",
      steps: [
        { go: "toilet", set: { livingLight: "off" }, do: "Living room light off. He goes to the bathroom." },
        { at: "toilet", hand: "reach", for: "1-2s", set: { bathroomLight: "on" }, do: "Light on." },
        { at: "toilet", pose: "toilet", for: "45s-1.2m", body: { bladder: -1 }, do: "He uses the toilet." },
        { at: "toilet", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkHome", hand: "brush", for: "1.2-2m", do: "He brushes his teeth." },
        { at: "bathCenter", hand: "dress", fill: true, set: { outfit: "sleep" }, do: "He changes into what he sleeps in." },
      ],
    },
    {
      time: "21:58",
      title: "To the bedroom",
      chapter: "computer",
      steps: [
        { at: "bathCenter", hand: "reach", for: "1-2s", set: { bathroomLight: "off" }, do: "Bathroom light off." },
        { go: "bedEdge", do: "He walks to the bedroom." },
        { at: "bedEdge", hand: "reach", for: "2-4s", set: { bedroomLamp: "on" }, do: "Lamp on." },
        { at: "bedEdge", pose: "sitBed", fill: true, hand: "phone", set: { phone: "in hand" }, micro: { pools: ["phone"], every: "20-40s" }, do: "He sits on the edge of the bed with the phone." },
      ],
    },

    /* ======================= BED ======================= */
    {
      time: "22:00",
      title: "Television in bed",
      chapter: "bedtime",
      steps: [
        { at: "bed", pose: "recline", hand: "reach", for: "8-15s", set: { blanket: "up" }, do: "Into bed. Blanket up." },
        { at: "bed", pose: "recline", hand: "remote", for: "5-10s", set: { bedTv: "on" }, do: "Television on." },
        { chance: 0.5, pose: "recline", hand: "remote", for: "1-3m", do: ["He starts a show and decides it's not the one.", "He scrolls for something to watch."] },
        WATCH_IN_BED,
      ],
    },
    {
      time: "22:35",
      title: "Last text, alarm, charger",
      chapter: "bedtime",
      steps: [
        { at: "bed", pose: "recline", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "40s-1.2m" }, do: ["The phone. One last text.", "He reads the reply."] },
        { pose: "recline", hand: "phone", for: "10-20s", set: { alarm: "set for 7:30" }, do: "Small Weather checks the alarm. 7:30." },
        { chance: 0.4, pose: "recline", hand: "phone", for: "4-8s", do: "He checks the alarm again." },
        { pose: "recline", hand: "reach", for: "5-10s", set: { phone: "nightstand, charging" }, do: "He plugs the phone in on the nightstand." },
      ],
    },
    { time: "22:42", title: "Television in bed", chapter: "bedtime", steps: [WATCH_IN_BED] },
    {
      time: "22:52",
      title: "Out of bed, bathroom, back",
      chapter: "bedtime",
      steps: [
        { at: "bedEdge", pose: "sitBed", for: "3-6s", do: "Out of bed." },
        { go: "toilet", do: "He goes to the bathroom." },
        { at: "toilet", hand: "reach", for: "1-2s", set: { bathroomLight: "on" }, do: "Light on." },
        { at: "toilet", pose: "toilet", fill: true, body: { bladder: -1 }, do: "He uses the toilet." },
        { at: "toilet", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkHome", hand: "wash", for: "10-20s", do: "Hands." },
        { at: "sinkHome", hand: "reach", for: "1-2s", set: { bathroomLight: "off" }, do: "Light off." },
        { go: "bed", do: "Back to bed." },
        { at: "bed", pose: "recline", hand: "reach", for: "5-10s", set: { blanket: "up" }, do: "Back under the blanket." },
      ],
    },
    {
      time: "22:55",
      title: "Television off",
      chapter: "bedtime",
      steps: [
        { at: "bed", pose: "recline", hand: "none", fill: true, do: "A few more minutes of the show." },
        { at: "bed", pose: "recline", hand: "remote", for: "3-5s", set: { bedTv: "off" }, do: "Television off." },
        { at: "bed", pose: "recline", for: "20-50s", micro: { pools: ["bedAwake"], every: "15-30s" }, do: "He lies there in the lamplight." },
      ],
    },
    {
      time: "22:58",
      title: "Lamp off",
      chapter: "bedtime",
      steps: [
        { at: "bed", pose: "lie", hand: "reach", for: "3-6s", set: { bedroomLamp: "off" }, do: "Lamp off." },
        { at: "bed", pose: "lie", fill: true, do: "He lies down in the dark." },
      ],
    },

    /* ======================= NIGHT ======================= */
    {
      time: "23:00",
      title: "Falling asleep",
      chapter: "sleep",
      steps: [
        { at: "bed", pose: "$sleepPose", for: "6-35m", activity: "rest", micro: { pools: ["fallingAsleep"], every: "1-4m" },
          do: ["He tries to fall asleep.", "Eyes closed. Not asleep yet.", "Drifting."] },
        SLEEP,
      ],
    },
    {
      time: "2:50",
      title: "Night bathroom trip",
      chapter: "sleep",
      chance: 0.6, // skipped on some nights
      jitter: "30m", // and not always at 2:50
      length: "3-6m",
      steps: [
        { at: "bed", pose: "lie", for: "15-40s", activity: "rest", do: "He wakes. He needs the bathroom." },
        { at: "bedEdge", pose: "sitBed", for: "5-15s", set: { blanket: "down" }, do: "He sits up in the dark." },
        { go: "toilet", do: "Half asleep, he walks to the bathroom." },
        { at: "toilet", hand: "reach", for: "1-2s", set: { bathroomLight: "on" }, do: "Light on. Too bright." },
        { at: "toilet", pose: "toilet", for: "1-2m", body: { bladder: -1 }, do: "He uses the toilet." },
        { at: "sinkHome", hand: "wash", for: "8-15s", do: "Hands." },
        { at: "sinkHome", hand: "reach", for: "1-2s", set: { bathroomLight: "off" }, do: "Light off." },
        { go: "bed", do: "Back to bed." },
        { at: "bed", pose: "side", fill: true, set: { blanket: "up", sleepPose: "side" }, do: "Under the blanket again." },
      ],
      then: [SLEEP],
    },
  ],

  /* ------------------------------------------------------------------------
     BEHAVIOR POOLS — small things the engine drops into `micro` steps.
     They don't get their own clock time. They spend time inside the spine.
     ------------------------------------------------------------------------ */
  pools: {
    idle: [
      { do: "He checks the time.", for: "2-4s", hand: "phone" },
      { do: "He looks around.", for: "3-6s" },
      { do: "He pats his pockets.", for: "2-4s", hand: "face" },
      { do: "A yawn.", for: "3-5s", hand: "face", likes: { fatigue: 3 } },
      { do: "He scratches his head.", for: "2-4s", hand: "face" },
      { do: "He stretches his neck.", for: "4-8s", hand: "face" },
      { do: "A sigh.", for: "2-4s", likes: { stress: 2 } },
      { do: "He glances at the phone.", for: "5-15s", hand: "phone", weight: 2 },
      { do: "He thinks about what's next.", for: "5-12s" },
      { do: "He hums something.", for: "5-15s", likes: { boredom: 1 } },
      { do: "He straightens his shirt.", for: "2-4s", hand: "dress" },
    ],

    personalCall: [
      { do: "He gets up from the chair, paces a few steps, and sits again.", for: "15-30s", pose: "stand" },
      { do: "\"Hang on.\" He looks something up for the call.", for: "15-30s", hand: "type", max: 1 },
      { do: "He switches the phone to the other ear.", for: "2-4s" },
      { do: "A long laugh.", for: "4-8s" },
      { do: "He leans back in the chair.", for: "5-10s", hand: "phone" },
    ],

    groggy: [
      { do: "He rubs his eyes.", for: "3-6s", hand: "face" },
      { do: "A big yawn.", for: "3-5s", hand: "face" },
      { do: "He stretches his arms.", for: "4-8s", hand: "stretch" },
      { do: "He stares at the floor.", for: "8-20s" },
      { do: "He scratches his head.", for: "2-4s", hand: "face" },
      { do: "He looks at the window. Bright already.", for: "4-8s", max: 1 },
    ],

    shower: [
      { do: "He lets the water run over his face.", for: "15-40s", hand: "face" },
      { do: "Shampoo.", for: "40s-1m", hand: "towel", max: 1 },
      { do: "He turns the water a little hotter.", for: "3-5s", hand: "reach" },
      { do: "Soap. Rinse.", for: "40s-1m", hand: "wash" },
      { do: "He just stands there in the hot water.", for: "20-60s", hand: "none", likes: { fatigue: 2 } },
    ],
    desk: [
      { do: "He stands, stretches his arms overhead, and sits back down.", for: "10-20s", pose: "stand", hand: "stretch", likes: { fatigue: 1 }, body: { stress: -0.02 } },
      { do: "He rolls his shoulders and cracks his knuckles.", for: "5-10s", hand: "stretch" },
      { do: "He stretches his neck.", for: "5-10s", hand: "face" },
      { do: "He shifts in the chair.", for: "3-6s" },
      { do: "He crosses his legs, then uncrosses them.", for: "4-8s" },
      { do: "He scoots the chair closer to the desk.", for: "3-5s" },
      { do: "He rubs his eyes.", for: "3-6s", hand: "face", likes: { fatigue: 3 } },
      { do: "A yawn.", for: "3-5s", hand: "face", likes: { fatigue: 4 } },
      { do: ["A sigh.", "A deep breath."], for: "3-6s", likes: { stress: 2 } },
      { do: "He stares into space.", for: "10-30s", hand: "none", likes: { boredom: 3, fatigue: 1 } },
      { do: "He stares at the monitor and takes nothing in.", for: "15-40s", hand: "none", likes: { fatigue: 3 } },
      { do: "He reads the same sentence twice.", for: "8-15s", likes: { fatigue: 2 } },
      { do: "He reaches for the water. The glass is empty. He puts it back.", for: "4-8s", hand: "reach", when: { deskGlass: "empty" }, likes: { thirst: 3 } },
      { do: "A sip of water.", for: "5-10s", hand: "drink", when: { deskGlass: "full" }, set: { deskGlass: "half" }, body: { thirst: -0.15 }, likes: { thirst: 4 }, weight: 2 },
      { do: "Another sip. The glass is empty now.", for: "5-10s", hand: "drink", when: { deskGlass: "half" }, set: { deskGlass: "empty" }, body: { thirst: -0.15 }, likes: { thirst: 4 }, weight: 2 },
      { do: "He checks the time for no particular reason.", for: "2-4s" },
      { do: "He picks up the phone, unlocks it, and locks it again.", for: "4-8s", hand: "phone" },
      { do: ["He drums his fingers on the desk.", "He taps the desk, then stops."], for: "5-12s", likes: { boredom: 2 } },
      { do: "He bounces a knee, then notices and stops.", for: "6-15s", likes: { stress: 2 } },
      { do: "He fidgets with a pen.", for: "8-20s", hand: "hold", likes: { boredom: 2 } },
      { do: "He scratches his head.", for: "3-5s", hand: "face" },
      { do: "A notification from someone else's phone. He glances around.", for: "3-6s" },
      { do: "A coworker's conversation. He listens for a moment.", for: "10-25s", hand: "none" },
      { do: "He adjusts the chair height.", for: "10-20s", hand: "reach", max: 1 },
      { do: "He nudges the monitor.", for: "4-8s", hand: "reach", max: 2 },
      { do: "He finishes a task and spends a minute deciding what's next.", for: "40s-1.3m", hand: "none" },
      { do: "He re-reads a document. Concentration slipped.", for: "30s-1m", likes: { fatigue: 2 } },
      { do: "A typo. He notices it and fixes it.", for: "3-6s", weight: 2 },
      { do: "He runs a check, waits for the result, and looks over the output.", for: "1-2m" },
      { do: "An error. He tries the same thing again.", for: "20-50s", body: { stress: +0.04 }, likes: { stress: 1 } },
      { do: "He searches for a file he had open a minute ago.", for: "30s-1.5m" },
      { do: "He saves. Then he saves again.", for: "3-6s" },
      { do: "Frustrated. He stops, sighs, and starts again.", for: "10-20s", hand: "face", body: { stress: -0.03 }, likes: { stress: 3 } },
      { do: "Sleepy after lunch. He blinks hard and keeps going.", for: "15-30s", hand: "face", after: "13:00", before: "15:30", likes: { fatigue: 3 } },
      { do: "He feels the urge for the bathroom and decides it can wait.", for: "3-6s", when: { bladder: ">0.45" }, likes: { bladder: 4 } },
      { do: "Thirsty. He'll get water later.", for: "3-5s", when: { thirst: ">0.55" }, likes: { thirst: 2 } },
      { do: "Hungry. Not yet.", for: "3-5s", when: { hunger: ">0.6" }, likes: { hunger: 2 } },
      { do: "Motivated for a minute. He starts the next thing early.", for: "20-40s", when: { energy: ">0.6" } },
      {
        do: "He walks to the window, looks out, and comes back.",
        max: 1,
        steps: [
          { go: "officeWindow", do: "He gets up and walks to the window." },
          { at: "officeWindow", for: "20-40s", do: "He looks out the window." },
          { go: "$back", do: "Back to the chair." },
        ],
      },
    ],

    computer: [
      { do: "He switches tabs to something that isn't work.", for: "20s-1m", likes: { boredom: 3 }, body: { boredom: -0.1 } },
      { do: "He copies something, forgets to paste it, and copies it again.", for: "8-15s" },
      { do: "He saves a file in the wrong place and goes looking for it.", for: "40s-1.5m", max: 1 },
      { do: "He closes the wrong tab and reopens it.", for: "5-10s" },
      { do: "He waits for a page to load.", for: "5-15s", hand: "none" },
      { do: "The connection drops. He retries.", for: "15-30s", max: 1, body: { stress: +0.03 } },
      { do: "He mistypes a password and enters it again.", for: "6-10s", max: 1 },
      { do: "He dismisses an update reminder.", for: "2-4s", max: 1 },
      { do: "He switches between two windows without doing anything.", for: "6-12s" },
      { do: "He starts a message, erases it, and rewrites it.", for: "30s-1m" },
      { do: "He reads a message and decides to answer it later.", for: "10-20s" },
    ],

    phone: [
      { do: "A notification. He checks it and doesn't reply.", for: "5-15s", hand: "phone" },
      { do: "He unlocks the phone and forgets why.", for: "4-10s", hand: "phone" },
      { do: "He opens a notification, reads it, and goes back.", for: "10-30s", hand: "phone" },
      { do: "He swipes a notification away.", for: "2-4s", hand: "phone" },
      { do: "He checks the battery.", for: "3-5s", hand: "phone" },
      { do: "He turns the screen on to check the time.", for: "2-4s", hand: "phone" },
      { do: "He switches between two apps and gets nothing done.", for: "15-40s", hand: "phone", likes: { boredom: 2 } },
      { do: "He starts a message, erases it, and writes it again.", for: "30s-1.2m", hand: "phone" },
      { do: "He checks for a reply. Nothing yet.", for: "4-8s", hand: "phone" },
      { do: "The camera opens by accident. He closes it.", for: "3-6s", hand: "phone", max: 1 },
      { do: "He searches for something, gets pulled into another result, and drops it.", for: "1-2.5m", hand: "phone", max: 2 },
      { do: "Low battery. He dismisses the warning.", for: "2-4s", hand: "phone", after: "16:00", max: 1 },
      { do: "The app won't load. He tries again.", for: "10-25s", hand: "phone", max: 1 },
      { do: "He opens an app out of habit, scrolls a little, and closes it.", for: "20-50s", hand: "phone", likes: { boredom: 3 }, body: { boredom: -0.08 } },
    ],

    mind: [
      { do: "He remembers an unfinished task.", for: "4-8s", hand: "none" },
      { do: "He worries about a deadline.", for: "8-20s", hand: "none", body: { stress: +0.05 }, likes: { stress: 2 } },
      { do: "He rehearses a conversation he hasn't had yet.", for: "15-40s", hand: "none" },
      { do: "He replays an awkward moment from earlier.", for: "10-20s", hand: "none", body: { stress: +0.02 } },
      { do: "Something embarrassing from years ago surfaces.", for: "5-10s", hand: "face", max: 1 },
      { do: "A short daydream.", for: "20s-1m", hand: "none", likes: { boredom: 3 } },
      { do: "He loses track of time.", for: "1-2m", hand: "none", max: 1, likes: { boredom: 2 } },
      { do: "He forgets what he was about to do.", for: "5-10s", hand: "none" },
      { do: "He makes a small decision, reconsiders it, and reverses it.", for: "10-20s", hand: "none" },
      { do: "He notices the room is a little cold.", for: "3-6s", hand: "none", max: 1 },
      { do: "He thinks of something to buy, searches for it, and gives up.", for: "1-2m", hand: "phone", max: 1 },
      { do: "He remembers a personal errand.", for: "5-10s", hand: "none" },
      { do: "Tired. He thinks about a nap.", for: "5-10s", hand: "face", when: { energy: "<0.4" }, likes: { fatigue: 3 } },
      { do: "Rain on the window. He watches a second.", for: "5-12s", hand: "none", when: { weather: ["rain", "storm"] }, max: 2 },
      { do: "Thunder. He listens, then types again.", for: "4-8s", hand: "none", when: { weather: "storm" }, max: 1 },
      { do: "Snow out there. Quiet.", for: "5-10s", hand: "none", when: { weather: "snow" }, max: 1 },
    ],

    waiting: [
      { do: "He presses the button again.", for: "3-5s", hand: "reach" },
      { do: "He looks up at the numbers.", for: "5-10s" },
      { do: "He checks the phone while he waits.", for: "8-15s", hand: "phone" },
      { do: "He shifts his bag to the other shoulder.", for: "3-6s", hand: "hold" },
    ],

    call: [
      { do: "He unmutes, realizes he was muted, and says it again.", for: "6-12s", hand: "reach", max: 1 },
      { do: "\"Can you hear me?\" He checks the microphone.", for: "8-15s", hand: "face", max: 1 },
      { do: "He waits for someone else to join.", for: "30s-1m", before: "10:45", max: 1 },
      { do: "He asks them to repeat that.", for: "5-10s" },
      { do: "He reads a message while listening.", for: "15-30s", hand: "type" },
      { do: "He takes notes, then stops taking notes.", for: "30s-1m", hand: "type" },
      { do: "He glances at the clock.", for: "2-4s" },
      { do: "He nods at nobody.", for: "3-6s", hand: "nod" },
      { do: "He mutes himself and sighs.", for: "4-8s", hand: "reach", likes: { stress: 2 } },
    ],

    meeting: [
      { do: "He waits for the other person to settle in.", for: "20-40s", max: 1 },
      { do: "He takes notes, then stops.", for: "30s-1m", hand: "type" },
      { do: "He looks at the clock.", for: "2-4s" },
      { do: "He reads a message under the table.", for: "10-25s", hand: "phone" },
      { do: "He asks someone to repeat a number.", for: "5-10s" },
      { do: "His attention drifts. He pulls it back.", for: "10-25s", likes: { boredom: 3 } },
      { do: "He nods along.", for: "4-8s", hand: "nod" },
    ],

    eating: [
      { do: "He checks the phone between bites.", for: "15-40s", hand: "phone" },
      { do: "He drops the fork and picks it up.", for: "4-8s", hand: "reach", max: 1 },
      { do: "He chews and stares at nothing.", for: "10-25s", hand: "none" },
      { do: "He wipes his mouth.", for: "3-5s", hand: "face" },
      { do: "A drink of water.", for: "5-10s", hand: "drink", body: { thirst: -0.1 } },
      { do: "Too hot. He waits a moment.", for: "15-30s", hand: "none", max: 1 },
    ],

    couch: [
      { do: "He pauses the show to answer a message.", for: "40s-1.5m", hand: "phone" },
      { do: "His attention wandered. He rewinds.", for: "10-20s", hand: "remote" },
      { do: "Too loud. He turns it down.", for: "4-8s", hand: "remote", max: 2 },
      { do: "He straightens a cushion.", for: "5-10s", hand: "reach" },
      { do: "He shifts on the couch.", for: "4-8s" },
      { do: "He checks the time.", for: "2-4s", hand: "phone" },
      { do: "A noise outside. He pauses to listen.", for: "4-10s", hand: "none" },
      { do: "He stretches out his legs.", for: "5-10s", hand: "stretch" },
      {
        do: "He walks toward the kitchen, forgets why, and comes back.",
        max: 1,
        steps: [
          { go: "hallway", do: "He gets up and heads for the kitchen." },
          { at: "hallway", for: "4-8s", hand: "face", do: "He stops. Why did he get up?" },
          { go: "$back", do: "He goes back to the couch." },
        ],
      },
      {
        do: "Fridge. He looks. Nothing. He closes it.",
        max: 1,
        before: "20:00",
        likes: { hunger: 3, boredom: 2 },
        steps: [
          { go: "fridge", do: "He gets up and goes to the fridge." },
          { at: "fridge", hand: "reach", for: "15-30s", set: { fridge: "open" }, do: "He opens the fridge and looks inside." },
          { at: "fridge", for: "3-6s", set: { fridge: "closed" }, do: "He takes nothing and closes it." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
      {
        do: "A snack before dinner.",
        max: 1,
        before: "20:00",
        when: { hunger: ">0.5" },
        likes: { hunger: 4 },
        steps: [
          { go: "counter", do: "He gets up for a snack." },
          { at: "counter", hand: "eat", for: "30s-1m", body: { hunger: -0.12 }, do: "A handful of something, eaten standing at the counter." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
      {
        do: "He checks the front door lock.",
        max: 1,
        steps: [
          { go: "frontDoorIn", do: "He gets up to check the front door." },
          { at: "frontDoorIn", hand: "reach", for: "4-8s", do: "Locked. Of course." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
      {
        do: "He checks the thermostat.",
        max: 1,
        steps: [
          { go: "thermostat", do: "He gets up and goes to the thermostat." },
          { at: "thermostat", hand: "reach", for: "8-15s", do: "He turns it up a degree." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
      {
        do: "He picks something up off the floor and puts it in the wrong place.",
        max: 1,
        steps: [
          { go: "livingWindow", do: "Something on the floor. He picks it up." },
          { at: "livingWindow", hand: "reach", for: "5-10s", do: "He puts it on the windowsill. Not where it goes." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
    ],

    kitchen: [
      { do: "He tastes it.", for: "5-10s", hand: "eat", weight: 2 },
      { do: "He drops a spoon and picks it up.", for: "4-8s", hand: "reach", max: 1 },
      { do: "He searches the drawer for the spatula. It's not where it should be.", for: "15-30s", hand: "reach", max: 1 },
      { do: "He opens two cabinets looking for the salt.", for: "10-20s", hand: "reach", max: 1 },
      { do: "A little spills. He wipes it up.", for: "10-20s", hand: "wash", max: 1 },
      { do: "He touches the pan and pulls his hand back.", for: "2-4s", hand: "reach", max: 1 },
      { do: "He turns the heat down.", for: "3-5s", hand: "reach" },
      { do: "He checks it before it's done.", for: "5-10s", hand: "cook" },
      { do: "A bite while he cooks.", for: "5-10s", hand: "eat", body: { hunger: -0.05 }, likes: { hunger: 2 } },
      { do: "He notices the dishes in the sink and leaves them for later.", for: "3-6s", max: 1 },
      { do: "He waits for it to heat.", for: "20-40s", hand: "none" },
      {
        do: "He forgot an ingredient.",
        max: 1,
        steps: [
          { go: "fridge", do: "He forgot something. Back to the fridge." },
          { at: "fridge", hand: "reach", for: "10-20s", set: { fridge: "open" }, do: "He grabs it." },
          { at: "fridge", for: "2-4s", set: { fridge: "closed" }, do: "Fridge closed." },
          { go: "$back", hand: "hold", do: "Back to the stove." },
        ],
      },
    ],

    driving: [
      { do: "He adjusts the mirror.", for: "4-8s", hand: "reach", max: 1 },
      { do: "He adjusts the air.", for: "4-8s", hand: "reach" },
      { do: "He changes the station.", for: "4-8s", hand: "reach" },
      { do: "He glances at the route.", for: "3-5s" },
      { do: "He slows for traffic.", for: "15-40s" },
      { do: "He leaves a gap behind the car ahead.", for: "10-20s" },
      { do: "He waits for a pedestrian.", for: "8-15s", max: 1 },
      { do: "He lets someone merge.", for: "5-10s" },
      { do: "He hesitates at an intersection.", for: "4-8s", max: 1 },
      { do: "He sings along a little.", for: "15-40s", likes: { boredom: 2 } },
      { do: "A yawn at the wheel.", for: "3-5s", likes: { fatigue: 3 } },
    ],

    bedAwake: [
      { do: "He adjusts the pillow.", for: "5-10s", hand: "reach" },
      { do: "He adjusts the pillow again.", for: "4-8s", hand: "reach", max: 1 },
      { do: "Too warm. He pushes the blanket down.", for: "5-10s", hand: "reach", when: { blanket: "up" }, set: { blanket: "down" } },
      { do: "Too cold. He pulls the blanket up.", for: "5-10s", hand: "reach", when: { blanket: "down" }, set: { blanket: "up" } },
      { do: "He checks the time and counts the hours of sleep left.", for: "5-10s", hand: "phone", after: "22:30" },
      { do: "The television is loud. He turns it down.", for: "4-8s", hand: "remote", when: { bedTv: "on" }, max: 1 },
      { do: "He rewinds a scene. Attention wandered.", for: "10-20s", hand: "remote", when: { bedTv: "on" } },
      { do: "He pats the blanket for the phone. It's already on the nightstand.", for: "5-10s", hand: "reach", when: { phone: "nightstand, charging" }, max: 1 },
      { do: "An itch. He scratches it.", for: "3-5s", hand: "face" },
    ],

    fallingAsleep: [
      { do: "He rolls onto his back.", for: "4-8s", pose: "lie", when: { sleepPose: "side" }, set: { sleepPose: "lie" } },
      { do: "He rolls onto his side.", for: "4-8s", pose: "side", when: { sleepPose: "lie" }, set: { sleepPose: "side" } },
      { do: "His mind is still going. He checks the time.", for: "8-15s", pose: "recline", hand: "phone", max: 2 },
      { do: "Too warm. One leg out from under the blanket.", for: "5-10s", hand: "reach", when: { blanket: "up" }, set: { blanket: "down" } },
      { do: "Cold now. He pulls the blanket back up.", for: "5-10s", hand: "reach", when: { blanket: "down" }, set: { blanket: "up" } },
      { do: "He flips the pillow to the cool side.", for: "5-10s", hand: "reach", max: 1 },
      { do: "A noise. He listens.", for: "5-12s" },
      { do: "He thinks about tomorrow.", for: "20-50s", body: { stress: +0.02 } },
    ],

    night: [
      { do: "He rolls onto his back.", for: "5-15s", pose: "lie", when: { sleepPose: "side" }, set: { sleepPose: "lie" } },
      { do: "He rolls onto his side.", for: "5-15s", pose: "side", when: { sleepPose: "lie" }, set: { sleepPose: "side" } },
      { do: "He wakes briefly and settles again.", for: "20s-1.5m", activity: "rest", max: 2 },
      { do: "Too warm. He pushes the blanket down.", for: "5-10s", hand: "reach", when: { blanket: "up" }, set: { blanket: "down" } },
      { do: "Too cold. He pulls the blanket up.", for: "5-10s", hand: "reach", when: { blanket: "down" }, set: { blanket: "up" } },
      { do: "A noise. He listens for a few seconds.", for: "5-15s", activity: "rest", max: 2 },
      { do: "An itch. A tug on the blanket.", for: "3-8s", hand: "reach" },
    ],
  },
};
