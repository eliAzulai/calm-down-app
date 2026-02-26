# Calm Station

## Read Order
1. **PRD.md** — The product requirements document. This is the source of truth for what to build and why. Read this first.
2. **TODO.md** — Phased build plan with checkboxes. Work through this in order.
3. **PROJECT-SPEC.md** — Technical implementation details (audio, canvas, state management).
4. **reference/calm-tool-prototype.jsx** — Working React prototype. Port the breathing/grounding/energy-check logic from this file.
5. **docs/tsg-overview.md** — Background on the Teaching Self-Government framework.

## One-Line Summary
An interactive touch-responsive creative canvas with ambient sound for neurodivergent teens (11-14), where calming exercises surface as gentle side features — not the main event.

## Critical Design Constraints
- The kids would NEVER open a "calming app" voluntarily — the canvas experience IS the reason they open it
- Their biggest trigger is directive language — the app must never tell them what to do
- Every feature is opt-in, skippable, dismissable
- Primary device: iPad. Target 60fps canvas rendering.
- Build iteratively: MVP canvas fast, layer exercises later based on real usage

## Architecture
- Web app hosted on Vercel/Netlify/GitHub Pages
- Vanilla JS (no framework for V1)
- HTML5 Canvas for visuals, Web Audio API for sound
- localStorage for profiles and preferences
- PWA-capable (home screen install)

## Development Workflow
1. Read TODO.md for current phase
2. Complete and test each phase before moving on
3. Test at iPad viewport (768px-1024px) as primary, 375px mobile as secondary
4. Update TODO.md checkboxes as you go
5. When porting exercises: reference/calm-tool-prototype.jsx is the source of truth for interaction patterns
