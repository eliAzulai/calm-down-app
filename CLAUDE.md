# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Calm Station — an interactive touch-responsive creative canvas with ambient sound for neurodivergent teens (11-14). Calming exercises (breathing, grounding) surface as gentle side features, not the main event. The kids would never open a "calming app" voluntarily — the canvas IS the draw.

## Commands

```bash
# Serve locally (src/ is the deploy root, no build step)
npx http-server src -p 8080

# Run tests (requires local server on :8080)
npx http-server src -p 8080 -s &
node tests/phase1-test.mjs   # through phase8-test.mjs

# Deploy
npx vercel --prod  # project: calm-station, deploys src/ directory
```

## Architecture

Vanilla JS, no framework, no bundler. Three core source files plus the animation mode registry do everything:

| File | Lines | Role |
|------|-------|------|
| `src/index.html` | ~200 | HTML shell with all screen containers and overlays |
| `src/app.js` | ~4280 | All logic: state, canvas rendering, audio, exercises, parent dashboard |
| `src/styles.css` | ~1800 | CSS design system, themes, all component styles |
| `src/modes/` | 7 files + `registry.js` | Animation mode registry — one file per registry mode (`echo.js`, `currents.js`, `orbits.js`, `mandala.js`, `bloom.js`, `morph.js`, `etch.js`), each registering into `window.VARIANTS`; `registry.js` exposes `window.CALM_MODES` (list/get) and the shared `window.CALM_VIS` energy feed |

Supporting files: `manifest.json`, `sw.js` (service worker), `icon-192.svg`, `icon-512.svg`.

### Screen System
Screens are always in the DOM. Only `.screen.active` is visible (400ms CSS transition). Screens: `screen-profiles`, `screen-canvas`, `screen-parent`.

### State Pattern
Central `state` object + `setState(updates)` that calls `render()`. No virtual DOM — direct DOM manipulation via `textContent`, `classList`, `style`.

### Canvas Rendering
Full-viewport `<canvas>` with `requestAnimationFrame` loop. 12 visual modes: 7 registry modes (`src/modes/echo.js`, `currents.js`, `orbits.js`, `mandala.js`, `bloom.js`, `morph.js`, `etch.js`, loaded via `src/modes/registry.js` as `window.CALM_MODES`) plus 5 legacy modes built into `app.js` (finger trails, particles, ripples, geometric patterns, freeform drawing). Switch modes via the mode tray (grid icon, lists all 12) or double-tap cycling — both call the same `switchToMode()`. Registry modes additionally get a kid-facing style tray (paint-swatch icon) with up to four per-mode controls — Mood, Character, Size, Trace (fades vs. stays) — persisted per profile; legacy modes and etch/echo hide the controls that don't apply to them. Canvas rendering is also audio-reactive: an `AnalyserNode` tap on the master gain feeds a smoothed 0-1 `window.CALM_VIS.energy` value that registry modes read as a bounded multiplier, with a per-profile dev kill-switch (`visualReactivity`, default on) to zero it out for testing/comparison. Multi-touch via Pointer Events API.

### Audio
Web Audio API, three layer buses (music/ambient/sfx) into a master gain. Music: 3 precached MP3 tracks (src/audio/music/) as seamless AudioBuffer loops, one decoded at a time. Ambient: 4 procedural generators tuned to A=432. SFX + entrainment are per-profile dev-gated experiments (?dev=true). AudioContext created on first user gesture (iOS requirement). 500ms crossfades; ambient auto-ducks under music.

### Exercise Flow
Gentle orb appears after 3-5 min of canvas use → tap reveals breathe/ground choice → energy check-in → exercise → energy check-out with before/after comparison. Everything dismissable.

### Theming
5 CSS themes (`theme-ocean`, `theme-sunset`, `theme-forest`, `theme-neon`, `theme-mono`) override `--accent`, `--accent-glow`, `--accent-dim` variables. Applied as class on screen container.

### Storage
localStorage per profile. Keys: `calm-station-profiles`, `calm-station-{id}-prefs`, `calm-station-{id}-sessions`. All wrapped in try/catch for private browsing.

### Parent Dashboard
Hidden access: long-press title 3s or `?parent=true`. Shows per-kid stats, session history, Telegram webhook notifications.

## Testing

Tests use Playwright (chromium, headless) at iPad viewport (768x1024). Each phase has its own test file (`tests/phase1-test.mjs` through `phase8-test.mjs`). Tests are standalone scripts (no test runner), output PASS/FAIL to console.

## Key Design Constraints

- Primary device: iPad. Test at 768x1024, secondary 375px mobile.
- Every feature is opt-in, skippable, dismissable — never directive.
- Touch targets >= 48x48px. `touch-action: manipulation` on body.
- Canvas must hit 60fps. Pause rendering when `document.hidden`.
- `PRD.md` is source of truth for product requirements.
- `TODO.md` tracks build phases (all 8 complete).
- `PROJECT-SPEC.md` has technical details for audio/canvas/state.

## Deployment

Live at https://calm-station.vercel.app. Vercel deploys `src/` directory directly. PWA-installable via Add to Home Screen.
