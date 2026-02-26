# Calm Station — Build Plan

## How To Use This File
Work through phases in order. Complete all items before moving to the next phase.
Each phase results in a working, testable, deployable state.
The PRD.md is the source of truth for requirements and design decisions.

---

## Phase 1: Project Setup & Shell
> Goal: Deployable empty shell with profile screen

- [x] Set up project structure for static hosting (Vercel/Netlify)
- [x] Create index.html with meta tags, PWA tags, DM Sans font
- [x] CSS design system: all variables from PRD color system, base styles
- [x] Profile selection screen: 2 tappable profile cards
- [x] First-time profile setup: enter name, pick color theme (3 themes minimum)
- [x] Profile data stored in localStorage (`calm-station-profiles`)
- [x] Tapping profile → transitions to canvas screen (empty for now)
- [ ] Deploy to hosting — confirm it loads on iPad Safari
- [x] Test: profiles persist across reload

## Phase 2: Interactive Touch Canvas (MVP Core)
> Goal: The thing that makes them want to open the app

- [x] Full-screen HTML5 Canvas, fills viewport behind a minimal UI layer
- [x] **Finger Trails mode:** glowing color paths follow touch, fade slowly
- [x] **Particles mode:** particles follow/scatter from touch points
- [x] **Ripples mode:** water ripple effects emanate from taps
- [x] Double-tap to cycle between visual modes
- [x] Pinch to zoom the visual effect
- [x] Clear/reset button (small, unobtrusive, corner placement)
- [x] Multi-touch support
- [x] Visuals use the kid's chosen color theme
- [x] Performance: 60fps on iPad, test with Chrome DevTools
- [x] Test: satisfying to play with, responsive, no jank

## Phase 3: Ambient Sound
> Goal: Sound options that coexist with the canvas

- [x] Web Audio API: create AudioContext on first user gesture
- [x] Procedural rain sound (filtered noise + low rumble)
- [x] Procedural drone/ambient pad (low oscillator + harmonics)
- [x] Sound selector: small music icon on canvas, opens sound picker
- [x] Play/pause button
- [x] Volume slider
- [x] Sound OFF by default
- [x] Crossfade when switching sounds (500ms, no hard cuts)
- [x] Pause audio on visibilitychange
- [x] Sound preference saved to localStorage per profile
- [x] Test: sounds play on iPad Safari, volume works, no glitches

## Phase 4: Remaining Canvas Modes + Polish
> Goal: Full canvas experience

- [x] **Geometric Patterns mode:** shapes grow from touch points
- [x] **Freeform Drawing mode:** painting with color picker
- [x] Visual mode indicator (subtle, shows current mode name briefly on switch)
- [x] More sound options: ocean waves, white noise/pink noise
- [x] Additional color themes (5-8 total, see PRD)
- [x] Smooth transitions between modes
- [ ] Test with actual kids — observe what they gravitate to

## Phase 5: Gentle Prompt & Breathing Exercise
> Goal: Regulation tools surface naturally

- [x] Gentle prompt: soft glowing orb appears after 3-5 min of canvas use
- [x] Orb pulses slowly, positioned in non-intrusive corner
- [x] No text until tapped — tap reveals: "Breathe" or "Ground" choice
- [x] If ignored, orb fades away after ~30 seconds
- [x] Appears max once per session
- [x] Breathing exercise (port from reference/calm-tool-prototype.jsx):
  - [x] 3 patterns: Box (4-4-4-4), 4-7-8, Simple (5-5)
  - [x] Animated breathing circle
  - [x] Phase labels + cycle counter
  - [x] 4 cycles → completion
  - [x] Canvas continues behind (semi-transparent overlay)
  - [x] Close/back to canvas at any time
- [x] Test: prompt feels gentle not pushy, exercise works, easy to dismiss

## Phase 6: Grounding Exercise + Energy Check
> Goal: Full regulation toolkit

- [x] Grounding exercise (port from prototype):
  - [x] 5-4-3-2-1 senses, one at a time
  - [x] Progress bar, tap circles, next sense
  - [x] Close/back to canvas at any time
- [x] Energy check-in before exercises:
  - [x] 5 levels: Overload/Wired/Calm Zone/Low/Shutdown
  - [x] Quick tap selection
- [x] Energy check-out after exercises:
  - [x] Same selector
  - [x] Before/after comparison display
  - [x] Contextual message based on change
- [x] Session logged: { date, energyBefore, energyAfter, exerciseType }
- [x] Test: full flow from canvas → prompt → exercise → check-out → back to canvas

## Phase 7: Parent Dashboard & Notifications
> Goal: Parent can see usage data without kids knowing

- [x] Hidden access (long-press app title, or URL param ?parent=true)
- [x] Dashboard shows per-kid:
  - [x] Session timestamps
  - [x] Energy before/after for exercise sessions
  - [x] Features used per session
  - [x] Total session count
- [x] Parent notification on exercise completion (Telegram webhook or Push API)
- [x] Dashboard is visually distinct from kid UI (prevent confusion)
- [x] Test: data populates correctly, notification fires

## Phase 8: PWA & Polish
> Goal: Feels like a real app on iPad

- [x] PWA manifest (icon, name, theme color, display: standalone)
- [x] Service worker for offline caching
- [x] Add to Home Screen works on iOS Safari + Android Chrome
- [x] Loading state / splash screen
- [x] Error handling for Web Audio (older browsers)
- [x] Touch feedback (subtle scale on tap targets)
- [x] Safe area padding for notched devices
- [ ] Final performance audit on iPad
- [ ] Update printable PDF card if design changed significantly

---

## Backlog (Future)
- [ ] Touch-responsive audio (touch affects pitch/tone) — needs testing with kids
- [ ] Screenshot / save canvas art
- [ ] Shake device to scatter particles
- [ ] Points / unlockables system
- [ ] Streak tracking
- [ ] Lo-fi beats (embedded audio or procedural)
- [ ] Separate TSG app for 4 skills & roles
