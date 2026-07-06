# Animation Sensory Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven demo-validated animation modes (Currents, Orbits, Mandala, Bloom, Morph, Echo, Etch) into the real app with kid-facing smart controls (Mood / Character / Size / Trace), a mode tray, ghost-trail eradication across all twelve modes, and audio-reactive coupling.

**Architecture:** The validated implementations in `reference/vis-variants/*.js` port verbatim into `src/modes/<id>.js` (classic script tags — no bundler). A thin `src/modes/registry.js` adapts their demo contract (`init/pointer/tick/idle/controls/applyControl`) to the app; `app.js` gains dispatch hooks, two tray UIs (mode picker + style controls), per-profile control persistence, `mode_control` signals, and an AnalyserNode energy feed. Spec deltas (Echo soft edges, size/trace controls, trail eradication) land as focused edits on the ported files.

**Tech Stack:** Vanilla JS (var + function declarations, IIFE modules), Web Audio AnalyserNode, Playwright standalone tests, service-worker precache v3.

**Spec:** `docs/superpowers/specs/2026-07-06-animation-sensory-pass-design.md`
**Reference implementations (validated, in-repo):** `reference/vis-variants/{currents,orbits,mandala,bloom,morph,echo,etch}.js`

---

## Prerequisites

```bash
cd ~/projects/calm-down-app
git checkout codex/animation-sensory-pass
# test server (leave running):
python3 -m http.server 8080 --directory src
```

Probe conventions (inherited from Soundscape — binding): tap points stated; sample ≥ 1 full slowest-modulation period; single 40 s RMS-style draws on random envelopes carry noise — pool before sub-unit claims; `AudioParam.value`/`pan.value` never reflect a-rate inputs; playwright probes live at `tests/_tmp-*.mjs` and are DELETED after; never stage untracked repo-root media.

**Key existing anchors in `src/app.js`** (verified 2026-07-06; re-grep if drifted): `MODES` array `:635`, `MODE_LABELS` `:619`, `tickCanvas` `:785` (veil block `:799-811`, dispatch `:813-817`), canvas pointer handlers (grep `pointerdown` — main canvas handler contains the sfx `ensureAudioContext` bootstrap line), `clearCanvasFull` `:1259`, `cycleMode` `:1181`, `enterProfile` `:646`, prefs `getProfilePrefs/saveProfilePrefs` `:88-106`, dev card render/save (grep `entrainmentRate`), `computeSignalSummary` (grep it), sound panel markup `index.html:64` (the tray pattern to copy), `sw.js` ASSETS.

**Contract of a reference variant (all seven identical):** registers `window.VARIANTS[id] = { name, tagline, init(w,h,theme)→state, pointer(state,x,y,kind), tick(state,ctx,dt,w,h), idle(state,w,h,dt), controls:{moods:[{id,name,colors}×4], character:{label,options:[{id,name}]}}, applyControl(state,kind,id) }`. All are IIFE-wrapped, self-veiling (destination-out), transparent-canvas based.

---

### Task 1: Port variants + registry + script tags + SW v3

**Files:**
- Create: `src/modes/currents.js`, `src/modes/orbits.js`, `src/modes/mandala.js`, `src/modes/bloom.js`, `src/modes/morph.js`, `src/modes/echo.js`, `src/modes/etch.js` (verbatim copies)
- Create: `src/modes/registry.js`
- Modify: `src/index.html` (script tags), `src/sw.js` (ASSETS + v3)
- Test: `tests/phase10-test.mjs` (scaffold)

- [ ] **Step 1: Copy the seven reference files verbatim**

```bash
cd ~/projects/calm-down-app
mkdir -p src/modes
for f in currents orbits mandala bloom morph echo etch; do
  cp "reference/vis-variants/$f.js" "src/modes/$f.js"
done
```

Do not edit them in this task (deltas come later, as reviewable diffs against the verbatim port).

- [ ] **Step 2: Write `src/modes/registry.js`**

```js
// Registry adapting the demo-variant contract to the app.
// Loaded AFTER the seven mode files, BEFORE app.js.
// app.js consumes: CALM_MODES.list, CALM_MODES.get(id),
// and the shared CALM_VIS energy feed (populated by app.js audio code).

window.VARIANTS = window.VARIANTS || {};
window.CALM_VIS = { energy: 0 }; // audio-reactivity feed; app.js writes, modes read

(function () {
  var ORDER = ['echo', 'currents', 'orbits', 'mandala', 'bloom', 'morph', 'etch'];

  window.CALM_MODES = {
    list: ORDER.filter(function (id) { return !!window.VARIANTS[id]; }),
    get: function (id) { return window.VARIANTS[id] || null; },
  };
})();
```

- [ ] **Step 3: Add script tags to `src/index.html`** — directly BEFORE the existing `<script src="app.js"></script>` line:

```html
  <script src="modes/currents.js"></script>
  <script src="modes/orbits.js"></script>
  <script src="modes/mandala.js"></script>
  <script src="modes/bloom.js"></script>
  <script src="modes/morph.js"></script>
  <script src="modes/echo.js"></script>
  <script src="modes/etch.js"></script>
  <script src="modes/registry.js"></script>
```

- [ ] **Step 4: `src/sw.js`** — `CACHE_NAME` `'calm-station-v2'` → `'calm-station-v3'`; append to ASSETS:

```js
  './modes/currents.js',
  './modes/orbits.js',
  './modes/mandala.js',
  './modes/bloom.js',
  './modes/morph.js',
  './modes/echo.js',
  './modes/etch.js',
  './modes/registry.js',
```

- [ ] **Step 5: Write the failing scaffold test** `tests/phase10-test.mjs` (same standalone style as `tests/soundscape-test.mjs` — copy its `check/pass/fail/consoleErrors` helpers and two-profile seed verbatim, changing profile ids to `am1`/`am2`):

```js
await check('Registry exposes 7 modes, echo first', async () => {
  const list = await page.evaluate(() => window.CALM_MODES && window.CALM_MODES.list);
  if (!list || list.length !== 7) throw new Error('list=' + JSON.stringify(list));
  if (list[0] !== 'echo') throw new Error('echo not first: ' + list[0]);
  return list.join(',');
});

await check('SW precaches mode files at v3', async () => {
  const body = await (await page.request.get(`${BASE}/sw.js`)).text();
  const wanted = ['modes/registry.js','modes/echo.js','modes/etch.js','modes/currents.js','modes/orbits.js','modes/mandala.js','modes/bloom.js','modes/morph.js'];
  const missing = wanted.filter(w => !body.includes(w));
  if (missing.length) throw new Error('missing: ' + missing.join(','));
  if (!body.includes('calm-station-v3')) throw new Error('cache not v3');
  return 'v3 + 8 files';
});
```

