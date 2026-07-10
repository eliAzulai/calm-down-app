# Preference Signals Control Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden developer feedback loop that records local-only per-profile usage signals, summarizes them, and exposes them through `?dev=true` without changing the kid-facing experience.

**Architecture:** Keep the existing vanilla JS, no-build structure. Add a self-contained signal tracker section to `src/app.js`, a hidden developer screen to `src/index.html`, developer-only styles to `src/styles.css`, and a standalone Playwright test at `tests/phase9-test.mjs`.

**Tech Stack:** Vanilla JavaScript, localStorage, HTML/CSS, Playwright standalone scripts, `npx http-server src -p 8080`.

---

## File Structure

- Modify `src/app.js`: add signal storage helpers, event recording, summaries, hidden developer screen rendering, export/reset helpers, and hooks into existing profile/canvas/sound/prompt/exercise functions.
- Modify `src/index.html`: add `screen-dev` after `screen-parent`, with containers for summary, recent events, controls, export, reset, and back navigation.
- Modify `src/styles.css`: add developer screen styles that are visually distinct from kid UI and parent dashboard.
- Create `tests/phase9-test.mjs`: verify hidden access, event recording, summary output, JSON export, log cap, and absence of kid-facing analytics UI.
- Modify `TODO.md`: mark Phase 9 items as complete only after implementation and tests pass.

## Task 1: Add Failing Phase 9 Test

**Files:**
- Create: `tests/phase9-test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/phase9-test.mjs` with:

```javascript
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const results = [];

function log(check, pass, detail) {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${check}${detail ? ' - ' + detail : ''}`);
  results.push({ check, pass, detail });
}

