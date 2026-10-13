/* ==========================================================================
   THE DAY
   --------------------------------------------------------------------------
   This one file defines everything the person does, where they do it, and
   how their body and their things change. Edit it, save it, and reload the page.

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
     likes:   { boredom: 2 }   more likely when that stat is high
     after / before: "13:00"   only in that part of the day
     max:     1             at most this many times a day
     weight:  2             base likelihood (default 1)
   ========================================================================== */

/* Reusable steps. Defined once, used in several blocks below. */
const WORK = {
  do: [
    "They work.",
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
  do: ["They watch.", "They watch the show.", "They laugh at something.", "They watch, half paying attention."],
  pose: "sitCouch",
  activity: "rest",
  fill: true,
  micro: { pools: ["couch", "mind", "phone"], every: "3-9m" },
};

const WATCH_IN_BED = {
  do: ["They watch, in bed.", "They watch.", "Eyes heavy. They keep watching."],
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
      origin: [2400, 0],
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
      camera: { alpha: 1.3, beta: 0.95, radius: 8 },
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
        carSideHome: [-0.3, 7.3, 270],
        mailbox: [3.6, 10.2, 0],
      },
    },

    /* ---------------- the street (car only) ---------------- */
    road: {
      label: "On the road",
      building: "street",
      camera: { alpha: 1.15, beta: 1.0, radius: 14 },
      spots: {
        parkHome: [-1.5, 7.6, 180],
        drivewayEnd: [-1.5, 10.6, 180],
        roadHomeE: [2.5, 11.9, 90],
        signalE: [496, 11.9, 90],
        roadWorkE: [2402, 11.9, 90],
        lotEntry: [2403.5, 10.8, 180],
        lotLane: [2405.5, 9.6, 180],
        parkWork: [2405.5, 7.8, 180],
        parkWorkFix: [2405.5, 7.45, 180],
        backOutWork: [2405.5, 9.8, 180],
        lotExit: [2403.5, 11.4, 270],
        roadWorkW: [2399, 13.3, 270],
        signalW: [504, 13.3, 270],
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
        carSideWork: [6.65, 7.6, 270],
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

  /* The road between home and work. */
  street: {
    z: 12.6,
    from: -80,
    to: 2500,
    signals: [{ x: 500, thing: "signal" }],
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
      stand: ["They stand there a moment.", "A pause.", "They look around."],
      sitChair: ["They sit back for a moment.", "A pause."],
      sitCouch: ["They sit there.", "A pause."],
      sitBed: ["They sit on the bed a moment."],
      sitCar: ["They sit in the car a moment."],
      lie: ["They lie there."],
      side: ["They lie there."],
      recline: ["They lie back."],
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
          do: ["The alarm goes off. They stay on their back.", "The alarm. They don't move.", "Still the alarm. Still on their back."] },
        { pose: "lie", hand: "reach", for: "3-6s", set: { alarm: "snoozed" }, do: "They reach to the nightstand and hit snooze." },
        { pose: "side", for: "4.5-5.5m", activity: "sleep", set: { sleepPose: "side" }, do: ["Eyes closed again.", "Five more minutes.", "Half asleep."] },
        { pose: "lie", for: "2.5-3.5m", activity: "rest", set: { alarm: "ringing" }, do: ["The alarm goes off again. They lie there.", "Again. They stare at the ceiling."] },
        { pose: "lie", hand: "reach", for: "3-5s", set: { alarm: "off" }, do: "They reach over and turn it off." },
        { pose: "recline", hand: "phone", for: "1.2-2.2m", set: { phone: "in hand" }, micro: { pools: ["phone"], every: "20-40s" }, do: ["Phone in bed. The time.", "One notification."] },
        { pose: "recline", hand: "reach", for: "3-5s", set: { phone: "nightstand" }, do: "The phone goes back on the nightstand." },
        { at: "bedEdge", pose: "sitBed", fill: true, set: { blanket: "down" }, micro: { pools: ["groggy"], every: "20-40s" },
          do: ["They sit on the edge of the bed.", "Feet on the floor.", "They sit there, not quite awake."] },
      ],
    },
    {
      time: "7:46",
      title: "Bathroom, shower, dressed",
      chapter: "ready",
      steps: [
        { pose: "stand", for: "2-4s", do: "They stand." },
        { go: "bathCenter", set: { bathroomLight: "on" }, do: "They walk to the bathroom." },
        { at: "bathCenter", hand: "reach", for: "1-2s", do: "Light on." },
        { at: "toilet", pose: "toilet", for: "2-3.5m", body: { bladder: -1 }, do: "They use the toilet." },
        { at: "toilet", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { chance: 0.15, at: "toilet", pose: "stand", hand: "reach", for: "4-8s", do: "They flush again." },
        { chance: 0.25, at: "toilet", pose: "stand", for: "3-5s", do: "The toilet paper is getting low. They make a mental note." },
        { at: "sinkHome", hand: "wash", for: "15-35s", do: ["They wash their hands.", "They wash their hands, longer than they meant to."] },
        { at: "shower", hand: "reach", for: "15-25s", set: { shower: "on" }, do: "Shower on. They wait for the water to warm up." },
        { at: "shower", hand: "dress", for: "20-35s", set: { outfit: "towel" }, do: "Clothes off." },
        { at: "shower", hand: "wash", fill: true, activity: "stand", body: { stress: -0.1, energy: +0.05 },
          micro: { pools: ["shower", "mind"], every: "40s-1.5m" }, do: ["They shower.", "Hot water. They stand under it.", "They wash their hair.", "Soap."] },
        { at: "shower", hand: "reach", for: "3-5s", set: { shower: "off" }, do: "Shower off." },
        { at: "bathCenter", hand: "towel", for: "1-1.6m", do: "Towel." },
        { at: "sinkHome", hand: "face", for: "8-15s", do: "Deodorant." },
        { at: "sinkHome", hand: "brush", for: "1.6-2.3m", do: "They brush their teeth." },
        { at: "sinkHome", hand: "wash", for: "5-10s", do: "Rinse. Spit." },
        { chance: 0.35, at: "sinkHome", hand: "face", for: "10-25s", do: ["They notice something in the mirror and lean in.", "They fix their hair in the mirror."] },
        { at: "bathCenter", hand: "dress", for: "2-3m", set: { outfit: "work" }, do: ["They get dressed.", "Socks."] },
        { at: "bathCenter", hand: "reach", for: "1-2s", set: { bathroomLight: "off" }, do: "Bathroom light off." },
      ],
    },
    {
      time: "8:05",
      title: "Coffee, then out the door",
      chapter: "ready",
      steps: [
        { go: "counter", set: { kitchenLight: "on" }, do: "They walk to the kitchen." },
        { at: "counter", hand: "reach", for: "1-2s", do: "Light on." },
        { at: "counter", hand: "cook", for: "20-35s", set: { mug: "in hand" }, do: "Coffee on. Bread in the toaster." },
        { at: "counter", hand: "phone", fill: true, micro: { pools: ["phone"], every: "20-40s" }, do: ["They wait for the coffee, looking at the phone.", "The toaster ticks."] },
        { at: "counter", hand: "cook", for: "15-30s", do: "Toast up. A little butter." },
        { at: "counter", hand: "drink", for: "2-3m", body: { hunger: -0.35, thirst: -0.25, energy: +0.2 }, do: ["Coffee and toast, eaten standing.", "A bite of toast. A sip of coffee."] },
        { at: "kitchenSink", hand: "wash", for: "15-30s", set: { mug: "sink" }, do: "They rinse the mug. It stays in the sink." },
        { at: "kitchenSink", hand: "reach", for: "1-2s", set: { kitchenLight: "off" }, do: "Kitchen light off." },
        { go: "entryTable", do: "To the front door." },
        { at: "entryTable", hand: "reach", for: "30-50s", set: { carrying: "bag, keys, lunch", phone: "pocket" }, do: "Bag, keys, wallet, phone, lunch container." },
        { chance: 0.3, at: "entryTable", hand: "face", for: "3-6s", do: "They pat their pocket. Phone? Yes." },
        { at: "frontDoorIn", hand: "reach", for: "25-45s", do: "Shoes on." },
        { at: "frontDoorOut", hand: "reach", for: "3-5s", set: { frontDoor: "open" }, do: "They open the front door and step out." },
        { at: "frontDoorOut", hand: "reach", for: "3-6s", set: { frontDoor: "locked" }, do: "They lock it from outside." },
        { chance: 0.45, at: "frontDoorOut", hand: "reach", for: "2-3s", do: "They tug the handle. Locked. They knew that." },
        { go: "carSideHome", hand: "hold", do: "They walk to the car." },
        { at: "carSideHome", hand: "reach", for: "2-4s", set: { car: "unlocked" }, do: "Unlock." },
        { at: "carSideHome", pose: "sitCar", hand: "hold", for: "8-15s", set: { carrying: "bag on the seat" }, do: "They get in. Bag on the passenger seat." },
        { pose: "sitCar", hand: "reach", for: "4-8s", do: "Seatbelt." },
        { pose: "sitCar", hand: "reach", for: "3-5s", set: { engine: "on" }, do: "They start the engine." },
      ],
    },

    /* ======================= DRIVE TO WORK ======================= */
    {
      time: "8:13",
      title: "Driveway and the neighborhood",
      chapter: "commute",
      steps: [
        { chance: 0.4, pose: "sitCar", hand: "reach", for: "8-15s", do: "The mirror needs a nudge." },
        { pose: "sitCar", hand: "reach", for: "10-20s", do: ["They put music on.", "They connect the phone. A podcast."] },
        { drive: "drivewayEnd", reverse: true, for: "25-40s", do: "They back out of the driveway." },
        { drive: "roadHomeE", for: "15-25s", do: "Onto the street." },
        { drive: "signalE", fill: true, micro: DRIVE_MICRO, do: ["Through the neighborhood.", "Onto the main road.", "Past the houses."] },
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
      steps: [{ drive: "roadWorkE", fill: true, micro: DRIVE_MICRO, do: ["The rest of the drive.", "Main road.", "Traffic moves."] }],
    },
    {
      time: "8:46",
      title: "Park, then up to the desk",
      chapter: "commute",
      steps: [
        { drive: "lotEntry", for: "30-45s", do: "They turn into the work lot." },
        { drive: "lotLane", for: "25-40s", do: "They look for a spot. One is too tight." },
        { drive: "parkWork", for: "20-35s", do: "They pull into a spot." },
        { chance: 0.45, drive: "parkWorkFix", for: "8-15s", do: "They pull forward to sit inside the lines." },
        { pose: "sitCar", hand: "reach", for: "2-4s", set: { engine: "off" }, do: "Engine off." },
        { pose: "sitCar", hand: "phone", fill: true, micro: { pools: ["phone", "mind"], every: "30s-1m" },
          do: ["Early. They sit in the parked car with the phone.", "They let the song finish.", "A few more minutes in the car."] },
        { pose: "sitCar", hand: "hold", for: "10-20s", set: { carrying: "bag, phone, lunch" }, do: "Phone, bag, and lunch in hand." },
        { chance: 0.3, pose: "sitCar", hand: "reach", for: "6-12s", do: "The lunch was in the back seat. They reach back for it." },
        { at: "carSideWork", hand: "hold", for: "4-8s", do: "They get out." },
        { at: "carSideWork", hand: "reach", for: "2-4s", set: { car: "locked" }, do: "They lock the car." },
        { chance: 0.4, at: "carSideWork", hand: "reach", for: "2-3s", do: "They tug the handle to check." },
        { go: "entranceOut", hand: "hold", do: "They walk to the entrance." },
        { at: "entranceOut", hand: "reach", for: "3-5s", do: "They open the building door." },
        { go: "elevatorCall", hand: "hold", do: "Across the lobby to the elevator." },
        { at: "elevatorCall", hand: "reach", for: "2-3s", do: "They press the button." },
        { at: "elevatorCall", hand: "hold", for: "30s-1.5m", micro: { pools: ["waiting"], every: "10-25s" }, do: ["They wait for the elevator.", "Still waiting."] },
        { chance: 0.3, at: "elevatorCall", hand: "hold", for: "5-10s", do: "Someone steps out first. They wait for them." },
        { go: "elevatorIn", hand: "hold", do: "They step in." },
        { at: "elevatorIn", hand: "reach", for: "2-3s", do: "They press the floor." },
        { at: "elevatorIn", hand: "hold", for: "25-45s", do: "The doors close. They ride up." },
        { go: "officeDoorOut", hand: "nod", do: "Down the hall. A nod to someone passing." },
        { at: "officeDoorOut", hand: "reach", for: "3-5s", do: "They open the office door." },
        { go: "deskStand", hand: "hold", do: "They walk to the desk." },
        { at: "deskStand", hand: "dress", for: "8-15s", set: { carrying: "nothing" }, do: "Coat on the chair. Bag down." },
        { at: "desk", pose: "sitChair", for: "3-5s", do: "They sit." },
      ],
    },

    /* ======================= MORNING WORK ======================= */
    {
      time: "9:00",
      title: "Email and messages",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "20-40s", set: { workScreen: "on" }, do: "Monitor on. Password." },
        { chance: 0.3, pose: "sitChair", hand: "type", for: "6-10s", do: "Wrong password. They type it again." },
        { pose: "sitChair", hand: "none", for: "20-50s", do: "They wait for everything to load." },
        { pose: "sitChair", hand: "type", for: "9-11m", activity: "work", micro: { pools: ["computer", "desk"], every: "1.5-4m" },
          do: ["They read email.", "Email. They send a short reply.", "Another short reply.", "They archive a few."] },
        { pose: "sitChair", hand: "type", for: "5-7m", activity: "work", micro: { pools: ["computer"], every: "1.5-3m" },
          do: ["Work messages. They answer one thread.", "They catch up on the chat."] },
        WORK,
      ],
    },
    {
      time: "10:05",
      title: "Bathroom, then water",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "2-4s", set: { workScreen: "locked" }, do: "They lock the screen." },
        { at: "desk", pose: "stand", for: "2-3s", do: "They stand." },
        { go: "toiletW", do: "They walk to the office bathroom." },
        { at: "toiletW", pose: "toilet", for: "1.5-3m", body: { bladder: -1 }, do: "They use the toilet." },
        { at: "toiletW", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkW", hand: "wash", for: "15-30s", do: ["They wash and dry their hands.", "They wash their hands and shake off the water."] },
        { go: "breakWater", do: "They walk toward the break room, not back to the desk yet." },
        { at: "breakWater", hand: "drink", for: "15-30s", set: { deskGlass: "full" }, body: { thirst: -0.2 }, do: "They fill a glass of water and take a sip." },
        { chance: 0.5, at: "breakWater", hand: "nod", for: "30s-1.5m", body: { boredom: -0.15 }, do: ["A coworker comes in. A little small talk.", "They chat with someone about nothing much."] },
        { at: "breakWater", hand: "phone", fill: true, micro: { pools: ["phone"], every: "20-40s" }, do: ["They lean on the counter with the phone.", "A minute away from the desk."] },
        { go: "desk", hand: "drink", do: "Back to the chair with the water." },
        { at: "desk", pose: "sitChair", hand: "type", for: "4-8s", set: { workScreen: "on" }, do: "They sit and unlock the screen." },
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
          micro: { pools: ["call"], every: "1-3m" }, do: ["On a work call.", "They listen.", "They talk through a problem.", "They explain something, slowly."] },
        { pose: "sitChair", hand: "face", for: "5-10s", set: { headphones: "off" }, do: "The call ends. Headphones off." },
      ],
    },
    { time: "10:55", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "11:30",
      title: "A text",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "phone", for: "15-30s", set: { phone: "in hand" }, do: "The phone buzzes. They read a text." },
        { pose: "sitChair", hand: "phone", fill: true, do: ["They type a reply.", "They fix a word and send it."] },
        { pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "face down on the desk" }, do: "Phone face down." },
      ],
    },
    { time: "11:32", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "11:50",
      title: "Stretch, snack, save",
      chapter: "work",
      steps: [
        { at: "desk", pose: "stand", hand: "stretch", for: "15-30s", body: { stress: -0.03 }, do: "They stand and stretch." },
        { at: "desk", pose: "stand", hand: "reach", for: "8-15s", do: "They dig a snack out of the bag." },
        { at: "desk", pose: "stand", hand: "eat", for: "1.5-2.5m", body: { hunger: -0.12 }, do: "A snack, standing by the desk." },
        { at: "desk", pose: "sitChair", for: "3-5s", do: "They sit back down." },
        { at: "desk", pose: "sitChair", hand: "type", fill: true, activity: "work", micro: { pools: ["computer"], every: "1-2m" }, do: ["They finish a thought.", "They wrap up what's open."] },
        { pose: "sitChair", hand: "type", for: "2-4s", do: "Save." },
        { chance: 0.5, pose: "sitChair", hand: "type", for: "2-3s", do: "They save again, just in case." },
        { at: "desk", pose: "sitChair", hand: "type", for: "2-4s", set: { workScreen: "locked" }, do: "Lock the screen." },
        { at: "desk", pose: "stand", hand: "hold", for: "5-10s", set: { carrying: "lunch container", phone: "pocket" }, do: "They stand and pick up the lunch container." },
      ],
    },

    /* ======================= LUNCH ======================= */
    {
      time: "12:00",
      title: "Microwave",
      chapter: "lunch",
      steps: [
        { go: "microwave", hand: "hold", do: "They walk to the break room." },
        { chance: 0.3, at: "microwave", hand: "hold", for: "40s-1.5m", micro: { pools: ["waiting"], every: "15-30s" }, do: "Someone else is using the microwave. They wait their turn." },
        { at: "microwave", hand: "reach", for: "8-15s", set: { microwave: "on", carrying: "nothing" }, do: "Container in. Two minutes." },
        { at: "microwave", hand: "phone", for: "1.8-2.5m", micro: { pools: ["phone"], every: "20-40s" }, do: ["They wait for the beep, looking at the phone.", "The microwave hums."] },
        { chance: 0.35, at: "microwave", hand: "reach", for: "6-12s", do: "They open it early, check, and close it again." },
        { at: "microwave", hand: "reach", for: "5-10s", set: { microwave: "off", carrying: "lunch" }, do: "It beeps. They take the container out." },
        { go: "lunchSeat", hand: "hold", do: "They walk to the table." },
        { at: "lunchSeat", pose: "sitChair", for: "3-5s", set: { carrying: "nothing" }, do: "They sit." },
        { at: "lunchSeat", pose: "sitChair", hand: "phone", fill: true, micro: { pools: ["phone"], every: "20-40s" }, do: ["Lid off. It's too hot. They let it cool.", "They stir it and wait."] },
      ],
    },
    {
      time: "12:08",
      title: "Eat",
      chapter: "lunch",
      steps: [
        { at: "lunchSeat", pose: "sitChair", hand: "eat", fill: true, activity: "sit", body: { hunger: -0.55, stress: -0.04 },
          micro: { pools: ["eating", "mind"], every: "1.5-4m" }, do: ["They eat.", "They eat, slowly.", "Another bite."] },
      ],
    },
    {
      time: "12:32",
      title: "Phone at the table",
      chapter: "lunch",
      steps: [
        { at: "lunchSeat", pose: "sitChair", hand: "phone", fill: true, set: { phone: "in hand" }, body: { boredom: -0.2 },
          micro: { pools: ["phone"], every: "30s-1.5m" }, do: ["They scroll.", "Phone. Scrolling.", "They send another text."] },
        { pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "pocket" }, do: "Phone away." },
      ],
    },
    {
      time: "12:40",
      title: "Clean up",
      chapter: "lunch",
      steps: [
        { at: "lunchSeat", pose: "stand", for: "2-3s", do: "They stand." },
        { at: "breakWater", hand: "reach", for: "4-8s", do: "Napkin in the trash." },
        { at: "breakWater", hand: "wash", fill: true, do: ["They rinse the container.", "They dry it with a paper towel."] },
      ],
    },
    {
      time: "12:42",
      title: "Bathroom",
      chapter: "lunch",
      steps: [
        { go: "toiletW", do: "They walk to the bathroom." },
        { at: "toiletW", pose: "toilet", fill: true, body: { bladder: -1 }, do: "They use the bathroom." },
        { at: "toiletW", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkW", hand: "wash", for: "15-30s", do: "They wash their hands." },
        { chance: 0.4, at: "sinkW", hand: "face", for: "8-15s", do: "A look in the mirror on the way out." },
      ],
    },
    {
      time: "12:46",
      title: "A short walk",
      chapter: "lunch",
      steps: [
        { go: "hallEnd", activity: "walk", do: "A short walk down the hall." },
        { at: "hallEnd", fill: true, micro: { pools: ["idle"], every: "20-40s" }, do: ["They stop at the window and look out.", "Clouds over the parking lot."] },
        { go: "elevatorCall", activity: "walk", do: "They walk the length of the hall." },
        { at: "elevatorCall", for: "20-40s", do: "They read a notice on the wall." },
        { go: "hallMid", activity: "walk", do: "They head back." },
      ],
    },
    {
      time: "12:52",
      title: "Back to the desk",
      chapter: "lunch",
      steps: [
        { chance: 0.55, at: "hallMid", hand: "nod", for: "1.5-3m", activity: "stand", body: { boredom: -0.2 }, do: ["A coworker in the hall. A little small talk.", "They talk about the weekend."] },
        { go: "officeDoorOut", do: "They walk back to the office." },
        { go: "desk", do: "Back to the desk." },
        { at: "desk", pose: "sitChair", for: "3-5s", do: "They sit." },
        { at: "desk", pose: "sitChair", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "30s-1m" }, do: ["A few minutes of lunch left. Phone.", "They scroll."] },
        { at: "desk", pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "face down on the desk" }, do: "Phone down." },
      ],
    },
    {
      time: "12:58",
      title: "Wake the computer",
      chapter: "lunch",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "10-20s", set: { workScreen: "on" }, do: "They wake the computer. It takes a moment." },
        { at: "desk", pose: "sitChair", hand: "type", for: "5-10s", do: "Password. They're back in." },
        { at: "desk", pose: "sitChair", hand: "type", fill: true, micro: { pools: ["computer"], every: "30s-1m" }, do: "They look over where they left off." },
      ],
    },

    /* ======================= AFTERNOON ======================= */
    { time: "13:00", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "13:35",
      title: "To the meeting room",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "2-4s", set: { workScreen: "locked" }, do: "They lock the screen." },
        { at: "desk", pose: "stand", for: "2-3s", do: "They stand." },
        { go: "meetSeat", do: "They walk to the meeting room." },
        { at: "meetSeat", pose: "sitChair", for: "3-5s", do: "They sit." },
        { at: "meetSeat", pose: "sitChair", hand: "phone", fill: true, do: "Nobody else is here yet. They wait with the phone." },
      ],
    },
    {
      time: "13:37",
      title: "Meeting",
      chapter: "work",
      steps: [
        { at: "meetSeat", pose: "sitChair", hand: "none", for: "5-10s", set: { meeting: "on" }, do: "The other person sits down." },
        { at: "meetSeat", pose: "sitChair", hand: "none", fill: true, activity: "work", body: { stress: +0.05, boredom: +0.1 },
          micro: { pools: ["meeting"], every: "1-3m" }, do: ["The meeting.", "Someone else talks.", "They talk for a minute.", "The meeting goes on."] },
      ],
    },
    {
      time: "13:52",
      title: "Back from the meeting",
      chapter: "work",
      steps: [
        { at: "meetSeat", pose: "stand", for: "2-4s", set: { meeting: "off" }, do: "It ends. They stand." },
        { go: "desk", do: "They walk back." },
        { at: "desk", pose: "sitChair", hand: "type", for: "4-8s", set: { workScreen: "on" }, do: "They sit and unlock the screen." },
        { at: "desk", pose: "sitChair", hand: "type", fill: true, do: "They type up a few notes from the meeting." },
      ],
    },
    { time: "13:54", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "14:20",
      title: "Bathroom and water, one walk",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", for: "2-4s", set: { workScreen: "locked" }, do: "They lock the screen." },
        { at: "desk", pose: "stand", for: "2-3s", do: "They stand." },
        { go: "toiletW", do: "They walk to the bathroom." },
        { at: "toiletW", pose: "toilet", for: "2-3m", body: { bladder: -1 }, do: "They use the toilet. Adjust their clothes." },
        { at: "toiletW", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkW", hand: "wash", for: "20-35s", do: "They wash and dry their hands." },
        { go: "breakWater", do: "They walk to the break room." },
        { at: "breakWater", hand: "drink", for: "15-30s", set: { deskGlass: "full" }, body: { thirst: -0.15 }, do: "They fill the water." },
        { chance: 0.4, at: "breakWater", hand: "nod", for: "20-60s", do: "A coworker is there. A short hello." },
        { at: "breakWater", hand: "phone", fill: true, micro: { pools: ["phone"], every: "20-40s" }, do: ["They drink a little and check the phone.", "They stretch their back."] },
        { go: "desk", hand: "drink", do: "They walk back to the desk." },
        { at: "desk", pose: "sitChair", hand: "type", for: "4-8s", set: { workScreen: "on" }, do: "They sit and unlock the screen." },
      ],
    },
    { time: "14:28", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "15:15",
      title: "Snack and a text",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "eat", for: "2-3m", body: { hunger: -0.1, energy: +0.03 }, do: "A snack." },
        { pose: "sitChair", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "30s-1m" }, do: ["Phone. One text.", "They read the reply."] },
        { pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "face down on the desk" }, do: "Phone down." },
      ],
    },
    { time: "15:22", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "16:05",
      title: "Call at the desk",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "phone", for: "3-6s", set: { headphones: "on" }, do: "A call. They pick up." },
        { pose: "sitChair", hand: "none", fill: true, activity: "work", body: { stress: +0.04 }, micro: { pools: ["call"], every: "1-3m" },
          do: ["On a call at the desk.", "They listen and take notes.", "They answer a question."] },
        { pose: "sitChair", hand: "type", for: "5-10s", set: { headphones: "off" }, do: "The call ends. Back to the keyboard." },
      ],
    },
    { time: "16:18", title: "Work", chapter: "work", steps: [WORK] },
    {
      time: "17:20",
      title: "Bathroom",
      chapter: "work",
      steps: [
        { at: "desk", pose: "stand", for: "2-3s", set: { workScreen: "locked" }, do: "They stand." },
        { go: "toiletW", do: "They walk to the bathroom." },
        { at: "toiletW", pose: "toilet", fill: true, body: { bladder: -1 }, do: "They use the bathroom." },
        { at: "toiletW", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkW", hand: "wash", for: "15-30s", do: "They wash their hands." },
        { go: "desk", do: "Back to the chair." },
        { at: "desk", pose: "sitChair", hand: "type", for: "3-6s", set: { workScreen: "on" }, do: "They sit." },
      ],
    },
    {
      time: "17:24",
      title: "Wrap up",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", fill: true, activity: "work", micro: { pools: ["computer", "desk", "mind"], every: "2-5m" },
          do: ["They clear email.", "A short list for tomorrow.", "They close out a thread.", "They tidy up what's open."] },
      ],
    },
    {
      time: "17:45",
      title: "Pack up",
      chapter: "work",
      steps: [
        { at: "desk", pose: "sitChair", hand: "type", fill: true, micro: { pools: ["computer"], every: "40s-1.5m" }, do: ["One last message before they go.", "They save everything."] },
        { at: "desk", pose: "sitChair", hand: "type", for: "20-40s", set: { workScreen: "off" }, do: "They shut the computer down." },
        { at: "deskStand", hand: "dress", for: "15-30s", set: { carrying: "bag", phone: "pocket" }, do: "Coat on. Bag on the shoulder." },
        { at: "deskStand", hand: "reach", for: "2-4s", do: "They push the chair in." },
        { chance: 0.35, at: "desk", hand: "reach", for: "4-8s", do: "They almost leave the glass. They grab it." },
      ],
    },
    {
      time: "17:52",
      title: "Out of the building",
      chapter: "work",
      steps: [
        { go: "officeDoorOut", hand: "hold", do: "Office door. Into the hall." },
        { chance: 0.5, at: "officeDoorOut", hand: "nod", for: "1-3m", body: { boredom: -0.15 }, do: ["A coworker catches them in the hall. They talk about tomorrow.", "\"Have a good night.\" A little more small talk."] },
        { go: "elevatorCall", hand: "hold", do: "They walk to the elevator." },
        { at: "elevatorCall", hand: "reach", for: "2-3s", do: "They press the button." },
        { at: "elevatorCall", hand: "hold", for: "40s-2m", micro: { pools: ["waiting"], every: "10-25s" }, do: ["They wait for the elevator.", "End of day. It's slow."] },
        { go: "elevatorIn", hand: "hold", do: "They step in." },
        { at: "elevatorIn", hand: "hold", for: "25-45s", do: "They ride down." },
        { go: "entranceOut", hand: "hold", do: "Across the lobby and out the door." },
        { chance: 0.3, at: "entranceOut", for: "5-12s", do: "They look around for the car, then remember the row." },
        { go: "carSideWork", hand: "hold", do: "They walk to the car." },
        { at: "carSideWork", hand: "reach", for: "2-4s", set: { car: "unlocked" }, do: "Unlock." },
        { at: "carSideWork", pose: "sitCar", hand: "hold", for: "8-15s", set: { carrying: "bag on the seat" }, do: "They get in. Bag on the seat." },
        { pose: "sitCar", hand: "phone", fill: true, micro: { pools: ["phone", "mind"], every: "30s-1m" }, do: ["They check messages before driving.", "A minute in the quiet car."] },
      ],
    },

    /* ======================= DRIVE HOME ======================= */
    {
      time: "18:00",
      title: "The drive home",
      chapter: "commute",
      steps: [
        { pose: "sitCar", hand: "reach", for: "4-8s", do: "Seatbelt." },
        { pose: "sitCar", hand: "reach", for: "3-5s", set: { engine: "on" }, do: "They start the car." },
        { pose: "sitCar", hand: "reach", for: "10-20s", do: ["A podcast. They turn it up.", "Music on."] },
        { drive: "backOutWork", reverse: true, for: "15-25s", do: "They back out of the spot." },
        { drive: "lotExit", for: "25-40s", set: { headlights: "on" }, do: "Out of the lot. Headlights on; the sky is getting dim." },
        { drive: "roadWorkW", for: "15-25s", do: "Onto the road." },
        { drive: "signalW", fill: true, micro: { pools: ["driving", "mind"], every: "1.5-4m" }, do: ["The drive home.", "Traffic.", "They follow the car ahead.", "The road home."] },
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
      steps: [{ drive: "roadHomeW", fill: true, micro: DRIVE_MICRO, do: ["The last streets.", "Their street."] }],
    },
    {
      time: "18:48",
      title: "Driveway",
      chapter: "commute",
      steps: [
        { drive: ["drivewayEnd", "parkHome"], for: "40s-1m", do: "Into the driveway. They park." },
        { pose: "sitCar", hand: "reach", for: "3-6s", set: { engine: "off", headlights: "off" }, do: "Engine off. Lights off." },
        { pose: "sitCar", hand: "none", fill: true, micro: { pools: ["phone", "mind"], every: "30s-1m" }, do: ["They sit in the car for a moment.", "The engine ticks as it cools."] },
        { pose: "sitCar", hand: "hold", for: "5-10s", set: { carrying: "bag" }, do: "Bag in hand." },
      ],
    },
    {
      time: "18:52",
      title: "Home",
      chapter: "home",
      steps: [
        { at: "carSideHome", hand: "hold", for: "4-8s", do: "Out of the car." },
        { at: "carSideHome", hand: "reach", for: "2-4s", set: { car: "locked" }, do: "They lock the car." },
        {
          chance: 0.3,
          steps: [
            { go: "mailbox", hand: "hold", do: "They walk to the mailbox." },
            { at: "mailbox", hand: "reach", for: "15-30s", do: "They check the mail. Mostly junk." },
          ],
        },
        { go: "frontDoorOut", hand: "hold", do: "They walk to the front door." },
        { at: "frontDoorOut", hand: "reach", for: "4-10s", set: { frontDoor: "open" }, do: "They find the right key and unlock it." },
        { at: "frontDoorIn", hand: "reach", for: "3-5s", set: { frontDoor: "locked" }, do: "Inside. They lock the door." },
        { at: "frontDoorIn", hand: "reach", for: "10-20s", do: "Shoes off." },
        { at: "entryTable", hand: "reach", for: "10-20s", set: { carrying: "nothing", livingLight: "on", kitchenLight: "on" }, do: "Bag down. Keys in their spot. Lights on." },
        { chance: 0.3, at: "frontDoorIn", hand: "reach", for: "2-4s", do: "They check the lock again." },
        { at: "kitchenSink", hand: "wash", for: "15-30s", do: "They wash their hands at the kitchen sink." },
        { at: "kitchenSink", hand: "drink", for: "15-30s", body: { thirst: -0.3 }, do: "A glass of water." },
        {
          chance: 0.45,
          steps: [
            { go: "bedEdge", do: "They go change out of work clothes." },
            { at: "bedEdge", hand: "dress", for: "1-1.8m", set: { outfit: "home" }, do: "Something comfortable." },
          ],
        },
        { go: "couch", do: "They walk to the couch." },
        { at: "couch", pose: "sitCouch", for: "3-5s", do: "They sit." },
        { at: "couch", pose: "sitCouch", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "30s-1m" }, do: ["They sink into the couch with the phone.", "A minute of nothing."] },
      ],
    },

    /* ======================= EVENING ======================= */
    {
      time: "19:00",
      title: "Television",
      chapter: "tv",
      steps: [
        { at: "couch", pose: "sitCouch", hand: "reach", for: "2-4s", set: { phone: "on the cushion" }, do: "Phone down." },
        { at: "couch", pose: "sitCouch", hand: "remote", for: "10-25s", set: { tv: "on" }, do: "They find the remote. Television on." },
        { chance: 0.5, pose: "sitCouch", hand: "remote", for: "1.5-4m", do: ["They scroll the streaming options.", "Nothing looks good. They keep scrolling."] },
        WATCH_TV,
      ],
    },
    {
      time: "19:35",
      title: "Texting on the couch",
      chapter: "tv",
      steps: [
        { at: "couch", pose: "sitCouch", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "40s-1.5m" },
          do: ["Phone out. A text thread.", "They type a reply.", "They wait for the reply."] },
        { pose: "sitCouch", hand: "reach", for: "2-4s", set: { phone: "on the cushion" }, do: "Phone on the cushion." },
      ],
    },
    { time: "19:42", title: "Television", chapter: "tv", steps: [WATCH_TV] },
    {
      time: "19:58",
      title: "Volume down",
      chapter: "tv",
      steps: [
        { at: "couch", pose: "sitCouch", hand: "none", fill: true, do: "They watch until the scene ends." },
        { at: "couch", pose: "sitCouch", hand: "remote", for: "3-6s", do: "Volume down." },
        { at: "couch", pose: "stand", for: "2-3s", set: { phone: "pocket" }, do: "They stand." },
      ],
    },
    {
      time: "20:00",
      title: "Cook",
      chapter: "dinner",
      steps: [
        { go: "fridge", set: { kitchenLight: "on" }, do: "They walk to the kitchen." },
        { at: "fridge", hand: "reach", for: "15-30s", set: { fridge: "open" }, do: ["They open the fridge and look.", "They sniff a container."] },
        {
          chance: 0.45,
          steps: [
            { at: "fridge", hand: "reach", for: "2-4s", set: { fridge: "closed" }, do: "They close it. Not sure." },
            { at: "fridge", for: "5-12s", do: "They think about it." },
            { at: "fridge", hand: "reach", for: "8-15s", set: { fridge: "open" }, do: "They open it again and pick something." },
          ],
        },
        { at: "fridge", hand: "hold", for: "5-10s", set: { fridge: "closed" }, do: "Food out. They close the fridge." },
        { at: "stove", hand: "reach", for: "8-15s", set: { stove: "on" }, do: "One pan. Burner on." },
        { at: "stove", hand: "cook", fill: true, activity: "stand", micro: { pools: ["kitchen"], every: "1-3m" }, do: ["They cook.", "They stir.", "It sizzles.", "They wait for it."] },
        { at: "stove", hand: "reach", for: "2-4s", set: { stove: "off" }, do: "Burner off." },
        { at: "stove", hand: "cook", for: "15-30s", do: "Onto a plate." },
        {
          chance: 0.35,
          steps: [
            { go: "dinnerSeat", hand: "hold", do: "They carry the plate to the table." },
            { at: "dinnerSeat", for: "2-4s", do: "No fork." },
            { go: "kitchenSink", do: "Back to the kitchen." },
            { at: "kitchenSink", hand: "reach", for: "5-10s", do: "They open the wrong drawer, then the right one." },
          ],
        },
        { at: "kitchenSink", hand: "reach", for: "3-5s", do: "A fork." },
        { go: "dinnerSeat", hand: "hold", do: "They carry the plate to the table." },
        { at: "dinnerSeat", pose: "sitChair", for: "3-5s", do: "They sit." },
      ],
    },
    {
      time: "20:20",
      title: "Eat",
      chapter: "dinner",
      steps: [
        { at: "dinnerSeat", pose: "sitChair", hand: "eat", fill: true, body: { hunger: -0.7, stress: -0.05 }, micro: { pools: ["eating", "mind"], every: "1.5-4m" },
          do: ["They eat.", "Dinner.", "They eat and look at nothing in particular."] },
      ],
    },
    {
      time: "20:42",
      title: "Clean up, back to the show",
      chapter: "dinner",
      steps: [
        { at: "dinnerSeat", pose: "stand", for: "2-4s", do: "They stand with the plate." },
        { at: "kitchenSink", hand: "wash", for: "40s-1.2m", do: "They scrape the plate and rinse it." },
        { at: "kitchenSink", hand: "reach", for: "5-10s", do: "The pan goes in the sink." },
        { chance: 0.5, at: "kitchenSink", for: "4-8s", do: "The rest of the dishes can wait. They're too tired." },
        { at: "stove", hand: "wash", for: "30-50s", do: "They wipe the counter." },
        { at: "fridge", hand: "reach", for: "4-6s", set: { fridge: "open" }, do: "Leftovers into the fridge." },
        { at: "fridge", hand: "reach", for: "10-25s", do: "They move things around to make room." },
        { at: "fridge", hand: "reach", for: "2-3s", set: { fridge: "closed" }, do: "They close it." },
        { at: "stove", for: "2-4s", do: "They glance at the stove. It's off." },
        { at: "stove", hand: "reach", for: "1-2s", set: { kitchenLight: "off" }, do: "Kitchen light off." },
        { go: "couch", do: "Back to the couch. The show is still on." },
        { at: "couch", pose: "sitCouch", for: "3-5s", do: "They sit." },
        { at: "couch", pose: "sitCouch", hand: "none", fill: true, micro: { pools: ["couch", "phone"], every: "2-5m" }, do: ["They watch a bit more.", "Full. They sink into the couch."] },
        { at: "couch", pose: "sitCouch", hand: "remote", for: "3-5s", set: { tv: "off" }, do: "Television off." },
        { at: "couch", pose: "stand", for: "2-3s", do: "They get up." },
        { go: "pcChair", do: "They walk to the computer." },
        { at: "pcChair", pose: "sitChair", for: "3-5s", do: "They sit." },
        {
          chance: 0.4,
          steps: [
            { at: "pcChair", pose: "stand", for: "2-3s", do: "They stand again. They forgot water." },
            { go: "kitchenSink", do: "Back to the kitchen." },
            { at: "kitchenSink", hand: "drink", for: "15-30s", body: { thirst: -0.2 }, do: "A glass of water." },
            { go: "pcChair", hand: "drink", do: "Back to the computer." },
            { at: "pcChair", pose: "sitChair", for: "3-5s", do: "They sit." },
          ],
        },
      ],
    },
    {
      time: "21:00",
      title: "Computer",
      chapter: "computer",
      steps: [
        { at: "pcChair", pose: "sitChair", hand: "type", for: "10-20s", set: { pc: "on" }, do: "They open it." },
        { at: "pcChair", pose: "sitChair", hand: "none", for: "10-30s", do: "They wait for it to wake." },
        { pose: "sitChair", hand: "type", fill: true, activity: "sit", body: { boredom: -0.3 }, micro: { pools: ["computer", "mind", "phone"], every: "2-6m" },
          do: ["On the computer.", "They read an article.", "A video.", "They browse.", "They look something up."] },
      ],
    },
    {
      time: "21:25",
      title: "A personal call",
      chapter: "computer",
      steps: [
        { at: "pcChair", pose: "sitChair", hand: "phone", for: "3-6s", set: { phone: "in hand" }, do: "The phone rings. They answer." },
        { at: "pcChair", pose: "sitChair", hand: "phone", fill: true, body: { stress: -0.06, boredom: -0.2 },
          micro: { pools: ["personalCall"], every: "40s-1.5m" }, do: ["A short personal call.", "They laugh at something on the call.", "They catch up.", "They listen."] },
        { pose: "sitChair", hand: "reach", for: "2-4s", set: { phone: "on the desk" }, do: "Call over. Back to the computer." },
      ],
    },
    {
      time: "21:32",
      title: "Messages",
      chapter: "computer",
      steps: [
        { at: "pcChair", pose: "sitChair", hand: "type", fill: true, micro: { pools: ["computer", "mind"], every: "2-5m" },
          do: ["A few messages.", "They finish whatever was open.", "They write a message, erase half, and write it again."] },
      ],
    },
    {
      time: "21:50",
      title: "Close the computer",
      chapter: "computer",
      steps: [
        { at: "pcChair", pose: "sitChair", hand: "type", fill: true, micro: { pools: ["computer"], every: "1-2m" }, do: ["They finish what they were reading.", "One more video. A short one."] },
        { at: "pcChair", pose: "sitChair", hand: "type", for: "10-20s", do: "They close the tabs." },
        { at: "pcChair", pose: "sitChair", hand: "reach", for: "2-4s", set: { pc: "off", phone: "pocket" }, do: "They close the computer." },
        { at: "pcChair", pose: "stand", for: "2-3s", do: "They stand." },
      ],
    },
    {
      time: "21:55",
      title: "Teeth, pajamas",
      chapter: "computer",
      steps: [
        { go: "toilet", set: { livingLight: "off" }, do: "Living room light off. They go to the bathroom." },
        { at: "toilet", hand: "reach", for: "1-2s", set: { bathroomLight: "on" }, do: "Light on." },
        { at: "toilet", pose: "toilet", for: "45s-1.2m", body: { bladder: -1 }, do: "They use the toilet." },
        { at: "toilet", pose: "stand", hand: "reach", for: "3-5s", do: "Flush." },
        { at: "sinkHome", hand: "brush", for: "1.2-2m", do: "They brush their teeth." },
        { at: "bathCenter", hand: "dress", fill: true, set: { outfit: "sleep" }, do: "They change into what they sleep in." },
      ],
    },
    {
      time: "21:58",
      title: "To the bedroom",
      chapter: "computer",
      steps: [
        { at: "bathCenter", hand: "reach", for: "1-2s", set: { bathroomLight: "off" }, do: "Bathroom light off." },
        { go: "bedEdge", do: "They walk to the bedroom." },
        { at: "bedEdge", hand: "reach", for: "2-4s", set: { bedroomLamp: "on" }, do: "Lamp on." },
        { at: "bedEdge", pose: "sitBed", fill: true, hand: "phone", set: { phone: "in hand" }, micro: { pools: ["phone"], every: "20-40s" }, do: "They sit on the edge of the bed with the phone." },
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
        { chance: 0.5, pose: "recline", hand: "remote", for: "1-3m", do: ["They start a show and decide it's not the one.", "They scroll for something to watch."] },
        WATCH_IN_BED,
      ],
    },
    {
      time: "22:35",
      title: "Last text, alarm, charger",
      chapter: "bedtime",
      steps: [
        { at: "bed", pose: "recline", hand: "phone", fill: true, set: { phone: "in hand" }, micro: { pools: ["phone"], every: "40s-1.2m" }, do: ["The phone. One last text.", "They read the reply."] },
        { pose: "recline", hand: "phone", for: "10-20s", set: { alarm: "set for 7:30" }, do: "They check the alarm. 7:30." },
        { chance: 0.4, pose: "recline", hand: "phone", for: "4-8s", do: "They check the alarm again." },
        { pose: "recline", hand: "reach", for: "5-10s", set: { phone: "nightstand, charging" }, do: "They plug the phone in on the nightstand." },
      ],
    },
    { time: "22:42", title: "Television in bed", chapter: "bedtime", steps: [WATCH_IN_BED] },
    {
      time: "22:52",
      title: "Out of bed, bathroom, back",
      chapter: "bedtime",
      steps: [
        { at: "bedEdge", pose: "sitBed", for: "3-6s", do: "Out of bed." },
        { go: "toilet", do: "They go to the bathroom." },
        { at: "toilet", hand: "reach", for: "1-2s", set: { bathroomLight: "on" }, do: "Light on." },
        { at: "toilet", pose: "toilet", fill: true, body: { bladder: -1 }, do: "They use the toilet." },
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
        { at: "bed", pose: "recline", for: "20-50s", micro: { pools: ["bedAwake"], every: "15-30s" }, do: "They lie there in the lamplight." },
      ],
    },
    {
      time: "22:58",
      title: "Lamp off",
      chapter: "bedtime",
      steps: [
        { at: "bed", pose: "lie", hand: "reach", for: "3-6s", set: { bedroomLamp: "off" }, do: "Lamp off." },
        { at: "bed", pose: "lie", fill: true, do: "They lie down in the dark." },
      ],
    },

    /* ======================= NIGHT ======================= */
    {
      time: "23:00",
      title: "Falling asleep",
      chapter: "sleep",
      steps: [
        { at: "bed", pose: "$sleepPose", for: "6-35m", activity: "rest", micro: { pools: ["fallingAsleep"], every: "1-4m" },
          do: ["They try to fall asleep.", "Eyes closed. Not asleep yet.", "Drifting."] },
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
        { at: "bed", pose: "lie", for: "15-40s", activity: "rest", do: "They wake. They need the bathroom." },
        { at: "bedEdge", pose: "sitBed", for: "5-15s", set: { blanket: "down" }, do: "They sit up in the dark." },
        { go: "toilet", do: "Half asleep, they walk to the bathroom." },
        { at: "toilet", hand: "reach", for: "1-2s", set: { bathroomLight: "on" }, do: "Light on. Too bright." },
        { at: "toilet", pose: "toilet", for: "1-2m", body: { bladder: -1 }, do: "They use the toilet." },
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
      { do: "They check the time.", for: "2-4s", hand: "phone" },
      { do: "They look around.", for: "3-6s" },
      { do: "They pat their pockets.", for: "2-4s", hand: "face" },
      { do: "A yawn.", for: "3-5s", hand: "face", likes: { fatigue: 3 } },
      { do: "They scratch their head.", for: "2-4s", hand: "face" },
      { do: "They stretch their neck.", for: "4-8s", hand: "face" },
      { do: "A sigh.", for: "2-4s", likes: { stress: 2 } },
      { do: "They glance at the phone.", for: "5-15s", hand: "phone", weight: 2 },
      { do: "They think about what's next.", for: "5-12s" },
      { do: "They hum something.", for: "5-15s", likes: { boredom: 1 } },
      { do: "They straighten their shirt.", for: "2-4s", hand: "dress" },
    ],

    personalCall: [
      { do: "They get up from the chair, pace a few steps, and sit again.", for: "15-30s", pose: "stand" },
      { do: "\"Hang on.\" They look something up for the call.", for: "15-30s", hand: "type", max: 1 },
      { do: "They switch the phone to the other ear.", for: "2-4s" },
      { do: "A long laugh.", for: "4-8s" },
      { do: "They lean back in the chair.", for: "5-10s", hand: "phone" },
    ],

    groggy: [
      { do: "They rub their eyes.", for: "3-6s", hand: "face" },
      { do: "A big yawn.", for: "3-5s", hand: "face" },
      { do: "They stretch their arms.", for: "4-8s", hand: "stretch" },
      { do: "They stare at the floor.", for: "8-20s" },
      { do: "They scratch their head.", for: "2-4s", hand: "face" },
      { do: "They look at the window. Bright already.", for: "4-8s", max: 1 },
    ],

    shower: [
      { do: "They let the water run over their face.", for: "15-40s", hand: "face" },
      { do: "Shampoo.", for: "40s-1m", hand: "towel", max: 1 },
      { do: "They turn the water a little hotter.", for: "3-5s", hand: "reach" },
      { do: "Soap. Rinse.", for: "40s-1m", hand: "wash" },
      { do: "They just stand there in the hot water.", for: "20-60s", hand: "none", likes: { fatigue: 2 } },
    ],
    desk: [
      { do: "They stand, stretch their arms overhead, and sit back down.", for: "10-20s", pose: "stand", hand: "stretch", likes: { fatigue: 1 }, body: { stress: -0.02 } },
      { do: "They roll their shoulders and crack their knuckles.", for: "5-10s", hand: "stretch" },
      { do: "They stretch their neck.", for: "5-10s", hand: "face" },
      { do: "They shift in the chair.", for: "3-6s" },
      { do: "They cross their legs, then uncross them.", for: "4-8s" },
      { do: "They scoot the chair closer to the desk.", for: "3-5s" },
      { do: "They rub their eyes.", for: "3-6s", hand: "face", likes: { fatigue: 3 } },
      { do: "A yawn.", for: "3-5s", hand: "face", likes: { fatigue: 4 } },
      { do: ["A sigh.", "A deep breath."], for: "3-6s", likes: { stress: 2 } },
      { do: "They stare into space.", for: "10-30s", hand: "none", likes: { boredom: 3, fatigue: 1 } },
      { do: "They stare at the monitor and take nothing in.", for: "15-40s", hand: "none", likes: { fatigue: 3 } },
      { do: "They read the same sentence twice.", for: "8-15s", likes: { fatigue: 2 } },
      { do: "They reach for the water. The glass is empty. They put it back.", for: "4-8s", hand: "reach", when: { deskGlass: "empty" }, likes: { thirst: 3 } },
      { do: "A sip of water.", for: "5-10s", hand: "drink", when: { deskGlass: "full" }, set: { deskGlass: "half" }, body: { thirst: -0.15 }, likes: { thirst: 4 }, weight: 2 },
      { do: "Another sip. The glass is empty now.", for: "5-10s", hand: "drink", when: { deskGlass: "half" }, set: { deskGlass: "empty" }, body: { thirst: -0.15 }, likes: { thirst: 4 }, weight: 2 },
      { do: "They check the time for no particular reason.", for: "2-4s" },
      { do: "They pick up the phone, unlock it, and lock it again.", for: "4-8s", hand: "phone" },
      { do: ["They drum their fingers on the desk.", "They tap the desk, then stop."], for: "5-12s", likes: { boredom: 2 } },
      { do: "They bounce a knee, then notice and stop.", for: "6-15s", likes: { stress: 2 } },
      { do: "They fidget with a pen.", for: "8-20s", hand: "hold", likes: { boredom: 2 } },
      { do: "They scratch their head.", for: "3-5s", hand: "face" },
      { do: "A notification from someone else's phone. They glance around.", for: "3-6s" },
      { do: "A coworker's conversation. They listen for a moment.", for: "10-25s", hand: "none" },
      { do: "They adjust the chair height.", for: "10-20s", hand: "reach", max: 1 },
      { do: "They nudge the monitor.", for: "4-8s", hand: "reach", max: 2 },
      { do: "They finish a task and spend a minute deciding what's next.", for: "40s-1.3m", hand: "none" },
      { do: "They re-read a document. Concentration slipped.", for: "30s-1m", likes: { fatigue: 2 } },
      { do: "A typo. They notice it and fix it.", for: "3-6s", weight: 2 },
      { do: "They run a check, wait for the result, and look over the output.", for: "1-2m" },
      { do: "An error. They try the same thing again.", for: "20-50s", body: { stress: +0.04 }, likes: { stress: 1 } },
      { do: "They search for a file they had open a minute ago.", for: "30s-1.5m" },
      { do: "They save. Then they save again.", for: "3-6s" },
      { do: "Frustrated. They stop, sigh, and start again.", for: "10-20s", hand: "face", body: { stress: -0.03 }, likes: { stress: 3 } },
      { do: "Sleepy after lunch. They blink hard and keep going.", for: "15-30s", hand: "face", after: "13:00", before: "15:30", likes: { fatigue: 3 } },
      { do: "They feel the urge for the bathroom and decide it can wait.", for: "3-6s", when: { bladder: ">0.45" }, likes: { bladder: 4 } },
      { do: "Thirsty. They'll get water later.", for: "3-5s", when: { thirst: ">0.55" }, likes: { thirst: 2 } },
      { do: "Hungry. Not yet.", for: "3-5s", when: { hunger: ">0.6" }, likes: { hunger: 2 } },
      { do: "Motivated for a minute. They start the next thing early.", for: "20-40s", when: { energy: ">0.6" } },
      {
        do: "They walk to the window, look out, and come back.",
        max: 1,
        steps: [
          { go: "officeWindow", do: "They get up and walk to the window." },
          { at: "officeWindow", for: "20-40s", do: "They look out the window." },
          { go: "$back", do: "Back to the chair." },
        ],
      },
    ],

    computer: [
      { do: "They switch tabs to something that isn't work.", for: "20s-1m", likes: { boredom: 3 }, body: { boredom: -0.1 } },
      { do: "They copy something, forget to paste it, and copy it again.", for: "8-15s" },
      { do: "They save a file in the wrong place and go looking for it.", for: "40s-1.5m", max: 1 },
      { do: "They close the wrong tab and reopen it.", for: "5-10s" },
      { do: "They wait for a page to load.", for: "5-15s", hand: "none" },
      { do: "The connection drops. They retry.", for: "15-30s", max: 1, body: { stress: +0.03 } },
      { do: "They mistype a password and enter it again.", for: "6-10s", max: 1 },
      { do: "They dismiss an update reminder.", for: "2-4s", max: 1 },
      { do: "They switch between two windows without doing anything.", for: "6-12s" },
      { do: "They start a message, erase it, and rewrite it.", for: "30s-1m" },
      { do: "They read a message and decide to answer it later.", for: "10-20s" },
    ],

    phone: [
      { do: "A notification. They check it and don't reply.", for: "5-15s", hand: "phone" },
      { do: "They unlock the phone and forget why.", for: "4-10s", hand: "phone" },
      { do: "They open a notification, read it, and go back.", for: "10-30s", hand: "phone" },
      { do: "They swipe a notification away.", for: "2-4s", hand: "phone" },
      { do: "They check the battery.", for: "3-5s", hand: "phone" },
      { do: "They turn the screen on to check the time.", for: "2-4s", hand: "phone" },
      { do: "They switch between two apps and get nothing done.", for: "15-40s", hand: "phone", likes: { boredom: 2 } },
      { do: "They start a message, erase it, and write it again.", for: "30s-1.2m", hand: "phone" },
      { do: "They check for a reply. Nothing yet.", for: "4-8s", hand: "phone" },
      { do: "The camera opens by accident. They close it.", for: "3-6s", hand: "phone", max: 1 },
      { do: "They search for something, get pulled into another result, and drop it.", for: "1-2.5m", hand: "phone", max: 2 },
      { do: "Low battery. They dismiss the warning.", for: "2-4s", hand: "phone", after: "16:00", max: 1 },
      { do: "The app won't load. They try again.", for: "10-25s", hand: "phone", max: 1 },
      { do: "They open an app out of habit, scroll a little, and close it.", for: "20-50s", hand: "phone", likes: { boredom: 3 }, body: { boredom: -0.08 } },
    ],

    mind: [
      { do: "They remember an unfinished task.", for: "4-8s", hand: "none" },
      { do: "They worry about a deadline.", for: "8-20s", hand: "none", body: { stress: +0.05 }, likes: { stress: 2 } },
      { do: "They rehearse a conversation they haven't had yet.", for: "15-40s", hand: "none" },
      { do: "They replay an awkward moment from earlier.", for: "10-20s", hand: "none", body: { stress: +0.02 } },
      { do: "Something embarrassing from years ago surfaces.", for: "5-10s", hand: "face", max: 1 },
      { do: "A short daydream.", for: "20s-1m", hand: "none", likes: { boredom: 3 } },
      { do: "They lose track of time.", for: "1-2m", hand: "none", max: 1, likes: { boredom: 2 } },
      { do: "They forget what they were about to do.", for: "5-10s", hand: "none" },
      { do: "They make a small decision, reconsider it, and reverse it.", for: "10-20s", hand: "none" },
      { do: "They notice the room is a little cold.", for: "3-6s", hand: "none", max: 1 },
      { do: "They think of something to buy, search for it, and give up.", for: "1-2m", hand: "phone", max: 1 },
      { do: "They remember a personal errand.", for: "5-10s", hand: "none" },
      { do: "Tired. They think about a nap.", for: "5-10s", hand: "face", when: { energy: "<0.4" }, likes: { fatigue: 3 } },
    ],

    waiting: [
      { do: "They press the button again.", for: "3-5s", hand: "reach" },
      { do: "They look up at the numbers.", for: "5-10s" },
      { do: "They check the phone while they wait.", for: "8-15s", hand: "phone" },
      { do: "They shift their bag to the other shoulder.", for: "3-6s", hand: "hold" },
    ],

    call: [
      { do: "They unmute, realize they were muted, and say it again.", for: "6-12s", hand: "reach", max: 1 },
      { do: "\"Can you hear me?\" They check the microphone.", for: "8-15s", hand: "face", max: 1 },
      { do: "They wait for someone else to join.", for: "30s-1m", before: "10:45", max: 1 },
      { do: "They ask them to repeat that.", for: "5-10s" },
      { do: "They read a message while listening.", for: "15-30s", hand: "type" },
      { do: "They take notes, then stop taking notes.", for: "30s-1m", hand: "type" },
      { do: "They glance at the clock.", for: "2-4s" },
      { do: "They nod at nobody.", for: "3-6s", hand: "nod" },
      { do: "They mute themselves and sigh.", for: "4-8s", hand: "reach", likes: { stress: 2 } },
    ],

    meeting: [
      { do: "They wait for the other person to settle in.", for: "20-40s", max: 1 },
      { do: "They take notes, then stop.", for: "30s-1m", hand: "type" },
      { do: "They look at the clock.", for: "2-4s" },
      { do: "They read a message under the table.", for: "10-25s", hand: "phone" },
      { do: "They ask someone to repeat a number.", for: "5-10s" },
      { do: "Their attention drifts. They pull it back.", for: "10-25s", likes: { boredom: 3 } },
      { do: "They nod along.", for: "4-8s", hand: "nod" },
    ],

    eating: [
      { do: "They check the phone between bites.", for: "15-40s", hand: "phone" },
      { do: "They drop the fork and pick it up.", for: "4-8s", hand: "reach", max: 1 },
      { do: "They chew and stare at nothing.", for: "10-25s", hand: "none" },
      { do: "They wipe their mouth.", for: "3-5s", hand: "face" },
      { do: "A drink of water.", for: "5-10s", hand: "drink", body: { thirst: -0.1 } },
      { do: "Too hot. They wait a moment.", for: "15-30s", hand: "none", max: 1 },
    ],

    couch: [
      { do: "They pause the show to answer a message.", for: "40s-1.5m", hand: "phone" },
      { do: "Their attention wandered. They rewind.", for: "10-20s", hand: "remote" },
      { do: "Too loud. They turn it down.", for: "4-8s", hand: "remote", max: 2 },
      { do: "They straighten a cushion.", for: "5-10s", hand: "reach" },
      { do: "They shift on the couch.", for: "4-8s" },
      { do: "They check the time.", for: "2-4s", hand: "phone" },
      { do: "A noise outside. They pause to listen.", for: "4-10s", hand: "none" },
      { do: "They stretch out their legs.", for: "5-10s", hand: "stretch" },
      {
        do: "They walk toward the kitchen, forget why, and come back.",
        max: 1,
        steps: [
          { go: "hallway", do: "They get up and head for the kitchen." },
          { at: "hallway", for: "4-8s", hand: "face", do: "They stop. Why did they get up?" },
          { go: "$back", do: "They go back to the couch." },
        ],
      },
      {
        do: "Fridge. They look. Nothing. They close it.",
        max: 1,
        before: "20:00",
        likes: { hunger: 3, boredom: 2 },
        steps: [
          { go: "fridge", do: "They get up and go to the fridge." },
          { at: "fridge", hand: "reach", for: "15-30s", set: { fridge: "open" }, do: "They open the fridge and look inside." },
          { at: "fridge", for: "3-6s", set: { fridge: "closed" }, do: "They take nothing and close it." },
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
          { go: "counter", do: "They get up for a snack." },
          { at: "counter", hand: "eat", for: "30s-1m", body: { hunger: -0.12 }, do: "A handful of something, eaten standing at the counter." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
      {
        do: "They check the front door lock.",
        max: 1,
        steps: [
          { go: "frontDoorIn", do: "They get up to check the front door." },
          { at: "frontDoorIn", hand: "reach", for: "4-8s", do: "Locked. Of course." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
      {
        do: "They check the thermostat.",
        max: 1,
        steps: [
          { go: "thermostat", do: "They get up and go to the thermostat." },
          { at: "thermostat", hand: "reach", for: "8-15s", do: "They turn it up a degree." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
      {
        do: "They pick something up off the floor and put it in the wrong place.",
        max: 1,
        steps: [
          { go: "livingWindow", do: "Something on the floor. They pick it up." },
          { at: "livingWindow", hand: "reach", for: "5-10s", do: "They put it on the windowsill. Not where it goes." },
          { go: "$back", do: "Back to the couch." },
        ],
      },
    ],

    kitchen: [
      { do: "They taste it.", for: "5-10s", hand: "eat", weight: 2 },
      { do: "They drop a spoon and pick it up.", for: "4-8s", hand: "reach", max: 1 },
      { do: "They search the drawer for the spatula. It's not where it should be.", for: "15-30s", hand: "reach", max: 1 },
      { do: "They open two cabinets looking for the salt.", for: "10-20s", hand: "reach", max: 1 },
      { do: "A little spills. They wipe it up.", for: "10-20s", hand: "wash", max: 1 },
      { do: "They touch the pan and pull their hand back.", for: "2-4s", hand: "reach", max: 1 },
      { do: "They turn the heat down.", for: "3-5s", hand: "reach" },
      { do: "They check it before it's done.", for: "5-10s", hand: "cook" },
      { do: "A bite while they cook.", for: "5-10s", hand: "eat", body: { hunger: -0.05 }, likes: { hunger: 2 } },
      { do: "They notice the dishes in the sink and leave them for later.", for: "3-6s", max: 1 },
      { do: "They wait for it to heat.", for: "20-40s", hand: "none" },
      {
        do: "They forgot an ingredient.",
        max: 1,
        steps: [
          { go: "fridge", do: "They forgot something. Back to the fridge." },
          { at: "fridge", hand: "reach", for: "10-20s", set: { fridge: "open" }, do: "They grab it." },
          { at: "fridge", for: "2-4s", set: { fridge: "closed" }, do: "Fridge closed." },
          { go: "$back", hand: "hold", do: "Back to the stove." },
        ],
      },
    ],

    driving: [
      { do: "They adjust the mirror.", for: "4-8s", hand: "reach", max: 1 },
      { do: "They adjust the air.", for: "4-8s", hand: "reach" },
      { do: "They change the station.", for: "4-8s", hand: "reach" },
      { do: "They glance at the route.", for: "3-5s" },
      { do: "They slow for traffic.", for: "15-40s" },
      { do: "They leave a gap behind the car ahead.", for: "10-20s" },
      { do: "They wait for a pedestrian.", for: "8-15s", max: 1 },
      { do: "They let someone merge.", for: "5-10s" },
      { do: "They hesitate at an intersection.", for: "4-8s", max: 1 },
      { do: "They sing along a little.", for: "15-40s", likes: { boredom: 2 } },
      { do: "A yawn at the wheel.", for: "3-5s", likes: { fatigue: 3 } },
    ],

    bedAwake: [
      { do: "They adjust the pillow.", for: "5-10s", hand: "reach" },
      { do: "They adjust the pillow again.", for: "4-8s", hand: "reach", max: 1 },
      { do: "Too warm. They push the blanket down.", for: "5-10s", hand: "reach", when: { blanket: "up" }, set: { blanket: "down" } },
      { do: "Too cold. They pull the blanket up.", for: "5-10s", hand: "reach", when: { blanket: "down" }, set: { blanket: "up" } },
      { do: "They check the time and count the hours of sleep left.", for: "5-10s", hand: "phone", after: "22:30" },
      { do: "The television is loud. They turn it down.", for: "4-8s", hand: "remote", when: { bedTv: "on" }, max: 1 },
      { do: "They rewind a scene. Attention wandered.", for: "10-20s", hand: "remote", when: { bedTv: "on" } },
      { do: "They pat the blanket for the phone. It's already on the nightstand.", for: "5-10s", hand: "reach", when: { phone: "nightstand, charging" }, max: 1 },
      { do: "An itch. They scratch it.", for: "3-5s", hand: "face" },
    ],

    fallingAsleep: [
      { do: "They roll onto their back.", for: "4-8s", pose: "lie", when: { sleepPose: "side" }, set: { sleepPose: "lie" } },
      { do: "They roll onto their side.", for: "4-8s", pose: "side", when: { sleepPose: "lie" }, set: { sleepPose: "side" } },
      { do: "Their mind is still going. They check the time.", for: "8-15s", pose: "recline", hand: "phone", max: 2 },
      { do: "Too warm. One leg out from under the blanket.", for: "5-10s", hand: "reach", when: { blanket: "up" }, set: { blanket: "down" } },
      { do: "Cold now. They pull the blanket back up.", for: "5-10s", hand: "reach", when: { blanket: "down" }, set: { blanket: "up" } },
      { do: "They flip the pillow to the cool side.", for: "5-10s", hand: "reach", max: 1 },
      { do: "A noise. They listen.", for: "5-12s" },
      { do: "They think about tomorrow.", for: "20-50s", body: { stress: +0.02 } },
    ],

    night: [
      { do: "They roll onto their back.", for: "5-15s", pose: "lie", when: { sleepPose: "side" }, set: { sleepPose: "lie" } },
      { do: "They roll onto their side.", for: "5-15s", pose: "side", when: { sleepPose: "lie" }, set: { sleepPose: "side" } },
      { do: "They wake briefly and settle again.", for: "20s-1.5m", activity: "rest", max: 2 },
      { do: "Too warm. They push the blanket down.", for: "5-10s", hand: "reach", when: { blanket: "up" }, set: { blanket: "down" } },
      { do: "Too cold. They pull the blanket up.", for: "5-10s", hand: "reach", when: { blanket: "down" }, set: { blanket: "up" } },
      { do: "A noise. They listen for a few seconds.", for: "5-15s", activity: "rest", max: 2 },
      { do: "An itch. A tug on the blanket.", for: "3-8s", hand: "reach" },
    ],
  },
};
