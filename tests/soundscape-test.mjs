// Soundscape 2.0 test — layered audio (music/ambient/sfx buses).
// Requires: python3 -m http.server 8080 --directory src   (or npx http-server src -p 8080)
// NOTE: checks are stateful and order-dependent by design (one continuous session); see phase9-test.mjs for the isolated-state alternative.
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

// Seed two profiles so we can enter the canvas directly and test
// cross-profile state isolation. Earlier checks click the FIRST
// .profile-card.filled, which remains sc1.
await page.addInitScript(() => {
  localStorage.setItem('calm-station-profiles',
    JSON.stringify([
      { id: 'sc1', name: 'ScapeKid', icon: 'flame', theme: 'ocean' },
      { id: 'sc2', name: 'OtherKid', icon: 'flame', theme: 'forest' },
    ]));
});

// Instrument music-length buffer sources (music tracks are 200s+; ambient
// noise buffers are seconds — duration>100 separates the layers).
await page.addInitScript(() => {
  window.__musicSrc = { started: 0, stopped: 0 };
  const origStart = AudioBufferSourceNode.prototype.start;
  const origStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function(...a) {
    if (this.buffer && this.buffer.duration > 100) window.__musicSrc.started++;
    return origStart.apply(this, a);
  };
  AudioBufferSourceNode.prototype.stop = function(...a) {
    const r = origStop.apply(this, a);
    if (this.buffer && this.buffer.duration > 100) window.__musicSrc.stopped++;
    return r;
  };
  // Force decodes to overlap the rapid-click window (race determinism).
  const origDecode = AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData = function(...a) {
    return new Promise(res => setTimeout(res, 300)).then(() => origDecode.apply(this, a));
  };
  if (window.webkitAudioContext && webkitAudioContext.prototype !== AudioContext.prototype) {
    const origWkDecode = webkitAudioContext.prototype.decodeAudioData;
    webkitAudioContext.prototype.decodeAudioData = function(...a) {
      return new Promise(res => setTimeout(res, 300)).then(() => origWkDecode.apply(this, a));
    };
  }
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

await check('Rapid switch leaves exactly one live music source', async () => {
  // forestrain is deliberately uncached here (no earlier check touches it):
  // the double-decode race only exists on the cold path — a cached track
  // resolves synchronously and can never overlap itself in flight.
  await page.click('#music-options .sound-option[data-music="forestrain"]');
  await page.waitForTimeout(50);
  await page.click('#music-options .sound-option[data-music="tides"]');
  await page.waitForTimeout(50);
  await page.click('#music-options .sound-option[data-music="forestrain"]');
  await page.waitForFunction(() => audio.musicPlaying === true && audio.musicNodes !== null, null, { timeout: 10000 });
  await page.waitForTimeout(2500); // let stray decodes settle and fade-stop timers fire
  const counts = await page.evaluate(() => window.__musicSrc);
  const live = counts.started - counts.stopped;
  if (live !== 1) throw new Error(`live music sources: ${live} (${JSON.stringify(counts)})`);
  return 'one live source';
});

await check('Ambient ducks under music', async () => {
  // state from previous checks: forestrain (music) + rain (ambient) both live
  await page.waitForFunction(() => Math.abs(audio.ambientBus.gain.value - 0.7) < 0.1, null, { timeout: 6000 });
  return 'ambientBus ~0.7';
});

await check('Duck releases when music stops', async () => {
  await page.click('#music-options .sound-option[data-music="forestrain"]');
  await page.waitForFunction(() => audio.musicPlaying === false, null, { timeout: 5000 });
  await page.waitForFunction(() => Math.abs(audio.ambientBus.gain.value - 1.0) < 0.1, null, { timeout: 6000 });
  return 'ambientBus back to 1.0';
});

await check('Pause stops both layers', async () => {
  await page.click('#music-options .sound-option[data-music="bowls"]');
  await page.waitForFunction(() => audio.musicPlaying === true && audio.playing === true, null, { timeout: 10000 });
  await page.click('#btn-play-pause');
  await page.waitForFunction(() => audio.musicPlaying === false && audio.playing === false, null, { timeout: 5000 });
  return 'both stopped';
});

await check('Play resumes both layers', async () => {
  await page.click('#btn-play-pause');
  await page.waitForFunction(() => audio.musicPlaying === true && audio.playing === true, null, { timeout: 10000 });
  return 'both resumed';
});

await check('Pause snapshot does not leak across profiles', async () => {
  // Leave profile A with layers paused-then-resumed state behind
  await page.click('#btn-back');
  await page.waitForSelector('#screen-profiles.active');
  await page.locator('.profile-card.filled').nth(1).click();
  await page.waitForSelector('#screen-canvas.active');
  await page.click('#btn-sound');
  await page.waitForSelector('#sound-panel.open');
  await page.click('#btn-play-pause');
  await page.waitForFunction(() => audio.playing === true, null, { timeout: 5000 });
  const state = await page.evaluate(() => ({ musicPlaying: audio.musicPlaying, currentId: audio.currentId }));
  if (state.musicPlaying !== false || state.currentId !== 'rain') throw new Error(JSON.stringify(state));
  return 'fresh profile gets legacy default only';
});

await check('Ambient swap while paused keeps music in snapshot', async () => {
  await page.click('#music-options .sound-option[data-music="bowls"]');
  await page.waitForFunction(() => audio.musicPlaying === true && audio.musicNodes !== null, null, { timeout: 10000 });
  await page.click('#btn-play-pause'); // pause both
  await page.waitForFunction(() => audio.playing === false && audio.musicPlaying === false, null, { timeout: 5000 });
  await page.click('#sound-options .sound-option[data-sound="ocean"]'); // change mind while paused
  await page.waitForFunction(() => audio.playing === true && audio.currentId === 'ocean', null, { timeout: 5000 });
  await page.click('#btn-play-pause'); // pause again (merge must keep bowls)
  await page.waitForFunction(() => audio.playing === false, null, { timeout: 5000 });
  await page.click('#btn-play-pause'); // resume
  await page.waitForFunction(() => audio.playing === true && audio.musicPlaying === true, null, { timeout: 10000 });
  const s = await page.evaluate(() => ({ currentId: audio.currentId, musicId: audio.musicId }));
  if (s.currentId !== 'ocean' || s.musicId !== 'bowls') throw new Error(JSON.stringify(s));
  return 'ocean + bowls both back';
});

await check('Toggle-off while paused clears that half only', async () => {
  await page.click('#btn-play-pause'); // pause both (snapshot {ocean,bowls})
  await page.waitForFunction(() => audio.playing === false && audio.musicPlaying === false, null, { timeout: 5000 });
  await page.click('#sound-options .sound-option[data-sound="ocean"]'); // starts ocean again
  await page.waitForFunction(() => audio.playing === true, null, { timeout: 5000 });
  await page.click('#sound-options .sound-option[data-sound="ocean"]'); // toggle OFF = explicit stop intent
  await page.waitForFunction(() => audio.playing === false, null, { timeout: 5000 });
  await page.click('#btn-play-pause'); // resume: bowls must return, ambient must NOT
  await page.waitForFunction(() => audio.musicPlaying === true, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({ playing: audio.playing, musicId: audio.musicId }));
  if (s.playing !== false || s.musicId !== 'bowls') throw new Error(JSON.stringify(s));
  return 'music back, stopped ambient stays stopped';
});

// Relies on prior checks having produced both music and ambient sound_select events across sc1+sc2.
await check('Signals carry layer field', async () => {
  const events = await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('calm-station-sc1-signals')) || [];
    const b = JSON.parse(localStorage.getItem('calm-station-sc2-signals')) || [];
    return a.concat(b);
  });
  const music = events.filter(e => e.type === 'sound_select' && e.payload.layer === 'music');
  const ambient = events.filter(e => e.type === 'sound_select' && e.payload.layer === 'ambient');
  if (!music.length || !ambient.length) throw new Error(`music:${music.length} ambient:${ambient.length}`);
  return `${music.length} music, ${ambient.length} ambient selects`;
});

