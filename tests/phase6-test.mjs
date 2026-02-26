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

  // Setup profile and enter canvas
  const filled = await page.$$('.profile-card.filled');
  if (filled.length === 0) {
    await page.click('.profile-card.empty');
    await page.waitForTimeout(400);
    await page.fill('.setup-name-input', 'TestKid');
    await page.click('.btn-done');
    await page.waitForTimeout(300);
  }
  await page.click('.profile-card.filled');
  await page.waitForTimeout(600);

  // === ENERGY CHECK-IN FLOW ===

  // Force show orb and open choice
  await page.evaluate(() => {
    clearTimeout(gentlePrompt.timer);
    gentlePrompt.shown = false;
    showGentleOrb();
  });
  await page.waitForTimeout(300);
  await page.click('#gentle-orb');
  await page.waitForTimeout(300);

  // Click "Breathe" — should open energy check-in first
  await page.click('[data-exercise="breathe"]');
  await page.waitForTimeout(400);

  const checkinVisible = await page.evaluate(() =>
    document.getElementById('energy-checkin')?.classList.contains('active')
  );
  log('Energy check-in opens before exercise', checkinVisible);

  // CHECK: 5 energy level buttons
  const energyBtns = await page.$$('#energy-checkin-levels .energy-btn');
  log('5 energy levels shown', energyBtns.length === 5, `found ${energyBtns.length}`);

  // CHECK: Go button disabled initially
  const goBtnDisabled = await page.$eval('#energy-checkin-go', el => el.disabled);
  log('Go button disabled until selection', goBtnDisabled);

  // CHECK: Energy level labels present
  const levelLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#energy-checkin-levels .energy-btn-label')).map(l => l.textContent)
  );
  log('Energy labels correct',
    levelLabels.includes('Overload') && levelLabels.includes('Calm Zone') && levelLabels.includes('Shutdown'),
    levelLabels.join(', ')
  );

  // Select "Wired"
  const wiredBtn = await page.$('#energy-checkin-levels .energy-btn:nth-child(2)');
  await wiredBtn.click();
  await page.waitForTimeout(200);

  const wiredSelected = await page.evaluate(() =>
    document.querySelectorAll('#energy-checkin-levels .energy-btn')[1]?.classList.contains('selected')
  );
  log('Can select energy level', wiredSelected);

  const goEnabled = await page.$eval('#energy-checkin-go', el => !el.disabled);
  log('Go button enabled after selection', goEnabled);

  await page.screenshot({ path: 'tests/screenshots/phase6-checkin.png' });

  // Click "Let's start" — should open breathe overlay
  await page.click('#energy-checkin-go');
  await page.waitForTimeout(400);

  const checkinClosed = await page.evaluate(() =>
    !document.getElementById('energy-checkin')?.classList.contains('active')
  );
  log('Check-in closes after go', checkinClosed);

  const breatheOpened = await page.evaluate(() =>
    document.getElementById('breathe-overlay')?.classList.contains('active')
  );
  log('Breathe overlay opens after check-in', breatheOpened);

  // Close breathe mid-exercise → should NOT show checkout
  await page.click('#breathe-close');
  await page.waitForTimeout(300);

  const noCheckoutOnClose = await page.evaluate(() =>
    !document.getElementById('energy-checkout')?.classList.contains('active')
  );
  log('No checkout when closing mid-exercise', noCheckoutOnClose);

  // === FULL BREATHE → CHECKOUT FLOW ===

  // Restart the flow
  await page.evaluate(() => {
    gentlePrompt.shown = false;
    showGentleOrb();
  });
  await page.waitForTimeout(300);
  await page.click('#gentle-orb');
  await page.waitForTimeout(300);
  await page.click('[data-exercise="breathe"]');
  await page.waitForTimeout(300);

  // Select energy: Overload (first button)
  await page.click('#energy-checkin-levels .energy-btn:first-child');
  await page.waitForTimeout(100);
  await page.click('#energy-checkin-go');
  await page.waitForTimeout(300);

  // Use Simple pattern for fastest completion
  await page.click('.pattern-btn:nth-child(3)');
  await page.waitForTimeout(100);
  await page.click('#breathe-start');

  // Wait for completion (Simple: 10s * 4 = 40s)
  await page.waitForTimeout(42000);

  const doneLabel = await page.$eval('#breathe-label', el => el.textContent);
  log('Breathe shows Nice work', doneLabel === 'Nice work', doneLabel);

  // Click Done/Skip → should open checkout
  await page.click('#breathe-skip');
  await page.waitForTimeout(400);

  const checkoutVisible = await page.evaluate(() =>
    document.getElementById('energy-checkout')?.classList.contains('active')
  );
  log('Energy checkout opens after exercise completion', checkoutVisible);

  await page.screenshot({ path: 'tests/screenshots/phase6-checkout.png' });

  // CHECK: 5 checkout level buttons
  const checkoutBtns = await page.$$('#energy-checkout-levels .energy-btn');
  log('5 checkout energy levels', checkoutBtns.length === 5, `found ${checkoutBtns.length}`);

  // Select "Calm Zone" (3rd button)
  await page.click('#energy-checkout-levels .energy-btn:nth-child(3)');
  await page.waitForTimeout(200);

  const checkoutDoneEnabled = await page.$eval('#energy-checkout-done', el => !el.disabled);
  log('Checkout done button enabled', checkoutDoneEnabled);

  await page.click('#energy-checkout-done');
  await page.waitForTimeout(400);

  // CHECK: Comparison shown
  const compareVisible = await page.evaluate(() =>
    document.getElementById('checkout-compare')?.style.display !== 'none'
  );
  log('Before/after comparison shown', compareVisible);

  const beforeText = await page.$eval('#compare-before-text', el => el.textContent);
  log('Before label shows selected level', beforeText === 'Overload', beforeText);

  const afterText = await page.$eval('#compare-after-text', el => el.textContent);
  log('After label shows selected level', afterText === 'Calm Zone', afterText);

  // CHECK: Contextual message
  const checkoutMsg = await page.$eval('#checkout-message', el => el.textContent);
  log('Contextual message shown', checkoutMsg.length > 10, checkoutMsg.substring(0, 60));

  // CHECK: "Calm zone" message specifically
  log('Calm zone message correct', checkoutMsg.includes('calm zone'), checkoutMsg.substring(0, 60));

  await page.screenshot({ path: 'tests/screenshots/phase6-comparison.png' });

  // CHECK: Session logged
  const sessionLogged = await page.evaluate(() => {
    var key = 'calm-station-' + state.activeProfileId + '-sessions';
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    var sessions = JSON.parse(raw);
    return sessions[sessions.length - 1];
  });
  log('Session logged to localStorage', sessionLogged !== null);
  log('Session has correct shape',
    sessionLogged && sessionLogged.date && sessionLogged.energyBefore !== undefined &&
    sessionLogged.energyAfter !== undefined && sessionLogged.exerciseType === 'breathe',
    sessionLogged ? JSON.stringify(sessionLogged).substring(0, 80) : 'null'
  );

  // Click "Back to canvas"
  await page.click('#checkout-finish');
  await page.waitForTimeout(300);

  const checkoutClosed = await page.evaluate(() =>
    !document.getElementById('energy-checkout')?.classList.contains('active')
  );
  log('Checkout closes on finish', checkoutClosed);

  // === GROUNDING EXERCISE ===

  // Reopen flow for grounding
  await page.evaluate(() => {
    gentlePrompt.shown = false;
    showGentleOrb();
  });
  await page.waitForTimeout(300);
  await page.click('#gentle-orb');
  await page.waitForTimeout(300);
  await page.click('[data-exercise="ground"]');
  await page.waitForTimeout(300);

  // Energy check-in
  await page.click('#energy-checkin-levels .energy-btn:nth-child(2)'); // Wired
  await page.waitForTimeout(100);
  await page.click('#energy-checkin-go');
  await page.waitForTimeout(400);

  const groundVisible = await page.evaluate(() =>
    document.getElementById('ground-overlay')?.classList.contains('active')
  );
  log('Grounding overlay opens', groundVisible);

  await page.screenshot({ path: 'tests/screenshots/phase6-ground.png' });

  // CHECK: 5 progress bars
  const progressBars = await page.$$('.ground-progress-bar');
  log('5 progress bars', progressBars.length === 5, `found ${progressBars.length}`);

  // CHECK: First sense is "See" with 5 circles
  const senseTitle = await page.$eval('#ground-sense-title', el => el.textContent);
  log('First sense is See', senseTitle === 'See', senseTitle);

  const circles = await page.$$('.ground-circle');
  log('5 tap circles for See', circles.length === 5, `found ${circles.length}`);

  // CHECK: Next button disabled
  const nextDisabled = await page.$eval('#ground-next', el => el.disabled);
  log('Next disabled until all tapped', nextDisabled);

  // Tap all 5 circles
  for (let i = 0; i < 5; i++) {
    await page.click(`.ground-circle:nth-child(${i + 1})`);
    await page.waitForTimeout(100);
  }

  const allChecked = await page.evaluate(() =>
    document.querySelectorAll('.ground-circle.checked').length
  );
  log('All circles checked', allChecked === 5, `${allChecked} checked`);

  const nextEnabled = await page.$eval('#ground-next', el => !el.disabled);
  log('Next enabled after all tapped', nextEnabled);

  await page.screenshot({ path: 'tests/screenshots/phase6-ground-tapped.png' });

  // Advance to Touch (step 2)
  await page.click('#ground-next');
  await page.waitForTimeout(300);

  const touchTitle = await page.$eval('#ground-sense-title', el => el.textContent);
  log('Second sense is Touch', touchTitle === 'Touch', touchTitle);

  const touchCircles = await page.$$('.ground-circle');
  log('4 tap circles for Touch', touchCircles.length === 4, `found ${touchCircles.length}`);

  // Check toggle: tap a circle, then untap
  await page.click('.ground-circle:first-child');
  await page.waitForTimeout(100);
  const isChecked = await page.evaluate(() =>
    document.querySelector('.ground-circle')?.classList.contains('checked')
  );
  log('Circle toggles on', isChecked);

  await page.click('.ground-circle:first-child');
  await page.waitForTimeout(100);
  const isUnchecked = await page.evaluate(() =>
    !document.querySelector('.ground-circle')?.classList.contains('checked')
  );
  log('Circle toggles off', isUnchecked);

  // Complete all remaining senses quickly
  // Touch: 4
  for (let i = 0; i < 4; i++) {
    await page.click(`.ground-circle:nth-child(${i + 1})`);
    await page.waitForTimeout(50);
  }
  await page.click('#ground-next');
  await page.waitForTimeout(200);

  // Hear: 3
  const hearTitle = await page.$eval('#ground-sense-title', el => el.textContent);
  log('Third sense is Hear', hearTitle === 'Hear', hearTitle);
  for (let i = 0; i < 3; i++) {
    await page.click(`.ground-circle:nth-child(${i + 1})`);
    await page.waitForTimeout(50);
  }
  await page.click('#ground-next');
  await page.waitForTimeout(200);

  // Smell: 2
  for (let i = 0; i < 2; i++) {
    await page.click(`.ground-circle:nth-child(${i + 1})`);
    await page.waitForTimeout(50);
  }
  await page.click('#ground-next');
  await page.waitForTimeout(200);

  // Taste: 1
  await page.click('.ground-circle:first-child');
  await page.waitForTimeout(100);
  await page.click('#ground-next');
  await page.waitForTimeout(300);

  // CHECK: Completion screen
  const doneTitle = await page.$eval('#ground-sense-title', el => el.textContent);
  log('Shows Nice work on completion', doneTitle === 'Nice work', doneTitle);

  await page.screenshot({ path: 'tests/screenshots/phase6-ground-done.png' });

  // Click Done
  await page.click('#ground-next');
  await page.waitForTimeout(400);

  // CHECK: Checkout opens after grounding
  const groundCheckout = await page.evaluate(() =>
    document.getElementById('energy-checkout')?.classList.contains('active')
  );
  log('Checkout opens after grounding', groundCheckout);

  // Select energy: Low
  await page.click('#energy-checkout-levels .energy-btn:nth-child(4)'); // Low
  await page.waitForTimeout(100);
  await page.click('#energy-checkout-done');
  await page.waitForTimeout(300);

  // CHECK: Second session logged with exerciseType=ground
  const sessions = await page.evaluate(() => {
    var key = 'calm-station-' + state.activeProfileId + '-sessions';
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  });
  log('Two sessions logged total', sessions.length >= 2, `${sessions.length} sessions`);
  const lastSession = sessions[sessions.length - 1];
  log('Last session is grounding', lastSession?.exerciseType === 'ground', lastSession?.exerciseType);

  // Close checkout
  await page.click('#checkout-finish');
  await page.waitForTimeout(300);

  // === BACK BUTTON CLEANUP ===
  await page.evaluate(() => {
    gentlePrompt.shown = false;
    showGentleOrb();
  });
  await page.waitForTimeout(200);

  // Open energy check-in to test cleanup
  await page.click('#gentle-orb');
  await page.waitForTimeout(200);
  await page.click('[data-exercise="breathe"]');
  await page.waitForTimeout(300);

  // Now go back — should clean up everything
  await page.click('#energy-checkin-close');
  await page.waitForTimeout(200);
  await page.click('#btn-back');
  await page.waitForTimeout(500);

  const allOverlaysClosed = await page.evaluate(() => {
    var checkin = !document.getElementById('energy-checkin')?.classList.contains('active');
    var checkout = !document.getElementById('energy-checkout')?.classList.contains('active');
    var breathe = !document.getElementById('breathe-overlay')?.classList.contains('active');
    var ground = !document.getElementById('ground-overlay')?.classList.contains('active');
    return checkin && checkout && breathe && ground;
  });
  log('All overlays closed on back', allOverlaysClosed);

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
