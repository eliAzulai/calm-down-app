// Phase 12 test — Spec 5: Pond sound mode + CALM_CHIME + freeform stroke redesign.
// Requires: npx http-server src -p 8080   (same harness as phase1–11)
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

// Shared pixel probes (house idiom: alpha channel, sparse stride).
const litCount = () => {
  const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
  return n;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.addInitScript(() => {
  localStorage.setItem('calm-station-profiles',
    JSON.stringify([
      { id: 'pf1', name: 'PondKid', icon: 'flame', theme: 'ocean' },
      { id: 'pf2', name: 'OtherKid', icon: 'flame', theme: 'forest' },
    ]));
});

await page.goto(BASE);
await page.click('.profile-card.filled');
await page.waitForSelector('#screen-canvas.active');

await check('Pond registered: registry list, MODES ring, tray chip', async () => {
  const reg = await page.evaluate(() => ({
    inList: window.CALM_MODES.list.includes('pond'),
    last: window.CALM_MODES.list[window.CALM_MODES.list.length - 1],
    inModes: MODES.includes('pond'),
    label: MODE_LABELS.pond,
  }));
  if (!reg.inList) throw new Error('not in CALM_MODES.list');
  if (reg.last !== 'pond') throw new Error('not last registry mode: ' + reg.last);
  if (!reg.inModes) throw new Error('not in MODES');
  if (reg.label !== 'Pond') throw new Error('label=' + reg.label);
  await page.click('#btn-modes');
  await page.waitForSelector('#mode-tray.open');
  const chip = await page.locator('#mode-options .mode-option[data-mode="pond"]').count();
  await page.click('#btn-modes');
  if (chip !== 1) throw new Error('tray chip missing');
  return 'registered + tray chip';
});

await check('SW v8 precaches pond.js', async () => {
  const body = await (await page.request.get(`${BASE}/sw.js`)).text();
  if (!body.includes('modes/pond.js')) throw new Error('pond.js not in ASSETS');
  if (!body.includes('calm-station-v8')) throw new Error('cache not v8');
  return 'v8 + pond.js';
});

await check('Style tray for pond: Mood + Size shown, Character + Trace hidden', async () => {
  await page.evaluate(() => { switchToMode(MODES.indexOf('pond'), 'test'); });
  await page.waitForTimeout(200);
  await page.click('#btn-style');
  await page.waitForSelector('#style-tray.open');
  const rows = await page.evaluate(() => ({
    moods: document.getElementById('style-moods').style.display,
    chars: document.getElementById('style-chars').style.display,
    size: document.getElementById('style-size').style.display,
    trace: document.getElementById('style-trace').style.display,
    swatches: document.querySelectorAll('#style-moods .swatch').length,
  }));
  await page.click('#btn-style');
  if (rows.moods === 'none') throw new Error('moods hidden');
  if (rows.swatches !== 4) throw new Error('swatches=' + rows.swatches);
  if (rows.size === 'none') throw new Error('size hidden');
  if (rows.chars !== 'none') throw new Error('character row should be hidden');
  if (rows.trace !== 'none') throw new Error('trace row should be hidden (rings always fade)');
  return '4 moods + size; no character/trace';
});

await check('Pond calm start: nothing self-generates before first touch', async () => {
  await page.evaluate(() => { switchToMode(MODES.indexOf('pond'), 'test'); });
  await page.click('#btn-clear');
  // 8s > IDLE_DROP_MIN (7s): an ungated droplet timer WOULD have fired by now.
  await page.waitForTimeout(8000);
  const lit = await page.evaluate(litCount);
  if (lit > 2) throw new Error('self-generated: lit=' + lit);
  return 'blank after 8s untouched';
});

await check('Tap drops a pebble: rings paint, then fully drain', async () => {
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 380, box.y + 500);
  await page.waitForTimeout(400);
  const litLive = await page.evaluate(litCount);
  if (litLive < 5) throw new Error('no rings after tap: lit=' + litLive);
  // tap train: 3 rings, life 2.2s, last born +0.24s → all dead well before 4s
  await page.waitForTimeout(4000);
  const litAfter = await page.evaluate(litCount);
  if (litAfter > 2) throw new Error('rings did not drain: ' + litLive + ' -> ' + litAfter);
  return `rings ${litLive} live -> ${litAfter} drained`;
});

await check('Held release bursts bigger than a tap', async () => {
  const box = await page.locator('#main-canvas').boundingBox();
  // plain tap baseline
  await page.mouse.click(box.x + 380, box.y + 500);
  await page.waitForTimeout(400);
  const tapLit = await page.evaluate(litCount);
  await page.waitForTimeout(4000); // drain
  // charged stone: hold ~1.1s (well past CHARGE_START 0.35s), then release
  await page.mouse.move(box.x + 380, box.y + 500);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const burstLit = await page.evaluate(litCount);
  await page.waitForTimeout(4600); // drain for later checks
  if (burstLit <= tapLit * 1.2) throw new Error(`burst not bigger: tap=${tapLit} burst=${burstLit}`);
  return `tap=${tapLit} -> burst=${burstLit}`;
});

