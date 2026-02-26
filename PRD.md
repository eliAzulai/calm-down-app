# Calm Station — Product Requirements Document (PRD)

## Document Info
- **Author:** Eliaou (parent/developer) + Claude (interview & synthesis)
- **Date:** February 25, 2026
- **Status:** Ready for Claude Code implementation
- **Approach:** MVP fast, iterate based on kids' feedback

---

## 1. Problem Statement

Eliaou has two neurodivergent/autistic children (ages 11-14) who are highly oppositional to structured learning. He's implementing Nicholeen Peck's Teaching Self-Government (TSG) framework, but can't get his kids to engage with the foundational skill: **calming down**.

The core problem: **these kids would never voluntarily open a "calming app" today.** Any solution that looks or feels like a lesson, therapy tool, or parenting exercise will be rejected immediately.

Their biggest escalation trigger is **being told what to do** — any directive language causes resistance. Their current self-regulation strategies are music/headphones, screens/YouTube/gaming, and art.

### The Insight

The app can't be a regulation tool that happens to look nice. It must be a **calming creative experience they genuinely want to open** that happens to have regulation tools inside it.

---

## 2. Product Vision

**Calm Station is an interactive touch-responsive creative canvas with ambient sound, where calming exercises exist as gentle side features — not the main event.**

The kids open it because it's a beautiful, responsive sensory experience they control. The breathing and grounding tools surface naturally through gentle, non-directive prompts after they've already been engaging with the canvas.

### What It Is
- A full-screen interactive canvas that responds to touch with visual effects and ambient sound
- A personal creative/sensory space each kid owns and customizes
- A place calming exercises live — accessible but never forced

### What It Is NOT
- A therapy app
- A lesson or worksheet
- Something that tells them what to do
- A parent surveillance tool (parent data is separate and never visible to kids)

---

## 3. Users

### Primary Users: Two children (ages 11-14)
- Both high-level autistic / neurodivergent
- Both have very similar needs and triggers
- Highly oppositional to directive language
- Self-regulate through: music, screens, art
- Primary device: **iPad / tablet**

### Secondary User: Parent (Eliaou)
- Software engineer — can modify and deploy code
- Wants to see usage data (timestamps, energy levels, completion notifications)
- Will introduce the app during a calm moment, showing it casually
- Parent data lives in a separate view, never visible to kids

---

## 4. Design Principles

### P1: Agency Is Everything
- The child controls every interaction
- Nothing is mandatory — every feature is opt-in
- No directive language anywhere ("Try this" not "You need to")
- Skip, dismiss, or ignore anything at any time

### P2: Canvas First, Regulation Second
- The touch canvas IS the app — it's the main screen, the home screen, the default
- Breathing and grounding exercises are side features accessed via subtle UI
- Regulation tools are discovered, not pushed

### P3: Sensory-Safe
- No sudden sounds, flashing lights, popups, or alerts
- Dark theme default (reduces visual overwhelm)
- All animations smooth, predictable, slow
- Sound is always user-controlled, off by default

