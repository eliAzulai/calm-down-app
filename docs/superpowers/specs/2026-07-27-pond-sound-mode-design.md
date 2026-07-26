# Pond Sound Mode + Freeform Smoothing (Spec 5) — Design

**Date:** 2026-07-27
**Status:** Built same-session under the full-autonomy working rule; decisions recorded here with fork rationale, review lands at the PR gate.
**Source:** Voice note after v7 shipped: "a sound mode where… like when you drop a pebble, you get these ripples, concentric circles… overlapping… each time you touch it, it makes a nice sound from 11Labs, maybe a ping… different variations depending on how long you held it or how hard you pressed it… Perhaps also experiment with one of the other modes… It also needs smoothing out, some kind of a redesign on the free form one… looks like these caterpillar segments which are kind of janky."
**Predecessors:** Spec 4 `2026-07-20-canvas-feedback-pass-design.md` (invert precedent: moods-without-character, 13-mode tray, calm start), Spec 2 (mode registry, trays, CALM_VIS), Soundscape 2.0 (buses, A=432 house tuning, sfx layer + its human-gated ElevenLabs item).

## Request → decisions

| Ask | Reading | Decision |
|---|---|---|
| "Sound mode… pebble ripples… overlapping" | A mode whose identity is touch→ripple→tone | **New 14th registry mode: Pond** (`src/modes/pond.js`). Legacy Ripples stays untouched — kids who like it silent keep it silent; registry gets us style tray, persistence, CALM_VIS, calm start for free |
| "Nice sound from 11Labs… a ping… variations by hold/pressure" | Essential = soothing pitched ping with *continuous* variation; ElevenLabs = the means he knows | **Procedural Web Audio chimes now** (`CALM_CHIME` service in app.js), ElevenLabs samples later behind the same API. Rationale: (a) hold/pressure→timbre needs a continuous parameter space samples don't give; (b) 0 bytes vs growing the 11.4 MB atomic SW precache; (c) matches the 4 existing procedural ambient generators; (d) ElevenLabs SFX was already a human-gated listening-pass item in Soundscape 2.0 — that gate stands, this just doesn't block on it |
| "Experiment with one of the other modes… integrate that to the sound" | Ambiguous (garbled transcript) | `CALM_CHIME` is a **shared service**, not pond-private — any mode can call it in a later pass. No existing mode's behavior changes this pass (adding unprompted sound to a mode a kid already uses silently is a bigger call; batched for review) |
| "Smoothing… redesign the free form one… caterpillar segments… janky" | Diagnosed as two real defects (below), not taste | **Freeform stroke redesign**: stroke-based data model + midpoint-quadratic smoothing. Bonus: taps now leave a soft dot (today a tap paints nothing) |

## Caterpillar diagnosis (why Freeform looks segmented)

`addDrawPoint` pushes one segment per pointermove with `width: (2 + Math.random()*2)` — **every segment rolls its own width**, so adjacent segments visibly step 2px↔4px. `renderDrawing` then strokes each segment independently with round caps: every joint gets a bulging end-cap, and the 0.2-alpha glow pass double-paints at every joint (≈0.36 knots). Segments + width steps + glow knots = caterpillar. This is a data-model problem; no amount of styling fixes it.

## Features

