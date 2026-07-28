// Pond variant for Calm Station (Spec 5 F1).
// "Like when you drop a pebble, you get these ripples, concentric circles,
//  going out from each other and perhaps overlapping and each time you touch
//  it... it makes a nice sound... different variations depending on how long
//  you held it" -- still water. Every touch drops a pebble: a wave TRAIN of
// concentric rings expands from the point and overlapping trains brighten
// where they cross ('lighter' compositing, low per-ring alpha so crossings
// glow instead of flash). Holding is a finger resting in the water (charge
// glow + faint slow rings); releasing a held touch drops a heavier stone
// (bigger, faster train). Dragging leaves a wake of micro-rings.
//
// Sound: each pebble pings through window.CALM_CHIME (app.js, Spec 5 F2) --
// pitch from touch height, stereo from touch x, and a deeper, longer tone
// the longer the hold. Idle droplets are ALWAYS silent: sound only ever
// follows the kid's own touch, never ambushes.
//
// Rings always fade -- transience is the mode's identity, so pond is exempt
// from the Trace control the same way echo/etch are (persistence exemption,
// inverted). tick() fully clears and redraws each frame: drains to a clean
// canvas by construction (phase10 law).
//
// Vanilla ES5-friendly JS. No libraries. Single file. See window.VARIANTS['pond'].
(function () {

  // ---- moods: 4 curated water palettes (echo/invert pattern). New rings
  // sample the active mood; already-live rings keep the color they were born
  // with (a mood switch re-tints the water from the next pebble on).
  var MOODS = [
    {
      id: 'moonpool',
      name: 'Moonpool',
      // deep night water: indigo -> steel -> silver -> moonlight
      colors: ['#4a5a8e', '#5c86b5', '#8fb8d8', '#d8e8f2']
    },
    {
      id: 'seaglass',
      name: 'Seaglass',
      // aqua/seafoam walk, calm and watery
      colors: ['#2e8e7e', '#48b5a0', '#7fd4c1', '#b8ecdf']
    },
    {
      id: 'koi',
      name: 'Koi',
      // warm garden pond: coral -> amber -> blush -> gold
      colors: ['#e08a5e', '#f0b060', '#e88a8a', '#f5d8a0']
    },
    {
      id: 'aurora',
      name: 'Aurora',
      // violet/green northern water
      colors: ['#7a6ae0', '#50c0a8', '#a88ae8', '#78e0c8']
    }
  ];
  function findMood(id) {
    for (var i = 0; i < MOODS.length; i++) if (MOODS[i].id === id) return MOODS[i];
    return MOODS[0];
  }

  // ---- tuning constants (all paces inside the calm caps) ---------------------
  var RING_SPEED = 140;        // px/s wavefront expansion (tap train)
  var RING_LIFE = 2.2;         // s, tap ring lifetime
  var TRAIN_GAP = 0.12;        // s between rings born into one train
  var TAP_RINGS = 3;           // rings per tap train
  var BURST_RINGS_MAX = 5;     // rings per fully-charged release train
  var CHARGE_START = 0.35;     // s held before a release counts as charged
  var CHARGE_FULL = 1.4;       // s held for full charge
  var HOLD_EMIT_EVERY = 0.7;   // s between faint rings while resting a finger
  var WAKE_SPACING = 28;       // px dragged between silent wake micro-rings
  var IDLE_DROP_MIN = 7;       // s between ambient droplets (calm-start gated)
  var IDLE_DROP_MAX = 12;
  var MAX_RINGS = 90;          // hard cap; oldest culled (multi-touch mash safety)

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ];
  }
  var PALETTE_RGB_CACHE = {};
  function paletteRgbFor(moodId) {
    var cached = PALETTE_RGB_CACHE[moodId];
    if (cached) return cached;
    var mood = findMood(moodId);
    var out = new Array(mood.colors.length);
    for (var i = 0; i < mood.colors.length; i++) out[i] = hexToRgb(mood.colors[i]);
    PALETTE_RGB_CACHE[moodId] = out;
    return out;
  }
  function rgbStr(rgb, a) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
  }

  // size control (kid slider): continuous multiplier for new trains, plus the
  // standard per-spawn random roll when surprise sizes is on (echo's split:
  // rolled once per PEBBLE at spawn, never per-frame, so nothing jitters).
  function sizeFactor(state) {
    var m = state.sizeMul || 1;
    return state.sizeRandom ? m * (0.7 + Math.random() * 0.6) : m;
  }

  // ---- ring + train spawning -------------------------------------------------
  // A ring is born with a `delay` (its position in the wave train); it neither
  // draws nor expands until the delay runs out, then expands at constant speed
  // while its alpha decays -- constant wavefront speed with fading amplitude is
  // what reads as water rather than fireworks.
  function pushRing(state, ring) {
    state.rings.push(ring);
    if (state.rings.length > MAX_RINGS) state.rings.splice(0, state.rings.length - MAX_RINGS);
  }

  function spawnTrain(state, x, y, charge) {
    var size = sizeFactor(state);
    var rgbArr = paletteRgbFor(state.moodId);
    var rgb = rgbArr[state.trainCount % rgbArr.length];
    state.trainCount++;
    var n = charge > 0
      ? Math.min(BURST_RINGS_MAX, 4 + Math.round(charge))
      : TAP_RINGS;
    var boost = 1 + 0.6 * charge; // charged stones ripple bigger and faster
    for (var i = 0; i < n; i++) {
      pushRing(state, {
        x: x, y: y,
        r: 6,
        speed: RING_SPEED * boost * size,
        life: RING_LIFE + 0.8 * charge,
        maxLife: RING_LIFE + 0.8 * charge,
        delay: i * TRAIN_GAP,
        width: (2.5 + 1.2 * charge) * size,
        // amplitude decays through the train: trailing rings are fainter
        alpha0: 0.5 * (1 - 0.16 * i),
        rgb: rgb
      });
    }
  }

  // Faint solitary ring: resting-finger emission, drag wake, idle droplet.
  function spawnFaintRing(state, x, y, scale) {
    var rgbArr = paletteRgbFor(state.moodId);
    pushRing(state, {
      x: x, y: y,
      r: 4,
      speed: 60 * scale * (state.sizeMul || 1),
      life: 1.2, maxLife: 1.2,
      delay: 0,
      width: 1.5,
      alpha0: 0.18,
      rgb: rgbArr[state.trainCount % rgbArr.length]
    });
  }

  function chargeOf(hold) {
    return clamp((hold.t - CHARGE_START) / (CHARGE_FULL - CHARGE_START), 0, 1);
  }

  // Sound is optional plumbing: guard every call so pond stays a fully
  // working silent mode if CALM_CHIME is absent (app.js not loaded, Web
  // Audio unavailable, future harness contexts).
  function ping(state, x, y, depth, pressure) {
    if (!(window.CALM_CHIME && window.CALM_CHIME.ping)) return;
    var press = (typeof pressure === 'number' && pressure > 0 && pressure <= 1) ? pressure : 0.5;
    window.CALM_CHIME.ping({
      pitch: 1 - clamp(y / (state.h || 1), 0, 1), // higher on screen = higher note
      intensity: press,
      depth: depth,
      pan: clamp((x / (state.w || 1)) * 2 - 1, -1, 1)
    });
  }

  // ---- variant registration --------------------------------------------------
  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['pond'] = {
    name: 'Pond',
    tagline: 'Drop pebbles into still water — every ripple sings.',

    // Mood + Size only. No character; no trace (rings always fade -- the
    // pond's transience IS its identity, mirror-image of echo's exemption).
    controls: {
      moods: MOODS
    },

    applyControl: function (state, kind, id) {
      if (!state) return;
      if (kind === 'mood') { state.moodId = findMood(id).id; return; }
      if (kind === 'size') { var s = Number(id); if (s >= 0.6 && s <= 1.6) state.sizeMul = s; return; }
      if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
    },

    init: function (w, h, theme) {
      return {
        w: w, h: h,
        theme: theme,
        hasTouched: false,           // calm start (Spec 4 F1): no idle droplets pre-touch
        moodId: MOODS[0].id,
        sizeMul: 1, sizeRandom: false,
        rings: [],
        holds: {},                   // pointerId -> {x, y, t, emitT, wakeX, wakeY, pressure}
        trainCount: 0,
        idleT: 0,
        idleNext: IDLE_DROP_MIN + Math.random() * (IDLE_DROP_MAX - IDLE_DROP_MIN),
        time: 0
      };
    },

    // meta ({id, pressure}) is the Spec 5 dispatcher extension -- older modes
    // ignore it; pond needs pointer identity for per-finger hold charging.
    pointer: function (state, x, y, kind, meta) {
      var id = (meta && meta.id != null) ? meta.id : 'solo';
      if (kind === 'down') {
        state.hasTouched = true;
        state.holds[id] = {
          x: x, y: y, t: 0, emitT: 0,
          wakeX: x, wakeY: y,
          pressure: meta ? meta.pressure : 0.5
        };
        // Contact splash: the finger entering the water is itself a pebble.
        spawnTrain(state, x, y, 0);
        ping(state, x, y, 0, state.holds[id].pressure);
      } else if (kind === 'move') {
        var hm = state.holds[id];
        if (!hm) return;
        hm.x = x; hm.y = y;
        if (meta && typeof meta.pressure === 'number') hm.pressure = meta.pressure;
        // Drag wake: silent micro-rings trail the finger through the water.
        var dx = x - hm.wakeX, dy = y - hm.wakeY;
        if (dx * dx + dy * dy >= WAKE_SPACING * WAKE_SPACING) {
          spawnFaintRing(state, x, y, 1);
          hm.wakeX = x; hm.wakeY = y;
        }
      } else if (kind === 'up') {
        var hu = state.holds[id];
        if (!hu) return;
        var charge = chargeOf(hu);
        if (charge > 0) {
          // Heavier stone: bigger train, deeper and longer tone.
          spawnTrain(state, x, y, charge);
          ping(state, x, y, charge, hu.pressure);
        }
        delete state.holds[id];
      }
    },

    tick: function (state, ctx, dt, w, h) {
      state.w = w; state.h = h;
      state.time += dt;

      // resting fingers: charge up + slow faint emission at the fingertip
      var ids = Object.keys(state.holds);
      for (var k = 0; k < ids.length; k++) {
        var hold = state.holds[ids[k]];
        hold.t += dt;
        if (hold.t >= CHARGE_START) {
          hold.emitT += dt;
          if (hold.emitT >= HOLD_EMIT_EVERY) {
            hold.emitT = 0;
            spawnFaintRing(state, hold.x, hold.y, 1);
          }
        }
      }

      // ambient droplets: sparse, tiny, SILENT -- and only once the kid has
      // touched (calm start law: nothing from nothing).
      if (state.hasTouched && ids.length === 0) {
        state.idleT += dt;
        if (state.idleT >= state.idleNext) {
          state.idleT = 0;
          state.idleNext = IDLE_DROP_MIN + Math.random() * (IDLE_DROP_MAX - IDLE_DROP_MIN);
          spawnFaintRing(state, w * (0.1 + Math.random() * 0.8), h * (0.1 + Math.random() * 0.8), 0.8);
        }
      }

      // advance rings
      for (var i = state.rings.length - 1; i >= 0; i--) {
        var r = state.rings[i];
        if (r.delay > 0) { r.delay -= dt; continue; }
        r.r += r.speed * dt;
        r.life -= dt;
        if (r.life <= 0) state.rings.splice(i, 1);
      }

      // ---- draw: full clear + additive rings (overlaps glow, never flash) ----
      ctx.clearRect(0, 0, w, h);

      // Audio-reactive brightness, echo's exact idiom: <= +25%, silence exactly
      // neutral. The mode's own chimes feed CALM_VIS through the master-gain
      // analyser, so the water visibly answers its own sound.
      var E = (window.CALM_VIS && window.CALM_VIS.energy) || 0;
      var eMul = 1 + 0.25 * E;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var j = 0; j < state.rings.length; j++) {
        var g = state.rings[j];
        if (g.delay > 0) continue;
        var lifeT = g.life / g.maxLife;
        // amplitude decays as the wavefront spreads (faster fade near death)
        var a = clamp(g.alpha0 * Math.pow(lifeT, 1.4) * eMul, 0, 0.85);
        if (a <= 0.004) continue;
        // wide soft pass + core pass (legacy-ripples glow idiom; no shadowBlur
        // -- it would wreck 60fps on iPad with dozens of live rings)
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.strokeStyle = rgbStr(g.rgb, a * 0.35);
        ctx.lineWidth = g.width * 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.strokeStyle = rgbStr(g.rgb, a);
        ctx.lineWidth = g.width;
        ctx.stroke();
      }

      // charge glow: a soft swell under each resting finger, breathing gently
      for (var m = 0; m < ids.length; m++) {
        var hc = state.holds[ids[m]];
        if (!hc || hc.t < CHARGE_START) continue;
        var c = chargeOf(hc);
        var breathe = 1 + 0.06 * Math.sin(state.time * Math.PI * 2 * 0.9);
        var glowR = (12 + 30 * c) * breathe * (state.sizeMul || 1);
        var rgbArr = paletteRgbFor(state.moodId);
        var grgb = rgbArr[1] || rgbArr[0];
        var grad = ctx.createRadialGradient(hc.x, hc.y, 0, hc.x, hc.y, glowR);
        grad.addColorStop(0, rgbStr(grgb, 0.28 + 0.14 * c));
        grad.addColorStop(1, rgbStr(grgb, 0));
        ctx.beginPath();
        ctx.arc(hc.x, hc.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.restore();
    },

    idle: function (state, w, h, dt) {
      // idle droplets are handled inside tick() (tick always runs); no-op
      // here to avoid double-advancing timers (echo's pattern).
    }
  };

})();
