# Soundscape 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layered audio engine (music/ambient/sfx buses) with 3 precached recordings, improved procedural textures tuned to A=432, and dev-gated entrainment/SFX experiments.

**Architecture:** Three `GainNode` buses feed the existing `masterGain` in `src/app.js`. Music plays decoded `AudioBuffer` loops from `src/audio/music/`; the 4 procedural generators keep their `(ctx, dest) → {gain, stop}` shape but get per-sound treatments; SFX and entrainment are per-profile dev-controlled experiments. Everything stays in the existing three-file vanilla-JS app (no build step).

**Tech Stack:** Vanilla JS, Web Audio API, Playwright tests (standalone scripts), ffmpeg (one-time asset prep), service-worker precache.

**Spec:** `docs/superpowers/specs/2026-07-03-soundscape-2.0-design.md`

---

## Prerequisites (before Task 1)

```bash
cd ~/projects/calm-down-app
git checkout codex/phase2-sensory-observation-docs
git checkout -b codex/soundscape-2.0
which ffmpeg || brew install ffmpeg
```

Tests need a local server in another terminal (leave running):

```bash
python3 -m http.server 8080 --directory src
```

Run any test file as: `node tests/<file>.mjs` — output is `[PASS]`/`[FAIL]` lines + a summary. A task is done only when its new checks pass AND previously passing checks still pass.

**Key existing code locations (verified 2026-07-03):**

| What | Where |
|---|---|
| `summarizeSignals` sound aggregation | `src/app.js:278-283`, top-sound at `:295`, return at `:299` |
| `getSignalContext` | `src/app.js:176-193` |
| `enterProfile` (canvas entry hooks) | `src/app.js:629-656` (`loadSoundPrefs()` at `:654`) |
| `backToProfiles` / `stopSoundOnExit` | `src/app.js:658-674` / `:2304-2314` |
| `SOUNDS` registry / `audio` object | `src/app.js:1816` / `:1823` |
| `ensureAudioContext` | `src/app.js:1840-1850` |
| Generators + `generators` map | `createRain :1868`, `createDrone :1921`, `createOcean :1996`, `createWhiteNoise :2059`, map `:2087` |
| `playSound` / `stopSound` / `togglePlayPause` | `:2096` / `:2140` / `:2154` |
| `renderSoundOptions` / `updateSoundUI` | `:2190` / `:2208` |
| Sound panel handlers (open, outside-close, option click, play/pause, volume) | `:2233-2263` |
| `visibilitychange` audio handler | `:2267-2274` |
| `saveSoundPrefs` / `loadSoundPrefs` | `:2278` / `:2287` |
| Dev controls card render / save | `:2630-2670` / `:2730-2745` |
| Sound panel markup | `src/index.html:64-67` |
| SW cache list | `src/sw.js` top |

Line numbers will drift as tasks land — re-grep function names if an anchor moved.

---

### Task 1: Audio asset prep pipeline

**Files:**
- Create: `scripts/prepare-audio.sh`
- Create (generated): `src/audio/music/bowls.mp3`, `src/audio/music/tides.mp3`, `src/audio/music/forest-rain.mp3`, `src/audio/sfx/chime.mp3`

Why MP3 not AAC: Playwright's Chromium ships free codecs only — AAC may not decode headless, MP3 decodes everywhere (Safari + Chromium). Mono halves decoded-PCM memory on iPad.

Forest Rain source: use `Forest Renewal Rain (1).mp3` (329 s — the longer take; less loop fatigue). The `.mp4` and the shorter `.mp3` are not app assets.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# One-time audio asset prep for Soundscape 2.0.
# Re-encodes source recordings (repo root, untracked) to mono 112kbps MP3
# and generates a placeholder SFX chime until ElevenLabs assets land.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p src/audio/music src/audio/sfx

ffmpeg -y -i "Crystal Bowls at 432Hz.mp3"    -vn -ac 1 -b:a 112k src/audio/music/bowls.mp3
ffmpeg -y -i "Endless Tidal Breath.mp3"      -vn -ac 1 -b:a 112k src/audio/music/tides.mp3
ffmpeg -y -i "Forest Renewal Rain (1).mp3"   -vn -ac 1 -b:a 112k src/audio/music/forest-rain.mp3

# Placeholder accent: soft 540 Hz (C#5 in the A=432 family) strike with long fade.
ffmpeg -y -f lavfi -i "sine=frequency=540:duration=1.5" \
  -af "afade=t=in:d=0.05,afade=t=out:st=0.5:d=1.0,volume=0.4" \
  -ac 1 -b:a 96k src/audio/sfx/chime.mp3

ls -lh src/audio/music src/audio/sfx
```

- [ ] **Step 2: Run it**

Run: `chmod +x scripts/prepare-audio.sh && ./scripts/prepare-audio.sh`
Expected: 3 music files ≈ 1.8–2.8 MB each, chime ≈ 20 KB. Total well under 10 MB.

- [ ] **Step 3: Loop-seam spot check (listening)**

Open each file locally (`afplay src/audio/music/bowls.mp3` — listen to first/last 2 s). These are continuous textures; runtime loop points trim 0.15 s off each edge (Task 4). If a track later clicks at the seam on the manual pass (Task 16), the documented fallback is a crossfaded-loop render, e.g.:

```bash
ffmpeg -y -i src/audio/music/bowls.mp3 -filter_complex \
  "[0:a]asplit[a][b];[a]atrim=start=3,asetpts=PTS-STARTPTS[main];[b]atrim=duration=3[head];[main][head]acrossfade=d=3[out]" \
  -map "[out]" -ac 1 -b:a 112k src/audio/music/bowls-seamless.mp3
mv src/audio/music/bowls-seamless.mp3 src/audio/music/bowls.mp3
```

- [ ] **Step 4: Commit**

```bash
git add scripts/prepare-audio.sh src/audio/
git commit -m "feat: add audio asset prep pipeline and encoded tracks"
```

---

### Task 2: Music row UI (render only) + soundscape test scaffold

**Files:**
- Create: `tests/soundscape-test.mjs`
- Modify: `src/index.html:64-67`, `src/app.js` (`audio` object `:1823`, new `MUSIC_TRACKS` + `renderMusicOptions`, `$btnSound` handler `:2233`), `src/styles.css` (append)

- [ ] **Step 1: Write the failing test scaffold**

Create `tests/soundscape-test.mjs`. Note the profile seed shape — verify it matches what `tests/phase9-test.mjs` seeds (`{id, name, icon, theme}`); if phase9 differs, copy its exact shape.

```js
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
await page.click('.profile-card');
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

await check('No console errors', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors[0]);
  return 'clean';
});

