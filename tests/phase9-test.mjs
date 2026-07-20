import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const SIGNAL_PROFILE_ID = 'phase9-signalkid';
const SIGNAL_PROFILE_NAME = 'SignalKid';
const results = [];

function log(check, pass, detail) {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${check}${detail ? ' - ' + detail : ''}`);
  results.push({ check, pass, detail });
}

async function ensureProfile(page) {
  await page.evaluate(({ id, name }) => {
    const raw = localStorage.getItem('calm-station-profiles');
    const profiles = raw ? JSON.parse(raw) : [];
    const signalProfile = {
      id,
      name,
      icon: 'flame',
      theme: 'ocean',
      createdAt: new Date().toISOString(),
    };
    const otherProfiles = profiles.filter(profile =>
      profile && profile.id !== id && profile.name !== name
    );

    localStorage.setItem('calm-station-profiles', JSON.stringify([
      signalProfile,
      ...otherProfiles,
    ].slice(0, 2)));
    localStorage.removeItem('calm-station-' + id + '-signals');
  }, { id: SIGNAL_PROFILE_ID, name: SIGNAL_PROFILE_NAME });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
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
  await ensureProfile(page);

  const initialScreenAccessibility = await page.evaluate(() => {
    const screenIds = ['screen-profiles', 'screen-canvas', 'screen-parent', 'screen-dev'];
    return screenIds
      .map(id => document.getElementById(id))
      .filter(Boolean)
      .map(screen => ({
        id: screen.id,
        active: screen.classList.contains('active'),
        ariaHidden: screen.getAttribute('aria-hidden'),
        inert: screen.hasAttribute('inert'),
      }));
  });
  const initialProfileScreenOnlyAccessible = initialScreenAccessibility.every(screen => {
    if (screen.id === 'screen-profiles') {
      return screen.active && screen.ariaHidden !== 'true' && screen.inert === false;
    }
    return screen.active === false && screen.ariaHidden === 'true' && screen.inert === true;
  });
  log(
    'Initial load exposes only active profile screen to assistive tech',
    initialProfileScreenOnlyAccessible,
    JSON.stringify(initialScreenAccessibility)
  );

  const kidDevScreenVisible = await page.evaluate(() =>
    document.getElementById('screen-dev')?.classList.contains('active') === true
  );
  log('Developer screen hidden during normal app load', kidDevScreenVisible === false);

  const kidAnalyticsText = await page.evaluate(() => {
    const activeScreens = Array.from(document.querySelectorAll('.screen.active'));
    return activeScreens.some(screen => screen.textContent.includes('Preference Signals'));
  });
  log('Kid-facing app does not show developer analytics copy', kidAnalyticsText === false);

  await page.locator('.profile-card.filled', { hasText: SIGNAL_PROFILE_NAME }).click();
  await page.waitForTimeout(700);

  const canvas = await page.$('#main-canvas');
  const box = await canvas.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);

  await page.click('#btn-sound');
  await page.waitForTimeout(200);
  await page.click('.sound-option[data-sound="rain"]');
  await page.waitForTimeout(700);
  await page.click('.sound-option[data-sound="rain"]');
  await page.waitForTimeout(300);
  await page.click('#btn-clear');
  await page.waitForTimeout(200);
  await page.click('#btn-back');
  await page.waitForTimeout(500);

  const signalSnapshot = await page.evaluate(({ id }) => {
    const profile = JSON.parse(localStorage.getItem('calm-station-profiles') || '[]')
      .find(storedProfile => storedProfile?.id === id);
    const raw = localStorage.getItem('calm-station-' + id + '-signals');
    return { profile, events: raw ? JSON.parse(raw) : [] };
  }, { id: SIGNAL_PROFILE_ID });

  const eventTypes = signalSnapshot.events.map(e => e.type);
  log('Session start recorded', eventTypes.includes('session_start'));
  log('Session end recorded', eventTypes.includes('session_end'));
  log('Mode cycle recorded', eventTypes.includes('mode_cycle'));
  log('Sound select recorded', eventTypes.includes('sound_select'));
  log('Sound stop recorded', eventTypes.includes('sound_stop'));
  log('Clear canvas recorded', eventTypes.includes('clear_canvas'));

  await page.goto(BASE + '/?dev=true', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const devVisible = await page.evaluate(() =>
    document.getElementById('screen-dev')?.classList.contains('active') === true
  );
  log('Developer screen opens with ?dev=true', devVisible);

  const summaryText = await page.textContent('#dev-profiles', { timeout: 1000 }).catch(() => '');
  log('Developer summary shows profile name', summaryText.includes('SignalKid'), summaryText.slice(0, 80));
  log('Developer summary shows mode data', summaryText.includes('Top Mode') || summaryText.includes('No mode time yet'));
  log('Developer summary shows sound data', summaryText.includes('Sound Use'));

  const exported = await page.evaluate(() => window.CalmStationDev?.exportSignals?.() || { profiles: [] });
  const exportedSignalProfile = exported.profiles.find(profile =>
    profile.id === SIGNAL_PROFILE_ID || profile.name === SIGNAL_PROFILE_NAME
  );
  log('Export helper returns profiles', Array.isArray(exported.profiles) && exported.profiles.length >= 1);
  log('Export helper includes events', exportedSignalProfile?.events.length >= 1, `${exportedSignalProfile?.events.length || 0} events`);

  // Export button must produce a real file download (iPad share-sheet path),
  // not just the on-screen JSON dump.
  const downloadPromise = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
  await page.click('#dev-export');
  const download = await downloadPromise;
  const dlName = download ? download.suggestedFilename() : '';
  log('Export button downloads a dated JSON file',
    /^calm-station-signals-\d{4}-\d{2}-\d{2}\.json$/.test(dlName),
    dlName || 'no download fired');
  await page.waitForTimeout(200);

  const capResult = await page.evaluate(({ id }) => {
    const profile = JSON.parse(localStorage.getItem('calm-station-profiles') || '[]')
      .find(storedProfile => storedProfile?.id === id);
    if (!window.CalmStationDev?.recordTestEvent || !profile) return -1;
    for (let i = 0; i < 530; i += 1) {
      window.CalmStationDev.recordTestEvent(profile.id, 'test_cap_event', { index: i });
    }
    const events = JSON.parse(localStorage.getItem('calm-station-' + id + '-signals') || '[]');
    return events.length;
  }, { id: SIGNAL_PROFILE_ID });
  log('Raw signal log caps at 500 events', capResult === 500, `${capResult} events`);

  log('No browser console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close();

  const failed = results.filter(r => !r.pass);
  console.log(`\nPhase 9: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
})();
