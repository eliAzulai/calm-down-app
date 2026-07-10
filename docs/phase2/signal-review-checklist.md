# Phase 2 Signal Review Checklist

Use this with the hidden developer view at `?dev=true` and exported JSON. The goal is to decide the next deliberate tuning change, not to maximize engagement.

## Before Reviewing

- Confirm kid-facing screens showed no analytics or developer UI.
- Confirm the session was casual and not directed as a task.
- Keep human observation notes open beside the signal summary.
- Review per profile, not as one combined child average.

## Session-Level Questions

- How many canvas sessions were recorded?
- Average session duration:
- Median session duration:
- Did the session end naturally, by navigation, or by interruption?
- Was there enough interaction to treat the session as meaningful?

## Visual Mode Signals

| Question | Signal | Decision Use |
| --- | --- | --- |
| Which mode got most time? | `modeTime`, `topMode` | Candidate default mode. |
| Which modes were switched away from quickly? | `mode_start`, `mode_end`, short durations | Candidate for lower order or tuning. |
| Did the child cycle repeatedly? | `mode_cycle` count | May indicate exploration or searching. |
| Did clear happen often? | `clear_canvas` count | Could mean satisfying reset or visual clutter. |
| Did touch activity stay high? | `canvas_touch` batches | Indicates active engagement, not necessarily calm. |

## Sound Signals

| Question | Signal | Decision Use |
| --- | --- | --- |
| Was sound turned on? | `sound_select` | Sound may be part of the draw. |
| Which sound was selected most? | `sound_select.soundId` | Candidate default or tuning focus. |
| Was sound stopped quickly? | `sound_stop` soon after `sound_select` | Possible annoyance or wrong texture. |
| Was volume changed? | `volume_change` | Candidate default volume adjustment. |
| Was final state sound on or off? | final context | Distinguish preference from experimentation. |

## Prompt and Exercise Signals

| Question | Signal | Decision Use |
| --- | --- | --- |
| Was the prompt shown? | `prompt_shown` | Confirms timing path. |
| Was it opened, ignored, or dismissed? | `prompt_opened`, `prompt_ignored` | Tune delay or disable temporarily. |
| Which exercise was chosen? | `exercise_choice` | Preference signal only, not compliance score. |
| Was exercise completed? | `exercise_completed` | Flow may be acceptable. |
| Was exercise closed early? | `exercise_closed` | Check friction or timing. |

## Review Rules

- Do not change more than one default after a single session.
- Do not infer preference from one accidental tap.
- Do not treat exercise completion as the main success metric.
- Do not auto-personalize during Phase 2.
- Prefer developer-guided defaults after repeated evidence.
- Keep silence as a valid preference.

## Decision Record

- Profile:
- Evidence reviewed:
- Human observation agrees with signals: yes / no / unclear
- Decision:
- One change to test:
- Developer control/default affected:
- Required proof for next session:
- Revert condition:
