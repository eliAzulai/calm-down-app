// Bloom variant — Phyllotaxis golden-angle spiral gardens, self-propagating.
// Palette "Dusk Garden": rose, peach-gold, soft lavender, warm cream, muted plum.
var BLOOM_PALETTE = ['#e8a3a3', '#eec9a0', '#c3b4e0', '#faf3e3', '#9c7c9e'];
// Vanilla ES5-friendly JS. No libraries. Single file. var + function declarations.
(function () {

  // ---- kid-facing smart controls: moods (palette) ----
  // moods[0] MUST stay the original "Dusk Garden" hexes above (same array,
  // just also registered here so a bloom can be stamped with whichever mood
  // was live at ITS creation time). Each mood is a 5-stop ramp, moderate
  // saturation, tuned to read as beautiful against the #0d1b2a canvas bg.
  var MOODS = [
    { id: 'dusk', name: 'Dusk Garden', colors: BLOOM_PALETTE },
    // Moonlight: cool whites/silvers/blue-greys — a garden seen by moonlight.
    { id: 'moonlight', name: 'Moonlight', colors: ['#aeb9c9', '#d7dee8', '#8f9bb0', '#f4f6fa', '#5f6b82'] },
    // Tropical: warm coral against teal — lush, saturated but not neon.
    { id: 'tropical', name: 'Tropical', colors: ['#ff8a73', '#3fb8a8', '#ffc17a', '#1e7d78', '#f4e0a3'] },
    // Autumn Ember: amber, rust, dying-leaf gold, deep ember red.
    { id: 'autumn', name: 'Autumn Ember', colors: ['#d98a4a', '#8f3d2e', '#e8b45f', '#b0512f', '#5c2c22'] }
  ];
  function findMood(id) {
    for (var i = 0; i < MOODS.length; i++) if (MOODS[i].id === id) return MOODS[i];
    return MOODS[0];
  }

  // ---- kid-facing smart controls: character (flower family) ----
  // 'mix' keeps the existing rotation behavior (default). Any other id forces
  // every NEW bloom (root-spawned, idle-spawned, or propagated child) to grow
  // as that one family — existing blooms are never touched, they finish their
  // life in whatever family they were born into (see nextFamily()).
  var CHARACTERS = [
    { id: 'mix', name: 'Garden Mix' },
    { id: 'spiral', name: 'Spiral', family: 'phyllotaxis' },
    { id: 'dahlia', name: 'Dahlia', family: 'dahlia' },
    { id: 'rose', name: 'Rose', family: 'rose' }
  ];
  function findCharacter(id) {
    for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].id === id) return CHARACTERS[i];
    return CHARACTERS[0]; // mix default
  }

  var GOLDEN_ANGLE = 2.399963229728653; // 137.508 degrees in radians
  var MAX_SEEDS = 160;
  var SEEDS_PER_SEC = 7;
  var HOLD_SEED_MULT = 3;      // press-and-hold seed rate multiplier
  var HOLD_SCALE_MAX = 1.14;   // slight scale swell while held
  var MAX_BLOOMS = 4;
  var SPACING_C = 7.4; // radius = c * sqrt(n)
  var DETACH_DRIFT_MIN = 2.0, DETACH_DRIFT_MAX = 4.0; // seconds

  // ---- ordered form families (the pass-3 directive: make ORDER the star) ----
  // Every new bloom is assigned one of three families, ROTATED (not randomly
  // chosen) across successive blooms so variety is guaranteed within any run
  // of 3 consecutive spawns. A module-level counter tracks how many blooms
  // have ever been created (across the whole session, not per-garden), so
  // rotation continues correctly through dissolves/propagation.
  var FORM_FAMILIES = ['phyllotaxis', 'dahlia', 'rose'];
  var familyRotationCounter = 0;
  // Character control ('mix' vs a forced single family) lives on state
  // (state.characterId, set by applyControl/init). When forced, every NEW
  // bloom gets that family — existing blooms are untouched (see contract).
  // The rotation counter still advances even while forced, so switching back
  // to 'mix' resumes the rotation sequence rather than restarting it.
  function nextFamily(state) {
    var f = FORM_FAMILIES[familyRotationCounter % FORM_FAMILIES.length];
    familyRotationCounter++;
    if (state && state.characterId && state.characterId !== 'mix') {
      var forced = findCharacter(state.characterId);
      if (forced && forced.family) return forced.family;
    }
    return f;
  }

  // Fibonacci-ish ring seed counts for the 'dahlia' family: ring N holds
  // this many seeds, each ring filling completely (in strict angular order)
  // before the next ring begins.
  var DAHLIA_RING_COUNTS = [8, 13, 21, 21, 21, 21, 21, 21];
  // Rose-curve whorls: 5 then 8 then 13 petals, each whorl a bit larger and
  // rotated half a petal-width from the previous one.
  var ROSE_WHORL_COUNTS = [5, 8, 13, 13, 13, 13];

  // ---- color helpers ----
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ];
  }

  // Pre-convert each mood's curated palette to rgb once, lazily, cached by
  // mood id (moods are static data so the cache never needs invalidation).
  // Each bloom stamps its OWN moodId at creation time (see makeBloom) and
  // uses only that mood for its whole life, exactly like the frozen family/
  // seedTarget pattern — a mood switch mid-garden never repaints blooms
  // already growing, only new ones (contract: "two-palette garden during
  // transition is beautiful, not a bug").
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

  // Smooth interpolation across a given mood's palette given t in [0,1].
  function paletteColorAt(t, moodId) {
    var pal = paletteRgbFor(moodId || MOODS[0].id);
    var n = pal.length;
    var scaled = clamp(t, 0, 1) * (n - 1);
    var i0 = Math.floor(scaled);
    var i1 = Math.min(n - 1, i0 + 1);
    var f = scaled - i0;
    var a = pal[i0], b = pal[i1];
    return [
      Math.round(lerp(a[0], b[0], f)),
      Math.round(lerp(a[1], b[1], f)),
      Math.round(lerp(a[2], b[2], f))
    ];
  }

  function applyLuminanceWobble(rgb, wobble) {
    // wobble in [-1,1]; nudge toward white/black by up to ~10%
    var amt = wobble * 0.10;
    var out = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      var c = rgb[i];
      c = amt >= 0 ? lerp(c, 255, amt) : lerp(c, 0, -amt);
      out[i] = Math.round(clamp(c, 0, 255));
    }
    return out;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function smooth01(t) { return t * t * (3 - 2 * t); }

  // Organic "wave" fade-out easing: base linear-ish decay modulated by a gentle
  // sine ripple so dissolution doesn't read as linear evaporation.
  function organicFadeOut(t) {
    // t: 0 = fully visible, 1 = fully gone
    var base = 1 - easeInOutSine(t);
    var ripple = 1 + 0.14 * Math.sin(t * Math.PI * 2.4) * (1 - t);
    var v = base * ripple;
    return clamp(v, 0, 1);
  }

  function makeBloom(cx, cy, dirSign, seedNow, seedTarget, family, chainAngle, moodId) {
    return {
      cx: cx, cy: cy,
      tx: cx, ty: cy,
      seeds: [],                 // {n, r, ang, col:[r,g,b], sz, wobble}
      seedCount: seedNow || 0,
      // Frozen at creation time: this bloom's own seed-count denominator for
      // sizing/color progress (tProg in regenSeedAt). Kept constant for the
      // bloom's whole life so seed sizes form a smooth monotone progression
      // no matter how many other blooms come and go afterward — only the
      // live, moving `capForThis` (MAX_SEEDS / concurrent-bloom-count) may
      // still gate *how many* seeds this bloom is allowed to grow to.
      seedTarget: Math.max(1, seedTarget || MAX_SEEDS),
      // Ordered form family this bloom grows as — assigned via rotation at
      // creation time (see nextFamily()), never changed afterward, so a
      // single bloom's whole growth path stays geometrically consistent.
      family: family || 'phyllotaxis',
      // Palette this bloom samples from — frozen at creation time (see
      // MOODS/paletteRgbFor above), same "stamp once, never revisit" pattern
      // as family/seedTarget, so a mood switch mid-garden never repaints an
      // in-progress bloom, only new ones.
      moodId: moodId || MOODS[0].id,
      dissolving: false,
      dissolveT: 0,              // 0..1 organic fade progress for the whole bloom
      rot: Math.random() * Math.PI * 2,
      rotSpeed: dirSign * (0.01 + Math.random() * 0.01),
      // Garden meta-order lineage angle: a STABLE (non-drifting) accumulated
      // bearing, independent of this bloom's own randomized/rotating `rot`.
      // Root blooms (tap-spawned / idle-spawned, no parent) start their own
      // lineage at a random angle; propagated children inherit
      // parent.chainAngle + one golden-angle step, computed ONCE at creation
      // time and then frozen — never re-derived from a live-rotating value.
      // This is what findGardenSpot() uses for bearing, so the parent-to-
      // child bearing sequence increments by ~137.5deg generation over
      // generation regardless of how fast/far bloom.rot has drifted by the
      // time propagation actually fires.
      chainAngle: (chainAngle === undefined || chainAngle === null) ? Math.random() * Math.PI * 2 : chainAngle,
      breathePhase: Math.random() * Math.PI * 2,
      breatheFreq: 0.07 + Math.random() * 0.02,
      born: seedNow > 0,
      following: false,
      faint: false,
      age: 0,
      holdT: 0,                  // seconds pointer has been held on this bloom
      holdScale: 1,
      matured: false,            // reached full seed count / propagation age
      propagated: false,         // already spawned a child
      detach: null               // active detaching petal, if any
    };
  }

  // ---- per-family ordered geometry ----
  // Each returns {r, ang} for the seed about to be placed at growth-index n,
  // and (for ring/whorl families) mutates the bloom's ring/whorl bookkeeping
  // so growth is strictly sequential along the pattern path — never random
  // pop-in. tProg (0..1 overall growth progress, used for sizing/color) is
  // computed the same way for every family from n / bloom.seedTarget.

  function phyllotaxisGeom(bloom, n) {
    return { r: SPACING_C * Math.sqrt(n), ang: n * GOLDEN_ANGLE };
  }

  // Dahlia: concentric rings, each ring filling completely (in strict
  // angular order around the ring) before the next ring begins. Ring seed
  // counts follow DAHLIA_RING_COUNTS (Fibonacci-ish growth: 8, 13, 21...).
  // A slight per-ring rotation offset makes petals interleave like a real
  // dahlia instead of stacking in radial spokes.
  //
  // Pure function of n: ring membership is derived from cumulative sums of
  // DAHLIA_RING_COUNTS rather than mutable per-bloom bookkeeping, so calling
  // this to *preview* the next seed (path-hint) never needs an undo step and
  // can never drift the bloom's real growth state.
  var DAHLIA_RING_STEP = 6.4; // radial spacing between successive rings
  var DAHLIA_RING_ROT = 0.41; // radians offset applied per ring (~23.5deg)
  function ringIndexForN(n) {
    var idx = 0, acc = 0;
    while (true) {
      var count = DAHLIA_RING_COUNTS[Math.min(idx, DAHLIA_RING_COUNTS.length - 1)];
      if (n < acc + count) return { ringIdx: idx, idxInRing: n - acc, count: count };
      acc += count;
      idx++;
    }
  }
  function dahliaGeom(bloom, n) {
    var info = ringIndexForN(n);
    var r = 6 + DAHLIA_RING_STEP * (info.ringIdx + 1);
    var ang = (info.idxInRing / info.count) * Math.PI * 2 + info.ringIdx * DAHLIA_RING_ROT;
    return { r: r, ang: ang, ringIdx: info.ringIdx, ringCount: info.count, idxInRing: info.idxInRing };
  }

  // Rose: petals arranged on a rose curve r = R*cos(k*theta), arriving whorl
  // by whorl (5, then 8, then 13...) — each whorl a bit larger radius and
  // rotated half a petal-width from the previous whorl so whorls interleave.
  // Same pure-function-of-n approach as dahlia, for the same reason.
  var ROSE_R_STEP = 8.2;
  function whorlIndexForN(n) {
    var idx = 0, acc = 0;
    while (true) {
      var count = ROSE_WHORL_COUNTS[Math.min(idx, ROSE_WHORL_COUNTS.length - 1)];
      if (n < acc + count) return { whorlIdx: idx, idxInWhorl: n - acc, count: count };
      acc += count;
      idx++;
    }
  }
  function roseGeom(bloom, n) {
    var info = whorlIndexForN(n);
    var count = info.count;
    var idxInWhorl = info.idxInWhorl;
    var halfStep = Math.PI / count; // half a petal-width, in radians
    var ang = (idxInWhorl / count) * Math.PI * 2 + info.whorlIdx * halfStep;
    var R = 10 + ROSE_R_STEP * (info.whorlIdx + 1);
    // k chosen so cos(k*ang) traces a gentle petal-lobed radius modulation
    // rather than a plain circle, while staying strictly whorl-ordered.
    var k = 3;
    var r = R * (0.72 + 0.28 * Math.abs(Math.cos(k * ang)));
    return { r: r, ang: ang, whorlIdx: info.whorlIdx, whorlCount: count, idxInWhorl: idxInWhorl };
  }

  function familyGeom(bloom, n) {
    if (bloom.family === 'dahlia') return dahliaGeom(bloom, n);
    if (bloom.family === 'rose') return roseGeom(bloom, n);
    return phyllotaxisGeom(bloom, n);
  }

  // size control (kid slider): continuous multiplier for a seed's petal
  // len/wid at the moment it's generated, plus optional per-seed randomized
  // jitter ("surprise sizes"). Unlike moodId/family (frozen once per BLOOM
  // at creation), size is re-sampled per SEED so surprise reads as per-petal
  // variety within a single spiral, not a single frozen roll for the whole
  // bloom. Jitter band kept tighter than other modes' 0.7-1.3 (0.85-1.15)
  // so a surprise-sizes garden still reads as an ordered phyllotaxis/dahlia/
  // rose pattern rather than noisy scatter -- the ordered growth IS the
  // point of this variant, per the pass-3 "make ORDER the star" directive.
  function sizeFactor(state) {
    var m = (state && state.sizeMul) || 1;
    return (state && state.sizeRandom) ? m * (0.85 + Math.random() * 0.3) : m;
  }

  // Seed geometry: petal (teardrop) shaped, oriented along the spiral tangent,
  // starting tiny near the center and growing gently outward — never a plain
  // dot, never blobby. Petal length scales with radius so the bud starts
  // delicate and only elongates as the spiral unfurls.
  // `state` (optional) supplies the live size-control multiplier; omitted
  // (or sizeRandom off) it degrades to the plain continuous factor, keeping
  // this otherwise a pure function of (bloom, n) for the path-hint preview.
  function regenSeedAt(bloom, n, state) {
    var geo = familyGeom(bloom, n);
    var ang = geo.ang;
    var r = geo.r;
    // Use this bloom's own frozen seedTarget (captured at bloom-creation
    // time), never the live/moving concurrent-bloom cap — otherwise a
    // sibling bloom spawning or dissolving mid-growth would retroactively
    // change this bloom's sizing curve and produce a size discontinuity
    // between consecutive seeds in the same spiral.
    var tProg = clamp(n / bloom.seedTarget, 0, 1);
    var ct = smooth01(tProg);
    var wobble = Math.sin(n * 12.9898) * 0.5;
    var col = applyLuminanceWobble(paletteColorAt(ct, bloom.moodId), wobble);
    // petal length grows from tiny (bud) to modest (open bloom); width stays
    // slender relative to length (length:width ratio ~3.4-4.6:1 throughout) so
    // it always reads as an elongated petal, never a round blob/dot.
    var sf = sizeFactor(state); // size control (kid slider)
    var lenBase = lerp(2.6, 9.5, ct) * sf;
    var widBase = lerp(0.6, 2.1, ct) * sf;
    return {
      n: n, r: r, ang: ang, col: col, len: lenBase, wid: widBase, wobble: wobble,
      ringIdx: geo.ringIdx, whorlIdx: geo.whorlIdx
    };
  }

  // Pre-render a soft radial glow sprite once (warm neutral, not pure white,
  // so it tints petals toward "soft light" rather than "flash of white").
  // Tinted further via low globalAlpha + 'lighter' compositing at draw time;
  // falls off smoothly unlike a flat-alpha circle. Built once, reused.
  function buildSprite() {
    var size = 32;
    var off = document.createElement('canvas');
    off.width = size; off.height = size;
    var octx = off.getContext('2d');
    var cx = size / 2, cy = size / 2;
    var grad = octx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    grad.addColorStop(0, 'rgba(250,240,230,0.55)');
    grad.addColorStop(0.5, 'rgba(250,240,230,0.16)');
    grad.addColorStop(1, 'rgba(250,240,230,0)');
    octx.fillStyle = grad;
    octx.fillRect(0, 0, size, size);
    return { canvas: off, size: size };
  }

  var GLOW_SPRITE = null;
  function getGlowSprite() {
    if (!GLOW_SPRITE) GLOW_SPRITE = buildSprite();
    return GLOW_SPRITE;
  }

  function VState(w, h, theme) {
    this.w = w; this.h = h;
    this.theme = theme;
    this.blooms = [];
    this.activeBloom = null;
    this.idleTimer = 0;
    this.idleBloomSpawned = false;
    this.dpr = 1;
    this.glow = getGlowSprite();
    // ---- smart controls state ----
    // Default = moods[0] + 'mix', per contract. New blooms are stamped with
    // these at creation (see pointer()/tick() call sites above); existing
    // blooms keep whatever they were stamped with — see makeBloom's frozen
    // moodId/family fields.
    this.moodId = MOODS[0].id;
    this.characterId = 'mix';
    this.sizeMul = 1;
    this.sizeRandom = false;
  }

  function init(w, h, theme) {
    return new VState(w, h, theme);
  }

  // Compute the frozen seedTarget a newly-created bloom should capture,
  // matching the live cap formula used in updateBloomGrowth
  // (MAX_SEEDS / concurrent-bloom-count) evaluated as of the moment the new
  // bloom joins the garden (i.e. including itself in the count) — so the
  // bloom's very first frame of growth already agrees with what
  // updateBloomGrowth's own liveCount-based cap will be.
  function computeSeedTarget(state) {
    var liveCountAfterJoin = state.blooms.length + 1;
    return Math.max(40, Math.round(MAX_SEEDS / liveCountAfterJoin));
  }

  function findOldestBloom(state) {
    var oldest = null;
    for (var i = 0; i < state.blooms.length; i++) {
      var b = state.blooms[i];
      if (b.dissolving) continue;
      if (!oldest || b.age > oldest.age) oldest = b;
    }
    return oldest;
  }

  function startDissolve(bloom) {
    bloom.dissolving = true;
    bloom.dissolveT = 0;
  }

  // Find a reasonably open spot on canvas: sample a handful of candidates,
  // pick the one farthest from all existing bloom centers.
  function findOpenArea(state, w, h) {
    var best = null, bestDist = -1;
    for (var i = 0; i < 10; i++) {
      var cx = w * (0.16 + Math.random() * 0.68);
      var cy = h * (0.14 + Math.random() * 0.68);
      var minD = Infinity;
      for (var j = 0; j < state.blooms.length; j++) {
        var b = state.blooms[j];
        var dx = cx - b.cx, dy = cy - b.cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < minD) minD = d;
      }
      if (state.blooms.length === 0) minD = 999999;
      if (minD > bestDist) { bestDist = minD; best = { x: cx, y: cy }; }
    }
    return best || { x: w * 0.5, y: h * 0.5 };
  }

  // Garden meta-order: a propagation child plants at a golden-angle bearing
  // from its parent (child index k -> bearing k*137.5deg), at an ordered
  // radial distance of ~parent radius x1.6 — so an untouched garden
  // self-arranges into a grand spiral OF blooms, the same golden-angle logic
  // that governs seeds-within-a-bloom now governing blooms-within-a-garden.
  // Clamped to stay on canvas with a margin; falls back to findOpenArea when
  // the golden-angle spot would land off-canvas or too close to a sibling.
  //
  // REPAIR: bearing MUST be derived from a value that is stable across
  // generations, not from parent.rot (each bloom's own randomized, freely-
  // drifting spin — see makeBloom/updateBloomMotion). Using parent.rot here
  // was confirmed live to swamp the golden-angle term with noise, since
  // parent.rot is an effectively-independent random value by the time a
  // bloom matures and propagates. Fix: use parent.chainAngle, a per-lineage
  // accumulated bearing that is frozen at each bloom's creation time (see
  // makeBloom) and only ever advances by exactly one GOLDEN_ANGLE step per
  // generation — so successive parent-to-child bearings reliably increment
  // by ~137.5deg regardless of how bloom.rot has spun by propagation time.
  var GOLDEN_ANGLE_DEG_STEP = GOLDEN_ANGLE; // reuse the same constant (radians)
  function parentOuterRadius(bloom) {
    var maxR = 0;
    for (var i = 0; i < bloom.seeds.length; i++) {
      if (bloom.seeds[i].r > maxR) maxR = bloom.seeds[i].r;
    }
    return maxR > 0 ? maxR : 24; // sane default if parent had no seeds left
  }
  function findGardenSpot(state, parent, w, h) {
    var childChainAngle = parent.chainAngle + GOLDEN_ANGLE_DEG_STEP;
    var bearing = childChainAngle;
    var dist = parentOuterRadius(parent) * 1.6;
    var margin = 40;
    var cx = clamp(parent.cx + dist * Math.cos(bearing), margin, w - margin);
    var cy = clamp(parent.cy + dist * Math.sin(bearing), margin, h - margin);
    // graceful fallback: if the clamp moved us far from the intended spot
    // (off-canvas) or we'd land right on top of a sibling, defer to the
    // open-area finder instead of forcing an awkward, clipped placement.
    // Note: the fallback still carries the correct chainAngle forward (the
    // lineage's ordered bearing sequence is a bookkeeping concept, separate
    // from where the graceful-fallback happened to place this one instance)
    // so a single crowded/off-canvas placement doesn't break the sequence
    // for the *next* generation.
    var movedByClamp = Math.abs(cx - (parent.cx + dist * Math.cos(bearing))) > 1 ||
                        Math.abs(cy - (parent.cy + dist * Math.sin(bearing))) > 1;
    var tooClose = false;
    for (var j = 0; j < state.blooms.length; j++) {
      var b = state.blooms[j];
      if (b === parent) continue;
      var dx = cx - b.cx, dy = cy - b.cy;
      if (Math.sqrt(dx * dx + dy * dy) < 70) { tooClose = true; break; }
    }
    if (movedByClamp || tooClose) {
      var fallback = findOpenArea(state, w, h);
      fallback.chainAngle = childChainAngle;
      return fallback;
    }
    return { x: cx, y: cy, chainAngle: childChainAngle };
  }

  function pointer(state, x, y, kind) {
    if (kind === 'down') {
      state.idleTimer = 0;

      // If tapping near an existing (non-dissolving) bloom, grab it for hold
      // interaction instead of always spawning a new one.
      var grabbed = null, grabR = 90 * 90;
      for (var i = 0; i < state.blooms.length; i++) {
        var b = state.blooms[i];
        if (b.dissolving) continue;
        var dx = x - b.cx, dy = y - b.cy;
        if (dx * dx + dy * dy < grabR) { grabbed = b; break; }
      }

      if (grabbed) {
        state.activeBloom = grabbed;
        grabbed.following = true;
        grabbed.faint = false;
        grabbed.holdT = 0;
        return;
      }

      var dirSign = (state.blooms.length % 2 === 0) ? 1 : -1;
      var nb = makeBloom(x, y, dirSign, 0, computeSeedTarget(state), nextFamily(state), null, state.moodId);
      nb.age = 0;
      nb.faint = false;

      if (state.blooms.length >= MAX_BLOOMS) {
        var oldest = findOldestBloom(state);
        if (oldest) startDissolve(oldest);
      }

      state.blooms.push(nb);
      state.activeBloom = nb;
      nb.following = true;
      nb.holdT = 0;
    } else if (kind === 'move') {
      if (state.activeBloom && !state.activeBloom.dissolving) {
        state.activeBloom.tx = x;
        state.activeBloom.ty = y;
      }
    } else if (kind === 'up') {
      if (state.activeBloom) {
        state.activeBloom.following = false;
        state.activeBloom.holdT = 0;
      }
      state.activeBloom = null;
    }
  }

  function updateBloomGrowth(state, bloom, dt) {
    if (bloom.dissolving) {
      // organic wave dissolve: advance a 0..1 progress over a duration fixed
      // at dissolve-start (based on the seed count at that moment, so it
      // doesn't drift as seeds shrink), then translate progress into
      // seeds-remaining via the same organic easing so the tail ripples
      // rather than evaporating linearly.
      if (bloom._dissolveStartCount === undefined) {
        bloom._dissolveStartCount = bloom.seeds.length;
        // pass4 trace-fade policy: was 1.8 + min(1.4, ...) -> max 3.2s, which
        // let a heavily-seeded bloom's individual seeds each still be fading
        // out past the 3s ceiling on "once it starts" fades. The whole-bloom
        // deterioration behavior itself stays slow/beloved (per the client's
        // pass-3 note) — only the ceiling is tightened so no single seed's
        // fade window exceeds 3s. Max now 1.8 + 1.2 = 3.0s.
        bloom._dissolveDur = 1.8 + Math.min(1.2, bloom.seeds.length / MAX_SEEDS * 1.2);
      }
      bloom.dissolveT += dt / bloom._dissolveDur;
      if (bloom.dissolveT > 1) bloom.dissolveT = 1;
      var remainFrac = 1 - organicFadeOut(bloom.dissolveT);
      var keep = Math.max(0, Math.round(remainFrac * bloom._dissolveStartCount));
      if (keep < bloom.seeds.length) bloom.seeds.length = keep;
      // REPAIR: a propagated parent starts its reverse dissolve immediately
      // (see the propagation trigger in tick()), but its detached seed can
      // still be mid-flight toward the new child's planting spot — dissolve
      // duration (1.8-3.2s) and detach drift duration (2.0-4.0s) overlap, so
      // without this guard the parent was frequently spliced out of
      // state.blooms (see tick()'s `removed` handling) BEFORE updateDetach()
      // ever got to fire the landing branch that actually creates the child.
      // That silently dropped most propagations, which also made the
      // garden-meta-order bearing fix impossible to observe/verify (nothing
      // to measure bearings between). Keep the bloom alive — fully invisible,
      // seeds already at 0 — for as long as its detach is still traveling.
      if (bloom.detach) return false;
      return bloom.dissolveT >= 1 && bloom.seeds.length === 0;
    }

    var rate = SEEDS_PER_SEC;
    var isHeld = (state.activeBloom === bloom && bloom.following);
    if (isHeld) {
      bloom.holdT += dt;
      rate *= HOLD_SEED_MULT;
      bloom.holdScale = lerp(bloom.holdScale, HOLD_SCALE_MAX, 1 - Math.exp(-3 * dt));
    } else {
      bloom.holdScale = lerp(bloom.holdScale, 1, 1 - Math.exp(-2.5 * dt));
    }

    // Cap this bloom's max seed count by how many blooms are concurrently
    // alive right now, so a burst of rapid taps while the garden is already
    // full doesn't keep piling on unbounded seeds. This cap is intentionally
    // a live, moving value (it can shrink or grow as siblings spawn/dissolve)
    // and only ever gates how many seeds this bloom may still create — it is
    // NOT used for seed sizing (see bloom.seedTarget, frozen at creation) and
    // total garden "ink" is NOT held constant by this: gardens with more
    // concurrent blooms show more on-screen coverage overall, just with each
    // individual bloom capped smaller.
    var liveCount = Math.max(1, state.blooms.length);
    var capForThis = Math.max(40, Math.round(MAX_SEEDS / liveCount));

    if (bloom.seedCount < capForThis) {
      bloom.seedCount += dt * rate;
      var target = Math.min(capForThis, Math.floor(bloom.seedCount));
      while (bloom.seeds.length < target) {
        var n = bloom.seeds.length;
        bloom.seeds.push(regenSeedAt(bloom, n, state)); // size control (kid slider)
      }
    }

    // Maturity: this bloom's (possibly capped) ceiling reached — age-gated
    // too, so quick taps don't immediately propagate — hand off to the
    // propagation system in tick().
    if (!bloom.matured && bloom.seedCount >= capForThis && bloom.age > 3) {
      bloom.matured = true;
    }
    return false;
  }

  function updateBloomMotion(state, bloom, dt) {
    var followStrength = bloom.following ? 4.5 : 1.8;
    var kx = 1 - Math.exp(-followStrength * dt);
    bloom.cx = lerp(bloom.cx, bloom.tx, kx);
    bloom.cy = lerp(bloom.cy, bloom.ty, kx);
    bloom.rot += bloom.rotSpeed * dt;
  }

  // Advance an in-flight detaching petal; when it lands, plant a new bloom
  // there (subject to MAX_BLOOMS, dissolving the oldest if needed).
  var DETACH_TRAIL_MAX = 3; // "a whisper of a trail" — cut way down from before
  function updateDetach(state, bloom, dt, w, h) {
    var d = bloom.detach;
    if (!d) return;
    d.t += dt;
    var tt = clamp(d.t / d.dur, 0, 1);
    var e = easeInOutSine(tt);
    // gentle arc: lerp position plus a perpendicular bulge that fades at ends
    var lx = lerp(d.sx, d.tx, e);
    var ly = lerp(d.sy, d.ty, e);
    var bulge = Math.sin(tt * Math.PI) * d.arc;
    d.x = lx + d.nx * bulge;
    d.y = ly + d.ny * bulge;
    // gentle glow-in-glow-out so the traveling petal never pops or snaps out
    d.alpha = clamp(0.4 + 0.6 * Math.sin(Math.PI * tt), 0.15, 1);

    // Explicit, hard-capped trail buffer (2-3 points) instead of relying on
    // the background erase to blur out old positions — a slow-moving point
    // otherwise reads as a smeared comet tail. Store sparsely (not every
    // frame) so even the 3 points span a visible stretch of the path.
    d._trailAcc = (d._trailAcc || 0) + dt;
    if (!d.trail) d.trail = [];
    if (d._trailAcc > 0.09) {
      d._trailAcc = 0;
      d.trail.push({ x: d.x, y: d.y });
      if (d.trail.length > DETACH_TRAIL_MAX) d.trail.shift();
    }

    if (tt >= 1) {
      bloom.detach = null;
      // make room for the child if the garden is already at capacity
      if (state.blooms.length >= MAX_BLOOMS) {
        var oldest = findOldestBloom(state);
        if (oldest && oldest !== bloom) startDissolve(oldest);
      }
      var dirSign = (state.blooms.length % 2 === 0) ? 1 : -1;
      // Pass the lineage chainAngle computed back at findGardenSpot() time
      // (carried via the detach record) so the child's OWN chainAngle is
      // parent.chainAngle + one golden-angle step — never re-derived from
      // any bloom's live-rotating `rot` — keeping garden meta-order stable
      // across arbitrarily many generations.
      var child = makeBloom(d.tx, d.ty, dirSign, 0, computeSeedTarget(state), nextFamily(state), d.chainAngle, state.moodId);
      child.faint = false;
      state.blooms.push(child);
    }
  }

  function tick(state, ctx, dt, w, h) {
    state.w = w; state.h = h;

    // REQUIRED FIX: fade toward true transparency via destination-out, never
    // paint an opaque/bg-color veil. The canvas element shows #0d1b2a via CSS
    // behind it, so erasing to transparent leaves no residue.
    //
    // Known Canvas2D quirk: repeated low-alpha destination-out compositing
    // asymptotically approaches but can quantization-floor a few alpha units
    // above true zero (measured: rgba(0,0,0,0.06) stalls forever at alpha=8
    // on an 8-bit backing store, independent of anything this variant draws).
    // Every visible pixel here comes from an explicitly-tracked bloom/detach
    // that is redrawn from scratch every single frame (nothing relies on
    // residual canvas pixels for its own look), so a periodic true clearRect
    // is indistinguishable from the soft fade for anything still alive, and
    // it sweeps away that quantization floor for anything that isn't.
    state._eraseFrame = (state._eraseFrame || 0) + 1;
    if (state._eraseFrame % 90 === 0) {
      ctx.clearRect(0, 0, w, h);
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';

    // update + prune blooms
    for (var i = state.blooms.length - 1; i >= 0; i--) {
      var b = state.blooms[i];
      b.age += dt;
      var removed = updateBloomGrowth(state, b, dt);
      updateBloomMotion(state, b, dt);
      updateDetach(state, b, dt, w, h);

      // trigger propagation: matured, not yet propagated, no detach in flight,
      // and we have room (or can make room) — cap concurrent blooms at 4
      // counting the about-to-be-planted child, so only propagate when the
      // total will not exceed MAX_BLOOMS after the oldest is retired.
      if (b.matured && !b.propagated && !b.detach && !b.dissolving) {
        b.propagated = true;
        var open = findGardenSpot(state, b, w, h);
        var srcSeed = b.seeds[b.seeds.length - 1] || b.seeds[0];
        var sang = srcSeed ? (srcSeed.ang + b.rot) : b.rot;
        var sx = b.cx + (srcSeed ? srcSeed.r * Math.cos(sang) : 0);
        var sy = b.cy + (srcSeed ? srcSeed.r * Math.sin(sang) : 0);
        var ddx = open.x - sx, ddy = open.y - sy;
        var dlen = Math.max(1, Math.sqrt(ddx * ddx + ddy * ddy));
        b.detach = {
          x: sx, y: sy, sx: sx, sy: sy, tx: open.x, ty: open.y,
          nx: -ddy / dlen, ny: ddx / dlen,
          arc: Math.min(24, dlen * 0.08),
          t: 0, dur: DETACH_DRIFT_MIN + Math.random() * (DETACH_DRIFT_MAX - DETACH_DRIFT_MIN),
          alpha: 1,
          col: srcSeed ? srcSeed.col : [230, 200, 200],
          sz: srcSeed ? Math.max(srcSeed.len, srcSeed.wid) : 3,
          // carry the ordered lineage bearing computed by findGardenSpot
          // through to the moment the child bloom is actually created (see
          // updateDetach), so garden meta-order survives the drift flight.
          chainAngle: open.chainAngle
        };
        // remove one seed from the parent so the detach reads as a petal
        // actually leaving (parent will begin its reverse dissolve next).
        if (b.seeds.length > 0) b.seeds.length -= 1;
        // begin parent's graceful reverse dissolve now that it has propagated
        startDissolve(b);
      }

      if (removed) {
        state.blooms.splice(i, 1);
        if (state.activeBloom === b) state.activeBloom = null;
      }
    }

    // idle spontaneous bloom: if empty for >5s, spawn one faint self-growing bloom
    if (state.blooms.length === 0) {
      state.idleTimer += dt;
      if (state.idleTimer > 5 && !state.idleBloomSpawned) {
        var ox = w * (0.32 + Math.random() * 0.36);
        var oy = h * (0.30 + Math.random() * 0.40);
        var fb = makeBloom(ox, oy, (Math.random() < 0.5 ? 1 : -1), 0, computeSeedTarget(state), nextFamily(state), null, state.moodId);
        fb.faint = true;
        state.blooms.push(fb);
        state.idleBloomSpawned = true;
      }
    } else {
      state.idleTimer = 0;
      state.idleBloomSpawned = false;
    }

    // draw
    for (var j = 0; j < state.blooms.length; j++) {
      drawBloom(state, ctx, state.blooms[j]);
      if (state.blooms[j].detach) drawDetach(ctx, state.blooms[j].detach);
    }
  }

  // Draw a single petal: a slender teardrop built from two mirrored arcs,
  // oriented along the spiral tangent direction (ang + PI/2), scaling from
  // tiny at the bud stage to a modest, still-slender petal at full bloom.
  // No shadowBlur; solid fill only, cheap path per seed.
  function drawPetal(ctx, x, y, tangentAng, len, wid, rgbStr, alpha) {
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tangentAng);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgbStr;
    ctx.beginPath();
    // teardrop: tip at +len (outward), rounded base near origin
    ctx.moveTo(len, 0);
    ctx.quadraticCurveTo(len * 0.35, wid, -len * 0.25, 0);
    ctx.quadraticCurveTo(len * 0.35, -wid, len, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- parastichy shimmer (phyllotaxis-only) ----
  // Once a phyllotaxis bloom passes ~60% grown, a gentle luminance wave
  // travels along one Fibonacci spiral family (the 13-arm set: seeds whose
  // index shares arm = n % 13), then alternates to the counter-rotating
  // 21-arm family. This makes the hidden spiral structure of a golden-angle
  // disc visible without ever flashing (>=8s per sweep, <=15% luminance lift,
  // and it's a smooth traveling gaussian bump, not a hard on/off).
  var PARASTICHY_ARMS_A = 13;
  var PARASTICHY_ARMS_B = 21;
  var PARASTICHY_SWEEP_DUR = 9.0;   // seconds per single sweep along one family
  var PARASTICHY_MAX_LIFT = 0.15;   // luminance lift cap (<=15% per directive)
  function parastichyLift(bloom, seed, growthFrac) {
    if (growthFrac < 0.6) return 0;
    var cyclePos = (bloom.age % (PARASTICHY_SWEEP_DUR * 2));
    var onFamilyA = cyclePos < PARASTICHY_SWEEP_DUR;
    var localT = onFamilyA ? (cyclePos / PARASTICHY_SWEEP_DUR) : ((cyclePos - PARASTICHY_SWEEP_DUR) / PARASTICHY_SWEEP_DUR);
    var arms = onFamilyA ? PARASTICHY_ARMS_A : PARASTICHY_ARMS_B;
    var arm = seed.n % arms;
    var armPos = arm / arms; // 0..1 position of this seed's arm around the wave
    // traveling bump: distance (wrapped) between the sweep's current position
    // and this seed's arm position, converted to a smooth gaussian-ish falloff
    var d = Math.abs(localT - armPos);
    d = Math.min(d, 1 - d); // wrap-around
    var bump = Math.exp(-(d * d) / (2 * 0.045 * 0.045));
    // fade the whole effect in/out gently as growth crosses the 60% threshold
    var growthGate = smooth01(clamp((growthFrac - 0.6) / 0.15, 0, 1));
    return PARASTICHY_MAX_LIFT * bump * growthGate;
  }

  function drawBloom(state, ctx, bloom) {
    var breathe = 1 + 0.03 * Math.sin(bloom.age * bloom.breatheFreq * 2 * Math.PI + bloom.breathePhase);
    breathe *= bloom.holdScale;
    var baseAlpha = bloom.faint ? 0.55 : 1.0;

    // whole-bloom organic fade multiplier while dissolving (applies on top of
    // per-seed removal so the very last seeds also visibly soften, not pop).
    var dissolveMul = 1;
    var shrinkMul = 1;
    if (bloom.dissolving) {
      dissolveMul = 1 - organicFadeOut(bloom.dissolveT) * 0.35;
      shrinkMul = 1 - 0.18 * organicFadeOut(bloom.dissolveT);
    }

    var isPhyllo = bloom.family === 'phyllotaxis';
    var growthFrac = clamp(bloom.seedCount / bloom.seedTarget, 0, 1);

    for (var k = 0; k < bloom.seeds.length; k++) {
      var seed = bloom.seeds[k];
      var r = seed.r * breathe * shrinkMul;
      var ang = seed.ang + bloom.rot;
      var x = bloom.cx + r * Math.cos(ang);
      var y = bloom.cy + r * Math.sin(ang);
      var tangent = ang + Math.PI / 2 + (seed.wobble * 0.08);

      var appearAlpha = 1;
      if (k === bloom.seeds.length - 1 && !bloom.dissolving) {
        var frac = bloom.seedCount - Math.floor(bloom.seedCount);
        appearAlpha = 0.3 + 0.7 * easeOutCubic(frac);
      }

      var len = seed.len * breathe * shrinkMul;
      var wid = seed.wid * breathe * shrinkMul;
      var col = seed.col;

      // parastichy shimmer: nudge luminance up for seeds currently "lit" by
      // the traveling spiral wave (phyllotaxis blooms only, hypnotic payoff
      // of the ordered pattern becoming visible).
      if (isPhyllo && !bloom.dissolving) {
        var lift = parastichyLift(bloom, seed, growthFrac);
        if (lift > 0.001) col = applyLuminanceWobble(col, lift / 0.10);
      }
      var rgbStr = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';

      // soft glow first, via the cached radial-gradient sprite (falls off
      // smoothly to transparent, unlike a flat-alpha circle which reads as
      // a hard-edged disc). Sized barely past the petal itself and kept very
      // faint so it softens the edge without washing the bloom out toward
      // white once many petals' glows overlap in a dense, mature spiral.
      var glowSize = len * 0.85;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.045 * baseAlpha * appearAlpha * dissolveMul;
      ctx.drawImage(state.glow.canvas, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
      ctx.globalCompositeOperation = 'source-over';

      // petal body — the actual visible shape, slender teardrop
      drawPetal(ctx, x, y, tangent, len, wid, rgbStr, 0.92 * baseAlpha * appearAlpha * dissolveMul);
    }

    // Path-hint: the NEXT seed position glows softly a beat before its petal
    // arrives, so the ordered growth reads as intentional rather than
    // incidental. Extremely subtle (alpha <= 0.15), uses the same cached
    // glow sprite (no extra path/shadow cost). Skipped while dissolving or
    // once a bloom has reached its cap (no "next" seed coming).
    if (!bloom.dissolving && bloom.seeds.length < bloom.seedTarget) {
      var nextN = bloom.seeds.length;
      // regenSeedAt is a pure function of (bloom, n, state) — safe to call
      // for a preview without mutating any real growth state. DEVIATION:
      // when sizeRandom is on, this preview's own random jitter roll will
      // not exactly match the real seed's roll when it actually arrives
      // (each call re-rolls) — an acceptable, minor mismatch since this is
      // only a soft anticipation glow, not the seed itself.
      var previewSeed = regenSeedAt(bloom, nextN, state);
      var pr = previewSeed.r * breathe * shrinkMul;
      var pang = previewSeed.ang + bloom.rot;
      var px = bloom.cx + pr * Math.cos(pang);
      var py = bloom.cy + pr * Math.sin(pang);
      // anticipation pulse: gentle breathing glow, capped low, timed to the
      // same cadence as seed arrival so it reads as "about to happen" rather
      // than a static marker.
      var hintFrac = bloom.seedCount - Math.floor(bloom.seedCount);
      var hintAlpha = 0.15 * baseAlpha * (0.4 + 0.6 * Math.sin(hintFrac * Math.PI));
      var hintSize = Math.max(previewSeed.len, previewSeed.wid) * 2.2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(hintAlpha, 0, 0.15);
      ctx.drawImage(state.glow.canvas, px - hintSize / 2, py - hintSize / 2, hintSize, hintSize);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawDetach(ctx, d) {
    var col = d.col;
    var rgbStr = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';

    // Whisper-thin trail: at most DETACH_TRAIL_MAX stored points, each
    // progressively fainter and smaller toward the past, drawn before the
    // head so the head sits on top. Deliberately sparse (not a smear).
    if (d.trail && d.trail.length > 1) {
      for (var i = 0; i < d.trail.length - 1; i++) {
        var p = d.trail[i];
        var ageFrac = (i + 1) / d.trail.length; // 0 = oldest .. <1 = second-newest
        ctx.globalAlpha = clamp(d.alpha, 0, 1) * 0.22 * ageFrac;
        ctx.fillStyle = rgbStr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.6, d.sz * 0.28 * ageFrac), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Kept small and modestly translucent: this point drifts slowly over
    // several seconds, and a slow-moving bright/large disc would overlap its
    // own recent positions faster than the background-erase can clear them,
    // reading as a smeared "stem" rather than a drifting petal. A small,
    // soft marker avoids that regardless of travel speed.
    ctx.globalAlpha = clamp(d.alpha, 0, 1) * 0.55;
    ctx.fillStyle = rgbStr;
    ctx.beginPath();
    ctx.arc(d.x, d.y, Math.max(1.1, d.sz * 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function idle(state, w, h, dt) {
    // Ambient life (rotation/breathing/idle-spawn/propagation) all advance
    // inside tick() using real dt every frame; keep this a light no-op to
    // avoid double-updating physics.
  }

  // ---- gallery shell contract: kid-facing smart controls ----
  // Setting either control only affects blooms created AFTER the change —
  // see moodId/family being frozen per-bloom at creation time throughout
  // (makeBloom, regenSeedAt, nextFamily). Safe under rapid tapping: applying
  // a control is just two property writes on `state`, no reflow/rebuild of
  // any existing bloom or seed.
  function applyControl(state, kind, id) {
    if (kind === 'size') { state.sizeMul = Math.max(0.6, Math.min(1.6, Number(id) || 1)); return; }
    if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
    if (kind === 'mood') {
      var mood = findMood(id);
      state.moodId = mood.id;
    } else if (kind === 'character') {
      var character = findCharacter(id);
      state.characterId = character.id;
    }
  }

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['bloom'] = {
    name: 'Bloom',
    tagline: 'A dusk garden unfurls petal by petal, spinning slow, then sends a single seed drifting off to plant the next.',
    init: init,
    pointer: pointer,
    tick: tick,
    idle: idle,
    controls: {
      moods: [
        { id: MOODS[0].id, name: MOODS[0].name, colors: MOODS[0].colors },
        { id: MOODS[1].id, name: MOODS[1].name, colors: MOODS[1].colors },
        { id: MOODS[2].id, name: MOODS[2].name, colors: MOODS[2].colors },
        { id: MOODS[3].id, name: MOODS[3].name, colors: MOODS[3].colors }
      ],
      character: {
        label: 'Flower',
        options: [
          { id: 'mix', name: 'Garden Mix' },
          { id: 'spiral', name: 'Spiral' },
          { id: 'dahlia', name: 'Dahlia' },
          { id: 'rose', name: 'Rose' }
        ]
      }
    },
    applyControl: applyControl
  };

})();
