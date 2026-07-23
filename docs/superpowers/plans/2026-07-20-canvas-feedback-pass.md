# Canvas Feedback Pass (Spec 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the first iPad field-report fixes: calm-start idle gate, bottom-left quick sidebar, double-tap retirement, the new Invert mode, and a visible version stamp — all on a CI-gated branch off `main`.

**Architecture:** Vanilla JS PWA, no framework/bundler; `src/` is the deploy root. Registry modes live one-per-file in `src/modes/` implementing `{name, tagline, controls, applyControl, init, pointer, tick, idle}` on `window.VARIANTS`; `app.js` dispatches via `window.CALM_MODES`. All work follows the repo's locked conventions: transparent canvas + `destination-out` erases, panel exclusivity via `closeOtherPanels`, per-profile prefs mutate-and-write-back, signals via `recordSignal`.

**Tech Stack:** Vanilla JS, Web Audio (untouched this pass), Playwright standalone test scripts against `http://localhost:8080` (server: `npx http-server src -p 8080 -s`).

**Branch:** create `codex/canvas-feedback-pass` off current `main` before Task B1. Never push; the orchestrator opens the PR (CI gate now runs the battery on PRs).

**Spec:** `docs/superpowers/specs/2026-07-20-canvas-feedback-pass-design.md`. F6 (echo sharpness) is human-only — no task here.

**House rules for every task:** TDD (RED observed before implementation); stage explicit paths only (untracked media in repo root must never be staged); reuse the running :8080 server (`curl -s -o /dev/null -w "%{http_code}" localhost:8080` → 200 means reuse; never start a second server on 8080); temp probes only as `tests/_probe-*.mjs`, deleted before commit.

---

### Task B1: phase11 scaffold + Calm start (F1)

**Files:**
- Create: `tests/phase11-test.mjs`
- Modify: `src/modes/morph.js` (~314–330 init seed + tick respawn), `src/modes/bloom.js` (~751–756 idle spawn), `src/modes/mandala.js` (idle ambience section ~344+), `src/modes/currents.js` (idle motes), `src/modes/orbits.js` (ambient idle spawn)

The rule: after `init()` (which both Clear and mode-switch trigger — both re-init `regState`), a mode generates **nothing** until its `pointer(state, x, y, 'down')` fires once. Touch-born content and its aftermath are untouched.

- [ ] **Step 1: Scaffold phase11.** Copy the harness preamble of `tests/phase10-test.mjs` (everything from the imports through the profile-seeding and enter-canvas setup — the block before its first `await check(`) into a new `tests/phase11-test.mjs` verbatim, then rename the seeded profile ids/names from `am1`/`am2` to `cf1`/`cf2` throughout the copied block. Keep the same `check()` helper and final summary/exit-code lines (copy those from the end of phase10 too, with the label `Phase 11`).

- [ ] **Step 2: Write the failing calm-start check** (first check in phase11):

```js
await check('Calm start: no self-generated content before first touch', async () => {
  const dirty = [];
  for (const m of ['morph', 'bloom', 'mandala', 'currents', 'orbits']) {
    await page.evaluate((mm) => { switchToMode(MODES.indexOf(mm), 'test'); }, m);
    await page.waitForTimeout(200);
    await page.evaluate(() => { if (isRegistryMode(MODES[state.canvasMode])) window.CALM_MODES.get(MODES[state.canvasMode]).applyControl(canvas.regState, 'trace', 'fades'); });
    await page.click('#btn-clear');
    await page.waitForTimeout(6000); // longer than bloom's 5s idle-spawn delay
    const lit = await page.evaluate(() => {
      const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
      return n;
    });
    if (lit > 2) dirty.push(`${m}=${lit}`); // ~zero: allow a stray anti-aliased sample
  }
  if (dirty.length) throw new Error('self-generated: ' + dirty.join(','));
  return 'all 5 modes stay blank untouched';
});

await check('Calm start: idle life resumes after first touch', async () => {
  await page.evaluate(() => { switchToMode(MODES.indexOf('morph'), 'test'); });
  await page.waitForTimeout(200);
  await page.click('#btn-clear');
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 300, box.y + 400); // single touch wakes the mode
  await page.waitForTimeout(4500); // > morph idleSpawnDelay (2–4s)
  const lit = await page.evaluate(() => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
    return n;
  });
  if (lit < 3) throw new Error('idle life did not resume: lit=' + lit);
  return 'morph idle life resumed post-touch (' + lit + ')';
});
```

