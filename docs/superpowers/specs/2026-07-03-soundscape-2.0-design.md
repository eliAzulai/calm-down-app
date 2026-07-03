# Soundscape 2.0 — Design

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan
**Follows:** `project-room-phase2/05_outputs/phase2-development-brief.md` (workstream 5: sensory tuning)
**Companion spec (later):** Animation Sensory Pass — tuning of the 5 visual modes + audio-reactive visuals. Deliberately staged *after* this spec so kid-observation data stays one-variable-readable.

## Context & Goals

Kid testing confirmed sound helps but must be refined, deliberate, and tested. The app currently has 4 procedural Web Audio textures, one playing at a time, no audio files. Three real recordings exist (Crystal Bowls at 432 Hz, Endless Tidal Breath, Forest Renewal Rain) and should become first-class app audio.

Goals, in priority order:

1. Add the 3 recordings as a **Music** layer, fully offline-capable.
2. Improve the 4 procedural textures so they are soothing, warm, and never audibly repetitive.
3. Build on relaxing-frequency ideas (432 Hz tuning, slow entrainment rates) as **testable variables**, not defaults or claims.
4. Add a sparse SFX accent layer (ElevenLabs one-shots) as a **dev-gated experiment**.
5. Keep the kid-facing UI as simple as it is today.

Non-goals: animation changes, auto-personalization, kid-visible mixing controls, reward/tap sounds.

## Decisions Log (from brainstorm)

| Decision | Choice |
| --- | --- |
| Recordings vs procedural sounds | Separate **Music** group; procedural textures stay |
| Offline model | **Precache all** music + SFX at install for full offline |
| File prep | Re-encode (mono AAC ~112 kbps) + seamless loop points |
| Mixing model | **Layered**: Music + Ambient + SFX buses, simultaneous |
| Procedural improvements | Full treatment set (below), try then tweak from observation |
| Frequency work | 432 tuning baked in; entrainment rates dev-gated experiments |
| Staging | This spec first; animation pass is a second spec |

## Architecture

### Audio graph

```
musicBus ───┐
ambientBus ─┼─► masterGain (existing) ─► destination
sfxBus ─────┘
```

Three named `GainNode` buses feed the existing `masterGain`. The existing volume slider, play/pause, and `visibilitychange` handling operate on `masterGain`/context and therefore cover all layers unchanged.

### Music layer

- Registry: `MUSIC_TRACKS = [{ id, name, file, loopStart, loopEnd, gain }]` for the 3 tracks.
- Files live in `src/audio/music/`, re-encoded mono AAC (~112 kbps, ~2 MB each) from the source recordings.
- Playback: `fetch` → `decodeAudioData` → `AudioBufferSourceNode` with `loop = true` and per-track `loopStart`/`loopEnd` set inside the encoder padding → seamless loops with no click.
- **Memory rule:** only one decoded music buffer held at a time (decoded PCM ≈ 10× file size on iPad). Switching tracks releases the previous buffer reference.
- Crossfade: same 500 ms linear ramp pattern as today.

### Ambient layer (procedural treatments)

Generators keep their existing shape `(ctx, dest) → { gain, stop }` but connect to `ambientBus`. Each texture gets a specific treatment:

**Rain** — target: soft, not hissy.
- Two noise bands (high patter ~4–5 kHz gentle; mid body ~1.5 kHz), each with its own slow LFO at incommensurate rates (0.13 Hz / 0.07 Hz) so texture never audibly cycles.
- Lowpass cap ~6 kHz to remove hiss edge.
- Sparse droplet grains: tiny enveloped sine blips every 2–6 s at random, pitched from a 432-aligned pentatonic set, barely audible. These are texture, not event sounds.

**Ambient Drone** — target: warm, not thin or ominous.
- Each sine replaced by a detuned pair (±3 cents) for natural chorus warmth.
- Retuned to the A=432 family (base ≈ 64.2 Hz).
- Slow filter sweep (~0.03 Hz) for breathing timbre.
- Amplitude swell at ~0.1 Hz (≈ 6 breaths/minute) — a calm-breath pace anchor.
- Intrinsic gentle theta-rate (~6 Hz) tremor at low depth as part of its character.

**Ocean** — target: no audible loop.
- Fixed 0.08 Hz LFO replaced by a wave engine: each wave gets a randomized envelope (8–16 s period, varying amplitude/steepness); no two waves identical.
- Quiet high-passed foam wash tied to each crest.
- Slow stereo drift via `StereoPannerNode`.

**White Noise** — target: not sharp or fatiguing.
- Re-voiced toward pink/brown: cascaded shelf filters approximating −3 dB/octave rolloff.
- Barely perceptible slow amplitude undulation so it doesn't feel frozen.

Cross-cutting rules:
- All pitched elements reference **A=432**.
- All LFO rates chosen incommensurate (no small common multiples) so combined layers never form an audible repeating pattern.
- Existing conservative gain levels are the ceiling, not the floor.
- **Auto-duck:** when both Music and Ambient are active, `ambientBus` trims to ~70 % over a 2 s ramp so music sits on top of the ambience bed. Deterministic rule, no signal analysis.

### Relaxing-frequency foundation

