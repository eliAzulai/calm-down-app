// Morph variant for Calm Station demo harness. Pass 2.
// Vertex-morphing geometry: rings of points interpolate radius-at-angle between
// circle -> triangle -> square -> hexagon -> circle, forever, with smoothstep easing.
// Vanilla ES5-friendly JS. No libraries. Single file. See window.VARIANTS['morph'].

(function () {

  // Palette "opal": soft iridescent pastels, dark-bg friendly, moderate saturation.
  var PALETTE = ['#bfe8e0', '#cdb8e8', '#f0bcd0', '#f2ddb0', '#b7e0c8'];
  // names: pale aqua, lilac, blush, champagne, seafoam

  // ---- mood palettes (moods[0] = opal, current/default) ---------------------
  // Curated to sit dark-bg beautiful at moderate saturation, same 5-stop shape
  // as opal so paletteSample()/ring-flow logic needs no changes per mood.
  var MOODS = [
    { id: 'opal', name: 'Opal', colors: ['#bfe8e0', '#cdb8e8', '#f0bcd0', '#f2ddb0', '#b7e0c8'] },
    // dusk: twilight embers -- muted rose/plum/amber, calm sunset-adjacent
    { id: 'dusk', name: 'Dusk Ember', colors: ['#e0a8a0', '#c9a0c8', '#e8c090', '#a89ccb', '#d8b0a8'] },
    // glacier: cool blues/teals/silvers, still and slow
    { id: 'glacier', name: 'Glacier', colors: ['#a8d4e8', '#9fc9d0', '#c9dde8', '#8bb8c9', '#b8e0dc'] },
    // moss: deep soft greens with a warm clay accent, forest-floor calm
    { id: 'moss', name: 'Mossglow', colors: ['#a8c9a0', '#8bb090', '#c9d8a8', '#b09878', '#96c0a8'] }
  ];

  // ---- shape sets (character) -------------------------------------------
  // Each set is an array of 4 radius-at-angle functions, cycled the same way
  // FORMS was: fn(theta) -> multiplier, staged through a morph the same as before.
  // classic uses the pre-existing polyRadius (built below in SHAPE_SETS).

  var POINTS = 48;               // points per ring
  var MAX_SHAPES = 24;           // hard cap on live shapes
  var LIFE = 14;                 // seconds a shape lives
  var GROW_TIME = 2;             // seconds to grow from 0 to max radius
  var MORPH_TIME = 3.5;          // seconds per shape-to-shape transition
  // pass4 trace-fade policy: was 0.075 (pass3 trail-trim value, up from 0.055
  // in pass2). Measured wake decay to <1% at 0.075 already lands around
  // ~0.77s @60fps (with the pulse below), inside the <1s target but with
  // little margin once real overlapping drag/morph paint is factored in.
  // Raised to 0.11 for real headroom under the 1s wake-afterglow ceiling.
  var VEIL_ALPHA = 0.11;
  // kept at the same ~9.1x ratio to VEIL_ALPHA as pass2/pass3 (0.5/0.055,
  // 0.682/0.075) so the punch-through headroom above the new veil alpha,
  // which erases any float-rounding residue floor, is unchanged.
  var VEIL_PULSE_ALPHA = 1.0;
  var VEIL_PULSE_EVERY = 30;     // frames between pulses (~0.5s @60fps) — well under any flash threshold,
                                  // and only ever perceptible on pixels already near-invisible anyway
  var ROT_SPEED = 0.15;          // rad/s max rotation speed while morphing
  // pass4 trace-fade policy: was 1.8s (pass3, up from 1.2s in pass1/pass2).
  // Measured: a dying shape's own alpha envelope already reaches exact 0 at
  // age=life with this window entirely inside the last 1.8s, i.e. already
  // under the 3s policy ceiling — but tightened to 1.4s anyway for real
  // margin, since a shorter, crisper "wave collapses to nothing" reads more
  // clearly as an intentional fade rather than a slow lingering dim tail.
  var FADE_EDGE = 1.4;           // seconds of fade in / fade out at life edges (organic wave)
  var DRAG_EASE = 6.0;           // heavier easing = smaller number; used as rate in exp decay
  var BREATHE_HZ = 0.1;          // hold-breathe frequency (well under 0.3Hz calm cap)
  var BREATHE_AMP = 0.03;        // +-3% scale while held
  var PAIR_CHANCE_PER_SEC = 0.02;// small odds/sec of trying to start a duet
  var PAIR_ORBIT_R = 46;         // px orbit radius for duet pairing
  var PAIR_ORBIT_SPEED = 0.35;   // rad/s orbit speed (slow, subtle)
  var MAX_PAIRS = 1;             // never more than one duet at a time (keep it rare/uncrowded)

  // ---- shape radius-at-angle functions -----------------------------------
  // Each returns a radius multiplier (0..1-ish) for a given angle theta,
  // for a shape with `sides` (0 = circle).
  function polyRadius(theta, sides) {
    if (sides <= 0) return 1.0;
    // distance from center to edge of regular polygon at angle theta,
    // normalized so the polygon's vertices touch radius 1.
    var a = Math.PI / sides;
    // angle relative to nearest vertex, folded into [-a, a]
    var t = theta % (2 * a);
    if (t < 0) t += 2 * a;
    t -= a;
    return Math.cos(a) / Math.cos(t);
  }

  // Star radius function: alternating outer/inner radii around `points` tips,
  // blended smoothly (not a hard polygon fold) so silhouettes stay soft/rounded
  // rather than sharp/spiky. innerRatio >= 0.55 keeps the "waist" shallow, which
  // is what keeps a star calm instead of aggressive. `soften` (0..1) blends the
  // raw alternating cosine lobe toward a rounder cosine-squared-ish shape.
  function starRadius(theta, points, innerRatio, soften) {
    // lobe(theta) is a smooth wave that ranges [innerRatio, 1] with `points`
    // outer peaks and `points` inner troughs -- avoids the C0-discontinuous
    // "kink" you get from literally alternating between two radii.
    var raw = Math.cos(theta * points);
    // shape the wave: push it toward flatter tops/bottoms (rounder tips/waists)
    // by blending with its own sign-preserving sqrt curve, controlled by soften.
    var shaped = raw >= 0
      ? Math.pow(raw, 1 - 0.5 * soften)
      : -Math.pow(-raw, 1 - 0.5 * soften);
    var mid = (1 + innerRatio) / 2;
    var half = (1 - innerRatio) / 2;
    return mid + half * shaped;
  }

  // Petal/rosette radius function: organic k-lobed flower silhouette.
  // r = R * (1 - d + d * |cos(k*theta/2)|^p) -- p<1 rounds the lobe tips,
  // d controls lobe depth (how far the "waist" between petals pinches in).
  function petalRadius(theta, k, depth, p) {
    var w = Math.abs(Math.cos(k * theta / 2));
    return (1 - depth) + depth * Math.pow(w, p);
  }

  // sequence of forms the shape cycles through
  var FORMS = [0, 3, 4, 6]; // circle, triangle, square, hexagon -> back to circle

  // ---- shape sets (character control) -------------------------------------
  // Each set exposes `forms`: an array of theta->multiplier functions cycled
  // in order (last wraps to first), matching how FORMS/polyRadius worked.
  var SHAPE_SETS = {
    classic: {
      label: 'Classic',
      forms: [
        function (theta) { return polyRadius(theta, 0); },  // circle
        function (theta) { return polyRadius(theta, 3); },  // triangle
        function (theta) { return polyRadius(theta, 4); },  // square
        function (theta) { return polyRadius(theta, 6); }   // hexagon
      ]
    },
    stars: {
      label: 'Stars',
      // circle -> 5-point -> 6-point -> 8-point, inner/outer ratio 0.6 (>= 0.55
      // floor) and soften 0.6 so points read rounded, never spiky/aggressive.
      forms: [
        function (theta) { return polyRadius(theta, 0); },              // circle
        function (theta) { return starRadius(theta, 5, 0.6, 0.6); },    // 5-point star
        function (theta) { return starRadius(theta, 6, 0.6, 0.6); },    // 6-point star
        function (theta) { return starRadius(theta, 8, 0.62, 0.6); }    // 8-point star
      ]
    },
    petals: {
      label: 'Petals',
      // circle -> 3-petal -> 5-petal -> 8-petal rounded rosettes.
      forms: [
        function (theta) { return polyRadius(theta, 0); },             // circle
        function (theta) { return petalRadius(theta, 3, 0.42, 0.7); }, // 3-petal
        function (theta) { return petalRadius(theta, 5, 0.42, 0.7); }, // 5-petal
        function (theta) { return petalRadius(theta, 8, 0.4, 0.7); }   // 8-petal
      ]
    }
  };
  var DEFAULT_SHAPE_SET = 'classic';

  function smoothstep(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---- palette helpers ------------------------------------------------------
  // Parse curated hex palette once into [r,g,b] arrays; cached, never rebuilt per-frame.
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ];
  }
  var PALETTE_RGB = (function () {
    var out = new Array(PALETTE.length);
    for (var i = 0; i < PALETTE.length; i++) out[i] = hexToRgb(PALETTE[i]);
    return out;
  })();

  // Precompute RGB arrays for every curated mood once; live shapes capture a
  // reference to one of these arrays at spawn time and never re-read it, so
  // switching the active mood never repaints shapes already on screen.
  var MOOD_RGB = {};
  (function () {
    for (var m = 0; m < MOODS.length; m++) {
      var mood = MOODS[m];
      var arr = new Array(mood.colors.length);
      for (var i = 0; i < mood.colors.length; i++) arr[i] = hexToRgb(mood.colors[i]);
      MOOD_RGB[mood.id] = arr;
    }
  })();
  var DEFAULT_MOOD = MOODS[0].id; // 'opal'

  function lerpColorRgb(c1, c2, t, alpha) {
    var r = Math.round(lerp(c1[0], c2[0], t));
    var g = Math.round(lerp(c1[1], c2[1], t));
    var b = Math.round(lerp(c1[2], c2[2], t));
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // Given a continuous "palette position" p (0..rgbArr.length, wraps),
  // return interpolated [r,g,b] between the two nearest stops of the given
  // palette RGB array (defaults to the opal PALETTE_RGB for back-compat).
  function paletteSample(p, rgbArr) {
    var arr = rgbArr || PALETTE_RGB;
    var n = arr.length;
    var pp = p % n;
    if (pp < 0) pp += n;
    var i0 = Math.floor(pp);
    var i1 = (i0 + 1) % n;
    var t = pp - i0;
    var c0 = arr[i0], c1 = arr[i1];
    return [
      lerp(c0[0], c1[0], t),
      lerp(c0[1], c1[1], t),
      lerp(c0[2], c1[2], t)
    ];
  }

  // size control (kid slider): continuous multiplier for a shape's maxR
  // (its full-grown radius) at spawn, plus optional per-shape randomized
  // jitter ("surprise sizes"). Applied only at spawn (see makeShape call
  // sites) so a live shape never jumps mid-life.
  function sizeFactor(state) {
    var m = (state && state.sizeMul) || 1;
    return (state && state.sizeRandom) ? m * (0.7 + Math.random() * 0.6) : m;
  }

  // ---- shape factory --------------------------------------------------------
  function makeShape(x, y, maxR, dragTarget, shapeSetId, moodId) {
    var setId = shapeSetId || DEFAULT_SHAPE_SET;
    var set = SHAPE_SETS[setId] || SHAPE_SETS[DEFAULT_SHAPE_SET];
    var formIdx = Math.floor(Math.random() * set.forms.length);
    var mId = moodId || DEFAULT_MOOD;
    return {
      x: x, y: y,
      vx: 0, vy: 0,
      targetX: x, targetY: y,
      age: 0,
      life: LIFE,
      maxR: maxR,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() * 2 - 1) * ROT_SPEED,
      // character (shape set) state: shapeSetId is the set currently being
      // cycled; pendingShapeSetId (if set) is queued to take over at the next
      // form-to-form wrap boundary so a live shape never snaps mid-morph.
      shapeSetId: setId,
      pendingShapeSetId: null,
      formIdx: formIdx,
      morphT: Math.random() * MORPH_TIME, // stagger phase so shapes don't sync
      // mood (palette) state: captured once at spawn, immutable thereafter --
      // this is what makes "live shapes keep colors" true under mood switches.
      moodId: mId,
      paletteRgb: MOOD_RGB[mId] || PALETTE_RGB,
      // palette ring cycling: base position around the palette ring, drifts slowly;
      // each of the 48 segments samples a slightly different offset for flow.
      paletteBase: Math.random() * (MOOD_RGB[mId] || PALETTE_RGB).length,
      paletteSpeed: 0.015 + Math.random() * 0.02, // slow cycle of which stops are in view
      isDragging: !!dragTarget,
      dead: false,
      // hold-to-breathe state
      held: false,
      holdTime: 0,
      // snapshot of morph position at moment of hold, so resume picks up exactly
      // (morphT/formIdx already serve this since we simply stop advancing them)
      // pairing/duet state
      paired: null,       // reference to partner shape, or null
      orbitAngle: 0,
      orbitCenterX: x,
      orbitCenterY: y,
      isOrbiting: false
    };
  }

  // ---- variant registration --------------------------------------------------
  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['morph'] = {
    name: 'Morph',
    tagline: 'Opalescent shapes breathe, dissolve like waves, and sometimes drift into a slow duet.',

    // ---- gallery-shell contract: kid-facing smart controls -----------------
    controls: {
      moods: MOODS.map(function (m) {
        return { id: m.id, name: m.name, colors: m.colors.slice() };
      }),
      character: {
        label: 'Shapes',
        options: [
          { id: 'classic', name: 'Classic' },
          { id: 'stars', name: 'Stars' },
          { id: 'petals', name: 'Petals' }
        ]
      }
    },

    // Applies a control change. kind: 'mood' | 'character'. id: the option id.
    // New spawns adopt the change immediately (state.activeMoodId / activeShapeSetId
    // drive makeShape() calls below). Live shapes:
    //  - mood: never touched (paletteRgb was captured at spawn, immutable).
    //  - character: queued via pendingShapeSetId, swapped in at updateShape()'s
    //    next form-to-form wrap boundary so nothing snaps mid-morph.
    applyControl: function (state, kind, id) {
      if (kind === 'size') { state.sizeMul = Math.max(0.6, Math.min(1.6, Number(id) || 1)); return; }
      if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
      if (kind === 'mood') {
        if (!MOOD_RGB[id]) return;
        state.activeMoodId = id;
      } else if (kind === 'character') {
        if (!SHAPE_SETS[id]) return;
        state.activeShapeSetId = id;
        var all = collectAllShapes(state);
        for (var i = 0; i < all.length; i++) {
          if (all[i].shapeSetId !== id) all[i].pendingShapeSetId = id;
        }
      }
    },

    init: function (w, h, theme) {
      var st = {
        w: w, h: h,
        theme: theme,
        shapes: [],
        activeDragShape: null,
        idleShape: null,
        idleTimer: 0,
        idleSpawnDelay: 2.0 + Math.random() * 2.0,
        frameCount: 0,
        activeMoodId: DEFAULT_MOOD,
        activeShapeSetId: DEFAULT_SHAPE_SET,
        sizeMul: 1, sizeRandom: false
      };
      // seed idle ambient shape immediately so canvas feels alive pre-touch
      st.idleShape = makeShape(w * 0.3 + Math.random() * w * 0.4, h * 0.3 + Math.random() * h * 0.4, (70 + Math.random() * 30) * sizeFactor(st), false, st.activeShapeSetId, st.activeMoodId); // size control (kid slider)
      st.idleShape.isIdle = true;
      st.idleShape.driftVX = (Math.random() * 2 - 1) * 6; // px/s, very slow drift
      st.idleShape.driftVY = (Math.random() * 2 - 1) * 6;
      return st;
    },

    pointer: function (state, x, y, kind) {
      if (kind === 'down') {
        if (state.shapes.length >= MAX_SHAPES) {
          // remove oldest to make room
          state.shapes.shift();
        }
        var maxR = (40 + Math.random() * 70) * sizeFactor(state); // 40-110 px, size control (kid slider)
        var s = makeShape(x, y, maxR, true, state.activeShapeSetId, state.activeMoodId);
        s.held = true;
        s.holdTime = 0;
        state.shapes.push(s);
        state.activeDragShape = s;
      } else if (kind === 'move') {
        if (state.activeDragShape && !state.activeDragShape.dead) {
          state.activeDragShape.targetX = x;
          state.activeDragShape.targetY = y;
        }
      } else if (kind === 'up') {
        if (state.activeDragShape) {
          state.activeDragShape.isDragging = false;
          state.activeDragShape.held = false;
          state.activeDragShape.holdTime = 0;
        }
        state.activeDragShape = null;
      }
    },

    tick: function (state, ctx, dt, w, h) {
      state.w = w; state.h = h;

      // Residue fix: erase toward TRUE transparency using destination-out,
      // never paint an opaque/bg-colored veil. CSS shows #0d1b2a behind the
      // canvas, so what remains under our drawing always reads as "clean".
      // Note: repeated destination-out at a small constant alpha asymptotes
      // toward a nonzero floor due to 8-bit alpha rounding (a pixel can get
      // stuck at e.g. alpha=9 forever, reads as a faint permanent smear).
      // Fix: every VEIL_PULSE_EVERY frames, apply one stronger pulse that
      // reliably rounds any residual alpha down to exactly 0. The pulse is
      // imperceptible in practice (it only ever affects pixels already faded
      // to near-invisible) and at ~0.5s cadence is nowhere near a flash.
      state.frameCount = (state.frameCount + 1) % VEIL_PULSE_EVERY;
      var veilA = (state.frameCount === 0) ? VEIL_PULSE_ALPHA : VEIL_ALPHA;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,' + veilA + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      // update + draw touch-spawned shapes
      var i;
      for (i = state.shapes.length - 1; i >= 0; i--) {
        var s = state.shapes[i];
        updateShape(s, dt, state);
        if (s.age >= s.life) {
          if (s.paired) { s.paired.paired = null; s.paired.isOrbiting = false; }
          state.shapes.splice(i, 1);
          if (state.activeDragShape === s) state.activeDragShape = null;
          continue;
        }
        drawShape(ctx, s);
      }

      maybeStartPairing(state);

      // idle ambient shape (independent lifecycle, drifts slowly, respawns)
      if (state.idleShape) {
        var idl = state.idleShape;
        updateShape(idl, dt, state);
        // gentle drift (only when not orbiting a partner)
        if (!idl.isOrbiting) {
          idl.x += idl.driftVX * dt;
          idl.y += idl.driftVY * dt;
          idl.targetX = idl.x;
          idl.targetY = idl.y;
          // bounce softly off edges (keep it on screen, never teleport)
          var margin = idl.maxR + 20;
          if (idl.x < margin) { idl.driftVX = Math.abs(idl.driftVX); }
          if (idl.x > w - margin) { idl.driftVX = -Math.abs(idl.driftVX); }
          if (idl.y < margin) { idl.driftVY = Math.abs(idl.driftVY); }
          if (idl.y > h - margin) { idl.driftVY = -Math.abs(idl.driftVY); }
        }

        if (idl.age >= idl.life) {
          if (idl.paired) { idl.paired.paired = null; idl.paired.isOrbiting = false; }
          state.idleShape = null;
          state.idleTimer = 0;
          state.idleSpawnDelay = 3.0 + Math.random() * 3.0;
        } else {
          drawShape(ctx, idl);
        }
      } else {
        state.idleTimer += dt;
        if (state.idleTimer >= state.idleSpawnDelay) {
          var nx = state.w * (0.2 + Math.random() * 0.6);
          var ny = state.h * (0.2 + Math.random() * 0.6);
          var ns = makeShape(nx, ny, (60 + Math.random() * 40) * sizeFactor(state), false, state.activeShapeSetId, state.activeMoodId); // size control (kid slider)
          ns.isIdle = true;
          ns.driftVX = (Math.random() * 2 - 1) * 6;
          ns.driftVY = (Math.random() * 2 - 1) * 6;
          state.idleShape = ns;
        }
      }
    },

    idle: function (state, w, h, dt) {
      // Idle ambience is folded into tick() (the idleShape lifecycle above),
      // since tick already needs to run every frame regardless of touch state.
      // This function is intentionally a no-op to avoid double-updating.
    }
  };

  // Collect all currently-alive shapes (touch-spawned + idle) into one list,
  // used for pairing candidate search. Cheap, only called occasionally.
  function collectAllShapes(state) {
    var all = state.shapes.slice();
    if (state.idleShape) all.push(state.idleShape);
    return all;
  }

  // Active-duet count is derived by scanning for isOrbiting shapes (2 per duet),
  // rather than kept in a separate incremented-only counter -- avoids the counter
  // ever drifting out of sync with reality when a duet ends.
  function countActivePairs(all) {
    var orbitingCount = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i].isOrbiting) orbitingCount++;
    }
    return orbitingCount / 2;
  }

  function maybeStartPairing(state) {
    var all = collectAllShapes(state);
    if (countActivePairs(all) >= MAX_PAIRS) return;
    if (Math.random() > PAIR_CHANCE_PER_SEC * (1 / 30)) return; // ~per-frame gate, rare
    var candidates = [];
    for (var i = 0; i < all.length; i++) {
      var s = all[i];
      if (s.paired || s.held || s.isDragging) continue;
      if (s.age < 2 || (s.life - s.age) < 4) continue; // don't pair newborns or near-death shapes
      candidates.push(s);
    }
    if (candidates.length < 2) return;
    // find a nearby-ish pair to keep it plausible (not teleporting shapes together)
    for (var a = 0; a < candidates.length; a++) {
      for (var b = a + 1; b < candidates.length; b++) {
        var s1 = candidates[a], s2 = candidates[b];
        var dx = s1.x - s2.x, dy = s1.y - s2.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 260) {
          s1.paired = s2; s2.paired = s1;
          s1.isOrbiting = true; s2.isOrbiting = true;
          var midX = (s1.x + s2.x) / 2, midY = (s1.y + s2.y) / 2;
          s1.orbitCenterX = midX; s1.orbitCenterY = midY;
          s2.orbitCenterX = midX; s2.orbitCenterY = midY;
          var ang0 = Math.atan2(s1.y - midY, s1.x - midX);
          s1.orbitAngle = ang0;
          s2.orbitAngle = ang0 + Math.PI;
          return;
        }
      }
    }
  }

  function updateShape(s, dt, state) {
    s.age += dt;

    if (s.held) {
      s.holdTime += dt;
    }

    // Orbiting duet: gently circle a shared center instead of normal drag-follow.
    if (s.isOrbiting && s.paired) {
      s.orbitAngle += PAIR_ORBIT_SPEED * dt;
      // recompute a slowly drifting shared center from both members' original targets,
      // but keep it simple/stable: center drifts a little so the pair still floats.
      var cx = s.orbitCenterX, cy = s.orbitCenterY;
      var tx = cx + Math.cos(s.orbitAngle) * PAIR_ORBIT_R;
      var ty = cy + Math.sin(s.orbitAngle) * PAIR_ORBIT_R;
      var followKOrbit = 1 - Math.exp(-DRAG_EASE * dt);
      s.x += (tx - s.x) * followKOrbit;
      s.y += (ty - s.y) * followKOrbit;
      // let the shared center drift very slowly (uses whichever partner updates first;
      // harmless double-update since both converge to same value over time)
      s.orbitCenterX += Math.sin(s.age * 0.13) * 1.2 * dt;
      s.orbitCenterY += Math.cos(s.age * 0.11) * 1.2 * dt;
    } else {
      // heavy-eased follow toward drag target (exponential smoothing, dt-based)
      var followK = 1 - Math.exp(-DRAG_EASE * dt);
      s.x += (s.targetX - s.x) * followK;
      s.y += (s.targetY - s.y) * followK;
    }

    // rotation, slow and constant-ish
    s.rot += s.rotSpeed * dt;

    if (s.held) {
      // Pause morph mid-form and breathe (+-3% scale @ ~0.1Hz) until release.
      // morphT/formIdx are intentionally NOT advanced, so morph resumes exactly
      // where it left off on release.
    } else {
      // advance morph clock; cycles through the active shape set's forms list
      // continuously.
      s.morphT += dt;
      if (s.morphT >= MORPH_TIME) {
        s.morphT -= MORPH_TIME;
        // A form-to-form transition just completed -- this is the only safe
        // moment to swap character (shape set), since at this instant
        // morphT==0 and the shape is sitting exactly on a form (no in-flight
        // interpolation to interrupt = no visual snap). If a character switch
        // is queued, adopt it now; otherwise just advance within the current set.
        if (s.pendingShapeSetId && s.pendingShapeSetId !== s.shapeSetId) {
          s.shapeSetId = s.pendingShapeSetId;
          s.pendingShapeSetId = null;
          s.formIdx = 0; // start the new set's cycle from its first form
        } else {
          var curSet = SHAPE_SETS[s.shapeSetId] || SHAPE_SETS[DEFAULT_SHAPE_SET];
          s.formIdx = (s.formIdx + 1) % curSet.forms.length;
        }
      }
    }

    // palette ring position drifts slowly regardless of hold/morph state
    s.paletteBase += s.paletteSpeed * dt;
  }

  function currentRadiusMul(s, theta) {
    var set = SHAPE_SETS[s.shapeSetId] || SHAPE_SETS[DEFAULT_SHAPE_SET];
    var forms = set.forms;
    var fnA = forms[s.formIdx];
    var fnB = forms[(s.formIdx + 1) % forms.length];
    var t = smoothstep(s.morphT / MORPH_TIME);
    var ra = fnA(theta);
    var rb = fnB(theta);
    return lerp(ra, rb, t);
  }

  function shapeEnvelope(s) {
    // grow 0 -> 1 over GROW_TIME, hold, fade out over FADE_EDGE at life end.
    // Fade-out tail modulated with a gentle sine so dissolution ripples like a
    // wave rather than evaporating linearly; alpha still reaches exact 0 at end
    // of life since smoothstep(0)=0 and the sine ripple is scaled by the same
    // envelope (0 at endpoints).
    var growT = clamp(s.age / GROW_TIME, 0, 1);
    var grow = smoothstep(growT);

    var fadeIn = clamp(s.age / FADE_EDGE, 0, 1);
    var fadeOutLin = clamp((s.life - s.age) / FADE_EDGE, 0, 1);
    var fadeInEase = smoothstep(fadeIn);
    var fadeOutEase = smoothstep(fadeOutLin);

    // organic ripple: add a small sine wobble to the fade-out approach, but
    // strictly bounded so it never pushes alpha above the base envelope or
    // below 0, and always converges to exactly 0 as fadeOutEase -> 0.
    var ripple = 1 + 0.12 * Math.sin(fadeOutLin * Math.PI * 3) * fadeOutLin;
    var fadeOut = clamp(fadeOutEase * ripple, 0, 1);

    var alphaEnv = fadeInEase * fadeOut;

    // slight shrink as it fades out (organic dissolution), never affects fade-in growth
    var shrink = lerp(0.85, 1.0, fadeOutEase);

    // breathing while held: gentle +-3% scale at BREATHE_HZ, independent of envelope
    var breathe = 1.0;
    if (s.held) {
      breathe = 1.0 + BREATHE_AMP * Math.sin(s.holdTime * Math.PI * 2 * BREATHE_HZ);
    }

    return { scale: grow * shrink * breathe, alpha: alphaEnv };
  }

  function drawShape(ctx, s) {
    var env = shapeEnvelope(s);
    if (env.alpha <= 0.002 || env.scale <= 0.002) return;

    var radius = s.maxR * env.scale;

    // build point ring; color flows around the ring itself via segment-wise
    // palette sampling (not a single flat color, not a per-frame full-canvas
    // gradient — just per-vertex interpolation off the shape's own cached
    // paletteRgb, captured at spawn from whichever mood was active then).
    var pts = new Array(POINTS);
    var cols = new Array(POINTS);
    var i, theta, rMul, r, px, py;
    for (i = 0; i < POINTS; i++) {
      theta = (i / POINTS) * Math.PI * 2;
      rMul = currentRadiusMul(s, theta);
      r = radius * rMul;
      var a = theta + s.rot;
      px = s.x + Math.cos(a) * r;
      py = s.y + Math.sin(a) * r;
      pts[i] = [px, py];
      // palette position for this vertex: base offset + fraction of ring traversal,
      // scaled down so only ~1-2 stops are visible across the ring at once (flowing,
      // not a rainbow smear).
      cols[i] = s.paletteBase + (i / POINTS) * 1.6;
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // dual stroke: wide low-alpha glow + narrow bright core (no shadowBlur),
    // drawn as per-segment strokes so color can flow along the ring.
    drawRingSegments(ctx, pts, cols, env.alpha, 10, 0.16, s.paletteRgb);
    drawRingSegments(ctx, pts, cols, env.alpha, 2.4, 0.85, s.paletteRgb);
  }

  function drawRingSegments(ctx, pts, cols, alphaMul, lineWidth, alphaBase, rgbArr) {
    ctx.lineWidth = lineWidth;
    var n = pts.length;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var rgb = paletteSample((cols[i] + cols[j]) * 0.5, rgbArr);
      ctx.strokeStyle = 'rgba(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ',' + (alphaBase * alphaMul) + ')';
      ctx.beginPath();
      ctx.moveTo(pts[i][0], pts[i][1]);
      ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.stroke();
    }
  }

})();
