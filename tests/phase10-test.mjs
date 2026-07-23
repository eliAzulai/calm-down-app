// Phase 10 test — animation mode registry + precache (Task 1: port variants).
// Requires: python3 -m http.server 8080 --directory src   (or npx http-server src -p 8080)
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
let passed = 0, failed = 0;
const consoleErrors = [];

function pass(name, detail) { passed++; console.log(`[PASS] ${name}${detail ? ' — ' + detail : ''}`); }
function fail(name, detail) { failed++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
async function check(name, fn) {
  try { const d = await fn(); pass(name, typeof d === 'string' ? d : ''); }
  catch (e) { fail(name, e.message); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

// Seed two profiles so we can enter the canvas directly.
await page.addInitScript(() => {
  localStorage.setItem('calm-station-profiles',
    JSON.stringify([
      { id: 'am1', name: 'ModeKid', icon: 'flame', theme: 'ocean' },
      { id: 'am2', name: 'OtherKid', icon: 'flame', theme: 'forest' },
    ]));
});

await page.goto(BASE);
await page.click('.profile-card.filled');
await page.waitForSelector('#screen-canvas.active');

await check('Registry exposes 7 modes, echo first', async () => {
  const list = await page.evaluate(() => window.CALM_MODES && window.CALM_MODES.list);
  if (!list || list.length !== 7) throw new Error('list=' + JSON.stringify(list));
  if (list[0] !== 'echo') throw new Error('echo not first: ' + list[0]);
  return list.join(',');
});

await check('SW precaches mode files at v5', async () => {
  const body = await (await page.request.get(`${BASE}/sw.js`)).text();
  const wanted = ['modes/registry.js','modes/echo.js','modes/etch.js','modes/currents.js','modes/orbits.js','modes/mandala.js','modes/bloom.js','modes/morph.js'];
  const missing = wanted.filter(w => !body.includes(w));
  if (missing.length) throw new Error('missing: ' + missing.join(','));
  if (!body.includes('calm-station-v5')) throw new Error('cache not v5');
  return 'v5 + 8 files';
});

await check('New modes render pixels via sidebar-next cycling', async () => {
  // AUTHORIZED REFRESH (Spec 4 B3): double-tap cycling removed; the sidebar's
  // Next button replaces it as the sequential mode-step surface. Open the
  // sidebar once, up front — it stays open across repeated Next taps (B2
  // guaranteed this) so it doesn't need reopening each iteration.
  // OVERLAP CHECK: the pixel sampling below reads the canvas element's own
  // bitmap via getImageData — DOM chrome sitting on top of it (the open
  // sidebar) never touches that data. The drag strokes run from (200,300)
  // out to (200+7*30, 300+7*12) = (410,384), and the sidebar occupies only
  // the bottom-left corner (~24-100px from the left/bottom edges at this
  // 768x1024 viewport) — well clear of that stroke path.
  await page.click('#sidebar-tab');
  await page.waitForSelector('#quick-sidebar.open');

  const results = {};
  for (let i = 0; i < 12; i++) {
    const mode = await page.evaluate(() => MODES[state.canvasMode]);
    const box = await page.locator('#main-canvas').boundingBox();
    await page.mouse.move(box.x + 200, box.y + 300); await page.mouse.down();
    for (let k = 0; k < 8; k++) { await page.mouse.move(box.x + 200 + k * 30, box.y + 300 + k * 12); await page.waitForTimeout(40); }
    await page.mouse.up();
    // Poll until the mode has painted, rather than sampling at a fixed instant:
    // bloom builds its ordered pattern slowly and sparsely (bud->open lifecycle),
    // so a fixed 500ms wait races it. Pass as soon as it lights up; a genuinely
    // dead mode never crosses the threshold and still fails after the budget.
    let lit = 0;
    for (let t = 0; t < 16; t++) { // up to ~2.4s at 150ms steps
      lit = await page.evaluate(() => {
        const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
        return n;
      });
      if (lit >= 3) break;
      await page.waitForTimeout(150);
    }
    results[mode] = lit;
    await page.click('#sidebar-next');
    await page.waitForTimeout(350);
  }
  const dead = Object.entries(results).filter(([, n]) => n < 3).map(([m]) => m);
  if (dead.length) throw new Error('dead modes: ' + dead.join(',') + ' ' + JSON.stringify(results));
  return Object.keys(results).length + ' modes alive';
});

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

await check('Rotation preserves registry-mode state convention', async () => {
  // Lock the A2-review convention: modes self-heal on resize via per-frame w/h;
  // rotation must NOT wipe non-echo mode state (bloom garden survives).
  await page.evaluate(() => { state.canvasMode = MODES.indexOf('bloom'); });
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 300, box.y + 400); // plant a bloom
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => canvas.regState && canvas.regState.blooms && canvas.regState.blooms.length);
  await page.setViewportSize({ width: 1024, height: 768 }); // rotate
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({
    blooms: canvas.regState && canvas.regState.blooms && canvas.regState.blooms.length,
    errors: window.__pageErrors ? window.__pageErrors.length : 0,
  }));
  await page.setViewportSize({ width: 768, height: 1024 }); // rotate back
  await page.waitForTimeout(500);
  if (!before || !after.blooms || after.blooms < before) throw new Error(`blooms ${before} -> ${after.blooms}`);
  return `garden survived rotation (${before} blooms)`;
});

