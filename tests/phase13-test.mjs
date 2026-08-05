// Phase 13 test — Bloom's opt-in touch chime.
// Requires: npx http-server src -p 8080 -s
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
let passed = 0, failed = 0;
const consoleErrors = [];

function pass(name, detail) { passed++; console.log(`[PASS] ${name}${detail ? ' — ' + detail : ''}`); }
function fail(name, detail) { failed++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
async function check(name, fn) {
  try { const detail = await fn(); pass(name, typeof detail === 'string' ? detail : ''); }
  catch (e) { fail(name, e.message); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.addInitScript(() => {
  localStorage.setItem('calm-station-profiles', JSON.stringify([
    { id: 'bc1', name: 'BloomKid', icon: 'flame', theme: 'ocean' },
    { id: 'bc2', name: 'OtherKid', icon: 'flame', theme: 'forest' },
  ]));
});

async function switchMode(mode) {
  await page.evaluate((id) => switchToMode(MODES.indexOf(id), 'test'), mode);
  await page.waitForTimeout(150);
}

async function canvasTap(x = 330, y = 430) {
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
}

await page.goto(BASE);
await page.click('.profile-card.filled');
await page.waitForSelector('#screen-canvas.active');

await check('Bloom style tray renders Chime Off/On with Off selected by default', async () => {
  await switchMode('bloom');
  await page.click('#btn-style');
  await page.waitForSelector('#style-tray.open');
  const row = await page.evaluate(() => Array.from(document.querySelectorAll('#style-chime .chip')).map(b => ({
    label: b.textContent, value: b.dataset.value, on: b.classList.contains('on')
  })));
  if (row.length !== 2 || row[0].label !== 'Off' || row[1].label !== 'On') throw new Error(JSON.stringify(row));
  if (!row[0].on || row[1].on) throw new Error('default is not Off: ' + JSON.stringify(row));
  return 'Off selected';
});

await check('Chime row is absent outside Bloom', async () => {
  await switchMode('pond');
  const hidden = await page.evaluate(() => document.getElementById('style-chime').style.display === 'none');
  if (!hidden) throw new Error('chime row shown for pond');
  return 'pond has no chime row';
});

await check('Bloom remains silent while Chime is Off', async () => {
  await switchMode('bloom');
  const before = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  await canvasTap();
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  if (after !== before) throw new Error(`lastAt advanced while Off: ${before} -> ${after}`);
  return 'tap did not ping';
});

await check('Enabling Bloom Chime makes a touch-down ping', async () => {
  // REVIEW FIX (attended pass): the previous check's canvas tap closed the
  // style tray via its outside-click closer, leaving the chime chips hidden
  // and unclickable — reopen the tray before enabling.
  await page.click('#btn-style');
  await page.waitForSelector('#style-tray.open');
  await page.click('#style-chime .chip[data-value="true"]');
  // REVIEW FIX (attended pass): close the tray before tapping — the open
  // panel overlaps this tap coordinate and would swallow the pointerdown.
  await page.click('#btn-style');
  await page.waitForTimeout(80); // exceed CALM_CHIME's shared 50ms rate cap
  const before = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  await canvasTap(420, 320);
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  if (!(after > before)) throw new Error(`lastAt did not advance: ${before} -> ${after}`);
  return 'tap pinged';
});

await check('Bloom Chime choice survives leaving and re-entering its profile', async () => {
  await page.click('#btn-back');
  await page.waitForSelector('#screen-profiles.active');
  await page.click('.profile-card.filled');
  await page.waitForSelector('#screen-canvas.active');
  await switchMode('bloom');
  await page.click('#btn-style');
  await page.waitForSelector('#style-tray.open');
  const saved = await page.evaluate(() => ({
    on: document.querySelector('#style-chime .chip[data-value="true"]').classList.contains('on'),
    state: canvas.regState.chimeEnabled,
    pref: (getModeControls(state.activeProfileId).bloom || {}).chime,
  }));
  if (!saved.on || !saved.state || saved.pref !== true) throw new Error(JSON.stringify(saved));
  return 'On restored per profile';
});

await check('Pond still chimes, and trails never chimes', async () => {
  await switchMode('pond');
  await page.waitForTimeout(80);
  const pondBefore = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  await canvasTap(280, 380);
  await page.waitForTimeout(150);
  const pondAfter = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  if (!(pondAfter > pondBefore)) throw new Error(`pond stopped chiming: ${pondBefore} -> ${pondAfter}`);

  await switchMode('trails');
  await page.waitForTimeout(80);
  const trailsBefore = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  await canvasTap(500, 500);
  await page.waitForTimeout(120);
  const trailsAfter = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  if (trailsAfter !== trailsBefore) throw new Error(`trails chimed: ${trailsBefore} -> ${trailsAfter}`);
  return 'pond yes; trails no';
});

await check('No console errors across the pass', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 3).join(' | '));
  return 'console clean';
});

console.log(`\nPhase 13: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