console.log(`\nSoundscape: ${passed}/${passed + failed} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/soundscape-test.mjs`
Expected: FAIL on "Music row renders 3 tracks" (`#music-options` doesn't exist).

- [ ] **Step 3: Implement the UI**

`src/index.html` — replace the panel opening (`:64-67`) with:

```html
    <div id="sound-panel" class="sound-panel">
      <div class="sound-section-label">Music</div>
      <div class="sound-options" id="music-options">
        <!-- JS renders music track buttons -->
      </div>
      <div class="sound-section-label">Sounds</div>
      <div class="sound-options" id="sound-options">
        <!-- JS renders sound option buttons -->
      </div>
```

`src/app.js` — extend the `audio` object (`:1823`) with the new fields (inert until later tasks):

```js
var audio = {
  ctx: null,
  masterGain: null,
  musicBus: null,      // Soundscape 2.0 buses
  ambientBus: null,
  sfxBus: null,
  entrainGain: null,
  currentId: null,     // ambient layer (legacy field names kept for compat)
  currentNodes: null,
  playing: false,
  musicId: null,       // music layer
  musicNodes: null,
  musicPlaying: false,
  musicBuffer: null,   // single decoded track held at a time
  musicBufferId: null,
  resume: null,        // remembered layers for play/pause
  volume: 0.5,
};
```

Add below the `SOUNDS` registry (`:1816`):

```js
var MUSIC_TRACKS = [
  { id: 'bowls',      name: 'Bowls',       file: 'audio/music/bowls.mp3' },
  { id: 'tides',      name: 'Tides',       file: 'audio/music/tides.mp3' },
  { id: 'forestrain', name: 'Forest Rain', file: 'audio/music/forest-rain.mp3' },
];
var LOOP_EDGE_S = 0.15; // runtime loop points trim encoder padding
```

Add DOM ref next to `$soundOptions` (`:1834`):

```js
var $musicOptions = document.getElementById('music-options');
```

Add `renderMusicOptions` next to `renderSoundOptions` (`:2190`):

```js
function renderMusicOptions() {
  $musicOptions.textContent = '';
  MUSIC_TRACKS.forEach(function(t) {
    var btn = document.createElement('button');
    btn.className = 'sound-option' + (audio.musicId === t.id && audio.musicPlaying ? ' selected' : '');
    btn.dataset.music = t.id;
    var dot = document.createElement('span');
    dot.className = 'sound-dot';
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(t.name));
    $musicOptions.appendChild(btn);
  });
}
```

In the `$btnSound` click handler (`:2233-2240`), render both rows:

```js
  if (soundPanelOpen) renderSoundOptions();
  if (soundPanelOpen) renderMusicOptions();
```

`src/styles.css` — append near the existing `.sound-panel` styles:

```css
.sound-section-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.55;
  margin: 2px 4px 6px;
}
.sound-options + .sound-section-label {
  margin-top: 10px;
}
.sound-option.unavailable {
  opacity: 0.35;
  pointer-events: none;
}
```

- [ ] **Step 4: Run tests**

Run: `node tests/soundscape-test.mjs` → all 4 checks PASS.
Run: `node tests/phase3-test.mjs` → still 28/28 (regression).

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/app.js src/styles.css tests/soundscape-test.mjs
git commit -m "feat: add music row to sound panel (render only)"
```

---

### Task 3: Bus architecture

**Files:**
- Modify: `src/app.js` (`ensureAudioContext :1840`, `playSound :2096`)

- [ ] **Step 1: Create buses in `ensureAudioContext`**

Replace the body (`:1840-1850`):

```js
function ensureAudioContext() {
  if (audio.ctx) return;
  try {
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.masterGain = audio.ctx.createGain();
    audio.masterGain.gain.value = audio.volume;
    audio.masterGain.connect(audio.ctx.destination);

    // Soundscape 2.0 layer buses
    audio.musicBus = audio.ctx.createGain();
    audio.musicBus.connect(audio.masterGain);
    audio.sfxBus = audio.ctx.createGain();
    audio.sfxBus.gain.value = 0.5;
    audio.sfxBus.connect(audio.masterGain);
    // Ambient chain: ambientBus -> entrainGain -> masterGain
    audio.entrainGain = audio.ctx.createGain();
    audio.entrainGain.connect(audio.masterGain);
    audio.ambientBus = audio.ctx.createGain();
    audio.ambientBus.connect(audio.entrainGain);
  } catch (e) {
    // Web Audio not supported
  }
}
```

- [ ] **Step 2: Route generators through the ambient bus**

In `playSound` (`:2126`), change:

```js
  var nodes = gen(ctx, audio.masterGain);
```

to:

```js
  var nodes = gen(ctx, audio.ambientBus);
```

- [ ] **Step 3: Regression**

Run: `node tests/phase3-test.mjs` (28/28) and `node tests/soundscape-test.mjs` (4/4). The ambient path must behave identically through the new chain.

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "feat: route audio through music/ambient/sfx buses"
```

---

### Task 4: Music playback engine

**Files:**
- Modify: `src/app.js` (new functions near `playSound :2096`; `updateSoundUI :2208`; option-click block `:2250`; `visibilitychange :2267`; `saveSoundPrefs :2278`; `loadSoundPrefs :2287`; `stopSoundOnExit :2304`)
- Test: `tests/soundscape-test.mjs`

- [ ] **Step 1: Add failing checks** (append before the final "No console errors" check; move that check to stay last in every task):

```js
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
```

- [ ] **Step 2: Run to verify the new checks fail**

Run: `node tests/soundscape-test.mjs` — the 4 new checks FAIL (`playMusic` undefined → click does nothing).

- [ ] **Step 3: Implement**

Add after `stopSound` (`:2152`):

```js
// --- Music layer (Soundscape 2.0) ---

function getMusicTrack(trackId) {
  for (var i = 0; i < MUSIC_TRACKS.length; i++) {
    if (MUSIC_TRACKS[i].id === trackId) return MUSIC_TRACKS[i];
  }
  return null;
}

function loadMusicBuffer(track) {
  if (audio.musicBufferId === track.id && audio.musicBuffer) {
    return Promise.resolve(audio.musicBuffer);
  }
  return fetch(track.file)
    .then(function(res) {
      if (!res.ok) throw new Error('fetch failed: ' + track.file);
      return res.arrayBuffer();
    })
    .then(function(data) {
      return audio.ctx.decodeAudioData(data);
    })
    .then(function(buffer) {
      // Memory rule: exactly one decoded track held at a time.
      audio.musicBuffer = buffer;
      audio.musicBufferId = track.id;
      return buffer;
    });
}

function markTrackUnavailable(trackId) {
  var btn = $musicOptions.querySelector('[data-music="' + trackId + '"]');
  if (btn) btn.classList.add('unavailable');
  if (audio.musicId === trackId) {
    audio.musicId = null;
    audio.musicPlaying = false;
  }
  updateSoundUI();
  updateDucking();
}

function playMusic(trackId, options) {
  options = options || {};
  ensureAudioContext();
  if (!audio.ctx) return;
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  var ctx = audio.ctx;

  // Re-tap active track = toggle off
  if (trackId === audio.musicId && audio.musicPlaying) {
    stopMusic();
    return;
  }
  var track = getMusicTrack(trackId);
  if (!track) return;

  // Fade out current music
  if (audio.musicNodes) {
    var old = audio.musicNodes;
    old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    setTimeout(function() { try { old.stop(); } catch (e) {} }, 600);
    audio.musicNodes = null;
  }

  audio.musicId = trackId;
  audio.musicPlaying = true;
  if (!options.suppressSignal) {
    recordSignal('sound_select', { soundId: trackId, layer: 'music' });
  }
  updateSoundUI();
  updateDucking();
  saveSoundPrefs();

  loadMusicBuffer(track).then(function(buffer) {
    // Selection may have changed while decoding
    if (!buffer || audio.musicId !== trackId || !audio.musicPlaying) return;
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = LOOP_EDGE_S;
    src.loopEnd = Math.max(LOOP_EDGE_S, buffer.duration - LOOP_EDGE_S);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.5);
    src.connect(gain);
    gain.connect(audio.musicBus);
    src.start(0, LOOP_EDGE_S);
    audio.musicNodes = {
      gain: gain,
      stop: function() { try { src.stop(); } catch (e) {} },
    };
  }).catch(function() {
    markTrackUnavailable(trackId);
  });
}

function stopMusic() {
  var stoppedId = audio.musicId;
  if (audio.ctx && audio.musicNodes) {
    var ctx = audio.ctx;
    var old = audio.musicNodes;
    old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    setTimeout(function() { try { old.stop(); } catch (e) {} }, 600);
  }
  audio.musicNodes = null;
  audio.musicPlaying = false;
  if (stoppedId) recordSignal('sound_stop', { soundId: stoppedId, layer: 'music' });
  updateSoundUI();
  updateDucking();
  saveSoundPrefs();
}

function updateDucking() {
  // Placeholder until Task 5 — keep ambient at unity.
  if (!audio.ctx || !audio.ambientBus) return;
}
```

Replace `updateSoundUI` (`:2208-2227`):

```js
function updateSoundUI() {
  var opts = $soundOptions.querySelectorAll('.sound-option');
  opts.forEach(function(btn) {
    btn.classList.toggle('selected', btn.dataset.sound === audio.currentId && audio.playing);
  });
  var mopts = $musicOptions.querySelectorAll('.sound-option');
  mopts.forEach(function(btn) {
    btn.classList.toggle('selected', btn.dataset.music === audio.musicId && audio.musicPlaying);
  });

  var anyPlaying = audio.playing || audio.musicPlaying;
  if (anyPlaying) {
    $iconPlay.style.display = 'none';
    $iconPause.style.display = '';
    $btnPlayPause.classList.add('playing');
    $btnSound.classList.add('active');
  } else {
    $iconPlay.style.display = '';
    $iconPause.style.display = 'none';
    $btnPlayPause.classList.remove('playing');
    $btnSound.classList.remove('active');
  }
}
```

Add click delegation after the sound-option click block (`:2250-2255`):

```js
// Music option click
$musicOptions.addEventListener('click', function(e) {
  var btn = e.target.closest('.sound-option');
  if (!btn) return;
  playMusic(btn.dataset.music);
});
```

Update `visibilitychange` resume condition (`:2272`):

```js
    if ((audio.playing || audio.musicPlaying) && audio.ctx.state === 'suspended') audio.ctx.resume();
```

Replace `saveSoundPrefs` body (`:2278-2285`):

```js
function saveSoundPrefs() {
  if (!state.activeProfileId) return;
  saveProfilePrefs(state.activeProfileId, {
    soundId: audio.currentId,
    soundPlaying: audio.playing,
    musicId: audio.musicId,
    musicPlaying: audio.musicPlaying,
    volume: audio.volume,
  });
}
```

In `loadSoundPrefs` (`:2287-2302`), add music restore before `updateSoundUI()`:

```js
  if (prefs.musicId && prefs.musicPlaying) {
    playMusic(prefs.musicId, { suppressSignal: true });
  } else {
    audio.musicId = prefs.musicId || null;
  }
```

(Legacy prefs simply lack `musicId` — no migration needed; ambient keys keep their names. This intentionally simplifies the spec's "soundId → ambientId migration" to a no-op with identical outcome.)

In `stopSoundOnExit` (`:2304-2314`), add before `audio.playing = false;`:

```js
  if (audio.musicNodes) {
    try { audio.musicNodes.stop(); } catch (e) {}
    audio.musicNodes = null;
  }
  audio.musicPlaying = false;
  audio.musicId = null;
  audio.musicBuffer = null;     // release decoded PCM
  audio.musicBufferId = null;
```

- [ ] **Step 4: Run tests**

Run: `node tests/soundscape-test.mjs` → 8/8.
Run: `node tests/phase3-test.mjs` → 28/28.

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/soundscape-test.mjs
git commit -m "feat: music layer playback with seamless buffer loops"
```

---

### Task 5: Auto-duck ambient under music

**Files:**
- Modify: `src/app.js` (`updateDucking` from Task 4; `playSound :2096`; `stopSound :2140`)
- Test: `tests/soundscape-test.mjs`

- [ ] **Step 1: Add failing checks**

```js
await check('Ambient ducks under music', async () => {
  // state from previous checks: tides playing, rain playing
  await page.waitForFunction(() => Math.abs(audio.ambientBus.gain.value - 0.7) < 0.1, null, { timeout: 6000 });
  return `ambientBus ~0.7`;
});

await check('Duck releases when music stops', async () => {
  await page.click('#music-options .sound-option[data-music="tides"]');
  await page.waitForFunction(() => audio.musicPlaying === false, null, { timeout: 5000 });
  await page.waitForFunction(() => Math.abs(audio.ambientBus.gain.value - 1.0) < 0.1, null, { timeout: 6000 });
  return 'ambientBus back to 1.0';
});
```

- [ ] **Step 2: Run to verify they fail** — `node tests/soundscape-test.mjs`: duck check FAILS (gain stays 1).

- [ ] **Step 3: Implement**

Replace the Task-4 placeholder `updateDucking`:

```js
function updateDucking() {
  // When both layers play, ambient becomes the bed under the music.
  if (!audio.ctx || !audio.ambientBus) return;
  var target = (audio.musicPlaying && audio.playing) ? 0.7 : 1.0;
  audio.ambientBus.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.7); // ~2s settle
}
```

Add `updateDucking();` in `playSound` right after `updateSoundUI();` (`:2136`) and in `stopSound` after its `updateSoundUI();` (`:2150`).

- [ ] **Step 4: Run tests** — soundscape 10/10, phase3 28/28.

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/soundscape-test.mjs
git commit -m "feat: auto-duck ambient bus under music"
```

---

### Task 6: Play/pause across layers

**Files:**
- Modify: `src/app.js` (`togglePlayPause :2154`)
- Test: `tests/soundscape-test.mjs`

- [ ] **Step 1: Add failing checks**

```js
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
```

- [ ] **Step 2: Run to verify they fail** — pause leaves music playing.

- [ ] **Step 3: Implement** — replace `togglePlayPause` (`:2154-2164`):

```js
function togglePlayPause() {
  ensureAudioContext();
  var anyPlaying = audio.playing || audio.musicPlaying;
  if (anyPlaying) {
    audio.resume = {
      soundId: audio.playing ? audio.currentId : null,
      musicId: audio.musicPlaying ? audio.musicId : null,
    };
    if (audio.musicPlaying) stopMusic();
    if (audio.playing) stopSound();
  } else {
    var r = audio.resume || {};
    if (r.musicId) playMusic(r.musicId);
    if (r.soundId) {
      playSound(r.soundId);
    } else if (!r.musicId) {
      // Nothing remembered: default to rain (existing behavior)
      playSound(audio.currentId || 'rain');
    }
  }
}
```

- [ ] **Step 4: Run tests** — soundscape 12/12, phase3 28/28 (its play/pause checks still exercise the ambient-only path).

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/soundscape-test.mjs
git commit -m "feat: play/pause controls both audio layers"
```

---

### Task 7: Layer-aware signals + summaries

**Files:**
- Modify: `src/app.js` (`playSound` signal calls `:2117,2134`; `stopSound :2149`; `getSignalContext :176`; `summarizeSignals :278-312`; dev summary stat render — grep `'Sound Use'`)
- Test: `tests/soundscape-test.mjs`

- [ ] **Step 1: Add failing checks**

```js
await check('Signals carry layer field', async () => {
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-sc1-signals')));
  const music = events.filter(e => e.type === 'sound_select' && e.payload.layer === 'music');
  const ambient = events.filter(e => e.type === 'sound_select' && e.payload.layer === 'ambient');
  if (!music.length || !ambient.length) throw new Error(`music:${music.length} ambient:${ambient.length}`);
  return `${music.length} music, ${ambient.length} ambient selects`;
});

await check('Signal context includes music state', async () => {
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('calm-station-sc1-signals')));
  const last = events[events.length - 1];
  if (!('musicId' in last.context)) throw new Error('context missing musicId');
  return 'context has musicId/musicPlaying';
});
```

- [ ] **Step 2: Run to verify** — ambient selects carry no `layer` → first check FAILS.

- [ ] **Step 3: Implement**

`playSound`: change both signal calls to include the layer —
`:2117` → `recordSignal('sound_stop', { soundId: soundId, layer: 'ambient' });`
`:2134` → `recordSignal('sound_select', { soundId: soundId, layer: 'ambient' });`
`stopSound` `:2149` → `recordSignal('sound_stop', { soundId: stoppedSoundId, layer: 'ambient' });`

`getSignalContext` return (`:187-192`) — add music fields:

```js
  return {
    theme: profile ? profile.theme : null,
    mode: mode,
    soundId: currentAudio ? currentAudio.currentId || null : null,
    soundPlaying: currentAudio ? currentAudio.playing === true : false,
    musicId: currentAudio ? currentAudio.musicId || null : null,
    musicPlaying: currentAudio ? currentAudio.musicPlaying === true : false,
  };