await check('Mode tray fully usable at mobile viewports', async () => {
  for (const vp of [{ width: 375, height: 667 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(400);
    await page.click('#btn-modes');
    await page.waitForSelector('#mode-tray.open');
    const box = await page.locator('#mode-tray').boundingBox();
    if (box.y < 0 || box.x < 0 || box.y + box.height > vp.height + 1) throw new Error(`${vp.width}x${vp.height}: tray box ${JSON.stringify(box)}`);
    // every chip reachable (scroll within tray allowed)
    const chip = page.locator('#mode-options .mode-option[data-mode="drawing"]');
    await chip.scrollIntoViewIfNeeded();
    const cb = await chip.boundingBox();
    if (!cb || cb.y + cb.height > vp.height + 1) throw new Error(`${vp.width}x${vp.height}: drawing chip unreachable`);
    await page.click('#btn-modes'); // close
    await page.waitForTimeout(200);
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(400);
  return 'both mobile viewports OK';
});

await check('Panels are mutually exclusive', async () => {
  await page.click('#btn-sound'); await page.waitForSelector('#sound-panel.open');
  await page.click('#btn-modes'); await page.waitForSelector('#mode-tray.open');
  const soundOpen = await page.evaluate(() => document.getElementById('sound-panel').classList.contains('open'));
  if (soundOpen) throw new Error('sound panel stayed open');
  await page.click('#btn-modes'); await page.waitForTimeout(200);
  return 'exclusive';
});

await check('Style tray shows mood+character for registry mode', async () => {
  await page.evaluate(() => { switchToMode(MODES.indexOf('bloom'), 'tray'); });
  await page.waitForTimeout(300);
  await page.click('#btn-style');
  await page.waitForSelector('#style-tray.open');
  const moods = await page.locator('#style-moods .swatch').count();
  const chars = await page.locator('#style-chars .chip').count();
  if (moods !== 4 || chars < 3) throw new Error(`moods=${moods} chars=${chars}`);
  return `${moods} moods, ${chars} chars`;
});

await check('Control choice applies, persists per profile, and signals', async () => {
  const targetMood = await page.evaluate(() => window.CALM_MODES.get('bloom').controls.moods[2].id);
  await page.click(`#style-moods .swatch[data-id="${targetMood}"]`);
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => canvas.regState.moodId);
  if (applied !== targetMood) throw new Error(`applied=${applied} want=${targetMood}`);
  // Selection must NOT close the tray (regression: full re-render detached
  // the clicked button mid-bubble, so the document-level outside-click
  // closer saw a detached e.target and closed the tray on every pick).
  const stillOpen = await page.evaluate(() => document.getElementById('style-tray').classList.contains('open'));
  if (!stillOpen) throw new Error('tray closed on selection');
  // and a second selection in the same open session must also work:
  const mood2 = await page.evaluate(() => window.CALM_MODES.get('bloom').controls.moods[1].id);
  await page.click(`#style-moods .swatch[data-id="${mood2}"]`);
  await page.waitForTimeout(200);
  const applied2 = await page.evaluate(() => canvas.regState.moodId);
  if (applied2 !== mood2) throw new Error('second pick failed: ' + applied2);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-am1-prefs')));
  const saved = prefs.modeControls && prefs.modeControls.bloom && prefs.modeControls.bloom.mood;
  if (saved !== mood2) throw new Error('not persisted: ' + JSON.stringify(prefs.modeControls));
  if (prefs.soundId === undefined && prefs.volume === undefined) {
    // sound prefs must not have been clobbered IF they existed — soft check:
    // (am1 played sounds earlier in this test file only if soundscape flow ran; assert key survival only when previously present)
  }
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-am1-signals')) || []);
  if (!events.some(e => e.type === 'mode_control' && e.payload.mode === 'bloom' && e.payload.control === 'mood' && e.payload.value === targetMood)) throw new Error('no signal for first pick');
  if (!events.some(e => e.type === 'mode_control' && e.payload.mode === 'bloom' && e.payload.control === 'mood' && e.payload.value === mood2)) throw new Error('no signal for second pick');
  // reload → re-enter → saved (second) mood applies on init
  await page.reload(); await page.waitForTimeout(500);
  await page.locator('.profile-card.filled').first().click(); await page.waitForSelector('#screen-canvas.active');
  await page.evaluate(() => { switchToMode(MODES.indexOf('bloom'), 'tray'); });
  await page.waitForTimeout(400);
  const reApplied = await page.evaluate(() => canvas.regState.moodId);
  if (reApplied !== mood2) throw new Error(`reApplied=${reApplied}`);
  return 'applied+persisted+signaled+restored: ' + mood2 + ' (tray stayed open)';
});

await check('Style tray usable at mobile viewports and exclusive', async () => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(400);
  await page.click('#btn-style');
  await page.waitForSelector('#style-tray.open');
  const box = await page.locator('#style-tray').boundingBox();
  if (box.y < 0 || box.y + box.height > 668) throw new Error('clipped: ' + JSON.stringify(box));
  await page.click('#btn-modes'); await page.waitForSelector('#mode-tray.open');
  const styleOpen = await page.evaluate(() => document.getElementById('style-tray').classList.contains('open'));
  if (styleOpen) throw new Error('style tray stayed open');
  await page.click('#btn-modes'); // close
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(400);
  return 'mobile OK + exclusive';
});

await check('Size control scales and clamps; surprise randomizes', async () => {
  await page.evaluate(() => { switchToMode(MODES.indexOf('echo'), 'tray'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    var V = window.CALM_MODES.get('echo');
    V.applyControl(canvas.regState, 'size', 1.6);
  });
  const big = await page.evaluate(() => canvas.regState.sizeMul);
  await page.evaluate(() => window.CALM_MODES.get('echo').applyControl(canvas.regState, 'size', 99));
  const clamped = await page.evaluate(() => canvas.regState.sizeMul);
  await page.evaluate(() => window.CALM_MODES.get('echo').applyControl(canvas.regState, 'sizeRandom', true));
  const rand = await page.evaluate(() => canvas.regState.sizeRandom);
  if (big !== 1.6 || clamped > 1.6 || rand !== true) throw new Error(`big=${big} clamped=${clamped} rand=${rand}`);
  return 'bounded + randomizable';
});

await check('Size slider UI persists and applies via tray', async () => {
  await page.click('#btn-style');
  await page.waitForSelector('#style-tray.open');
  const slider = page.locator('#style-size-slider');
  if (!(await slider.count())) throw new Error('no slider');
  await slider.fill('140'); // 1.4x
  await page.waitForTimeout(700); // debounce
  const applied = await page.evaluate(() => canvas.regState.sizeMul);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-am1-prefs')));
  const saved = prefs.modeControls && prefs.modeControls.echo && prefs.modeControls.echo.size;
  const trayOpen = await page.evaluate(() => document.getElementById('style-tray').classList.contains('open'));
  if (Math.abs(applied - 1.4) > 0.01 || Math.abs(saved - 1.4) > 0.01 || !trayOpen) throw new Error(`applied=${applied} saved=${saved} open=${trayOpen}`);
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-am1-signals')) || []);
  if (!events.some(e => e.type === 'mode_control' && e.payload.control === 'size')) throw new Error('no debounced size signal');
  return 'slider applied+persisted+signaled, tray open';
});

await check('Trace=stays persists mandala sparks; fades drains them', async () => {
  // Pre-existing test bug (surfaced by Spec 4 calm-start): the prior check
  // ("Size slider UI persists...") leaves the style tray open, and it covers
  // (300,300) with a real chip button (confirmed via elementFromPoint) --
  // so the mousedown below used to land on tray chrome, never reaching
  // #main-canvas at all. This was invisible pre-calm-start only because
  // mandala's old idle() self-spawned an ambient spark on its very first
  // frame regardless of touch (exactly the bug calm start fixes), so
  // `sparks.length` was already 1 before the phantom click. Now that idle
  // spawn is gated on state.hasTouched, the phantom click produces nothing.
  // Close the tray first, matching the same guard the orbits check below
  // already uses for the identical leftover-tray-chrome hazard.
  const trayWasOpenForTrace = await page.evaluate(() => document.getElementById('style-tray').classList.contains('open'));
  if (trayWasOpenForTrace) { await page.click('#btn-style'); await page.waitForTimeout(200); }
  await page.evaluate(() => { switchToMode(MODES.indexOf('mandala'), 'tray'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.CALM_MODES.get('mandala').applyControl(canvas.regState, 'trace', 'stays'));
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down();
  for (let k = 0; k < 10; k++) { await page.mouse.move(box.x + 300 + k * 15, box.y + 300 + k * 8); await page.waitForTimeout(40); }
  await page.mouse.up();
  await page.waitForTimeout(5000);
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
  if (litFades >= Math.max(5, litStays / 3)) throw new Error(`fades did not drain: ${litStays} -> ${litFades}`);
  return `stays=${litStays} fades=${litFades}`;
});

await check('Trace chip renders for the five, hidden for echo/etch, persists', async () => {
  await page.click('#btn-style'); await page.waitForSelector('#style-tray.open');
  let traceChips = await page.locator('#style-trace .chip').count();
  if (traceChips !== 2) throw new Error('mandala trace chips=' + traceChips);
  await page.click('#style-trace .chip[data-id="stays"]');
  await page.waitForTimeout(300);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-am1-prefs')));
  if (!prefs.modeControls || !prefs.modeControls.mandala || prefs.modeControls.mandala.trace !== 'stays') throw new Error('not persisted');
  const trayOpen = await page.evaluate(() => document.getElementById('style-tray').classList.contains('open'));
  if (!trayOpen) throw new Error('tray closed on trace pick');
  await page.evaluate(() => { switchToMode(MODES.indexOf('echo'), 'tray'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { renderStyleTray(); }); // tray open across switch re-renders; ensure explicit
  const echoTrace = await page.evaluate(() => document.getElementById('style-trace').style.display);
  if (echoTrace !== 'none') throw new Error('echo shows trace row: ' + echoTrace);
  return 'chips + persistence + exemption OK';
});

await check('Orbits stays-mode is bounded and accumulates ink', async () => {
  // Previous check leaves the style tray open (top-right, four rows tall);
  // close it so the canvas click below can't land on tray chrome.
  const trayWasOpen = await page.evaluate(() => document.getElementById('style-tray').classList.contains('open'));
  if (trayWasOpen) { await page.click('#btn-style'); await page.waitForTimeout(200); }
  await page.evaluate(() => { switchToMode(MODES.indexOf('orbits'), 'tray'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.CALM_MODES.get('orbits').applyControl(canvas.regState, 'trace', 'stays'));
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 350, box.y + 400); // plant anchor + orbiters
  await page.waitForTimeout(8000); // let paths accumulate
  const m = await page.evaluate(() => {
    const st = canvas.regState;
    const maxTrail = st.particles.length
      ? Math.max.apply(null, st.particles.map(p => (p.trail && p.trail.length) || 0))
      : 0;
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
    return { maxTrail: maxTrail, lit: n, ink: !!st.inkCanvas };
  });
  if (!m.ink) throw new Error('no ink layer');
  if (m.maxTrail > 12) throw new Error('trail buffer unbounded: ' + m.maxTrail);
  if (m.lit < 20) throw new Error('no accumulated ink: ' + m.lit);
  return `bounded (maxTrail=${m.maxTrail}) + ink lit=${m.lit}`;
});

await check('Echo stamps have feathered glowing edges, no outline ring', async () => {
  await page.evaluate(() => { switchToMode(MODES.indexOf('echo'), 'tray'); });
  await page.waitForTimeout(300);
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 400, box.y + 400); // single stamp
  await page.waitForTimeout(500);
  // ADAPTATION: sample the offscreen stampCanvas (the true archived-stamp
  // pixels) rather than the composited #main-canvas. A single tap leaves the
  // LIVE object sitting exactly on top of the stamp it just made, and the
  // live object's own always-soft glow ring + lighter outline (drawLiveObject,
  // unrelated to this task) dominates a main-canvas sample at that point --
  // it satisfies "feather >= 2px, no dark ring" regardless of what
  // stampObject() actually draws, making the check a false-positive pass
  // against the pre-fix hard-edge+dark-outline stamp. Reading state.stampCanvas
  // directly (same technique the "Orbits ink" check above uses for st.inkCanvas)
  // isolates exactly what stampObject() painted, with zero live-object
  // contamination -- this is what "no outline ring" and "feathered" must
  // actually be verified against per the task's intent (the STAMP path).
  const scan = await page.evaluate(() => {
    const st = canvas.regState;
    const sc = st.stampCanvas;
    const sx = sc.getContext('2d');
    const c = document.getElementById('main-canvas');
    const dpr = c.width / c.clientWidth;
    const cx = Math.round(400 * dpr), cy = Math.round(400 * dpr);
    const d = sx.getImageData(cx, cy, Math.round(90 * dpr), 1).data; // horizontal ray from center
    const px = [];
    for (let i = 0; i < d.length; i += 4) px.push({ r: d[i], g: d[i+1], b: d[i+2], a: d[i+3] });
    return px;
  });
  const lastSolid = scan.map((p, i) => p.a > 220 ? i : -1).reduce((m, v) => Math.max(m, v), -1);
  let firstClear = -1;
  for (let i = lastSolid + 1; i < scan.length; i++) { if (scan[i].a < 12) { firstClear = i; break; } }
  if (lastSolid < 2) throw new Error('no solid interior found');
  if (firstClear < 0) throw new Error('never reaches clear');
  const feather = firstClear - lastSolid;
  if (feather < 2) throw new Error('hard edge: feather=' + feather + 'px');
  // ADAPTATION: the task-specified "interior" window (lastSolid-4..lastSolid)
  // assumes the last a>220 pixel is flat fill, but a fully-opaque darker
  // OUTLINE stroke (a=255, same as fill) sits right at that boundary -- so
  // that window can sample the outline itself as "interior", which then lets
  // the outline pass its own dark-ring check against itself. Sample the true
  // flat-fill interior from deep in the ray (far from any edge stroke) instead,
  // and scan for a dark ring across the WHOLE opaque-to-clear transition
  // (not just the sub-220-alpha feather zone), since an opaque dark outline
  // never enters that zone at all.
  const lum = p => 0.2126*p.r + 0.7152*p.g + 0.0722*p.b;
  const deepInterior = scan.slice(0, Math.min(10, lastSolid)).filter(p => p.a > 220);
  if (deepInterior.length < 3) throw new Error('not enough deep-interior samples: ' + deepInterior.length);
  const interiorLum = deepInterior.reduce((s, p) => s + lum(p), 0) / deepInterior.length;
  // ADAPTATION: measured against the actual pre-fix outline (shadeRgb(rgb,
  // 0.68)), the darkened ring's luminance ratio is ~0.68 -- comfortably above
  // the task brief's illustrative 0.6 threshold, so 0.6 never trips on the
  // real bug. Tightened to 0.85 (still well below 1.0, so legitimate AA/blend
  // pixels on a same-hue feathered edge -- which only ever lighten or hold
  // hue, never darken below the fill -- can't false-positive; see rim-glow
  // pass 2 in echo.js, same color at lower alpha, not a darker shade).
  const DARK_RING_LUM_RATIO = 0.85;
  for (let i = deepInterior.length; i < firstClear; i++) {
    const p = scan[i];
    if (p.a > 40 && lum(p) < interiorLum * DARK_RING_LUM_RATIO) throw new Error(`dark ring at +${i - lastSolid}px (a=${p.a}): lum ${lum(p).toFixed(0)} vs interior ${interiorLum.toFixed(0)} (ratio ${(lum(p)/interiorLum).toFixed(2)})`);
  }
  return `feather=${feather}px, no dark ring`;
});

await check('All modes drain to clean canvas (fades)', async () => {
  const dirty = [];
  for (const m of ['trails','particles','ripples','geometric','currents','orbits','mandala','bloom','morph']) {
    await page.evaluate((mm) => { switchToMode(MODES.indexOf(mm), 'tray'); }, m);
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const mode = MODES[state.canvasMode];
      if (isRegistryMode(mode)) {
        const V = window.CALM_MODES.get(mode);
        if (V.applyControl) { try { V.applyControl(canvas.regState, 'trace', 'fades'); } catch (e) {} }
      }
    });
    const box = await page.locator('#main-canvas').boundingBox();
    await page.mouse.move(box.x + 200, box.y + 250); await page.mouse.down();
    for (let k = 0; k < 12; k++) { await page.mouse.move(box.x + 200 + k * 25, box.y + 250 + Math.sin(k) * 60); await page.waitForTimeout(40); }
    await page.mouse.up();
    await page.waitForTimeout(6500);
    const lit = await page.evaluate(() => {
      const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
      return n;
    });
    // Per-mode budgets (Task A8 residue-vs-ambient-life reconciliation -- see
    // commit body for the instrumented probe numbers behind each).
    // To recalibrate a budget (e.g. after changing a mode's design constants
    // like morph LIFE or orbits PERSIST_AFTER_RELEASE): run this check
    // standalone ~5 times for the affected mode, take the max observed lit
    // count, add ~50% margin; keep every budget far below the ~7865
    // opaque-plateau regression signature this gate exists to catch.
    // trails/particles/ripples/geometric have zero by-design ambient decor,
    // so they keep the strict default budget-8 -- this is what actually
    // proves the veil fix (these four go from fully opaque/7865 pre-fix to
    // single digits post-fix). bloom/morph/orbits/mandala/currents each have
    // documented, intentional idle/persistence behavior (idle sparks, ambient
    // motes, 14-20s touch-shape lifespans) that legitimately still lights
    // pixels within this check's 6.5s window -- budgets set generously above
    // multi-sample probe ceilings (18 morph samples: 71-151; 5 currents
    // samples: 12-31; orbits: 109-178 across the A8 probe samples + check
    // runs + 5 reviewer standalone runs of this check's logic) since idle
    // spawn/duet-pairing timing is probabilistic (Math.random()-gated) and a
    // single sample undersells the tail. Still nowhere near the pre-fix
    // opaque-canvas value (7865), so a real regression still trips these.
    const AMBIENT_BUDGET = { bloom: 60, morph: 300, orbits: 280, mandala: 40, currents: 45 };
    const budget = AMBIENT_BUDGET[m] || 8;
    if (lit > budget) dirty.push(`${m}=${lit}(>${budget})`);
    await page.click('#btn-clear');
    await page.waitForTimeout(300);
  }
  if (dirty.length) throw new Error('residue: ' + dirty.join(','));
  return 'all 9 fade modes drain clean';
});

await check('Mode error isolation falls back to trails', async () => {
  await page.evaluate(() => {
    window.VARIANTS.morph.tick = function () { throw new Error('boom'); };
    state.canvasMode = MODES.indexOf('morph');
  });
  await page.waitForTimeout(400);
  const mode = await page.evaluate(() => MODES[state.canvasMode]);
  if (mode !== 'trails') throw new Error('no fallback, mode=' + mode);
  return 'fell back to trails';
});

await check('No console errors (excluding intentional sabotage)', async () => {
  const unexpected = consoleErrors.filter(e => !e.includes('boom'));
  if (unexpected.length) throw new Error(unexpected[0]);
  return 'clean';
});

// --- Task A9: audio-reactive visual energy feed (CALM_VIS) ---

await check('CALM_VIS.energy rises with music, decays in silence', async () => {
  // Reset state: the mode-error-isolation check above sabotages morph.tick
  // and leaves state.canvasMode on 'trails' (fallback) -- harmless here since
  // this check only needs the sound panel, not any particular canvas mode.
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

await check('Dev summary surfaces top mode-control usage', async () => {
  // ADAPTATION: computeSignalSummary(profileId) takes a profile id and reads
  // signals internally (readSignals(profileId) at src/app.js:240) -- it does
  // NOT accept an events array. Confirmed via grep: both real call sites
  // (renderDevProfiles line 3676, exportSignalData line 3810) pass
  // profile.id, never readSignals(...). Profile am1 is the only profile
  // entered anywhere in this file (am2 seeded but never clicked), and every
  // control-applying check above that goes through the real UI handler --
  // "Control choice applies..." (2x mood clicks), "Size slider UI
  // persists..." (1x debounced slider), "Trace chip renders..." (1x trace
  // chip click) -- runs against it and records mode_control signals for it
  // (the two checks that call applyControl(...) directly via page.evaluate,
  // bypassing the UI, do NOT record signals -- only clicks/slider-input do).
  // So am1 already has >= 4 mode_control signals by this point in the file;
  // calling computeSignalSummary('am1') directly is the correct, honest form.
  const summary = await page.evaluate(() => computeSignalSummary('am1'));
  if (!summary.controlCounts) throw new Error('no controlCounts in summary');
  const total = Object.values(summary.controlCounts).reduce((a, b) => a + b, 0);
  if (total < 2) throw new Error('controls not counted: ' + JSON.stringify(summary.controlCounts));
  return JSON.stringify(summary.controlCounts).slice(0, 60);
});

// --- Task A11: dev-configurable per-mode defaults (three-tier fallback) ---

await check('Dev default mood applies when kid has no saved choice', async () => {
  // am2 (second seeded profile) is entered here for the first time in this
  // file -- am1 has done all the mood/character/size/trace picking above, so
  // am2 is guaranteed clean of any kid-saved bloom.mood (confirmed via grep:
  // no check in this file ever clicks am2's profile card before this one).
  await page.evaluate(() => {
    var controls = getDevControls();
    controls['am2'] = Object.assign({}, controls['am2'], { modeDefaults: { bloom: { mood: 'tropical' } } });
    saveDevControls(controls);
  });
  await page.click('#btn-back'); await page.waitForSelector('#screen-profiles.active');
  await page.locator('.profile-card.filled').nth(1).click(); await page.waitForSelector('#screen-canvas.active');
  // Setting state.canvasMode directly (not via switchToMode) still exercises
  // the real fallback chain here: enterProfile() resets canvas.regId = null
  // on every profile entry (src/app.js:683), and tickCanvas's per-frame
  // ensureRegState(mode) call (src/app.js:897) reinitializes + calls
  // applySavedModeControls(mode) whenever canvas.regId !== mode -- which is
  // true right after this fresh am2 entry, so the next animation frame drives
  // the production init -> applySavedModeControls path, not a test-only stub.
  await page.evaluate(() => { state.canvasMode = MODES.indexOf('bloom'); });
  await page.waitForTimeout(300);
  const mood = await page.evaluate(() => canvas.regState.moodId);
  if (mood !== 'tropical') throw new Error('mood=' + mood);
  return 'dev default applied';
});

console.log(`\nPhase 10: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
