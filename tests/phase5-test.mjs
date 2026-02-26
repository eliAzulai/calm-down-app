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

  // === GENTLE PROMPT ORB ===

  // CHECK: Orb hidden by default
  const orbHidden = await page.evaluate(() =>
    !document.getElementById('gentle-orb')?.classList.contains('visible')
  );
  log('Orb hidden by default', orbHidden);

  // CHECK: Prompt timer started
  const timerStarted = await page.evaluate(() => gentlePrompt.timer !== null);
  log('Gentle prompt timer started', timerStarted);

  // Force show orb for testing (skip the 3-5 min wait)
  await page.evaluate(() => {
    clearTimeout(gentlePrompt.timer);
    showGentleOrb();
  });
  await page.waitForTimeout(300);

  const orbVisible = await page.evaluate(() =>
    document.getElementById('gentle-orb')?.classList.contains('visible')
  );
  log('Orb becomes visible', orbVisible);

  // CHECK: Orb is in bottom-right corner
  const orbPos = await page.evaluate(() => {
    const el = document.getElementById('gentle-orb');
    const r = el.getBoundingClientRect();
    return { right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, w: r.width, h: r.height };
  });
  log('Orb positioned in bottom-right', orbPos.right < 60 && orbPos.bottom < 120, `right: ${orbPos.right}px, bottom: ${orbPos.bottom}px`);
  log('Orb size is 40x40', orbPos.w === 40 && orbPos.h === 40, `${orbPos.w}x${orbPos.h}`);

  // CHECK: Orb pulses (has animation)
  const orbAnimation = await page.evaluate(() =>
    getComputedStyle(document.getElementById('gentle-orb')).animationName
  );
  log('Orb has pulse animation', orbAnimation.includes('orb-pulse'), orbAnimation);

  await page.screenshot({ path: 'tests/screenshots/phase5-orb.png' });

  // CHECK: No text until tapped — prompt choice hidden
  const choiceHiddenBefore = await page.evaluate(() =>
    !document.getElementById('prompt-choice')?.classList.contains('visible')
  );
  log('No text until tapped (choice hidden)', choiceHiddenBefore);

  // CHECK: Tap orb reveals Breathe/Ground choice
  await page.click('#gentle-orb');
  await page.waitForTimeout(300);

  const choiceVisible = await page.evaluate(() =>
    document.getElementById('prompt-choice')?.classList.contains('visible')
  );
  log('Tap orb reveals choice', choiceVisible);

  const choiceBtns = await page.$$('.prompt-btn');
  log('Two choice buttons (Breathe + Ground)', choiceBtns.length === 2);

  const btnTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.prompt-btn')).map(b => b.textContent)
  );
  log('Buttons say Breathe and Ground', btnTexts.includes('Breathe') && btnTexts.includes('Ground'), btnTexts.join(', '));

  await page.screenshot({ path: 'tests/screenshots/phase5-choice.png' });

  // CHECK: Max once per session
  const shownFlag = await page.evaluate(() => gentlePrompt.shown);
  log('Shown flag set (max once per session)', shownFlag);

  // === BREATHING EXERCISE ===

  // Click Breathe
  await page.click('[data-exercise="breathe"]');
  await page.waitForTimeout(400);

  // CHECK: Overlay opens
  const overlayActive = await page.evaluate(() =>
    document.getElementById('breathe-overlay')?.classList.contains('active')
  );
  log('Breathing overlay opens', overlayActive);

  // CHECK: Orb and choice hidden
  const orbGone = await page.evaluate(() =>
    !document.getElementById('gentle-orb')?.classList.contains('visible')
  );
  log('Orb hidden after selecting exercise', orbGone);

  // CHECK: Canvas visible behind (semi-transparent overlay)
  const overlayBg = await page.evaluate(() =>
    getComputedStyle(document.getElementById('breathe-overlay')).background
  );
  log('Overlay is semi-transparent', overlayBg.includes('0.8') || overlayBg.includes('rgba'), overlayBg.substring(0, 60));

  // CHECK: 3 pattern buttons
  const patternBtns = await page.$$('.pattern-btn');
  log('3 breathing patterns', patternBtns.length === 3, `found ${patternBtns.length}`);

  const patternTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.pattern-btn')).map(b => b.textContent)
  );
  log('Patterns: Box, 4-7-8, Simple', patternTexts.join(', ').includes('Box') && patternTexts.join(', ').includes('4-7-8'), patternTexts.join(', '));

  // CHECK: First pattern selected by default
  const firstSelected = await page.evaluate(() =>
    document.querySelector('.pattern-btn')?.classList.contains('selected')
  );
  log('First pattern selected by default', firstSelected);

  // CHECK: Start button visible
  const startVisible = await page.evaluate(() =>
    !document.getElementById('breathe-start')?.classList.contains('hidden')
  );
  log('Start button visible', startVisible);

  // CHECK: Close button exists
  const closeExists = await page.$('#breathe-close');
  log('Close button exists', closeExists !== null);

  // CHECK: Skip button exists
  const skipExists = await page.$('#breathe-skip');
  log('Skip button exists', skipExists !== null);

  await page.screenshot({ path: 'tests/screenshots/phase5-breathe-ready.png' });

  // Select 4-7-8 pattern
  await page.click('.pattern-btn:nth-child(2)');
  await page.waitForTimeout(100);
  const secondSelected = await page.evaluate(() =>
    document.querySelectorAll('.pattern-btn')[1]?.classList.contains('selected')
  );
  log('Can switch breathing pattern', secondSelected);

  // Switch back to Simple for faster testing
  await page.click('.pattern-btn:nth-child(3)');
  await page.waitForTimeout(100);

  // Start breathing
  await page.click('#breathe-start');
  await page.waitForTimeout(500);

  // CHECK: Running state
  const isRunning = await page.evaluate(() => breathe.running);
  log('Breathing exercise running', isRunning);

  // CHECK: Start button hidden
  const startHidden = await page.evaluate(() =>
    document.getElementById('breathe-start')?.classList.contains('hidden')
  );
  log('Start button hidden during exercise', startHidden);

  // CHECK: Label shows phase text
  const labelText = await page.$eval('#breathe-label', el => el.textContent);
  log('Phase label visible', labelText.length > 0, labelText);

  // CHECK: Cycle counter shows
  const counterText = await page.$eval('#breathe-counter', el => el.textContent);
  log('Cycle counter shows', counterText.includes('/'), counterText);

  // CHECK: Circle has animation class
  const circleClass = await page.evaluate(() =>
    document.getElementById('breathe-circle')?.className
  );
  log('Circle has phase class', circleClass.includes('inhale') || circleClass.includes('exhale') || circleClass.includes('hold'), circleClass);

  await page.screenshot({ path: 'tests/screenshots/phase5-breathe-active.png' });

  // Wait for full cycle of Simple (5s inhale + 5s exhale = 10s per cycle, 4 cycles = 40s)
  // Wait for 2 cycles worth to check cycle counter advances
  await page.waitForTimeout(11000); // > 1 full cycle
  const cycleAfter = await page.evaluate(() => breathe.cycle);
  log('Cycle counter advances', cycleAfter >= 2, `cycle: ${cycleAfter}`);

  // CHECK: Close button works (exit mid-exercise)
  await page.click('#breathe-close');
  await page.waitForTimeout(300);
  const overlayClosed = await page.evaluate(() =>
    !document.getElementById('breathe-overlay')?.classList.contains('active')
  );
  log('Close button exits exercise', overlayClosed);

  const stoppedAfterClose = await page.evaluate(() => !breathe.running);
  log('Exercise stops on close', stoppedAfterClose);

  // Re-open and test completion flow
  await page.evaluate(() => openBreatheOverlay());
  await page.waitForTimeout(200);

  // Select Simple pattern (fastest: 5+5=10s * 4 = 40s total)
  await page.click('.pattern-btn:nth-child(3)');
  await page.waitForTimeout(100);
  await page.click('#breathe-start');

  // Wait for full completion (Simple: 10s * 4 = 40s)
  await page.waitForTimeout(42000);

  const doneLabel = await page.$eval('#breathe-label', el => el.textContent);
  log('Shows "Nice work" on completion', doneLabel === 'Nice work', doneLabel);

  const doneRunning = await page.evaluate(() => breathe.running);
  log('Exercise stops at completion', !doneRunning);

  await page.screenshot({ path: 'tests/screenshots/phase5-breathe-done.png' });

  // Skip/Done button to close
  await page.click('#breathe-skip');
  await page.waitForTimeout(300);
  const closedAfterDone = await page.evaluate(() =>
    !document.getElementById('breathe-overlay')?.classList.contains('active')
  );
  log('Done/Skip closes overlay', closedAfterDone);

  // === BACK BUTTON CLEANUP ===
  // Verify going back clears everything
  await page.evaluate(() => {
    gentlePrompt.shown = false;
    showGentleOrb();
  });
  await page.waitForTimeout(200);
  await page.click('#btn-back');
  await page.waitForTimeout(500);

  const orbAfterBack = await page.evaluate(() =>
    !document.getElementById('gentle-orb')?.classList.contains('visible')
  );
  log('Orb hidden on back to profiles', orbAfterBack);

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