await check('Signal context includes music state', async () => {
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-sc2-signals')) || []);
  const last = events[events.length - 1];
  if (!last || !('musicId' in (last.context || {}))) throw new Error('context missing musicId');
  return 'context has musicId/musicPlaying';
});

await check('Entrainment off by default', async () => {
  const rate = await page.evaluate(() => entrainment.rate);
  if (rate !== null) throw new Error(`rate=${rate}`);
  return 'off';
});

await check('Entrainment applies and clears', async () => {
  const applied = await page.evaluate(() => {
    applyEntrainment('theta');
    const on = entrainment.rate === 'theta' && entrainment.osc !== null;
    applyEntrainment('');
    const off = entrainment.rate === null && entrainment.osc === null;
    return on && off;
  });
  if (!applied) throw new Error('apply/clear failed');
  return 'theta on/off';
});

await check('Kid canvas shows no experiment copy', async () => {
  const text = await page.evaluate(() => document.getElementById('screen-canvas').textContent);
  if (/entrainment|experiment|sfx/i.test(text)) throw new Error('leaked dev copy');
  return 'clean';
});

await check('SFX scheduler off by default', async () => {
  const active = await page.evaluate(() => sfx.active);
  if (active) throw new Error('sfx active without dev control');
  return 'inactive';
});

await check('SFX accent plays + records when enabled', async () => {
  await page.evaluate(() => {
    var controls = getDevControls();
    controls['sc2'] = Object.assign({}, controls['sc2'], { sfxEnabled: true });
    saveDevControls(controls);
    startSfxScheduler('sc2');
    playSfxAccent();
  });
  await page.waitForFunction(() => {
    const events = JSON.parse(localStorage.getItem('calm-station-sc2-signals')) || [];
    return events.some(e => e.type === 'sfx_played');
  }, null, { timeout: 10000 });
  return 'sfx_played recorded';
});

await check('Dev screen has entrainment + SFX controls', async () => {
  await page.goto(`${BASE}/?dev=true`);
  await page.waitForSelector('[data-dev-control="entrainmentRate"]');
  await page.waitForSelector('[data-dev-control="sfxEnabled"]');
  return 'controls present';
});

await check('SW precaches audio assets', async () => {
  const res = await page.request.get(`${BASE}/sw.js`);
  const body = await res.text();
  const wanted = ['audio/music/bowls.mp3', 'audio/music/tides.mp3', 'audio/music/forest-rain.mp3', 'audio/sfx/chime.mp3'];
  const missing = wanted.filter(w => !body.includes(w));
  if (missing.length) throw new Error('missing: ' + missing.join(','));
  if (!body.includes('calm-station-v2')) throw new Error('cache name not bumped');
  return 'v2 + 4 audio assets';
});

await check('SW cache actually contains audio (real Cache Storage)', async () => {
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.waitForFunction(async () => {
    const hit = await caches.match('./audio/music/bowls.mp3');
    return hit ? hit.status : null;
  }, null, { timeout: 15000 });
  const status = await cached.jsonValue();
  if (status !== 200) throw new Error(`cache miss/status ${status}`);
  return 'bowls.mp3 in Cache Storage';
});

await check('No console errors', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors[0]);
  return 'clean';
});

console.log(`\nSoundscape: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
