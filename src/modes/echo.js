// Echo variant for Calm Station demo harness.
// "Instead of trails... multiple images of the color... get rid of the black
//  tail altogether" -- while dragged, the live morphing object stamps FULL-
//  OPACITY copies of itself along the path: crisp discrete after-images, no
//  fading smear, no veil. Stamps paint over older stamps (natural painter's-
//  algorithm overwrite via opaque source-over fill). Persistence is forever
//  until the gallery's Clear button re-runs init().
//
// Reuses morph.js's 48-point vertex-morphing geometry (circle -> triangle ->
// square -> hexagon -> circle, smoothstep-eased) for the stamped/live shape.
//
// Vanilla ES5-friendly JS. No libraries. Single file. See window.VARIANTS['echo'].
(function () {

  // ---- moods: 4 curated 5-6-hex opaque-friendly palettes, each chosen to look
  // beautiful ADJACENT to each other (stamps constantly neighbor each other
  // along a drag path), walked smoothly by distance traveled.
  // moods[0] = current/default "Dusk Spectrum" palette -- hexes preserved.
  var MOODS = [
    {
      id: 'dusk-spectrum',
      name: 'Dusk Spectrum',
      // coral -> amber -> rose -> violet -> indigo -> teal -> (wraps to coral)
      colors: ['#ff8a65', '#ffb74d', '#f06292', '#ab47bc', '#5c6bc0', '#26a69a']
    },
    {
      id: 'citrus-grove',
      name: 'Citrus Grove',
      // sunlit warm-to-green walk: lemon -> tangerine -> guava -> lime -> mint
      colors: ['#ffe08a', '#ffab5e', '#ff8a80', '#b4e05a', '#6fcf97']
    },
    {
      id: 'tidepool',
      name: 'Tidepool',
      // cool aqua/seaglass walk, calm and watery
      colors: ['#7fd8d0', '#5aa8c9', '#8ec6e8', '#4fb8a0', '#a0e0c8', '#6a9fd0']
    },
    {
      id: 'velvet-orchard',
      name: 'Velvet Orchard',
      // deep jewel-tone walk: plum -> berry -> garnet -> mulberry -> grape
      colors: ['#8e5aa8', '#c0507a', '#a83e5c', '#7a4fa0', '#b06fc9']
    }
  ];
  function findMood(id) {
    for (var i = 0; i < MOODS.length; i++) if (MOODS[i].id === id) return MOODS[i];
    return MOODS[0];
  }

  // ---- character (held-object shape family) ------------------------------
  // Each set exposes `forms`: 4 theta->radius-multiplier functions cycled the
  // same way FORMS/polyRadius always worked, so morph timing is unaffected by
  // which set is active. Reuses morph.js's starRadius/petalRadius formulas.
  var CHARACTERS = [
    { id: 'classic', name: 'Classic' },
    { id: 'stars', name: 'Stars' },
    { id: 'petals', name: 'Petals' }
  ];

  var POINTS = 48;                // points per ring, matches morph.js geometry
  var MORPH_TIME = 3.5;           // seconds per shape-to-shape transition (calm pace)
  var ROT_SPEED = 0.12;           // rad/s slow rotation while alive
  var DRAG_EASE = 7.0;            // exponential-follow rate toward pointer target
  var IDLE_EASE = 1.4;            // much gentler follow for idle wander (calmer)

  var MIN_R = 15, MAX_R = 35;     // half of "size ~30-70px" spec (radius, not diameter)
  var SIZE_WOBBLE_HZ = 0.07;      // gentle size breathing, well under calm caps
  var SIZE_WOBBLE_AMP = 0.12;

  var STAMP_DIST = 22;            // px of travel between stamps while dragging
  var STAMP_TIME = 0.08;          // seconds between stamps while moving slowly (80ms)
  var COLOR_CYCLE_PX = 1400;      // px of travel for one full palette cycle
  var LUMA_WOBBLE = 0.10;         // slight luminance wobble per stamp (+-10%)

  var GLOW_HZ = 0.12;             // live-object glow pulse frequency (<=0.15Hz spec)

  // ---- small helpers --------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
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

  // Per-mood RGB arrays, parsed once and cached (never rebuilt per-frame).
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
  var PALETTE_RGB = paletteRgbFor(MOODS[0].id); // default mood's RGB, used by makeObject() default

  // Given continuous palette position p (any real number, wraps mod length),
  // sampled against the given mood's RGB stops -- interpolated between the
  // two nearest stops.
  function paletteSample(rgbArr, p) {
    var n = rgbArr.length;
    var pp = p % n;
    if (pp < 0) pp += n;
    var i0 = Math.floor(pp);
    var i1 = (i0 + 1) % n;
    var t = pp - i0;
    var c0 = rgbArr[i0], c1 = rgbArr[i1];
    return [
      lerp(c0[0], c1[0], t),
      lerp(c0[1], c1[1], t),
      lerp(c0[2], c1[2], t)
    ];
  }

  function shadeRgb(rgb, mul) {
    return [
      clamp(Math.round(rgb[0] * mul), 0, 255),
      clamp(Math.round(rgb[1] * mul), 0, 255),
      clamp(Math.round(rgb[2] * mul), 0, 255)
    ];
  }
  function rgbStr(rgb, a) {
    return 'rgba(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ',' + a + ')';
  }

  // ---- shape radius-at-angle (reused morph math) ----------------------------
  function polyRadius(theta, sides) {
    if (sides <= 0) return 1.0;
    var a = Math.PI / sides;
    var t = theta % (2 * a);
    if (t < 0) t += 2 * a;
    t -= a;
    return Math.cos(a) / Math.cos(t);
  }

  // Star radius function: alternating outer/inner radii around `points` tips,
  // blended smoothly so silhouettes stay soft/rounded rather than sharp/spiky.
  // innerRatio >= 0.55 keeps the "waist" shallow (calm, not aggressive).
  // Copied verbatim from morph.js so stars read identically across variants.
  function starRadius(theta, points, innerRatio, soften) {
    var raw = Math.cos(theta * points);
    var shaped = raw >= 0
      ? Math.pow(raw, 1 - 0.5 * soften)
      : -Math.pow(-raw, 1 - 0.5 * soften);
    var mid = (1 + innerRatio) / 2;
    var half = (1 - innerRatio) / 2;
    return mid + half * shaped;
  }

  // Petal/rosette radius function: organic k-lobed flower silhouette.
  // r = R * (1 - d + d * |cos(k*theta/2)|^p) -- p<1 rounds the lobe tips.
  // Copied verbatim from morph.js.
  function petalRadius(theta, k, depth, p) {
    var w = Math.abs(Math.cos(k * theta / 2));
    return (1 - depth) + depth * Math.pow(w, p);
  }

  // ---- shape sets (character control) ---------------------------------------
  // Each set exposes `forms`: 4 theta->radius-multiplier functions, cycled in
  // order (last wraps to first) exactly as the old fixed FORMS list did, so
  // morph timing/cadence is identical no matter which set is active.
  var SHAPE_SETS = {
    classic: {
      forms: [
        function (theta) { return polyRadius(theta, 0); },  // circle
        function (theta) { return polyRadius(theta, 3); },  // triangle
        function (theta) { return polyRadius(theta, 4); },  // square
        function (theta) { return polyRadius(theta, 6); }   // hexagon
      ]
    },
    stars: {
      // circle -> 5-point -> 6-point -> 8-point, inner/outer ratio >= 0.55
      // and soften 0.6 so points read rounded, never spiky.
      forms: [
        function (theta) { return polyRadius(theta, 0); },              // circle
        function (theta) { return starRadius(theta, 5, 0.6, 0.6); },    // 5-point star
        function (theta) { return starRadius(theta, 6, 0.6, 0.6); },    // 6-point star
        function (theta) { return starRadius(theta, 8, 0.62, 0.6); }    // 8-point star
      ]
    },
    petals: {
      // circle -> 3-lobed -> 5-lobed -> 8-lobed rounded rosettes.
      forms: [
        function (theta) { return polyRadius(theta, 0); },             // circle
        function (theta) { return petalRadius(theta, 3, 0.42, 0.7); }, // 3-lobed
        function (theta) { return petalRadius(theta, 5, 0.42, 0.7); }, // 5-lobed
        function (theta) { return petalRadius(theta, 8, 0.4, 0.7); }   // 8-lobed
      ]
    }
  };
  var DEFAULT_SHAPE_SET = 'classic';
  function shapeSetOrDefault(id) {
    return SHAPE_SETS[id] ? id : DEFAULT_SHAPE_SET;
  }

  function currentRadiusMul(morphT, formIdx, theta, shapeSetId) {
    var forms = SHAPE_SETS[shapeSetOrDefault(shapeSetId)].forms;
    var fnA = forms[formIdx % forms.length];
    var fnB = forms[(formIdx + 1) % forms.length];
    var t = smoothstep(morphT / MORPH_TIME);
    return lerp(fnA(theta), fnB(theta), t);
  }

  var FORMS_PER_SET = 4; // every shape set exposes exactly 4 forms (see SHAPE_SETS)

  // size control (kid slider): continuous multiplier for the live object's
  // draw size, plus optional per-call randomized jitter ("surprise sizes").
  // Kept separate from a per-stamp factor (see stampObject) so the live
  // object never visibly jumps -- only newly-created stamps get their own
  // independently-rolled random size when surprise is on.
  function sizeFactor(state) {
    var m = state.sizeMul || 1;
    return state.sizeRandom ? m * (0.7 + Math.random() * 0.6) : m;
  }

  // Build the ring vertex list for the object's current pose, scaled by the
  // given size multiplier (1 = untouched). Shared by both the live-object
  // draw (continuous state.sizeMul) and the stamp-record path (its own
  // per-stamp factor when surprise sizes is on) -- see call sites.
  function buildRing(obj, sizeMul) {
    var pts = new Array(POINTS);
    var i, theta, rMul, r, a;
    var sm = sizeMul || 1;
    for (i = 0; i < POINTS; i++) {
      theta = (i / POINTS) * Math.PI * 2;
      rMul = currentRadiusMul(obj.morphT, obj.formIdx, theta, obj.shapeSetId);
      r = obj.radius * rMul * sm;
      a = theta + obj.rot;
      pts[i] = [obj.x + Math.cos(a) * r, obj.y + Math.sin(a) * r];
    }
    return pts;
  }

  // ---- live object factory ---------------------------------------------------
  function makeObject(x, y) {
    return {
      x: x, y: y,
      targetX: x, targetY: y,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() * 2 - 1) * ROT_SPEED,
      formIdx: Math.floor(Math.random() * FORMS_PER_SET),
      morphT: Math.random() * MORPH_TIME,
      shapeSetId: DEFAULT_SHAPE_SET,       // active set; only changes at a form-cycle boundary
      pendingShapeSetId: null,             // requested set, applied once current transition finishes
      moodId: MOODS[0].id,                 // mood NEW stamps sample from (changes immediately)
      radius: MIN_R + Math.random() * (MAX_R - MIN_R),
      baseRadius: MIN_R + Math.random() * (MAX_R - MIN_R),
      wobblePhase: Math.random() * Math.PI * 2,
      colorPos: Math.random() * paletteRgbFor(MOODS[0].id).length, // distance-walked palette position
      traveled: 0,          // total px traveled (drives color walk + stamp cadence)
      lastStampX: x,
      lastStampY: y,
      stampTimer: 0,
      age: 0,
      idleAngle: Math.random() * Math.PI * 2,
      idleTimer: 0,
      idleTargetX: x,
      idleTargetY: y
    };
  }

  function updateLiveObject(o, dt, dragging, morphOn) {
    o.age += dt;
    o.rot += o.rotSpeed * dt;

    // Morph is a kid-facing opt-in (2026-08-04): the clock advances only when
    // the Morph control says so -- nothing transforms by itself uninvited.
    // With the clock frozen at a clean form, the boundary below never fires.
    if (morphOn) o.morphT += dt;
    if (o.morphT >= MORPH_TIME) {
      o.morphT -= MORPH_TIME;
      o.formIdx = (o.formIdx + 1) % FORMS_PER_SET;
      // A full form-to-form transition just completed: this is the one safe
      // boundary to swap the live geometry's shape family without a visible
      // pop mid-morph. Apply any pending character switch here.
      if (o.pendingShapeSetId !== null) {
        o.shapeSetId = o.pendingShapeSetId;
        o.pendingShapeSetId = null;
      }
    }

    // gentle size breathing
    o.radius = o.baseRadius * (1 + SIZE_WOBBLE_AMP * Math.sin(o.age * Math.PI * 2 * SIZE_WOBBLE_HZ + o.wobblePhase));

    var prevX = o.x, prevY = o.y;

    if (dragging) {
      var followK = 1 - Math.exp(-DRAG_EASE * dt);
      o.x += (o.targetX - o.x) * followK;
      o.y += (o.targetY - o.y) * followK;
    } else {
      // idle: very slow calm wander -- pick a new gentle target periodically,
      // ease toward it slowly. No stamping happens in this branch.
      o.idleTimer -= dt;
      if (o.idleTimer <= 0) {
        o.idleTimer = 2.5 + Math.random() * 3.0;
        o.idleAngle += (Math.random() * 2 - 1) * 1.4;
      }
      var idleSpeed = 9; // px/s, very slow drift
      o.idleTargetX = o.x + Math.cos(o.idleAngle) * idleSpeed * o.idleTimer;
      o.idleTargetY = o.y + Math.sin(o.idleAngle) * idleSpeed * o.idleTimer;
      var followKIdle = 1 - Math.exp(-IDLE_EASE * dt);
      o.x += (o.idleTargetX - o.x) * followKIdle * 0.4;
      o.y += (o.idleTargetY - o.y) * followKIdle * 0.4;
    }

    var dx = o.x - prevX, dy = o.y - prevY;
    var moved = Math.sqrt(dx * dx + dy * dy);
    o.traveled += moved;
    // Walk units are a fixed reference length (the default mood's stop count)
    // so mood switches never rescale/jump the walk itself -- only which
    // palette's stops get sampled at this position changes (see currentFillRgb).
    o.colorPos = (o.traveled / COLOR_CYCLE_PX) * PALETTE_RGB.length;

    return moved;
  }

  // Samples the object's CURRENT mood at its current walk position. Mood
  // switches take effect immediately here, but since stamps are baked to
  // opaque pixels on the archive canvas the instant they're drawn, only
  // stamps made from this point forward are affected -- prior stamps' pixels
  // are untouched (paletteSample runs once per stampObject() call).
  function currentFillRgb(o) {
    var rgbArr = paletteRgbFor(o.moodId);
    var rgb = paletteSample(rgbArr, o.colorPos);
    // slight luminance wobble tied to distance traveled (deterministic, not per-frame flicker)
    var wob = 1 + LUMA_WOBBLE * Math.sin(o.colorPos * 2.7);
    return shadeRgb(rgb, wob);
  }

  // Trace the ring's closed path into the given 2D context (no fill/stroke
  // applied here -- caller decides). Shared by the fill pass and the rim-glow
  // passes so both always trace identical geometry.
  function traceRingPath(sctx, ring) {
    sctx.beginPath();
    sctx.moveTo(ring[0][0], ring[0][1]);
    for (var i = 1; i < ring.length; i++) sctx.lineTo(ring[i][0], ring[i][1]);
    sctx.closePath();
  }


  // Stamp the object's current geometry: opaque fill + a thin darker outline
  // of the same hue. RESTORED 2026-08-04 to the first-version look (1b07fd8)
  // after a field verdict: bf44370's soft rim-glow + tighter cadence read as
  // "blurred / lost definition" on the iPad (Spec 4 F6 escalation; A/B
  // confirmed side-by-side). The outline is what makes each after-image read
  // as a discrete shape; phase10's edge check now guards it.
  function stampObject(state, o) {
    var sctx = state.stampCtx;
    // size control (kid slider): each stamp gets its own independently-rolled
    // random factor when surprise sizes is on (a stamp is baked once and
    // never revisited, so per-stamp variety here is exactly "surprise" with
    // no live jump); otherwise the plain continuous multiplier. The rim-glow
    // strokes below trace this SAME ring, so they scale with sizeFactor too.
    var pts = buildRing(o, sizeFactor(state));
    var rgb = currentFillRgb(o);

    sctx.save();
    traceRingPath(sctx, pts);
    sctx.fillStyle = rgbStr(rgb, 1);
    sctx.fill();
    // thin, slightly-darker outline of the same hue for definition
    sctx.lineWidth = 2;
    sctx.lineJoin = 'round';
    sctx.strokeStyle = rgbStr(shadeRgb(rgb, 0.68), 1);
    sctx.stroke();
    sctx.restore();
  }

  // Create the offscreen stamp archive at DEVICE resolution (w*dpr × h*dpr)
  // and pre-scale its context by dpr so all stamp drawing stays in CSS-pixel
  // coordinates (same space as pointer coords / the live object). Without this
  // the buffer is only CSS-resolution and gets bilinearly upscaled when blitted
  // onto the 2× main canvas -- the "undetailed echoes on iPad" regression.
  function makeStampCanvas(w, h, dpr) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    var cx = c.getContext('2d');
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function maybeStamp(state, o, dt, moved) {
    state.stampTimer += dt;
    var distSince = Math.hypot(o.x - o.lastStampX, o.y - o.lastStampY);
    var dueByDist = distSince >= STAMP_DIST;
    var dueByTime = moved > 0.02 && state.stampTimer >= STAMP_TIME;
    if (dueByDist || dueByTime) {
      stampObject(state, o);
      o.lastStampX = o.x;
      o.lastStampY = o.y;
      state.stampTimer = 0;
    }
  }

  // ---- variant registration --------------------------------------------------
  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['echo'] = {
    name: 'Echo',
    tagline: 'A morphing shape leaves opaque stamped after-images wherever it travels.',

    // ---- kid-facing smart controls (contract consumed by the gallery shell) --
    controls: {
      moods: MOODS,
      character: { label: 'Shapes', options: CHARACTERS }
    },

    // kind: 'mood' | 'character' | 'size' | 'sizeRandom'. id: matching option
    // id, or (for size/sizeRandom) a raw number/boolean -- see module header.
    // Existing stamps are archive -- never touched. Safe under rapid tapping:
    // both branches just overwrite a pending/current field with the latest
    // requested id, no queues, no stacking timers.
    applyControl: function (state, kind, id) {
      if (!state) return;
      if (kind === 'size') { state.sizeMul = Math.max(0.6, Math.min(1.6, Number(id) || 1)); return; }
      if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
      if (kind === 'morph') {
        state.morphEnabled = (id === 'morphs');
        // Freezing mid-transition would trap a half-blended silhouette; snap
        // to the pure form so "One shape" always means a clean shape.
        if (!state.morphEnabled && state.live) state.live.morphT = 0;
        return;
      }
      if (!state.live) return;
      var o = state.live;
      if (kind === 'mood') {
        // Immediate: the color walk keeps its position, but every stamp from
        // here on (and the live object's own fill) samples the new palette.
        o.moodId = findMood(id).id;
      } else if (kind === 'character') {
        var setId = shapeSetOrDefault(id);
        if (setId === o.shapeSetId) {
          // Re-selecting the already-active set: clear any stale pending
          // switch so a rapid A->B->A tap sequence settles back to "no-op".
          o.pendingShapeSetId = null;
        } else if (!state.morphEnabled) {
          // Morph frozen: no cycle boundary will ever arrive, so apply the
          // new family now, snapped to a clean form (no mid-morph pop
          // possible when there is no morph in flight).
          o.shapeSetId = setId;
          o.pendingShapeSetId = null;
          o.morphT = 0;
        } else {
          // Defer to the next form-cycle boundary (see updateLiveObject) so
          // the live object finishes its current morph before the new set's
          // geometry appears -- no mid-transition pop.
          o.pendingShapeSetId = setId;
        }
      }
    },

    init: function (w, h, theme) {
      // theme carries dpr (see app.js ensureRegState); fall back to live DPR
      // then 1 so the mode still works if invoked without a config.
      var dpr = (theme && theme.dpr) || (typeof window !== 'undefined' && Math.min(window.devicePixelRatio || 1, 2)) || 1;
      var stampCanvas = makeStampCanvas(w, h, dpr);
      var stampCtx = stampCanvas.getContext('2d'); // same instance, transform persists

      var st = {
        w: w, h: h,
        dpr: dpr,
        theme: theme,
        stampCanvas: stampCanvas,
        stampCtx: stampCtx,
        stampTimer: 0,
        dragging: false,
        sizeMul: 1, sizeRandom: false,
        morphEnabled: false,        // Morph control (2026-08-04): opt-in, default One shape
        live: makeObject(w * 0.4 + Math.random() * w * 0.2, h * 0.4 + Math.random() * h * 0.2)
      };
      st.live.morphT = 0; // morph is opt-in: start frozen on a clean, un-blended form
      return st;
    },

    pointer: function (state, x, y, kind) {
      if (kind === 'down') {
        state.dragging = true;
        state.live.x = x;
        state.live.y = y;
        state.live.targetX = x;
        state.live.targetY = y;
        state.live.lastStampX = x;
        state.live.lastStampY = y;
        state.stampTimer = 0;
        state.tapDown = true;
        state.tapMoved = false;
      } else if (kind === 'move') {
        if (state.dragging) {
          state.live.targetX = x;
          state.live.targetY = y;
          state.tapMoved = true;
        }
      } else if (kind === 'up') {
        // tap (down+up without meaningful drag): stamp a single copy where tapped
        if (state.dragging && !state.tapMoved) {
          stampObject(state, state.live);
        }
        state.dragging = false;
        state.tapDown = false;
      }
    },

    tick: function (state, ctx, dt, w, h) {
      // resize stamp canvas (fresh, content not preserved -- acceptable per spec).
      // Re-allocated at device resolution via state.dpr, same as init().
      if (state.w !== w || state.h !== h) {
        state.w = w; state.h = h;
        var nc = makeStampCanvas(w, h, state.dpr);
        state.stampCanvas = nc;
        state.stampCtx = nc.getContext('2d');
      }

      var o = state.live;
      var moved = updateLiveObject(o, dt, state.dragging, state.morphEnabled);

      if (state.dragging) {
        maybeStamp(state, o, dt, moved);
      }

      // clear main canvas fully (real clear -- no veil, no fade)
      ctx.clearRect(0, 0, w, h);
      // paint the persistent stamp archive as-is (opaque source-over = natural overwrite)
      ctx.drawImage(state.stampCanvas, 0, 0, w, h);

      // draw the live object on top with a soft subtle glow ring so it reads
      // as "alive" vs the static archive underneath.
      drawLiveObject(ctx, o, state);
    },

    idle: function (state, w, h, dt) {
      // idle motion + morphing is handled inside tick() via updateLiveObject()
      // (tick always runs regardless of touch state); intentionally a no-op here
      // to avoid double-updating the live object.
    }
  };

  function drawLiveObject(ctx, o, state) {
    // Audio-reactive visual energy (Task A9): LIVE object glow ring ONLY --
    // the stamp archive (stampObject/state.stampCtx) is never touched by
    // this or any other Task A9 change, so silence (E=0) is exactly neutral
    // and stamps stay sacred regardless of E.
    var E = (window.CALM_VIS && window.CALM_VIS.energy) || 0;
    // size control (kid slider): the live object always uses the plain
    // continuous multiplier (never per-frame randomized, even when surprise
    // sizes is on) so it never jitters/jumps while being watched or dragged
    // -- only newly-baked stamps get their own independent random factor.
    var pts = buildRing(o, (state && state.sizeMul) || 1);
    var rgb = currentFillRgb(o);

    // soft glow ring, slow pulse (<=0.15Hz), never flashes
    var glow = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(o.age * Math.PI * 2 * GLOW_HZ));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    // Audio-reactive nudge (Task A9): +25% max, clamped to a 0.27 ceiling
    // (base max 0.6*0.35=0.21 * 1.25 = 0.2625, so 0.27 leaves a small margin).
    ctx.strokeStyle = rgbStr(rgb, Math.min(0.27, glow * 0.35 * (1 + 0.25 * E)));
    ctx.stroke();
    ctx.restore();

    // solid live fill (fully opaque, same rules as a stamp) + crisp outline
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = rgbStr(rgb, 1);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = rgbStr(shadeRgb(rgb, 1.25), 0.9);
    ctx.stroke();
    ctx.restore();
  }

})();