```

`summarizeSignals` — add `var musicCounts = {};` beside the existing `soundCounts` declaration, then replace the two branches (`:278-284`):

```js
    if (event.type === 'sound_select') {
      var soundId = payload.soundId || 'unknown';
      if (payload.layer === 'music') {
        musicCounts[soundId] = (musicCounts[soundId] || 0) + 1;
      } else {
        soundCounts[soundId] = (soundCounts[soundId] || 0) + 1;
      }
    }
    if (event.type === 'sound_stop') {
      if (payload.layer === 'music') {
        musicCounts.off = (musicCounts.off || 0) + 1;
      } else {
        soundCounts.off = (soundCounts.off || 0) + 1;
      }
    }
```

After `topSound` (`:295-297`) add:

```js
  var topMusic = Object.keys(musicCounts).sort(function(a, b) {
    return musicCounts[b] - musicCounts[a];
  })[0] || null;
```

Add to the return object (`:299`): `topMusic: topMusic,` and `musicCounts: musicCounts,`.

Dev dashboard: `grep -n "Sound Use" src/app.js`, duplicate that stat element beside it with value `summary.topMusic || '—'` and label `Top Music` (mirror the exact markup pattern used for the Sound Use stat).

- [ ] **Step 4: Run tests** — soundscape 14/14, `node tests/phase9-test.mjs` 17/17 (summary shape must stay compatible).

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/soundscape-test.mjs
git commit -m "feat: layer-aware sound signals and dev summary"
```

