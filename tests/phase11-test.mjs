// Phase 11 test — calm start: no self-generated content before first touch.
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
      { id: 'cf1', name: 'ModeKid', icon: 'flame', theme: 'ocean' },
      { id: 'cf2', name: 'OtherKid', icon: 'flame', theme: 'forest' },
    ]));
});

await page.goto(BASE);
await page.click('.profile-card.filled');
await page.waitForSelector('#screen-canvas.active');

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
  await page.waitForTimeout(4500); // > morph idleSpawnDelay (2-4s)
  const lit = await page.evaluate(() => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
    return n;
  });
  if (lit < 3) throw new Error('idle life did not resume: lit=' + lit);
  return 'morph idle life resumed post-touch (' + lit + ')';
});

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
  const opened = await page.evaluate(() => readSignals(state.activeProfileId).some(e => e.type === 'sidebar_open'));
  if (!opened) throw new Error('sidebar_open signal missing after tab open');
  return 'open+exclusive+48px+sidebar_open signal';
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

await check('Double-tap no longer changes mode', async () => {
  // PRECONDITION: the prior check's canvas drag fires a native 'click' on
  // #main-canvas, which the document-level outside-click listener treats as
  // "outside the sidebar" and closes it — so #quick-sidebar is usually
  // already closed here. But #sidebar-tab is a toggle, so blindly clicking
  // it would REOPEN a closed sidebar instead of closing an open one. Check
  // the actual DOM state first and only click to close if it's open.
  const sidebarOpenBefore = await page.evaluate(() => document.getElementById('quick-sidebar').classList.contains('open'));
  if (sidebarOpenBefore) {
    await page.click('#sidebar-tab');
    await page.waitForTimeout(300);
  }
  const sidebarOpen = await page.evaluate(() => document.getElementById('quick-sidebar').classList.contains('open'));
  if (sidebarOpen) throw new Error('sidebar still open before double-tap probe');

  const before = await page.evaluate(() => MODES[state.canvasMode]);
  const box = await page.locator('#main-canvas').boundingBox();
  // Sidebar lives bottom-left (~24-100px from left/bottom edges); (300,400)
  // is nowhere near it. Verified via elementFromPoint that this point is
  // #main-canvas itself, not sidebar/tray chrome (same hazard phase10's
  // double-tap comment flags for (60,60) landing on #btn-back).
  const target = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el && el.id;
  }, { x: box.x + 300, y: box.y + 400 });
  if (target !== 'main-canvas') throw new Error('tap point is not bare canvas: ' + target);

  await page.mouse.click(box.x + 300, box.y + 400);
  await page.waitForTimeout(100);
  await page.mouse.click(box.x + 300, box.y + 400);
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => MODES[state.canvasMode]);
  if (after !== before) throw new Error('double-tap still cycles: ' + before + ' -> ' + after);
  return 'double-tap inert';
});

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

console.log(`\nPhase 11: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