async function ensureProfile(page) {
  const filled = await page.$$('.profile-card.filled');
  if (filled.length === 0) {
    await page.click('.profile-card.empty');
    await page.waitForTimeout(300);
    await page.fill('.setup-name-input', 'SignalKid');
    await page.click('.btn-done');
    await page.waitForTimeout(300);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await ensureProfile(page);

  const kidDevScreenVisible = await page.evaluate(() =>
    document.getElementById('screen-dev')?.classList.contains('active') === true
  );
  log('Developer screen hidden during normal app load', kidDevScreenVisible === false);

  const kidAnalyticsText = await page.evaluate(() => {
    const activeScreens = Array.from(document.querySelectorAll('.screen.active'));
    return activeScreens.some(screen => screen.textContent.includes('Preference Signals'));
  });
  log('Kid-facing app does not show developer analytics copy', kidAnalyticsText === false);

  await page.click('.profile-card.filled');
  await page.waitForTimeout(700);

  const canvas = await page.$('#main-canvas');
  const box = await canvas.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);

  await page.click('#btn-sound');
  await page.waitForTimeout(200);
  await page.click('.sound-option[data-sound="rain"]');
  await page.waitForTimeout(700);
  await page.click('.sound-option[data-sound="rain"]');
  await page.waitForTimeout(300);
  await page.click('#btn-clear');
  await page.waitForTimeout(200);
  await page.click('#btn-back');
  await page.waitForTimeout(500);

  const signalSnapshot = await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('calm-station-profiles') || '[]').find(Boolean);
    const raw = localStorage.getItem('calm-station-' + profile.id + '-signals');
    return { profile, events: raw ? JSON.parse(raw) : [] };
  });

  const eventTypes = signalSnapshot.events.map(e => e.type);
  log('Session start recorded', eventTypes.includes('session_start'));
  log('Session end recorded', eventTypes.includes('session_end'));
  log('Mode cycle recorded', eventTypes.includes('mode_cycle'));
  log('Sound select recorded', eventTypes.includes('sound_select'));
  log('Sound stop recorded', eventTypes.includes('sound_stop'));
  log('Clear canvas recorded', eventTypes.includes('clear_canvas'));

  await page.goto(BASE + '/?dev=true', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const devVisible = await page.evaluate(() =>
    document.getElementById('screen-dev')?.classList.contains('active') === true
  );
  log('Developer screen opens with ?dev=true', devVisible);

  const summaryText = await page.textContent('#dev-profiles');
  log('Developer summary shows profile name', summaryText.includes('SignalKid'), summaryText.slice(0, 80));
  log('Developer summary shows mode data', summaryText.includes('Top Mode') || summaryText.includes('No mode time yet'));
  log('Developer summary shows sound data', summaryText.includes('Sound Use'));

  const exported = await page.evaluate(() => window.CalmStationDev.exportSignals());
  log('Export helper returns profiles', Array.isArray(exported.profiles) && exported.profiles.length >= 1);
  log('Export helper includes events', exported.profiles[0].events.length >= 1, `${exported.profiles[0].events.length} events`);

  const capResult = await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('calm-station-profiles') || '[]').find(Boolean);
    for (let i = 0; i < 530; i += 1) {
      window.CalmStationDev.recordTestEvent(profile.id, 'test_cap_event', { index: i });
    }
    const events = JSON.parse(localStorage.getItem('calm-station-' + profile.id + '-signals') || '[]');
    return events.length;
  });
  log('Raw signal log caps at 500 events', capResult === 500, `${capResult} events`);

  log('No browser console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close();

  const failed = results.filter(r => !r.pass);
  console.log(`\nPhase 9: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run the server in one terminal:

```bash
npx http-server src -p 8080
```

Run the test in another terminal:

```bash
node tests/phase9-test.mjs
```

Expected: FAIL because `#screen-dev` and `window.CalmStationDev` do not exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/phase9-test.mjs
git commit -m "test: add phase 9 preference signals coverage"
```

## Task 2: Add Hidden Developer Screen Markup

**Files:**
- Modify: `src/index.html`
- Test: `tests/phase9-test.mjs`

- [ ] **Step 1: Add developer screen HTML**

Insert this block after the closing `</div>` for `screen-parent` and before the splash screen:

```html
<div id="screen-dev" class="screen">
  <div class="dev-shell">
    <header class="dev-header">
      <div>
        <p class="dev-eyebrow">Developer Mode</p>
        <h2>Preference Signals</h2>
      </div>
      <button id="dev-back" aria-label="Back to profiles">Back</button>
    </header>

    <section class="dev-section">
      <div class="dev-section-header">
        <h3>Profile Summaries</h3>
        <button id="dev-export">Export JSON</button>
      </div>
      <div id="dev-profiles" class="dev-profiles"></div>
    </section>

    <section class="dev-section">
      <div class="dev-section-header">
        <h3>Developer Controls</h3>
        <button id="dev-save-controls">Save Controls</button>
      </div>
      <div id="dev-controls" class="dev-controls"></div>
      <p id="dev-status" class="dev-status" aria-live="polite"></p>
    </section>

    <section class="dev-section">
      <div class="dev-section-header">
        <h3>Recent Events</h3>
        <button id="dev-reset">Reset Signals</button>
      </div>
      <div id="dev-events" class="dev-events"></div>
    </section>
  </div>
</div>
```

- [ ] **Step 2: Run Phase 9 test**

```bash
node tests/phase9-test.mjs
```

Expected: still FAIL because the screen is not activated by `?dev=true` and signal helpers are missing.

- [ ] **Step 3: Commit markup**

```bash
git add src/index.html
git commit -m "feat: add hidden developer screen markup"
```

## Task 3: Add Developer Screen Styles

**Files:**
- Modify: `src/styles.css`
- Test: `tests/phase9-test.mjs`

- [ ] **Step 1: Add developer styles**

Append this section before the mobile media queries:

```css
/* --- Developer Feedback Screen --- */

#screen-dev {
  background: #10131a;
  color: #e7edf3;
  overflow-y: auto;
  padding: calc(24px + env(safe-area-inset-top)) 20px calc(32px + env(safe-area-inset-bottom));
}

.dev-shell {
  width: min(960px, 100%);
  margin: 0 auto;
}

.dev-header,
.dev-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.dev-header {
  margin-bottom: 24px;
}

.dev-eyebrow {
  margin: 0 0 4px;
  color: #8fa7b8;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.dev-header h2,
.dev-section h3 {
  margin: 0;
  letter-spacing: 0;
}

.dev-header h2 {
  font-size: 1.75rem;
}

#dev-back,
#dev-export,
#dev-save-controls,
#dev-reset {
  min-height: 48px;
  border: 1px solid rgba(143, 167, 184, 0.28);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #e7edf3;
  padding: 0 14px;
  font: inherit;
}

#dev-reset {
  color: #ffb4a8;
}

