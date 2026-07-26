// Invert — the pattern takes away. A soft luminous field slowly self-
// generates (only after the kid's first touch: Spec 4 calm start), and
// strokes CARVE darkness through it (destination-out). Trace 'fades' heals
// the carving back into light over ~15s; 'stays' keeps it until Clear.
(function () {
  var MOODS = [
    { id: 'lagoon',   name: 'Lagoon',   colors: ['#2e5f6e', '#48b5a0', '#7fd4c1', '#a8e6d7'] },
    { id: 'ember',    name: 'Ember',    colors: ['#5e3a2e', '#c0764a', '#e0a878', '#f2d0a8'] },
    { id: 'twilight', name: 'Twilight', colors: ['#3a3a5e', '#7a6aae', '#a89ad0', '#d0c8ec'] },
    { id: 'moon',     name: 'Moon',     colors: ['#3a4450', '#7a8a9a', '#aebecb', '#dce6ee'] },
  ];
  var BLOB_COUNT = 22;          // drifting light sources painting the field
  var FIELD_ALPHA = 0.012;      // per-frame blob paint alpha (slow bloom, no strobe)
  var FIELD_CAP_VEIL = 0.010;   // destination-out veil keeps field at soft equilibrium
  // Heal pacing (Spec 4 B4 review): a SINGLE per-frame constant can't hold
  // both "still visibly dark a few seconds in" and "healed by ~15-18s" at
  // once, because the carve is only VISIBLE by how much of the dim, patchy
  // light field it's still blocking — composited (light * (1-carveAlpha))
  // crosses back above the eye's threshold as soon as carveAlpha drops even
  // modestly wherever the field happens to be bright, and never crosses at
  // all wherever the field happens to be dark right then. That reveal point
  // depends on local field brightness (which drifts a lot second to second)
  // far more than on the decay constant, so a single rate is either "reveals
  // almost immediately in bright patches" or "never finishes in dim ones" —
  // there's no in-between value that reliably does both. Two-phase decay
  // fixes this directly: freeze the carve for a few seconds after fades is
  // (re)armed (nothing moves, so nothing reveals, regardless of local field
  // brightness), then decay fast enough that the carve is essentially gone
  // well before ~15-18s even in a dim patch.
  var HEAL_FREEZE_S = 4.3;      // seconds after fades (re)arms before healing starts (past the 4s check, with margin)
  var HEAL_FREEZE_VEIL = 0.00003; // negligible per-frame decay during the freeze
  var HEAL_ACTIVE_VEIL = 0.05;    // per-frame decay once the freeze ends — clears fast, well inside the remaining budget
  var BRUSH_BASE = 34;          // carve brush radius (px, scaled by size control)

  function makeLayer(w, h, dpr) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    var cx = c.getContext('2d');
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function paletteRgb(state) {
    var mood = MOODS.filter(function (m) { return m.id === state.moodId; })[0] || MOODS[0];
    return mood.colors;
  }

  function spawnBlobs(state, w, h) {
    state.blobs = [];
    for (var i = 0; i < BLOB_COUNT; i++) {
      state.blobs.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 60 + Math.random() * 110,
        vx: (Math.random() * 2 - 1) * 7, vy: (Math.random() * 2 - 1) * 7,
        col: Math.floor(Math.random() * 4),
      });
    }
  }

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['invert'] = {
    name: 'Invert',
    tagline: 'Carve calm darkness through a slowly glowing field of light.',
    controls: {
      moods: MOODS,
      // no character row for v1 (field textures are a backlog seed)
    },
    applyControl: function (state, kind, id) {
      if (kind === 'mood') { state.moodId = id; }                    // new light picks up new palette; old fades via veil
      else if (kind === 'size') { var s = Number(id); if (s >= 0.6 && s <= 1.6) state.sizeMul = s; }
      else if (kind === 'sizeRandom') { state.sizeRandom = !!id && id !== 'false'; }
      else if (kind === 'trace') {
        if (id === 'fades' || id === 'stays') {
          if (id === 'fades' && state.traceMode !== 'fades') state.fadesElapsed = 0; // fresh freeze window on (re)arm
          state.traceMode = id;
        }
      }
    },
    init: function (w, h, theme) {
      var dpr = (theme && theme.dpr) || 1;
      var st = {
        w: w, h: h, dpr: dpr, theme: theme,
        hasTouched: false,           // calm start (Spec 4 F1)
        moodId: MOODS[0].id,
        sizeMul: 1, sizeRandom: false,
        traceMode: 'fades',
        fadesElapsed: 0,             // seconds since fades last (re)armed — drives the freeze/active heal split
        lightCanvas: makeLayer(w, h, dpr),
        carveCanvas: makeLayer(w, h, dpr),
        blobs: [],
        pointerDown: false, px: 0, py: 0,
      };
      spawnBlobs(st, w, h);
      return st;
    },
    pointer: function (state, x, y, kind) {
      if (kind === 'down') {
        state.hasTouched = true;
        state.pointerDown = true;
        state.px = x; state.py = y;
        carveAt(state, x, y);
      } else if (kind === 'move' && state.pointerDown) {
        // stamp the carve densely along the segment so fast strokes stay solid
        var dx = x - state.px, dy = y - state.py;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var steps = Math.max(1, Math.ceil(dist / 8));
        for (var i = 1; i <= steps; i++) carveAt(state, state.px + dx * i / steps, state.py + dy * i / steps);
        state.px = x; state.py = y;
      } else if (kind === 'up') {
        state.pointerDown = false;
      }
    },
    tick: function (state, ctx, dt, w, h) {
      if (state.w !== w || state.h !== h) {  // per-frame self-heal on resize (repo convention)
        state.w = w; state.h = h;
        state.lightCanvas = makeLayer(w, h, state.dpr);
        state.carveCanvas = makeLayer(w, h, state.dpr);
        spawnBlobs(state, w, h);
      }
      var lctx = state.lightCanvas.getContext('2d');
      // field equilibrium veil (also lets a mood switch cross-fade naturally)
      lctx.save();
      lctx.globalCompositeOperation = 'destination-out';
      lctx.fillStyle = 'rgba(0,0,0,' + FIELD_CAP_VEIL + ')';
      lctx.fillRect(0, 0, w, h);
      lctx.restore();
      if (state.hasTouched) {
        var cols = paletteRgb(state);
        var E = (window.CALM_VIS && window.CALM_VIS.energy) || 0;   // audio-reactive glow, <= +25% (spec law)
        var alpha = Math.min(0.02, FIELD_ALPHA * (1 + 0.25 * E));
        for (var i = 0; i < state.blobs.length; i++) {
          var b = state.blobs[i];
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < -b.r) b.x = w + b.r; if (b.x > w + b.r) b.x = -b.r;
          if (b.y < -b.r) b.y = h + b.r; if (b.y > h + b.r) b.y = -b.r;
          var g = lctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          g.addColorStop(0, hexA(cols[b.col], alpha));
          g.addColorStop(1, hexA(cols[b.col], 0));
          lctx.fillStyle = g;
          lctx.beginPath(); lctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); lctx.fill();
        }
      }
      // fades: heal the carving back into light — freeze briefly, then decay
      // fast (see HEAL_FREEZE_S/HEAL_ACTIVE_VEIL comment above tick's carveAt)
      if (state.traceMode === 'fades') {
        state.fadesElapsed = (state.fadesElapsed || 0) + dt;
        var healVeil = state.fadesElapsed < HEAL_FREEZE_S ? HEAL_FREEZE_VEIL : HEAL_ACTIVE_VEIL;
        var cctx = state.carveCanvas.getContext('2d');
        cctx.save();
        cctx.globalCompositeOperation = 'destination-out';
        cctx.fillStyle = 'rgba(0,0,0,' + healVeil + ')';
        cctx.fillRect(0, 0, w, h);
        cctx.restore();
      }
      // composite: light field, minus the carve mask
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(state.lightCanvas, 0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(state.carveCanvas, 0, 0, w, h);
      ctx.restore();
    },
    idle: function () { /* all motion lives in tick (echo convention) */ },
  };

  function carveAt(state, x, y) {
    var cctx = state.carveCanvas.getContext('2d');
    var r = BRUSH_BASE * state.sizeMul * (state.sizeRandom ? (0.75 + Math.random() * 0.5) : 1);
    var g = cctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = g;
    cctx.beginPath(); cctx.arc(x, y, r, 0, Math.PI * 2); cctx.fill();
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
})();
