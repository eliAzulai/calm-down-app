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

await check('No console errors', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors[0]);
  return 'clean';
});

console.log(`\nPhase 10: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