---

### Task 8: Rain treatment

**Files:**
- Modify: `src/app.js` (`createRain :1868-1917`)

No new automated check — texture quality is a listening call; the guard is phase3/4 regression + no console errors.

- [ ] **Step 1: Replace `createRain`**

```js
function createRain(ctx, dest) {
  var buf = getNoiseBuffer();

  var mix = ctx.createGain();
  mix.gain.value = 1;
  // Cap the hiss edge for the whole texture
  var cap = ctx.createBiquadFilter();
  cap.type = 'lowpass';
  cap.frequency.value = 6000;
  mix.connect(cap);
  cap.connect(dest);

  // Mid body ~1.5 kHz
  var body = ctx.createBufferSource();
  body.buffer = buf;
  body.loop = true;
  var bodyBp = ctx.createBiquadFilter();
  bodyBp.type = 'bandpass';
  bodyBp.frequency.value = 1500;
  bodyBp.Q.value = 0.6;
  var bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.18;
  body.connect(bodyBp);
  bodyBp.connect(bodyGain);
  bodyGain.connect(mix);

  // High patter ~4.5 kHz, gentle
  var patter = ctx.createBufferSource();
  patter.buffer = buf;
  patter.loop = true;
  var patterBp = ctx.createBiquadFilter();
  patterBp.type = 'bandpass';
  patterBp.frequency.value = 4500;
  patterBp.Q.value = 0.8;
  var patterGain = ctx.createGain();
  patterGain.gain.value = 0.06;
  patter.connect(patterBp);
  patterBp.connect(patterGain);
  patterGain.connect(mix);

  // Low rumble at 81 Hz (E in the A=432 family)
  var rumble = ctx.createOscillator();
  rumble.type = 'sine';
  rumble.frequency.value = 81;
  var rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.04;
  rumble.connect(rumbleGain);
  rumbleGain.connect(mix);

  // Incommensurate LFOs so the texture never audibly cycles
  var lfo1 = ctx.createOscillator();
  lfo1.type = 'sine';
  lfo1.frequency.value = 0.07;
  var lfo1Gain = ctx.createGain();
  lfo1Gain.gain.value = 0.05;
  lfo1.connect(lfo1Gain);
  lfo1Gain.connect(bodyGain.gain);

  var lfo2 = ctx.createOscillator();
  lfo2.type = 'sine';
  lfo2.frequency.value = 0.13;
  var lfo2Gain = ctx.createGain();
  lfo2Gain.gain.value = 0.03;
  lfo2.connect(lfo2Gain);
  lfo2Gain.connect(patterGain.gain);

  // Sparse droplet grains — 432-family pentatonic, barely audible
  var DROPLET_FREQS = [216, 243, 272, 324, 363];
  var dropletTimer = null;
  function scheduleDroplet() {
    dropletTimer = setTimeout(function() {
      try {
        var t = ctx.currentTime;
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = DROPLET_FREQS[Math.floor(Math.random() * DROPLET_FREQS.length)];
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.02, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        osc.connect(g);
        g.connect(mix);
        osc.start(t);
        osc.stop(t + 0.5);
      } catch (e) {}
      scheduleDroplet();
    }, 2000 + Math.random() * 4000);
  }

  body.start();
  patter.start();
  rumble.start();
  lfo1.start();
  lfo2.start();
  scheduleDroplet();

  return {
    gain: mix,
    stop: function() {
      clearTimeout(dropletTimer);
      try { body.stop(); } catch (e) {}
      try { patter.stop(); } catch (e) {}
      try { rumble.stop(); } catch (e) {}
      try { lfo1.stop(); } catch (e) {}
      try { lfo2.stop(); } catch (e) {}
    },
  };
}
```

