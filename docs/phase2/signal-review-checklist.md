# Phase 2 Hidden Signal Review Checklist

Use this with the hidden developer surface (`?dev=true`) or exported signal JSON. The goal is to guide careful product tuning, not to score the child or create kid-visible personalization.

## Review Setup

- Date:
- Reviewer:
- Profile:
- Signal source:
  - [ ] `?dev=true` summary
  - [ ] `window.CalmStationDev.exportSignals()`
  - [ ] Local exported JSON
- Observation note reviewed:
  - [ ] Yes
  - [ ] No

## Boundaries

- [ ] Signals stayed local-first and developer-facing.
- [ ] No kid-facing analytics, ratings, surveys, or preference settings were added.
- [ ] No automatic personalization decision was made from a single session.
- [ ] Any tuning decision is small, reversible, and deliberate.

## Canvas Signals

- Top mode by time:
- Top mode by repeat visits:
- Quick abandons:
- Mode switches per session:
- Clear/reset tendency:
- Touch activity notes:
- Candidate interpretation:

## Sound Signals

- Sound on/off tendency:
- Selected sound most often:
- Sounds sampled then stopped:
- Sound panel opened without selection:
- Final sound state:
  - [ ] Sound on
  - [ ] Sound off
  - [ ] Mixed
- Candidate interpretation:

## Prompt And Exercise Signals

- Prompt shown:
- Prompt opened:
- Prompt ignored:
- Exercise started:
- Exercise completed:
- Exercise closed:
- Exercise chosen most:
  - [ ] Breathe
  - [ ] Ground
  - [ ] Mixed
  - [ ] None
- Candidate interpretation:

## Cross-Check

- Does the signal match the observation note?
  - [ ] Yes
  - [ ] Partly
  - [ ] No
- If not, what might explain the mismatch:
- Is there enough evidence for a tuning change?
  - [ ] Yes, make one small change
  - [ ] No, observe another session
  - [ ] No, keep current behavior

## Tuning Decision

- Chosen change:
- Source evidence:
- Expected effect:
- Reversal condition:
- Follow-up review date:
