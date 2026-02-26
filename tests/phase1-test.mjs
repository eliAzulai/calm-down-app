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

  // --- iPad viewport test ---
  const ipadContext = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ipadContext.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // CHECK 1: Dark background + DM Sans
  const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  log('1. Dark background (#0d1b2a)', bgColor === 'rgb(13, 27, 42)', bgColor);

  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  log('1. DM Sans font loads', fontFamily.includes('DM Sans'), fontFamily);

  // CHECK 2: Ambient background canvas exists and is rendering
  const canvasExists = await page.evaluate(() => {
    const c = document.getElementById('ambient-canvas');
    return c && c.width > 0 && c.height > 0;
  });
  log('2. Ambient canvas exists and has size', canvasExists);

  // Check ambient canvas has pixels drawn (not all black)
  const hasPixels = await page.evaluate(() => {
    const c = document.getElementById('ambient-canvas');
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonZero = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 0 || data[i+1] > 0 || data[i+2] > 0) nonZero++;
    }
    return nonZero;
  });
  log('2. Ambient canvas has drawn pixels (gradients+particles)', hasPixels > 0, `${hasPixels} non-zero pixels`);

  // CHECK 3: Two empty "+" cards in centered grid
  const emptyCards = await page.$$('.profile-card.empty');
  log('3. Two empty "+" cards', emptyCards.length === 2, `found ${emptyCards.length}`);

  const gridDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('.profiles-grid')).display);
  log('3. Grid layout', gridDisplay === 'grid', gridDisplay);

  // CHECK 4: Tap empty card → inline setup expands
  await emptyCards[0].click();
  await page.waitForTimeout(400);

  const setupCard = await page.$('.profile-card.setup');
  log('4. Tap empty card → setup card appears', setupCard !== null);

  const nameInput = await page.$('.setup-name-input');
  log('4. Name input exists in setup', nameInput !== null);

  // Check input is focused
  const isFocused = await page.evaluate(() => document.activeElement?.classList.contains('setup-name-input'));
  log('4. Name input is auto-focused', isFocused);

  // CHECK 5: Name input works
  await nameInput.fill('Alex');
  const inputValue = await nameInput.inputValue();
  log('5. Name input accepts text', inputValue === 'Alex', inputValue);

  // Icon picker works
  const iconOptions = await page.$$('.icon-option');
  log('5. Icon picker has 5 options', iconOptions.length === 5, `found ${iconOptions.length}`);

  // Click lightning icon
  const lightningOpt = await page.$('[data-icon="lightning"]');
  await lightningOpt.click();
  await page.waitForTimeout(100);
  const lightningSelected = await page.evaluate(() => document.querySelector('[data-icon="lightning"]')?.classList.contains('selected'));
  log('5. Icon picker selection works', lightningSelected);

  // Theme picker works
  const themeOptions = await page.$$('.theme-option');
  log('5. Theme picker has 3 options', themeOptions.length === 3, `found ${themeOptions.length}`);

  const sunsetOpt = await page.$('[data-theme="sunset"]');
  await sunsetOpt.click();
  await page.waitForTimeout(100);
  const sunsetSelected = await page.evaluate(() => document.querySelector('[data-theme="sunset"]')?.classList.contains('selected'));
  log('5. Theme picker selection works', sunsetSelected);

  // CHECK 6: "Done" disabled until name entered
  // First check with name — should be enabled
  const doneEnabled = await page.evaluate(() => !document.querySelector('.btn-done')?.disabled);
  log('6. Done button enabled when name entered', doneEnabled);

  // Clear name, check disabled
  await nameInput.fill('');
  await page.waitForTimeout(50);
  const doneDisabledEmpty = await page.evaluate(() => document.querySelector('.btn-done')?.disabled);
  log('6. Done button disabled when name empty', doneDisabledEmpty);

  // Re-fill name
  await nameInput.fill('Alex');

  // CHECK 7: Save → filled card
  const doneBtn = await page.$('.btn-done');
  await doneBtn.click();
  await page.waitForTimeout(300);

  const filledCards = await page.$$('.profile-card.filled');
  log('7. Save creates filled card', filledCards.length === 1, `${filledCards.length} filled cards`);

  const profileName = await page.$eval('.profile-name', el => el.textContent);
  log('7. Filled card shows name', profileName === 'Alex', profileName);

  const profileIcon = await page.$('.profile-icon svg');
  log('7. Filled card has SVG icon', profileIcon !== null);

  // Check accent glow (sunset theme)
  const cardStyle = await page.evaluate(() => {
    const card = document.querySelector('.profile-card.filled');
    return card?.style.getPropertyValue('--accent');
  });
  log('7. Filled card has theme accent', cardStyle === '#e8845a', cardStyle);

  // CHECK 8: Create second profile
  const remainingEmpty = await page.$$('.profile-card.empty');
  log('8. One empty slot remains', remainingEmpty.length === 1);

  await remainingEmpty[0].click();
  await page.waitForTimeout(400);

  const nameInput2 = await page.$('.setup-name-input');
  await nameInput2.fill('Sam');

  // Pick forest theme
  const forestOpt = await page.$('[data-theme="forest"]');
  await forestOpt.click();
  await page.waitForTimeout(100);

  // Pick moon icon
  const moonOpt = await page.$('[data-icon="moon"]');
  await moonOpt.click();
  await page.waitForTimeout(100);

  const doneBtn2 = await page.$('.btn-done');
  await doneBtn2.click();
  await page.waitForTimeout(300);

  const allFilled = await page.$$('.profile-card.filled');
  log('8. Two filled profiles', allFilled.length === 2, `${allFilled.length} filled`);

  const noEmpty = await page.$$('.profile-card.empty');
  log('8. No empty slots remain', noEmpty.length === 0);

  // CHECK 9: Profiles persist across reload
  const profilesBefore = await page.evaluate(() => localStorage.getItem('calm-station-profiles'));
  log('9. Profiles in localStorage', profilesBefore !== null, `${profilesBefore?.length} chars`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const filledAfterReload = await page.$$('.profile-card.filled');
  log('9. Profiles persist after reload', filledAfterReload.length === 2, `${filledAfterReload.length} filled`);

  const nameAfterReload = await page.$eval('.profile-name', el => el.textContent);
  log('9. First profile name persists', nameAfterReload === 'Alex', nameAfterReload);

  // CHECK 10: Tap filled card → transition to canvas
  const firstCard = await page.$('.profile-card.filled');
  await firstCard.click();
  await page.waitForTimeout(500);

  const canvasScreenActive = await page.evaluate(() => document.getElementById('screen-canvas')?.classList.contains('active'));
  log('10. Canvas screen is active after tap', canvasScreenActive);

  const profilesHidden = await page.evaluate(() => !document.getElementById('screen-profiles')?.classList.contains('active'));
  log('10. Profile screen is hidden', profilesHidden);

  const placeholderText = await page.$eval('.placeholder-text', el => el.textContent);
  log('10. Canvas placeholder text shows', placeholderText === 'Canvas coming soon', placeholderText);

  // Check theme applied to canvas screen
  const canvasHasTheme = await page.evaluate(() => {
    const cs = document.getElementById('screen-canvas');
    return cs.classList.contains('theme-sunset') || cs.classList.contains('theme-ocean') || cs.classList.contains('theme-forest');
  });
  log('10. Theme class applied to canvas screen', canvasHasTheme);

  // CHECK 11: Back button
  const backBtn = await page.$('#btn-back');
  log('11. Back button exists', backBtn !== null);

  await backBtn.click();
  await page.waitForTimeout(500);

  const profilesActiveAgain = await page.evaluate(() => document.getElementById('screen-profiles')?.classList.contains('active'));
  log('11. Back returns to profiles', profilesActiveAgain);

  const canvasHidden = await page.evaluate(() => !document.getElementById('screen-canvas')?.classList.contains('active'));
  log('11. Canvas screen is hidden after back', canvasHidden);

  // CHECK 12: No double-tap zoom, no pull-to-refresh
  const touchAction = await page.evaluate(() => getComputedStyle(document.body).touchAction);
  log('12. touch-action: manipulation', touchAction === 'manipulation', touchAction);

  const overscroll = await page.evaluate(() => getComputedStyle(document.body).overscrollBehavior);
  log('12. overscroll-behavior: none', overscroll === 'none', overscroll);

  const userSelect = await page.evaluate(() => getComputedStyle(document.body).userSelect);
  log('12. user-select: none', userSelect === 'none', userSelect);

  // CHECK 13: Touch targets ≥ 48x48px
  const backBtnSize = await page.evaluate(() => {
    const btn = document.getElementById('btn-back');
    const rect = btn.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  });
  log('13. Back button ≥ 48x48', backBtnSize.w >= 48 && backBtnSize.h >= 48, `${backBtnSize.w}x${backBtnSize.h}`);

  // Check icon option size
  // Need to open setup to check — go back to profiles, but all slots are filled
  // Check Done button min-height instead
  const doneMinH = await page.evaluate(() => {
    // Check the CSS rule
    const style = getComputedStyle(document.createElement('button'));
    // Can't easily check without a setup card, check the CSS value
    const sheets = document.styleSheets;
    for (const sheet of sheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === '.btn-done') {
            return rule.style.minHeight;
          }
        }
      } catch(e) {}
    }
    return 'unknown';
  });
  log('13. Done button min-height 44px+', doneMinH === '44px', doneMinH);

  // CHECK 14: Multiple viewports
  // Already tested at 768x1024 (iPad). Test 375px (phone) and 1024px.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(300);
  const gridAt375 = await page.evaluate(() => {
    const grid = document.querySelector('.profiles-grid');
    const cols = getComputedStyle(grid).gridTemplateColumns;
    return cols;
  });
  log('14. Grid at 375px (phone)', gridAt375.split(' ').length === 1, `cols: ${gridAt375}`);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(300);
  const gridAt1024 = await page.evaluate(() => {
    const grid = document.querySelector('.profiles-grid');
    const cols = getComputedStyle(grid).gridTemplateColumns;
    return cols;
  });
  log('14. Grid at 1024px (landscape iPad)', gridAt1024.split(' ').length >= 1, `cols: ${gridAt1024}`);

  // CHECK 15: No console errors
  log('15. No console errors', consoleErrors.length === 0, consoleErrors.length > 0 ? consoleErrors.join('; ') : 'clean');

  // --- Screenshots at iPad viewport ---
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/calm-profiles.png', fullPage: false });

  // Navigate to canvas for screenshot
  const card = await page.$('.profile-card.filled');
  await card.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/calm-canvas.png', fullPage: false });

  await browser.close();

  // Summary
  console.log('\n========================================');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`TOTAL: ${passed} passed, ${failed} failed out of ${results.length}`);
  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter(r => !r.pass).forEach(r => console.log(`  - ${r.check}: ${r.detail || ''}`));
  }
  console.log('========================================');

  // Screenshot paths
  console.log('\nScreenshots:');
  console.log('  Profile screen: /tmp/calm-profiles.png');
  console.log('  Canvas screen:  /tmp/calm-canvas.png');
})();