- [ ] **Step 2: Verify**

Run: `node --check src/app.js` then `node tests/phase3-test.mjs` (28/28), `node tests/phase4-test.mjs` (21/21), `node tests/soundscape-test.mjs` (14/14).
Listen: open `http://localhost:8080`, play Rain 60 s — softer, droplets sparse, no repetition.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: two-band rain with 432-pentatonic droplet grains"
```

---

### Task 9: Drone treatment

**Files:**
- Modify: `src/app.js` (`createDrone :1921-1992`; add `detunedPair` helper above it)

- [ ] **Step 1: Add helper + replace `createDrone`**

```js
function detunedPair(ctx, freq, gainValue, dest) {
  // Two oscillators ±3 cents apart: slow phase drift = natural warmth.
  var g = ctx.createGain();
  g.gain.value = gainValue;
  g.connect(dest);
  var half = ctx.createGain();
  half.gain.value = 0.5;
  half.connect(g);
  var oa = ctx.createOscillator();
  oa.type = 'sine';
  oa.frequency.value = freq;
  oa.detune.value = -3;
  var ob = ctx.createOscillator();
  ob.type = 'sine';
  ob.frequency.value = freq;
  ob.detune.value = 3;
  oa.connect(half);
  ob.connect(half);
  oa.start();
  ob.start();
  return {
    stop: function() {
      try { oa.stop(); } catch (e) {}
      try { ob.stop(); } catch (e) {}
    },
  };
}

function createDrone(ctx, dest) {
  var mixGain = ctx.createGain();
  mixGain.gain.value = 1;
  mixGain.connect(dest);

  // Warm timbre: slowly sweeping lowpass over the oscillator stack
  var sweep = ctx.createBiquadFilter();
  sweep.type = 'lowpass';
  sweep.frequency.value = 400;
  sweep.connect(mixGain);

  // 432-family stack (C in A=432 temperament), each a detuned pair
  var base = detunedPair(ctx, 64.22, 0.15, sweep);     // C2
  var octave = detunedPair(ctx, 128.43, 0.045, sweep); // C3
  var sub = detunedPair(ctx, 32.11, 0.03, sweep);      // C1

  // Filter sweep LFO (~0.03 Hz): breathing timbre
  var sweepLfo = ctx.createOscillator();
  sweepLfo.type = 'sine';
  sweepLfo.frequency.value = 0.03;
  var sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 250;
  sweepLfo.connect(sweepDepth);
  sweepDepth.connect(sweep.frequency);
  sweepLfo.start();

  // Amplitude swell at calm-breath pace (~0.1 Hz = 6 breaths/min)
  var breath = ctx.createOscillator();
  breath.type = 'sine';
  breath.frequency.value = 0.1;
  var breathDepth = ctx.createGain();
  breathDepth.gain.value = 0.04;
  breath.connect(breathDepth);
  breathDepth.connect(mixGain.gain);
  breath.start();

  // Intrinsic gentle theta tremor (~6 Hz, very low depth)
  var tremor = ctx.createOscillator();
  tremor.type = 'sine';
  tremor.frequency.value = 6;
  var tremorDepth = ctx.createGain();
  tremorDepth.gain.value = 0.02;
  tremor.connect(tremorDepth);
  tremorDepth.connect(mixGain.gain);
  tremor.start();

  // Soft noise texture layer
  var noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = getNoiseBuffer();
  noiseSrc.loop = true;
  var noiseLp = ctx.createBiquadFilter();
  noiseLp.type = 'lowpass';
  noiseLp.frequency.value = 200;
  var noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.015;
  noiseSrc.connect(noiseLp);
  noiseLp.connect(noiseGain);
  noiseGain.connect(mixGain);
  noiseSrc.start();

  return {
    gain: mixGain,
    stop: function() {
      base.stop();
      octave.stop();
      sub.stop();
      try { sweepLfo.stop(); } catch (e) {}
      try { breath.stop(); } catch (e) {}
      try { tremor.stop(); } catch (e) {}
      try { noiseSrc.stop(); } catch (e) {}
    },
  };
}
```

- [ ] **Step 2: Verify** — `node --check src/app.js`; phase3 28/28; soundscape 14/14. Listen: drone warmer, slowly breathing, not ominous.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: warm detuned drone at 432 with breath-pace swell"
```

