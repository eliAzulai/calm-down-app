// Registry adapting the demo-variant contract to the app.
// Loaded FIRST in the tag order, BEFORE the seven mode files and app.js.
//
// DEVIATION FROM PLAN: the plan's original tag order was registry.js AFTER
// the seven mode files. That ordering is unsafe: CALM_MODES.list was computed
// once, eagerly, at registry-load time via ORDER.filter(...) — if registry.js
// loads last, the filter runs correctly (modes already registered), but if it
// loads first (the only safe order for the OTHER stated concern, guarding
// window.VARIANTS), list would freeze as empty before any mode files run.
// Fixed by loading registry.js FIRST and making `list` a lazy ES5 getter that
// re-filters window.VARIANTS on every read, so it's correct regardless of how
// many mode files have registered by the time app.js first reads it.
//
// app.js consumes CALM_MODES.get(id); .list serves tests and tray UIs.
// and the shared CALM_VIS energy feed (populated by app.js audio code).

window.VARIANTS = window.VARIANTS || {};
window.CALM_VIS = { energy: 0 }; // audio-reactivity feed; app.js writes, modes read

(function () {
  var ORDER = ['echo', 'currents', 'orbits', 'mandala', 'bloom', 'morph', 'etch', 'invert'];

  window.CALM_MODES = {
    get list() { return ORDER.filter(function (id) { return !!window.VARIANTS[id]; }); },
    get: function (id) { return window.VARIANTS[id] || null; },
  };
})();