- [ ] **Step 6: Run to verify fail → implement → pass**

Run: `node tests/phase10-test.mjs` (server on :8080). Expected before Steps 2–4 land: FAIL (no CALM_MODES); after: 2/2 PASS. Also `node tests/phase8-test.mjs` → 34/34 (SW structural checks) and `node tests/phase1-test.mjs` → 41/41 (page still boots with 8 new scripts).

- [ ] **Step 7: Commit**

```bash
git add src/modes src/index.html src/sw.js tests/phase10-test.mjs
git commit -m "feat: port validated animation modes with registry and precache"
```

---

### Task 2: Dispatcher integration (modes render in the app)

**Files:**
- Modify: `src/app.js` (`MODES :635`, `MODE_LABELS :619`, `tickCanvas :785`, canvas pointer handlers, `clearCanvasFull :1259`, `enterProfile :646`)
- Test: `tests/phase10-test.mjs`

- [ ] **Step 1: Add failing checks**

```js
await check('New modes render pixels via double-tap cycling', async () => {
  // enter canvas as am1 first (same entry pattern as soundscape test)
  const results = {};
  for (let i = 0; i < 12; i++) {
    const mode = await page.evaluate(() => MODES[state.canvasMode]);
    // draw a stroke
    const box = await page.locator('#main-canvas').boundingBox();
    await page.mouse.move(box.x + 200, box.y + 300); await page.mouse.down();
    for (let k = 0; k < 8; k++) { await page.mouse.move(box.x + 200 + k * 30, box.y + 300 + k * 12); await page.waitForTimeout(40); }
    await page.mouse.up();
    await page.waitForTimeout(500);
    results[mode] = await page.evaluate(() => {
      const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
      return n;
    });
    // double-tap to cycle
    await page.mouse.dblclick(box.x + 60, box.y + 60);
    await page.waitForTimeout(350);
  }
  const dead = Object.entries(results).filter(([, n]) => n < 3).map(([m]) => m);
  // legacy 'drawing' and new stroke modes all mark pixels; nothing may be dead
  if (dead.length) throw new Error('dead modes: ' + dead.join(',') + ' ' + JSON.stringify(results));
  return Object.keys(results).length + ' modes alive';
});

await check('Mode error isolation falls back to trails', async () => {
  await page.evaluate(() => {
    // sabotage one registry mode, then switch to it
    window.VARIANTS.morph.tick = function () { throw new Error('boom'); };
    state.canvasMode = MODES.indexOf('morph');
  });
  await page.waitForTimeout(400);
  const mode = await page.evaluate(() => MODES[state.canvasMode]);
  if (mode !== 'trails') throw new Error('no fallback, mode=' + mode);
  return 'fell back to trails';
});
```

(NOTE: the sabotage check must run LAST among canvas checks in the file, and the page must be reloaded afterward if later checks need morph — structure accordingly; the console-error check stays last overall and must tolerate the deliberate 'boom' error: capture and EXPECT exactly one 'boom'-tagged page error, fail on any other.)

- [ ] **Step 2: Verify they fail** (new mode ids not in MODES yet).

- [ ] **Step 3: Implement in `src/app.js`.**

`MODES`/`MODE_LABELS` (`:619-635`):

```js
const MODES = ['echo', 'currents', 'orbits', 'mandala', 'bloom', 'morph', 'etch',
               'trails', 'particles', 'ripples', 'geometric', 'drawing'];
const MODE_LABELS = {
  echo: 'Echo', currents: 'Currents', orbits: 'Orbits', mandala: 'Mandala',
  bloom: 'Bloom', morph: 'Morph', etch: 'Etch',
  trails: 'Finger Trails', particles: 'Particles', ripples: 'Ripples',
  geometric: 'Geometric', drawing: 'Freeform',
};
```

Registry-mode state on the `canvas` object — add fields to its literal (grep `var canvas = {` / `const canvas`): `regState: null, regId: null`.

Add near `tickCanvas`:

```js
function isRegistryMode(mode) {
  return !!(window.CALM_MODES && window.CALM_MODES.get(mode));
}

function ensureRegState(mode) {
  if (canvas.regId === mode && canvas.regState) return canvas.regState;
  var V = window.CALM_MODES.get(mode);
  canvas.regState = V.init(canvas.width, canvas.height, {
    accent: canvas.accentRGB, secondary: canvas.secondaryRGB, bg: '#0d1b2a',
  });
  canvas.regId = mode;
  applySavedModeControls(mode); // Task 4 — define as no-op stub here:
  return canvas.regState;
}

function applySavedModeControls(mode) {} // populated in Task 4

function registryModeError(mode, err) {
  recordSignal('mode_error', { mode: mode, message: String(err).slice(0, 120) });
  canvas.regState = null; canvas.regId = null;
  var fallback = MODES.indexOf('trails');
  if (fallback >= 0) state.canvasMode = fallback;
  showModeIndicator();
}
```

In `tickCanvas` (`:799-817`), replace the veil+dispatch block:

```js
  if (isRegistryMode(mode)) {
    try {
      var rs = ensureRegState(mode);
      var V = window.CALM_MODES.get(mode);
      V.tick(rs, ctx, dt, w, h);
      if (V.idle) V.idle(rs, w, h, dt);
    } catch (err) {
      registryModeError(mode, err);
    }
  } else if (mode === 'trails') {
    ctx.fillStyle = 'rgba(13, 27, 42, 0.03)';
    ctx.fillRect(0, 0, w, h);
    renderTrails(ctx, dt);
  } else if (mode === 'drawing') {
    renderDrawing(ctx);
  } else if (mode === 'geometric') {
    ctx.fillStyle = 'rgba(13, 27, 42, 0.04)';
    ctx.fillRect(0, 0, w, h);
    renderGeometric(ctx, dt, w, h);
  } else if (mode === 'particles') {
    ctx.fillStyle = 'rgba(13, 27, 42, 0.15)';
    ctx.fillRect(0, 0, w, h);
    renderParticles(ctx, dt, w, h);
  } else if (mode === 'ripples') {
    ctx.fillStyle = 'rgba(13, 27, 42, 0.15)';
    ctx.fillRect(0, 0, w, h);
    renderRipples(ctx, dt, w, h);
  }
```

(Task 8 revisits the legacy veils; keep them byte-identical here.)

Pointer routing — in the main canvas `pointerdown` handler (top, after the sfx bootstrap line) and the corresponding move/up handlers, add BEFORE legacy spawn logic:

```js
  var m = MODES[state.canvasMode];
  if (isRegistryMode(m)) {
    try { window.CALM_MODES.get(m).pointer(ensureRegState(m), x, y, 'down'); } catch (err) { registryModeError(m, err); }
    // still record touch signals + gentle-prompt activity exactly as legacy paths do
  }
```

