import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const results = [];

function log(check, pass, detail) {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${check}${detail ? ' — ' + detail : ''}`);
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

  // === SETUP: Create a profile and run an exercise so there's session data ===

  const filled = await page.$$('.profile-card.filled');
  if (filled.length === 0) {
    await page.click('.profile-card.empty');
    await page.waitForTimeout(400);
    await page.fill('.setup-name-input', 'TestKid');
    await page.click('.btn-done');
    await page.waitForTimeout(300);
  }

  // Enter canvas and do a quick exercise for session data
  await page.click('.profile-card.filled');
  await page.waitForTimeout(600);

  // Force orb + complete a breathe exercise
  await page.evaluate(() => {
    clearTimeout(gentlePrompt.timer);
    gentlePrompt.shown = false;
    showGentleOrb();
  });
  await page.waitForTimeout(300);
  await page.click('#gentle-orb');
  await page.waitForTimeout(300);
  await page.click('[data-exercise="breathe"]');
  await page.waitForTimeout(300);

  // Energy check-in: select Wired
  await page.click('#energy-checkin-levels .energy-btn:nth-child(2)');
  await page.waitForTimeout(100);
  await page.click('#energy-checkin-go');
  await page.waitForTimeout(300);

  // Simple pattern, start
  await page.click('.pattern-btn:nth-child(3)');
  await page.waitForTimeout(100);
  await page.click('#breathe-start');

  // Wait for completion
  await page.waitForTimeout(42000);
  await page.click('#breathe-skip'); // Done
  await page.waitForTimeout(300);

  // Energy checkout: select Calm Zone
  await page.click('#energy-checkout-levels .energy-btn:nth-child(3)');
  await page.waitForTimeout(100);
  await page.click('#energy-checkout-done');
  await page.waitForTimeout(300);
  await page.click('#checkout-finish');
  await page.waitForTimeout(300);

  // Go back to profiles
  await page.click('#btn-back');
  await page.waitForTimeout(500);

  // === HIDDEN ACCESS: Long-press title ===

  const titleEl = await page.$('.profiles-header h1');

  // Simulate long-press (pointerdown, wait 3s, pointerup)
  const box = await titleEl.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(3200);
  await page.mouse.up();
  await page.waitForTimeout(500);

  const dashboardVisible = await page.evaluate(() =>
    document.getElementById('screen-parent')?.classList.contains('active')
  );
  log('Long-press title opens parent dashboard', dashboardVisible);

  const profilesHidden = await page.evaluate(() =>
    !document.getElementById('screen-profiles')?.classList.contains('active')
  );
  log('Profile screen hidden when dashboard opens', profilesHidden);

  await page.screenshot({ path: 'tests/screenshots/phase7-dashboard.png' });

  // === DASHBOARD CONTENT ===

  // CHECK: Visually distinct background
  const dashBg = await page.evaluate(() =>
    getComputedStyle(document.getElementById('screen-parent')).background
  );
  log('Dashboard has distinct background', dashBg.includes('10, 20, 32') || dashBg.includes('#0a1420') || dashBg.includes('rgb(10, 20, 32)'), dashBg.substring(0, 60));

  // CHECK: Dashboard header
  const headerText = await page.$eval('.parent-header h2', el => el.textContent);
  log('Dashboard header shows "Parent Dashboard"', headerText === 'Parent Dashboard', headerText);

  // CHECK: Back button exists
  const backBtn = await page.$('#parent-back');
  log('Back button exists', backBtn !== null);

  // CHECK: Kid card rendered
  const kidCards = await page.$$('.parent-kid-card');
  log('At least one kid card rendered', kidCards.length >= 1, `${kidCards.length} cards`);

  // CHECK: Kid name shown
  const kidName = await page.$eval('.parent-kid-name', el => el.textContent);
  log('Kid name displayed', kidName === 'TestKid', kidName);

  // CHECK: Theme shown
  const kidTheme = await page.$eval('.parent-kid-theme', el => el.textContent);
  log('Kid theme displayed', kidTheme.length > 0, kidTheme);

  // CHECK: Stats grid exists
  const stats = await page.$$('.parent-stat');
  log('Stats grid has 4 stats', stats.length === 4, `found ${stats.length}`);

  // CHECK: Total sessions count
  const totalSessionsVal = await page.$eval('.parent-stat:first-child .parent-stat-value', el => el.textContent);
  log('Total sessions shows correct count', parseInt(totalSessionsVal) >= 1, totalSessionsVal);

  // CHECK: Total sessions label
  const totalSessionsLabel = await page.$eval('.parent-stat:first-child .parent-stat-label', el => el.textContent);
  log('Total sessions label correct', totalSessionsLabel === 'Total Sessions', totalSessionsLabel);

  // CHECK: Breathing stat
  const breatheStat = await page.$eval('.parent-stat:nth-child(2) .parent-stat-value', el => el.textContent);
  log('Breathing count shown', parseInt(breatheStat) >= 1, breatheStat);

  // CHECK: Session list
  const sessionRows = await page.$$('.parent-session-row');
  log('Session list has rows', sessionRows.length >= 1, `${sessionRows.length} rows`);

  // CHECK: Session row has date
  const sessionDate = await page.$eval('.parent-session-date', el => el.textContent);
  log('Session row shows date', sessionDate.length > 0, sessionDate);

  // CHECK: Session row has type
  const sessionType = await page.$eval('.parent-session-type', el => el.textContent);
  log('Session row shows exercise type', sessionType.trim().length > 0, sessionType);

  // CHECK: Session row has energy before/after
  const energyDots = await page.$$('.parent-session-energy .parent-session-dot');
  log('Session row shows energy dots', energyDots.length >= 2, `${energyDots.length} dots`);

  await page.screenshot({ path: 'tests/screenshots/phase7-dashboard-data.png' });

  // === NOTIFICATION CONFIG ===

  // CHECK: Telegram URL input exists
  const telegramInput = await page.$('#telegram-url');
  log('Telegram URL input exists', telegramInput !== null);

  // CHECK: Save button exists
  const saveBtn = await page.$('#telegram-save');
  log('Save button exists', saveBtn !== null);

  // CHECK: Test button exists
  const testBtn = await page.$('#telegram-test');
  log('Test button exists', testBtn !== null);

  // Type a URL and save
  await page.fill('#telegram-url', 'https://api.telegram.org/bot123/sendMessage?chat_id=456');
  await page.click('#telegram-save');
  await page.waitForTimeout(300);

  // CHECK: Status shows saved
  const saveStatus = await page.$eval('#telegram-status', el => el.textContent);
  log('Save shows confirmation', saveStatus.includes('Saved'), saveStatus);

  // CHECK: URL persisted in localStorage
  const savedUrl = await page.evaluate(() => {
    var prefs = JSON.parse(localStorage.getItem('calm-station-parent') || '{}');
    return prefs.telegramUrl;
  });
  log('Webhook URL saved to localStorage', savedUrl === 'https://api.telegram.org/bot123/sendMessage?chat_id=456');

  await page.screenshot({ path: 'tests/screenshots/phase7-notification.png' });

  // === BACK BUTTON ===

  await page.click('#parent-back');
  await page.waitForTimeout(500);

  const backToProfiles = await page.evaluate(() =>
    document.getElementById('screen-profiles')?.classList.contains('active')
  );
  log('Back button returns to profiles', backToProfiles);

  const dashboardHidden = await page.evaluate(() =>
    !document.getElementById('screen-parent')?.classList.contains('active')
  );
  log('Dashboard hidden after back', dashboardHidden);

  // === URL PARAM ACCESS ===

  await page.goto(BASE + '?parent=true', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const urlParamDash = await page.evaluate(() =>
    document.getElementById('screen-parent')?.classList.contains('active')
  );
  log('?parent=true URL param opens dashboard', urlParamDash);

  // CHECK: Saved URL still shows in input
  const urlStillThere = await page.$eval('#telegram-url', el => el.value);
  log('Saved webhook URL persists', urlStillThere === 'https://api.telegram.org/bot123/sendMessage?chat_id=456');

  await page.screenshot({ path: 'tests/screenshots/phase7-url-access.png' });

  // Go back and verify clean state
  await page.click('#parent-back');
  await page.waitForTimeout(500);

  const ambientVisible = await page.evaluate(() =>
    !document.getElementById('ambient-canvas')?.classList.contains('hidden')
  );
  log('Ambient canvas visible after leaving dashboard', ambientVisible);

  // CHECK: No console errors
  log('No console errors', consoleErrors.length === 0,
    consoleErrors.length > 0 ? consoleErrors.join('; ') : 'clean');

  await browser.close();

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
