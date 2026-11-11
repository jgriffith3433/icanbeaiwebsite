/* ==========================================================================
   The title screen: the first thing the page shows. The city's skyline (the
   world's own scene, a slow high orbit: world.titleShot) behind the name, and
   two buttons: Play (takes control of Small Weather) and Episodes (the
   Episodes menu). The day keeps running behind it. Words in day.config.js
   `title`. Play and Episodes turn the Sound on (they're a click, so the
   browser lets the music start) unless the player switched Music off here.
   A playtest bot's tab (?playtest= other than `title`) never shows it, and
   the playtest calls day.title.quiet() for every other scenario.
   ========================================================================== */

const DEFAULTS = {
  kicker: "I Can Be",
  name: "Small Weather",
  line: "His day runs on its own, live. Take it over and command the sky.",
  play: "Play",
  episodes: "Episodes",
  musicOn: "Music on",
  musicOff: "Music off",
  hint: "Enter to play",
  touchHint: "",
  day: "Day",
  night: "Night",
};

export function startTitle() {
  const day = window.day;
  if (!day || day.title || !document.body) return day && day.title;
  const cfg = Object.assign({}, DEFAULTS, (window.DAY_CONFIG && window.DAY_CONFIG.title) || {});
  const html = document.documentElement;

  let quiet = false;
  try {
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "title" && id !== "cold-start") quiet = true;
  } catch (e) { /* no location */ }

  const style = document.createElement("style");
  style.textContent = `
.title-screen{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;padding:max(28px,env(safe-area-inset-top)) max(28px,env(safe-area-inset-right)) max(64px,calc(env(safe-area-inset-bottom) + 48px)) max(48px,env(safe-area-inset-left));background:linear-gradient(180deg,rgba(6,9,16,.55) 0%,rgba(6,9,16,0) 26%,rgba(6,9,16,0) 46%,rgba(6,9,16,.78) 100%);color:#f6f1e8;font:500 1rem/1.4 Outfit,system-ui,sans-serif;opacity:1;transition:opacity .45s ease}
.title-screen[hidden]{display:none}
.title-screen.leaving{opacity:0;pointer-events:none}
.title-screen .kicker{margin:0;font:600 .8rem/1 Outfit,system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#7ec8ff;text-shadow:0 0 18px rgba(126,200,255,.55)}
.title-screen h1{margin:10px 0 0;font:600 clamp(2.6rem,7vw,5.2rem)/0.98 Fraunces,Georgia,serif;letter-spacing:-.01em;text-shadow:0 4px 30px rgba(0,0,0,.55)}
.title-screen .daily{margin:12px 0 0;max-width:30em;color:#f0c27a;font:600 1.02rem/1.3 Outfit,system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.7);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.title-screen .daily[hidden],.title-screen .yday[hidden]{display:none}
.title-screen .yday{margin:4px 0 0;max-width:30em;color:rgba(246,241,232,.72);font:500 .9rem/1.3 Outfit,system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.7);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.title-screen .line{margin:10px 0 0;max-width:30em;color:rgba(246,241,232,.84);font-size:1.05rem;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.title-screen .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.title-screen button{appearance:none;min-height:48px;min-width:44px;padding:12px 28px;border-radius:999px;border:1px solid rgba(246,241,232,.32);background:rgba(14,16,22,.55);color:#f6f1e8;font:600 1rem Outfit,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(10px);transition:background .15s,border-color .15s,transform .15s}
.title-screen button:hover{background:rgba(126,200,255,.16);border-color:rgba(126,200,255,.6)}
.title-screen button:focus-visible{outline:2px solid #7ec8ff;outline-offset:3px}
.title-screen button.play{background:#f0c27a;border-color:#f0c27a;color:#141210;padding:12px 40px}
.title-screen button.play:hover{background:#f6d39b;transform:translateY(-1px)}
.title-screen .foot{display:flex;align-items:center;gap:14px;margin-top:18px;font-size:.82rem;color:rgba(246,241,232,.6)}
.title-screen .foot button{min-height:36px;padding:6px 14px;font-size:.8rem;font-weight:500}
.title-screen .foot button[aria-pressed="false"]{color:rgba(246,241,232,.55)}
.title-screen .clock{position:absolute;top:max(22px,env(safe-area-inset-top));right:max(24px,env(safe-area-inset-right));margin:0;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(246,241,232,.7)}
.title-screen .clock i{display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:50%;background:#e2574c;box-shadow:0 0 10px #e2574c;vertical-align:1px;font-style:normal}
html.title-up .hud,html.title-up .side,html.title-up #control,html.title-up .control-hint,html.title-up #episodes,html.title-up #neighbors-btn,html.title-up .tutorial,html.title-up #episode-offer,html.title-up .public-toggle,html.title-up .version-tag{visibility:hidden}
@media (max-width:700px){.title-screen{align-items:stretch;padding-left:max(20px,env(safe-area-inset-left));padding-right:max(20px,env(safe-area-inset-right));padding-bottom:max(40px,calc(env(safe-area-inset-bottom) + 28px))}.title-screen .actions button{flex:1}.title-screen .foot .hint{display:none}}
`;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.id = "title";
  el.className = "title-screen";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `${cfg.kicker}: ${cfg.name}`);
  el.innerHTML = `<p class="clock" id="title-clock"><i></i><span></span></p><p class="kicker"></p><h1></h1><p class="daily" id="title-daily" hidden></p><p class="yday" id="title-yday" hidden></p><p class="line"></p><div class="actions"><button type="button" class="play" id="title-play"></button><button type="button" class="episodes" id="title-episodes"></button></div><div class="foot"><button type="button" id="title-music" aria-pressed="true"></button><span class="hint"></span></div>`;
  el.querySelector(".kicker").textContent = cfg.kicker;
  el.querySelector("h1").textContent = cfg.name;
  el.querySelector(".line").textContent = cfg.line;
  const dailyEl = el.querySelector("#title-daily");
  const ydayEl = el.querySelector("#title-yday");
  const playBtn = el.querySelector("#title-play");
  const epBtn = el.querySelector("#title-episodes");
  const musicBtn = el.querySelector("#title-music");
  const clockEl = el.querySelector("#title-clock span");
  playBtn.textContent = cfg.play;
  epBtn.textContent = cfg.episodes;
  document.body.appendChild(el);

  let up = false;
  let shownAt = 0;
  let musicWanted = window.__soundSaved !== "off"; // Play turns the Sound on unless the player said no here
  let clockTimer = 0;
  const log = [];

  const soundBtn = () => document.getElementById("sound");
  const soundOn = () => {
    const b = soundBtn();
    return !!(b && b.getAttribute("aria-pressed") === "true");
  };
  function setSound(on) {
    const b = soundBtn();
    if (b && soundOn() !== on) b.click();
  }
  function touchy() {
    if (html.classList.contains("touch-ui")) return true;
    try { return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 700; } catch (e) { return false; }
  }
  function paintMusic() {
    const on = up && soundOn() ? true : musicWanted;
    musicBtn.setAttribute("aria-pressed", on ? "true" : "false");
    musicBtn.textContent = on ? cfg.musicOn : cfg.musicOff;
  }
  function paintClock() {
    const n = day.now && day.now();
    if (!n || typeof n.minutes !== "number") return;
    const m = ((Math.floor(n.minutes) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const night = day.score && day.score.isNight ? day.score.isNight(m / 60) : h >= 20 || h < 6;
    clockEl.textContent = `Live · ${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} · ${night ? cfg.night : cfg.day}`;
  }
  /* Today's request (js/daily.js) in one line under the name, and yesterday's when it was answered. */
  function paintDaily() {
    const d = day.daily;
    const t = d && d.line ? d.line() : "";
    const y = d && d.yesterdayLine ? d.yesterdayLine() : "";
    dailyEl.textContent = t;
    dailyEl.hidden = !t;
    ydayEl.textContent = y;
    ydayEl.hidden = !y;
  }
  window.addEventListener("day:daily", () => { if (up) paintDaily(); });
  function emit(action, extra) {
    const detail = Object.assign({ action }, extra || {});
    log.push(Object.assign({ t: performance.now() }, detail));
    if (log.length > 30) log.shift();
    window.dispatchEvent(new CustomEvent("day:title", { detail }));
  }
  function camera(on) {
    const w = day.world && day.world();
    if (w && w.titleShot) w.titleShot(on);
  }

  function show(via) {
    if (up) return false;
    up = true;
    shownAt = performance.now();
    el.classList.remove("leaving");
    el.hidden = false;
    html.classList.add("title-up");
    el.querySelector(".hint").textContent = touchy() ? cfg.touchHint : cfg.hint;
    camera(true);
    paintMusic();
    paintClock();
    paintDaily();
    clearInterval(clockTimer);
    clockTimer = setInterval(paintClock, 1000); // the clock text only: no fetches
    try { playBtn.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
    emit("show", { via: via || "load" });
    return true;
  }
  function hide(action, via) {
    if (!up) return false;
    up = false;
    clearInterval(clockTimer);
    html.classList.remove("title-up");
    camera(false);
    el.classList.add("leaving");
    setTimeout(() => {
      if (!up) el.hidden = true;
    }, 460);
    if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
    emit(action, { via: via || "click", seconds: Math.round((performance.now() - shownAt) / 100) / 10, music: musicWanted });
    return true;
  }

  function play(via) {
    if (!up) return false;
    if (musicWanted) setSound(true);
    hide("play", via);
    // A new player's first Play is the cold open (js/coldopen.js): he is the player's in this same click, on the roof.
    if (day.coldopen && day.coldopen.pending() && day.coldopen.start(via)) return true;
    // A first Play opens with js/opening.js (skippable); it takes control when it ends.
    if (day.opening && day.opening.pending()) return day.opening.start(via) || true;
    // The page's own Take control button, so it counts as a button press. He can't be taken while driving:
    // then the title just opens on his day.
    const c = day.control;
    const btn = document.getElementById("control");
    if (c && c.mode && c.mode() === "schedule") {
      if (btn && !btn.disabled) btn.click();
      else if (!btn) c.take && c.take();
    }
    return true;
  }
  function episodes(via) {
    if (!up) return false;
    if (musicWanted) setSound(true);
    hide("episodes", via);
    const menuBtn = document.getElementById("episodes");
    const menu = document.getElementById("episode-menu");
    if (menuBtn && !(menu && !menu.hidden)) menuBtn.click();
    return true;
  }

  playBtn.addEventListener("click", () => play("click"));
  epBtn.addEventListener("click", () => episodes("click"));
  musicBtn.addEventListener("click", () => {
    musicWanted = !(musicBtn.getAttribute("aria-pressed") === "true");
    setSound(musicWanted); // a click: the browser lets the title music start right here
    paintMusic();
    emit("music", { on: musicWanted });
  });
  // Enter on the page (not on a button) is control.js's Take control: the title goes with it.
  window.addEventListener("day:control", (e) => {
    const d = (e && e.detail) || {};
    if (d.action === "take" && up) {
      if (musicWanted) setSound(true);
      hide("play", d.via || "key");
    }
  });
  // A gamepad's Start is control.js's Take control too, so it closes the title the same way.

  const api = {
    showing: () => up,
    show: (via) => {
      quiet = false;
      return show(via || "api");
    },
    play,
    episodes,
    quiet() {
      quiet = true;
      if (up) {
        up = false;
        clearInterval(clockTimer);
        html.classList.remove("title-up");
        camera(false);
        el.hidden = true;
      }
    },
    now: () => ({
      showing: up,
      seconds: up ? (performance.now() - shownAt) / 1000 : 0,
      music: musicWanted,
      daily: dailyEl.hidden ? "" : dailyEl.textContent,
      yesterday: ydayEl.hidden ? "" : ydayEl.textContent,
      sound: soundOn(),
      camera: !!(day.world && day.world() && day.world().titleShotOn && day.world().titleShotOn()),
      log: log.slice(),
    }),
  };
  day.title = api;
  window.title = api;
  if (!quiet) show("load");
  return api;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") startTitle();
