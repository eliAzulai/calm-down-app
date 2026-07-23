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

console.log(`\nPhase 11: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
