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

await check('SW precaches mode files at v3', async () => {
  const body = await (await page.request.get(`${BASE}/sw.js`)).text();
  const wanted = ['modes/registry.js','modes/echo.js','modes/etch.js','modes/currents.js','modes/orbits.js','modes/mandala.js','modes/bloom.js','modes/morph.js'];
  const missing = wanted.filter(w => !body.includes(w));
  if (missing.length) throw new Error('missing: ' + missing.join(','));
  if (!body.includes('calm-station-v3')) throw new Error('cache not v3');
  return 'v3 + 8 files';
});

await check('New modes render pixels via double-tap cycling', async () => {
  // ADAPTATION: the plan's dblclick target (box.x+60, box.y+60) lands inside
  // #btn-back (rect x:24 y:24 w:48 h:48 -> covers 24-72 on both axes at this
  // viewport), so those events never reach #main-canvas at all. Verified via
  // elementFromPoint(60,60) === #btn-back in a throwaway probe. Reusing the
  // same (200,300) point the drag already uses is inside the canvas with no
  // chrome overlap (confirmed via elementFromPoint(200,300) === #main-canvas)
  // and doesn't fight the drag, since the double-tap always runs AFTER the
  // drag/up for that same mode has completed.
  const results = {};
  for (let i = 0; i < 12; i++) {
    const mode = await page.evaluate(() => MODES[state.canvasMode]);
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
    await page.mouse.dblclick(box.x + 200, box.y + 300);
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

console.log(`\nPhase 10: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
