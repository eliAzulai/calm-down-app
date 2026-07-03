// Soundscape 2.0 test — layered audio (music/ambient/sfx buses).
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

// Seed one profile so we can enter the canvas directly.
await page.addInitScript(() => {
  localStorage.setItem('calm-station-profiles',
    JSON.stringify([{ id: 'sc1', name: 'ScapeKid', icon: 'flame', theme: 'ocean' }]));
});
await page.goto(BASE);
await page.click('.profile-card.filled');
await page.waitForSelector('#screen-canvas.active');

// Open the sound panel (also creates the AudioContext via user gesture).
await page.click('#btn-sound');
await page.waitForSelector('#sound-panel.open');

await check('Music row renders 3 tracks', async () => {
  const n = await page.locator('#music-options .sound-option').count();
  if (n !== 3) throw new Error(`expected 3, got ${n}`);
  return `${n} tracks`;
});

await check('Sounds row renders 4 textures', async () => {
  const n = await page.locator('#sound-options .sound-option').count();
  if (n !== 4) throw new Error(`expected 4, got ${n}`);
  return `${n} textures`;
});

await check('Section labels present', async () => {
  const labels = await page.locator('#sound-panel .sound-section-label').allTextContents();
  if (!labels.includes('Music') || !labels.includes('Sounds')) throw new Error(labels.join(','));
  return labels.join(', ');
});

await check('Selecting a music track plays it', async () => {
  await page.click('#music-options .sound-option[data-music="bowls"]');
  await page.waitForFunction(() => audio.musicPlaying === true && audio.musicNodes !== null, null, { timeout: 10000 });
  return 'bowls playing';
});

await check('Music and ambient play together', async () => {
  await page.click('#sound-options .sound-option[data-sound="rain"]');
  await page.waitForFunction(() => audio.playing === true && audio.musicPlaying === true, null, { timeout: 5000 });
  return 'two live layers';
});

await check('Re-tap stops music only', async () => {
  await page.click('#music-options .sound-option[data-music="bowls"]');
  await page.waitForFunction(() => audio.musicPlaying === false && audio.playing === true, null, { timeout: 5000 });
  return 'ambient survived';
});

await check('Music prefs persisted', async () => {
  await page.click('#music-options .sound-option[data-music="tides"]');
  await page.waitForFunction(() => audio.musicPlaying === true, null, { timeout: 10000 });
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-sc1-prefs')));
  if (prefs.musicId !== 'tides' || prefs.soundId !== 'rain') throw new Error(JSON.stringify(prefs));
  return 'musicId + soundId saved';
});

await check('No console errors', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors[0]);
  return 'clean';
});

console.log(`\nSoundscape: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