### F1 — Pond mode (14th mode, registry)
**Concept:** still water. Every touch is a pebble: a wave train of concentric rings expands from the point, overlapping other trains additively (glowing where they cross). Holding is a finger resting in the water — a soft charge-glow swells at the fingertip and faint rings slip out — and releasing a held touch drops a *heavier stone*: bigger, faster train, deeper tone. Rings always fade (transience is the mode's identity — pond is NOT in `TRACE_MODES`, same exemption logic as echo/etch).

- Tap → 3-ring train, born ~120 ms apart, expanding ~140 px/s, alpha fades over ~2.2 s life.
- Hold ≥ ~350 ms → charge (caps ~1.4 s): fingertip glow swell + a faint ring every ~700 ms while held.
- Release after hold → burst train of 4–5 rings, radius/speed/width scaled up to ~1.6× by charge.
- Multi-touch: per-pointer charge tracking (needs pointer identity — see dispatcher note).
- Overlap: rings drawn with `globalCompositeOperation:'lighter'` so crossings brighten — the "overlapping" delight, bounded by low per-ring alpha.
- CALM_VIS: ring brightness × (1 + 0.25·E), clamped — echo's exact idiom, so the mode's own chimes visibly ripple the water.
- Calm start (Spec 4 F1 law): idle ambient rain-droplets (tiny silent rings every 7–12 s) gate on `hasTouched`. **Idle droplets are always silent** — sound only ever follows the kid's own touch, never ambushes.
- Kid controls: **Mood** (4 water palettes: Moonpool / Lagoon / Koi / Aurora) + **Size** (ring scale). No Character, no Trace (invert precedent covers moods-without-character rendering).
- `tick` = full `clearRect` + redraw live rings each frame → drains to clean canvas by construction (phase10 law).

### F2 — CALM_CHIME touch-chime service (app.js, sfx family)
`window.CALM_CHIME.ping({ pitch, intensity, depth, pan })`, all 0–1 (pan −1..1). Lives beside the sfx accent layer, routes **through the existing always-connected `sfxBus → masterGain`** — volume slider, mute, and the CALM_VIS analyser all apply automatically. NOT gated by the dev `sfxEnabled` experiment flag (that gates the *random ambient accent scheduler*; pond's chimes are the mode's own voice, kid-initiated by definition).

- Tuning: extends the existing `DROPLET_FREQS` A-major pentatonic at A=432 across two octaves (216–864 Hz ladder) — pings can never clash with the ambient rain bed.
- Mapping: `pitch` (pond: touch y, top = higher) → ladder degree; `depth` (hold charge) → shifts degrees down + stretches decay ~1.6 s → ~3.2 s + adds a quiet octave partial (deeper, richer); `intensity` (pressure when hardware reports it, else 0.5) → gain + lowpass brightness; `pan` (touch x) → subtle stereo (±0.4, StereoPanner when supported).
- Voice: detuned ±3-cent sine pair (house warmth idiom, `detunedPair` precedent) → lowpass → 15 ms linear attack + exponential decay envelope → pan → sfxBus. Self-contained lifetimes, no loops, nothing can stick on.
- Budget: ≤ 8 concurrent voices, ≥ 50 ms between pings; excess dropped silently. All wrapped in try/catch (house style); `ensureAudioContext()` on first ping (pointerdown = the iOS gesture).
- Pressure reality: iPad finger touches report a constant 0.5; Apple Pencil reports real values. Hold duration is the primary expressive axis by design; pressure is progressive enhancement.
- **ElevenLabs swap-in path:** ping() is source-agnostic — a decoded sample bank keyed by (degree, depth-tier) can replace the synth voice behind the same signature after the human listening pass. Precache cost is the reason not-now.

### F3 — Freeform stroke redesign
Data model: `canvas.drawStrokes` (array of `{points:[{x,y}…], color, width}`) + `canvas.activeStrokes` (pointerId → stroke ref). Down starts a stroke (and its first point), move appends (thinned to ≥ 2 px spacing), up/cancel finalizes. Render: each stroke traced ONCE — `moveTo` then `quadraticCurveTo` through consecutive midpoints — stroked twice (glow pass width×3 alpha 0.2, core pass width alpha 0.85, both round cap/join). Width stable per stroke (2.6 + rand·0.8, × pinch scale at stroke start). One-point strokes render as a soft dot (tap mark). Caps: 240 strokes / 6000 points, oldest strokes dropped. No veil — persists until Clear (unchanged law). `initCanvas` / `switchToMode` / `handleClearCanvas` resets move from `drawPaths` to the two new fields; `drawPaths` is deleted (orphan of this change).

## Architecture notes
- **Dispatcher extension:** the three registry pointer dispatch sites pass a new 5th arg `meta = { id: e.pointerId, pressure: e.pressure }`. Existing modes ignore extra args (ES5); pond uses id for multi-touch holds, pressure for intensity.
- **pointercancel** now dispatches `'up'` to the active registry mode before dropping the touch (today it silently deletes). Without this a cancelled hold leaks a charging pointer in pond forever. Side effect on echo: a *cancelled* tap can stamp one copy (rare, harmless, arguably more correct than the current stuck-dragging).
- `MODES` gains `'pond'` after `'invert'` (14 entries, registry block stays contiguous); `MODE_LABELS` += Pond; registry.js `ORDER` += `'pond'`; `TRACE_MODES` unchanged (pond exempt).
- index.html: `<script src="modes/pond.js">` after invert.js, before app.js. SW: ASSETS += `./modes/pond.js`, `CACHE_NAME` → `calm-station-v8`, `APP_VERSION` → `'v8'`.
- Default experience unchanged: `enterProfile` still lands on trails; Pond is reachable via tray/sidebar like every registry mode.
- Signals: pond gets mode_start/end/select/control coverage automatically. No per-ping signal (would spam sessions storage; `canvas_touch` aggregation already covers touch intensity).

## Testing (phase12 + refreshes)
New `tests/phase12-test.mjs`: pond registered (CALM_MODES.list, MODES, tray button); tap → rings paint (pixel delta) and fully drain after life; hold→release burst paints more than a tap; calm start (no idle droplets pre-touch); CALM_CHIME exists, ping() safe with and without AudioContext, voice cap holds under 30 rapid pings; style tray shows Mood+Size, no Trace, for pond; freeform: fast spaced drag paints continuous coverage between event points, width stable within a stroke (data model), tap leaves a dot, Clear resets; SW v8 precaches pond.js.
Refreshes (each marked AUTHORIZED REFRESH): soundscape SW-precache pin v7→v8 (+ pond.js in wanted list); phase10 SW pin v7→v8, CALM_MODES.list count, all-modes-drain gains pond budget; phase11 SW pin v7→v8; any mode-count assertions 13→14. Full battery gates the pass; the two known flaky checks (phase10 morph residue, phase11 invert heal) stay untouched per memory note — no threshold loosening.

## Out of scope
Sound in any existing mode (batched for review — CALM_CHIME is ready when wanted) · ElevenLabs sample bank (human listening gate stands) · per-mode chime on/off control (masterGain volume suffices until observation says otherwise) · legacy Ripples changes · hi-bitrate music re-encodes (rejected, Spec 4 session).

## Backlog seeds
Chime experiment in one existing mode (bloom petals? etch?) behind a style-tray toggle · ElevenLabs voice bank behind CALM_CHIME.ping() · pond "Rain" character (ambient droplet density control) · pressure-true devices (Pencil) mapped to ring width.
