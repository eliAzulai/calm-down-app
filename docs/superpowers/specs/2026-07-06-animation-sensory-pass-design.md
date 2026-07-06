# Animation Sensory Pass (Spec 2) — Design

**Date:** 2026-07-06
**Status:** Approved via 5-round interactive demo evaluation; pending implementation plan
**Reference implementation:** `reference/vis-variants/*.js` (demo-validated code, adapted contract) + `reference/vis-variants/demo-gallery.html` (the evaluated gallery)
**Predecessor:** Soundscape 2.0 (`docs/superpowers/specs/2026-07-03-soundscape-2.0-design.md`) — merged stack PR #3/#4 prerequisite

## Context

Kid testing of the original 5 canvas modes: "tended to get too busy after a while, not enough variations." Particles was the favorite mode. Instead of speculative design, this spec was validated through five published demo rounds with the product owner touching real implementations. Every requirement below traces to an explicit verdict.

## Decisions Log (all verdicts from demo rounds)

| Decision | Verdict |
| --- | --- |
| Which new modes ship | **All seven**: Currents, Orbits, Mandala, Bloom, Morph, Echo, Etch |
| Aurora | Parked (nice idea, needs the most work; revisit later) |
| Echo | "Massive hit" — flagship; loved speed subtlety, spacing, color walk, shape morphing |
| Variation architecture | **Three layers**: bounded randomness engine (always on) · kid-facing smart controls · dev dials setting the bounds |
| Kid-facing controls | **Per mode**: Mood swatch (4 curated palettes) · one Character chip · **Size** (bounded slider + "random sizes" toggle) · **Trace** (fades ↔ stays-until-Clear) — trace choice is ALWAYS the kid's |
| Trace behavior | Two validated models: self-clean (hold ~1 s → fade fully 2–3 s, wave-tail easing, canvas returns still) and Etch-style persistence (stays until Clear / redrawn-over). Kid chooses per mode via the Trace chip |
| Ghost trails | **Eradicated everywhere** — no lingering light-grey residue on any mode, including the legacy five (verdict: "get rid of these across the board"). Technique: transparent canvas + destination-out veils + true-zero element fades |
| Palettes | Free curated per-mode palettes (validated names/hexes live in the reference files); theme integration deferred to implementation (see Open Decisions) |
| Colors/gestures | Hold is a first-class gesture in every mode (validated hold behaviors per mode); stamped after-images (Echo) over smear-trails |
| Audio-reactivity | From the original Spec-2 direction (pre-demo, still in scope): canvas breathes with the soundscape when sound plays — AnalyserNode on `masterGain`, bounded multipliers, silence = exactly neutral; per-profile dev kill-switch, default ON |

## The Seven Modes (reference file + shipped deltas)

Each reference file is demo-validated (fps p95 ≤ 18 ms under stress, strobe-free, residue-gated, hold-verified, control-verified — see Verification Heritage). Implementation ports them into the app's mode system with the deltas listed.

1. **Currents** (`currents.js`) — flow-field particle rivers; hold = whirlpool. Characters: Drift/Rivers/Swirl. **Delta:** eradicate remaining faint trail residue (tighten veil + tail window further; the verdict explicitly named currents).
2. **Orbits** (`orbits.js`) — firefly constellations around touch anchors; hold = gravity-well tighten. Characters: Halo/Ellipse/Swarm. **Delta:** eradicate remaining thread-trail residue (verdict named orbits; consider trails 0–2 points or off by default with Trace=fades).
3. **Mandala** (`mandala.js`) — 6/8/12-fold kaleidoscope trails; hold = self-drawing spiral + gentle spin. **Delta:** none beyond global polish.
4. **Bloom** (`bloom.js`) — ordered-pattern garden: three form families (phyllotaxis + parastichy shimmer / dahlia rings / rose whorls), golden-angle self-propagation, bud opening, petal seeds; hold = swell. Characters: Garden Mix/Spiral/Dahlia/Rose. **Delta:** none required; "good — develop a bit more later" (backlog: more form families, richer shimmer).
5. **Morph** (`morph.js`) — liquid vertex-morphing geometry; hold = pause-and-breathe. Characters: Classic/Stars/Petals shape sets. **Delta:** none beyond global polish.
6. **Echo** (`echo.js`) — THE flagship: drag a morphing object that stamps opaque full-color after-images; distance-keyed color walk; overwrite-on-repaint; tap = single stamp; Clear resets. Characters: Classic/Stars/Petals. **Deltas (explicit verdicts):**
   - **Soft glowing edges:** remove the darker outline ring; color runs to the stamp edge with a soft feathered alpha falloff (~2–4 px) so stamps glow — "not two separate things, just the colour all the way to the edge, faded out a little"
   - **Smooth overlap:** overlapping stamps must compose smoothly (no hard seams, no visible slow redraw); tighten stamp cadence (~22 px → ~14 px) so coverage feels fluid
7. **Etch** (`etch.js`) — persistent beaded trails with a traveling pulse (~0.11 Hz); redrawing over a trail erases it. Verdict: "could be a good move — I like how it's always there." Ships as the pure persistent-drawing instrument. **Delta:** none beyond global polish.

