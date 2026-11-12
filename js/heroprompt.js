/* ==========================================================================
   The hero prompt: one line floating over Small Weather once he is the player's and nobody has called any weather yet,
   so a new player sees what the game wants from them: "Hold V to call wind" (touch: "Hold Wind to call wind").
   It follows his head in the world (projected each frame, always facing the screen so it reads the right way), fades
   in after `delay` s of control, and goes at his first cast (`day:power`) for good (localStorage `icanbe.heroprompt`).
   It stays out of the way of the title, the cold open, the street's lessons, menus and cutscenes.
   `day.heroprompt`: now(), reset(); events `day:heroprompt` (show / done). Playtest: wind-fog.
   Also: the Studio beta's "report a bug" dot and "Error reported" toast are hidden on the public page (css/site.css).
   ========================================================================== */
export function startHeroPrompt() {
  const day = window.day;
  const B = window.BABYLON;
  if (!day || day.heroprompt || !B || typeof document === "undefined" || !document.body) return day && day.heroprompt;
  const world = day.world && day.world();
  if (!world || !world.scene) return null;
  const scene = world.scene;
  const html = document.documentElement;
  const KEY = "icanbe.heroprompt";
  const DELAY = 1.2;
  const HIDE = ["title-up", "cold-open", "street-wait", "ep-menu-up", "cine-up"];

  let done = false;
  try { done = localStorage.getItem(KEY) === "1"; } catch (e) { /* private mode */ }

  const style = document.createElement("style");
  style.textContent = `
.hero-prompt{position:fixed;left:0;top:0;z-index:7;transform:translate(-50%,-100%);padding:8px 16px;border-radius:999px;background:rgba(10,13,22,.74);border:1px solid rgba(126,200,255,.55);backdrop-filter:blur(6px);color:#f6f1e8;font:600 1rem/1.1 Fraunces,Georgia,serif;white-space:nowrap;text-shadow:0 2px 10px rgba(0,0,0,.55);pointer-events:none;opacity:0;transition:opacity .35s ease}
.hero-prompt.on{opacity:1;animation:hp-bob 1.6s ease-in-out infinite}
.hero-prompt[hidden]{display:none}
.hero-prompt b{color:#7ec8ff}
@keyframes hp-bob{0%,100%{margin-top:0}50%{margin-top:-5px}}
`;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.className = "hero-prompt";
  el.id = "hero-prompt";
  el.hidden = true;
  el.setAttribute("role", "status");
  document.body.appendChild(el);

  const v = new B.Vector3();
  let held = 0;
  let shown = false;
  let last = performance.now();
  const log = [];
  function emit(action) {
    log.push({ action, t: Math.round(performance.now()) });
    try { window.dispatchEvent(new window.CustomEvent("day:heroprompt", { detail: { action } })); } catch (e) { /* node */ }
  }
  function finish() {
    if (done) return;
    done = true;
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* private mode */ }
    el.classList.remove("on");
    el.hidden = true;
    shown = false;
    emit("done");
  }
  window.addEventListener("day:power", (e) => {
    const d = e && e.detail;
    if (d && d.denied) return;
    if (held > 0) finish();
  });

  const touchy = () => html.classList.contains("touch-ui") || !!(day.control && day.control.state && day.control.state().touch);
  const wording = () => (touchy() ? "Hold <b>Wind</b> to call wind" : "Hold <b>V</b> to call wind");

  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (done) return;
    const C = day.control;
    const inControl = !!(C && C.mode && C.mode() === "control");
    const blocked = HIDE.some((c) => html.classList.contains(c)) || (day.coldopen && day.coldopen.active && day.coldopen.active());
    if (!inControl || blocked) { held = 0; if (shown) { el.classList.remove("on"); shown = false; } return; }
    held += dt;
    const cam = scene.activeCamera;
    const eng = scene.getEngine();
    const canvas = eng.getRenderingCanvas();
    if (!cam || !canvas || held < DELAY) return;
    const s = C.state();
    v.set(s.x, s.y + 2.25, s.z);
    const w = eng.getRenderWidth();
    const hh = eng.getRenderHeight();
    const pr = B.Vector3.Project(v, B.Matrix.IdentityReadOnly, scene.getTransformMatrix(), cam.viewport.toGlobal(w, hh));
    const rect = canvas.getBoundingClientRect();
    if (!(pr.z > 0 && pr.z < 1)) { if (shown) { el.classList.remove("on"); shown = false; } return; }
    const x = rect.left + (pr.x * rect.width) / w;
    const y = rect.top + (pr.y * rect.height) / hh;
    el.style.left = Math.max(80, Math.min(innerWidth - 80, x)).toFixed(1) + "px";
    el.style.top = Math.max(60, y).toFixed(1) + "px";
    if (!shown) {
      el.innerHTML = wording();
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add("on");
      shown = true;
      emit("show");
    }
  });

  day.heroprompt = {
    now: () => ({ done, shown, held: Math.round(held * 10) / 10, text: el.textContent, log: log.slice() }),
    reset: () => { done = false; try { localStorage.removeItem(KEY); } catch (e) { /* */ } },
  };
  return day.heroprompt;
}

if (typeof window !== "undefined" && window.day && typeof document !== "undefined") { try { startHeroPrompt(); } catch (e) { /* the prompt is optional */ } }