NOTE: `switchToMode(index, via)` is the production mode-change path (grep its exact signature in app.js and adapt the `via` argument if it differs). If `switchToMode` is not globally reachable from `page.evaluate`, use the same mechanism phase10's checks use to change modes and note the adaptation.

- [ ] **Step 3: RED.** Run `node tests/phase11-test.mjs` → the first check must FAIL listing at least `morph` (instant idle seed) and `bloom` (5s spawn). If mandala/currents/orbits idle ambience doesn't trip the >2 threshold, record their actual values in a comment — the gate still gets added to them (spec names all five).

- [ ] **Step 4: Implement the gate — same pattern in all five files.** In each mode's `init()` returned state object add `hasTouched: false,`. In each mode's `pointer` function, at the `'down'` branch (or the top, if the function handles kinds via ifs) add `state.hasTouched = true;` (mandala/currents/orbits/bloom/morph all have pointer functions — put it before any early returns so ANY down-touch wakes the mode). Then gate each self-generation site:

  - `src/modes/morph.js`: DELETE the init-time seed block (the lines after `// seed idle ambient shape immediately so canvas feels alive pre-touch` that assign `st.idleShape = makeShape(...)` and its drift lines — the state starts with `idleShape: null`). Then find the tick-side idle respawn (search `idleSpawnDelay` usages in `tick`) and wrap its spawn condition with `state.hasTouched &&`. Update the deleted comment's intent: `// calm start: idle ambient shape only after the kid's first touch (Spec 4 F1)`.
  - `src/modes/bloom.js` (~line 751): the spontaneous-bloom condition `if (state.idleTimer > 5 && !state.idleBloomSpawned)` becomes `if (state.hasTouched && state.idleTimer > 5 && !state.idleBloomSpawned)`.
  - `src/modes/mandala.js`: in the `// ---- idle ambience` section (~line 344+), wrap the spark-emission body with `if (!state.hasTouched) return;` (or guard the emit call) so idle sparks wait for touch.
  - `src/modes/currents.js`: find where idle motes are spawned/maintained (the `motes` array population, ~line 187–199 region and any per-frame top-up) and gate spawning with `state.hasTouched` (existing motes from touches keep flowing).
  - `src/modes/orbits.js`: find the ambient/random idle spawn (the `Math.random()`-gated ambient spawn noted in the A8 probes) and gate it with `state.hasTouched`.

  In every case: gate the SPAWN, not the update/draw of already-alive content.