await check('CALM_CHIME exists and pond touches ping it', async () => {
  const api = await page.evaluate(() => typeof window.CALM_CHIME === 'object' && typeof window.CALM_CHIME.ping === 'function');
  if (!api) throw new Error('CALM_CHIME.ping missing');
  const before = await page.evaluate(() => window.CALM_CHIME._state.lastAt);
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 300, box.y + 300);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    lastAt: window.CALM_CHIME._state.lastAt,
  }));
  await page.waitForTimeout(2500); // let the voice ring out before later checks
  if (!(after.lastAt > before)) throw new Error('tap did not ping: lastAt ' + before + ' -> ' + after.lastAt);
  return 'tap pinged (lastAt advanced)';
});

await check('CALM_CHIME budgets: voice cap holds, rapid mash is rate-limited', async () => {
  const res = await page.evaluate(async () => {
    // 14 pings spaced past the 50ms rate cap: without the polyphony cap
    // voices would reach 14 (decay is 1.6s+, nothing ends this fast)
    for (let i = 0; i < 14; i++) {
      window.CALM_CHIME.ping({ pitch: i / 14, intensity: 0.5, depth: 0, pan: 0 });
      await new Promise(r => setTimeout(r, 60));
    }
    const spaced = window.CALM_CHIME._state.voices;
    // burst of 20 sync pings: rate cap admits at most 1
    const beforeBurst = window.CALM_CHIME._state.voices;
    for (let i = 0; i < 20; i++) window.CALM_CHIME.ping({ pitch: 0.5 });
    return { spaced, burstAdmitted: window.CALM_CHIME._state.voices - beforeBurst };
  });
  if (res.spaced < 1) throw new Error('no voices scheduled — chime path dead');
  if (res.spaced > 8) throw new Error('voice cap breached: ' + res.spaced);
  if (res.burstAdmitted > 1) throw new Error('rate cap breached: burst admitted ' + res.burstAdmitted);
  await page.waitForTimeout(3500); // ring-out
  return `spaced=${res.spaced} (≤8), burst admitted ${res.burstAdmitted} (≤1)`;
});

await check('Freeform: one stroke, stable width, continuous ink between samples', async () => {
  await page.evaluate(() => { switchToMode(MODES.indexOf('drawing'), 'test'); });
  await page.waitForTimeout(200);
  await page.click('#btn-clear');
  const box = await page.locator('#main-canvas').boundingBox();
  const y = 420;
  await page.mouse.move(box.x + 160, box.y + y);
  await page.mouse.down();
  // 80px hops — far beyond any per-event blob; smoothing must bridge them
  for (const x of [240, 320, 400, 480]) {
    await page.mouse.move(box.x + x, box.y + y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(250);
  const model = await page.evaluate(() => {
    const s = canvas.drawStrokes;
    return {
      strokes: s.length,
      points: s.length ? s[s.length - 1].points.length : 0,
      width: s.length ? s[s.length - 1].width : null,
      active: Object.keys(canvas.activeStrokes).length,
    };
  });
  if (model.strokes !== 1) throw new Error('strokes=' + model.strokes + ' (expected 1 continuous stroke)');
  if (model.points < 4) throw new Error('points=' + model.points);
  if (typeof model.width !== 'number') throw new Error('stroke has no single width — segment model?');
  if (model.active !== 0) throw new Error('stroke not finalized on pointerup');
  // ink present at inter-sample midpoints (viewport == canvas at dpr 1)
  const gaps = await page.evaluate((yy) => {
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const holes = [];
    for (const mx of [200, 280, 360, 440]) {
      const d = x.getImageData(mx - 1, yy - 4, 3, 9).data;
      let hit = false;
      for (let j = 3; j < d.length; j += 4) if (d[j] > 40) { hit = true; break; }
      if (!hit) holes.push(mx);
    }
    return holes;
  }, y);
  if (gaps.length) throw new Error('ink gaps at x=' + gaps.join(','));
  return `1 stroke, ${model.points} pts, width ${model.width.toFixed(2)}, no gaps`;
});

await check('Freeform: tap leaves a soft dot (old model painted nothing)', async () => {
  await page.click('#btn-clear');
  const box = await page.locator('#main-canvas').boundingBox();
  await page.mouse.click(box.x + 500, box.y + 600);
  await page.waitForTimeout(250);
  const dot = await page.evaluate(() => {
    const s = canvas.drawStrokes;
    const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
    const d = x.getImageData(497, 597, 7, 7).data;
    let ink = 0; for (let j = 3; j < d.length; j += 4) if (d[j] > 40) ink++;
    return { strokes: s.length, pts: s.length ? s[0].points.length : 0, ink };
  });
  if (dot.strokes !== 1 || dot.pts !== 1) throw new Error(`model: strokes=${dot.strokes} pts=${dot.pts}`);
  if (dot.ink < 4) throw new Error('no visible dot at tap point');
  return `1-point stroke, ${dot.ink} inked px`;
});

await check('Freeform: Clear resets strokes and canvas', async () => {
  await page.click('#btn-clear');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    strokes: canvas.drawStrokes.length,
    lit: (() => {
      const c = document.getElementById('main-canvas'); const x = c.getContext('2d');
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let j = 3; j < d.length; j += 400) { if (d[j] > 8) n++; }
      return n;
    })(),
  }));
  if (after.strokes !== 0) throw new Error('strokes survived clear: ' + after.strokes);
  if (after.lit > 2) throw new Error('canvas not blank: ' + after.lit);
  return 'strokes + pixels cleared';
});

await check('No console errors across the whole pass', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 3).join(' | '));
  return 'console clean';
});

console.log(`\nPhase 12: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