(kinds: `'down'`/`'move'`/`'up'` respectively; registry modes SKIP the legacy addTrailPoint/spawnParticles/addRipple/addShape branches — guard those with `!isRegistryMode(m)`. Preserve every signal/prompt side-effect for both branches: read the handler before editing and keep `queueTouchSignal`/double-tap detection outside the branch.)

`clearCanvasFull` (`:1259`): registry modes reset via re-init:

```js
  if (isRegistryMode(MODES[state.canvasMode])) {
    canvas.regState = null; canvas.regId = null;
    ensureRegState(MODES[state.canvasMode]);
  }
```

`enterProfile`: after theme resolution, invalidate registry state so a new profile re-inits with its colors: `canvas.regState = null; canvas.regId = null;`

Also `cycleMode` (`:1181`) works untouched (it only changes `state.canvasMode`), but VERIFY the mode-switch clear path (`clearCanvasFull` or transition fade — read `cycleMode`) also invalidates regState the same way — add the two-line invalidation wherever the old canvas is wiped on switch.

- [ ] **Step 4: Run tests** — phase10 all green (scaffold + 2 new); phase2 21/21 (double-tap cycling now traverses 12 — READ its assertions first: it asserts specific mode names in sequence from 'Finger Trails'; the new MODES order breaks it. AUTHORIZED test refresh: update phase2's expected cycle sequence to the new 12-mode order, preserving its assertion intent, and note it in the commit body); phase1 41/41; phase4 21/21 (same cycle-order caveat — refresh if needed).

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/phase10-test.mjs tests/phase2-test.mjs tests/phase4-test.mjs
git commit -m "feat: dispatch registry animation modes in the app canvas"
```

---

### Task 3: Mode tray (picker)

**Files:**
- Modify: `src/index.html` (tray markup near the sound panel block), `src/styles.css` (append), `src/app.js`
- Test: `tests/phase10-test.mjs`

- [ ] **Step 1: Failing checks**

```js
await check('Mode tray opens and lists 12 modes', async () => {
  await page.click('#btn-modes');
  await page.waitForSelector('#mode-tray.open');
  const n = await page.locator('#mode-options .mode-option').count();
  if (n !== 12) throw new Error('modes=' + n);
  return '12 chips';
});

await check('Tray selects a mode and records signal', async () => {
  await page.click('#mode-options .mode-option[data-mode="bloom"]');
  await page.waitForTimeout(300);
  const mode = await page.evaluate(() => MODES[state.canvasMode]);
  if (mode !== 'bloom') throw new Error('mode=' + mode);
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-am1-signals')) || []);
  if (!events.some(e => e.type === 'mode_select' && e.payload.mode === 'bloom' && e.payload.via === 'tray')) throw new Error('no tray signal');
  return 'bloom via tray';
});
```

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement.**

`index.html` — after the sound button/panel block (mirror its structure exactly; read it first):

```html
    <button id="btn-modes" class="btn-icon" aria-label="Visual modes">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="2" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.6"/><rect x="2" y="11" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="11" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.6"/></svg>
    </button>
    <div id="mode-tray" class="sound-panel">
      <div class="sound-section-label">Visuals</div>
      <div class="mode-options" id="mode-options"></div>
    </div>
```

(`btn-icon` — reuse whatever class `#btn-sound` uses if different; match placement/positioning CSS of the sound button, offset so both fit. Read the existing corner-button CSS and mirror.)

`styles.css` append:

```css
.mode-options { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; }
.mode-option { min-height:48px; border-radius:10px; background:rgba(255,255,255,0.06);
  color:inherit; border:1px solid rgba(255,255,255,0.10); font-size:13px; }
.mode-option.selected { border-color: var(--accent); background: rgba(255,255,255,0.12); }
#mode-tray { /* inherits .sound-panel; grid needs width */ min-width: 264px; }
```

`app.js` — mirror the sound-panel open/close/outside-click pattern (read `:2233-2255` region) for `#btn-modes`/`#mode-tray`; render:

```js
function renderModeOptions() {
  var $mo = document.getElementById('mode-options');
  $mo.textContent = '';
  MODES.forEach(function (id) {
    var btn = document.createElement('button');
    btn.className = 'mode-option' + (MODES[state.canvasMode] === id ? ' selected' : '');
    btn.dataset.mode = id;
    btn.textContent = MODE_LABELS[id];
    $mo.appendChild(btn);
  });
}
```

Click delegation → set `state.canvasMode`, invalidate regState via the same wipe path as cycleMode, `showModeIndicator()`, `recordSignal('mode_select', {mode:id, via:'tray'})`, re-render options, close tray. Double-tap cycling stays untouched.

- [ ] **Step 4: Tests** — phase10 green; phase2/phase4 still green; phase9 17/17 (kid-copy leak check now also sees the tray — no dev strings there).

- [ ] **Step 5: Commit** — `git commit -m "feat: add visual mode tray with 12 modes"`

---

### Task 4: Style tray (Mood + Character) with per-profile persistence

**Files:**
- Modify: `src/index.html`, `src/styles.css`, `src/app.js`
- Test: `tests/phase10-test.mjs`

- [ ] **Step 1: Failing checks**

```js
await check('Style tray shows mood+character for registry mode', async () => {
  // bloom active from previous check
  await page.click('#btn-style');
  await page.waitForSelector('#style-tray.open');
  const moods = await page.locator('#style-moods .swatch').count();
  const chars = await page.locator('#style-chars .chip').count();
  if (moods !== 4 || chars < 3) throw new Error(`moods=${moods} chars=${chars}`);
  return `${moods} moods, ${chars} chars`;
});

await check('Control choice applies, persists per profile, and signals', async () => {
  await page.click('#style-moods .swatch[data-id]:nth-child(3)'); // 2nd mood (child 1 is the label)
  await page.waitForTimeout(200);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-am1-prefs')));
  const saved = prefs.modeControls && prefs.modeControls.bloom && prefs.modeControls.bloom.mood;
  if (!saved) throw new Error('not persisted: ' + JSON.stringify(prefs.modeControls));
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-am1-signals')) || []);
  if (!events.some(e => e.type === 'mode_control' && e.payload.mode === 'bloom' && e.payload.control === 'mood')) throw new Error('no signal');
  // reload + re-enter → applied on init
  await page.reload(); await page.waitForTimeout(400);
  await page.click('.profile-card.filled'); await page.waitForSelector('#screen-canvas.active');
  await page.evaluate(() => { state.canvasMode = MODES.indexOf('bloom'); });
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => canvas.regState && canvas.regState.moodId);
  if (applied !== saved) throw new Error(`applied=${applied} saved=${saved}`);
  return 'applied ' + saved;
});
```

(`canvas.regState.moodId` is bloom's field name — verified in the reference file. If a mode uses a different field, assert via a second control read-back through a fresh `applyControl` no-op instead; keep the assertion on bloom where the field is known.)

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement.**

`index.html` — third corner button `#btn-style` (palette icon) + `#style-tray` with `#style-moods` and `#style-chars` rows (same `.sound-panel` shell; label rows like the gallery: a `.ctl-label` span then buttons).

`styles.css` — port the gallery's control styles verbatim (`.ctlrow/.ctl-label/.swatch/.dot/.swname/.chip` from `reference/vis-variants/demo-gallery.html` `<style>` block), adjusting selectors to `#style-tray` scope.

`app.js`:

```js
function getModeControls(profileId) {
  var prefs = getProfilePrefs(profileId);
  return (prefs && prefs.modeControls) || {};
}

function saveModeControl(mode, control, value) {
  if (!state.activeProfileId) return;
  var prefs = getProfilePrefs(state.activeProfileId) || {};
  prefs.modeControls = prefs.modeControls || {};
  prefs.modeControls[mode] = prefs.modeControls[mode] || {};
  prefs.modeControls[mode][control] = value;
  saveProfilePrefs(state.activeProfileId, prefs);
}

function applySavedModeControls(mode) {   // replaces Task-2 stub
  if (!state.activeProfileId || !canvas.regState) return;
  var V = window.CALM_MODES.get(mode);
  if (!V || !V.applyControl) return;
  var saved = getModeControls(state.activeProfileId)[mode] || {};
  if (saved.mood) { try { V.applyControl(canvas.regState, 'mood', saved.mood); } catch (e) {} }
  if (saved.character) { try { V.applyControl(canvas.regState, 'character', saved.character); } catch (e) {} }
  // size/trace applied here too once Tasks 5–6 land
}

function renderStyleTray() {
  var mode = MODES[state.canvasMode];
  var V = isRegistryMode(mode) ? window.CALM_MODES.get(mode) : null;
  var $m = document.getElementById('style-moods');
  var $c = document.getElementById('style-chars');
  $m.textContent = ''; $c.textContent = '';
  var saved = state.activeProfileId ? (getModeControls(state.activeProfileId)[mode] || {}) : {};
  if (!V || !V.controls) { $m.style.display = 'none'; $c.style.display = 'none'; return; }
  $m.style.display = 'flex'; $c.style.display = 'flex';
  var lbl = document.createElement('span'); lbl.className = 'ctl-label'; lbl.textContent = 'Mood'; $m.appendChild(lbl);
  V.controls.moods.forEach(function (mo, i) {
    var b = document.createElement('button');
    b.className = 'swatch' + ((saved.mood ? saved.mood === mo.id : i === 0) ? ' on' : '');
    b.dataset.id = mo.id;
    (mo.colors || []).slice(0, 4).forEach(function (hex) {
      var d = document.createElement('span'); d.className = 'dot'; d.style.background = hex; b.appendChild(d);
    });
    var nm = document.createElement('span'); nm.className = 'swname'; nm.textContent = mo.name; b.appendChild(nm);
    $m.appendChild(b);
  });
  var lbl2 = document.createElement('span'); lbl2.className = 'ctl-label';
  lbl2.textContent = V.controls.character.label || 'Style'; $c.appendChild(lbl2);
  V.controls.character.options.forEach(function (o, i) {
    var b = document.createElement('button');
    b.className = 'chip' + ((saved.character ? saved.character === o.id : i === 0) ? ' on' : '');
    b.dataset.id = o.id; b.textContent = o.name;
    $c.appendChild(b);
  });
}
```

Delegated clicks on `#style-moods`/`#style-chars`: `V.applyControl(canvas.regState, kind, id)` (try/catch → `registryModeError`), `saveModeControl(mode, kind, id)`, `recordSignal('mode_control', {mode: mode, control: kind, value: id})`, re-render tray. Tray open/close mirrors sound panel; opening calls `renderStyleTray()`. Mode switches (tray/double-tap) re-render if open. For legacy modes the tray shows only the existing drawing-mode color picker hint (leave legacy modes without controls — style button may stay visible but tray renders a one-line "this mode has no style options yet" muted note; add that literal string, it is kid-safe copy).

- [ ] **Step 4: Tests** — phase10 green; phase9 17/17; phase3 28/28 (sound panel untouched but shares CSS patterns — regression).

- [ ] **Step 5: Commit** — `git commit -m "feat: kid-facing style tray with mood and character controls"`

---

### Task 5: Size control (bounded slider + surprise toggle)

**Files:**
- Modify: all seven `src/modes/*.js` (except registry), `src/app.js`, `src/index.html`, `src/styles.css`
- Test: `tests/phase10-test.mjs`

The demo contract lacks size — this task extends each mode with two `applyControl` kinds: `'size'` (number 0.6–1.6) and `'sizeRandom'` (boolean). Uniform semantics: `state.sizeMul` scales the mode's PRIMARY element size at creation time; `state.sizeRandom` widens per-element variation to `sizeMul × (0.7 + rng()*0.6)`.

- [ ] **Step 1: Failing check**

```js
await check('Size control scales new elements within bounds', async () => {
  await page.evaluate(() => { state.canvasMode = MODES.indexOf('echo'); });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    var V = window.CALM_MODES.get('echo');
    V.applyControl(canvas.regState, 'size', 1.6);
  });
  const big = await page.evaluate(() => canvas.regState.sizeMul);
  await page.evaluate(() => window.CALM_MODES.get('echo').applyControl(canvas.regState, 'size', 99)); // out of range
  const clamped = await page.evaluate(() => canvas.regState.sizeMul);
  if (big !== 1.6 || clamped > 1.6) throw new Error(`big=${big} clamped=${clamped}`);
  return 'bounded 0.6–1.6';
});
```

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement per mode.** Add to EVERY mode's `init` state: `sizeMul: 1, sizeRandom: false`; add to every `applyControl`:

```js
  if (kind === 'size') { state.sizeMul = Math.max(0.6, Math.min(1.6, Number(id) || 1)); return; }
  if (kind === 'sizeRandom') { state.sizeRandom = !!id; return; }
```

And a shared helper pasted into each file's IIFE (7 copies — files are isolated by design):

```js
  function sizeFactor(state) {
    var m = state.sizeMul || 1;
    return state.sizeRandom ? m * (0.7 + Math.random() * 0.6) : m;
  }
```

Application sites (exact expressions to wrap with `* sizeFactor(state)` — one per mode, at ELEMENT-CREATION time so live elements never jump):

| Mode | File site (grep anchor) | Expression to scale |
|---|---|---|
| echo | live object radius base (grep `radius` in the live-object creation / `RADIUS_MIN`) | the object's base radius draw scale (affects future stamps + live object; apply at stamp record) |
| currents | `spawnParticle`-equivalent radius (grep `radius:`) | particle radius |
| orbits | particle `radius`/size at spawn (grep `size` or `radius:` in spawn) | orbiter dot size (comets included) |
| mandala | spark width (grep `width` at emission) | spark stroke width |
| bloom | seed `len`/`wid` in `regenSeedAt` | both petal dimensions |
| morph | `maxSize`/base radius at spawn (grep `maxSize`) | shape max radius |
| etch | bead radius / stroke width (grep `BEAD` constants usage at point-add) | bead size |

For each: locate the ONE creation-time expression, multiply by `sizeFactor(state)`, and add an inline comment `// size control (kid slider)`. If a mode's expression is a constant, convert to `CONST * sizeFactor(state)` at the use site — do NOT change the constant itself.

`app.js` style tray — add a third row `#style-size` in `index.html` (`<div class="ctlrow" id="style-size"></div>`) and in `renderStyleTray()`:

```js
  var $s = document.getElementById('style-size');
  $s.textContent = ''; $s.style.display = 'flex';
  var lbl3 = document.createElement('span'); lbl3.className = 'ctl-label'; lbl3.textContent = 'Size'; $s.appendChild(lbl3);
  var slider = document.createElement('input');
  slider.type = 'range'; slider.min = '60'; slider.max = '160'; slider.step = '5';
  slider.value = String(Math.round((saved.size || 1) * 100));
  slider.id = 'style-size-slider'; slider.setAttribute('aria-label', 'Size');
  $s.appendChild(slider);
  var surprise = document.createElement('button');
  surprise.className = 'chip' + (saved.sizeRandom ? ' on' : '');
  surprise.id = 'style-size-random'; surprise.textContent = 'Surprise sizes';
  $s.appendChild(surprise);
```

Slider `input` → `applyControl(regState,'size', v/100)` + `saveModeControl(mode,'size',v/100)` + debounced `recordSignal('mode_control', {mode, control:'size', value:v/100})` (reuse the 500 ms debounce pattern from `recordVolumeChange`). Surprise click toggles → `'sizeRandom'` + persist + signal. `applySavedModeControls` gains: `if (saved.size) ... 'size'`; `if (saved.sizeRandom) ... 'sizeRandom'`. CSS: `#style-size input[type=range]{ width:130px; accent-color: var(--accent); }`.

- [ ] **Step 4: Tests** — phase10 green (incl. new check); spot-run soundscape 26/26 (shared prefs write paths).

- [ ] **Step 5: Commit** — `git commit -m "feat: kid-facing size control across animation modes"`

---

### Task 6: Trace control (fades ↔ stays)

**Files:**
- Modify: `src/modes/{currents,orbits,mandala,bloom,morph}.js` (echo/etch exempt — persistence IS their identity), `src/app.js`, `src/index.html`
- Test: `tests/phase10-test.mjs`

Uniform semantics: `state.traceMode` = `'fades'` (default, current behavior) | `'stays'`. In `'stays'`: (a) the mode's destination-out veil is SKIPPED, (b) trace-class elements stop life-decay once fully formed (they freeze instead of dying; caps still bound totals — at cap, oldest get the existing graceful dissolve), (c) pattern actors (live orbiters, growing blooms, morphing shapes) behave unchanged. Clear resets as always.

- [ ] **Step 1: Failing check**

```js
await check('Trace=stays persists mandala sparks; fades drains them', async () => {
  await page.evaluate(() => { state.canvasMode = MODES.indexOf('mandala'); });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.CALM_MODES.get('mandala').applyControl(canvas.regState, 'trace', 'stays'));
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down();
  for (let k = 0; k < 10; k++) { await page.mouse.move(box.x + 300 + k * 15, box.y + 300 + k * 8); await page.waitForTimeout(40); }
  await page.mouse.up();
  await page.waitForTimeout(5000); // > full fade lifetime
  const litStays = await page.evaluate(() => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
    return n;
  });
  if (litStays < 5) throw new Error('stays did not persist: ' + litStays);
  await page.evaluate(() => window.CALM_MODES.get('mandala').applyControl(canvas.regState, 'trace', 'fades'));
  await page.waitForTimeout(5000);
  const litFades = await page.evaluate(() => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
    return n;
  });
  if (litFades >= litStays / 3) throw new Error(`fades did not drain: ${litStays} -> ${litFades}`);
  return `stays=${litStays} fades=${litFades}`;
});
```

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement per mode (five files).** Each gains in `init`: `traceMode: 'fades'`; in `applyControl`:

```js
  if (kind === 'trace') { state.traceMode = (id === 'stays') ? 'stays' : 'fades'; return; }
```

Per-mode edits (exact anchors):
- **mandala**: wrap the veil `destination-out` fillRect in `if (state.traceMode !== 'stays') { ... }`; in the spark-life update, when `'stays'` and the spark has completed emission (age > hold window), clamp `sp.life = Math.max(sp.life, FROZEN_LIFE)` where `FROZEN_LIFE = 0.55` (keeps mid-fade brightness constant); existing cap/splice untouched.
- **currents**: veil skip same pattern; in `'stays'`, particle life clamps at its post-hold value (`p.life = Math.max(p.life, 0.5)`) so streams freeze into painted rivers; cap thinning untouched.
- **orbits**: veil skip; trail points stop aging in `'stays'` (skip trail-age decrement); orbiters themselves keep orbiting (pattern actors) — their PATHS accumulate.
- **bloom**: veil skip; in `'stays'`, skip the deterioration trigger entirely (blooms complete and remain; MAX_BLOOMS still forces oldest dissolve on the 5th plant — bounded).
- **morph**: veil skip; in `'stays'`, when a shape completes its life it freezes at its final form (skip the death-splice; keep drawing at last alpha; cap 24 forces oldest graceful fade).

Style tray: fourth row `#style-trace` (two chips: "Fades away" / "Stays until Clear") rendered ONLY when the active mode is one of the five (echo/etch/legacy hide the row); wiring identical to character chips (`applyControl('trace', id)` + persist + `mode_control` signal). `applySavedModeControls` gains trace.

- [ ] **Step 4: Tests** — phase10 green; re-run Task-6 check twice (stability).

- [ ] **Step 5: Commit** — `git commit -m "feat: kid-facing trace control (fades vs stays)"`

---

### Task 7: Echo deltas (soft glowing edges + smooth overlap)

**Files:**
- Modify: `src/modes/echo.js`
- Test: `tests/phase10-test.mjs`

- [ ] **Step 1: Failing check**

```js
await check('Echo stamps have feathered edges, no outline ring', async () => {
  await page.evaluate(() => { state.canvasMode = MODES.indexOf('echo'); });
  await page.waitForTimeout(200);
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 400, box.y + 400); // single stamp
  await page.waitForTimeout(400);
  const profile = await page.evaluate(() => {
    // radial alpha profile from stamp center outward
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const dpr = c.width / c.clientWidth;
    const cx = Math.round(400 * dpr), cy = Math.round(400 * dpr);
    const d = x.getImageData(cx, cy, Math.round(80 * dpr), 1).data; // horizontal ray
    const alphas = []; for (let i = 3; i < d.length; i += 4) alphas.push(d[i]);
    return alphas;
  });
  // find edge zone: last index with alpha>200 to first index with alpha<10
  const lastSolid = profile.map((a,i)=>a>200?i:-1).reduce((m,v)=>Math.max(m,v),-1);
  const firstClear = profile.findIndex((a,i)=>i>lastSolid && a<10);
  const feather = firstClear - lastSolid;
  if (lastSolid < 3) throw new Error('no solid interior');
  if (feather < 2) throw new Error('hard edge: feather=' + feather + 'px');
  // no dark outline: the min RGB luminance in the edge zone must not dip below interior luminance by >35%
  return `feather=${feather}px`;
});
```

- [ ] **Step 2: Verify fail** (current stamps: opaque fill + darker outline = feather ≈ 0–1 px).

- [ ] **Step 3: Implement in `src/modes/echo.js`.**
1. DELETE the darker-outline stroke in the stamp-draw path (grep the outline comment from the builder: "thinner darker-shade outline") — remove those lines entirely.
2. Feathered fill: replace the flat `fillStyle = color` stamp fill with a cached radial-ish edge feather. Because stamps are arbitrary morph polygons (not circles), implement feather via two-pass draw into the stamp canvas:

```js
  // Pass 1: fill the shape solid at full alpha.
  // Pass 2: soft rim — same path, 'destination-out' stroke with a blurred-edge
  // gradient brush: stroke the path with lineWidth FEATHER_PX*2 using a
  // semi-transparent erase (alpha ramp emulated by 3 concentric strokes):
  var FEATHER_PX = 3;
  sctx.save();
  sctx.globalCompositeOperation = 'destination-out';
  for (var fi = 0; fi < 3; fi++) {
    sctx.lineWidth = FEATHER_PX * 2 * (1 - fi / 3);
    sctx.globalAlpha = 0.25;           // cumulative rim erosion: outermost most eroded
    strokeStampPath(sctx);              // helper: re-traces the current stamp path
    // NOTE: after the loop, globalAlpha/composite restored below
  }
  sctx.restore();
```

(`strokeStampPath` = extract the existing path-tracing into a helper used by both fill and rim passes. Result: alpha ramps from 255 in the interior through the rim over ~3 px — color identical to the fill all the way out, matching "the colour all the way to the edge, faded out a little". Verify visually AND with the probe.)
3. Cadence: grep the stamp-distance constant (`22` px) → `14`; grep the slow-move time fallback (`80` ms) → `60`.
4. Overlap smoothness: with feathered rims, overlapping stamps blend at edges automatically (rim semi-transparency composites); ensure draw order stays stroke-sequential (it does — stamps append). No further change unless the probe shows seams.

- [ ] **Step 4: Tests** — phase10 green (feather ≥ 2 px); echo persistence + overwrite checks from Task 2's cycle still pass (overwrite at CENTER remains full-opacity — assert interior alpha 255 still true in the Task-1-ported checks if present, else rely on phase10 cycle check).

- [ ] **Step 5: Commit** — `git commit -m "feat: echo soft glowing stamp edges and tighter cadence"`

---

### Task 8: Ghost-trail eradication (legacy five + named stragglers)

**Files:**
- Modify: `src/app.js` (legacy veils + renderer fades), `src/modes/currents.js`, `src/modes/orbits.js`
- Test: `tests/phase10-test.mjs`

- [ ] **Step 1: Failing check**

```js
await check('All 12 modes drain to clean canvas in fades mode', async () => {
  const dirty = [];
  for (const m of ['trails','particles','ripples','geometric','currents','orbits','mandala','bloom','morph']) {
    await page.evaluate((mm) => { state.canvasMode = MODES.indexOf(mm); }, m);
    await page.waitForTimeout(200);
    await page.evaluate(() => { if (isRegistryMode(MODES[state.canvasMode])) window.CALM_MODES.get(MODES[state.canvasMode]).applyControl(canvas.regState, 'trace', 'fades'); });
    const box = await page.locator('#main-canvas').boundingBox();
    await page.mouse.move(box.x + 200, box.y + 250); await page.mouse.down();
    for (let k = 0; k < 12; k++) { await page.mouse.move(box.x + 200 + k * 25, box.y + 250 + Math.sin(k) * 60); await page.waitForTimeout(40); }
    await page.mouse.up();
    await page.waitForTimeout(6500); // policy: full drain < ~5s + margin (bloom/morph actors excepted below)
    const lit = await page.evaluate(() => {
      const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
      return n;
    });
    const budget = (m === 'bloom' || m === 'morph' || m === 'orbits') ? 60 : 8; // live pattern actors allowed
    if (lit > budget) dirty.push(`${m}=${lit}`);
    await page.click('#btn-clear'); await page.waitForTimeout(300); // reset between modes (verify the clear button id by grep; adjust selector)
  }
  if (dirty.length) throw new Error('residue: ' + dirty.join(','));
  return 'all clean';
});
```

(Grep the actual clear-button id in index.html before finalizing the selector. 'drawing' and 'etch'/'echo' are persistence-by-design — excluded.)

- [ ] **Step 2: Verify fail** (legacy modes still use bg-color veils → permanent residue plateaus).

- [ ] **Step 3: Implement.**

`app.js` legacy veils in the `tickCanvas` block from Task 2 — replace ALL bg-color veils with destination-out equivalents (transparent canvas; the screen's CSS bg already shows through — VERIFY `#main-canvas`/screen CSS backgrounds render `#0d1b2a` behind the canvas; if the canvas element lacks a CSS background, add `background: #0d1b2a;` to its CSS rule — read styles.css first):

```js
  } else if (mode === 'trails') {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.045)'; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    renderTrails(ctx, dt);
  }
```

(same pattern: geometric 0.06, particles 0.16, ripples 0.16; drawing keeps NO veil — persistence is its identity.) Additionally, legacy renderers' element fades already reach zero via life decay (they splice at life ≤ 0) — the residue was purely the veil convergence; no renderer changes needed beyond the veils. Run the check; if `trails` still plateaus (its 0.045 erase is slow), raise to 0.06 and re-run.

`src/modes/currents.js`: raise the veil-erase alpha one step (grep the provenance comment; e.g. 0.16 → 0.20) and shorten `tailWindow` 1.6 → 1.2 s. Update the provenance comment.
`src/modes/orbits.js`: default `TRAIL_LEN` 4 → 2 and trail-point max age → 1.5 s; comets keep +4. Update comments.

- [ ] **Step 4: Tests** — phase10 all green including the 12-mode drain check ×2 runs; phase2/phase4 21/21 & 28/28... (phase3 28/28, phase4 21/21 — full canvas-affecting set: run phases 1,2,3,4,5,8 + soundscape).

- [ ] **Step 5: Commit** — `git commit -m "feat: eradicate ghost trails across all modes"`

---

### Task 9: Audio-reactive coupling (CALM_VIS energy)

**Files:**
- Modify: `src/app.js` (analyser + energy), all seven `src/modes/*.js` (one bounded multiplier each)
- Test: `tests/phase10-test.mjs`

- [ ] **Step 1: Failing checks**

```js
await check('CALM_VIS.energy rises with music, decays in silence', async () => {
  await page.click('#btn-sound'); await page.waitForSelector('#sound-panel.open');
  await page.click('#music-options .sound-option[data-music="bowls"]');
  await page.waitForFunction(() => audio.musicPlaying === true, null, { timeout: 10000 });
  await page.waitForFunction(() => window.CALM_VIS.energy > 0.05, null, { timeout: 5000 });
  const on = await page.evaluate(() => CALM_VIS.energy);
  await page.click('#music-options .sound-option[data-music="bowls"]'); // toggle off
  await page.waitForFunction(() => window.CALM_VIS.energy < 0.02, null, { timeout: 8000 });
  return `on=${on.toFixed(3)}`;
});

await check('Dev kill-switch zeroes reactivity', async () => {
  await page.evaluate(() => {
    var controls = getDevControls();
    controls['am1'] = Object.assign({}, controls['am1'], { visualReactivity: false });
    saveDevControls(controls);
    applyVisualReactivity('am1');
  });
  await page.click('#music-options .sound-option[data-music="bowls"]');
  await page.waitForFunction(() => audio.musicPlaying === true, null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  const e = await page.evaluate(() => CALM_VIS.energy);
  if (e !== 0) throw new Error('energy=' + e);
  return 'killed';
});
```

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement.**

`app.js`, after the entrainment block:

```js
// --- Visual reactivity feed (CALM_VIS) ---
// One AnalyserNode on masterGain -> smoothed 0..1 energy consumed by
// animation modes as bounded multipliers. Silence => exactly 0.
// Per-profile dev kill-switch: visualReactivity (default on).

var visFeed = { analyser: null, data: null, enabled: true, raf: null };

function ensureVisAnalyser() {
  if (visFeed.analyser || !audio.ctx || !audio.masterGain) return;
  visFeed.analyser = audio.ctx.createAnalyser();
  visFeed.analyser.fftSize = 256;
  visFeed.data = new Uint8Array(visFeed.analyser.fftSize);
  audio.masterGain.connect(visFeed.analyser); // tap only; no output routing
}

function applyVisualReactivity(profileId) {
  var control = getProfileDevControl(profileId);
  visFeed.enabled = control.visualReactivity !== false;
  if (!visFeed.enabled) window.CALM_VIS.energy = 0;
}

function updateVisEnergy(dt) {
  if (!visFeed.enabled) { window.CALM_VIS.energy = 0; return; }
  if (!visFeed.analyser) { ensureVisAnalyser(); if (!visFeed.analyser) { window.CALM_VIS.energy = 0; return; } }
  visFeed.analyser.getByteTimeDomainData(visFeed.data);
  var sum = 0;
  for (var i = 0; i < visFeed.data.length; i++) {
    var v = (visFeed.data[i] - 128) / 128;
    sum += v * v;
  }
  var rms = Math.sqrt(sum / visFeed.data.length);
  var target = Math.min(1, rms * 6); // normalize: typical bed RMS ~0.03-0.17
  var tau = (target > window.CALM_VIS.energy) ? 0.5 : 2.0; // attack/release
  window.CALM_VIS.energy += (target - window.CALM_VIS.energy) * (1 - Math.exp(-dt / tau));
  if (window.CALM_VIS.energy < 0.001) window.CALM_VIS.energy = 0;
}
```

Call `updateVisEnergy(dt)` first thing in `tickCanvas` (after dt computation). In `enterProfile`, after `applyEntrainment(...)`: `applyVisualReactivity(profile.id);`. Dev card: checkbox `visualReactivity` (checked by default — conditional-store INVERTED vs sfx: store only `visualReactivity:false` when unchecked; absent = on; mirror markup pattern of the sfx checkbox; save handler: `if (!checked) profileControl.visualReactivity = false;`).

Per-mode coupling (one line each, bounded ≤ +25 %, applied at DRAW time so silence is exactly neutral):

| Mode | Site (grep) | Change |
|---|---|---|
| currents | particle draw alpha | `alpha *= (1 + 0.2 * (window.CALM_VIS ? CALM_VIS.energy : 0))`, clamp ≤ 0.85 |
| orbits | glow-layer draw alpha | same pattern, ≤ 0.8 |
| mandala | spark stroke alpha | `* (1 + 0.15 * E)`, clamp |
| bloom | parastichy shimmer depth (grep shimmer amplitude) | `* (1 + 0.25 * E)` |
| morph | outer glow stroke alpha | `* (1 + 0.2 * E)`, clamp |
| echo | LIVE object glow ring alpha only (stamps NEVER react — archive is sacred) | `* (1 + 0.25 * E)` |
| etch | traveling pulse brightness peak | `* (1 + 0.2 * E)`, clamp |

Each with the shared prelude line at top of the mode's draw fn: `var E = (window.CALM_VIS && window.CALM_VIS.energy) || 0;`

- [ ] **Step 4: Tests** — phase10 green (both new checks); soundscape 26/26 (audio graph untouched — analyser is tap-only); phase9 17/17 (dev card grew a control).

- [ ] **Step 5: Commit** — `git commit -m "feat: audio-reactive visual energy feed with dev kill-switch"`

---

### Task 10: Signals + dev summaries for mode controls

**Files:**
- Modify: `src/app.js` (`computeSignalSummary`, dev dashboard render)
- Test: `tests/phase10-test.mjs`

- [ ] **Step 1: Failing check**

```js
await check('Dev summary surfaces top mode-control usage', async () => {
  const summary = await page.evaluate(() => computeSignalSummary(readSignals('am1')));
  if (!summary.controlCounts) throw new Error('no controlCounts in summary');
  const total = Object.values(summary.controlCounts).reduce((a, b) => a + b, 0);
  if (total < 2) throw new Error('controls not counted: ' + JSON.stringify(summary.controlCounts));
  return JSON.stringify(summary.controlCounts).slice(0, 60);
});
```

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement.** In `computeSignalSummary`: `var controlCounts = {};` beside the other declarations; in the event loop:

```js
    if (event.type === 'mode_control') {
      var key = (payload.mode || '?') + ':' + (payload.control || '?');
      controlCounts[key] = (controlCounts[key] || 0) + 1;
    }
```

Add `controlCounts: controlCounts,` to the return. Dev dashboard: beside the Top Music stat, add a stat with value = the highest-count key (or '—') and label `Top Control` (mirror the existing `devStat` pattern exactly; friendly-format the key as `mode · control`).

- [ ] **Step 4: Tests** — phase10 green; phase9 17/17.
- [ ] **Step 5: Commit** — `git commit -m "feat: mode-control usage in signals and dev summary"`

---

### Task 11: Dev dials for control defaults

**Files:**
- Modify: `src/app.js` (dev card render + save; `applySavedModeControls` fallback chain)
- Test: `tests/phase10-test.mjs`

- [ ] **Step 1: Failing check**

```js
await check('Dev default mood applies when kid has no saved choice', async () => {
  await page.evaluate(() => {
    var controls = getDevControls();
    controls['am2'] = Object.assign({}, controls['am2'], { modeDefaults: { bloom: { mood: 'tropical' } } });
    saveDevControls(controls);
  });
  // enter am2 (second profile), switch to bloom, verify mood default applied
  await page.click('#btn-back'); await page.waitForSelector('#screen-profiles.active');
  await page.locator('.profile-card.filled').nth(1).click(); await page.waitForSelector('#screen-canvas.active');
  await page.evaluate(() => { state.canvasMode = MODES.indexOf('bloom'); });
  await page.waitForTimeout(300);
  const mood = await page.evaluate(() => canvas.regState.moodId);
  if (mood !== 'tropical') throw new Error('mood=' + mood);
  return 'dev default applied';
});
```

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement.** `applySavedModeControls` fallback chain — kid's saved choice > dev default > mode default:

```js
  var devDefaults = (getProfileDevControl(state.activeProfileId).modeDefaults || {})[mode] || {};
  var effective = {
    mood: saved.mood || devDefaults.mood,
    character: saved.character || devDefaults.character,
    size: saved.size || devDefaults.size,
    sizeRandom: (saved.sizeRandom !== undefined) ? saved.sizeRandom : devDefaults.sizeRandom,
    trace: saved.trace || devDefaults.trace,
  };
```

(apply each non-undefined via applyControl as before). Dev card UI: a compact per-mode defaults editor is overkill — implement a single JSON-free pragmatic control: one `<select data-dev-control="modeDefaultsMode">` (mode list) + per-kind selects that populate from the chosen mode's registry controls, writing into `profileControl.modeDefaults[mode]`. Keep it dev-grade simple (three selects + the existing Save button path); mirror the entrainment select markup. Save handler merges rather than replaces `modeDefaults`.

- [ ] **Step 4: Tests** — phase10 green; phase9 17/17.
- [ ] **Step 5: Commit** — `git commit -m "feat: dev dials for per-mode control defaults"`

---

### Task 12: Full regression + docs

**Files:**
- Modify: `CLAUDE.md`, `TODO.md`

- [ ] **Step 1: Full battery**

```bash
for n in 1 2 3 4 5 6 7 8 9; do
  out=$(node tests/phase${n}-test.mjs 2>&1); code=$?
  fails=$(echo "$out" | grep -oiE "[0-9]+ failed" | grep -oE "^[0-9]+" | awk '{s+=$1} END{print s+0}')
  [ $code -eq 0 ] && [ "$fails" -eq 0 ] && echo "phase${n}: PASS" || { echo "phase${n}: FAIL"; echo "$out" | tail -5; }
done
node tests/soundscape-test.mjs
node tests/phase10-test.mjs
```

All green ×2 runs. Investigate any red before touching docs (BLOCKED beats blind patches).

- [ ] **Step 2: Docs.** `CLAUDE.md` — Canvas Rendering paragraph: replace "5 visual modes cycled by double-tap" description with: `12 visual modes (7 registry modes in src/modes/ + 5 legacy) — mode tray (grid icon) or double-tap cycles; kid-facing style tray (Mood/Character/Size/Trace) per registry mode; audio-reactive energy feed (CALM_VIS) with per-profile dev kill-switch.` File table row for `src/modes/` added. `TODO.md` backlog: strike `Touch-responsive audio (touch affects pitch/tone)` → pointer to CALM_VIS reactivity (visual direction shipped instead; audio direction still open) — edit, don't delete; add backlog seeds from the spec (bloom families, aurora revival, per-mode SFX pairings).

- [ ] **Step 3: Commit** — `git commit -m "docs: architecture notes for animation sensory pass"`

---

### Task 13: Preview deploy + human iPad pass (human-gated)

- [ ] **Step 1:** `npx vercel` (non-prod preview) from the repo root → share preview URL. (Vercel deploys `src/`; project `calm-station`.)
- [ ] **Step 2 (human):** iPad pass with `docs/phase2/sensory-tuning-checklist.md`: all 12 modes; hold gestures; style tray reachability with small hands; 12-fold mandala fps by feel; Echo edge glow on retina; trace stays vs fades; Clear semantics; audio-reactivity with bowls playing; kid-copy sweep.
- [ ] **Step 3 (human):** first observation sessions per `docs/phase2/observation-note-template.md` — controls OFF-default question: watch whether kids FIND the style tray unprompted (that discovery moment is itself a signal — `mode_control` counts in the dev summary).

---

## Self-review notes

- **Spec coverage:** 7 modes ported (T1), dispatch+isolation+fallback (T2), tray picker Echo-first 3×4 (T3), Mood+Character kid controls + persistence + signals (T4), Size slider+surprise (T5), Trace fades/stays with echo/etch exemption (T6), Echo edge/cadence deltas (T7), ghost-trail eradication incl. legacy + currents/orbits stragglers (T8), audio-reactivity + kill-switch, stamps never react (T9), signals/summaries (T10), dev dials fallback chain (T11), regression+docs (T12), preview+human pass (T13). Palette-over-theme: registry modes ignore theme by construction (T2 passes theme but modes use their palettes) — resolved decision honored without extra code.
- **Known judgment calls:** trace 'stays' freeze semantics per mode (uniform, bounded by caps); echo/etch exempt from Trace chip; reactivity multipliers ≤ +25 %; phase2/phase4 cycle-order assertions refreshed (authorized, noted in commits).
- **Type consistency check:** `canvas.regState/regId`, `ensureRegState(mode)`, `applySavedModeControls(mode)`, `saveModeControl(mode, control, value)`, `getModeControls(profileId)`, `applyVisualReactivity(profileId)`, `window.CALM_VIS.energy`, `applyControl(state, kind, id)` with kinds `mood|character|size|sizeRandom|trace` — names match across all tasks.
