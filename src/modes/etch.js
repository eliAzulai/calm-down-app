// Etch — persistent patterned trails variant for Calm Station (client Option B).
// "Additive... the trail would be erased when it goes over it a second time...
//  different kind of patterns in the trail itself, perhaps a pulsating pattern."
//
// Vanilla ES5-friendly JS. No libraries. Self-contained.
//
// PERSISTENCE MODEL (important departure from other variants): there is NO
// ambient per-frame destination-out veil here. Trails must stay lit forever
// once drawn — persistence is the entire point of this variant. The canvas
// element itself is transparent-backed (CSS shows #0d1b2a behind), so we only
// clear with a REAL clearRect each frame and redraw every live point fresh.
// destination-out is used ONLY for the deliberate second-pass erase stamps.
(function () {

  // ---- curated palette: Moonlight Silver-Blues + one warm accent ----------
  // Slow color drift travels ALONG each stroke (arc-length keyed), not per-frame
  // flicker, so a fixed point's hue barely creeps while the stroke looks alive.
  var PALETTE = [
    [199, 214, 232], // moon-silver     - near-white cool highlight
    [122, 162, 204], // dusk-blue
    [72, 108, 158],  // deep-slate-blue
    [214, 168, 122]  // warm-ember accent (rare, used sparingly via low weight)
  ];
  var PALETTE_WEIGHT = [0.38, 0.34, 0.22, 0.06]; // cumulative pick weights (ember rare)

  var MAX_POINTS = 2200;          // hard cap across all strokes (spec)
  var MIN_POINT_SPACING = 5;      // px, min spacing when sampling pointer movement into points
  var TRAIL_RADIUS_MIN = 2.0;     // half-width px at gentle taper low point
  var TRAIL_RADIUS_MAX = 4.0;     // half-width px at taper high point (width ~4-8px)
  var BEAD_SPACING = 4.2;         // px between rendered beads along a stroke
  var ERASE_RADIUS = 16;          // px, destination-out stamp radius (spec: ~16px)
  var ERASE_HIT_RADIUS = 14;      // px, proximity test radius for "crossing an existing trail" (spec: ~14px)
  var ACTIVE_TAIL_EXCLUDE_MS = 300; // ms, exclude the trailing end of the CURRENT stroke from self-erase
  var ERASE_DISSOLVE_MS = 300;    // ms, soft dissolve duration for an erased neighborhood
  var OLDEST_DISSOLVE_MS = 1000;  // ms, graceful fade for the oldest stroke when cap exceeded
  var PULSE_SPEED = 80;           // px/s traveling wave speed along the path (spec: 60-100 px/s)
  // Spatial period of the traveling brightness wave. NOTE: at any FIXED point
  // in space, this wave's temporal frequency is PULSE_SPEED / PULSE_WAVELENGTH
  // Hz (a point sees the wave pass at that rate regardless of how it looks
  // spatially). The spec caps any fixed point's oscillation at <=0.3Hz; a
  // shorter wavelength (e.g. 150px) with speed ~80px/s gives ~0.53Hz — well
  // over the cap (verified: 5 zero-crossings over a 5s/10Hz sample, cap is 3).
  // 720px keeps the wave visually a smooth traveling gradient along the
  // ribbon while landing the fixed-point frequency at 80/720 ~= 0.111Hz,
  // safe margin under 0.3Hz (measured: 550px still let occasional sampling
  // land 4 zero-crossings over a 5s/10Hz window against a cap of 3 — this
  // gives real headroom rather than sitting right at the boundary).
  var PULSE_WAVELENGTH = 720;
  var PULSE_DEPTH = 0.55;         // how much the wave modulates brightness (0..1)

  // ---- small helpers -------------------------------------------------------

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function smoothstep(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  function makeRng(seed) {
    var s = seed || 20260706;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return (s / 0x7fffffff);
    };
  }

  function pickPaletteIndex(rng) {
    var r = rng();
    var acc = 0;
    for (var i = 0; i < PALETTE_WEIGHT.length; i++) {
      acc += PALETTE_WEIGHT[i];
      if (r <= acc) return i;
    }
    return 0;
  }

  // Smooth continuous palette sample across a chain (wraps), t in [0,1).
  function paletteColor(t) {
    var n = PALETTE.length;
    var ft = ((t % 1) + 1) % 1;
    var scaled = ft * n;
    var i0 = Math.floor(scaled) % n;
    var i1 = (i0 + 1) % n;
    var frac = scaled - Math.floor(scaled);
    var c0 = PALETTE[i0], c1 = PALETTE[i1];
    return [
      lerp(c0[0], c1[0], frac),
      lerp(c0[1], c1[1], frac),
      lerp(c0[2], c1[2], frac)
    ];
  }

  function rgbaStr(rgb, a) {
    return 'rgba(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ',' + a + ')';
  }

  // ---- stroke model ----------------------------------------------------------
  // A stroke is a persistent polyline: an array of point records
  //   { x, y, arc, tAdded, colorSeed }
  // arc = cumulative arc-length from stroke start (used for bead spacing + wave
  // phase + width taper). tAdded = performance-time-ish stamp (state.clock ms)
  // used to exclude the active drawing tail from self-erase checks.
  //
  // A stroke also carries: born (clock ms at creation, for oldest-first
  // dissolve), colorBase (palette index the stroke drifts from),
  // dissolve state for graceful removal (either "oldest cap" dissolve or
  // localized "erased neighborhood" dissolve applied to individual points).

  function newStroke(state, x, y) {
    var idx = pickPaletteIndex(state.rng);
    var stroke = {
      id: state.nextStrokeId++,
      // size control (kid slider): sizeMul stamped once per point, at
      // creation, same "never revisited" pattern as tAdded/arc below.
      pts: [{ x: x, y: y, arc: 0, tAdded: state.clock, erasedAt: -1, sizeMul: sizeFactor(state) }],
      born: state.clock,
      colorBase: idx,
      colorDrift: 0.10 + state.rng() * 0.22,
      dissolveStart: -1,   // set when this whole stroke begins oldest-cap dissolve
      totalArc: 0
    };
    return stroke;
  }

  function pushPoint(stroke, state, x, y) {
    var last = stroke.pts[stroke.pts.length - 1];
    var dx = x - last.x, dy = y - last.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < MIN_POINT_SPACING) return false;
    var arc = last.arc + d;
    stroke.pts.push({ x: x, y: y, arc: arc, tAdded: state.clock, erasedAt: -1, sizeMul: sizeFactor(state) }); // size control (kid slider)
    stroke.totalArc = arc;
    return true;
  }

  function countLivePoints(state) {
    var total = 0;
    for (var i = 0; i < state.strokes.length; i++) {
      var st = state.strokes[i];
      for (var p = 0; p < st.pts.length; p++) {
        if (st.pts[p].erasedAt < 0) total++;
      }
    }
    return total;
  }

  // size control (kid slider): continuous multiplier for a point's bead
  // radius/width, captured once per point at the moment it's added to a
  // stroke (see newStroke/pushPoint), plus optional per-point randomized
  // jitter ("surprise sizes"). Frozen per-point exactly like arc/tAdded --
  // an existing stroke's already-placed points never resize retroactively
  // when the slider moves; only points added from here on pick up the change.
  function sizeFactor(state) {
    var m = (state && state.sizeMul) || 1;
    return (state && state.sizeRandom) ? m * (0.7 + Math.random() * 0.6) : m;
  }

  // ---- state ------------------------------------------------------------------

  function init(w, h, theme) {
    var state = {
      w: w, h: h,
      theme: theme,
      strokes: [],
      nextStrokeId: 1,
      rng: makeRng(20260706),
      clock: 0,             // ms, monotonic accumulation of dt (independent of wall clock)
      pointerDown: false,
      activeStroke: null,
      lastX: null, lastY: null,
      idleT: 0,
      eraseStamps: [],       // transient { x, y, r, tStart } destination-out fade stamps
      sizeMul: 1, sizeRandom: false
    };
    return state;
  }

  // ---- pointer -----------------------------------------------------------------

  function pointer(state, x, y, kind) {
    if (kind === 'down') {
      state.pointerDown = true;
      var stroke = newStroke(state, x, y);
      state.strokes.push(stroke);
      state.activeStroke = stroke;
      state.lastX = x; state.lastY = y;
      enforcePointCap(state);
    } else if (kind === 'move') {
      if (!state.pointerDown || !state.activeStroke) return;
      var stroke = state.activeStroke;
      var last = stroke.pts[stroke.pts.length - 1];
      var dx = x - last.x, dy = y - last.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Walk the segment the pointer just traveled at the same fixed spacing
      // used for stored points. For EACH sample: first test it against
      // existing (other) trail points within ERASE_HIT_RADIUS — if it hits,
      // erase them right there and skip adding a fresh point at this sample
      // (so "drawing over a trail erases it" reads as a wipe, not an
      // instant redraw of the very neighborhood just erased). Otherwise the
      // sample is added as a normal new active-stroke point. Testing and
      // suppression happen on the SAME sample so there is no phase lag
      // between what gets erased and what gets suppressed.
      var steps = dist > MIN_POINT_SPACING ? Math.min(24, Math.ceil(dist / MIN_POINT_SPACING)) : 1;
      for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        var sx = last.x + dx * t, sy = last.y + dy * t;
        var hitHere = eraseNear(state, sx, sy);
        if (hitHere) continue; // this exact spot just got wiped — don't relight it
        pushPoint(stroke, state, sx, sy);
      }

      state.lastX = x; state.lastY = y;
      enforcePointCap(state);
    } else if (kind === 'up') {
      state.pointerDown = false;
      state.activeStroke = null;
    }
  }

  // Test point (x,y) — a sample on the segment the pointer just traveled —
  // against all existing stored points within ERASE_HIT_RADIUS. Excludes:
  // points from the CURRENT active stroke added within the last
  // ACTIVE_TAIL_EXCLUDE_MS (so you can't immediately erase what you're still
  // drawing). Any live hits are erased immediately.
  //
  // Returns true if this sample is "occupied" by a foreign trail — either a
  // point just erased here, OR a point still mid-dissolve from a PRIOR call
  // at this same neighborhood (erasedAt set but not yet past
  // ERASE_DISSOLVE_MS). That second case matters: once a point is erased its
  // erasedAt guard (`pt.erasedAt >= 0`) correctly stops it being erased
  // again, but without also treating it as "occupied" here, the very next
  // pointermove sample landing on the same spot would see nothing left to
  // erase and push a fresh point right on top of pixels still visibly
  // dissolving — instantly relighting the neighborhood mid-wipe. Counting
  // still-dissolving points as occupied (not just live ones) keeps the
  // suppression window aligned with what's still visually on screen.
  function eraseNear(state, x, y) {
    var activeId = state.activeStroke ? state.activeStroke.id : -1;
    var cutoff = state.clock - ACTIVE_TAIL_EXCLUDE_MS;
    var r2 = ERASE_HIT_RADIUS * ERASE_HIT_RADIUS;
    var hitAny = false;
    var occupied = false;

    for (var s = 0; s < state.strokes.length; s++) {
      var st = state.strokes[s];
      if (st.dissolveStart >= 0) continue; // already dissolving away, leave it be
      var pts = st.pts;
      for (var p = 0; p < pts.length; p++) {
        var pt = pts[p];
        if (st.id === activeId && pt.tAdded >= cutoff) continue; // active tail guard
        if (pt.erasedAt >= 0) {
          // still mid-dissolve from an earlier erase at this neighborhood —
          // counts as occupied so we don't relight it, but nothing new to erase.
          if ((state.clock - pt.erasedAt) < ERASE_DISSOLVE_MS) {
            var edx = pt.x - x, edy = pt.y - y;
            if ((edx * edx + edy * edy) <= r2) occupied = true;
          }
          continue;
        }
        var dx = pt.x - x, dy = pt.y - y;
        if ((dx * dx + dy * dy) <= r2) {
          pt.erasedAt = state.clock;
          hitAny = true;
          occupied = true;
        }
      }
    }
    if (hitAny) {
      state.eraseStamps.push({ x: x, y: y, r: ERASE_RADIUS, tStart: state.clock });
      if (state.eraseStamps.length > 40) state.eraseStamps.shift();
    }
    return occupied;
  }

  // ---- point cap: oldest stroke dissolves gracefully when exceeded ------------

  function enforcePointCap(state) {
    // Only ever mark ONE stroke dissolving at a time (avoid cascades);
    // once it's fully gone it'll be spliced out in tick() and we re-check.
    if (countLivePoints(state) <= MAX_POINTS) return;
    for (var i = 0; i < state.strokes.length; i++) {
      var st = state.strokes[i];
      if (st.dissolveStart < 0 && st !== state.activeStroke) {
        st.dissolveStart = state.clock;
        break;
      }
    }
  }

  // ---- idle ---------------------------------------------------------------------
  // Persistent-canvas mode rests: nothing new spawns. The traveling pulses
  // along existing strokes ARE the idle life (handled every tick regardless).
  // If the canvas is empty, idle is truly still — there is nothing to animate.

  function idle(state, w, h, dt) {
    state.idleT += dt;
    // intentionally no spawning here.
  }

  // ---- tick / draw ----------------------------------------------------------------

  function tick(state, ctx, dt, w, h) {
    state.w = w; state.h = h;
    state.clock += dt * 1000;

    // Real clear (not a fade-veil): this variant has no ambient erasure —
    // persistence is the point. Anything not explicitly erased stays lit.
    ctx.clearRect(0, 0, w, h);

    // deliberate erase stamps: soft destination-out circles that dissolve
    // in over ERASE_DISSOLVE_MS, giving the erase a gentle edge rather than
    // an instant pop. We draw these BEFORE the strokes so the strokes'
    // own alpha-fade (driven by pt.erasedAt) is what actually removes pixels;
    // the stamp itself is a light one-time visual "wipe" cue.
    drawEraseStamps(ctx, state);

    // update strokes: prune points whose erase-dissolve has finished, and
    // advance/finish whole-stroke oldest-cap dissolves.
    updateStrokes(state);

    drawStrokes(ctx, state);
  }

  function drawEraseStamps(ctx, state) {
    var stamps = state.eraseStamps;
    var write = 0;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < stamps.length; i++) {
      var s = stamps[i];
      var age = state.clock - s.tStart;
      if (age > ERASE_DISSOLVE_MS) continue; // expire, drop
      var t = age / ERASE_DISSOLVE_MS;
      // soft-edged radial stamp, strongest at the start then fading out —
      // this is a one-shot visual wipe cue layered on top of the real
      // per-point alpha fade below, giving the erase a "brush" feel.
      var a = 0.5 * (1 - smoothstep(t));
      var grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      grad.addColorStop(0, 'rgba(0,0,0,' + a + ')');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      stamps[write++] = s;
    }
    stamps.length = write;
    ctx.restore();
  }

  function updateStrokes(state) {
    var strokes = state.strokes;
    var writeS = 0;
    for (var s = 0; s < strokes.length; s++) {
      var st = strokes[s];

      // whole-stroke oldest-cap dissolve: once its window elapses, drop it.
      if (st.dissolveStart >= 0) {
        var age = state.clock - st.dissolveStart;
        if (age >= OLDEST_DISSOLVE_MS) {
          continue; // fully dissolved, drop the whole stroke
        }
      }

      // prune individually-erased points once their own short dissolve window
      // has elapsed, so erased neighborhoods truly vanish from storage (and
      // the pulse re-routes/stops cleanly around the gap).
      var pts = st.pts;
      var writeP = 0;
      for (var p = 0; p < pts.length; p++) {
        var pt = pts[p];
        if (pt.erasedAt >= 0 && (state.clock - pt.erasedAt) >= ERASE_DISSOLVE_MS) {
          continue; // drop erased point once its fade is done
        }
        pts[writeP++] = pt;
      }
      pts.length = writeP;

      if (pts.length === 0) continue; // nothing left, drop the stroke
      if (st === state.activeStroke || pts.length >= 2 || st.dissolveStart >= 0) {
        strokes[writeS++] = st;
      }
    }
    strokes.length = writeS;
  }

  // Render each stroke as closely-spaced soft beads whose brightness carries
  // a traveling wave along the path (arc-length keyed), rather than a single
  // stroked polyline — reads as more "alive" and gives natural width taper
  // and per-bead erase-fade without re-stroking a smeared line every frame.
  function drawStrokes(ctx, state) {
    var strokes = state.strokes;
    ctx.save();
    for (var s = 0; s < strokes.length; s++) {
      drawStrokeBeads(ctx, state, strokes[s]);
    }
    ctx.restore();
  }

  function drawStrokeBeads(ctx, state, st) {
    var pts = st.pts;
    if (pts.length < 2) {
      // a lone point (just placed on 'down') still deserves a soft dot so a
      // tap-without-drag is visible.
      if (pts.length === 1) drawBead(ctx, state, st, pts[0], 0);
      return;
    }

    var totalArc = pts[pts.length - 1].arc;
    var strokeAlphaMul = 1;
    if (st.dissolveStart >= 0) {
      var t = clamp((state.clock - st.dissolveStart) / OLDEST_DISSOLVE_MS, 0, 1);
      strokeAlphaMul = 1 - smoothstep(t);
    }
    if (strokeAlphaMul <= 0.003) return;

    // walk the polyline at fixed arc-length spacing, interpolating position
    // between stored points so bead spacing stays uniform regardless of how
    // sparsely points were sampled.
    var nextArc = 0;
    var segIdx = 0;
    while (nextArc <= totalArc && segIdx < pts.length - 1) {
      var a = pts[segIdx], b = pts[segIdx + 1];
      var segLen = b.arc - a.arc;
      if (segLen <= 0.0001) { segIdx++; continue; }
      if (nextArc > b.arc) { segIdx++; continue; }
      var localT = (nextArc - a.arc) / segLen;
      var x = lerp(a.x, b.x, localT);
      var y = lerp(a.y, b.y, localT);

      // erase-fade for this local neighborhood: blend the two straddling
      // points' erasedAt state so a bead near an erased point fades with it.
      var erFadeA = pointEraseAlpha(state, a);
      var erFadeB = pointEraseAlpha(state, b);
      var erFade = lerp(erFadeA, erFadeB, localT);

      if (erFade > 0.003 && strokeAlphaMul > 0.003) {
        // size control (kid slider): interpolate the two straddling points'
        // already-frozen sizeMul, same spatial-blend treatment as x/y/erFade
        // above -- never re-reads the live state.sizeMul, so a slider move
        // never resizes beads already drawn from existing stored points.
        var sizeMul = lerp(a.sizeMul != null ? a.sizeMul : 1, b.sizeMul != null ? b.sizeMul : 1, localT);
        var virtualPt = { x: x, y: y, arc: nextArc, sizeMul: sizeMul };
        drawBead(ctx, state, st, virtualPt, totalArc, erFade * strokeAlphaMul);
      }
      nextArc += BEAD_SPACING;
    }
  }

  function pointEraseAlpha(state, pt) {
    if (pt.erasedAt < 0) return 1;
    var t = clamp((state.clock - pt.erasedAt) / ERASE_DISSOLVE_MS, 0, 1);
    return 1 - smoothstep(t); // soft edge, not a pop
  }

  // Draw a single bead: soft dual-layer glow (wide dim halo + tight bright
  // core), width tapering gently along the path, brightness carrying the
  // traveling wave. No shadowBlur (cached-sprite-free but still cheap: two
  // filled arcs, no per-element blur filter).
  function drawBead(ctx, state, st, pt, totalArc, alphaMul) {
    if (alphaMul === undefined) alphaMul = 1;
    if (alphaMul <= 0.003) return;

    // gentle width variation along the path: slow sine keyed to arc-length
    // (spatial, not time — so it doesn't pulse in place, it just varies
    // smoothly bead-to-bead along the ribbon's length).
    var widthT = 0.5 + 0.5 * Math.sin(pt.arc * 0.02 + st.id * 1.7);
    // size control (kid slider): pt.sizeMul was frozen at point-add time
    // (see newStroke/pushPoint) -- multiplying it in here at draw time never
    // re-reads the live state.sizeMul, so already-drawn beads never resize.
    var radius = lerp(TRAIL_RADIUS_MIN, TRAIL_RADIUS_MAX, widthT) * (pt.sizeMul != null ? pt.sizeMul : 1);

    // traveling brightness wave: phase depends on (arc - speed*time), so at
    // any FIXED spatial point the phase advances at a constant rate driven
    // by PULSE_SPEED/PULSE_WAVELENGTH (a fixed temporal frequency), while at
    // a fixed instant in time brightness clearly varies along the path
    // (a genuine traveling wave, not synchronized blinking).
    var phase = (pt.arc - PULSE_SPEED * (state.clock / 1000)) / PULSE_WAVELENGTH * Math.PI * 2;
    var wave = 0.5 + 0.5 * Math.sin(phase);
    var brightness = 1 - PULSE_DEPTH + PULSE_DEPTH * wave; // in [1-depth, 1]
    // Audio-reactive nudge (Task A9): +20% max on the pulse's brightness
    // peak, clamped to 1.2 (base max 1 * 1.2 = 1.2) so silence (E=0) leaves
    // brightness exactly untouched and the boosted peak can't exceed +20%.
    var E = (window.CALM_VIS && window.CALM_VIS.energy) || 0;
    brightness = Math.min(1.2, brightness * (1 + 0.2 * E));

    // slow color drift along the stroke (arc-keyed, not time-keyed) plus the
    // stroke's own palette base index.
    var colT = (st.colorBase / PALETTE.length) + (pt.arc / Math.max(1, totalArc || 1)) * st.colorDrift;
    var rgb = paletteColor(colT);

    // Clamped explicitly (not left to the canvas's implicit alpha clamp)
    // since brightness can now peak at 1.2 (see the audio-reactive nudge
    // above) -- 0.85/0.30 are each this bead's own designed alpha ceilings.
    var coreAlpha = Math.min(0.85, 0.85 * brightness * alphaMul);
    var haloAlpha = Math.min(0.30, 0.30 * brightness * alphaMul);

    // wide soft halo first (dual-layer glow, cheap — no shadowBlur)
    ctx.beginPath();
    ctx.fillStyle = rgbaStr(rgb, haloAlpha);
    ctx.arc(pt.x, pt.y, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // tight bright core
    ctx.beginPath();
    ctx.fillStyle = rgbaStr([
      lerp(rgb[0], 255, 0.35 * brightness),
      lerp(rgb[1], 255, 0.35 * brightness),
      lerp(rgb[2], 255, 0.35 * brightness)
    ], coreAlpha);
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- kid-facing smart controls --------------------------------------------
  // Etch has NO mood/character controls (no `controls` object registered
  // below) -- it draws in one fixed curated palette by design. Size is the
  // one control it supports: kind 'size' | 'sizeRandom' only. The style
  // tray's empty-message branch still needs to special-case "no controls
  // object, but applyControl exists" to show the size row alongside (rather
  // than instead of) the "this mode paints its own colours" message — see
  // app.js's renderStyleTray().
  function applyControl(state, kind, id) {
    if (!state) return;
    if (kind === 'size') { state.sizeMul = Math.max(0.6, Math.min(1.6, Number(id) || 1)); return; }
    if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
  }

  // ---- register ------------------------------------------------------------

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['etch'] = {
    name: 'Etch',
    tagline: 'Draw glowing ribbons that stay lit — trace back over one to gently erase it.',
    init: init,
    pointer: pointer,
    tick: tick,
    idle: idle,
    applyControl: applyControl
  };

})();