**Legacy five modes** (trails, particles, ripples, geometric, drawing): remain in the app, but receive the ghost-trail eradication treatment (transparent-canvas veils + true-zero fades) so nothing in the picker shows residue. Long-term retirement/replacement decided by observation data, not now.

## Kid-Facing Controls (the "smart controls" surface)

Presented per mode in the same interaction style as the sound panel (small icon → tray), never a settings screen:

- **Mood** — 4 curated palette swatches per mode (validated palettes in reference files; moods[0] is each mode's signature). Switching affects NEW elements only; live elements age out (validated as beautiful, not buggy).
- **Character** — one mode-specific chip row (families/symmetry/flow/shapes as listed above).
- **Size** — bounded slider (no numbers shown; range pre-tuned per mode so extremes stay beautiful) + a "surprise sizes" toggle that randomizes element size within a band around the slider value. Applies to each mode's primary element (stamp size, particle size, spark width, bloom scale, shape scale, trail width).
- **Trace** — two-state chip: *fades away* / *stays* (stays = Etch-style persistence semantics for that mode's trace layer + Clear button as the reset). Default per mode set via dev dials; kid can always change it.

Guardrails: all controls are curated-discrete or bounded; no combination can produce flashing, overwhelm, or jank (bounds enforced inside each mode). Control taps are recorded as preference signals (see Signals).

## Architecture

- **New file `src/modes.js`** (second classic script tag in `index.html`, loaded before `app.js`): the seven mode implementations + a `MODE_REGISTRY` adapting the demo contract (`init/pointer/tick/idle/controls/applyControl`) to the app. Keeps `app.js` from doubling in size; no bundler needed.
- **app.js integration:** `tickCanvas` dispatches to registry modes alongside legacy renderers; pointer handlers route `down/move/up` (hold tracked inside modes); the Clear button calls the mode's reset; mode indicator names extended.
- **Mode picker:** double-tap cycling breaks at 12 modes — add a mode tray (same pattern as the sound panel: small icon → grid of mode chips). Double-tap keeps cycling as a shortcut. *(Open Decision #2 covers picker details.)*
- **Controls state:** per-profile per-mode selections persist in the existing prefs blobs (`calm-station-<id>-prefs`), e.g. `modeControls: { echo: {mood, character, size, sizeRandom, trace} }`. Defaults per mode come from dev dials.
- **Audio-reactivity:** one `AnalyserNode` on `audio.masterGain` (post-everything); smoothed energy (attack ~0.5 s / release ~2 s) exposed as a per-frame value; each mode consumes it as bounded multipliers (glow/width/pace, ±25 % max). Silence ⇒ exactly 1.0. Dev kill-switch per profile (`visualReactivity`, default on).
- **Dev dials (`?dev=true`):** per-profile defaults for mode controls, size-band bounds, reactivity kill-switch; experiment labels as today.
- **Signals:** new events — `mode_control` `{mode, control, value}`, plus existing mode_start/mode_end unchanged; summaries add top-control usage per mode so observation can answer "do the kids use the controls?"
- **Service worker:** `modes.js` joins ASSETS; CACHE_NAME → v3.

## Verification Heritage → Shipping Tests

The demo rounds hardened a gate battery; the implementation plan ports it as `tests/phase10-test.mjs` (+ extends soundscape suite where audio-reactivity touches):
residue gate (post-doodle canvas returns to baseline ≤ 4 s in *fades* mode) · persistence gate (*stays* mode survives untouched, Clear resets) · strobe gate (consecutive mean-luminance delta < 35) · overwhelm gate (< 55 % bright under stress) · fps gate (rAF p95 < 22 ms per mode incl. 12-fold mandala + sustained echo stamping) · hold gates per mode · control gates (mood affects only new elements; character transitions snap-free; size slider bounded; trace toggle semantics) · kid-copy leak gate (no dev strings on kid surfaces).

## Error Handling

Modes are isolated: a mode whose `tick` throws is caught by the dispatcher, logged to signals (`mode_error`), and the app falls back to the trails mode rather than freezing the canvas. Controls are defensive no-ops on bad ids. Registry absence (modes.js failed to load offline-cache-miss) degrades to legacy five modes.

## Open Decisions (resolve at spec review — recommendations included)

1. **Palette-vs-theme:** modes now carry their own curated palettes, but profiles have themes (ocean/sunset/forest/neon/mono). Recommendation: mode palettes win on the canvas; the profile theme keeps styling UI chrome only. (Alternative: filter each mode's mood list per theme — more work, less color variety.)
2. **Mode picker layout:** recommendation: 12 modes in a 3×4 chip grid tray, new modes first, Echo in slot 1.
3. **Legacy-mode retirement:** keep all 12 for the first observation cycle; retire by data.

## Out of Scope

Aurora (parked) · auto-personalization · any kid-visible numeric settings · reward sounds/animations · audio-reactive SPAWNING (reactivity modulates existing visuals only).

## Backlog Seeds (from verdicts)

Bloom: additional form families, richer parastichy play ("develop it a bit more — there's something there") · Aurora revival with swirl physics · per-mode SFX pairings (ties to Soundscape SFX layer once ElevenLabs assets land).
