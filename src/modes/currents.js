// Currents — flow-field particle streams, pass 2: bioluminescent deep sea.
// Palette (curated, dark-bg friendly, keyed to particle speed): "Bioluminescent Deep"
//   deepAbyss #0b2233, deepTeal #124b5c, midCyan #2c9aa0, brightAqua #6fe3d4, violetGlow #8f7bd1
//   (this is now moods[0] "Deep Sea" -- see controls.moods below for 3 more curated palettes)
// Vanilla JS, ES5-friendly, var + function declarations, single file, no libraries.
(function () {

  var MAX_PARTICLES = 380;   // pass2: lowered cap so sustained play never densifies
  var MAX_MOTES = 40;

  // ---- mood palettes (kid-facing control) ----
  // moods[0] ("deepsea") is the ORIGINAL "Bioluminescent Deep" palette from
  // pass2, unchanged hex-for-hex (deepAbyss/deepTeal/midCyan/brightAqua/
  // violetGlow) -- it is the default/live palette at init and every color
  // call site falls back to it (MOODS[0].rgb) when no mood is specified.
  // Each additional mood is a 4-6 stop ramp, moderate saturation, tuned to
  // read well on #0d1b2a.
  var MOODS = [
    {
      id: 'deepsea', name: 'Deep Sea',
      hex: ['#0b2233', '#124b5c', '#2c9aa0', '#6fe3d4', '#8f7bd1'],
      rgb: [[11, 34, 51], [18, 75, 92], [44, 154, 160], [111, 227, 212], [143, 123, 209]]
    },
    {
      id: 'ember', name: 'Ember Dusk',
      hex: ['#241210', '#5c2a1c', '#a4482a', '#d97b3f', '#f2b263'],
      rgb: [[36, 18, 16], [92, 42, 28], [164, 72, 42], [217, 123, 63], [242, 178, 99]]
    },
    {
      id: 'moonlit', name: 'Moonlit',
      hex: ['#1a2233', '#2f3f5c', '#5b7599', '#9db4d1', '#e8eef5'],
      rgb: [[26, 34, 51], [47, 63, 92], [91, 117, 153], [157, 180, 209], [232, 238, 245]]
    },
    {
      id: 'meadow', name: 'Meadow',
      hex: ['#16261c', '#2d4a34', '#4f7a52', '#8bb26b', '#d9e79a'],
      rgb: [[22, 38, 28], [45, 74, 52], [79, 122, 82], [139, 178, 107], [217, 231, 154]]
    }
  ];

  // ---- character (flow) presets ----
  // curl: how strongly the base field is biased toward rotational/vortex-y
  //       motion (0 = none) vs. left as smooth translational drift.
  // parallel: how strongly headings get pulled toward a shared slow-moving
  //       "wind" direction (0 = none, pure field) -- higher = gentle drift.
  // channel: multiplier on the field's own curl terms (rivers = default 1).
  var CHARACTERS = [
    { id: 'drift', name: 'Drift', curl: 0.08, parallel: 0.62, channel: 0.55 },
    { id: 'rivers', name: 'Rivers', curl: 0.35, parallel: 0.12, channel: 1.0 },
    { id: 'swirl', name: 'Swirl', curl: 0.85, parallel: 0.05, channel: 1.35 }
  ];
  function findCharacter(id) {
    for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].id === id) return CHARACTERS[i];
    return CHARACTERS[1]; // rivers default
  }
  function findMood(id) {
    for (var i = 0; i < MOODS.length; i++) if (MOODS[i].id === id) return MOODS[i];
    return MOODS[0];
  }

  // ---- cheap analytic pseudo-noise field (no noise library) ----
  // angle(x,y,t) built from 3 summed sin/cos terms with incommensurate
  // spatial/time frequencies. Produces a smooth, slowly evolving vector field.
  // `curl`/`parallel`/`channel` (all 0..~1.4) reshape the regime for the
  // "character" control: channel scales how strongly the curl terms bend the
  // flow into channels/vortices; parallel blends the result toward a single
  // slow-turning "wind" heading so paths run mostly side-by-side (drift).
  function fieldAngle(x, y, t, w, h, curl, parallel, channel) {
    var nx = x / w, ny = y / h;
    var a = Math.sin(nx * 3.13 + t * 0.055 + Math.cos(ny * 2.02 - t * 0.033) * 1.3);
    var b = Math.cos(ny * 4.07 - t * 0.041 + Math.sin(nx * 1.71 + t * 0.023) * 1.1);
    var c = Math.sin((nx + ny) * 2.31 + t * 0.017 - Math.cos((nx - ny) * 3.47 + t * 0.029) * 0.9);
    var base = (a + b + c) * Math.PI * 0.6;
    if (channel === undefined) return base; // legacy call sites (motes) keep default regime
    base *= channel;
    // slow global "wind" heading, shared by every sample point, that the
    // field is blended toward when parallel > 0 (drift = mostly side-by-side).
    var wind = Math.sin(t * 0.05) * 1.4 + 0.4;
    var blended = base + (wind - base) * clamp(parallel, 0, 1);
    // extra rotational bias: nudges the angle to curl around slowly-moving
    // vortex centers (independent of the touch-hold whirlpool), scaled by curl.
    if (curl > 0.001) {
      var cx = w * (0.5 + 0.28 * Math.sin(t * 0.037)), cy = h * (0.5 + 0.24 * Math.cos(t * 0.031));
      var vdx = x - cx, vdy = y - cy;
      var vdist = Math.sqrt(vdx * vdx + vdy * vdy) + 0.001;
      var tangent = Math.atan2(vdy, vdx) + Math.PI * 0.5;
      var td = Math.atan2(Math.sin(tangent - blended), Math.cos(tangent - blended));
      var falloff = Math.exp(-vdist / (Math.max(w, h) * 0.45));
      blended += td * clamp(curl * falloff, 0, 1);
    }
    return blended;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Sample a palette (array of [r,g,b] stops) smoothly at continuous
  // position p in [0,1]. Takes the palette explicitly so callers can target
  // whichever mood a given particle/mote was assigned at spawn time.
  function paletteSample(pal, p) {
    p = clamp(p, 0, 1);
    var n = pal.length;
    var f = p * (n - 1);
    var i0 = f | 0;
    var i1 = Math.min(i0 + 1, n - 1);
    var t = f - i0;
    var c0 = pal[i0], c1 = pal[i1];
    return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
  }

  // three speed strata for parallax depth: slow drifters / mid current / quick sparks
  function pickStratum() {
    var r = Math.random();
    if (r < 0.55) return 0; // slow drifters (majority, deep)
    if (r < 0.90) return 1; // mid current
    return 2;               // quick sparks (rare, bright)
  }

  var STRATA = [
    { speedMin: 5, speedMax: 16, sizeMin: 1.2, sizeMax: 2.6, alpha: 0.55 },
    { speedMin: 16, speedMax: 34, sizeMin: 1.0, sizeMax: 2.2, alpha: 0.68 },
    { speedMin: 34, speedMax: 58, sizeMin: 0.7, sizeMax: 1.5, alpha: 0.85 }
  ];

  // size control (kid slider): continuous multiplier for spawn-time particle
  // radius, plus optional per-spawn randomized jitter ("surprise sizes").
  // Applied only at spawn (see makeParticle) so a live particle never jumps.
  function sizeFactor(state) {
    var m = state.sizeMul || 1;
    return state.sizeRandom ? m * (0.7 + Math.random() * 0.6) : m;
  }

  // `moodRgb` is captured once at spawn time from whichever mood is live
  // right now (state.liveMoodRgb) so existing elements keep their color and
  // simply age out naturally on their own life/maxLife -- switching moods
  // never rewrites elements already on screen (contract: no jarring global
  // recolor). Falls back to the default deep-sea mood (MOODS[0].rgb) if
  // omitted, keeping any legacy/direct callers working. `sizeMul` (size
  // control) similarly scales this particle's radius once, at spawn only.
  function makeParticle(w, h, x, y, moodRgb, sizeMul) {
    var stratum = pickStratum();
    var s = STRATA[stratum];
    var speed = s.speedMin + Math.random() * (s.speedMax - s.speedMin);
    var size = (s.sizeMin + Math.random() * (s.sizeMax - s.sizeMin)) * (sizeMul || 1); // size control (kid slider)
    var hasPos = (typeof x === 'number');
    return {
      x: hasPos ? x : Math.random() * w,
      y: hasPos ? y : Math.random() * h,
      heading: Math.random() * Math.PI * 2,
      speed: speed,
      baseSpeed: speed,
      stratum: stratum,
      size: size,
      baseSize: size,
      life: 0,
      maxLife: 6 + Math.random() * 5, // 6-11s, shortened per pass3 trail-trim (was 8-14s)
      wavePhase: Math.random() * Math.PI * 2,
      // vortex orbit bookkeeping (hold gesture)
      orbitAngle: 0,
      orbitAmt: 0,
      moodRgb: moodRgb || MOODS[0].rgb
    };
  }

  // color keyed to current instantaneous speed (slow=deep, fast=bright),
  // normalized against the stratum's own range so all three bands read distinctly.
  function particleColor(p) {
    var s = STRATA[p.stratum];
    var norm = clamp((p.speed - s.speedMin) / Math.max(0.001, (s.speedMax - s.speedMin)), 0, 1);
    // map stratum+norm into a continuous 0..1 palette position:
    // slow stratum sits in lower palette range, quick sparks reach toward violet accent
    var base = p.stratum === 0 ? 0.0 : (p.stratum === 1 ? 0.32 : 0.62);
    var span = p.stratum === 0 ? 0.4 : (p.stratum === 1 ? 0.45 : 0.4);
    var pos = base + norm * span;
    var c = paletteSample(p.moodRgb || MOODS[0].rgb, pos);
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }

  function makeMote(w, h, moodRgb) {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      heading: Math.random() * Math.PI * 2,
      speed: 4 + Math.random() * 10,
      size: 0.8 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      colorPos: Math.random() * 0.5, // motes stay in the deep/mid range, never violet
      moodRgb: moodRgb || MOODS[0].rgb
    };
  }

  function init(w, h, theme) {
    var state = {
      theme: theme,
      t: 0,
      w: w,
      h: h,
      particles: [],
      motes: [],
      touch: { active: false, x: w * 0.5, y: h * 0.5, strength: 0 },
      // hold/vortex state
      holdX: w * 0.5,
      holdY: h * 0.5,
      holdDuration: 0,
      vortexStrength: 0, // eases up while held, relaxes over ~3s after release
      bgCache: null,
      lastBurstT: -999,
      // ---- kid-facing smart controls: mood (palette) + character (flow) ----
      liveMoodId: MOODS[0].id,
      liveMoodRgb: MOODS[0].rgb,       // what NEW spawns sample; existing elements
                                        // keep whatever moodRgb they were born with
      character: {
        id: CHARACTERS[1].id,          // 'rivers' default
        curl: CHARACTERS[1].curl, parallel: CHARACTERS[1].parallel, channel: CHARACTERS[1].channel
      },
      characterTarget: {
        curl: CHARACTERS[1].curl, parallel: CHARACTERS[1].parallel, channel: CHARACTERS[1].channel
      },
      // ---- kid-facing smart controls: size ----
      sizeMul: 1, sizeRandom: false,
      // ---- kid-facing smart controls: trace ----
      traceMode: 'fades'
    };
    for (var i = 0; i < MAX_MOTES; i++) state.motes.push(makeMote(w, h, state.liveMoodRgb));
    buildBgCache(state);
    return state;
  }

  // Ease the live character params toward whatever was last requested via
  // applyControl('character', id). Called once per tick; converges over ~2s
  // (never snaps) and is idempotent under rapid re-taps of the same preset
  // since easing simply continues toward the same target.
  function easeCharacter(state, dt) {
    var cur = state.character, tgt = state.characterTarget;
    var k = clamp(dt / 2.0, 0, 1); // ~2s time constant
    cur.curl += (tgt.curl - cur.curl) * k;
    cur.parallel += (tgt.parallel - cur.parallel) * k;
    cur.channel += (tgt.channel - cur.channel) * k;
  }

  // Cache a static radial vignette sprite once (on init/resize), never per-frame.
  // Drawn additively at very low alpha — never as an opaque veil (residue fix).
  function buildBgCache(state) {
    var w = state.w, h = state.h;
    var off = document.createElement('canvas');
    off.width = Math.max(1, w);
    off.height = Math.max(1, h);
    var octx = off.getContext('2d');
    var g = octx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(44,154,160,1)');
    g.addColorStop(1, 'rgba(11,34,51,1)');
    octx.fillStyle = g;
    octx.fillRect(0, 0, w, h);
    state.bgCache = off;
  }

  function pointer(state, x, y, kind) {
    if (kind === 'down') {
      state.touch.active = true;
      state.touch.x = x;
      state.touch.y = y;
      state.touch.strength = 1;
      state.holdX = x;
      state.holdY = y;
      state.holdDuration = 0;
      state.lastBurstT = state.t;
      spawnBurst(state, x, y, 10);
    } else if (kind === 'move') {
      state.touch.active = true;
      state.touch.x = x;
      state.touch.y = y;
      state.touch.strength = 1;
      state.holdX = x;
      state.holdY = y;
      if ((state.t - state.lastBurstT) > 0.09) {
        state.lastBurstT = state.t;
        spawnBurst(state, x, y, 3);
      }
    } else if (kind === 'up') {
      state.touch.active = false;
      state.holdDuration = 0;
      // strength & vortexStrength relax back over time in tick()
    }
  }

  function spawnBurst(state, x, y, n) {
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = Math.random() * 14;
      var p = makeParticle(state.w, state.h, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, state.liveMoodRgb, sizeFactor(state)); // size control (kid slider)
      state.particles.push(p);
    }
    thin(state);
  }

  function thin(state) {
    if (state.particles.length > MAX_PARTICLES) {
      state.particles.splice(0, state.particles.length - MAX_PARTICLES);
    }
  }

  function tick(state, ctx, dt, w, h) {
    if (w !== state.w || h !== state.h) {
      state.w = w; state.h = h;
      buildBgCache(state);
    }
    state.t += dt;
    easeCharacter(state, dt);

    // relax touch influence back over ~2s after release
    if (!state.touch.active && state.touch.strength > 0) {
      state.touch.strength = Math.max(0, state.touch.strength - dt / 2);
    }

    // hold duration tracking -> vortex strength ramps up while held (gentle, capped),
    // and relaxes back over ~3s once released (destination is a resting flow field).
    if (state.touch.active) {
      state.holdDuration += dt;
      var targetVortex = clamp(state.holdDuration / 1.4, 0, 1); // ramps to full over ~1.4s of hold
      state.vortexStrength += (targetVortex - state.vortexStrength) * clamp(dt * 2.2, 0, 1);
    } else if (state.vortexStrength > 0) {
      state.vortexStrength = Math.max(0, state.vortexStrength - dt / 3); // ~3s relax
    }

    // ---- RESIDUE FIX: fade previous frame toward true transparency ----
    // destination-out erases existing pixel alpha rather than compositing an
    // opaque veil color underneath, so trails genuinely vanish to nothing
    // (the CSS background behind the canvas shows through, not a stuck smear).
    // NOTE: no source-over vignette/sprite is drawn here anymore — any per-frame
    // additive draw reaches a nonzero alpha equilibrium against this fade and
    // would itself become permanent residue. state.bgCache is kept unused for
    // potential future one-shot (non-per-frame) effects but never composited here.
    // pass3 trace-fade policy: was 0.09 (background residue reached its ~1%
    // floor in ~49 frames / ~0.81s @60fps — technically under 1s, but with
    // many overlapping particles the compounded canvas-trail smear read as
    // "movement afterglow" that lingered past the client's 1s hold budget).
    // Raised to 0.16 so the same ~1% floor is reached in ~26 frames / ~0.43s,
    // giving real margin under the 1s trace-hold ceiling even with overlap.
    // Trace control (kid chip): 'stays' skips this erase entirely so rivers
    // freeze into painted trails until Clear; 'fades' (default) is the
    // pre-existing behavior, untouched.
    if (state.traceMode !== 'stays') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    // sparse ambient spawn to keep river alive without ever feeling busy
    if (state.particles.length < 60 && Math.random() < dt * 3) {
      state.particles.push(makeParticle(w, h, undefined, undefined, state.liveMoodRgb, sizeFactor(state))); // size control (kid slider)
    }

    var touch = state.touch;
    var vortex = state.vortexStrength;
    var chr = state.character;
    var arr = state.particles;
    var write = 0;
    // Trace control (kid chip) 'stays': once a particle has finished fading
    // in (life >= FADE_IN_WINDOW, matching the fadeIn calc below), pin its
    // life at that post-fade-in value so it never advances into the
    // maxLife-tailWindow fade-out zone and never trips the maxLife drop --
    // it simply freezes at full visible brightness, painting a permanent
    // river, instead of dissolving.
    var FADE_IN_WINDOW = 1.2; // matches `fadeIn = clamp(p.life / 1.2, 0, 1)` below
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      p.life += dt;
      if (state.traceMode === 'stays' && p.life > FADE_IN_WINDOW) {
        p.life = FADE_IN_WINDOW; // trace control (kid chip): freeze at full brightness
      }
      if (p.life > p.maxLife) continue; // drop, don't keep

      var ang = fieldAngle(p.x, p.y, state.t, w, h, chr.curl, chr.parallel, chr.channel);

      // local attraction kernel toward touch point, relaxes via touch.strength
      var dx = state.holdX - p.x, dy = state.holdY - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy) + 0.001;

      if (touch.strength > 0.001) {
        var influence = touch.strength * Math.exp(-dist / 220);
        if (influence > 0.0005) {
          var toward = Math.atan2(dy, dx);
          var diff = Math.atan2(Math.sin(toward - ang), Math.cos(toward - ang));
          ang += diff * influence * 0.9;
        }
      }

      // ---- HOLD = gentle whirlpool ----
      // near the hold point, field curls into a slow inward spiral. Strength
      // eases in/out via vortexStrength (already ramped/relaxed above), and
      // falls off with distance so it stays a local, non-violent vortex.
      if (vortex > 0.001 && dist < 260) {
        var falloff = vortex * Math.exp(-dist / 130);
        var tangent = Math.atan2(dy, dx) + Math.PI * 0.5; // perpendicular = orbit direction
        var td = Math.atan2(Math.sin(tangent - ang), Math.cos(tangent - ang));
        ang += td * clamp(falloff * 0.8, 0, 1);
        // slight inward drift so particles spiral toward the center, never snap
        p.speed = p.baseSpeed * (1 + falloff * 0.6);
      } else {
        // ease speed back toward its base drift speed
        p.speed += (p.baseSpeed - p.speed) * clamp(dt * 1.5, 0, 1);
      }

      // ease heading toward field angle (nothing teleports/jumps)
      var hd = Math.atan2(Math.sin(ang - p.heading), Math.cos(ang - p.heading));
      p.heading += hd * clamp(dt * 1.6, 0, 1);

      p.x += Math.cos(p.heading) * p.speed * dt;
      p.y += Math.sin(p.heading) * p.speed * dt;

      // wrap softly around edges
      if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;

      // ---- organic wave-modulated fade (in AND out), with slight shrink on dissolve ----
      var fadeIn = clamp(p.life / 1.2, 0, 1);
      // pass3 trace-fade policy: tailWindow was 2.2s — combined with the veil's
      // own slower-than-ideal background persistence (see the destination-out
      // fillStyle above) this let a particle's own comet tail read as a dim
      // lingering trace for close to 1s before its fade-to-zero even began.
      // Trimmed to 1.6s so a particle's dissolve completes well inside the
      // policy's 2-3s fade-to-zero window once it starts.
      var tailWindow = 1.6;
      var tailT = clamp((p.maxLife - p.life) / tailWindow, 0, 1); // 1 -> 0 across the tail
      // sine ripple riding the tail so dissolution undulates rather than
      // evaporating linearly; ripple itself fully collapses to 0 at tailT=0
      // so the final alpha still lands exactly on 0 (no snap/pop).
      var ripple = Math.sin(p.wavePhase + state.t * 1.7) * 0.12 * tailT;
      var fadeOut = clamp(tailT + ripple, 0, 1);
      var alpha = STRATA[p.stratum].alpha * fadeIn * fadeOut;
      // gentle shrink as it fades (never grows back), floor so it doesn't vanish to a hard point
      var shrink = 0.55 + 0.45 * fadeOut;
      var drawSize = p.baseSize * shrink;

      if (alpha > 0.003) {
        ctx.beginPath();
        ctx.fillStyle = particleColor(p);
        ctx.globalAlpha = alpha;
        ctx.arc(p.x, p.y, drawSize, 0, Math.PI * 2);
        ctx.fill();
      }

      arr[write++] = p;
    }
    arr.length = write;
    ctx.globalAlpha = 1;
    thin(state);

    // draw ambient motes (very sparse, always alive, stay in deep/mid palette range)
    var motes = state.motes;
    for (var m = 0; m < motes.length; m++) {
      var mo = motes[m];
      var mang = fieldAngle(mo.x, mo.y, state.t * 0.6, w, h, chr.curl, chr.parallel, chr.channel);
      var hdm = Math.atan2(Math.sin(mang - mo.heading), Math.cos(mang - mo.heading));
      mo.heading += hdm * clamp(dt * 0.8, 0, 1);
      mo.x += Math.cos(mo.heading) * mo.speed * dt;
      mo.y += Math.sin(mo.heading) * mo.speed * dt;
      if (mo.x < -6) mo.x = w + 6; else if (mo.x > w + 6) mo.x = -6;
      if (mo.y < -6) mo.y = h + 6; else if (mo.y > h + 6) mo.y = -6;
      mo.phase += dt * 0.25; // slow twinkle, well under 0.3Hz
      // Motes never die/respawn on their own (unlike particles), so without
      // this they'd be stuck on whatever mood was live at init() forever.
      // Recycle in-place at a very low rate so a mood switch still visibly
      // reaches ambient motes -- gently, one at a time, never as a burst.
      if (mo.moodRgb !== state.liveMoodRgb && Math.random() < dt * 0.05) {
        mo.moodRgb = state.liveMoodRgb;
      }
      var tw = 0.3 + 0.22 * (0.5 + 0.5 * Math.sin(mo.phase));
      var c = paletteSample(mo.moodRgb, mo.colorPos);
      ctx.beginPath();
      ctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
      ctx.globalAlpha = tw;
      ctx.arc(mo.x, mo.y, mo.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Ambient idle life — motes are already drawn each tick regardless (so the
  // surface is always alive even untouched). idle() here just ensures a slow
  // trickle of full river particles continues when nobody is interacting, so
  // the rivers themselves stay gently visible, not just motes.
  function idle(state, w, h, dt) {
    if (state.particles.length < 90 && Math.random() < dt * 1.2) {
      state.particles.push(makeParticle(w, h, undefined, undefined, state.liveMoodRgb, sizeFactor(state))); // size control (kid slider)
      thin(state);
    }
  }

  // ---- kid-facing smart controls ----------------------------------------
  // kind: 'mood' | 'character'; id: one of controls.moods[].id or
  // controls.character.options[].id. Safe under rapid re-taps: mood just
  // repoints a reference (idempotent, no bursts/allocations beyond the one
  // object lookup); character re-targets an easing that keeps converging
  // toward wherever it's currently pointed (re-tapping the same id is a
  // no-op target update, re-tapping a different id just redirects the ease).
  function applyControl(state, kind, id) {
    if (!state) return;
    if (kind === 'size') { state.sizeMul = Math.max(0.6, Math.min(1.6, Number(id) || 1)); return; }
    if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
    if (kind === 'trace') { state.traceMode = (id === 'stays') ? 'stays' : 'fades'; return; }
    if (kind === 'mood') {
      var mood = findMood(id);
      state.liveMoodId = mood.id;
      state.liveMoodRgb = mood.rgb;
      // existing particles/motes keep their own captured moodRgb reference
      // and age out / recycle naturally -- no global recolor here.
    } else if (kind === 'character') {
      var preset = findCharacter(id);
      state.character.id = preset.id; // label updates immediately; motion eases
      state.characterTarget.curl = preset.curl;
      state.characterTarget.parallel = preset.parallel;
      state.characterTarget.channel = preset.channel;
    }
  }

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['currents'] = {
    name: 'Currents',
    tagline: 'Bioluminescent deep-sea rivers that spiral into a slow whirlpool under your fingertip.',
    init: init,
    pointer: pointer,
    tick: tick,
    idle: idle,
    controls: {
      moods: [
        { id: 'deepsea', name: 'Deep Sea', colors: MOODS[0].hex },
        { id: 'ember', name: 'Ember Dusk', colors: MOODS[1].hex },
        { id: 'moonlit', name: 'Moonlit', colors: MOODS[2].hex },
        { id: 'meadow', name: 'Meadow', colors: MOODS[3].hex }
      ],
      character: {
        label: 'Flow',
        options: [
          { id: 'drift', name: 'Drift' },
          { id: 'rivers', name: 'Rivers' },
          { id: 'swirl', name: 'Swirl' }
        ]
      }
    },
    applyControl: applyControl
  };

})();
