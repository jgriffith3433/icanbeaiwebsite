/* ==========================================================================
   Day engine
   Compiles day.config.js into one continuous timeline of actions for a date.
   Each action starts exactly where and when the previous one ended.
   ========================================================================== */
(function (root) {
  "use strict";

  const DEG = Math.PI / 180;
  const EPS = 1e-6;
  const STATS = ["energy", "hunger", "thirst", "bladder", "stress", "boredom"];
  const POSES = ["stand", "walk", "sitChair", "sitCouch", "sitBed", "sitCar", "toilet", "lie", "side", "recline"];
  const HANDS = ["none", "type", "phone", "reach", "stretch", "eat", "drink", "wash", "brush", "hold", "remote", "cook", "wheel", "dress", "towel", "face", "nod"];
  const ACTIVITY_OF_POSE = {
    lie: "rest", side: "rest", recline: "rest", sitCouch: "rest",
    sitChair: "sit", sitBed: "sit", toilet: "sit",
    stand: "stand", walk: "walk", sitCar: "drive",
  };

  /* ---------------- small utilities ---------------- */

  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* "7:30" -> minutes. Times earlier than dayStart belong to the night after. */
  function parseClock(text, dayStart) {
    if (typeof text === "number") return text;
    const m = /^\s*(\d{1,2}):(\d{2})\s*(am|pm)?\s*$/i.exec(String(text || ""));
    if (!m) return NaN;
    let h = Number(m[1]);
    const min = Number(m[2]);
    if (m[3]) {
      const pm = m[3].toLowerCase() === "pm";
      if (h === 12) h = pm ? 12 : 0;
      else if (pm) h += 12;
    }
    let total = h * 60 + min;
    if (dayStart != null && total < dayStart) total += 1440;
    return total;
  }

  /* "45s" "3m" "2-4m" "30s-1m" "1.5h" -> [lo, hi] in minutes */
  function parseDur(text) {
    if (text == null) return null;
    if (typeof text === "number") return [text, text];
    const s = String(text).trim().toLowerCase();
    const m = /^(\d*\.?\d+)\s*(s|m|h)?\s*(?:-\s*(\d*\.?\d+)\s*(s|m|h)?)?$/.exec(s);
    if (!m) return null;
    const unit2 = m[4] || m[2] || "m";
    const unit1 = m[2] || unit2;
    const scale = (u) => (u === "s" ? 1 / 60 : u === "h" ? 60 : 1);
    const lo = Number(m[1]) * scale(unit1);
    const hi = m[3] != null ? Number(m[3]) * scale(unit2) : lo;
    return [Math.min(lo, hi), Math.max(lo, hi)];
  }

  function fmtClock(minutes, withSeconds) {
    let m = ((minutes % 1440) + 1440) % 1440;
    let h = Math.floor(m / 60);
    const mm = Math.floor(m % 60);
    const ss = Math.floor((m * 60) % 60);
    const am = h < 12;
    h = h % 12 || 12;
    const pad = (n) => String(n).padStart(2, "0");
    return h + ":" + pad(mm) + (withSeconds ? ":" + pad(ss) : "") + " " + (am ? "AM" : "PM");
  }

  function pathInfo(path) {
    if (path._cum) return path;
    const cum = [0];
    for (let i = 1; i < path.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    }
    path._cum = cum;
    path._len = cum[cum.length - 1];
    return path;
  }

  function along(path, f) {
    pathInfo(path);
    const n = path.length;
    if (n === 1 || path._len < EPS) {
      const a = path[0];
      const b = path[n - 1];
      return { x: b.x, z: b.z, yaw: n > 1 ? Math.atan2(b.x - a.x, b.z - a.z) : 0 };
    }
    const d = Math.max(0, Math.min(1, f)) * path._len;
    let i = 1;
    while (i < n - 1 && path._cum[i] < d) i++;
    const a = path[i - 1];
    const b = path[i];
    const seg = path._cum[i] - path._cum[i - 1];
    const t = seg < EPS ? 1 : (d - path._cum[i - 1]) / seg;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  /* ---------------- places ---------------- */

  function buildPlaces(cfg, errors) {
    const spots = {};
    const rooms = {};
    const buildings = cfg.buildings || {};
    Object.entries(cfg.rooms || {}).forEach(([rid, r]) => {
      const bid = r.building || "home";
      const b = buildings[bid];
      if (!b) errors.push(`Room "${rid}" says building "${bid}", but there is no such building.`);
      const o = (b && b.origin) || [0, 0];
      rooms[rid] = {
        id: rid,
        label: r.label || rid,
        building: bid,
        light: r.light || null,
        floor: r.floor || null,
        camera: r.camera || null,
        area: r.area ? [r.area[0] + o[0], r.area[1] + o[1], r.area[2] + o[0], r.area[3] + o[1]] : null,
        doors: (r.doors || []).map((d) => ({ x: d[0] + o[0], z: d[1] + o[1] })),
      };
      Object.entries(r.spots || {}).forEach(([sid, s]) => {
        if (spots[sid]) errors.push(`Spot "${sid}" is defined twice (in "${spots[sid].room}" and "${rid}").`);
        if (!Array.isArray(s) || s.length < 2) {
          errors.push(`Spot "${sid}" in room "${rid}" should look like [x, z, faceDegrees].`);
          return;
        }
        spots[sid] = { id: sid, x: s[0] + o[0], z: s[1] + o[1], face: (s[2] || 0) * DEG, room: rid };
      });
    });
    return { spots, rooms };
  }

  /* ---------------- build a day ---------------- */

  function build(cfg, dateKey) {
    const errors = [];
    const warnings = [];
    const dayStart = parseClock(cfg.dayStart || "7:30");
    const dayEnd = dayStart + 1440;
    const seedText = cfg.seed === "date" || cfg.seed == null ? "date:" + dateKey : "fixed:" + cfg.seed;
    const rng = makeRng(hash(seedText));
    const { spots, rooms } = buildPlaces(cfg, errors);
    const pools = cfg.pools || {};
    const speed = (cfg.person && cfg.person.walkSpeed) || 1.2;
    const driftTable = (cfg.body && cfg.body.drift) || {};
    const statNames = (cfg.body && cfg.body.start && Object.keys(cfg.body.start)) || STATS;
    const reported = new Set();

    function report(msg) {
      if (reported.has(msg)) return;
      reported.add(msg);
      errors.push(msg);
    }

    const sample = (range) => range[0] + (range[1] - range[0]) * (rng() * 0.5 + rng() * 0.5);
    const pick = (v) => (Array.isArray(v) ? v[Math.floor(rng() * v.length)] : v);
    function dur(text, where, fallback) {
      if (text == null) return fallback;
      const r = parseDur(text);
      if (!r) {
        report(`${where}: can't read the duration "${text}". Try "45s", "3m" or "2-4m".`);
        return fallback;
      }
      return r;
    }
    function spot(name, where) {
      if (!name) return null;
      const s = spots[name];
      if (!s) report(`${where}: there is no spot called "${name}".`);
      return s || null;
    }

    /* ---------- runtime state ---------- */
    const thingsInit = {};
    Object.entries(cfg.things || {}).forEach(([k, v]) => {
      thingsInit[k] = v && typeof v === "object" ? v.value : v;
    });
    const startSpot = spots[(cfg.start && cfg.start.at) || "bed"] || Object.values(spots)[0] || { x: 0, z: 0, face: 0, room: null, id: null };
    const carSpot = spots[(cfg.start && cfg.start.car) || "parkHome"] || { x: 0, z: 0, face: 0 };
    const S = {
      t: dayStart,
      x: startSpot.x,
      z: startSpot.z,
      yaw: startSpot.face,
      room: startSpot.room,
      place: startSpot.id,
      pose: "lie",
      inCar: false,
      car: { x: carSpot.x, z: carSpot.z, yaw: carSpot.face },
      things: Object.assign({}, thingsInit),
      body: Object.assign({ energy: 0.7, hunger: 0.4, thirst: 0.4, bladder: 0.5, stress: 0.2, boredom: 0.1 }, (cfg.body && cfg.body.start) || {}),
      uses: {},
    };
    const actions = [];
    let ctx = null; // { block, where, drive, rate }

    function stat(k) {
      if (k === "fatigue") return 1 - (S.body.energy || 0);
      if (k in S.body) return S.body[k];
      return undefined;
    }

    function applySet(set, where) {
      if (!set) return;
      const next = Object.assign({}, S.things);
      Object.entries(set).forEach(([k, v]) => {
        if (!(k in thingsInit)) {
          warnings.push(`${where}: "${k}" isn't listed under things. It was added.`);
          thingsInit[k] = undefined;
        }
        next[k] = v;
      });
      S.things = next;
    }

    function resolvePose(p, where) {
      if (!p) return null;
      if (p[0] === "$") {
        const v = S.things[p.slice(1)];
        if (!v) report(`${where}: pose "${p}" reads things.${p.slice(1)}, which is empty.`);
        return POSES.includes(v) ? v : "stand";
      }
      if (!POSES.includes(p)) report(`${where}: unknown pose "${p}". Use one of: ${POSES.join(", ")}.`);
      return p;
    }

    function routeTo(to) {
      const from = { x: S.x, z: S.z };
      if (S.room === to.room || !rooms[S.room] || !rooms[to.room]) return [from, { x: to.x, z: to.z }];
      const a = rooms[S.room];
      const b = rooms[to.room];
      if (a.building !== b.building) return [from, { x: to.x, z: to.z }];
      const pts = [from].concat(a.doors, b.doors.slice().reverse(), [{ x: to.x, z: to.z }]);
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = out[out.length - 1];
        if (Math.hypot(pts[i].x - p.x, pts[i].z - p.z) > 0.01) out.push(pts[i]);
      }
      return out;
    }

    function walkMinutes(fromState, to) {
      const saved = { x: S.x, z: S.z, room: S.room };
      S.x = fromState.x;
      S.z = fromState.z;
      S.room = fromState.room;
      const len = pathInfo(routeTo(to))._len;
      S.x = saved.x;
      S.z = saved.z;
      S.room = saved.room;
      return len / speed / 60;
    }

    /* Push an action of `d` minutes. `o` describes it. */
    function push(d, o) {
      if (d <= EPS) return;
      const start = S.t;
      const end = start + d;
      const b0 = Object.assign({}, S.body);
      const activity = o.activity || ACTIVITY_OF_POSE[o.pose] || "stand";
      const drift = driftTable[activity] || {};
      if (!driftTable[activity]) report(`${ctx.where}: activity "${activity}" has no drift rates in body.drift.`);
      const b1 = {};
      statNames.forEach((k) => {
        const perHour = drift[k] || 0;
        const perMin = (ctx.rate && ctx.rate[k]) || 0;
        b1[k] = clamp01(b0[k] + (perHour / 60) * d + perMin * d);
      });
      S.body = b1;
      let car = null;
      if (ctx.drive) {
        const D = ctx.drive;
        car = { path: D.path, f0: (start - D.t0) / D.span, f1: (end - D.t0) / D.span, reverse: D.reverse };
      } else {
        car = { x: S.car.x, z: S.car.z, yaw: S.car.yaw };
      }
      actions.push({
        i: actions.length,
        start,
        end,
        text: o.text,
        pose: o.pose,
        hand: o.hand || "none",
        path: o.path || null,
        x: S.x,
        z: S.z,
        yaw: o.yaw != null ? o.yaw : S.yaw,
        room: S.inCar ? "car" : S.room,
        place: S.place,
        inCar: S.inCar,
        car,
        things: S.things,
        b0,
        b1,
        block: ctx.block.title,
        chapter: ctx.block.chapter,
        kind: o.kind || "spine",
      });
      S.t = end;
    }

    function faceFor(step, target) {
      if (typeof step.face === "number") return step.face * DEG;
      if (typeof step.face === "string") {
        const s = spot(step.face, ctx.where);
        if (s) return Math.atan2(s.x - S.x, s.z - S.z);
      }
      if (target) return target.face;
      if (S.place && spots[S.place] && Math.hypot(spots[S.place].x - S.x, spots[S.place].z - S.z) < 0.05) return spots[S.place].face;
      return S.yaw;
    }

    function handWhileWalking(hand) {
      if (hand === "hold" || hand === "phone" || hand === "nod" || hand === "drink") return hand;
      const c = S.things.carrying;
      return c && c !== "nothing" ? "hold" : "none";
    }

    /* Run one step for exactly `d` minutes. */
    function runStep(step, d, anchor) {
      const where = ctx.where;
      const tEnd = S.t + d;
      applySet(step.set, where);
      const savedRate = ctx.rate;
      if (step.body) {
        const rate = Object.assign({}, savedRate || {});
        Object.entries(step.body).forEach(([k, v]) => {
          rate[k] = (rate[k] || 0) + v / Math.max(d, EPS);
        });
        ctx.rate = rate;
      }
      const idleTexts = () => {
        const t = (cfg.idle && cfg.idle.text) || {};
        return t[S.pose] || t.default || ["A pause."];
      };
      const textOf = () => pick(step.idleAuto ? idleTexts() : step.do) || "";
      if (step.hand && !HANDS.includes(step.hand)) report(`${where}: unknown hand "${step.hand}". Use one of: ${HANDS.join(", ")}.`);

      if (step.drive) {
        runDrive(step, d);
        ctx.rate = savedRate;
        return;
      }

      const targetName = step.go || step.at;
      const target = targetName === "$back" ? anchor : spot(targetName, where);
      let pose = resolvePose(step.pose, where);

      if (target) {
        if (S.inCar && pose !== "sitCar") {
          S.inCar = false;
          S.x = target.x;
          S.z = target.z;
          S.room = target.room;
          S.place = target.id;
          S.yaw = target.face;
        } else if (!S.inCar && Math.hypot(target.x - S.x, target.z - S.z) > 0.02) {
          const path = pathInfo(routeTo(target));
          const walk = Math.min(tEnd - S.t, Math.max(path._len / speed / 60, 0.01));
          S.x = target.x;
          S.z = target.z;
          S.room = target.room;
          S.place = target.id;
          const last = along(path, 1);
          push(walk, { text: textOf(), pose: "walk", hand: handWhileWalking(step.hand), path, yaw: last.yaw, kind: ctx.kind, activity: "walk" });
          S.yaw = last.yaw;
        } else {
          S.place = target.id;
          S.room = target.room;
        }
      }

      const remaining = tEnd - S.t;
      if (remaining > EPS) {
        if (!pose) pose = S.inCar ? "sitCar" : target ? "stand" : S.pose || "stand";
        if (S.inCar && pose !== "sitCar") pose = "sitCar";
        if (pose === "sitCar" && !S.inCar) {
          S.inCar = true;
        }
        const yaw = faceFor(step, target);
        S.yaw = yaw;
        const hand = step.hand || (pose === "sitCar" ? "wheel" : "none");
        const activity = step.activity || ACTIVITY_OF_POSE[pose];
        if (step.micro) {
          runMicro(step, remaining, { pose, poseSpec: step.pose, hand, yaw, activity, textOf, anchor: S.place ? spots[S.place] : null });
        } else {
          push(remaining, { text: textOf(), pose, hand, yaw, kind: ctx.kind, activity });
        }
        S.pose = pose;
      }
      S.t = tEnd;
      ctx.rate = savedRate;
    }

    function runDrive(step, d) {
      const where = ctx.where;
      const names = Array.isArray(step.drive) ? step.drive : [step.drive];
      const targets = names.map((n) => spot(n, where)).filter(Boolean);
      if (!S.inCar) {
        report(`${where}: "drive" needs the person in the car first (a step with pose "sitCar").`);
        S.inCar = true;
      }
      if (!targets.length) {
        push(d, { text: pick(step.do), pose: "sitCar", hand: "wheel", kind: ctx.kind, activity: "drive" });
        return;
      }
      const path = pathInfo([{ x: S.car.x, z: S.car.z }].concat(targets.map((t) => ({ x: t.x, z: t.z }))));
      const t0 = S.t;
      const savedDrive = ctx.drive;
      ctx.drive = { path, t0, span: d, reverse: !!step.reverse };
      const hand = step.hand || "wheel";
      const textOf = () => pick(step.do) || "";
      if (step.micro) {
        runMicro(step, d, { pose: "sitCar", hand, yaw: S.yaw, activity: step.activity || "drive", textOf, anchor: null });
      } else {
        push(d, { text: textOf(), pose: "sitCar", hand, kind: ctx.kind, activity: step.activity || "drive" });
      }
      ctx.drive = savedDrive;
      const end = along(path, 1);
      S.car = { x: end.x, z: end.z, yaw: path._len > EPS ? end.yaw + (step.reverse ? Math.PI : 0) : S.car.yaw };
      S.x = S.car.x;
      S.z = S.car.z;
      S.room = targets[targets.length - 1].room;
      S.place = null;
      S.t = t0 + d;
    }

    /* ---------- micro-behaviours ---------- */

    function eligible(entry, key, last) {
      if (entry === last) return false;
      if (entry.max != null && (S.uses[key] || 0) >= entry.max) return false;
      if (entry.after && S.t < parseClock(entry.after, dayStart)) return false;
      if (entry.before && S.t >= parseClock(entry.before, dayStart)) return false;
      if (entry.when) {
        for (const [k, want] of Object.entries(entry.when)) {
          const s = stat(k);
          if (s !== undefined) {
            const m = /^\s*([<>]=?)\s*(\d*\.?\d+)\s*$/.exec(String(want));
            if (!m) continue;
            const v = Number(m[2]);
            const ok = m[1] === ">" ? s > v : m[1] === ">=" ? s >= v : m[1] === "<" ? s < v : s <= v;
            if (!ok) return false;
          } else {
            const have = S.things[k];
            if (Array.isArray(want) ? !want.includes(have) : have !== want) return false;
          }
        }
      }
      return true;
    }

    function choose(poolNames, last) {
      const cands = [];
      let total = 0;
      poolNames.forEach((pn) => {
        const pool = pools[pn];
        if (!pool) {
          report(`${ctx.where}: there is no pool called "${pn}".`);
          return;
        }
        pool.forEach((entry, idx) => {
          const key = pn + "#" + idx;
          if (!eligible(entry, key, last)) return;
          let w = entry.weight != null ? entry.weight : 1;
          let boost = 1;
          Object.entries(entry.likes || {}).forEach(([k, f]) => {
            const s = stat(k);
            if (s !== undefined) boost += f * s;
          });
          w *= Math.max(0, boost);
          if (w <= 0) return;
          cands.push({ entry, key, w });
          total += w;
        });
      });
      if (!cands.length) return null;
      let r = rng() * total;
      for (const c of cands) {
        r -= c.w;
        if (r <= 0) return c;
      }
      return cands[cands.length - 1];
    }

    function planEntry(entry, anchor, where) {
      if (!entry.steps) {
        return { total: sample(dur(entry.for, where, [5 / 60, 15 / 60])), subs: null };
      }
      let pos = { x: S.x, z: S.z, room: S.room };
      const subs = [];
      let total = 0;
      entry.steps.forEach((sub) => {
        const tName = sub.go || sub.at;
        const target = tName === "$back" ? anchor : spot(tName, where);
        let walk = 0;
        if (target) {
          walk = walkMinutes(pos, target);
          pos = { x: target.x, z: target.z, room: target.room };
        }
        const d = sub.for ? Math.max(sample(dur(sub.for, where, [0.1, 0.1])), walk) : Math.max(walk, target ? 0.02 : 5 / 60);
        subs.push({ step: sub, d });
        total += d;
      });
      if (anchor && Math.hypot(pos.x - anchor.x, pos.z - anchor.z) > 0.05) {
        const back = Math.max(walkMinutes(pos, anchor), 0.02);
        subs.push({ step: { go: "$back", do: "They go back." }, d: back });
        total += back;
      }
      return { total, subs };
    }

    function runMicro(step, D, base) {
      const where = ctx.where;
      const micro = typeof step.micro === "string" ? { pools: [step.micro] } : step.micro;
      const poolNames = micro.pools || (micro.pool ? [micro.pool] : []);
      const every = dur(micro.every, where + " micro.every", [3, 8]);
      poolNames.forEach((pn) => {
        if (!pools[pn]) report(`${where}: there is no pool called "${pn}". Pools: ${Object.keys(pools).join(", ")}.`);
      });
      const tEnd = S.t + D;
      let last = null;
      const poseNow = () => (base.poseSpec && base.poseSpec[0] === "$" ? resolvePose(base.poseSpec, where) : base.pose);
      const baseSeg = (d) => push(d, { text: base.textOf(), pose: poseNow(), hand: base.hand, yaw: base.yaw, kind: ctx.kind, activity: base.activity });
      let guard = 0;
      while (guard++ < 400) {
        const gap = sample(every);
        if (S.t + gap >= tEnd - 0.03) break;
        baseSeg(gap);
        const c = choose(poolNames, last);
        if (!c) continue;
        const entryWhere = where + ` → pool entry "${String(pick(c.entry.do) || "").slice(0, 40)}"`;
        const plan = planEntry(c.entry, base.anchor, entryWhere);
        if (S.t + plan.total > tEnd - 0.02) continue;
        S.uses[c.key] = (S.uses[c.key] || 0) + 1;
        last = c.entry;
        const savedKind = ctx.kind;
        ctx.kind = "micro";
        if (!plan.subs) {
          const e = c.entry;
          runStep(
            {
              do: e.do,
              pose: e.pose || poseNow(),
              hand: e.hand != null ? e.hand : base.hand,
              set: e.set,
              body: e.body,
              activity: e.activity || base.activity,
              face: base.yaw / DEG,
            },
            plan.total,
            base.anchor
          );
          S.pose = poseNow();
        } else {
          applySet(c.entry.set, entryWhere);
          plan.subs.forEach((s) => runStep(Object.assign({ hand: "none" }, s.step), s.d, base.anchor));
          S.pose = poseNow();
          if (base.anchor) {
            S.place = base.anchor.id;
            S.room = base.anchor.room;
          }
        }
        ctx.kind = savedKind;
      }
      if (tEnd - S.t > EPS) baseSeg(tEnd - S.t);
      S.t = tEnd;
    }

    /* ---------- blocks ---------- */

    function expand(steps, where) {
      const out = [];
      (steps || []).forEach((s, i) => {
        if (!s || typeof s !== "object") {
          report(`${where}: step ${i + 1} is empty. Check for a stray comma.`);
          return;
        }
        if (s.chance != null && rng() >= s.chance) return;
        if (s.steps) out.push(...expand(s.steps, where));
        else out.push(s);
      });
      return out;
    }

    function plan(steps, W, where) {
      let pos = { x: S.x, z: S.z, room: S.room };
      let inCar = S.inCar;
      const items = steps.map((s) => {
        const tName = s.go || s.at;
        const target = tName ? spots[tName] : null;
        let walk = 0;
        if (target) {
          const pose = s.pose;
          if (inCar && pose !== "sitCar") inCar = false;
          else if (!inCar) walk = walkMinutes(pos, target);
          pos = { x: target.x, z: target.z, room: target.room };
        }
        if (s.pose === "sitCar") inCar = true;
        if (s.fill) return { step: s, fill: s.fill === true ? 1 : Number(s.fill) || 1, min: walk };
        let d;
        if (s.go) {
          /* a walk lasts as long as the walk; anything done on arrival is its own step */
          if (s.for) warnings.push(`${where}: "for" is ignored on a "go" step. The walk takes as long as walking takes.`);
          d = Math.max(walk, 2 / 60);
        } else if (s.for) d = sample(dur(s.for, where, [1, 1]));
        else d = Math.max(walk, 5 / 60);
        return { step: s, d, min: walk };
      });
      const fixed = items.filter((it) => !it.fill).reduce((a, it) => a + it.d, 0);
      const fills = items.filter((it) => it.fill);
      if (fills.length) {
        const avail = Math.max(0, W - fixed);
        const wsum = fills.reduce((a, it) => a + it.fill, 0);
        fills.forEach((it) => {
          it.d = Math.max(it.min, (avail * it.fill) / wsum);
        });
      }
      const total = items.reduce((a, it) => a + it.d, 0);
      if (total < W - 1e-4) {
        /* Never stretch an action to fill the clock. Spare time becomes idle time. */
        const spare = W - total;
        if (spare > 3) warnings.push(`${where}: ${spare.toFixed(1)}m of idle time was added because the steps are short. Add a fill step with something to do?`);
        const idle = cfg.idle || {};
        items.push({ step: { idleAuto: true, micro: { pools: idle.pools || ["idle"], every: idle.every || "15-45s" } }, d: spare });
      } else if (total > W + 1e-4) {
        if (total > W * 1.5) warnings.push(`${where}: steps add up to ${total.toFixed(1)}m but the block is only ${W.toFixed(1)}m. They were squeezed to fit.`);
        const k = W / total;
        items.forEach((it) => (it.d *= k));
      }
      return items;
    }

    function runSteps(steps, W, where) {
      const items = plan(steps, W, where);
      const tEnd = S.t + W;
      items.forEach((it, idx) => {
        ctx.where = `${where}, step ${idx + 1} ("${String(pick(it.step.do) || it.step.go || it.step.at || "").slice(0, 40)}")`;
        const d = idx === items.length - 1 ? tEnd - S.t : it.d;
        runStep(it.step, Math.max(0, d), null);
      });
      if (tEnd - S.t > EPS) {
        ctx.where = where;
        push(tEnd - S.t, { text: "…", pose: S.pose, hand: "none", kind: ctx.kind });
      }
      S.t = tEnd;
    }

    const spine = (cfg.spine || []).filter(Boolean);
    if (!spine.length) report("The spine is empty. Add at least one block.");
    let blocks = [];
    spine.forEach((b, i) => {
      const t = parseClock(b.time, dayStart);
      const where = `Block ${i + 1} (${b.time || "no time"} ${b.title || ""})`.trim();
      if (isNaN(t)) {
        report(`${where}: can't read the time "${b.time}". Use "7:30" or "13:05".`);
        return;
      }
      if (b.chance != null && rng() >= b.chance) return;
      let tt = t;
      if (b.jitter) {
        const j = dur(b.jitter, where, [0, 0])[1];
        tt += (rng() * 2 - 1) * j;
      }
      if (cfg.chapters && b.chapter && !cfg.chapters[b.chapter]) report(`${where}: chapter "${b.chapter}" isn't defined under chapters.`);
      blocks.push({ src: b, t: tt, base: t, where, title: b.title || "", chapter: b.chapter || "" });
    });
    blocks.sort((a, b) => a.base - b.base);
    for (let i = 0; i < blocks.length; i++) {
      const lo = i > 0 ? blocks[i - 1].t + 1 : dayStart;
      const hi = i < blocks.length - 1 ? blocks[i + 1].base - 1 : dayEnd - 1;
      blocks[i].t = i === 0 ? dayStart : Math.min(hi, Math.max(lo, blocks[i].t));
    }
    if (blocks.length && Math.abs(blocks[0].base - dayStart) > 0.01) {
      report(`The first block is at ${blocks[0].src.time}, but dayStart is ${cfg.dayStart}. It was moved to dayStart.`);
    }
    blocks.forEach((b, i) => {
      b.end = i < blocks.length - 1 ? blocks[i + 1].t : dayEnd;
      if (b.end - b.t <= 0) report(`${b.where}: starts after the next block. Check the times are in order.`);
    });

    blocks.forEach((b) => {
      ctx = { block: b, where: b.where, drive: null, rate: null, kind: "spine" };
      S.t = b.t;
      const W = Math.max(0, b.end - b.t);
      const steps = expand(b.src.steps, b.where);
      if (b.src.length) {
        const L = Math.min(W, sample(dur(b.src.length, b.where, [5, 5])));
        runSteps(steps, L, b.where);
        const then = expand(b.src.then, b.where);
        if (!then.length) report(`${b.where}: has "length" but no "then" steps to fill the rest.`);
        runSteps(then, W - L, b.where + " (then)");
      } else {
        runSteps(steps, W, b.where);
      }
    });

    for (let i = 1; i < actions.length; i++) {
      if (Math.abs(actions[i].start - actions[i - 1].end) > 1e-6) {
        errors.push(`Internal: gap in the timeline before "${actions[i].text}".`);
        break;
      }
    }

    const segments = [];
    blocks.forEach((b) => {
      const last = segments[segments.length - 1];
      if (last && last.chapter === b.chapter) last.end = b.end;
      else segments.push({ chapter: b.chapter, start: b.t, end: b.end });
    });

    return {
      dateKey,
      seed: seedText,
      dayStart,
      dayEnd,
      actions,
      segments,
      blocks: blocks.map((b) => ({ title: b.title, chapter: b.chapter, start: b.t, end: b.end })),
      errors,
      warnings,
      spots,
      rooms,
      config: cfg,
    };
  }

  /* ---------------- sample the day at a minute ---------------- */

  function frame(day, minutes) {
    const A = day.actions;
    if (!A.length) return null;
    let lo = 0;
    let hi = A.length - 1;
    const m = Math.max(day.dayStart, Math.min(day.dayEnd - 1e-6, minutes));
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (A[mid].start <= m) lo = mid;
      else hi = mid - 1;
    }
    const a = A[lo];
    const span = a.end - a.start;
    const p = span <= EPS ? 1 : Math.max(0, Math.min(1, (m - a.start) / span));
    let x = a.x;
    let z = a.z;
    let yaw = a.yaw;
    let walking = false;
    if (a.path) {
      const q = along(a.path, p);
      x = q.x;
      z = q.z;
      yaw = q.yaw;
      walking = true;
    }
    let car;
    if (a.car.path) {
      const f = a.car.f0 + (a.car.f1 - a.car.f0) * p;
      const q = along(a.car.path, f);
      car = { x: q.x, z: q.z, yaw: q.yaw + (a.car.reverse ? Math.PI : 0), moving: a.car.path._len > 0.05 && a.car.f1 > a.car.f0 };
    } else {
      car = { x: a.car.x, z: a.car.z, yaw: a.car.yaw, moving: false };
    }
    if (a.inCar) {
      x = car.x;
      z = car.z;
      yaw = car.yaw;
    }
    const body = {};
    Object.keys(a.b0).forEach((k) => {
      body[k] = a.b0[k] + (a.b1[k] - a.b0[k]) * p;
    });
    return {
      action: a,
      index: lo,
      progress: p,
      minutes: m,
      person: { x, z, yaw, pose: a.pose, hand: a.hand, walking, inCar: a.inCar },
      car,
      things: a.things,
      body,
      room: a.room,
      chapter: a.chapter,
    };
  }

  root.DayEngine = { build, frame, parseClock, parseDur, fmtClock, along };
})(typeof window !== "undefined" ? window : globalThis);