---

### Task 10: Ocean wave engine

**Files:**
- Modify: `src/app.js` (`createOcean :1996-2055`)

- [ ] **Step 1: Replace `createOcean`**

```js
function createOcean(ctx, dest) {
  var buf = getNoiseBuffer();

  var mix = ctx.createGain();
  mix.gain.value = 1;
  var pan = null;
  if (ctx.createStereoPanner) {
    pan = ctx.createStereoPanner();
    mix.connect(pan);
    pan.connect(dest);
  } else {
    mix.connect(dest);
  }

  // Wave body
  var noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  var bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1000;
  bp.Q.value = 0.3;
  var waveGain = ctx.createGain();
  waveGain.gain.value = 0.05;
  noise.connect(bp);
  bp.connect(waveGain);
  waveGain.connect(mix);

  // Foam wash: high-passed, synced to each crest
  var foam = ctx.createBufferSource();
  foam.buffer = buf;
  foam.loop = true;
  var hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2000;
  var foamGain = ctx.createGain();
  foamGain.gain.value = 0.0001;
  foam.connect(hp);
  hp.connect(foamGain);
  foamGain.connect(mix);

  // Deep water
  var deep = ctx.createBufferSource();
  deep.buffer = buf;
  deep.loop = true;
  var deepLp = ctx.createBiquadFilter();
  deepLp.type = 'lowpass';
  deepLp.frequency.value = 300;
  var deepGain = ctx.createGain();
  deepGain.gain.value = 0.08;
  deep.connect(deepLp);
  deepLp.connect(deepGain);
  deepGain.connect(mix);

  // Slow stereo drift
  var panLfo = null;
  if (pan) {
    panLfo = ctx.createOscillator();
    panLfo.type = 'sine';
    panLfo.frequency.value = 0.017;
    var panDepth = ctx.createGain();
    panDepth.gain.value = 0.4;
    panLfo.connect(panDepth);
    panDepth.connect(pan.pan);
    panLfo.start();
  }

  // Wave engine: every wave gets its own randomized envelope — no audible loop.
  var waveTimer = null;
  function scheduleWave() {
    var period = 8 + Math.random() * 8;               // 8–16 s
    var peak = 0.12 + Math.random() * 0.13;           // varying height
    var rise = period * (0.35 + Math.random() * 0.15);
    var t = ctx.currentTime;
    waveGain.gain.cancelScheduledValues(t);
    waveGain.gain.setValueAtTime(Math.max(0.02, waveGain.gain.value), t);
    waveGain.gain.linearRampToValueAtTime(peak, t + rise);
    waveGain.gain.linearRampToValueAtTime(0.04, t + period);
    foamGain.gain.cancelScheduledValues(t);
    foamGain.gain.setValueAtTime(0.0001, t);
    foamGain.gain.setValueAtTime(0.0001, t + rise * 0.9);
    foamGain.gain.linearRampToValueAtTime(peak * 0.35, t + rise);
    foamGain.gain.exponentialRampToValueAtTime(0.0001, t + rise + 2.5);
    waveTimer = setTimeout(scheduleWave, period * 1000);
  }

  noise.start();
  foam.start();
  deep.start();
  scheduleWave();

  return {
    gain: mix,
    stop: function() {
      clearTimeout(waveTimer);
      try { noise.stop(); } catch (e) {}
      try { foam.stop(); } catch (e) {}
      try { deep.stop(); } catch (e) {}
      if (panLfo) { try { panLfo.stop(); } catch (e) {} }
    },
  };
}
```

- [ ] **Step 2: Verify** — `node --check src/app.js`; phase4 21/21 (it plays Ocean); soundscape 14/14. Listen 60 s: waves irregular, foam on crests, gentle drift.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: randomized ocean wave engine with foam and drift"
```

---

### Task 11: White noise → pink re-voice

**Files:**
- Modify: `src/app.js` (add `getPinkNoiseBuffer` near `getNoiseBuffer :1855`; replace `createWhiteNoise :2059-2085`)

Keep the id `whitenoise` and display name "White Noise" — phase4 asserts the name.

- [ ] **Step 1: Add pink buffer + replace generator**

```js
var _pinkBuffer = null;
function getPinkNoiseBuffer() {
  // Paul Kellet pink-noise approximation, precomputed into a loop buffer.
  if (_pinkBuffer) return _pinkBuffer;
  var ctx = audio.ctx;
  var len = ctx.sampleRate * 4;
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var data = buf.getChannelData(0);
  var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (var i = 0; i < len; i++) {
    var white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  _pinkBuffer = buf;
  return buf;
}

function createWhiteNoise(ctx, dest) {
  var noise = ctx.createBufferSource();
  noise.buffer = getPinkNoiseBuffer();
  noise.loop = true;

  // Soften remaining top end further
  var shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 3000;
  shelf.gain.value = -6;

  var gain = ctx.createGain();
  gain.gain.value = 0.22;

  // Barely perceptible undulation so it doesn't feel frozen
  var lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.05;
  var lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);

  noise.connect(shelf);
  shelf.connect(gain);
  gain.connect(dest);
  noise.start();
  lfo.start();

  return {
    gain: gain,
    stop: function() {
      try { noise.stop(); } catch (e) {}
      try { lfo.stop(); } catch (e) {}
    },
  };
}
```

- [ ] **Step 2: Verify** — `node --check src/app.js`; phase4 21/21; soundscape 14/14. Listen: soft static, no sharp edge.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: re-voice white noise as soft pink texture"
```

---

### Task 12: Entrainment modulator (dev-gated)

**Files:**
- Modify: `src/app.js` (new code near the music layer; `enterProfile :654`; dev card render `:2656-2670`; dev save handler `:2730-2745`)
- Test: `tests/soundscape-test.mjs`

- [ ] **Step 1: Add failing checks**

```js
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
```

- [ ] **Step 2: Run to verify they fail** — `entrainment` undefined.

- [ ] **Step 3: Implement**

Add after `updateDucking` (Task 5):