- **Evidence stance:** entrainment research (theta/alpha/gamma AM, 432 tuning) is mixed/emerging. The app treats each rate as a *testable design variable* inside the existing Phase-2 observation loop — never a health claim, never a default the kids can't escape.
- **Entrainment modulator (dev-gated):** an amplitude-modulation node on `ambientBus` with dev-selectable rate — `off / theta ~6 Hz / alpha ~10 Hz / gamma 40 Hz` — default **off**, set per profile via the `?dev=true` controls with an experiment label. Monaural (amplitude) beats, not binaural: iPad speakers cannot deliver binaural, AM needs no headphones.
- Observation workflow: set rate + experiment label in dev controls → casual kid session → observation note + signal review decide whether it stays.

### SFX layer (dev-gated experiment)

- 4–6 short, soft ambient one-shots: distant chime, water drop, soft bird, low bowl swell. Stored in `src/audio/sfx/`, decoded once (small files), played through `sfxBus`.
- Scheduler: one accent every ~45–120 s (randomized), conservative gain slightly randomized, never in the first 60 s of a session.
- **Default OFF for every profile.** Enabled only via `?dev=true` per-profile controls as a labeled experiment — honoring the Phase-2 guardrail: no event sounds by default; sparse, soft, never surprising.
- Sourcing: check Infisical `shared` for `ELEVENLABS_API_KEY`; if absent, generate via the ElevenLabs web UI from the creative brief above and drop files in place.

## Kid-Facing UX

The sound panel gains one labeled row and nothing else:

- **Music** row: 3 track buttons.
- **Sounds** row: 4 texture buttons (existing).
- Tap toggles that layer; max one active per row; both rows may play together.
- One master volume slider (existing). One play/pause that pauses everything (existing).
- No per-layer volumes, no SFX toggle, no entrainment control — those live in the dev screen only.
- Sound stays **off by default**; silence remains a first-class state.

## Data

### Prefs migration

Per-profile sound prefs grow from `{ soundId, volume }` to `{ musicId, ambientId, volume }`. On first load, legacy `soundId` migrates to `ambientId`. No one loses a saved preference.

### Signals

- `sound_select` / `sound_stop` gain a `layer` field (`music` | `ambient`).
- New `sfx_played` event (fires per accent, so review can correlate with behavior).
- Dev experiment state (entrainment rate, SFX on/off, experiment label) is included in the signal context so exports are self-describing.
- Dev dashboard summary adds per-layer usage so the signal-review checklist can answer "was music part of the draw?"

## Offline & File Pipeline

- `sw.js` bumps to `calm-station-v2`; precache list adds all files under `src/audio/` (~7–9 MB total after re-encode, vs ~20 MB raw).
- One-time prep (documented in the implementation plan): `ffmpeg` re-encode to mono AAC ~112 kbps; determine `loopStart`/`loopEnd` per track by inspecting decoded buffers for the encoder-padding boundaries.
- Full offline from first run: install downloads everything; no lazy paths.

## Error Handling

- Music fetch/decode failure → that track button shows a quiet "unavailable" state; ambient layer unaffected; no console errors surface to tests.
- No Web Audio support → existing `ensureAudioContext` guard silently no-ops all three buses.
- `visibilitychange` → existing pause covers all layers via shared context.
- Private browsing / storage failure → existing try/catch wrappers; prefs migration is wrapped the same way.

## Testing

New `tests/soundscape-test.mjs` (Playwright, same standalone style as phase tests):

1. Sound panel renders Music and Sounds rows with correct counts.
2. Selecting a music track plays it; selecting an ambient texture while music plays keeps both active (two live buses).
3. Toggle semantics per row (re-tap stops that layer only).
4. Auto-duck applies when both layers are active.
5. Legacy prefs `{ soundId }` migrate to `{ ambientId }`.
6. `sw.js` precache list includes all audio files.
7. Signals carry `layer`; `sfx_played` recorded when SFX experiment enabled via dev controls.
8. Kid-facing screens expose no SFX/entrainment/dev controls.
9. No browser console errors.

Manual iPad pass (cannot be automated): loop-seam listening test per track, memory behavior across track switches, sensory-tuning checklist ratings, speaker (not headphone) check of AM rates.

## Out of Scope

- Animation tuning + audio-reactive visuals → **Spec 2: Animation Sensory Pass** (agreed direction: tuning pass on the 5 existing modes + subtle audio-reactivity fed by an `AnalyserNode` on `masterGain`; brainstormed after this lands).
- Auto-personalization of any kind.
- Kid-visible mixing, ratings, or preference surveys.
- Reward sounds, tap tones, unlock sounds.
- Binaural beats (headphone-dependent).

## Open Items

1. Exact `loopStart`/`loopEnd` values per track — measured during implementation.
2. `ELEVENLABS_API_KEY` presence in Infisical `shared` — checked during implementation; fallback is manual web-UI generation.
3. Whether "Forest Renewal Rain (1).mp3" differs from "Forest Renewal Rain.mp3" — pick the better take during file prep; the `.mp4` is not an app asset.
4. Track display names for the Music row (kid-friendly, short) — proposed: "Bowls", "Tides", "Forest Rain"; confirm at implementation review.
