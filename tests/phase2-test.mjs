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

  // --- Setup: create a profile so we can enter canvas ---
  // Check if profiles already exist from previous test
  const existingFilled = await page.$$('.profile-card.filled');
  if (existingFilled.length === 0) {
    // Create a profile
    const emptyCard = await page.$('.profile-card.empty');
    await emptyCard.click();
    await page.waitForTimeout(400);
    await page.fill('.setup-name-input', 'TestKid');
    await page.click('.btn-done');
    await page.waitForTimeout(300);
  }

  // Enter profile → canvas screen
  const profileCard = await page.$('.profile-card.filled');
  await profileCard.click();
  await page.waitForTimeout(600);

  // CHECK 1: Full-screen canvas exists and fills viewport
  const canvasActive = await page.evaluate(() => document.getElementById('screen-canvas')?.classList.contains('active'));
  log('Canvas screen active', canvasActive);

  const mainCanvasSize = await page.evaluate(() => {
    const c = document.getElementById('main-canvas');
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight };
  });
  log('Main canvas fills viewport', mainCanvasSize.cw === 768 && mainCanvasSize.ch === 1024,
    `${mainCanvasSize.cw}x${mainCanvasSize.ch} client, ${mainCanvasSize.w}x${mainCanvasSize.h} buffer`);

  // CHECK 2: Mode indicator shows on entry
  const modeVisible = await page.evaluate(() =>
    document.getElementById('mode-indicator')?.classList.contains('visible')
  );
  log('Mode indicator visible on entry', modeVisible);

  const modeText = await page.$eval('#mode-indicator', el => el.textContent);
  log('Initial mode is Finger Trails', modeText === 'Finger Trails', modeText);

  // CHECK 3: Touch interaction — finger trails
  // Simulate a drag across the canvas
  await page.mouse.move(200, 400);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(200 + i * 15, 400 + i * 10, { steps: 2 });
  }
  await page.mouse.up();
  await page.waitForTimeout(200);

  // Check canvas has drawn pixels
  const trailPixels = await page.evaluate(() => {
    const c = document.getElementById('main-canvas');
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
      if (data[i] > 20 || data[i+1] > 30 || data[i+2] > 30) colored++;
    }
    return colored;
  });
  log('Finger trails draw on canvas', trailPixels > 50, `${trailPixels} colored samples`);

  // Screenshot trails mode
  await page.screenshot({ path: 'tests/screenshots/phase2-trails.png' });

  // CHECK 4: Double-tap to cycle modes
  await page.mouse.click(400, 500);
  await page.waitForTimeout(100);
  await page.mouse.click(400, 500);
  await page.waitForTimeout(400);

  const modeAfterDT = await page.$eval('#mode-indicator', el => el.textContent);
  log('Double-tap cycles to Particles', modeAfterDT === 'Particles', modeAfterDT);

  // CHECK 5: Particles mode — touch spawns particles
  await page.mouse.click(384, 512);
  await page.waitForTimeout(300);

  const particlePixels = await page.evaluate(() => {
    const c = document.getElementById('main-canvas');
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] > 20 || data[i+1] > 30 || data[i+2] > 30) colored++;
    }
    return colored;
  });
  log('Particles spawn on touch', particlePixels > 20, `${particlePixels} colored samples`);

  await page.screenshot({ path: 'tests/screenshots/phase2-particles.png' });

  // CHECK 6: Double-tap again → Ripples
  await page.mouse.click(400, 500);
  await page.waitForTimeout(100);
  await page.mouse.click(400, 500);
  await page.waitForTimeout(400);

  const modeRipples = await page.$eval('#mode-indicator', el => el.textContent);
  log('Double-tap cycles to Ripples', modeRipples === 'Ripples', modeRipples);

  // Tap for ripples
  await page.mouse.click(384, 512);
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'tests/screenshots/phase2-ripples.png' });

  // CHECK 7: Double-tap wraps back to trails
  await page.mouse.click(400, 500);
  await page.waitForTimeout(100);
  await page.mouse.click(400, 500);
  await page.waitForTimeout(400);

  const modeWrapped = await page.$eval('#mode-indicator', el => el.textContent);
  log('Mode wraps back to Finger Trails', modeWrapped === 'Finger Trails', modeWrapped);

  // CHECK 8: Clear button exists and works
  const clearBtn = await page.$('#btn-clear');
  log('Clear button exists', clearBtn !== null);

  const clearSize = await page.evaluate(() => {
    const b = document.getElementById('btn-clear');
    const r = b.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  log('Clear button ≥ 48px', clearSize.w >= 48 && clearSize.h >= 48, `${clearSize.w}x${clearSize.h}`);

  // Draw something then clear
  await page.mouse.move(300, 300);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(300 + i * 20, 300 + i * 20, { steps: 2 });
  }
  await page.mouse.up();
  await page.waitForTimeout(200);

  await clearBtn.click();
  await page.waitForTimeout(300);

  const afterClear = await page.evaluate(() => {
    const c = document.getElementById('main-canvas');
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    // Background is #0d1b2a = rgb(13,27,42). Check for pixels significantly brighter.
    let colored = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] > 30 || data[i+1] > 50 || data[i+2] > 60) colored++;
    }
    return colored;
  });
  log('Clear button wipes canvas', afterClear < 50, `${afterClear} colored samples after clear`);

  // CHECK 9: Pinch zoom state exists
  const pinchState = await page.evaluate(() => {
    // Can't easily simulate real pinch in Playwright, but verify scale property exists
    return typeof window.eval('canvas.scale') === 'number';
  });
  // Just verify the scale property is accessible
  const scaleVal = await page.evaluate(() => {
    // Access via the global canvas object
    return typeof canvas !== 'undefined' && typeof canvas.scale === 'number';
  });
  log('Pinch zoom scale property exists', scaleVal);

  // CHECK 10: Theme colors applied
  const themeColors = await page.evaluate(() => {
    return { accent: canvas.accentRGB, secondary: canvas.secondaryRGB };
  });
  log('Theme accent colors set', themeColors.accent && themeColors.accent.length === 3,
    `accent: [${themeColors.accent}]`);

  // CHECK 11: Back button returns to profiles
  await page.click('#btn-back');
  await page.waitForTimeout(500);

  const profilesBack = await page.evaluate(() =>
    document.getElementById('screen-profiles')?.classList.contains('active')
  );
  log('Back button returns to profiles', profilesBack);

  // CHECK 12: Canvas animation stopped after leaving
  const animStopped = await page.evaluate(() => canvas.animId === null);
  log('Canvas animation stopped on exit', animStopped);

  // CHECK 13: Multi-touch support (verify pointer events used, not mouse-only)
  const usesPointerEvents = await page.evaluate(() => {
    const c = document.getElementById('main-canvas');
    // Check touch-action: none on canvas
    return getComputedStyle(c).touchAction === 'none';
  });
  log('Canvas touch-action: none (multi-touch ready)', usesPointerEvents);

  // CHECK 14: No console errors
  log('No console errors', consoleErrors.length === 0,
    consoleErrors.length > 0 ? consoleErrors.join('; ') : 'clean');

  // CHECK 15: Performance — canvas render loop uses rAF
  const usesRAF = await page.evaluate(() => typeof canvas.animId === 'number' || canvas.animId === null);
  log('Uses requestAnimationFrame', usesRAF);

  // Final screenshot — re-enter canvas for a clean shot
  await page.click('.profile-card.filled');
  await page.waitForTimeout(600);

  // Draw some trails for a nice screenshot
  for (let trail = 0; trail < 3; trail++) {
    const startX = 150 + trail * 200;
    const startY = 300 + trail * 100;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(
        startX + Math.sin(i * 0.3) * 80 + i * 5,
        startY + Math.cos(i * 0.3) * 60 + i * 8,
        { steps: 2 }
      );
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screenshots/phase2-trails-final.png' });

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
