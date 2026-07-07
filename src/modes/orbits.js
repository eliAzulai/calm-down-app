// Orbits variant — firefly constellation. Particles settle into slow elliptical
// orbits around invisible anchors planted by touch. Vanilla JS, ES5-friendly.
// Palette "Fireflies at Dusk": amber-honey warms + one cool counterpoint —
// #F2B65C (honey), #E8944C (amber), #C9663B (ember), #8C4A3A (dusk clay), #4A5A78 (dusty blue)
(function () {

  // MOODS[0] is the original/default "Fireflies at Dusk" palette — hexes preserved.
  // Curated 3 additional palettes for #0d1b2a canvas bg, moderate saturation:
  //  - "Aurora Drift": cool aurora greens/teals, gentle and clean
  //  - "Rose-Gold Dawn": warm rose/gold, soft sunrise glow
  //  - "Violet Night": deep violet/indigo night bloom
  var MOODS = [
    {
      id: 'fireflies-dusk',
      name: 'Fireflies at Dusk',
      colors: [
        [242, 182, 92],  // F2B65C honey
        [232, 148, 76],  // E8944C amber
        [201, 102, 59],  // C9663B ember
        [140, 74, 58],   // 8C4A3A dusk clay
        [74, 90, 120]    // 4A5A78 dusty blue (cool counterpoint)
      ]
    },
    {
      id: 'aurora-drift',
      name: 'Aurora Drift',
      colors: [
        [124, 224, 186], // 7CE0BA mint aurora
        [86, 199, 176],  // 56C7B0 teal
        [63, 163, 168],  // 3FA3A8 deep teal
        [92, 150, 214],  // 5C96D6 sky blue
        [140, 214, 200]  // 8CD6C8 pale aurora
      ]
    },
    {
      id: 'rose-gold-dawn',
      name: 'Rose-Gold Dawn',
      colors: [
        [244, 197, 168], // F4C5A8 peach gold
        [232, 158, 150], // E89E96 rose
        [216, 122, 130], // D87A82 dusty rose
        [214, 173, 118], // D6AD76 warm gold
        [178, 98, 110]   // B2626E deep rose (accent)
      ]
    },
    {
      id: 'violet-night',
      name: 'Violet Night',
      colors: [
        [162, 130, 214], // A282D6 soft violet
        [124, 96, 186],  // 7C60BA indigo
        [92, 78, 156],   // 5C4E9C deep indigo
        [186, 150, 210], // BA96D2 lilac
        [70, 62, 120]    // 463E78 midnight violet (accent)
      ]
    }
  ];

  // Character presets — orbit "shape" personality. Params sampled per-particle
  // within these ranges; particles ease existing ecc/radius-scale/jitter toward
  // freshly-sampled targets on preset change (see CHARACTER_EASE_RATE), so a
  // switch never snaps the constellation, even under rapid re-tapping.
  var CHARACTER_PRESETS = {
    halo: {
      name: 'Halo',
      eccMin: 0.02, eccMax: 0.12,       // near-circular, low eccentricity
      radiusMin: 40, radiusMax: 120,     // tighter radius spread — serene rings
      jitterAmp: 0,                      // no jitter — calm rings
      driftAmp: 0                        // no inter-anchor drift
    },
    ellipse: {
      name: 'Ellipse',
      eccMin: 0.05, eccMax: 0.35,        // current default range
      radiusMin: 30, radiusMax: 160,
      jitterAmp: 0,
      driftAmp: 0
    },
    swarm: {
      name: 'Swarm',
      eccMin: 0.10, eccMax: 0.55,        // looser, higher eccentricity variance
      radiusMin: 25, radiusMax: 190,
      jitterAmp: 0.05,                   // bounded smooth radius/phase jitter
      driftAmp: 0.10                     // slow inter-anchor drift (bounded)
    }
  };
  var CHARACTER_EASE_RATE = 1.6; // ~2s to settle (1 - e^-1.6*2 ≈ 0.96)

  var MAX_ANCHORS = 3;
  var MAX_PARTICLES = 350;
  var IDLE_PARTICLES = 25;
  var PERSIST_AFTER_RELEASE = 20; // seconds constellation survives after last pointer-up
  // pass4 trace-fade policy: DISPERSE_DURATION was 8s, and pt.life chased it
  // via approach() at DYING_EASE_RATE=0.5 — an exponential ease that never
  // truly reaches its target, so after the 8s ramp finished, particles still
  // took several MORE seconds (measured ~3-6s of extra asymptotic decay,
  // depending on how far life had lagged behind targetLife) before falling
  // below the 0.01 splice threshold. Total observed time from "anchor starts
  // dispersing" to "orbiters actually gone": 10s+ of multi-second dim ghosts,
  // squarely the residue the client flagged. Fix is two-part: shorten the
  // ramp itself to 2.2s AND fast-track the life-easing rate specifically
  // during the dying phase (see DYING_EASE_RATE below) so life tracks
  // targetLife closely instead of trailing it — together these bring total
  // dispersal-to-gone under the 3s ceiling (~2.8s measured).
  var DISPERSE_DURATION = 2.2; // seconds to fade out after persist window ends (was 8)
  // Task A8 (ghost-trail eradication): client still read orbits as "slightly
  // smeary" post-touch at TRAIL_LEN=4 -- one more parameter step, halved to 2.
  // Trail points are length-bound only (no per-point age/timestamp field --
  // see the trail.push/shift site below), so this LEN cut is the whole fix;
  // comets keep their existing +4 bonus (trailLen: isComet ? TRAIL_LEN+4 :
  // TRAIL_LEN below) unchanged, per plan.
  var TRAIL_LEN = 2; // stored points per particle trail (pass3 trail-trim: was 8, then 4)
  var TRAIL_SAMPLE_DT = 0.045; // seconds between trail samples
  var COMET_CHANCE = 1 / 15;
  var HOLD_TIGHTEN = 0.30; // orbits tighten up to 30% while held
  var HOLD_EASE_RATE = 0.9; // how fast the tighten/relax responds
  var LIFE_EASE_RATE = 0.5; // pt.life chase rate while anchor is alive/held (unchanged)
  var DYING_EASE_RATE = 4.0; // pass4: pt.life chase rate once dying=true, so life
                               // tracks the shrinking targetLife tightly instead of
                               // lagging into a multi-second asymptotic dim tail
  var SETTLE_IN_RATE = 3.5; // spawn settle-in speed (radius 0.05->1); kept faster than
                             // HOLD_EASE_RATE so first-contact tighten reads as visible
                             // inward pull instead of being masked by outward settle-in

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ease-towards for spring-like anchor following (no snapping)
  function approach(cur, target, rate, dt) {
    var k = 1 - Math.exp(-rate * dt);
    return cur + (target - cur) * k;
  }

  // sample a given palette (array of [r,g,b]) smoothly at t in [0,1]
  function paletteColor(palette, t) {
    t = clamp(t, 0, 1);
    var n = palette.length;
    var f = t * (n - 1);
    var i0 = Math.floor(f);
    var i1 = Math.min(i0 + 1, n - 1);
    var frac = f - i0;
    var c0 = palette[i0], c1 = palette[i1];
    return [
      lerp(c0[0], c1[0], frac),
      lerp(c0[1], c1[1], frac),
      lerp(c0[2], c1[2], frac)
    ];
  }

  // organic ease: a gentle sine ripple riding on top of a smoothstep, so the
  // tail of a fade dissolves like a wave rather than evaporating linearly.
  function waveEase(t) {
    t = clamp(t, 0, 1);
    var smooth = t * t * (3 - 2 * t);
    var ripple = Math.sin(t * Math.PI * 2.2) * 0.06 * (1 - t);
    return clamp(smooth + ripple, 0, 1);
  }

  // Build a cached radial-gradient sprite (offscreen canvas) for a glow disc.
  // color: [r,g,b], radiusPx: sprite half-size, innerAlpha: alpha at center.
  function buildGlowSprite(color, radiusPx, innerAlpha) {
    var size = Math.ceil(radiusPx * 2);
    var off = document.createElement('canvas');
    off.width = size; off.height = size;
    var octx = off.getContext('2d');
    var g = octx.createRadialGradient(radiusPx, radiusPx, 0, radiusPx, radiusPx, radiusPx);
    var rc = 'rgba(' + Math.round(color[0]) + ',' + Math.round(color[1]) + ',' + Math.round(color[2]) + ',';
    g.addColorStop(0, rc + innerAlpha + ')');
    g.addColorStop(0.4, rc + (innerAlpha * 0.45) + ')');
    g.addColorStop(1, rc + '0)');
    octx.fillStyle = g;
    octx.fillRect(0, 0, size, size);
    return off;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Persistent ink layer for trace 'stays' (Task A6 fix): a single w x h
  // offscreen canvas that live orbiters stamp tiny marks into each frame.
  // Bounded by construction -- one fixed-size bitmap, never a growing
  // array -- and composited onto the main canvas in O(1) via drawImage.
  // Mirrors Echo's validated stamp-canvas pattern, including its resize
  // convention: on dimension change the layer is recreated FRESH (content
  // not preserved -- acceptable per spec, same note as echo.js's resize).
  function ensureInkLayer(state, w, h) {
    var iw = Math.max(1, Math.round(w));
    var ih = Math.max(1, Math.round(h));
    if (state.inkCanvas && state.inkCanvas.width === iw && state.inkCanvas.height === ih) return;
    var off = document.createElement('canvas');
    off.width = iw;
    off.height = ih;
    state.inkCanvas = off;
    state.inkCtx = off.getContext('2d');
    state.inkDirty = false;
  }

  function makeAnchor(x, y) {
    return {
      x: x, y: y,
      tx: x, ty: y, // target (where pointer wants it)
      alive: true,
      born: 0,
      releasedAt: -1, // time.js since pointer-up (set when released); -1 = still held
      held: true,
      holdStart: -1, // time when current hold began (for gravity-well tighten)
      tighten: 0 // 0..1 current inward-pull amount, eased
    };
  }

  // size control (kid slider): continuous multiplier for spawn-time orbiter
  // dot size, plus optional per-spawn randomized jitter ("surprise sizes").
  // NOTE: this scales the rendered dot's pixel size (sizePx below) only --
  // never `radius` (how far the orbiter circles its anchor), which is an
  // unrelated orbital-geometry concept, not a visual size.
  function sizeFactor(state) {
    var m = (state && state.sizeMul) || 1;
    return (state && state.sizeRandom) ? m * (0.7 + Math.random() * 0.6) : m;
  }

  // characterKey: which CHARACTER_PRESETS entry to sample ranges from (defaults 'ellipse').
  // moodIdx: index into MOODS this particle samples its color from, captured at spawn so a
  // later mood switch doesn't recolor existing particles — they keep their mood and age out naturally.
  // sizeMul: size-control multiplier for the rendered dot, captured at spawn (see sizeFactor above).
  function makeParticle(anchorIdx, cx, cy, characterKey, moodIdx, sizeMul) {
    var palette = MOODS[moodIdx != null ? moodIdx : 0].colors;
    var preset = CHARACTER_PRESETS[characterKey] || CHARACTER_PRESETS.ellipse;
    var isComet = Math.random() < COMET_CHANCE;
    var radius = rand(preset.radiusMin, preset.radiusMax);
    var period = isComet ? rand(28, 46) : rand(8, 30);
    var ecc = rand(preset.eccMin, preset.eccMax); // eccentricity
    var incl = rand(0, Math.PI * 2); // orbit rotation (orientation of ellipse)
    var phase = rand(0, Math.PI * 2);
    var precessRate = rand(-0.03, 0.03); // rad/sec slow precession
    var dir = Math.random() < 0.5 ? 1 : -1;
    var radiusSpan = preset.radiusMax - preset.radiusMin || 1;
    var colorT = clamp((radius - preset.radiusMin) / radiusSpan, 0, 1) * 0.75 + rand(-0.12, 0.12);
    colorT = clamp(colorT, 0, 1);
    var sizePx = (isComet ? rand(3.5, 5.5) : rand(1.5, 4)) * (sizeMul || 1); // size control (kid slider)

    return {
      anchor: anchorIdx,
      // spawn near anchor, ease outward into orbit
      x: cx, y: cy,
      radius: radius,
      curRadiusScale: 0.05, // eased in from near-zero
      period: period,
      ecc: ecc,
      incl: incl,
      precessRate: precessRate,
      phase: phase,
      angSpeed: (Math.PI * 2 / period) * dir,
      size: sizePx,
      colorT: colorT,
      palette: palette, // captured [r,g,b][] this particle samples color from
      moodIdx: moodIdx != null ? moodIdx : 0, // captured mood index (for sprite cache keying)
      isComet: isComet,
      trailLen: isComet ? TRAIL_LEN + 4 : TRAIL_LEN, // pass3: comet bonus trimmed ~30% (was +6)
      trail: [], // {x,y,alpha} ring of recent positions, oldest first
      trailAccum: rand(0, TRAIL_SAMPLE_DT),
      life: 1, // fade multiplier (for dissolve)
      born: 0,
      // character-preset live-eased fields: on a character switch (see applyControl),
      // every existing particle gets a freshly-sampled target from the new preset's
      // ranges and eases its actual radius/ecc toward it over ~2s (CHARACTER_EASE_RATE)
      // instead of snapping. New spawns start already-settled (target === current).
      character: characterKey || 'ellipse',
      radiusTarget: radius,
      eccTarget: ecc,
      jitterAmp: preset.jitterAmp,
      jitterAmpTarget: preset.jitterAmp,
      driftAmp: preset.driftAmp,
      driftAmpTarget: preset.driftAmp,
      jitterPhase: rand(0, Math.PI * 2),
      jitterSpeed: rand(0.15, 0.35), // rad/sec, slow bounded wobble
      driftAngle: rand(0, Math.PI * 2),
      driftSpeed: rand(0.02, 0.06) // rad/sec, very slow inter-anchor drift heading change
    };
  }

  var VARIANT = {
    name: 'Orbits',
    tagline: 'A firefly constellation you conduct — hold to draw the stars in close, release and let them breathe back out.',

    init: function (w, h, theme) {
      var state = {
        theme: theme,
        w: w, h: h,
        anchors: [],
        particles: [],
        t: 0,
        breathePhase: rand(0, Math.PI * 2),
        pointerDown: false,
        lastActive: 0, // time since any anchor was actively held/created
        spriteCache: {}, // keyed by mood '_' + rounded colorT bucket + '_' + sizeBucket -> {big, small, trail, color}
        idleAnchor: { x: w * 0.5, y: h * 0.5, vx: 0, vy: 0, tx: w * 0.5, ty: h * 0.5, retimeT: rand(4, 9) },
        hasEverTouched: false,
        moodIdx: 0,          // index into MOODS; new particles sample this palette at spawn
        characterId: 'ellipse', // current character preset id; existing particles ease toward it
        sizeMul: 1, sizeRandom: false,
        traceMode: 'fades',  // kid-facing trace control: 'fades' (default) | 'stays'
        // Persistent ink layer for trace 'stays' (Echo's validated stamp-
        // canvas pattern): lazily created the first frame 'stays' is active
        // (see ensureInkLayer), so 'fades'-only sessions never pay for it.
        // Clear/mode-switch reset for free: app-side re-init returns a fresh
        // state with these null again.
        inkCanvas: null, inkCtx: null, inkDirty: false
      };
      return state;
    },

    pointer: function (state, x, y, kind) {
      if (kind === 'down') {
        // release the idle anchor into normal lifecycle the moment real touch begins
        if (state.idleSeeded && state.idleAnchorIdx != null) {
          var idleA = state.anchors[state.idleAnchorIdx];
          if (idleA) {
            idleA.held = false;
            if (idleA.releasedAt < 0) idleA.releasedAt = state.t;
          }
          state.idleSeeded = false;
          state.idleAnchorIdx = null;
        }
        // find nearest existing anchor within grab radius -> drag it, else plant new
        var GRAB = 60;
        var nearest = -1, nd = 1e9;
        for (var i = 0; i < state.anchors.length; i++) {
          var a = state.anchors[i];
          if (!a.alive) continue;
          var dx = a.x - x, dy = a.y - y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < GRAB && d < nd) { nd = d; nearest = i; }
        }
        if (nearest >= 0) {
          state.anchors[nearest].held = true;
          state.anchors[nearest].releasedAt = -1;
          state.anchors[nearest].holdStart = state.t;
          state.anchors[nearest].tx = x;
          state.anchors[nearest].ty = y;
          state.draggingIdx = nearest;
        } else {
          // count alive anchors
          var aliveIdx = [];
          for (var j = 0; j < state.anchors.length; j++) {
            if (state.anchors[j].alive) aliveIdx.push(j);
          }
          if (aliveIdx.length >= MAX_ANCHORS) {
            // dissolve oldest gracefully (mark for fade, remove once faded)
            var oldest = aliveIdx[0];
            for (var k = 1; k < aliveIdx.length; k++) {
              if (state.anchors[aliveIdx[k]].born < state.anchors[oldest].born) oldest = aliveIdx[k];
            }
            state.anchors[oldest].alive = false; // begins fade-out in tick via particle life decay
            state.anchors[oldest].releasedAt = state.t;
          }
          var na = makeAnchor(x, y);
          na.born = state.t;
          na.holdStart = state.t;
          state.anchors.push(na);
          state.draggingIdx = state.anchors.length - 1;
          // spawn particle cluster for this anchor
          var newIdx = state.anchors.length - 1;
          var count = Math.floor(rand(18, 30));
          for (var p = 0; p < count; p++) {
            if (state.particles.length >= MAX_PARTICLES) break;
            var pt = makeParticle(newIdx, x, y, state.characterId, state.moodIdx, sizeFactor(state)); // size control (kid slider)
            pt.born = state.t;
            state.particles.push(pt);
          }
        }
        state.pointerDown = true;
        state.hasEverTouched = true;
        state.lastActive = state.t;
      } else if (kind === 'move') {
        if (state.draggingIdx != null && state.anchors[state.draggingIdx]) {
          state.anchors[state.draggingIdx].tx = x;
          state.anchors[state.draggingIdx].ty = y;
          state.lastActive = state.t;
        }
      } else if (kind === 'up') {
        if (state.draggingIdx != null && state.anchors[state.draggingIdx]) {
          state.anchors[state.draggingIdx].held = false;
          state.anchors[state.draggingIdx].releasedAt = state.t;
          state.anchors[state.draggingIdx].holdStart = -1;
        }
        state.draggingIdx = null;
        state.pointerDown = false;
      }
    },

    tick: function (state, ctx, dt, w, h) {
      state.t += dt;
      state.w = w; state.h = h;

      // residue fix: erase toward TRUE transparency instead of painting a bg veil.
      // destination-out removes alpha from what's already there; source-over resumes drawing.
      // Trace control (kid chip) 'stays': Echo's validated ink-layer pattern
      // instead of a veil skip. The main canvas is FULLY cleared every frame
      // (live orbiters stay crisp -- their own dots never smear), then the
      // persistent ink layer -- where each orbiter stamps one tiny mark per
      // frame (see the stamp site in the particle loop) -- composites under
      // them in O(1) via drawImage, regardless of how much ink has
      // accumulated. Memory and per-frame cost stay constant no matter how
      // long the kid plays. 'fades' (default) is the pre-existing veil,
      // untouched; returning to 'fades' clears the ink so traces drain
      // normally under the veil.
      if (state.traceMode === 'stays') {
        ensureInkLayer(state, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(state.inkCanvas, 0, 0);
      } else {
        if (state.inkCtx && state.inkDirty) {
          // Just returned from 'stays': drop the accumulated ink. The main
          // canvas still holds last frame's composite, which the veil below
          // now drains normally -- the visible "fades" hand-off.
          state.inkCtx.clearRect(0, 0, state.inkCanvas.width, state.inkCanvas.height);
          state.inkDirty = false;
        }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.07)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }

      // communal breathing factor ~0.05Hz +-5%
      var breathe = 1 + 0.05 * Math.sin(state.t * (Math.PI * 2 * 0.05) + state.breathePhase);

      // update anchors (spring towards target, no snapping) + hold gravity-well
      var anyHeldOrRecent = false;
      for (var i = 0; i < state.anchors.length; i++) {
        var a = state.anchors[i];
        if (!a.alive) continue;
        a.x = approach(a.x, a.tx, 6, dt);
        a.y = approach(a.y, a.ty, 6, dt);
        if (a.held) anyHeldOrRecent = true;
        if (!a.held && a.releasedAt >= 0) {
          var age = state.t - a.releasedAt;
          if (age < PERSIST_AFTER_RELEASE) anyHeldOrRecent = true;
        }
        // gravity well: while held, tighten eases toward HOLD_TIGHTEN; released, back to 0.
        var tightenTarget = a.held ? HOLD_TIGHTEN : 0;
        a.tighten = approach(a.tighten, tightenTarget, HOLD_EASE_RATE, dt);
      }

      // remove anchors that have fully aged out (persist + disperse) and have no living particles referencing them
      for (var ai = state.anchors.length - 1; ai >= 0; ai--) {
        var an = state.anchors[ai];
        var noParticles = true;
        for (var pp = 0; pp < state.particles.length; pp++) {
          if (state.particles[pp].anchor === ai && state.particles[pp].life > 0.01) { noParticles = false; break; }
        }
        var expired = (!an.held && an.releasedAt >= 0 && (state.t - an.releasedAt) > (PERSIST_AFTER_RELEASE + DISPERSE_DURATION));
        if ((!an.alive && noParticles) || (expired && noParticles)) {
          state.anchors.splice(ai, 1);
          // fix up particle anchor indices
          for (var pf = 0; pf < state.particles.length; pf++) {
            if (state.particles[pf].anchor > ai) state.particles[pf].anchor--;
          }
          // keep idle bookkeeping in sync if the pruned anchor shifted indices
          if (state.idleAnchorIdx != null) {
            if (state.idleAnchorIdx === ai) state.idleAnchorIdx = null;
            else if (state.idleAnchorIdx > ai) state.idleAnchorIdx--;
          }
        }
      }

      // update + draw particles
      var sprites = state.spriteCache;
      for (var qi = state.particles.length - 1; qi >= 0; qi--) {
        var pt = state.particles[qi];
        var anchor = state.anchors[pt.anchor];
        if (!anchor) { state.particles.splice(qi, 1); continue; }

        // determine fade target: full life if anchor alive & (held or within persist window)
        var targetLife = 1;
        var dying = false;
        if (!anchor.alive) {
          targetLife = 0;
          dying = true;
        } else if (!anchor.held && anchor.releasedAt >= 0) {
          var age = state.t - anchor.releasedAt;
          if (age > PERSIST_AFTER_RELEASE) {
            var disperseProg = (age - PERSIST_AFTER_RELEASE) / DISPERSE_DURATION;
            targetLife = clamp(1 - disperseProg, 0, 1);
            dying = disperseProg > 0;
          }
        }
        pt.life = approach(pt.life, targetLife, dying ? DYING_EASE_RATE : LIFE_EASE_RATE, dt);
        // organic wave-eased visible alpha: dissolution ripples rather than evaporates linearly
        var visLife = dying ? waveEase(pt.life) : pt.life;
        if (pt.life < 0.01 && targetLife === 0) {
          state.particles.splice(qi, 1);
          continue;
        }

        // ease orbit radius scale toward 1 (settle-in), then apply hold-well tighten
        pt.curRadiusScale = approach(pt.curRadiusScale, 1, SETTLE_IN_RATE, dt);
        var radiusScale = pt.curRadiusScale * (1 - anchor.tighten);
        // gentle shrink as element fades toward zero (organic, "wave" dissolve)
        var sizeScale = dying ? (0.55 + 0.45 * visLife) : 1;

        // character-preset live ease: radius/ecc/jitter/drift chase their targets
        // over ~2s (CHARACTER_EASE_RATE) so a character switch never snaps —
        // see applyControl() for how targets get (re)rolled on switch.
        pt.radius = approach(pt.radius, pt.radiusTarget, CHARACTER_EASE_RATE, dt);
        pt.ecc = approach(pt.ecc, pt.eccTarget, CHARACTER_EASE_RATE, dt);
        pt.jitterAmp = approach(pt.jitterAmp, pt.jitterAmpTarget, CHARACTER_EASE_RATE, dt);
        pt.driftAmp = approach(pt.driftAmp, pt.driftAmpTarget, CHARACTER_EASE_RATE, dt);

        // advance orbit phase & precession
        pt.phase += pt.angSpeed * dt;
        pt.incl += pt.precessRate * dt;

        // bounded smooth jitter (swarm character): small sinusoidal wobble on
        // radius so orbits feel livelier without ever becoming erratic/jerky.
        pt.jitterPhase += pt.jitterSpeed * dt;
        var jitterScale = 1 + pt.jitterAmp * Math.sin(pt.jitterPhase);

        // slow inter-anchor drift (swarm character): the orbit's inclination
        // heading creeps very slowly, bounded by driftAmp, reading as a gentle
        // organic wander rather than any teleport or discontinuity.
        pt.driftAngle += pt.driftSpeed * dt;
        var driftIncl = pt.driftAmp * Math.sin(pt.driftAngle);

        var r = pt.radius * radiusScale * breathe * jitterScale;
        var rx = r;
        var ry = r * (1 - pt.ecc);

        var cosP = Math.cos(pt.phase), sinP = Math.sin(pt.phase);
        var ex = rx * cosP;
        var ey = ry * sinP;
        var totalIncl = pt.incl + driftIncl;
        var cosI = Math.cos(totalIncl), sinI = Math.sin(totalIncl);
        var wx = ex * cosI - ey * sinI;
        var wy = ex * sinI + ey * cosI;

        var targetX = anchor.x + wx;
        var targetY = anchor.y + wy;

        // ease particle position toward its orbital target (keeps motion smooth,
        // avoids any teleport when anchor moves or scale changes)
        pt.x = approach(pt.x === undefined ? targetX : pt.x, targetX, 8, dt);
        pt.y = approach(pt.y === undefined ? targetY : pt.y, targetY, 8, dt);

        // sample trail at a fixed cadence so threads read as smooth light, not stepped
        pt.trailAccum += dt;
        if (pt.trailAccum >= TRAIL_SAMPLE_DT) {
          pt.trailAccum -= TRAIL_SAMPLE_DT;
          pt.trail.push({ x: pt.x, y: pt.y });
          // ALWAYS trimmed to the normal cap, in BOTH trace modes: 'stays'
          // persistence lives in the bounded ink layer (see ensureInkLayer),
          // never in a growing per-particle buffer -- an untrimmed trail
          // array grows ~22 points/sec/orbiter forever (memory + per-frame
          // draw cost explosion over exactly the long calm sessions this
          // app is for).
          if (pt.trail.length > pt.trailLen) pt.trail.shift();
        }

        var alpha = visLife;
        if (alpha <= 0.01) continue;

        // sprite cache key: bucket colorT to 16 steps, size to 6 steps, plus which
        // mood palette this particle samples from (each mood needs its own sprites)
        var ctKey = Math.round(pt.colorT * 16);
        var szKey = Math.round(((pt.size - 1.5) / (5.5 - 1.5)) * 5);
        var palette = pt.palette || MOODS[0].colors;
        var key = pt.moodIdx + '_' + ctKey + '_' + szKey;
        var spr = sprites[key];
        if (!spr) {
          var col = paletteColor(palette, ctKey / 16);
          var bigR = 3.2 + (pt.size / 5.5) * 6.5; // big soft glow radius scales w/ particle size
          var smallR = pt.size;
          spr = {
            big: buildGlowSprite(col, bigR, 0.20),
            small: buildGlowSprite(col, smallR * 1.8, 0.9),
            trail: buildGlowSprite(col, Math.max(2.4, smallR * 1.1), 0.75),
            color: col,
            // pre-built fillStyle string for ink stamping (trace 'stays') --
            // avoids rebuilding the rgb() string per orbiter per frame.
            ink: 'rgb(' + Math.round(col[0]) + ',' + Math.round(col[1]) + ',' + Math.round(col[2]) + ')'
          };
          sprites[key] = spr;
        }

        // Trace control (kid chip) 'stays': lay ONE tiny permanent mark per
        // frame into the ink layer at the orbiter's current position -- the
        // accumulated marks ARE the persistent trace (the main canvas is
        // fully cleared each frame, see the composite at the top of tick).
        // Cheap: <= MAX_PARTICLES small fills/frame; scaled by the
        // particle's own visible alpha so dispersing fireflies lay
        // progressively fainter ink instead of hard dots.
        if (state.traceMode === 'stays' && state.inkCtx) {
          state.inkCtx.globalAlpha = 0.35 * alpha;
          state.inkCtx.fillStyle = spr.ink;
          state.inkCtx.beginPath();
          state.inkCtx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
          state.inkCtx.fill();
          state.inkDirty = true;
        }

        // draw short fading trail first (threads of light), oldest -> newest, alpha to true zero
        var trail = pt.trail;
        var tw = spr.trail.width, th = spr.trail.height;
        if (trail.length > 1) {
          for (var ti = 0; ti < trail.length; ti++) {
            var tFrac = (ti + 1) / trail.length; // 0..1, newest = 1
            var tAlpha = alpha * tFrac * tFrac * 0.38; // pass3: lower ceiling so threads read delicate (was 0.55)
            if (tAlpha <= 0.01) continue;
            var tp = trail[ti];
            ctx.globalAlpha = tAlpha;
            ctx.drawImage(spr.trail, tp.x - tw / 2, tp.y - th / 2);
          }
        }

        // layer 1: big low-alpha disc (soft glow) — shrinks slightly with fade
        var bw = spr.big.width * sizeScale, bh = spr.big.height * sizeScale;
        ctx.globalAlpha = alpha * 0.55;
        ctx.drawImage(spr.big, pt.x - bw / 2, pt.y - bh / 2, bw, bh);

        // layer 2: small bright disc — shrinks slightly with fade
        var sw = spr.small.width * sizeScale, sh = spr.small.height * sizeScale;
        ctx.globalAlpha = alpha;
        ctx.drawImage(spr.small, pt.x - sw / 2, pt.y - sh / 2, sw, sh);
      }
      ctx.globalAlpha = 1;
    },

    idle: function (state, w, h, dt) {
      // If user has planted anchors and constellation still alive/dispersing, skip idle spawn.
      if (state.anchors.length > 0) return;
      if (state.pointerDown) return;

      // maintain one faint idle anchor drifting near center with ~25 motes
      var ia = state.idleAnchor;
      ia.retimeT -= dt;
      if (ia.retimeT <= 0) {
        ia.tx = w * 0.5 + rand(-w * 0.12, w * 0.12);
        ia.ty = h * 0.5 + rand(-h * 0.12, h * 0.12);
        ia.retimeT = rand(6, 12);
      }
      ia.x = approach(ia.x, ia.tx, 0.4, dt);
      ia.y = approach(ia.y, ia.ty, 0.4, dt);

      // lazily create idle anchor+particles in the real anchors/particles arrays
      if (!state.idleSeeded) {
        var na = makeAnchor(ia.x, ia.y);
        na.born = state.t;
        na.held = true; // keep alive indefinitely (idle anchor is perpetual, driven manually)
        na.releasedAt = -1;
        na.tighten = 0;
        state.anchors.push(na);
        state.idleAnchorIdx = state.anchors.length - 1;
        var count = IDLE_PARTICLES;
        for (var p = 0; p < count; p++) {
          var pt = makeParticle(state.idleAnchorIdx, ia.x, ia.y, state.characterId, state.moodIdx, sizeFactor(state)); // size control (kid slider)
          pt.born = state.t;
          state.particles.push(pt);
        }
        state.idleSeeded = true;
      } else {
        var idx = state.idleAnchorIdx;
        var anchor = state.anchors[idx];
        if (anchor) {
          anchor.x = ia.x; anchor.y = ia.y;
          anchor.tx = ia.x; anchor.ty = ia.y;
        }
      }
    },

    controls: {
      moods: [
        { id: MOODS[0].id, name: MOODS[0].name, colors: MOODS[0].colors },
        { id: MOODS[1].id, name: MOODS[1].name, colors: MOODS[1].colors },
        { id: MOODS[2].id, name: MOODS[2].name, colors: MOODS[2].colors },
        { id: MOODS[3].id, name: MOODS[3].name, colors: MOODS[3].colors }
      ],
      character: {
        label: 'Constellation',
        options: [
          { id: 'halo', name: 'Halo' },
          { id: 'ellipse', name: 'Ellipse' },
          { id: 'swarm', name: 'Swarm' }
        ]
      }
    },

    // kind: 'mood' | 'character'. id: the selected option's id.
    // Mood switch — new particles sample the new palette; existing particles keep
    // their captured palette and age out naturally (no global recolor snap).
    // Character switch — every existing particle gets fresh radius/ecc/jitter/drift
    // targets sampled from the new preset's ranges, then eases toward them over
    // ~2s in tick() (see CHARACTER_EASE_RATE) — never a snap, safe under rapid taps
    // because re-applying just re-rolls the target again from wherever it currently is.
    applyControl: function (state, kind, id) {
      if (kind === 'size') { state.sizeMul = Math.max(0.6, Math.min(1.6, Number(id) || 1)); return; }
      if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
      if (kind === 'trace') { state.traceMode = (id === 'stays') ? 'stays' : 'fades'; return; }
      if (kind === 'mood') {
        for (var i = 0; i < MOODS.length; i++) {
          if (MOODS[i].id === id) { state.moodIdx = i; break; }
        }
      } else if (kind === 'character') {
        var preset = CHARACTER_PRESETS[id];
        if (!preset) return;
        state.characterId = id;
        for (var qi = 0; qi < state.particles.length; qi++) {
          var pt = state.particles[qi];
          pt.character = id;
          pt.radiusTarget = rand(preset.radiusMin, preset.radiusMax);
          pt.eccTarget = rand(preset.eccMin, preset.eccMax);
          pt.jitterAmpTarget = preset.jitterAmp;
          pt.driftAmpTarget = preset.driftAmp;
        }
      }
    }
  };

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['orbits'] = VARIANT;

})();
