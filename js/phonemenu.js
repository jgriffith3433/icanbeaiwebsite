/* ==========================================================================
   Phone menu (js/phonemenu.js, css/hud.css "phone menu"): on a phone (`html.touch-ui`) Neighbors and Episodes live behind ONE
   44 px "Menu" button in the left column, in the left thumb's reach above the stick. A tap opens the two as a short popup;
   a tap on one of them, anywhere else, Esc, take control or let go closes it. Desktop never shows the button.
   Imported after neighbors.js / episodes.js (they append their buttons to #hud-left first).
   day.phoneMenu: open(), close(), isOpen(). Event day:phonemenu {action: open|close}.
   ========================================================================== */
(function () {
  if (typeof document === "undefined") return;
  const col = document.getElementById("hud-left");
  if (!col) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "phone-menu-btn";
  btn.className = "pm-btn";
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "Menu";
  col.append(btn);

  const isOpen = () => col.classList.contains("menu-open");
  function set(on, via) {
    if (on === isOpen()) return;
    col.classList.toggle("menu-open", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    btn.textContent = on ? "Close" : "Menu";
    window.dispatchEvent(new CustomEvent("day:phonemenu", { detail: { action: on ? "open" : "close", via: via || "api" } }));
  }
  // act on pointerup (a phone's tap) and swallow the click that follows the same tap
  let lastUp = 0;
  btn.addEventListener("pointerup", (e) => { lastUp = performance.now(); e.preventDefault(); set(!isOpen(), "touch"); });
  btn.addEventListener("click", () => { if (performance.now() - lastUp > 800) set(!isOpen(), "click"); });
  // choosing Episodes or Neighbors closes the popup after their own handlers ran
  col.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("#episodes, #neighbors-btn")) setTimeout(() => set(false, "pick"), 0); });
  document.addEventListener("pointerdown", (e) => { if (isOpen() && !col.contains(e.target)) set(false, "outside"); }, true);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) set(false, "key"); });
  window.addEventListener("day:control", () => set(false, "control"));
  window.day = window.day || {};
  window.day.phoneMenu = { open: () => set(true), close: () => set(false), isOpen };
})();
