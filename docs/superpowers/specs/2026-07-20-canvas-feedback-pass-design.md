# Canvas Feedback Pass (Spec 4) — Design

**Date:** 2026-07-20
**Status:** Decisions approved by product owner (AskUserQuestion round, this session); pending spec review
**Source:** First real iPad field report after the Animation Sensory Pass shipped (PR #5) — one perceived bug, two control-surface changes, one new mode, one diagnostic.
**Predecessors:** Spec 2 `2026-07-06-animation-sensory-pass-design.md` (mode registry, trays, ghost-trail conventions), Soundscape 2.0.

## Field report → decisions

| Observation | Diagnosis | Decision |
|---|---|---|
| "After clearing with the X / switching modes, one image appears on a blank canvas without touching" | Not a defect: designed "alive pre-touch" idle life — morph seeds a shape at init (`morph.js` "seed idle ambient shape immediately"), bloom self-blooms after 5 s empty, mandala/currents idle sparks/motes | **Calm start** — after Clear or a mode switch, nothing self-generates until the kid's first touch; after first touch, ambient idle life behaves as today |
| "Double tap is a mistake" (accidental mode switches) | Working as built, but wrong for real hands | **Remove double-tap cycling entirely** |
| "Erase button bottom-left… like a sidebar you press once and it pulls out, with quick buttons — erase, forwards/backwards through modes" | New control surface | **Bottom-left pull-out sidebar**: collapsed tab → slides out with Erase, Prev mode, Next mode. Top-right corner buttons and both trays stay as-is |
| "An inverted mode… the pattern takes away rather than additive" | New mode concept | **Build this pass** as the 13th mode: **Invert** — subtractive drawing (see below) |
| "Echo looks blurred; a few versions ago it was amazing… I don't know the version I'm looking at" | Production **has** the retina DPR fix (byte-verified); iPad almost certainly serving a stale SW cache (fix landed in v4, current v5). Second finding: no visible version anywhere | (a) User re-checks after PWA double-relaunch; if still blurry it escalates to a bug in this pass. (b) **Version stamp** shipped so "which version am I on" is always answerable |
| "Drop all those sounds" | Meant "ship them" — no action | Sounds unchanged. (SFX accents remain dev-gated off by default) |

## Features

### F1 — Calm start (idle-life gate)
After `Clear` or a mode switch, the canvas stays perfectly still until the kid's first `pointerdown` on it. Concretely: every registry mode with ambient self-generation (morph idle shape, bloom spontaneous bloom, mandala idle sparks, currents idle motes, orbits ambient spawn) gates that behavior on a per-state `hasTouched` flag — `false` at `init()`, set `true` in `pointer(state,…,'down')`. Since both Clear and mode-switch re-init `regState`, one flag covers both entry paths. Touch-seeded content and its natural aftermath (propagation, decay) are untouched — the rule is "nothing from nothing", not "nothing ever". Legacy five modes already generate nothing untouched.

### F2 — Quick sidebar (bottom-left)
A collapsed, low-opacity tab (≥48 px target) at the bottom-left of the canvas screen. Tap → slides out a compact vertical stack of three buttons: **Erase** (same handler as the existing Clear), **Prev mode**, **Next mode** (both call the existing `switchToMode`, signal `via:'sidebar'`). Tap the tab again or anywhere outside → closes. Joins the existing panel-exclusivity family (sound panel / mode tray / style tray / sidebar — only one open). Kid-facing, no dev gating; touch targets ≥48 px; no text labels needed beyond icons + aria-labels.

### F3 — Double-tap retirement
The double-tap-to-cycle gesture is removed (its accidental triggers are exactly what the sidebar's deliberate Prev/Next replaces). `switchToMode` survives as the single mode-change path (tray, sidebar, dev defaults). Tests that cycle via double-tap (phase2 checks 4–7, phase10 render check) are refreshed to drive the sidebar/tray instead — intent preserved, mechanism updated, each refresh documented.

### F4 — Invert mode (13th mode, registry)
**Concept:** the pattern *takes away*. The mode maintains a soft, slowly self-regenerating luminous field (a quiet fog/wash in the mode's palette, faint enough to stay calm). The kid's strokes **carve darkness through it** (destination-out brush — the exact machinery the ghost-trail work hardened), and the field slowly heals back over ~10–20 s, softly erasing their marks *back into light*. Hold = wider carve. Calm-start compliant: the field itself only begins to bloom after first touch (before that, blank).
- File `src/modes/invert.js`, registered as `invert`, joining `MODES` (13 entries; tray grid accommodates), SW ASSETS, registry ORDER.
- Kid controls: Mood (4 curated palettes for the field), Size (carve width), Trace (fades = field heals / stays = carved paths persist until Clear). Character optional (field textures) — ship with ≥1, more later.
- Bounds: same spec laws — no strobe, veil/heal rates bounded, CALM_VIS coupling ≤ +25% on field glow only.

### F5 — Version stamp
A single `APP_VERSION` constant in `app.js`, kept equal to the SW `CACHE_NAME` suffix (this pass ships `v6`). Displayed small in the parent dashboard footer and dev dashboard header ("Calm Station v6"). Not visible on kid surfaces. The "which version am I looking at" question becomes a 5-second check.

### F6 — Echo sharpness verification (conditional)
Acceptance item, not a build item: after the iPad PWA updates (double relaunch), the owner re-checks echo stamp detail. Sharp → close. Still blurry → becomes a bug task in this pass before it closes.

## Architecture notes
- Calm start lives inside each mode's own state (registry contract already passes pointer events through; no app.js scaffolding needed beyond what exists). No change to legacy modes.
- Sidebar is app.js + index.html + styles.css in the existing panel idiom (`.sound-panel` family), with signals: `sidebar_open`, `mode_prev`/`mode_next` recorded as `mode_select` with `via:'sidebar'`, `clear_canvas` unchanged.
- Removing double-tap deletes the dbltap detection path only; `cycleMode` internals fold into `switchToMode` callers.
- SW: `CACHE_NAME` → `calm-station-v6`; ASSETS += `modes/invert.js`. Version stamp reads `APP_VERSION = 'v6'`.
- Signals: invert mode gets standard mode_start/end/control coverage automatically via the registry dispatch.

## Testing (phase11 + refreshes)
New `tests/phase11-test.mjs`: calm-start gate (per ambient mode: switch → 6 s untouched → lit≈0; touch → life resumes), sidebar (open/close, exclusivity, erase works, prev/next actually change mode + record signals, 48 px targets, mobile viewports), double-tap removal (double-tap no longer changes mode), invert mode (field blooms after touch, strokes carve [alpha drops along stroke], heal-back in fades, stays persists, Clear resets), version stamp visible in parent+dev, SW v6 + invert.js precached. Refreshes: phase2 checks 4–7 and phase10 render-check cycling move from double-tap to `switchToMode`/sidebar — documented per refresh. Full battery ×2 gates the pass as always.

## Out of scope
Corner-button relocation/consolidation (sidebar-absorbs-everything was declined) · sound changes of any kind · auto-updating PWA version surfacing to kids · calm-start dev-dial override (add later only if observation wants it).

## Backlog seeds
Invert field textures as Characters · calm-start as a per-profile dev dial (on/off) · sidebar long-press = jump to mode tray.