```js
// --- Entrainment modulator (dev-gated experiment) ---
// Monaural amplitude modulation on the ambient bus. Evidence for these
// rates is mixed/emerging — they are observable experiment variables,
// never kid-visible controls, never defaults.

var ENTRAINMENT_RATES = { theta: 6, alpha: 10, gamma40: 40 };
var entrainment = { osc: null, depthGain: null, rate: null };

function applyEntrainment(rateKey) {
  var normalized = ENTRAINMENT_RATES[rateKey] ? rateKey : null;
  if (!audio.ctx || !audio.entrainGain) {
    entrainment.rate = normalized;
    return;
  }
  if (normalized === entrainment.rate && entrainment.osc) return;
  if (entrainment.osc) {
    try { entrainment.osc.stop(); } catch (e) {}
    entrainment.osc = null;
    entrainment.depthGain = null;
  }
  var t = audio.ctx.currentTime;
  if (!normalized) {
    audio.entrainGain.gain.setTargetAtTime(1, t, 0.2);
    entrainment.rate = null;
    return;
  }
  var depth = 0.15;
  audio.entrainGain.gain.setTargetAtTime(1 - depth, t, 0.2);
  var osc = audio.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = ENTRAINMENT_RATES[normalized];
  var dg = audio.ctx.createGain();
  dg.gain.value = depth;
  osc.connect(dg);
  dg.connect(audio.entrainGain.gain);
  osc.start();
  entrainment.osc = osc;
  entrainment.depthGain = dg;
  entrainment.rate = normalized;
}
```

In `enterProfile`, after `loadSoundPrefs();` (`:654`):

```js
  applyEntrainment(getProfileDevControl(profile.id).entrainmentRate);
```

Also apply pending rate once a context exists — in `ensureAudioContext`, at the end of the `try` block:

```js
    if (entrainment.rate) {
      var pending = entrainment.rate;
      entrainment.rate = null;
      applyEntrainment(pending);
    }
```

Dev card render — inside the card template after the `experimentLabel` input (`:2668`), add:

```js
        '<label class="dev-control-field">Entrainment (experiment)' +
        '<select data-dev-control="entrainmentRate">' + entrainOptions + '</select>' +
        '</label>' +
```

and build `entrainOptions` above the template beside `experimentLabel` (`:2643`):

```js
    var entrainRates = ['', 'theta', 'alpha', 'gamma40'];
    var entrainOptions = entrainRates.map(function(rate) {
      var selected = (control.entrainmentRate || '') === rate ? ' selected' : '';
      var label = rate === '' ? 'Off'
        : rate === 'theta' ? 'Theta ~6 Hz'
        : rate === 'alpha' ? 'Alpha ~10 Hz'
        : 'Gamma 40 Hz';
      return '<option value="' + rate + '"' + selected + '>' + label + '</option>';
    }).join('');
```

Dev save handler — beside `experimentLabel` handling (`:2736-2745`):

```js
    var entrainmentRate = card.querySelector('[data-dev-control="entrainmentRate"]').value;
    if (ENTRAINMENT_RATES[entrainmentRate]) profileControl.entrainmentRate = entrainmentRate;
```

- [ ] **Step 4: Run tests** — soundscape 17/17; phase9 17/17 (dev screen untouched checks).

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/soundscape-test.mjs
git commit -m "feat: dev-gated entrainment modulator on ambient bus"
```

---

### Task 13: SFX accent layer (dev-gated)

**Files:**
- Modify: `src/app.js` (SFX code after entrainment; `enterProfile :654`; `backToProfiles`/`stopSoundOnExit`; canvas pointerdown handler — grep `pointerdown` in canvas init; dev card render/save as Task 12)
- Test: `tests/soundscape-test.mjs`

- [ ] **Step 1: Add failing checks**

```js
await check('SFX scheduler off by default', async () => {
  const active = await page.evaluate(() => sfx.active);
  if (active) throw new Error('sfx active without dev control');
  return 'inactive';
});

