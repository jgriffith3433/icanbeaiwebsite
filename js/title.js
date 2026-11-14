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
  settings: "Settings",
  continue: "Continue",
  logoText: ["I Can Be", "AI"],
  logo: null,
  crane: null,
  hero: null,
  glintEvery: [2.6, 5.2],
};

export function startTitle() {
  const day = window.day;
  if (!day || day.title || !document.body) return day && day.title;
  const cfg = Object.assign({}, DEFAULTS, (window.DAY_CONFIG && window.DAY_CONFIG.title) || {});
  const html = document.documentElement;

  let quiet = false;
  let autoTimer = 0;
  try {
    const id = new URLSearchParams(location.search).get("playtest");
    if (id && id !== "title" && id !== "cold-start" && id !== "title-key-art" && id !== "title-progress" && id !== "street-teaches" && id !== "phone-touch") quiet = true;
  } catch (e) { /* no location */ }

  const style = document.createElement("style");
  style.textContent = `
.title-screen{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;justify-content:space-between;align-items:center;padding:max(26px,calc(env(safe-area-inset-top) + 18px)) max(20px,env(safe-area-inset-right)) max(30px,calc(env(safe-area-inset-bottom) + 22px)) max(20px,env(safe-area-inset-left));background:linear-gradient(180deg,rgba(6,9,16,.5) 0%,rgba(6,9,16,0) 30%,rgba(6,9,16,0) 58%,rgba(6,9,16,.82) 100%);color:#f6f1e8;font:500 1rem/1.4 Outfit,system-ui,sans-serif;opacity:1;transition:opacity .35s ease;text-align:center}
.title-screen[hidden]{display:none}
.title-screen.leaving{opacity:0;pointer-events:none}
.title-screen .top,.title-screen .bottom{display:flex;flex-direction:column;align-items:center;width:100%}
.title-screen .logo{position:relative;margin:0;display:flex;flex-direction:column;align-items:center;line-height:.9;opacity:0;transform:translateY(-8px);animation:t-in 1.2s ease 2.4s forwards}
.title-screen .logo img{display:block;width:min(82vw,560px);height:auto;filter:drop-shadow(0 6px 28px rgba(0,0,0,.6))}
.title-screen .logo .l1{font:600 clamp(.95rem,3.4vw,1.5rem)/1 Fraunces,Georgia,serif;letter-spacing:.5em;text-indent:.5em;text-transform:uppercase;color:#f0c27a;text-shadow:0 0 20px rgba(240,194,122,.55)}
.title-screen .logo .l2{margin-top:6px;font:700 clamp(4.4rem,17vw,9rem)/.9 Fraunces,Georgia,serif;letter-spacing:.02em;color:transparent;background:linear-gradient(100deg,#f6dcaa 0%,#f0c27a 38%,#fff6e2 50%,#f0c27a 62%,#d9a24f 100%) 140% 0/260% 100% no-repeat;-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 4px 26px rgba(120,70,10,.6));animation:t-glint 5.2s ease-in-out 3.4s infinite}
.title-screen .logo.zap img{filter:drop-shadow(0 0 26px rgba(255,214,150,.95)) brightness(1.35)}
.title-screen .logo.zap .l2{filter:drop-shadow(0 0 30px rgba(255,220,160,.95)) brightness(1.4)}
@keyframes t-in{to{opacity:1;transform:none}}
@keyframes t-glint{0%,55%{background-position:140% 0}85%,100%{background-position:-40% 0}}
.title-screen .daily{margin:14px 0 0;max-width:30em;color:#f0c27a;font:600 1rem/1.3 Outfit,system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.8);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.title-screen.fresh .clock{display:none}
.title-screen .daily[hidden],.title-screen .yday[hidden],.title-screen .prog[hidden],.title-screen .nextgoal[hidden]{display:none}
.title-screen .prog{margin:10px 0 0;padding:4px 14px;border-radius:999px;background:rgba(10,13,22,.62);color:#f6f1e8;font:600 .92rem/1.3 Outfit,system-ui,sans-serif;letter-spacing:.03em;text-shadow:0 1px 8px rgba(0,0,0,.9)}
.title-screen .prog b{color:#f0c27a;letter-spacing:.12em;font-weight:700}
.title-screen .nextgoal{margin:0;max-width:min(86vw,340px);color:#f0c27a;font:600 .95rem/1.3 Outfit,system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.9);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.title-screen .yday{margin:4px 0 0;max-width:30em;color:rgba(246,241,232,.78);font:500 .88rem/1.3 Outfit,system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.8);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.title-screen .actions{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;opacity:0;animation:t-in .9s ease 3.2s forwards}
.title-screen .row{display:flex;flex-wrap:nowrap;justify-content:center;gap:10px;width:100%}
.title-screen button{white-space:nowrap;appearance:none;min-height:48px;min-width:44px;padding:10px 22px;border-radius:999px;border:1px solid rgba(246,241,232,.32);background:rgba(14,16,22,.58);color:#f6f1e8;font:600 1rem Outfit,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(10px);transition:background .15s,border-color .15s,transform .15s}
.title-screen button:hover{background:rgba(126,200,255,.16);border-color:rgba(126,200,255,.6)}
.title-screen button:active{transform:scale(.97)}
.title-screen button:focus-visible{outline:2px solid #7ec8ff;outline-offset:3px}
.title-screen button.play{width:min(86vw,340px);min-height:64px;font-size:1.3rem;letter-spacing:.04em;background:#f0c27a;border-color:#f0c27a;color:#141210;box-shadow:0 0 30px rgba(240,194,122,.35)}
.title-screen button.play:hover{background:#f6d39b;transform:translateY(-1px)}
.title-screen .row button{flex:0 1 auto}
.title-screen button[aria-pressed="false"]{color:rgba(246,241,232,.6)}
.title-screen .hint{font-size:.88rem;font-weight:600;letter-spacing:.04em;color:#f6f1e8;min-height:1.1em;padding:6px 14px;border-radius:999px;background:rgba(10,13,22,.62);text-shadow:0 1px 8px rgba(0,0,0,.9)}
.title-screen .hint:empty{display:none}
.title-screen .tset{width:min(92vw,360px);margin:0;padding:10px;border-radius:16px;background:rgba(10,13,22,.82);border:1px solid rgba(246,241,232,.22);backdrop-filter:blur(10px);display:flex;flex-direction:column;gap:8px;align-items:stretch}
.title-screen .tset[hidden]{display:none}
.title-screen .tset .settings-pop{position:static;margin:0;padding:0;align-items:stretch}
.title-screen .clock{position:absolute;top:max(10px,env(safe-area-inset-top));right:max(14px,env(safe-area-inset-right));margin:0;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(246,241,232,.6)}
.title-screen .clock i{display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:50%;background:#e2574c;box-shadow:0 0 10px #e2574c;vertical-align:1px;font-style:normal}
.title-screen .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
html.title-up .hud,html.title-up .side,html.title-up #control,html.title-up .control-hint,html.title-up #episodes,html.title-up #neighbors-btn,html.title-up .tutorial,html.title-up #episode-offer,html.title-up .public-toggle,html.title-up .version-tag{visibility:hidden}
@media (max-width:700px){.title-screen .row{gap:8px}.title-screen .row button{padding:10px 14px;white-space:nowrap;flex:1 1 auto;min-width:0;font-size:.95rem}.title-screen .clock{display:none}.title-screen .hint{display:none}}
@media (prefers-reduced-motion:reduce){.title-screen .logo,.title-screen .actions{animation-duration:.01s;animation-delay:0s}.title-screen .logo .l2{animation:none;background-position:30% 0}}
`;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.id = "title";
  el.className = "title-screen";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `${cfg.logoText.join(" ")}`);
  el.innerHTML = `<p class="clock" id="title-clock"><i></i><span></span></p><div class="top"><h1 class="logo" id="title-logo"><span class="sr"></span></h1><p class="daily" id="title-daily" hidden></p><p class="yday" id="title-yday" hidden></p><p class="prog" id="title-prog" hidden></p></div><div class="bottom"><p class="tset" id="title-settings-panel" hidden></p><div class="actions"><p class="nextgoal" id="title-next" hidden></p><button type="button" class="play" id="title-play"></button><div class="row"><button type="button" class="episodes" id="title-episodes"></button><button type="button" id="title-settings" aria-expanded="false"></button><button type="button" id="title-music" aria-pressed="true"></button></div><span class="hint"></span></div></div>`;
  const logoEl = el.querySelector("#title-logo");
  logoEl.setAttribute("aria-label", cfg.logoText.join(" ")); // not a text node: a hidden-by-clip line still counts as words on screen
  if (cfg.logo) {
    // Hawkes Gen's lockup (hawkes.assets.json "title-logo"); the type below is the stand-in until it is in the repo.
    const img = document.createElement("img");
    img.alt = "";
    img.src = cfg.logo;
    img.decoding = "async";
    img.addEventListener("error", () => { img.remove(); typeLogo(); });
    logoEl.appendChild(img);
  } else typeLogo();
  function typeLogo() {
    const l1 = document.createElement("span");
    l1.className = "l1";
    l1.setAttribute("aria-hidden", "true");
    l1.textContent = cfg.logoText[0];
    const l2 = document.createElement("span");
    l2.className = "l2";
    l2.setAttribute("aria-hidden", "true");
    l2.textContent = cfg.logoText[1] || "";
    logoEl.append(l1, l2);
  }
  const dailyEl = el.querySelector("#title-daily");
  const ydayEl = el.querySelector("#title-yday");
  const progEl = el.querySelector("#title-prog");
  const nextEl = el.querySelector("#title-next");
  const playBtn = el.querySelector("#title-play");
  const epBtn = el.querySelector("#title-episodes");
  const setBtn = el.querySelector("#title-settings");
  const setPanel = el.querySelector("#title-settings-panel");
  const musicBtn = el.querySelector("#title-music");
  const clockEl = el.querySelector("#title-clock span");
  epBtn.textContent = cfg.episodes;
  setBtn.textContent = cfg.settings;
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
  /* Progress (js/episodes.js progress()): stars earned and episodes finished, and the next goal under Continue. */
  function paintProgress() {
    const p = day.episodes && day.episodes.progress ? day.episodes.progress() : null;
    if (!p || !p.total) { progEl.hidden = true; nextEl.hidden = true; return; }
    const filled = Math.min(5, Math.round((p.stars / Math.max(1, p.maxStars)) * 5));
    progEl.innerHTML = `<b aria-hidden="true">${"★".repeat(filled)}${"☆".repeat(5 - filled)}</b> ${p.done} of ${p.total} episodes`;
    progEl.setAttribute("aria-label", `${p.stars} of ${p.maxStars} stars, ${p.done} of ${p.total} episodes finished`);
    progEl.hidden = false;
    const started = p.done > 0 || !hasSave();
    nextEl.textContent = p.next ? `${p.done > 0 ? "Next" : "First"}: ${p.next.title}` : "Every episode finished. Beat your ranks.";
    nextEl.hidden = !(hasSave() || p.done > 0) && !started;
  }
  window.addEventListener("day:episode", () => { if (up && !el.classList.contains("fresh")) paintProgress(); });
  window.addEventListener("day:daily", () => { if (up && !el.classList.contains("fresh")) paintDaily(); });
  function emit(action, extra) {
    const detail = Object.assign({ action }, extra || {});
    log.push(Object.assign({ t: performance.now() }, detail));
    if (log.length > 30) log.shift();
    window.dispatchEvent(new CustomEvent("day:title", { detail }));
  }
  function camera(on) {
    const w = day.world && day.world();
    if (!w || !w.titleShot) return;
    if (!on) { w.titleShot(false); return; }
    // The key-art crane over the district, landing on Small Weather on the apartment roof (the pose the cold open dives from).
    const opts = {};
    if (cfg.crane) opts.crane = { secs: reduced() ? 0.01 : cfg.crane.secs, from: cfg.crane.from, to: cfg.crane.to };
    if (cfg.hero) opts.hero = cfg.hero;
    w.titleShot(opts);
  }
  const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  /* the storm forms behind him (a new player's: the cold open carries the same cell on) and glints in the clouds every few seconds */
  let glintTimer = 0;
  let stormTimers = [];
  const hasSave = () => !(day.coldopen && day.coldopen.pending && day.coldopen.pending());
  function glint() {
    if (!up) return;
    const w = window.weather;
    if (w && w.triggerFlash) { try { w.triggerFlash(140 + Math.random() * 220, (Math.random() - 0.5) * 1.2); } catch (e) { /* no weather */ } }
    logoEl.classList.add("zap");
    setTimeout(() => logoEl.classList.remove("zap"), 220);
    emit("glint", {});
    const g = cfg.glintEvery || [2.6, 5.2];
    glintTimer = setTimeout(glint, (g[0] + Math.random() * (g[1] - g[0])) * 1000);
  }
  function stormStart() {
    stormTimers.forEach(clearTimeout);
    stormTimers = [];
    const w = window.weather;
    if (!w || !w.set || hasSave()) return;
    w.set("clouds", 0.35, "cell");
    stormTimers.push(setTimeout(() => { if (up) w.set("rain", 0.45, "cell"); }, 3500));
    stormTimers.push(setTimeout(() => { if (up) w.set("rain", 0.75, "cell"); }, 7000));
  }
  function stormStop(played) {
    clearTimeout(glintTimer);
    stormTimers.forEach(clearTimeout);
    stormTimers = [];
    const w = window.weather;
    if (played || !w || !w.set || hasSave()) return;
    // left by Episodes: give the sky back as the forecast had it
    const n = w.now && w.now();
    if (n && n.forecast) w.set(n.forecast, n.forecastIntensity, "cell");
  }

  /* parallax: the mouse, or the phone's tilt */
  let tiltOn = false;
  function par(x, y) {
    const w = day.world && day.world();
    if (w && w.titleParallax) w.titleParallax(x, y);
  }
  window.addEventListener("pointermove", (e) => {
    if (!up || e.pointerType === "touch") return;
    par((e.clientX / Math.max(1, innerWidth)) * 2 - 1, (e.clientY / Math.max(1, innerHeight)) * 2 - 1);
  }, { passive: true });
  window.addEventListener("deviceorientation", (e) => {
    if (!up || e.gamma == null || e.beta == null) return;
    tiltOn = true;
    par(Math.max(-1, Math.min(1, e.gamma / 22)), Math.max(-1, Math.min(1, (e.beta - 55) / 22)));
  }, { passive: true });

  /* Settings: the page's own settings group (quality, voice, ...) moves in here while the panel is open */
  function settingsPanel(open) {
    const pop = document.getElementById("settings-pop");
    if (!pop) return;
    setBtn.setAttribute("aria-expanded", open ? "true" : "false");
    setPanel.hidden = !open;
    if (open) { pop.hidden = false; setPanel.appendChild(pop); }
    else if (pop.parentElement === setPanel) {
      pop.hidden = true;
      const tools = document.querySelector(".tools");
      if (tools) tools.appendChild(pop);
    }
    emit("settings", { open });
  }
  setBtn.addEventListener("click", () => settingsPanel(setPanel.hidden));

  function show(via) {
    if (up) return false;
    up = true;
    shownAt = performance.now();
    el.classList.remove("leaving");
    el.hidden = false;
    html.classList.add("title-up");
    el.querySelector(".hint").textContent = touchy() ? cfg.touchHint : cfg.hint;
    playBtn.textContent = hasSave() ? cfg.continue : cfg.play;
    camera(true);
    stormStart();
    clearTimeout(glintTimer);
    glintTimer = setTimeout(glint, (reduced() ? 1 : 3.2) * 1000);
    paintMusic();
    paintClock();
    paintDaily();
    paintProgress();
    // A stranger's first title is the name and the buttons: the day's request, progress, the clock and the key hint wait for a returning player.
    const fresh = !!(day.coldopen && day.coldopen.pending && day.coldopen.pending());
    if (fresh) {
      dailyEl.hidden = true; ydayEl.hidden = true; progEl.hidden = true; nextEl.hidden = true;
      el.querySelector(".hint").textContent = "";
    }
    el.classList.toggle("fresh", fresh);
    clearInterval(clockTimer);
    clockTimer = setInterval(paintClock, 1000); // the clock text only: no fetches
    try { playBtn.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
    emit("show", { via: via || "load" });
    clearTimeout(autoTimer);
    // On a phone a cold session goes straight to the roof (no title wall): `autoStart.phoneSecs`.
    const autoSecs = cfg.autoStart ? (touchy() && cfg.autoStart.phoneSecs != null ? cfg.autoStart.phoneSecs : cfg.autoStart.secs) : 0;
    if (!quiet && via === "load" && autoSecs > 0 && day.coldopen && day.coldopen.pending()) {
      autoTimer = setTimeout(() => { if (up && !quiet && setPanel.hidden && day.coldopen.pending()) play("auto"); }, autoSecs * 1000);
    }
    return true;
  }
  function hide(action, via) {
    if (!up) return false;
    up = false;
    clearInterval(clockTimer);
    html.classList.remove("title-up");
    stormStop(action === "play");
    settingsPanel(false);
    par(0, 0);
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
    clearTimeout(autoTimer);
    const auto = via === "auto";
    if (musicWanted && !auto) setSound(true); // no gesture yet on an auto-start: the browser would refuse
    const craneDone = (performance.now() - shownAt) / 1000 >= ((cfg.crane && cfg.crane.secs) || 7);
    hide("play", via);
    // A new player's first Play is the cold open (js/coldopen.js): he is the player's in this same click, on the roof.
    // An auto-start cuts the crane short, so it takes the wide push-in instead of the dive from the crane's last pose.
    if (day.coldopen && day.coldopen.pending() && day.coldopen.start(via, { fromTitle: !auto || craneDone })) return true;
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
    clearTimeout(autoTimer);
    if (musicWanted) setSound(true);
    hide("episodes", via);
    const menuBtn = document.getElementById("episodes");
    const menu = document.getElementById("episode-menu");
    if (menuBtn && !(menu && !menu.hidden)) menuBtn.click();
    return true;
  }

  // A touch acts on pointerup (the click after the same tap is swallowed), so a tap takes the roof at once.
  let tapAt = 0;
  const onTap = (btnEl, fn, via) => {
    btnEl.style.touchAction = "manipulation";
    btnEl.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      tapAt = performance.now();
      fn("touch");
    });
    btnEl.addEventListener("click", () => { if (performance.now() - tapAt > 800) fn(via); });
  };
  onTap(playBtn, play, "click");
  onTap(epBtn, episodes, "click");
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
      clearTimeout(autoTimer);
      if (up) {
        up = false;
        clearInterval(clockTimer);
        html.classList.remove("title-up");
        stormStop(false);
        settingsPanel(false);
        camera(false);
        el.hidden = true;
      }
    },
    now: () => ({
      showing: up,
      seconds: up ? (performance.now() - shownAt) / 1000 : 0,
      music: musicWanted,
      daily: dailyEl.hidden ? "" : dailyEl.textContent,
      progress: progEl.hidden ? "" : progEl.textContent,
      next: nextEl.hidden ? "" : nextEl.textContent,
      yesterday: ydayEl.hidden ? "" : ydayEl.textContent,
      sound: soundOn(),
      crane: day.world && day.world() && day.world().titleCrane ? day.world().titleCrane() : null,
      logo: cfg.logo ? "image" : "type",
      continueLabel: playBtn.textContent,
      tilt: tiltOn,
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