.dev-section {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid rgba(143, 167, 184, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.dev-profiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.dev-profile-card,
.dev-control-card {
  border: 1px solid rgba(143, 167, 184, 0.18);
  border-radius: 8px;
  background: rgba(9, 14, 20, 0.72);
  padding: 14px;
}

.dev-profile-card h4,
.dev-control-card h4 {
  margin: 0 0 10px;
  font-size: 1rem;
}

.dev-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dev-stat {
  min-height: 58px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
}

.dev-stat-value {
  display: block;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.95rem;
}

.dev-stat-label {
  display: block;
  margin-top: 3px;
  color: #8fa7b8;
  font-size: 0.72rem;
}

.dev-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.dev-control-card label {
  display: block;
  margin-top: 10px;
  color: #b9c8d3;
  font-size: 0.78rem;
}

.dev-control-card select,
.dev-control-card input {
  width: 100%;
  min-height: 44px;
  margin-top: 4px;
  border: 1px solid rgba(143, 167, 184, 0.28);
  border-radius: 8px;
  background: #10131a;
  color: #e7edf3;
  padding: 0 10px;
  font: inherit;
}

.dev-status {
  min-height: 20px;
  margin: 12px 0 0;
  color: #8fa7b8;
}

.dev-events {
  margin-top: 14px;
  display: grid;
  gap: 6px;
}

.dev-event-row {
  display: grid;
  grid-template-columns: 150px 140px 1fr;
  gap: 8px;
  align-items: start;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #b9c8d3;
  font-size: 0.78rem;
}

.dev-event-type {
  color: #ffffff;
  font-weight: 700;
}
```

- [ ] **Step 2: Run Phase 9 test**

```bash
node tests/phase9-test.mjs
```

Expected: still FAIL because behavior is not implemented, but no CSS parsing errors should appear.

- [ ] **Step 3: Commit styles**

```bash
git add src/styles.css
git commit -m "style: add developer feedback screen styles"
```

## Task 4: Implement Signal Storage and Summary Helpers

**Files:**
- Modify: `src/app.js`
- Test: `tests/phase9-test.mjs`

- [ ] **Step 1: Add constants and helpers after `saveProfilePrefs`**

```javascript
var SIGNAL_LIMIT = 500;
var SIGNAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
var DEV_CONTROLS_KEY = 'calm-station-dev-controls';

function getSignalKey(profileId) {
  return 'calm-station-' + profileId + '-signals';
}

function readSignals(profileId) {
  try {
    var raw = localStorage.getItem(getSignalKey(profileId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function writeSignals(profileId, events) {
  try {
    var cutoff = Date.now() - SIGNAL_MAX_AGE_MS;
    var capped = events.filter(function(event) {
      return !event.ts || new Date(event.ts).getTime() >= cutoff;
    }).slice(-SIGNAL_LIMIT);
    localStorage.setItem(getSignalKey(profileId), JSON.stringify(capped));
  } catch (e) {
    // silent
  }
}

function getProfileById(profileId) {
  return state.profiles.find(function(profile) {
    return profile && profile.id === profileId;
  }) || null;
}

function getSignalContext(profileId) {
  var profile = getProfileById(profileId);
  return {
    theme: profile ? profile.theme : null,
    mode: MODES[state.canvasMode] || null,
    soundId: audio.currentId || null,
    soundPlaying: audio.playing === true,
  };
}

function recordSignal(type, payload) {
  if (!state.activeProfileId) return;
  recordSignalForProfile(state.activeProfileId, type, payload);
}

function recordSignalForProfile(profileId, type, payload) {
  if (!profileId || !type) return;
  var events = readSignals(profileId);
  events.push({
    id: generateId(),
    ts: new Date().toISOString(),
    type: type,
    context: getSignalContext(profileId),
    payload: payload || {},
  });
  writeSignals(profileId, events);
}
```

- [ ] **Step 2: Add summary helpers after the signal helpers**

```javascript
function secondsBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

function formatDuration(seconds) {
  if (!seconds) return '0s';
  var minutes = Math.floor(seconds / 60);
  var rest = seconds % 60;
  if (minutes === 0) return rest + 's';
  return minutes + 'm ' + rest + 's';
}

function computeSignalSummary(profileId) {
  var events = readSignals(profileId);
  var modeTime = {};
  var soundCounts = {};
  var promptShown = 0;
  var promptOpened = 0;
  var promptIgnored = 0;
  var exerciseCompleted = 0;
  var sessions = 0;
  var totalSessionSeconds = 0;
  var activeSessionStart = null;
  var activeMode = null;
  var activeModeStart = null;

  events.forEach(function(event) {
    if (event.type === 'session_start') {
      sessions += 1;
      activeSessionStart = event.ts;
    }
    if (event.type === 'session_end' && activeSessionStart) {
      totalSessionSeconds += secondsBetween(activeSessionStart, event.ts);
      activeSessionStart = null;
    }
    if (event.type === 'mode_start') {
      activeMode = event.payload.mode;
      activeModeStart = event.ts;
    }
    if (event.type === 'mode_end' && activeModeStart) {
      var mode = event.payload.mode || activeMode || 'unknown';
      modeTime[mode] = (modeTime[mode] || 0) + secondsBetween(activeModeStart, event.ts);
      activeMode = null;
      activeModeStart = null;
    }
    if (event.type === 'sound_select') {
      var soundId = event.payload.soundId || 'unknown';
      soundCounts[soundId] = (soundCounts[soundId] || 0) + 1;
    }
    if (event.type === 'sound_stop') {
      soundCounts.off = (soundCounts.off || 0) + 1;
    }
    if (event.type === 'prompt_shown') promptShown += 1;
    if (event.type === 'prompt_opened') promptOpened += 1;
    if (event.type === 'prompt_ignored') promptIgnored += 1;
    if (event.type === 'exercise_completed') exerciseCompleted += 1;
  });

  var topMode = Object.keys(modeTime).sort(function(a, b) {
    return modeTime[b] - modeTime[a];
  })[0] || null;

  var topSound = Object.keys(soundCounts).sort(function(a, b) {
    return soundCounts[b] - soundCounts[a];
  })[0] || null;

  return {
    events: events,
    sessions: sessions,
    averageSessionSeconds: sessions ? Math.round(totalSessionSeconds / sessions) : 0,
    modeTime: modeTime,
    topMode: topMode,
    topModeSeconds: topMode ? modeTime[topMode] : 0,
    topSound: topSound,
    soundCounts: soundCounts,
    promptShown: promptShown,
    promptOpened: promptOpened,
    promptIgnored: promptIgnored,
    exerciseCompleted: exerciseCompleted,
  };
}
```

- [ ] **Step 3: Run Phase 9 test**

```bash
node tests/phase9-test.mjs
```

Expected: still FAIL because hooks and developer view are not connected.

- [ ] **Step 4: Commit helpers**

```bash
git add src/app.js
git commit -m "feat: add local preference signal storage"
```

## Task 5: Hook Signals Into Canvas, Sound, Prompt, and Exercise Flow

**Files:**
- Modify: `src/app.js`
- Test: `tests/phase9-test.mjs`

- [ ] **Step 1: Add signal session state near `canvas` object**

```javascript
var signalSession = {
  active: false,
  mode: null,
  touchCount: 0,
  touchTimer: null,
};
```

- [ ] **Step 2: Add lifecycle helpers after `showModeIndicator`**

```javascript
function startSignalSession() {
  if (!state.activeProfileId || signalSession.active) return;
  signalSession.active = true;
  signalSession.mode = MODES[state.canvasMode];
  signalSession.touchCount = 0;
  recordSignal('session_start', {});
  recordSignal('mode_start', { mode: signalSession.mode });
}

function endSignalSession() {
  if (!state.activeProfileId || !signalSession.active) return;
  flushTouchSignals();
  recordSignal('mode_end', { mode: signalSession.mode });
  recordSignal('session_end', {});
  signalSession.active = false;
  signalSession.mode = null;
}

function recordModeChange(previousMode, nextMode) {
  recordSignal('mode_end', { mode: previousMode });
  recordSignal('mode_cycle', { from: previousMode, to: nextMode });
  recordSignal('mode_start', { mode: nextMode });
  signalSession.mode = nextMode;
}

function queueTouchSignal() {
  if (!signalSession.active) return;
  signalSession.touchCount += 1;
  clearTimeout(signalSession.touchTimer);
  signalSession.touchTimer = setTimeout(flushTouchSignals, 2000);
}

function flushTouchSignals() {
  if (!signalSession.touchCount) return;
  recordSignal('canvas_touch', { count: signalSession.touchCount });
  signalSession.touchCount = 0;
}
```

- [ ] **Step 3: Hook profile entry and exit**

In `enterProfile(profile)`, after `showModeIndicator();`, add:

```javascript
  startSignalSession();
```

In `backToProfiles()`, before `stopCanvas();`, add:

```javascript
  endSignalSession();
```

- [ ] **Step 4: Hook mode cycling, touch, and clear**

At the start of `cycleMode()`, replace the direct state update with:

```javascript
  var previousMode = MODES[state.canvasMode];
  state.canvasMode = (state.canvasMode + 1) % MODES.length;
  var nextMode = MODES[state.canvasMode];
  recordModeChange(previousMode, nextMode);
```

In pointer handlers where touch movement is accepted, call:

```javascript
  queueTouchSignal();
```

Use the handler that already updates active touches so the event is coarse and batched.

In the clear button listener, before clearing arrays, add:

```javascript
  recordSignal('clear_canvas', { mode: MODES[state.canvasMode] });
```

- [ ] **Step 5: Hook sound behavior**

In `$btnSound` click handler, after opening state is toggled, add:

```javascript
  if (soundPanelOpen) recordSignal('sound_panel_open', {});
```

In `playSound(soundId)`, inside the same-sound toggle branch before `saveSoundPrefs();`, add:

```javascript
    recordSignal('sound_stop', { soundId: soundId });
```

In `playSound(soundId)`, after `audio.playing = true;`, add:

```javascript
  recordSignal('sound_select', { soundId: soundId });
```

Add a debounced volume recorder near `setVolume`:

```javascript
var volumeSignalTimer = null;

function recordVolumeChange(val) {
  clearTimeout(volumeSignalTimer);
  volumeSignalTimer = setTimeout(function() {
    recordSignal('volume_change', { volume: val });
  }, 500);
}
```

In `setVolume(val)`, before `saveSoundPrefs();`, add:

```javascript
  recordVolumeChange(val);
```

- [ ] **Step 6: Hook prompt and exercise behavior**

In `showGentleOrb()`, after `$gentleOrb.classList.add('visible');`, add:

```javascript
  recordSignal('prompt_shown', {});
```

Replace the prompt fade timer with:

```javascript
  gentlePrompt.fadeTimer = setTimeout(function() {
    recordSignal('prompt_ignored', {});
    hideGentleOrb();
  }, 30000);
```

In `$gentleOrb` click handler when opening the choice, add:

```javascript
    recordSignal('prompt_opened', {});
```

In the prompt choice handler, after setting `exerciseFlow.exerciseType`, add:

```javascript
  recordSignal('exercise_choice', { exerciseType: exerciseFlow.exerciseType });
```

When the exercise starts after check-in, add:

```javascript
  recordSignal('exercise_started', { exerciseType: exerciseFlow.exerciseType });
```

In `logSession()`, after saving the session and before parent notification, add:

```javascript
  recordSignal('exercise_completed', {
    exerciseType: exerciseFlow.exerciseType,
    energyBefore: exerciseFlow.energyBefore,
    energyAfter: exerciseFlow.energyAfter,
  });
```

In `closeExerciseFlow()`, before clearing fields, add:

```javascript
  if (exerciseFlow.exerciseType) {
    recordSignal('exercise_closed', { exerciseType: exerciseFlow.exerciseType });
  }
```

- [ ] **Step 7: Run Phase 9 test**

```bash
node tests/phase9-test.mjs
```

Expected: still FAIL because developer view/export helpers are not implemented, but raw localStorage event checks should pass.

- [ ] **Step 8: Commit hooks**

```bash
git add src/app.js
git commit -m "feat: record preference signals from app behavior"
```

## Task 6: Implement Developer View, Export, Reset, and Controls

**Files:**
- Modify: `src/app.js`
- Test: `tests/phase9-test.mjs`

- [ ] **Step 1: Add developer DOM references near parent dashboard references**

```javascript
var $screenDev = document.getElementById('screen-dev');
var $devBack = document.getElementById('dev-back');
var $devProfiles = document.getElementById('dev-profiles');
var $devControls = document.getElementById('dev-controls');
var $devEvents = document.getElementById('dev-events');
var $devExport = document.getElementById('dev-export');
var $devReset = document.getElementById('dev-reset');
var $devSaveControls = document.getElementById('dev-save-controls');
var $devStatus = document.getElementById('dev-status');
```

- [ ] **Step 2: Add dev control helpers**

```javascript
function getDevControls() {
  try {
    var raw = localStorage.getItem(DEV_CONTROLS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveDevControls(controls) {
  try {
    localStorage.setItem(DEV_CONTROLS_KEY, JSON.stringify(controls));
  } catch (e) {
    // silent
  }
}

function getProfileDevControl(profileId) {
  var controls = getDevControls();
  return controls[profileId] || {};
}
```

- [ ] **Step 3: Apply dev controls in `enterProfile(profile)`**

Before `state.canvasMode = 0;`, add:

```javascript
  var devControl = getProfileDevControl(profile.id);
  var defaultModeIndex = MODES.indexOf(devControl.defaultMode);
```

Replace `state.canvasMode = 0;` with:

```javascript
  state.canvasMode = defaultModeIndex >= 0 ? defaultModeIndex : 0;
```

In `startGentlePromptTimer()`, before choosing the random delay, add:

```javascript
  var devControl = state.activeProfileId ? getProfileDevControl(state.activeProfileId) : {};
  if (devControl.promptEnabled === false) return;
  if (devControl.promptDelaySeconds) {
    gentlePrompt.timer = setTimeout(showGentleOrb, devControl.promptDelaySeconds * 1000);
    return;
  }
```

- [ ] **Step 4: Add developer rendering helpers**

```javascript
function openDevDashboard() {
  state.screen = 'dev';
  $screenProfiles.classList.remove('active');
  $screenCanvas.classList.remove('active');
  $screenParent.classList.remove('active');
  $screenDev.classList.add('active');
  $ambientCanvas.classList.add('hidden');
  renderDevDashboard();
}

function closeDevDashboard() {
  state.screen = 'profiles';
  $screenDev.classList.remove('active');
  $screenProfiles.classList.add('active');
  $ambientCanvas.classList.remove('hidden');
}

function renderDevDashboard() {
  renderDevProfiles();
  renderDevControls();
  renderDevEvents();
}

function renderDevProfiles() {
  $devProfiles.textContent = '';
  state.profiles.forEach(function(profile) {
    if (!profile) return;
    var summary = computeSignalSummary(profile.id);
    var card = document.createElement('div');
    card.className = 'dev-profile-card';
    card.innerHTML =
      '<h4>' + escapeHTML(profile.name) + '</h4>' +
      '<div class="dev-stat-grid">' +
      devStat(summary.sessions, 'Sessions') +
      devStat(formatDuration(summary.averageSessionSeconds), 'Avg Session') +
      devStat(summary.topMode ? MODE_LABELS[summary.topMode] || summary.topMode : 'No mode time yet', 'Top Mode') +
      devStat(formatDuration(summary.topModeSeconds), 'Top Mode Time') +
      devStat(summary.topSound || 'None yet', 'Sound Use') +
      devStat(summary.promptOpened + ' / ' + summary.promptShown, 'Prompt Opens') +
      '</div>';
    $devProfiles.appendChild(card);
  });
}

function devStat(value, label) {
  return '<div class="dev-stat"><span class="dev-stat-value">' +
    escapeHTML(String(value)) +
    '</span><span class="dev-stat-label">' +
    escapeHTML(label) +
    '</span></div>';
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}
```

- [ ] **Step 5: Add controls and recent event rendering**

```javascript
function renderDevControls() {
  var controls = getDevControls();
  $devControls.textContent = '';
  state.profiles.forEach(function(profile) {
    if (!profile) return;
    var profileControls = controls[profile.id] || {};
    var card = document.createElement('div');
    card.className = 'dev-control-card';
    card.dataset.profileId = profile.id;
    card.innerHTML =
      '<h4>' + escapeHTML(profile.name) + '</h4>' +
      '<label>Default mode<select data-control="defaultMode">' +
      '<option value="">App default</option>' +
      MODES.map(function(mode) {
        return '<option value="' + mode + '"' + (profileControls.defaultMode === mode ? ' selected' : '') + '>' +
          escapeHTML(MODE_LABELS[mode]) +
          '</option>';
      }).join('') +
      '</select></label>' +
      '<label>Prompt delay seconds<input data-control="promptDelaySeconds" type="number" min="30" max="900" value="' +
      escapeHTML(profileControls.promptDelaySeconds || '') +
      '"></label>' +
      '<label>Prompt enabled<select data-control="promptEnabled">' +
      '<option value="true"' + (profileControls.promptEnabled === false ? '' : ' selected') + '>Enabled</option>' +
      '<option value="false"' + (profileControls.promptEnabled === false ? ' selected' : '') + '>Disabled</option>' +
      '</select></label>' +
      '<label>Experiment label<input data-control="experimentLabel" value="' +
      escapeHTML(profileControls.experimentLabel || '') +
      '"></label>';
    $devControls.appendChild(card);
  });
}

function renderDevEvents() {
  var rows = [];
  state.profiles.forEach(function(profile) {
    if (!profile) return;
    readSignals(profile.id).slice(-12).forEach(function(event) {
      rows.push({ profile: profile.name, event: event });
    });
  });
  rows.sort(function(a, b) {
    return new Date(b.event.ts).getTime() - new Date(a.event.ts).getTime();
  });
  $devEvents.textContent = '';
  rows.slice(0, 24).forEach(function(row) {
    var el = document.createElement('div');
    el.className = 'dev-event-row';
    el.innerHTML =
      '<span>' + escapeHTML(formatSessionDate(row.event.ts)) + '</span>' +
      '<span>' + escapeHTML(row.profile) + '</span>' +
      '<span><span class="dev-event-type">' + escapeHTML(row.event.type) + '</span> ' +
      escapeHTML(JSON.stringify(row.event.payload || {})) + '</span>';
    $devEvents.appendChild(el);
  });
}
```

- [ ] **Step 6: Add export, reset, save, and URL access**

```javascript
function exportSignalData() {
  return {
    exportedAt: new Date().toISOString(),
    profiles: state.profiles.filter(Boolean).map(function(profile) {
      return {
        id: profile.id,
        name: profile.name,
        theme: profile.theme,
        summary: computeSignalSummary(profile.id),
        events: readSignals(profile.id),
      };
    }),
  };
}

function saveControlsFromUI() {
  var controls = {};
  $devControls.querySelectorAll('.dev-control-card').forEach(function(card) {
    var profileId = card.dataset.profileId;
    var promptDelay = parseInt(card.querySelector('[data-control="promptDelaySeconds"]').value, 10);
    controls[profileId] = {
      defaultMode: card.querySelector('[data-control="defaultMode"]').value || '',
      promptDelaySeconds: Number.isFinite(promptDelay) ? promptDelay : null,
      promptEnabled: card.querySelector('[data-control="promptEnabled"]').value !== 'false',
      experimentLabel: card.querySelector('[data-control="experimentLabel"]').value.trim(),
    };
  });
  saveDevControls(controls);
  $devStatus.textContent = 'Saved developer controls.';
}

window.CalmStationDev = {
  exportSignals: exportSignalData,
  recordTestEvent: function(profileId, type, payload) {
    recordSignalForProfile(profileId, type, payload);
  },
  resetSignals: function() {
    state.profiles.forEach(function(profile) {
      if (profile) localStorage.removeItem(getSignalKey(profile.id));
    });
  },
};

$devBack.addEventListener('click', closeDevDashboard);
$devSaveControls.addEventListener('click', saveControlsFromUI);
$devExport.addEventListener('click', function() {
  var data = exportSignalData();
  $devStatus.textContent = JSON.stringify(data);
});
$devReset.addEventListener('click', function() {
  window.CalmStationDev.resetSignals();
  renderDevDashboard();
  $devStatus.textContent = 'Signal data reset.';
});
```

In the existing startup URL param check, add:

```javascript
  if (params.get('dev') === 'true') {
    setTimeout(openDevDashboard, 100);
  }
```

- [ ] **Step 7: Run Phase 9 test**

```bash
node tests/phase9-test.mjs
```

Expected: PASS for Phase 9 checks.

- [ ] **Step 8: Commit developer surface**

```bash
git add src/app.js
git commit -m "feat: add hidden developer signal dashboard"
```

## Task 7: Full Verification and Roadmap Update

**Files:**
- Modify: `TODO.md`
- Test: `tests/phase1-test.mjs` through `tests/phase9-test.mjs`

- [ ] **Step 1: Run all existing phase tests**

With the server running:

```bash
npx http-server src -p 8080
```

Run:

```bash
node tests/phase1-test.mjs
node tests/phase2-test.mjs
node tests/phase3-test.mjs
node tests/phase4-test.mjs
node tests/phase5-test.mjs
node tests/phase6-test.mjs
node tests/phase7-test.mjs
node tests/phase8-test.mjs
node tests/phase9-test.mjs
```

Expected: each script exits `0` and prints PASS for every check. Investigate any FAIL before updating TODO.

- [ ] **Step 2: Manually verify kid-facing UI**

Open:

```text
http://localhost:8080
```

Expected:

- No developer screen is visible.
- No text containing `Preference Signals`, `Developer Mode`, or `Export JSON` appears.
- Profile entry still goes directly to the canvas.
- Sound and mode controls behave as before.

- [ ] **Step 3: Manually verify hidden developer UI**

Open:

```text
http://localhost:8080/?dev=true
```

Expected:

- Developer screen opens.
- Profile summaries render.
- Recent events render after using the app.
- Export JSON button produces readable JSON in the status area.
- Reset Signals clears recent events.

- [ ] **Step 4: Update TODO Phase 9 checkboxes**

Change each Phase 9 checkbox in `TODO.md` from `[ ]` to `[x]` after all verification passes.

- [ ] **Step 5: Commit completion**

```bash
git add TODO.md src/index.html src/styles.css src/app.js tests/phase9-test.mjs
git commit -m "feat: complete developer feedback loop"
```

## Self-Review

- Spec coverage: V1 signal tracking, capped local storage, summaries, `?dev=true`, JSON export, developer controls, and kid-facing invisibility are covered.
- Scope: Remote analytics, automatic personalization, session replay, and parent-facing controls are intentionally excluded.
- Test coverage: Phase 9 validates event recording, hidden developer access, summaries, export helper, log cap, and no kid-facing analytics copy.
- Type consistency: Event names match the design spec and test assertions: `session_start`, `session_end`, `mode_cycle`, `sound_select`, `sound_stop`, `clear_canvas`.
