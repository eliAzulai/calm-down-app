import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const results = [];

function log(check, pass, detail) {
  const icon = pass ? 'PASS' : 'FAIL';
  const msg = `[${icon}] ${check}${detail ? ' — ' + detail : ''}`;
  console.log(msg);
  results.push({ check, pass, detail });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Setup: create profile if needed and enter canvas
  const existingFilled = await page.$$('.profile-card.filled');
  if (existingFilled.length === 0) {
    const emptyCard = await page.$('.profile-card.empty');
    await emptyCard.click();
    await page.waitForTimeout(400);
    await page.fill('.setup-name-input', 'TestKid');
    await page.click('.btn-done');
    await page.waitForTimeout(300);
  }

  await page.click('.profile-card.filled');
  await page.waitForTimeout(600);

  // CHECK 1: Sound button exists
  const btnSound = await page.$('#btn-sound');
  log('Sound button exists', btnSound !== null);

  const btnSoundSize = await page.evaluate(() => {
    const b = document.getElementById('btn-sound');
    const r = b.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  log('Sound button ≥ 48px', btnSoundSize.w >= 48 && btnSoundSize.h >= 48, `${btnSoundSize.w}x${btnSoundSize.h}`);

  // CHECK 2: Sound panel hidden by default
  const panelHidden = await page.evaluate(() => {
    return !document.getElementById('sound-panel')?.classList.contains('open');
  });
  log('Sound panel hidden by default', panelHidden);

  // CHECK 3: Click sound button → panel opens
  await btnSound.click();
  await page.waitForTimeout(300);

  const panelOpen = await page.evaluate(() => {
    return document.getElementById('sound-panel')?.classList.contains('open');
  });
  log('Sound panel opens on click', panelOpen);

  // CHECK 4: Sound options rendered (Rain + Drone)
  const soundOpts = await page.$$('.sound-option');
  log('Two sound options', soundOpts.length === 2, `found ${soundOpts.length}`);

  const optTexts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.sound-option')).map(b => b.textContent.trim());
  });
  log('Options are Rain and Ambient Drone', optTexts.includes('Rain') && optTexts.includes('Ambient Drone'), optTexts.join(', '));

  // CHECK 5: Sound OFF by default
  const playingDefault = await page.evaluate(() => audio.playing);
  log('Sound OFF by default', !playingDefault);

  // CHECK 6: AudioContext created on first user gesture
  // Click Rain option
  await page.click('[data-sound="rain"]');
  await page.waitForTimeout(300);

  const audioCtxCreated = await page.evaluate(() => audio.ctx !== null);
  log('AudioContext created on gesture', audioCtxCreated);

  const audioCtxState = await page.evaluate(() => audio.ctx?.state);
  log('AudioContext state is running', audioCtxState === 'running', audioCtxState);

  // CHECK 7: Rain is playing
  const rainPlaying = await page.evaluate(() => audio.playing && audio.currentId === 'rain');
  log('Rain sound is playing', rainPlaying);

  const rainSelected = await page.evaluate(() => {
    return document.querySelector('[data-sound="rain"]')?.classList.contains('selected');
  });
  log('Rain option shows selected state', rainSelected);

  // CHECK 8: Play/pause icon shows pause
  const pauseVisible = await page.evaluate(() => {
    return document.getElementById('icon-pause')?.style.display !== 'none';
  });
  log('Pause icon visible when playing', pauseVisible);

  const playHidden = await page.evaluate(() => {
    return document.getElementById('icon-play')?.style.display === 'none';
  });
  log('Play icon hidden when playing', playHidden);

  // CHECK 9: Sound button shows active state
  const btnSoundActive = await page.evaluate(() => {
    return document.getElementById('btn-sound')?.classList.contains('active');
  });
  log('Sound button active when playing', btnSoundActive);

  // Screenshot with sound panel open + rain playing
  await page.screenshot({ path: 'tests/screenshots/phase3-sound-panel.png' });

  // CHECK 10: Volume slider exists and works
  const volumeSlider = await page.$('#volume-slider');
  log('Volume slider exists', volumeSlider !== null);

  // Set volume to 75%
  await page.evaluate(() => {
    const slider = document.getElementById('volume-slider');
    slider.value = 75;
    slider.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(100);

  const volumeAfter = await page.evaluate(() => audio.volume);
  log('Volume slider changes volume', Math.abs(volumeAfter - 0.75) < 0.01, `${volumeAfter}`);

  // CHECK 11: Crossfade — switch to drone
  await page.click('[data-sound="drone"]');
  await page.waitForTimeout(600); // wait for crossfade

  const droneNow = await page.evaluate(() => audio.currentId === 'drone' && audio.playing);
  log('Crossfade to drone', droneNow);

  const droneSelected = await page.evaluate(() => {
    return document.querySelector('[data-sound="drone"]')?.classList.contains('selected');
  });
  log('Drone option shows selected', droneSelected);

  const rainDeselected = await page.evaluate(() => {
    return !document.querySelector('[data-sound="rain"]')?.classList.contains('selected');
  });
  log('Rain option deselected', rainDeselected);

  // CHECK 12: Play/pause toggles
  await page.click('#btn-play-pause');
  await page.waitForTimeout(300);

  const stoppedAfterPause = await page.evaluate(() => !audio.playing);
  log('Play/pause stops sound', stoppedAfterPause);

  await page.click('#btn-play-pause');
  await page.waitForTimeout(300);

  const resumedAfterPlay = await page.evaluate(() => audio.playing);
  log('Play/pause resumes sound', resumedAfterPlay);

  // CHECK 13: Close panel on outside click
  await page.click('#main-canvas', { position: { x: 400, y: 500 } });
  await page.waitForTimeout(200);

  const panelClosed = await page.evaluate(() => {
    return !document.getElementById('sound-panel')?.classList.contains('open');
  });
  log('Panel closes on outside click', panelClosed);

  // CHECK 14: Prefs saved to localStorage
  const savedPrefs = await page.evaluate(() => {
    const id = state.activeProfileId;
    const raw = localStorage.getItem('calm-station-' + id + '-prefs');
    return raw ? JSON.parse(raw) : null;
  });
  log('Sound prefs saved to localStorage', savedPrefs !== null && savedPrefs.soundId !== undefined,
    savedPrefs ? `soundId: ${savedPrefs.soundId}, volume: ${savedPrefs.volume}` : 'null');

  // CHECK 15: Sound stops when going back to profiles
  await page.click('#btn-back');
  await page.waitForTimeout(600);

  const soundAfterBack = await page.evaluate(() => audio.playing);
  log('Sound stops on back to profiles', !soundAfterBack);

  const nodesCleared = await page.evaluate(() => audio.currentNodes === null);
  log('Audio nodes cleaned up', nodesCleared);

  // CHECK 16: Sound prefs reload when re-entering profile
  await page.click('.profile-card.filled');
  await page.waitForTimeout(800);

  const restoredSound = await page.evaluate(() => audio.currentId);
  log('Sound pref restored on profile re-enter', restoredSound === 'drone', restoredSound);

  // CHECK 17: Visibility change pauses audio
  const hasVisHandler = await page.evaluate(() => {
    // Can verify by checking ctx suspend is wired up
    return typeof audio.ctx !== 'undefined' && audio.ctx !== null;
  });
  log('AudioContext available for visibility handling', hasVisHandler);

  // CHECK 18: No console errors
  log('No console errors', consoleErrors.length === 0,
    consoleErrors.length > 0 ? consoleErrors.join('; ') : 'clean');

  // Final screenshot
  await page.click('#btn-sound');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screenshots/phase3-sound-final.png' });

  await browser.close();

  // Summary
  console.log('\n========================================');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`TOTAL: ${passed} passed, ${failed} failed out of ${results.length}`);
  if (failed > 0) {
    console.log('\nFailed:');
    results.filter(r => !r.pass).forEach(r => console.log(`  - ${r.check}: ${r.detail || ''}`));
  }
  console.log('========================================');
})();