await check('SFX accent plays + records when enabled', async () => {
  await page.evaluate(() => {
    var controls = getDevControls();
    controls['sc1'] = Object.assign({}, controls['sc1'], { sfxEnabled: true });
    saveDevControls(controls);
    startSfxScheduler('sc1');
    playSfxAccent();
  });
  await page.waitForFunction(() => {
    const events = JSON.parse(localStorage.getItem('calm-station-sc1-signals'));
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
```

(The `?dev=true` navigation must be the LAST check before the console-error check — it leaves the canvas page.)

- [ ] **Step 2: Run to verify they fail** — `sfx` undefined.

- [ ] **Step 3: Implement**

Add after the entrainment block:

```js
// --- SFX accent layer (dev-gated experiment) ---
// Sparse, soft, never surprising. Default OFF for every profile;
// enabled per profile via ?dev=true controls only.

var SFX_SOUNDS = [
  { id: 'chime', file: 'audio/sfx/chime.mp3' },
  // Extend as ElevenLabs assets land (water drop, soft bird, bowl swell).
];
var sfx = { timer: null, buffers: {}, active: false };

function loadSfxBuffer(item) {
  if (sfx.buffers[item.id]) return Promise.resolve(sfx.buffers[item.id]);
  return fetch(item.file)
    .then(function(res) {
      if (!res.ok) throw new Error('sfx fetch failed');
      return res.arrayBuffer();
    })
    .then(function(data) { return audio.ctx.decodeAudioData(data); })
    .then(function(buffer) {
      sfx.buffers[item.id] = buffer;
      return buffer;
    });
}

function playSfxAccent() {
  if (!sfx.active || !audio.ctx || !audio.sfxBus) return;
  var pick = SFX_SOUNDS[Math.floor(Math.random() * SFX_SOUNDS.length)];
  loadSfxBuffer(pick).then(function(buffer) {
    if (!sfx.active || !buffer) return;
    var src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    var g = audio.ctx.createGain();
    g.gain.value = 0.1 + Math.random() * 0.05; // conservative, slightly varied
    src.connect(g);
    g.connect(audio.sfxBus);
    src.start();
    recordSignal('sfx_played', { sfxId: pick.id });
  }).catch(function() {
    // Missing/undecodable asset: silent no-op.
  });
}

function startSfxScheduler(profileId) {
  stopSfxScheduler();
  var control = getProfileDevControl(profileId);
  if (!control.sfxEnabled) return;
  sfx.active = true;
  function scheduleNext() {
    sfx.timer = setTimeout(function() {
      playSfxAccent();
      scheduleNext();
    }, 45000 + Math.random() * 75000); // every ~45–120 s
  }
  // Never within the first 60 s of a session.
  sfx.timer = setTimeout(function() {
    playSfxAccent();
    scheduleNext();
  }, 60000 + Math.random() * 30000);
}

function stopSfxScheduler() {
  sfx.active = false;
  clearTimeout(sfx.timer);
  sfx.timer = null;
}
```

In `enterProfile` after the `applyEntrainment(...)` line:

```js
  startSfxScheduler(profile.id);
```

In `stopSoundOnExit` (start of function):

```js
  stopSfxScheduler();
```

SFX needs an AudioContext even if the kid never opens the sound panel — in the canvas `pointerdown` handler (grep `pointerdown` in the canvas init section), add at the top:

```js
  if (sfx.active && !audio.ctx) ensureAudioContext();
```

Dev card render — after the entrainment select (Task 12):

```js
        '<label class="dev-control-field dev-control-checkbox">SFX accents (experiment)' +
        '<input data-dev-control="sfxEnabled" type="checkbox"' + (control.sfxEnabled ? ' checked' : '') + '>' +
        '</label>' +
```

Dev save handler — beside the entrainment save:

```js
    var sfxEnabled = card.querySelector('[data-dev-control="sfxEnabled"]').checked;
    if (sfxEnabled) profileControl.sfxEnabled = true;
```

- [ ] **Step 4: Run tests** — soundscape 20/20; phase9 17/17.

- [ ] **Step 5: Commit**

```bash
git add src/app.js tests/soundscape-test.mjs
git commit -m "feat: dev-gated sparse SFX accent layer"
```

---

### Task 14: Service worker precache v2

**Files:**
- Modify: `src/sw.js`
- Test: `tests/soundscape-test.mjs`

- [ ] **Step 1: Add failing check**

```js
await check('SW precaches audio assets', async () => {
  const res = await page.request.get(`${BASE}/sw.js`);
  const body = await res.text();
  const wanted = ['audio/music/bowls.mp3', 'audio/music/tides.mp3', 'audio/music/forest-rain.mp3', 'audio/sfx/chime.mp3'];
  const missing = wanted.filter(w => !body.includes(w));
  if (missing.length) throw new Error('missing: ' + missing.join(','));
  if (!body.includes('calm-station-v2')) throw new Error('cache name not bumped');
  return 'v2 + 4 audio assets';
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — top of `src/sw.js`:

```js
var CACHE_NAME = 'calm-station-v2';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './audio/music/bowls.mp3',
  './audio/music/tides.mp3',
  './audio/music/forest-rain.mp3',
  './audio/sfx/chime.mp3',
];
```

(The activate handler already deletes old caches by name — v1 cleans up automatically.)

- [ ] **Step 4: Run tests** — soundscape 21/21; `node tests/phase8-test.mjs` 34/34 (SW checks).

- [ ] **Step 5: Commit**

```bash
git add src/sw.js tests/soundscape-test.mjs
git commit -m "feat: precache audio assets for full offline (sw v2)"
```

---

### Task 15: Full regression + docs

**Files:**
- Modify: `CLAUDE.md` (Audio bullet), `TODO.md` (backlog note)

- [ ] **Step 1: Full suite**

```bash
for n in 1 2 3 4 5 6 7 8 9; do
  out=$(node tests/phase${n}-test.mjs 2>&1); code=$?
  fails=$(echo "$out" | grep -oiE "[0-9]+ failed" | grep -oE "^[0-9]+" | awk '{s+=$1} END{print s+0}')
  [ $code -eq 0 ] && [ "$fails" -eq 0 ] && echo "phase${n}: PASS" || { echo "phase${n}: FAIL"; echo "$out" | tail -5; }
done
node tests/soundscape-test.mjs
```

Expected: 9 phase PASS lines + soundscape 21/21. Fix anything red before proceeding.

- [ ] **Step 2: Update docs**

`CLAUDE.md` — replace the Audio architecture line:

Old: `Web Audio API with procedural generation (no audio files). Sounds: rain, drone, ocean, white noise, pink noise. AudioContext created on first user gesture (iOS requirement). 500ms crossfade between sounds.`

New: `Web Audio API, three layer buses (music/ambient/sfx) into a master gain. Music: 3 precached MP3 tracks (src/audio/music/) as seamless AudioBuffer loops, one decoded at a time. Ambient: 4 procedural generators tuned to A=432. SFX + entrainment are per-profile dev-gated experiments (?dev=true). AudioContext created on first user gesture (iOS requirement). 500ms crossfades; ambient auto-ducks under music.`

`TODO.md` — under `## Backlog (Future)`, mark the line `- [ ] Lo-fi beats (embedded audio or procedural)` as superseded:

```markdown
- [x] ~~Lo-fi beats (embedded audio or procedural)~~ → shipped as Soundscape 2.0 music layer (see docs/superpowers/specs/2026-07-03-soundscape-2.0-design.md)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md TODO.md
git commit -m "docs: update architecture notes for Soundscape 2.0"
```

---

### Task 16: Manual pass + real SFX assets (human-gated)

Not automatable — do with the user.

- [ ] **Step 1: ElevenLabs assets.** Check Infisical `shared` for `ELEVENLABS_API_KEY` (`/infisical` skill). If present, generate via API; else user generates in the web UI. Brief (all: soft attack, no surprise, ≤3 s, quiet tail): ① distant soft chime (single strike, 432-family pitch), ② single water drop with soft reverb, ③ distant single bird call (gentle, non-alarming), ④ low singing-bowl swell. Convert each: `ffmpeg -y -i in.mp3 -ac 1 -b:a 96k src/audio/sfx/<name>.mp3`, add to `SFX_SOUNDS` and `sw.js` ASSETS, re-run soundscape test, commit.
- [ ] **Step 2: Loop-seam listening test** — each music track through a full loop boundary (seek near end). If a click: apply the Task-1 crossfade fallback to that track.
- [ ] **Step 3: iPad pass** — install PWA fresh (offline after install), play each track + texture together for 5 min, watch for memory pressure/reload, run `docs/phase2/sensory-tuning-checklist.md` ratings.
- [ ] **Step 4: First observation sessions** — use `docs/phase2/observation-note-template.md`; entrainment/SFX stay OFF until the ambient baseline is trusted (per Phase-2 review rules).

---

## Self-review notes

- **Spec coverage:** music group (T1,2,4), precache-all (T1,14), layered buses (T3), duck (T5), per-sound treatments (T8–11), 432 foundation (T8,9), entrainment dev-gated (T12), SFX dev-gated + brief (T13,16), prefs compat (T4), layer signals + dashboard (T7), kid-UX unchanged beyond Music row (T2), error handling (T4 markTrackUnavailable, T13 silent catch), testing (each task + T15), manual pass (T16). Spec's "soundId→ambientId migration" simplified to keeping legacy key names — same outcome, zero migration risk (noted in T4).
- **Known judgment calls:** Forest Rain uses the longer "(1)" take; MP3 over AAC for Chromium decode; `whitenoise` id/name kept for test compat.
- **Type consistency check:** `playMusic(trackId, options)` / `stopMusic()` / `updateDucking()` / `applyEntrainment(rateKey)` / `startSfxScheduler(profileId)` / `playSfxAccent()` — names match across tasks 4–13.
