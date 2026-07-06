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