### P4: Not Babyish
- Mature visual design (meditation app aesthetic, not kids' educational app)
- Real vocabulary (Overload / Wired / Calm Zone / Low / Shutdown)
- No cartoon characters, stickers, or childish elements

### P5: Personal Space
- Each kid has their own profile they own
- Their customizations, their canvas, their data
- Feels like THEIR tool, not a parenting tool deployed AT them

---

## 5. Feature Specification

### 5.1 Profile Selection (Start Screen)

**What:** Simple screen where each kid taps their name/avatar to enter their personal space.

**Requirements:**
- Show 2 profile cards (expandable to more later)
- Each profile has: name, chosen avatar/icon, chosen color theme
- Tapping enters their personal canvas immediately
- First-time setup: pick name, avatar, color theme
- No passwords, no PINs — trust-based

### 5.2 Interactive Touch Canvas (THE MAIN SCREEN)

This is the core of the app. A full-screen canvas that responds to touch input with visual effects and ambient sound.

**Visual Modes (switchable):**
1. **Finger Trails** — glowing color paths that follow finger movement, fade slowly
2. **Particles** — particles follow, scatter from, or orbit around touch points
3. **Ripples** — water/ripple effects emanate from tap points
4. **Geometric Patterns** — shapes/patterns grow outward from where you touch
5. **Freeform Drawing** — painting/art mode with color selection

Each mode should feel distinct and satisfying. All use the kid's chosen color theme.

**Canvas Interactions:**
- Touch/drag: triggers the current visual mode's effect
- **Double-tap:** cycles to next visual mode
- **Pinch to zoom:** scales/zooms the visual effect
- **Clear/reset button:** small, unobtrusive button to wipe canvas and start fresh
- Multi-touch supported where possible

**Technical Notes:**
- HTML5 Canvas, full viewport
- Must be performant on iPad (target 60fps, degrade gracefully)
- Visual effects persist on screen and fade slowly (not instant disappear)
- Canvas state doesn't need to persist between sessions

### 5.3 Ambient Sound System

**What:** Background audio that plays while using the canvas. Multiple sound options to choose from.

**Sound Options (build a variety — kids will discover what they like):**
- Lo-fi chill beats (procedural or embedded audio)
- Nature: rain, ocean waves, forest
- Ambient: drone/synth pads
- White noise / pink noise
- Silent (always an option)

**Audio-Touch Interaction:**
- **V1:** Sound and visuals are independent (coexist but don't affect each other)
- **V2 (future experiment):** Touch optionally affects pitch/tone, or triggers soft layered sounds
- This needs real-world testing with the kids — build the infrastructure to support both

**Controls:**
- Play/pause button on canvas (small, unobtrusive)
- Volume slider
- Sound selector (accessible from settings or a small music icon)
- Sound is OFF by default — must be user-initiated (browser requirement + design choice)

**Technical Notes:**
- Use Web Audio API for procedural sounds (rain, noise, drones)
- Optionally support embedded audio files for lo-fi beats
- AudioContext must be created on first user gesture (iOS Safari requirement)
- Fade in/out when switching sounds (500ms crossfade, no hard cuts)
- Pause audio on `visibilitychange` (tab hidden)

### 5.4 Personalization / Settings

**Accessible via:** small gear icon on the canvas screen (unobtrusive, corner placement)

**Per-Profile Settings:**
- **Color theme:** selection of 5-8 color palettes that affect canvas visuals, UI accents, trail colors
- **Visual mode default:** which canvas mode loads on start
- **Sound default:** which sound (if any) plays on start
- **Volume level:** persists between sessions

**Storage:** localStorage, keyed per profile (`calm-station-{profileId}-prefs`)

### 5.5 Gentle Regulation Prompt

**What:** After the child has been on the canvas for a configurable number of minutes (default: 3-5 min), a soft glowing icon pulses gently on screen — inviting them to try a breathing or grounding exercise.

**Critical Requirements:**
- **NOT a popup, banner, or text message** — it's a subtle glowing orb/icon
- Appears in a non-intrusive location (e.g. bottom corner)
- Pulses softly with a slow glow animation
- **No text until tapped** — tapping reveals a simple choice: "Breathe" or "Ground"
- Easy to ignore — if they don't tap it, it fades away after ~30 seconds
- Does not appear more than once per session
- Must NEVER feel like a directive or instruction

### 5.6 Breathing Exercise (Side Feature)

**Accessed via:** tapping the gentle prompt, or a small icon in the settings/toolbar area

**Requirements (port from existing React prototype in `reference/calm-tool-prototype.jsx`):**
- 3 breathing patterns:
  - Box Breathing (4-4-4-4) — "Equal rhythm, steady and predictable"
  - 4-7-8 Calm (4-7-8) — "Long exhale, slows everything down"
  - Simple Slow (5-5) — "Just in and out, nothing complicated"
- Animated breathing circle (expand on inhale, contract on exhale)
- Phase labels: "Breathe in" / "Hold" / "Breathe out"
- Cycle counter: "2 / 4"
- 4 cycles default → "Nice work" state
- **Canvas visual continues behind the exercise** (semi-transparent overlay)
- Close/back button to return to canvas at any time
- Skip link always visible

### 5.7 Grounding Exercise — 5-4-3-2-1 (Side Feature)

**Accessed via:** same as breathing — gentle prompt or toolbar icon

**Requirements (port from prototype):**
- One sense at a time:
  - 👁 See — tap 5 circles
  - ✋ Touch — tap 4 circles
  - 👂 Hear — tap 3 circles
  - 🫁 Smell — tap 2 circles
  - 👅 Taste — tap 1 circle
- Progress bar showing current sense
- Tap circles to count (toggle on/off)
- "Next sense" enables at correct count
- Close/back to canvas at any time
- Skip link always visible

### 5.8 Energy Check-In (Optional)

**When:** Before and after a breathing or grounding exercise (NOT on canvas entry)

**Requirements (port from prototype):**
- 5 energy levels:
  - Overload (red #d64550) — "Can't think straight"
  - Wired (orange #e8a838) — "Restless or tense"
  - Calm Zone (teal #48b5a0) — "Ready to think"
  - Low (light blue #6b9ac4) — "Tired or foggy"
  - Shutdown (blue #4a6fa5) — "Frozen or numb"
- Before/after comparison shown on completion
- Contextual message based on change
- Subtle — feels like a quick check, not an assessment

### 5.9 Parent Dashboard (Separate View)

**Accessed via:** a hidden gesture or URL parameter (e.g. `?parent=true` or long-press on app title)

**NOT visible to kids.** This is a separate view for the parent.

**Shows:**
- Session timestamps (when each kid used the app)
- Energy before/after for sessions where they did an exercise
- Which features they used (canvas only? breathing? grounding?)
- Session count / frequency

**Notification:**
- When a child completes a calming exercise session, send a notification to the parent
- Implementation options: browser Push API, or simple webhook to Telegram/email
- V1 can be as simple as logging to a file or endpoint the parent checks

---

## 6. Information Architecture

```
[Profile Select Screen]
        |
        v
[Interactive Touch Canvas] ← THIS IS HOME
   |         |         |
   |         |         |
 [gear]   [music]   [gentle prompt after ~3-5 min]
   |         |              |
   v         v              v
[Settings] [Sound      [Choose: Breathe or Ground]
            Selector]        |              |
                             v              v
                      [Energy Check-In → Breathing Exercise → Energy Check-Out → Back to Canvas]
                      [Energy Check-In → Grounding Exercise → Energy Check-Out → Back to Canvas]
```

---

## 7. Color System

**Base palette (from prototype):**
```
--bg-deep:        #0d1b2a    (page background)
--bg-card:        #152030    (card/overlay surfaces)
--border:         rgba(255,255,255,0.06)
--teal:           #48b5a0    (primary accent)
--teal-glow:      rgba(72,181,160,0.3)
--teal-dim:       rgba(72,181,160,0.1)
--text-bright:    #e0e8f0
--text-mid:       #8aa8b8
--text-dim:       #5a7a8a
--energy-red:     #d64550
--energy-orange:  #e8a838
--energy-teal:    #48b5a0
--energy-lblue:   #6b9ac4
--energy-blue:    #4a6fa5
```

**Kid-selectable color themes** (affect canvas visuals + UI accents):
- Ocean (teals + blues) — default
- Sunset (oranges + purples)
- Forest (greens + earth tones)
- Neon (bright accents on dark)
- Monochrome (whites + grays)
- Custom themes can be added later

---

## 8. Typography

- **Primary:** 'DM Sans' (Google Fonts) — clean, modern, not childish
- **Fallback:** system-ui, sans-serif
- **Weights:** 300 (display headings), 400 (body), 500 (labels), 600 (buttons)
- **Principle:** Minimal text everywhere. If you need a paragraph, you've written too much.

---

## 9. Technical Architecture

### Platform
- Web app (HTML/CSS/JS)
- Hosted on Vercel, Netlify, or GitHub Pages
- Optimized for iPad/tablet Safari and Chrome
- PWA features: home screen installable, offline capable

### Stack
- Vanilla JavaScript (no framework for V1 — keep it simple and fast)
- HTML5 Canvas for visual effects
- Web Audio API for procedural sound generation
- localStorage for profiles, preferences, session data
- Optional: service worker for offline support

### Performance Targets
- 60fps canvas rendering on iPad
- First contentful paint < 1 second
- No external dependencies that block loading
- Total page weight < 500KB (excluding optional audio files)

### Hosting
- Static site deployment (Vercel/Netlify/GitHub Pages)
- Single page application (all in one HTML file, or minimal file structure)
- No backend needed for V1 (all data in localStorage)
- Parent notifications: V1 can use a simple webhook or be deferred to V2

---

## 10. MVP Definition (What to Ship First)

### MVP (get it in their hands ASAP):
- [ ] Profile selection screen (2 profiles, name + color theme)
- [ ] Interactive touch canvas with 2-3 visual modes (finger trails, particles, ripples)
- [ ] Double-tap to switch modes, pinch to zoom, clear button
- [ ] 1-2 ambient sound options (procedural: rain + drone)
- [ ] Sound controls (play/pause, volume)
- [ ] Color theme selection (3 themes minimum)
- [ ] Deployed and accessible on iPad

### V1.1 (add after kids have used MVP):
- [ ] Remaining visual modes (geometric patterns, freeform drawing)
- [ ] More sound options (ocean, white noise, lo-fi)
- [ ] Gentle glowing prompt after 3-5 minutes
- [ ] Breathing exercise (ported from prototype)
- [ ] Grounding exercise (ported from prototype)

### V1.2 (add based on what works):
- [ ] Energy check-in before/after exercises
- [ ] Session logging to localStorage
- [ ] Parent dashboard (separate view)
- [ ] Parent notifications
- [ ] Before/after comparison on exercise completion

### V2 (future):
- [ ] Audio-touch interaction experiments
- [ ] Screenshot/save canvas art
- [ ] Shake to scatter particles
- [ ] Points / unlockables system
- [ ] Streak tracking
- [ ] Separate app for TSG 4 skills & roles

---

## 11. Success Metrics

**Week 1:** Do they open it voluntarily at least once without being asked?
**Week 2:** Do they return to it? How many sessions?
**Month 1:** Have they tried the breathing or grounding exercise at least once?
**Month 2:** Do they use it when dysregulated without being prompted?

The ultimate success: they reach for this app instead of (or before) YouTube when they're overwhelmed.

---

## 12. Open Questions (for Claude Code Plan Mode to address)

1. **Canvas performance:** What's the optimal particle count / effect complexity for iPad?
2. **Procedural audio:** Best Web Audio API patterns for lo-fi beats vs just nature sounds?
3. **File structure:** Single HTML file vs. small multi-file structure for Vercel deployment?
4. **Service worker:** Worth the complexity for V1, or defer offline support?
5. **Parent notifications:** Simplest implementation — Push API, Telegram webhook, or defer?
6. **Touch-audio interaction:** Architecture to support this in V2 without rewriting audio system?

---

## 13. Reference Files

Located in `reference/` directory:
- `calm-tool-prototype.jsx` — Working React prototype with breathing, grounding, energy check-in flows. **Port the interaction logic, not the framework.**
- `calm-down-card.pdf` — Printable companion card (same 4-step flow)
- `create-card.py` — PDF generation script (update if design changes)

---

## Appendix A: Complete Interview Responses

### Round 1 — Kids' Needs
- **Escalation triggers:** Being told what to do (any directive language)
- **Would they open it voluntarily today:** No — they'd never open it themselves right now
- **Current self-regulation:** Music/headphones, screens/YouTube/gaming, art

### Round 2 — Engagement Strategy
- **Introduction approach:** During a calm moment, show it casually
- **Hooks that could work:** Creative/art tool feel, earning points/unlocking things, customization (their own space), genuinely useful/calming experience, touch-responsive screen with chill music that responds and alters to touch — patterns that change and grow
- **Both kids:** Very similar needs and triggers

### Round 3 — Experience & TSG
- **Canvas relationship:** The interactive touch canvas IS the main screen (breathing/grounding are side features)
- **TSG integration:** Keep this as calming tool only — develop a separate approach for 4 skills and roles
- **Personalization priorities:** Own color theme, different visual styles, each kid gets their own profile/space

### Round 4 — Canvas & Sound
- **Touch effects:** All selected — finger trails, particles, ripples, geometric patterns, freeform drawing (make them switchable modes)
- **Music/sound preference:** Don't know — build a variety and let them discover
- **Touch affecting sound:** Not sure — need to test with them

### Round 5 — Practical & Parent
- **Primary device:** iPad/tablet
- **Parent visibility:** Timestamps, energy before/after, notification on session completion
- **Product scope:** Just solve my problem first

### Round 6 — Technical & Access
- **Exercise access:** Gentle prompt that appears after a few minutes on canvas
- **Technical preference:** Simple web app hosted on Vercel/Netlify/GitHub Pages
- **Timeline:** Build iteratively — MVP fast, improve over time

### Round 7 — Profiles & Interactions
- **Profile switching:** Tap name/avatar on simple start screen
- **Gentle prompt style:** Soft glowing icon that pulses gently after a few minutes
- **Canvas interactions:** Clear/reset button, pinch to zoom, double-tap to change visual mode
