// Aurora variant — "northern lights you can comb with your fingers"
// Ribbon curtains: vertical aurora ribbons swayed by incommensurate sine layers,
// locally bent by touch, springing back over ~4s. Inherently ambient — idle() is a no-op
// documented below because the tick's own sway/breathing already keeps the canvas alive
// with zero pointer input.
(function () {
  var RIBBON_COUNT = 5; // cap per spec
  var SEGMENTS = 60;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ease-towards for spring-like smoothing without teleporting
  function approach(current, target, dt, rate) {
    var k = 1 - Math.exp(-rate * dt);
    return current + (target - current) * k;
  }

  function makeRibbon(idx, w, h) {
    var pts = [];
    var i;
    for (i = 0; i <= SEGMENTS; i++) {
      pts.push({
        // local touch displacement (springs back to 0)
        dx: 0,
        dxVel: 0
      });
    }
    // incommensurate sway periods in seconds: 23, 37, 53 + a slower drift ~ 90s
    var periods = [23, 37, 53];
    return {
      idx: idx,
      baseX: 0, // set by caller based on w
      driftX: 0, // slow horizontal wrap drift, accumulates
      driftSpeed: (0.55 + 0.11 * idx) * (1 / 90), // fraction of width per second, very slow
      phase: [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2],
      periods: periods,
      swayAmp: [0.055, 0.035, 0.02], // fraction of width, layered
      colorPhase: idx * 0.37 + Math.random() * 0.3,
      lumPhase: Math.random() * Math.PI * 2,
      lumSpeed: 0.05 * Math.PI * 2, // ~0.05 Hz breathing
      widthScale: 0.8 + 0.4 * Math.random(),
      pts: pts
    };
  }

  function VARIANT() {}

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['aurora'] = {
    name: 'Aurora',
    tagline: 'Northern lights you can comb with your fingers.',

    init: function (w, h, theme) {
      var state = {
        w: w, h: h,
        t: 0,
        theme: theme,
        ribbons: [],
        pointer: { x: -9999, y: -9999, active: false, strength: 0 },
        bgGrad: null,
        bgGradKey: ''
      };
      var spacing = w / (RIBBON_COUNT + 1);
      for (var i = 0; i < RIBBON_COUNT; i++) {
        var r = makeRibbon(i, w, h);
        r.baseX = spacing * (i + 1);
        state.ribbons.push(r);
      }
      this._buildBgGradient(state, w, h);
      return state;
    },

    _buildBgGradient: function (state, w, h) {
      // cached vertical vignette gradient — built on init/resize only, never per-frame
      var ctxKey = w + 'x' + h;
      if (state.bgGradKey === ctxKey) return;
      state.bgGradKey = ctxKey;
      state._bgW = w; state._bgH = h;
    },

    pointer: function (state, x, y, kind) {
      if (kind === 'down' || kind === 'move') {
        state.pointer.x = x;
        state.pointer.y = y;
        state.pointer.active = true;
        state.pointer.strength = 1;
      } else if (kind === 'up') {
        state.pointer.active = false;
      }
    },

    tick: function (state, ctx, dt, w, h) {
      if (state.w !== w || state.h !== h) {
        // resize: rescale ribbon base positions proportionally, rebuild cached gradient
        var scaleX = w / state.w;
        for (var ri = 0; ri < state.ribbons.length; ri++) {
          state.ribbons[ri].baseX *= scaleX;
        }
        state.w = w; state.h = h;
        this._buildBgGradient(state, w, h);
      }

      state.t += dt;
      var theme = state.theme;
      var accent = theme.accent, secondary = theme.secondary;

      // --- veil (own background wash each tick) ---
      ctx.fillStyle = 'rgba(13,27,42,0.06)';
      ctx.fillRect(0, 0, w, h);

      var px = state.pointer.x, py = state.pointer.y;
      var pointerActive = state.pointer.active;
      var kernelRadius = Math.max(w, h) * 0.22;

      var i, s;
      for (i = 0; i < state.ribbons.length; i++) {
        var rb = state.ribbons[i];

        // slow horizontal drift + wrap
        rb.driftX += rb.driftSpeed * w * dt;
        var wrapWidth = w + kernelRadius * 2;
        var effBase = rb.baseX + (rb.driftX % wrapWidth);

        // layered incommensurate sway (fractions of width)
        var swayFrac = 0;
        for (s = 0; s < rb.periods.length; s++) {
          var period = rb.periods[s];
          var ang = (state.t / period) * Math.PI * 2 + rb.phase[s];
          swayFrac += rb.swayAmp[s] * Math.sin(ang);
        }
        // slower overall drift wobble (~130s) layered on top, tiny
        swayFrac += 0.015 * Math.sin(state.t / 130 * Math.PI * 2 + rb.idx);

        var centerX = effBase + swayFrac * w;
        // wrap centerX into a visually continuous range so ribbons re-enter smoothly
        var wrapped = ((centerX + kernelRadius) % wrapWidth + wrapWidth) % wrapWidth - kernelRadius;
        centerX = wrapped;

        // luminance breathing ~0.05Hz small depth
        var lum = 0.5 + 0.5 * Math.sin(state.t * rb.lumSpeed + rb.lumPhase);
        var lumDepth = 0.18; // small depth, keeps luminance oscillation gentle & slow
        var lumFactor = 1 - lumDepth * 0.5 + lumDepth * lum;

        // build/update segment points top->bottom
        var segH = h / SEGMENTS;
        for (s = 0; s <= SEGMENTS; s++) {
          var pt = rb.pts[s];
          var y = s * segH;
          // gentle per-segment phase offset for a flowing ribbon look (not full independence)
          var segFrac = s / SEGMENTS;
          var localSway = 0.02 * w * Math.sin(state.t * 0.15 + segFrac * 4.0 + rb.idx * 1.3);
          var targetX = centerX + localSway;

          // touch displacement kernel: draw ribbon points TOWARD the pointer (calmer:
          // strands gather/comb toward your finger rather than scattering away — this
          // also makes the touched area visibly brighter as strands converge there).
          var target_dx = 0;
          if (pointerActive) {
            var dxToPointer = targetX - px;
            var dyToPointer = y - py;
            var dist = Math.sqrt(dxToPointer * dxToPointer + dyToPointer * dyToPointer);
            if (dist < kernelRadius) {
              var falloff = 1 - dist / kernelRadius;
              falloff = falloff * falloff; // smooth falloff
              // pull toward pointer: displacement points from ribbon toward pointer x
              target_dx = -dxToPointer * falloff * 0.6;
            }
          }
          // spring toward target displacement; ~4s settle => rate tuned so within ~4s it's ~95% there
          pt.dx = approach(pt.dx, target_dx, dt, 0.9); // 1/0.9 ~1.1s tau, ~4s to settle fully (4 tau)
          pt.x = targetX + pt.dx;
          pt.y = y;
        }

        // taper width toward ends (top & bottom)
        function widthAt(t) {
          // t in [0,1], taper via sine bell curve, min width floor so ribbon never disappears fully
          var bell = Math.sin(Math.PI * t);
          return 0.15 + 0.85 * bell;
        }

        // color lerp along ribbon accent->secondary with per-ribbon phase offset
        function colorAt(t, phaseOffset) {
          var mix = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.5 + phaseOffset);
          var r = lerp(accent[0], secondary[0], mix);
          var g = lerp(accent[1], secondary[1], mix);
          var b = lerp(accent[2], secondary[2], mix);
          return [r * lumFactor, g * lumFactor, b * lumFactor];
        }

        // draw 3 layered strokes: wide very-low-alpha, medium, narrow brighter.
        // Perf: batch segments into a small number of width/color buckets so each
        // layer costs a handful of stroke() calls instead of one per segment
        // (60 segments x 3 layers x 5 ribbons per-segment would be 900 draw calls/frame).
        var layers = [
          { widthMul: 3.2, alpha: 0.05 },
          { widthMul: 1.6, alpha: 0.11 },
          { widthMul: 0.7, alpha: 0.20 }
        ];
        var baseWidth = (w / RIBBON_COUNT) * 0.28 * rb.widthScale;
        var BUCKETS = 6; // segments per bucket = SEGMENTS/BUCKETS (10 here)
        var perBucket = Math.ceil(SEGMENTS / BUCKETS);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (var L = 0; L < layers.length; L++) {
          var layer = layers[L];
          for (var bkt = 0; bkt < BUCKETS; bkt++) {
            var segStart = bkt * perBucket;
            var segEnd = Math.min(SEGMENTS, segStart + perBucket);
            if (segStart >= segEnd) continue;
            var tMid = (segStart + segEnd) * 0.5 / SEGMENTS;
            var wgtMid = widthAt(tMid);
            var col = colorAt(tMid, rb.colorPhase);

            // local touch glow: bucket midpoint near the pointer gets a brightness/width
            // boost (spatial falloff only, no oscillation) so the touched area reads as
            // visibly brighter immediately, not just after the spring settles.
            var glow = 0;
            if (pointerActive) {
              var midIdx = ((segStart + segEnd) * 0.5) | 0;
              var midPt = rb.pts[Math.min(SEGMENTS, midIdx)];
              var gdx = midPt.x - px, gdy = midPt.y - py;
              var gdist = Math.sqrt(gdx * gdx + gdy * gdy);
              if (gdist < kernelRadius) {
                var gf = 1 - gdist / kernelRadius;
                glow = gf * gf; // 0..1, smooth spatial falloff
              }
            }
            var alphaBoosted = layer.alpha * (1 + glow * 1.4);
            var widthBoosted = baseWidth * wgtMid * layer.widthMul * (1 + glow * 0.5);

            ctx.strokeStyle = 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',' + alphaBoosted.toFixed(3) + ')';
            ctx.lineWidth = Math.max(1, widthBoosted);
            ctx.beginPath();
            ctx.moveTo(rb.pts[segStart].x, rb.pts[segStart].y);
            for (s = segStart + 1; s <= segEnd; s++) {
              ctx.lineTo(rb.pts[s].x, rb.pts[s].y);
            }
            ctx.stroke();
          }
        }
      }

      // gently decay pointer strength (kept simple; kernel uses .active flag directly)
    },

    // Ambient life already comes from the layered sway + drift + breathing in tick();
    // no separate idle simulation is needed. Documented no-op per contract.
    idle: function (state, w, h, dt) {
      // intentional no-op — variant is inherently ambient (see tagline/notes)
    }
  };
})();
