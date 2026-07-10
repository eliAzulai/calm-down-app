# Preference Signals + Developer Control Loop Design

## Purpose

Calm Station needs a way to learn what actually works for each child during development without turning the kid-facing app into a survey, dashboard, or adaptive system too early.

The first version of this loop records natural usage signals locally, summarizes them for developer review, and lets the developer make controlled changes in future app iterations. Later versions can use the same signal layer for per-profile personalization, but only after the patterns are trusted.

## Goals

- Record what each profile naturally uses, ignores, repeats, or leaves.
- Keep all observation invisible to the kids.
- Keep the data local-first and easy for the developer to inspect or export.
- Prefer signals that measure voluntary use, not maximum engagement.
- Support future per-child defaults without introducing automatic behavior in v1.

## Non-Goals

- No kid-facing analytics, ratings, surveys, or preference screens.
- No automatic personalization in the first implementation.
- No remote analytics service in the first implementation.
- No session replay, screenshots, or detailed behavioral surveillance.
- No parent-facing tuning controls for this feature. The review and control surface is for the developer.

## Product Principle

The app should learn quietly, but it should not become unpredictable.

For neurodivergent kids, sudden changes can make the app feel less safe. The v1 loop should therefore observe and summarize. Any actual app changes should happen through deliberate developer decisions, code/config updates, or explicitly enabled feature flags.

## Signals To Record

Record compact events with timestamps, profile id, and a short payload. Keep payloads simple so localStorage remains readable and exportable.

Core session events:

- `session_start`: profile enters the canvas.
- `session_end`: profile leaves the canvas or page becomes hidden for long enough to count as exit.
- `canvas_touch`: coarse touch activity count, batched by time window.
- `clear_canvas`: clear button tapped.

Mode events:

- `mode_start`: current visual mode becomes active.
- `mode_end`: active visual mode changes or session ends.
- `mode_cycle`: double-tap cycles to another mode.

Sound events:

- `sound_panel_open`: sound panel opened.
- `sound_select`: sound selected.
- `sound_stop`: sound turned off.
- `volume_change`: volume changed, debounced so slider movement does not flood storage.

Prompt and exercise events:

- `prompt_shown`: gentle orb appears.
- `prompt_ignored`: orb fades without tap.
- `prompt_opened`: orb tapped.
- `exercise_choice`: breathe or ground selected.
- `exercise_started`: exercise begins after energy check-in.
- `exercise_completed`: check-out completed.
- `exercise_closed`: exercise dismissed before completion.

Profile context:

- Current theme.
- Current mode.
- Current sound id and whether sound is playing.
- Session duration.

## Storage Design

Use per-profile localStorage keys:

- `calm-station-{profileId}-signals`: capped raw event log.
- `calm-station-{profileId}-signal-summary`: computed summary cache.
- `calm-station-dev-controls`: hidden developer configuration for experiments and defaults.

The raw log should be capped by count and age, for example last 500 events or last 30 days. Summaries can be recomputed from raw events when the developer surface opens, then cached for faster display.

All reads and writes follow the existing localStorage pattern: `try/catch`, silent fallback, no hard dependency on storage availability.

## Summary Metrics

Developer review should answer practical product questions:

- Which mode gets the most time per child?
- Which mode gets the most repeat visits?
- Which modes are quickly abandoned?
- Are sounds used, ignored, or turned off quickly?
- Which sound is selected most often?
- Do longer sessions correlate with a theme, mode, or sound?
- Is the gentle prompt tapped, ignored, or dismissed?
- Which exercise is chosen when the prompt is tapped?
- Are exercises completed or closed early?

Recommended summary fields:

- Total canvas sessions.
- Average and median session duration.
- Total time by visual mode.
- Mode switch count per session.
- Clear count per session.
- Sound-on session percentage.
- Time by sound.
- Most common final sound state: sound on or off.
- Prompt shown/tapped/ignored rates.
- Exercise start and completion counts.

## Developer Review Surface

This should not be part of the existing parent dashboard language. For v1, use a hidden developer surface with:

- URL flag: `?dev=true`
- Console-accessible export function: `window.CalmStationDev.exportSignals()`

Do not add an iPad gesture for the developer surface in v1. The URL flag is explicit enough and keeps access separate from the kid-facing flow.

The first useful surface can be minimal:

- Per-profile summary cards.
- Top mode, top sound, sound-off tendency, prompt response rate.
- Recent raw events in a compact table.
- Export JSON button.
- Reset signal data button behind a confirmation.

This surface is for app development decisions, not child monitoring. Copy should avoid clinical or judgmental language.

## Developer Controls

In v1, controls should exist as configuration values rather than automatic personalization:

- Default mode override per profile.
- Default sound override per profile.
- Sound autoplay preference remains constrained by browser gesture requirements.
- Gentle prompt delay per profile.
- Gentle prompt enabled/disabled per profile.
- Experiment label per profile, such as `prompt-delay-5min` or `default-ripples`.

Controls can be read from `calm-station-dev-controls` at profile entry. This allows controlled experiments while keeping the child-facing app unchanged except for the behavior being tested.

## Evolution Path

### V1: Observe and Export

Record signals, summarize locally, and export data for developer review. No automatic adaptation.

### V2: Developer-Guided Defaults

Use observed patterns to set explicit per-profile defaults through hidden dev controls. Example: Child A starts in Ripples because repeated sessions show they stay longest there.

### V3: Cautious Auto-Personalization

Only after stable evidence, allow the app to update gentle defaults automatically. Any auto-change should be slow, reversible, and limited to defaults such as mode order, prompt timing, and sound suggestions. Avoid sudden visual or behavioral changes mid-session.

## Implementation Boundaries

Keep the implementation small and aligned with the existing vanilla JS architecture:

- Add a signal tracker module section inside `src/app.js`.
- Hook existing functions rather than introducing a framework.
- Add summary rendering to a separate developer view or compact overlay.
- Avoid changing core canvas rendering behavior for v1.
- Add tests as standalone Playwright scripts, matching the existing phase tests.

If `src/app.js` becomes difficult to work in, a later refactor can split analytics helpers into a separate file. That refactor is not required for the first version.

## Testing Strategy

Automated checks:

- Profile entry records `session_start`.
- Mode cycling records mode events and updates time totals.
- Sound select/stop records sound events.
- Prompt shown/tapped/ignored paths record the correct events.
- Exercise completion still records the existing session log and also records signal events.
- Developer export returns valid JSON.
- Raw event log caps itself.

Manual checks:

- Kid-facing screens show no analytics UI.
- Developer view is only available through the hidden access path.
- localStorage data remains readable and does not grow quickly during touch-heavy canvas use.
- Existing phase tests continue to pass.

## Privacy and Ethics

This feature should help the developer improve the app, not measure the children as a performance target.

Avoid invasive capture. Do not record touch coordinates, screenshots, typed text, microphone data, or detailed session replay. Prefer aggregate behavior signals that answer whether the app feels inviting, calming, and voluntarily reusable.

## V1 Implementation Choices

- The developer surface opens with `?dev=true`.
- JSON export is enough for the first implementation.
- Developer controls live in `calm-station-dev-controls` in localStorage for v1.
- A console export helper, `window.CalmStationDev.exportSignals()`, is useful but secondary to the `?dev=true` surface.