- [ ] **Step 5: GREEN.** `node tests/phase11-test.mjs` → both checks pass. Then regression on touched modes: `node tests/phase10-test.mjs` (24/24 — its drain-gate check touches each mode BEFORE settling, so calm start must not break it; if a budget now reads lower that's fine, budgets are ceilings) and `node tests/phase5-test.mjs` (36/36).

- [ ] **Step 6: Commit.**
```bash
git add tests/phase11-test.mjs src/modes/morph.js src/modes/bloom.js src/modes/mandala.js src/modes/currents.js src/modes/orbits.js
git commit -m "feat: calm start — no self-generated content before first touch"
```

---

### Task B2: Quick sidebar (F2)

**Files:**
- Modify: `src/index.html` (canvas-ui block), `src/styles.css` (panel family), `src/app.js` (handlers + exclusivity + signals)
- Test: `tests/phase11-test.mjs`

- [ ] **Step 1: Failing checks** (append to phase11):

```js
await check('Sidebar opens, is exclusive, and 48px targets', async () => {
  await page.click('#sidebar-tab');
  await page.waitForSelector('#quick-sidebar.open');
  await page.click('#btn-sound'); // opening another panel must close the sidebar
  await page.waitForTimeout(300);
  const sidebarOpen = await page.evaluate(() => document.getElementById('quick-sidebar').classList.contains('open'));
  if (sidebarOpen) throw new Error('sidebar not exclusive with sound panel');
  await page.click('#btn-sound'); // close sound panel again
  await page.click('#sidebar-tab');
  await page.waitForSelector('#quick-sidebar.open');
  const sizes = await page.evaluate(() => ['sidebar-tab','sidebar-erase','sidebar-prev','sidebar-next'].map(id => {
    const r = document.getElementById(id).getBoundingClientRect(); return Math.min(r.width, r.height);
  }));
  if (sizes.some(s => s < 48)) throw new Error('touch target <48px: ' + sizes.join(','));
  return 'open+exclusive+48px';
});

await check('Sidebar erase clears, prev/next change mode and signal', async () => {
  const before = await page.evaluate(() => MODES[state.canvasMode]);
  await page.click('#sidebar-next');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => MODES[state.canvasMode]);
  if (after === before) throw new Error('next did not change mode');
  await page.click('#sidebar-prev');
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => MODES[state.canvasMode]);
  if (back !== before) throw new Error('prev did not return: ' + back);
  // draw, then erase via sidebar
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.move(box.x + 200, box.y + 300); await page.mouse.down();
  for (let k = 0; k < 8; k++) { await page.mouse.move(box.x + 200 + k * 25, box.y + 300 + k * 10); await page.waitForTimeout(30); }
  await page.mouse.up();
  await page.click('#sidebar-erase');
  await page.waitForTimeout(400);
  const lit = await page.evaluate(() => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
    return n;
  });
  if (lit > 2) throw new Error('erase left content: ' + lit); // calm start keeps it blank after clear
  const sig = await page.evaluate(() => readSignals(state.activeProfileId).filter(e => e.type === 'mode_select' && e.payload && e.payload.via === 'sidebar').length);
  if (sig < 2) throw new Error('sidebar mode_select signals missing: ' + sig);
  return 'erase+prev/next+signals OK';
});
```

- [ ] **Step 2: RED** — both fail (`#sidebar-tab` doesn't exist).

- [ ] **Step 3: Markup.** In `src/index.html`, inside the canvas screen's `.canvas-ui` container (same block that holds `#btn-back` etc.), add:

```html
<div id="quick-sidebar" class="quick-sidebar">
  <button id="sidebar-tab" aria-label="Quick controls" aria-expanded="false">⋯</button>
  <div class="sidebar-actions">
    <button id="sidebar-erase" aria-label="Erase canvas">✕</button>
    <button id="sidebar-prev" aria-label="Previous mode">‹</button>
    <button id="sidebar-next" aria-label="Next mode">›</button>
  </div>
</div>
```

- [ ] **Step 4: CSS.** In `src/styles.css`, after the corner-button block (~line 556):

```css
/* --- Quick sidebar (Spec 4 F2): bottom-left pull-out --- */
.quick-sidebar {
  position: absolute;
  left: calc(var(--space-lg) + env(safe-area-inset-left, 0));
  bottom: calc(var(--space-lg) + env(safe-area-inset-bottom, 0));
  display: flex;
  flex-direction: column-reverse; /* tab stays at the bottom, actions rise above it */
  gap: 10px;
  align-items: flex-start;
}
.quick-sidebar button {
  pointer-events: auto;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: rgba(21, 32, 48, 0.7);
  color: var(--text-mid);
  font-size: 1.25rem;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: background var(--transition-fast), opacity var(--transition-normal), transform var(--transition-normal);
}
#sidebar-tab { opacity: 0.45; } /* collapsed tab stays quiet */
.quick-sidebar.open #sidebar-tab { opacity: 1; background: var(--accent-dim); }
.quick-sidebar .sidebar-actions {
  display: flex; flex-direction: column; gap: 10px;
  opacity: 0; transform: translateY(8px); pointer-events: none;
  transition: opacity var(--transition-normal), transform var(--transition-normal);
}
.quick-sidebar.open .sidebar-actions { opacity: 1; transform: none; pointer-events: auto; }
```

(Match the exact custom-property names used by the sibling `#btn-back` block — if the file uses different tokens for radius/transition, mirror those.)

- [ ] **Step 5: Handlers in app.js.** Near the other panel wiring (after the style-tray handlers): element refs `var $quickSidebar/…$sidebarTab/$sidebarErase/$sidebarPrev/$sidebarNext` via `getElementById`. Extend `closeOtherPanels(except)` (line ~3078) with a sidebar branch exactly parallel to the existing panels (`if (except !== 'sidebar') $quickSidebar.classList.remove('open');`) and register the sidebar's own open toggle to call `closeOtherPanels('sidebar')`. Tab handler toggles `.open` + `aria-expanded`. Erase handler invokes the SAME function the existing `#btn-clear` listener calls (grep `$btnClear.addEventListener` and reuse its handler — do not duplicate clear logic; the existing path already records `clear_canvas`). Prev/Next:

```js
function sidebarStep(delta) {
  var next = (state.canvasMode + delta + MODES.length) % MODES.length;
  switchToMode(next, 'sidebar'); // switchToMode already records mode_select with via
}
$sidebarPrev.addEventListener('click', function() { sidebarStep(-1); });
$sidebarNext.addEventListener('click', function() { sidebarStep(1); });
```

Verify `switchToMode(index, via)` records a `mode_select` signal with the `via` value (grep it); if via values are constrained, add `'sidebar'` wherever the existing values (`'tray'`, `'doubletap'`) are handled. Outside-tap closing: the existing outside-click closer pattern used by the trays should treat the sidebar the same (grep how `#mode-tray` closes on outside pointerdown and mirror it).

- [ ] **Step 6: GREEN** — phase11 all green; then `node tests/phase3-test.mjs` (28/28, sound panel exclusivity untouched) and `node tests/phase10-test.mjs` (24/24, tray exclusivity check now includes the sidebar family via closeOtherPanels — if its exclusivity check enumerates panels explicitly, refresh it to include the sidebar and say so in the commit).

- [ ] **Step 7: Commit.**
```bash
git add src/index.html src/styles.css src/app.js tests/phase11-test.mjs
git commit -m "feat: bottom-left quick sidebar (erase / prev / next)"
```

---

### Task B3: Double-tap retirement (F3)

**Files:**
- Modify: `src/app.js` (double-tap detection ~1233–1266), `tests/phase2-test.mjs` (checks 4–7), `tests/phase10-test.mjs` (render check cycling)
- Test: `tests/phase11-test.mjs`

- [ ] **Step 1: Failing check** (append to phase11):

```js
await check('Double-tap no longer changes mode', async () => {
  const before = await page.evaluate(() => MODES[state.canvasMode]);
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 300, box.y + 400);
  await page.waitForTimeout(100);
  await page.mouse.click(box.x + 300, box.y + 400);
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => MODES[state.canvasMode]);
  if (after !== before) throw new Error('double-tap still cycles: ' + before + ' -> ' + after);
  return 'double-tap inert';
});
```

- [ ] **Step 2: RED** (double-tap still cycles today).

- [ ] **Step 3: Remove the gesture.** In `src/app.js` delete the double-tap detection state (`lastTapTime/lastTapX/lastTapY`, lines ~1233–1235) and the whole `now - lastTapTime < 350 && dist < 50` branch (~1257–1266) including whatever it calls (`cycleMode(...)` or inline switch). If `cycleMode` has no remaining callers after this, delete it too (our-change orphan). The signal type `mode_cycle` stays in `computeSignalSummary` (historical logs may contain it) — only the emitter goes.

- [ ] **Step 4: Refresh the double-tap-dependent tests — intent preserved, mechanism updated.** In `tests/phase2-test.mjs` checks 4–7 (~lines 94–169): replace every `page.mouse.click(400,500) ×2` double-tap pair with a sidebar-next click:

```js
  // AUTHORIZED REFRESH (Spec 4 F3): double-tap cycling removed; the sidebar's
  // Next button is now the sequential mode-step surface. Same assertions.
  await page.click('#sidebar-tab');
  await page.waitForSelector('#quick-sidebar.open');
```
once before check 4, then each former double-tap becomes `await page.click('#sidebar-next'); await page.waitForTimeout(400);` — assertions (Particles, Ripples, Geometric, Freeform, 12-mode wrap) unchanged, and the 8-iteration lap loop keeps its count. NOTE the wrap count stays 12 in B3 and becomes 13 in B4 — B4 owns that refresh; leave a `// count updated in Spec4 B4` breadcrumb.
  In `tests/phase10-test.mjs` render check (~line 59–74): the loop currently advances modes via `page.mouse.dblclick`. Replace the dblclick with `await page.click('#sidebar-next');` (open the sidebar once before the loop) — budgets and assertions unchanged.

- [ ] **Step 5: GREEN ×2** — `node tests/phase11-test.mjs`, `node tests/phase2-test.mjs` (21/21), `node tests/phase10-test.mjs` (24/24) — run phase10 twice (timing-sensitive).

- [ ] **Step 6: Commit.**
```bash
git add src/app.js tests/phase2-test.mjs tests/phase10-test.mjs tests/phase11-test.mjs
git commit -m "feat: retire double-tap cycling in favor of sidebar mode steps"
```

---

### Task B4: Invert mode (F4)

**Files:**
- Create: `src/modes/invert.js`
- Modify: `src/modes/registry.js` (ORDER), `src/app.js` (MODES, MODE_LABELS, TRACE_MODES), `src/index.html` (script tag)
- Test: `tests/phase11-test.mjs`

Design (from spec): a soft luminous field slowly self-generates (AFTER first touch — calm-start native); strokes CARVE darkness through it via destination-out; `fades` = carve heals over ~15s, `stays` = carve persists until Clear. Two offscreen layers at device resolution (echo's DPR convention): `lightCanvas` (the regenerating field) and `carveCanvas` (the kid's marks, white soft brush). Composite per frame: draw light field, then punch the carve mask through it with destination-out.

- [ ] **Step 1: Failing checks** (append to phase11):

```js
await check('Invert: registered, in tray, field blooms only after touch', async () => {
  const reg = await page.evaluate(() => window.CALM_MODES.list.includes('invert') && MODES.includes('invert'));
  if (!reg) throw new Error('invert not registered');
  await page.click('#btn-modes'); await page.waitForSelector('#mode-tray.open');
  const chips = await page.locator('#mode-options .mode-option').count();
  if (chips !== 13) throw new Error('tray chips=' + chips);
  await page.click('#btn-modes'); // close
  await page.evaluate(() => { switchToMode(MODES.indexOf('invert'), 'test'); });
  await page.click('#btn-clear');
  await page.waitForTimeout(2500);
  const litBefore = await page.evaluate(() => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
    return n;
  });
  if (litBefore > 2) throw new Error('field bloomed pre-touch: ' + litBefore);
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 380, box.y + 500);
  await page.waitForTimeout(3000);
  const litAfter = await page.evaluate(() => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
    return n;
  });
  if (litAfter < 30) throw new Error('field did not bloom: ' + litAfter);
  return `blank->bloom (${litBefore}->${litAfter})`;
});

await check('Invert: stroke carves darkness; stays persists; fades heals', async () => {
  // stays first: carve and confirm the carved line stays dark
  await page.evaluate(() => window.CALM_MODES.get('invert').applyControl(canvas.regState, 'trace', 'stays'));
  await page.waitForTimeout(2500); // let field brighten
  const box = await page.locator('#main-canvas').boundingBox();
  const sampleCarve = () => page.evaluate(() => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const dpr = c.width / c.clientWidth;
    // sample along the carved horizontal path y=350 (CSS) from x=200..500
    let dark = 0, total = 0;
    const d = x.getImageData(Math.round(200 * dpr), Math.round(348 * dpr), Math.round(300 * dpr), Math.round(4 * dpr)).data;
    for (let j = 3; j < d.length; j += 40) { total++; if (d[j] <= 8) dark++; }
    return dark / total;
  });
  await page.mouse.move(box.x + 200, box.y + 350); await page.mouse.down();
  for (let k = 0; k <= 12; k++) { await page.mouse.move(box.x + 200 + k * 25, box.y + 350); await page.waitForTimeout(25); }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const carvedStays = await sampleCarve();
  if (carvedStays < 0.5) throw new Error('stays carve too weak: ' + carvedStays);
  await page.waitForTimeout(5000);
  const stillCarved = await sampleCarve();
  if (stillCarved < 0.4) throw new Error('stays carve healed: ' + stillCarved);
  // fades: same carve heals substantially within ~18s
  await page.evaluate(() => window.CALM_MODES.get('invert').applyControl(canvas.regState, 'trace', 'fades'));
  await page.waitForTimeout(18000);
  const healed = await sampleCarve();
  if (healed > stillCarved * 0.5) throw new Error('fades did not heal: ' + stillCarved + ' -> ' + healed);
  return `carve ${carvedStays.toFixed(2)} stays ${stillCarved.toFixed(2)} healed ${healed.toFixed(2)}`;
});
```

- [ ] **Step 2: RED** ('invert not registered').

- [ ] **Step 3: Create `src/modes/invert.js`** (full implementation — follow the sibling files' IIFE + var style):

```js
// Invert — the pattern takes away. A soft luminous field slowly self-
// generates (only after the kid's first touch: Spec 4 calm start), and
// strokes CARVE darkness through it (destination-out). Trace 'fades' heals
// the carving back into light over ~15s; 'stays' keeps it until Clear.
(function () {
  var MOODS = [
    { id: 'lagoon',   name: 'Lagoon',   colors: ['#2e5f6e', '#48b5a0', '#7fd4c1', '#a8e6d7'] },
    { id: 'ember',    name: 'Ember',    colors: ['#5e3a2e', '#c0764a', '#e0a878', '#f2d0a8'] },
    { id: 'twilight', name: 'Twilight', colors: ['#3a3a5e', '#7a6aae', '#a89ad0', '#d0c8ec'] },
    { id: 'moon',     name: 'Moon',     colors: ['#3a4450', '#7a8a9a', '#aebecb', '#dce6ee'] },
  ];
  var BLOB_COUNT = 22;          // drifting light sources painting the field
  var FIELD_ALPHA = 0.012;      // per-frame blob paint alpha (slow bloom, no strobe)
  var FIELD_CAP_VEIL = 0.010;   // destination-out veil keeps field at soft equilibrium
  var HEAL_VEIL = 0.045;        // carve-mask fade per frame in 'fades' (~15s to clear)
  var BRUSH_BASE = 34;          // carve brush radius (px, scaled by size control)

  function makeLayer(w, h, dpr) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    var cx = c.getContext('2d');
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function paletteRgb(state) {
    var mood = MOODS.filter(function (m) { return m.id === state.moodId; })[0] || MOODS[0];
    return mood.colors;
  }

  function spawnBlobs(state, w, h) {
    state.blobs = [];
    for (var i = 0; i < BLOB_COUNT; i++) {
      state.blobs.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 60 + Math.random() * 110,
        vx: (Math.random() * 2 - 1) * 7, vy: (Math.random() * 2 - 1) * 7,
        col: Math.floor(Math.random() * 4),
      });
    }
  }

  window.VARIANTS = window.VARIANTS || {};
  window.VARIANTS['invert'] = {
    name: 'Invert',
    tagline: 'Carve calm darkness through a slowly glowing field of light.',
    controls: {
      moods: MOODS,
      // no character row for v1 (field textures are a backlog seed)
    },
    applyControl: function (state, kind, id) {
      if (kind === 'mood') { state.moodId = id; }                    // new light picks up new palette; old fades via veil
      else if (kind === 'size') { var s = Number(id); if (s >= 0.6 && s <= 1.6) state.sizeMul = s; }
      else if (kind === 'sizeRandom') { state.sizeRandom = !!id && id !== 'false'; }
      else if (kind === 'trace') { if (id === 'fades' || id === 'stays') state.traceMode = id; }
    },
    init: function (w, h, theme) {
      var dpr = (theme && theme.dpr) || 1;
      var st = {
        w: w, h: h, dpr: dpr, theme: theme,
        hasTouched: false,           // calm start (Spec 4 F1)
        moodId: MOODS[0].id,
        sizeMul: 1, sizeRandom: false,
        traceMode: 'fades',
        lightCanvas: makeLayer(w, h, dpr),
        carveCanvas: makeLayer(w, h, dpr),
        blobs: [],
        pointerDown: false, px: 0, py: 0,
      };
      spawnBlobs(st, w, h);
      return st;
    },
    pointer: function (state, x, y, kind) {
      if (kind === 'down') {
        state.hasTouched = true;
        state.pointerDown = true;
        state.px = x; state.py = y;
        carveAt(state, x, y);
      } else if (kind === 'move' && state.pointerDown) {
        // stamp the carve densely along the segment so fast strokes stay solid
        var dx = x - state.px, dy = y - state.py;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var steps = Math.max(1, Math.ceil(dist / 8));
        for (var i = 1; i <= steps; i++) carveAt(state, state.px + dx * i / steps, state.py + dy * i / steps);
        state.px = x; state.py = y;
      } else if (kind === 'up') {
        state.pointerDown = false;
      }
    },
    tick: function (state, ctx, dt, w, h) {
      if (state.w !== w || state.h !== h) {  // per-frame self-heal on resize (repo convention)
        state.w = w; state.h = h;
        state.lightCanvas = makeLayer(w, h, state.dpr);
        state.carveCanvas = makeLayer(w, h, state.dpr);
        spawnBlobs(state, w, h);
      }
      var lctx = state.lightCanvas.getContext('2d');
      // field equilibrium veil (also lets a mood switch cross-fade naturally)
      lctx.save();
      lctx.globalCompositeOperation = 'destination-out';
      lctx.fillStyle = 'rgba(0,0,0,' + FIELD_CAP_VEIL + ')';
      lctx.fillRect(0, 0, w, h);
      lctx.restore();
      if (state.hasTouched) {
        var cols = paletteRgb(state);
        var E = (window.CALM_VIS && window.CALM_VIS.energy) || 0;   // audio-reactive glow, <= +25% (spec law)
        var alpha = Math.min(0.02, FIELD_ALPHA * (1 + 0.25 * E));
        for (var i = 0; i < state.blobs.length; i++) {
          var b = state.blobs[i];
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < -b.r) b.x = w + b.r; if (b.x > w + b.r) b.x = -b.r;
          if (b.y < -b.r) b.y = h + b.r; if (b.y > h + b.r) b.y = -b.r;
          var g = lctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          g.addColorStop(0, hexA(cols[b.col], alpha));
          g.addColorStop(1, hexA(cols[b.col], 0));
          lctx.fillStyle = g;
          lctx.beginPath(); lctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); lctx.fill();
        }
      }
      // fades: heal the carving slowly back into light
      if (state.traceMode === 'fades') {
        var cctx = state.carveCanvas.getContext('2d');
        cctx.save();
        cctx.globalCompositeOperation = 'destination-out';
        cctx.fillStyle = 'rgba(0,0,0,' + HEAL_VEIL + ')';
        cctx.fillRect(0, 0, w, h);
        cctx.restore();
      }
      // composite: light field, minus the carve mask
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(state.lightCanvas, 0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(state.carveCanvas, 0, 0, w, h);
      ctx.restore();
    },
    idle: function () { /* all motion lives in tick (echo convention) */ },
  };

  function carveAt(state, x, y) {
    var cctx = state.carveCanvas.getContext('2d');
    var r = BRUSH_BASE * state.sizeMul * (state.sizeRandom ? (0.75 + Math.random() * 0.5) : 1);
    var g = cctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = g;
    cctx.beginPath(); cctx.arc(x, y, r, 0, Math.PI * 2); cctx.fill();
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
})();
```

- [ ] **Step 4: Register everywhere.**
  - `src/modes/registry.js` line 21: ORDER becomes `['echo', 'currents', 'orbits', 'mandala', 'bloom', 'morph', 'etch', 'invert']`.
  - `src/app.js` `MODES` (line ~646): insert `'invert'` after `'etch'` (13 entries).
  - `src/app.js` `MODE_LABELS` (line ~648): add `invert: 'Invert',`.
  - `src/app.js` `TRACE_MODES` (line ~657): add `'invert'` (its Trace chip is real).
  - `src/index.html`: add `<script src="modes/invert.js"></script>` alongside the other seven, before `app.js`.

- [ ] **Step 5: Refresh the 12-count assertions this insertion breaks.** Grep tests for `12` mode counts: phase10 "Mode tray opens and lists 12 modes" → 13 (update name + assertion); phase2's wrap comment/loop from B3 → the lap is now 13 modes, so the loop count increments by one (update the breadcrumb comment); any `MODES.length`-adjacent literal in phase10's render check. Each refresh gets an `// AUTHORIZED REFRESH (Spec 4 B4): 13th mode` comment.

- [ ] **Step 6: GREEN** — `node tests/phase11-test.mjs`, `node tests/phase2-test.mjs`, `node tests/phase10-test.mjs` ×2.

- [ ] **Step 7: Commit.**
```bash
git add src/modes/invert.js src/modes/registry.js src/app.js src/index.html tests/phase11-test.mjs tests/phase2-test.mjs tests/phase10-test.mjs
git commit -m "feat: Invert mode — carve darkness through a self-healing light field"
```

---

### Task B5: Version stamp + SW v6 (F5)

**Files:**
- Modify: `src/app.js` (APP_VERSION + dashboard render), `src/index.html` (footer/header elements), `src/sw.js` (CACHE_NAME + ASSETS)
- Test: `tests/phase11-test.mjs`, refresh `tests/soundscape-test.mjs` + `tests/phase10-test.mjs` cache assertions

- [ ] **Step 1: Failing checks** (append to phase11):

```js
await check('Version stamp visible in parent and dev; matches SW cache', async () => {
  const sw = await (await page.request.get(`${BASE}/sw.js`)).text();
  const m = sw.match(/calm-station-(v\d+)/);
  const appV = await page.evaluate(() => window.APP_VERSION);
  if (!m || appV !== m[1]) throw new Error('APP_VERSION ' + appV + ' != sw ' + (m && m[1]));
  const devText = await page.textContent('#screen-dev');
  if (!devText.includes(appV)) throw new Error('version not in dev dashboard');
  return appV + ' stamped';
});

await check('SW v6 precaches invert.js', async () => {
  const body = await (await page.request.get(`${BASE}/sw.js`)).text();
  if (!body.includes('modes/invert.js')) throw new Error('invert.js missing from ASSETS');
  if (!body.includes('calm-station-v6')) throw new Error('cache not v6');
  return 'v6 + invert.js';
});
```

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement.**
  - `src/app.js` near the top constants: `window.APP_VERSION = 'v6'; // keep equal to sw.js CACHE_NAME suffix — the visible answer to "which build am I on"`.
  - Dev dashboard: in the dev screen header render (the element containing the dashboard title — grep `screen-dev` header markup in index.html), append a small `<span class="app-version">` populated with `APP_VERSION` at render time. Parent dashboard: same pattern in its footer (grep `screen-parent` markup; add `<p id="parent-version" class="app-version">` and set its text in the parent render function to `'Calm Station ' + window.APP_VERSION`).
  - `src/styles.css`: `.app-version { opacity: 0.5; font-size: 0.75rem; }` (match neighboring typography tokens).
  - `src/sw.js`: `CACHE_NAME` → `'calm-station-v6'`; ASSETS += `'./modes/invert.js',` next to the other mode files.
  - Refresh cache assertions: `tests/soundscape-test.mjs` `calm-station-v5` → `v6` (and its return label), `tests/phase10-test.mjs` SW check `v5` → `v6` (name + assertion + label).

- [ ] **Step 4: GREEN** — phase11, soundscape (26/26), phase10 (check counts unchanged).

- [ ] **Step 5: Commit.**
```bash
git add src/app.js src/index.html src/styles.css src/sw.js tests/phase11-test.mjs tests/soundscape-test.mjs tests/phase10-test.mjs
git commit -m "feat: visible APP_VERSION stamp + SW v6 with invert precache"
```

---

### Task B6: Full battery ×2 + docs

**Files:**
- Modify: `CLAUDE.md`, `TODO.md`

- [ ] **Step 1: Full battery ×2** (server on :8080):

```bash
for run in 1 2; do
  for t in tests/phase1-test.mjs tests/phase2-test.mjs tests/phase3-test.mjs tests/phase4-test.mjs \
           tests/phase5-test.mjs tests/phase6-test.mjs tests/phase7-test.mjs tests/phase8-test.mjs \
           tests/phase9-test.mjs tests/soundscape-test.mjs tests/phase10-test.mjs tests/phase11-test.mjs; do
    node "$t" || echo "RED: $t (run $run)"
  done
done
```
All green ×2. Any red: investigate root cause first — BLOCKED beats blind patches.

- [ ] **Step 2: Docs.** `CLAUDE.md` Canvas Rendering paragraph: 12 → **13** modes (add invert to the registry list), replace the "double-tap cycling" wording with "mode tray, quick sidebar (bottom-left: erase / prev / next); double-tap retired in Spec 4", mention calm start in one clause, and note the version stamp. `TODO.md`: strike/annotate anything superseded (double-tap), add Spec 4 backlog seeds (invert field textures as Characters; calm-start dev dial; sidebar long-press → mode tray).

- [ ] **Step 3: Commit.**
```bash
git add CLAUDE.md TODO.md
git commit -m "docs: canvas feedback pass architecture notes"
```

---

## Self-review notes

- **Spec coverage:** F1→B1, F2→B2, F3→B3, F4→B4, F5→B5, docs/battery→B6; F6 human-only (excluded by design). Calm-start applies to invert natively (its field gates on `hasTouched` in B4's code).
- **Ordering constraint:** B2 before B3 (the sidebar must exist before tests are refreshed onto it); B4 before B5 (invert.js must exist before ASSETS lists it — SW bump happens once, in B5).
- **Known judgment call:** invert's aesthetic quality (blob sizes, alphas, heal feel) is machine-checked only for mechanics; the constants in B4 are starting values — the human iPad pass judges the feel, same as Spec 2's demo loop.
- **Type consistency check:** `state.hasTouched` (B1, B4), `switchToMode(index, via)` with `'sidebar'` via (B2, B3), `makeLayer(w,h,dpr)` local to invert.js, `window.APP_VERSION` (B5) — names match across tasks.
