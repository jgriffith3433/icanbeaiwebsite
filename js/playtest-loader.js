/* ==========================================================================
   Playtest loader. js/playtest.js (the 12.5k-line bot) is never in a player's page: it is fetched by dynamic import
   only when the URL has ?playtest, or when the runner touches the contract (window.hawkesPlaytest) without it.
   Until playtest.js has installed the real contract, a thin stand-in answers the same surface (version, product,
   scenarios, state with ready:false, start, report, stop, input, cut) and the first call of any of them starts the load;
   once installed, the real api replaces it and the stand-in forwards to it. js/hawkes-playtest.js is unchanged.
   ========================================================================== */
(function () {
  let loading = null;
  const real = () => (window.hawkesPlaytest && window.hawkesPlaytest !== stub ? window.hawkesPlaytest : null);

  function load() {
    if (!loading) loading = import("./playtest.js").catch((e) => { loading = null; console.error("playtest failed to load", e); });
    return loading;
  }

  const stub = {
    version: 1,
    product: "icanbe",
    scenarios() { const r = real(); if (r) return r.scenarios(); load(); return []; },
    state() { const r = real(); if (r) return r.state(); load(); return { ready: false, status: "idle", note: "loading the playtest bot" }; },
    start(id, options) { const r = real(); if (r) return r.start(id, options); return load().then(() => real() && real().start(id, options)); },
    report() { const r = real(); if (r) return r.report(); load(); return { scenario: "", outcome: "stuck", seconds: 0, metrics: {}, events: [], problems: [], log: [] }; },
    stop() { const r = real(); if (r && r.stop) r.stop(); },
    input(action, down) { const r = real(); if (r && r.input) r.input(action, down); },
    cut() { const r = real(); if (r && r.cut) r.cut(); },
  };

  if (new URLSearchParams(location.search).get("playtest")) {
    /* after first paint, so the bot never competes with the shell for bandwidth */
    const go = () => load();
    requestAnimationFrame(() => requestAnimationFrame(() => (document.readyState === "complete" ? go() : addEventListener("load", go, { once: true }))));
  } else {
    /* a player's page: only the thin stand-in, so a runner that asks for the contract can still reach it */
    window.hawkesPlaytest = stub;
  }
})();
