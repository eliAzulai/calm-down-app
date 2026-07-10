// Mandala — kaleidoscope trails variant for Calm Station. Pass 2.
// Vanilla ES5-friendly JS. No libraries. Self-contained.
(function () {

  // Jewel box palette — sapphire / amethyst / emerald / rose-quartz / deep plum.
  var PALETTE_JEWELBOX = ['#4d6fb0', '#8b6bc9', '#4fa88a', '#c98aa0', '#6a4f9e'];
  // Ember glow — dark-bg warm, moderate saturation (amber / rust / coal-rose / ochre).
  var PALETTE_EMBERGLOW = ['#c97a4a', '#8a4f42', '#d99b5f', '#a4573f', '#6e3d3a'];
  // Northern tide — dark-bg cool teal/indigo (aurora-adjacent, muted).
  var PALETTE_NORTHERNTIDE = ['#3f8f8a', '#3a5a8f', '#5fb0a8', '#495b8c', '#2f6e6a'];
  // Twilight orchard — dusky plum/olive/mauve, evocative of dusk over trees.
  var PALETTE_TWILIGHTORCHARD = ['#7a6a4f', '#8f5a7a', '#5f7a5a', '#6a4f6e', '#9a7a5f'];

  var MOODS = [
    { id: 'jewelbox', name: 'Jewel Box', colors: PALETTE_JEWELBOX },
    { id: 'emberglow', name: 'Ember Glow', colors: PALETTE_EMBERGLOW },
    { id: 'northerntide', name: 'Northern Tide', colors: PALETTE_NORTHERNTIDE },
    { id: 'twilightorchard', name: 'Twilight Orchard', colors: PALETTE_TWILIGHTORCHARD }
  ];

  var SYMMETRIES = [
    { id: 's6', name: '6-fold', fold: 6, maxSparks: 120 },
    { id: 's8', name: '8-fold', fold: 8, maxSparks: 120 },
    { id: 's12', name: '12-fold', fold: 12, maxSparks: 80 }
  ];

  function findMood(id) {
    for (var i = 0; i < MOODS.length; i++) if (MOODS[i].id === id) return MOODS[i];
    return MOODS[0];
  }

  function findSymmetry(id) {
    for (var i = 0; i < SYMMETRIES.length; i++) if (SYMMETRIES[i].id === id) return SYMMETRIES[i];
    return SYMMETRIES[1]; // s8 default
  }

  var FOLD = 8;                 // default fold count; kept as the fallback used by legacy call sites
  // MAX_SPARKS scales down per symmetry (12-fold draws 24x per spark vs 16x
  // at 8-fold, so its cap is reduced proportionally to hold fps — see
  // SYMMETRIES[].maxSparks above; applyControl() re-derives state.maxSparks
  // whenever symmetry changes, and emitSpark()/idle() enforce that live value).
  var MAX_SPARKS = 120;          // hard cap, pre-symmetry, enforced oldest-first
  var EMIT_RATE = 30;            // sparks/sec while pointer moving
  // destination-out erase strength per frame (true transparency). NOTE: a pure
  // multiplicative erase against 8-bit canvas alpha storage has an inherent
  // rounding floor — e.g. at 0.055/frame, alpha=9 erases to round(9*0.945)=9,
  // a permanent fixed point (verified directly against a live canvas context,
  // not just modeled). Repro: paint alpha 9/255, apply destination-out at
  // 0.055 repeatedly — it never drops below 9. That is genuine, measured
  // ghost-trail residue: pixels a spark visited get stuck just above the
  // repair-round's alpha>8 gate and never clear even after the spark object
  // is long gone. 0.08 pushes that same fixed point down to alpha 6 (still
  // verified against a live canvas), safely under the gate with margin, while
  // only shortening the background canvas-trail persistence from ~0.85s to
  // ~0.58s (imperceptible change; each spark's OWN opacity is separately
  // controlled by fadeEnvelope() below and still fades over its own ~3.5s
  // life — this constant only governs how fast past-frame paint dissolves).
  // pass3 trail-trim: bumped further to 0.10 (client: "cut down the trails,
  // it looks messy" — 16-fold symmetry multiplies any smear so canvas-trail
  // persistence needed tightening beyond the pass2 residue-safety minimum).
  // Only pushes the residue fixed point further down (more margin under the
  // alpha>8 gate, not less), and shortens persistence further (~0.58s -> ~0.45s).
  var FADE_ALPHA = 0.10;
  var HOLD_EMIT_RATE = 16;       // sparks/sec spawned by the self-drawing hold spiral
  var HOLD_ROT_MAX = 0.02;       // rad/s, barely-perceptible global spin while held
  var HOLD_ROT_EASE = 1.4;       // exponential ease rate for spin ramp up/down
  // pass4 trace-fade policy: spark life was 3 + rng()*2 (3-5s), and the old
  // fadeEnvelope() below ran a single continuous smoothstep decay from age=0,
  // so a spark spent its ENTIRE life dimming rather than reading as "alive,
  // then fading" — worse, at the 4-5s end of the range that dimming stretched
  // well past the client's ~1s-bright + ~2-3s-fade budget. Target: ~1s bright
  // hold + ~2.5s fade = ~3.5s total. SPARK_HOLD_SECONDS is the fixed bright
  // duration (independent of the small per-spark life jitter kept below for
  // organic feel); fadeEnvelope() now remaps its fade math to only run AFTER
  // that hold, over whatever life remains.
  var SPARK_HOLD_SECONDS = 1.0;

  // ---- small helpers -------------------------------------------------

  function lerp(a, b, t) { return a + (b - a) * t; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function smoothstep(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ];
  }

  // RGB-cache per mood, built lazily once per mood id (moods are static data,
  // so this cache never needs invalidation). Keyed by mood.id.
  var PALETTE_RGB_CACHE = {};
  function paletteRgbFor(moodId) {
    var cached = PALETTE_RGB_CACHE[moodId];
    if (cached) return cached;
    var mood = findMood(moodId);
    var out = [];
    for (var i = 0; i < mood.colors.length; i++) out.push(hexToRgb(mood.colors[i]));
    PALETTE_RGB_CACHE[moodId] = out;
    return out;
  }

  // Smooth flowing sample across a given mood's palette (Catmull-ish linear
  // chain, wraps for continuous flow). t in [0,1). Each spark stamps its own
  // moodId at emission (see newSpark) so mood switches never repaint sparks
  // already in flight — only new sparks pick up the new palette, exactly like
  // the fold-count tagging used for symmetry transitions.
  function paletteColor(moodId, t, lum) {
    var paletteRgb = paletteRgbFor(moodId);
    var n = paletteRgb.length;
    var ft = ((t % 1) + 1) % 1; // guard negatives
    var scaled = ft * n;
    var i0 = Math.floor(scaled) % n;
    var i1 = (i0 + 1) % n;
    var frac = scaled - Math.floor(scaled);
    var c0 = paletteRgb[i0], c1 = paletteRgb[i1];
    var r = lerp(c0[0], c1[0], frac) * lum;
    var g = lerp(c0[1], c1[1], frac) * lum;
    var b = lerp(c0[2], c1[2], frac) * lum;
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  function makeRng(seed) {
    var s = seed || 12345;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return (s / 0x7fffffff);
    };
  }

  // ---- spark model -----------------------------------------------------
  // A spark is a short curving trail: a small ring buffer of recent points
  // relative to canvas center, plus angular velocity so it bends gracefully.
  // Lifetime 3-5s; alpha fades to exact zero with a wave-tail ease. Color
  // flows along the palette across the spark's lifetime (not a fixed pick).

  // size control (kid slider): continuous multiplier for a spark's base
  // stroke width, plus optional per-spark randomized jitter ("surprise
  // sizes"). Applied only at emission (see newSpark) -- a spark's width is
  // stamped once and never revisited, so per-spark jitter here is exactly
  // "surprise" with no live jump.
  function sizeFactor(state) {
    var m = (state && state.sizeMul) || 1;
    return (state && state.sizeRandom) ? m * (0.7 + Math.random() * 0.6) : m;
  }

  function newSpark(cx, cy, x, y, rng, isHold, moodId, foldCount, sizeMul) {
    var dx = x - cx, dy = y - cy;
    var r = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var ang = Math.atan2(dy, dx);
    var speed = 18 + rng() * 34;           // px/s radial-ish drift, slow-medium band
    var angVel = (rng() - 0.5) * 1.6;      // rad/s bend rate, gentle curve
    // pass4 trace-fade policy: was 3 + rng()*2 (3-5s), tightened to a ~3.5s
    // total (1s bright hold + ~2.5s fade, see SPARK_HOLD_SECONDS and the
    // rewritten fadeEnvelope()) with a little jitter kept for organic feel.
    var life = 3.3 + rng() * 0.4;          // ~3.3-3.7s
    return {
      r: r, ang: ang,
      speed: speed, angVel: angVel,
      age: 0, life: life,
      colStart: rng(),                       // starting position along palette flow
      colDrift: 0.12 + rng() * 0.18,         // how far color travels across its life
      lum: 0.85 + rng() * 0.4,              // +/- within 25% band roughly (0.85-1.25 clamped later)
      width: (1.4 + rng() * 1.8) * (sizeMul || 1), // 1.4-3.2px at the base -- size control (kid slider)
      isHold: !!isHold,
      // Stamped at emission so live control switches never glitch in-flight
      // sparks: each spark renders under whatever mood/fold it was born with,
      // for its entire life. New sparks pick up whatever is current at their
      // own emission time. This gives the required two-group transition for
      // symmetry (old fold count finishes out, new fold count starts fresh)
      // "for free" from the same mechanism used for mood aging-out.
      moodId: moodId || MOODS[0].id,
      foldCount: foldCount || FOLD,
      pts: [[r, ang]]                        // history of (radius, angle) samples
    };
  }

  // Trace control (kid chip) 'stays': once a spark has completed its bright
  // hold window (age > SPARK_HOLD_SECONDS), clamp sp.life upward so it never
  // falls behind sp.age -- this simultaneously (a) freezes fadeEnvelope's
  // lifeT at a constant ratio (steady ~55% brightness, never dimming
  // further) and (b) prevents the tick() cull (`sp.age >= sp.life`) from
  // ever firing, so the spark simply never dies. FROZEN_LIFE_RATIO is the
  // lifeT value that lands fadeEnvelope's alpha at ~0.55 of fresh (holdFrac
  // is tiny relative to 1, so fadeT ~= lifeT beyond the hold; smoothstep at
  // that fadeT gives the target alpha).
  var FROZEN_LIFE_RATIO = 0.46; // 1 - smoothstep(0.46) ~= 0.56 fresh-brightness
  function updateSpark(sp, dt, traceMode) {
    sp.age += dt;
    if (traceMode === 'stays' && sp.age > SPARK_HOLD_SECONDS) {
      // pin life so age/life never exceeds FROZEN_LIFE_RATIO past the hold --
      // holds a steady readable brightness instead of continuing to fade.
      sp.life = Math.max(sp.life, sp.age / FROZEN_LIFE_RATIO);
    }
    // ease speed down slightly over life so nothing feels mechanical/linear
    var lifeT = sp.age / sp.life;
    var ease = 1 - lifeT * 0.5;
    sp.r += sp.speed * ease * dt;
    sp.ang += sp.angVel * ease * dt;
    sp.pts.push([sp.r, sp.ang]);
    if (sp.pts.length > 4) sp.pts.shift(); // pass3: tail length down ~40% (was 6)
  }

  // Wave-tail fade: dissolves toward exact zero, with a gentle sine ripple
  // riding the tail of the fade so it reads as organic rather than linear.
  // Also returns a shrink multiplier so elements taper down as they vanish.
  //
  // pass4 trace-fade policy: previously ran base = 1 - smoothstep(lifeT) across
  // the WHOLE life span (age 0 -> life), so a spark was dimming from the very
  // moment it was born — no distinct "bright" phase, and at the top of the old
  // 3-5s life range the fade itself effectively spanned several seconds. Now
  // takes life (seconds) so it can hold at full brightness for
  // SPARK_HOLD_SECONDS, then run the same smoothstep+ripple fade only across
  // the remaining time — giving a real ~1s bright + ~2.5s fade split instead
  // of one continuous dim-from-birth curve.
  function fadeEnvelope(lifeT, life) {
    var holdFrac = clamp(SPARK_HOLD_SECONDS / life, 0, 0.9);
    var fadeT = lifeT <= holdFrac ? 0 : (lifeT - holdFrac) / (1 - holdFrac);
    var base = 1 - smoothstep(fadeT);           // smooth decay to 0, only after the hold
    var tailZone = clamp((fadeT - 0.55) / 0.45, 0, 1); // ripple only in back half of the fade
    var ripple = 1 + 0.14 * Math.sin(tailZone * Math.PI * 2.5) * (1 - tailZone);
    var alpha = clamp(base * ripple, 0, 1);
    // guarantee exact zero at end of life regardless of ripple rounding
    if (lifeT >= 1) alpha = 0;
    var shrink = lerp(1, 0.72, smoothstep(tailZone)); // gentle shrink near the tip of life
    return { alpha: alpha, shrink: shrink };
  }

  // ---- state -------------------------------------------------------------

  function init(w, h, theme) {
    var defaultSymmetry = SYMMETRIES[1]; // s8
    var state = {
      w: w, h: h,
      theme: theme,
      cx: w / 2, cy: h / 2,
      sparks: [],
      rng: makeRng(20260703),
      pointerDown: false,
      lastEmitX: null, lastEmitY: null,
      emitAccum: 0,
      holdEmitAccum: 0,
      holdT: 0,                 // seconds current press has been held
      holdSpiral: 0,            // running spiral angle offset while held
      spin: 0,                  // current global rotation (rad), eases toward target
      idleT: 0,
      bgSprite: null,           // cached offscreen radial vignette
      // ---- smart controls state ----
      // Default = moods[0] + s8, per contract. New sparks are stamped with
      // these at emission (see emitSpark/idle); existing sparks keep whatever
      // they were stamped with, so switching either control mid-flight never
      // glitches sparks already alive (two-group render during transition).
      moodId: MOODS[0].id,
      symmetryId: defaultSymmetry.id,
      fold: defaultSymmetry.fold,
      maxSparks: defaultSymmetry.maxSparks,
      sizeMul: 1, sizeRandom: false,
      traceMode: 'fades'
    };
    buildBgSprite(state);
    return state;
  }

  function buildBgSprite(state) {
    // Cache a soft radial vignette once (avoid rebuilding gradients per frame).
    //
    // IMPORTANT (repair round): this sprite is drawn with source-over EVERY
    // frame, immediately after the destination-out erase. Because the same
    // image is composited every frame, each pixel settles into a steady-state
    // alpha where the per-frame erase and the per-frame draw balance out —
    // it does NOT decay to zero on its own. A naive "faint" vignette (e.g.
    // 0.05 peak alpha) reaches a steady state around alpha 120-125/255 and
    // holds there forever, which is exactly the "trace that never clears"
    // bug the client flagged, just relocated into a background layer instead
    // of finger-trails. It also saturated the residue gate (alpha>8) from
    // frame one, making cold vs warm measurements indistinguishable.
    //
    // Fix: keep the vignette but tune its peak alpha low enough that its
    // steady state stays comfortably under the alpha>8 residue threshold
    // (steady state for erase=0.055/frame solves to roughly peak*8.9 in
    // 0-255 terms; peak 0.0008 -> steady ~3-4/255, safe margin under 8).
    // This keeps a barely-there ambient warmth without it ever registering
    // as "residue" by the contract's own measurement, and without it being
    // a permanently-visible haze independent of the fade dynamics.
    var w = state.w, h = state.h;
    var off = document.createElement('canvas');
    off.width = Math.max(1, w);
    off.height = Math.max(1, h);
    var octx = off.getContext('2d');
    var maxR = Math.sqrt(w * w + h * h) / 2;
    var grad = octx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, maxR * 0.75);
    grad.addColorStop(0, 'rgba(107,111,201,0.0008)');
    grad.addColorStop(0.5, 'rgba(79,168,138,0.0004)');
    grad.addColorStop(1, 'rgba(13,27,42,0)');
    octx.fillStyle = grad;
    octx.fillRect(0, 0, w, h);
    state.bgSprite = off;
  }

  // ---- pointer -------------------------------------------------------------

  function pointer(state, x, y, kind) {
    if (kind === 'down') {
      state.pointerDown = true;
      state.holdT = 0;
      state.holdSpiral = 0;
      state.lastEmitX = x; state.lastEmitY = y;
      state.holdX = x; state.holdY = y;
      emitSpark(state, x, y, false);
    } else if (kind === 'move') {
      if (!state.pointerDown) return;
      state.lastEmitX = x; state.lastEmitY = y;
      state.holdX = x; state.holdY = y;
      // emission rate handled by accumulator in tick via storing target pos;
      // but to feed the pattern immediately, emit right away on move too,
      // rate-limited by emitAccum threshold set in tick.
      state._pendingX = x; state._pendingY = y;
      state._pendingMove = true;
    } else if (kind === 'up') {
      state.pointerDown = false;
      state._pendingMove = false;
    }
  }

  function emitSpark(state, x, y, isHold) {
    var sp = newSpark(state.cx, state.cy, x, y, state.rng, isHold, state.moodId, state.fold, sizeFactor(state)); // size control (kid slider)
    state.sparks.push(sp);
    var cap = state.maxSparks || MAX_SPARKS;
    if (state.sparks.length > cap) {
      state.sparks.splice(0, state.sparks.length - cap);
    }
  }

  // ---- idle ambience -------------------------------------------------------

  function idle(state, w, h, dt) {
    state.idleT += dt;
    // maintain 2-3 slow autonomous orbiting sparks; spawn lazily, very sparse.
    var target = 3;
    var aliveIdle = 0;
    for (var i = 0; i < state.sparks.length; i++) {
      if (state.sparks[i].isIdle) aliveIdle++;
    }
    if (aliveIdle < target) {
      state._idleSpawnT = (state._idleSpawnT || 0) - dt;
      if (state._idleSpawnT === undefined || state._idleSpawnT <= 0) {
        state._idleSpawnT = 1.4 + state.rng() * 1.6; // sparse cadence
        var ang = state.rng() * Math.PI * 2;
        var r = Math.min(w, h) * (0.08 + state.rng() * 0.12);
        var x = state.cx + Math.cos(ang) * r;
        var y = state.cy + Math.sin(ang) * r;
        var sp = newSpark(state.cx, state.cy, x, y, state.rng, false, state.moodId, state.fold, sizeFactor(state)); // size control (kid slider)
        sp.isIdle = true;
        // pass4 trace-fade policy: was 5 + rng()*2 (5-7s, "linger a touch
        // longer" than active sparks) — that put idle sparks well outside the
        // ~3.5s bright+fade target and reads as exactly the lingering-dim-trace
        // the client flagged, just in ambient/idle form. Idle sparks now share
        // the same tightened life as active sparks.
        sp.life = 3.3 + state.rng() * 0.4; // ~3.3-3.7s, matches newSpark()
        sp.speed *= 0.5;               // gentle drift
        state.sparks.push(sp);
        var cap = state.maxSparks || MAX_SPARKS;
        if (state.sparks.length > cap) {
          state.sparks.splice(0, state.sparks.length - cap);
        }
      }
    }
  }

  // ---- tick / draw -------------------------------------------------------

  function tick(state, ctx, dt, w, h) {
    if (w !== state.w || h !== state.h) {
      state.w = w; state.h = h;
      state.cx = w / 2; state.cy = h / 2;
      buildBgSprite(state);
    }

    // Fade previous frame toward TRUE transparency (never toward an opaque
    // bg color) so no residue can ever accumulate. destination-out erases
    // existing pixels' alpha; the canvas element's own CSS background shows
    // through wherever alpha hits 0.
    // Trace control (kid chip): 'stays' skips this erase entirely so the
    // kaleidoscope trail accumulates until Clear; 'fades' (default) is the
    // pre-existing behavior, untouched.
    if (state.traceMode !== 'stays') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,' + FADE_ALPHA + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore(); // back to source-over for everything below
    }

    // ---- hold gesture: continuous self-drawing spiral + gentle global spin
    var holdTargetSpin = 0;
    if (state.pointerDown) {
      state.holdT += dt;
      holdTargetSpin = HOLD_ROT_MAX;

      state.holdSpiral += dt * 1.1; // spiral sweep speed, slow
      state.holdEmitAccum += dt;
      var holdInterval = 1 / HOLD_EMIT_RATE;
      var hx = state.holdX, hy = state.holdY;
      var baseDx = hx - state.cx, baseDy = hy - state.cy;
      var baseR = Math.sqrt(baseDx * baseDx + baseDy * baseDy) || 0.001;
      var baseAng = Math.atan2(baseDy, baseDx);
      while (state.holdEmitAccum >= holdInterval) {
        state.holdEmitAccum -= holdInterval;
        // spiral outward slowly from the held radius so the mandala visibly
        // "draws itself" from the fingertip while the gesture continues.
        var spiralAng = baseAng + state.holdSpiral;
        var spiralR = baseR * (1 + 0.06 * Math.sin(state.holdSpiral * 0.7));
        var sx = state.cx + Math.cos(spiralAng) * spiralR;
        var sy = state.cy + Math.sin(spiralAng) * spiralR;
        emitSpark(state, sx, sy, true);
      }
    } else {
      state.holdT = 0;
    }
    // ease global spin toward target (ramps up on hold, eases back to still
    // on release) — exponential smoothing, dt-based, well under 0.02 rad/s.
    var spinK = 1 - Math.exp(-HOLD_ROT_EASE * dt);
    state.spin += (holdTargetSpin - state.spin) * spinK;
    state.spinAngle = (state.spinAngle || 0) + state.spin * dt;

    // handle rate-limited emission while pointer moving
    if (state.pointerDown && state._pendingMove) {
      state.emitAccum += dt;
      var interval = 1 / EMIT_RATE;
      while (state.emitAccum >= interval) {
        state.emitAccum -= interval;
        emitSpark(state, state._pendingX, state._pendingY, false);
      }
    }

    // update + cull sparks
    var sparks = state.sparks;
    for (var i = sparks.length - 1; i >= 0; i--) {
      var sp = sparks[i];
      updateSpark(sp, dt, state.traceMode); // trace control (kid chip): 'stays' freezes life below
      if (sp.age >= sp.life) sparks.splice(i, 1);
    }

    // cached vignette (drawn once per frame, not rebuilt)
    if (state.bgSprite) ctx.drawImage(state.bgSprite, 0, 0);

    // draw each spark (foldCount rotations x mirror) around center. Each
    // spark uses its OWN stamped foldCount (from emission time), not the
    // current state.fold — this is the two-group transition: sparks born
    // before a symmetry switch keep rendering at their old fold count for
    // the rest of their life, while sparks born after the switch render at
    // the new one. Nothing ever jumps or re-renders under a different fold
    // mid-life, so there is no glitch at the switch instant.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var cx = state.cx, cy = state.cy;
    var globalRot = state.spinAngle || 0;

    for (var k = 0; k < sparks.length; k++) {
      drawSparkSymmetric(ctx, sparks[k], cx, cy, globalRot);
    }
  }

  function drawSparkSymmetric(ctx, sp, cx, cy, globalRot) {
    var pts = sp.pts;
    if (pts.length < 2) return;

    // Audio-reactive visual energy (Task A9): one bounded multiplier applied
    // at draw time only, so silence (E=0) is exactly neutral.
    var E = (window.CALM_VIS && window.CALM_VIS.energy) || 0;

    var lifeT = clamp(sp.age / sp.life, 0, 1);
    var env = fadeEnvelope(lifeT, sp.life);
    if (env.alpha <= 0.002) return;

    var colT = sp.colStart + lifeT * sp.colDrift; // flows along palette over lifetime
    var color = paletteColor(sp.moodId, colT, clamp(sp.lum, 0.75, 1.25));
    // Audio-reactive nudge (Task A9): +15% max, clamped to a 0.65 ceiling
    // (base max 0.55 * 1.15 = 0.6325, so 0.65 leaves a small safety margin).
    var alpha = Math.min(0.65, 0.55 * env.alpha * (1 + 0.15 * E));
    var width = sp.width * env.shrink;
    var fold = sp.foldCount || FOLD;

    for (var k = 0; k < fold; k++) {
      var rot = k * (Math.PI * 2 / fold) + globalRot;
      // normal orientation
      drawOneInstance(ctx, pts, cx, cy, rot, false, color, alpha, width);
      // mirrored orientation (2 * fold renders total for this spark)
      drawOneInstance(ctx, pts, cx, cy, rot, true, color, alpha, width);
    }
  }

  // Tapered stroke: draw as short segments easing lineWidth from base width
  // (tail, oldest point) down toward a fine tip (newest point), for a
  // silkier line than a single constant-width stroke.
  function drawOneInstance(ctx, pts, cx, cy, rot, mirror, color, alpha, baseWidth) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    if (mirror) ctx.scale(-1, 1);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;

    var n = pts.length;
    for (var p = 0; p < n - 1; p++) {
      var r0 = pts[p][0], a0 = pts[p][1];
      var r1 = pts[p + 1][0], a1 = pts[p + 1][1];
      var x0 = Math.cos(a0) * r0, y0 = Math.sin(a0) * r0;
      var x1 = Math.cos(a1) * r1, y1 = Math.sin(a1) * r1;
      // taper: tail (p=0) is full width, tip (newest) narrows toward ~35%
      var tTip = p / Math.max(1, n - 2);
      ctx.lineWidth = baseWidth * lerp(1, 0.35, tTip);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- smart controls --------------------------------------------------
  // Two kid-facing controls, both implemented as "stamp at emission" so a
  // live switch never repaints or glitches sparks already mid-flight:
  //  - mood: swaps which palette NEW sparks draw from; existing sparks keep
  //    aging out under whatever palette they were born with.
  //  - character (symmetry): swaps the fold count NEW sparks render at;
  //    existing sparks keep rendering at their original fold count for the
  //    rest of their life (two-group render during the transition window).
  // Neither control touches state.sparks directly — only state.moodId /
  // state.fold / state.maxSparks, which future emitSpark()/idle() calls read.

  function applyControl(state, kind, id) {
    if (kind === 'size') { state.sizeMul = Math.max(0.6, Math.min(1.6, Number(id) || 1)); return; }
    if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
    if (kind === 'trace') { state.traceMode = (id === 'stays') ? 'stays' : 'fades'; return; }
    if (kind === 'mood') {
      var mood = findMood(id);
      state.moodId = mood.id;
    } else if (kind === 'character') {
      var sym = findSymmetry(id);
      state.symmetryId = sym.id;
      state.fold = sym.fold;
      state.maxSparks = sym.maxSparks;
      // if the new cap is lower than current population, trim oldest-first
      // immediately so the live spark count never exceeds the new symmetry's
      // budget (keeps fps in bounds right away rather than waiting for
      // natural die-off).
      if (state.sparks.length > state.maxSparks) {
        state.sparks.splice(0, state.sparks.length - state.maxSparks);
      }
    }
  }

  // ---- register ------------------------------------------------------------

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['mandala'] = {
    name: 'Mandala',
    tagline: 'Press and hold to watch a jewel-toned kaleidoscope spiral outward and draw itself from your fingertip.',
    init: init,
    pointer: pointer,
    tick: tick,
    idle: idle,
    controls: {
      moods: MOODS,
      character: {
        label: 'Symmetry',
        options: [
          { id: 's6', name: '6-fold' },
          { id: 's8', name: '8-fold' },
          { id: 's12', name: '12-fold' }
        ]
      }
    },
    applyControl: applyControl
  };

})();
