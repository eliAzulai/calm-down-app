/* ================================================
   Calm Station — App Logic
   ================================================ */

// --- Constants ---

const THEMES = {
  ocean:  { name: 'Ocean',  accent: '#48b5a0', secondary: '#3a8fb7' },
  sunset: { name: 'Sunset', accent: '#e8845a', secondary: '#c46bb0' },
  forest: { name: 'Forest', accent: '#6abf69', secondary: '#8a9a5a' },
  neon:   { name: 'Neon',   accent: '#e040fb', secondary: '#40c4ff' },
  mono:   { name: 'Mono',   accent: '#b0bec5', secondary: '#78909c' },
};

const ICONS = [
  { id: 'flame',     name: 'Flame' },
  { id: 'wave',      name: 'Wave' },
  { id: 'mountain',  name: 'Mountain' },
  { id: 'lightning', name: 'Lightning' },
  { id: 'moon',      name: 'Moon' },
];

const MAX_PROFILES = 2;
const STORAGE_KEY = 'calm-station-profiles';

// --- SVG Icon Renderer ---

function getIconSVG(iconId, color, size) {
  size = size || 32;
  const s = size;
  const half = s / 2;
  let path = '';

  switch (iconId) {
    case 'flame':
      path = `<path d="M${half} ${s * 0.08}C${half} ${s * 0.08} ${s * 0.22} ${s * 0.38} ${s * 0.22} ${s * 0.58}C${s * 0.22} ${s * 0.72} ${s * 0.3} ${s * 0.82} ${s * 0.38} ${s * 0.88}C${s * 0.34} ${s * 0.78} ${s * 0.36} ${s * 0.68} ${s * 0.42} ${s * 0.6}C${s * 0.44} ${s * 0.72} ${s * 0.46} ${s * 0.82} ${half} ${s * 0.92}C${s * 0.54} ${s * 0.82} ${s * 0.56} ${s * 0.72} ${s * 0.58} ${s * 0.6}C${s * 0.64} ${s * 0.68} ${s * 0.66} ${s * 0.78} ${s * 0.62} ${s * 0.88}C${s * 0.7} ${s * 0.82} ${s * 0.78} ${s * 0.72} ${s * 0.78} ${s * 0.58}C${s * 0.78} ${s * 0.38} ${half} ${s * 0.08} ${half} ${s * 0.08}Z" fill="${color}"/>`;
      break;
    case 'wave':
      path = `<path d="M${s * 0.06} ${half}C${s * 0.06} ${half} ${s * 0.18} ${s * 0.3} ${s * 0.3} ${s * 0.3}C${s * 0.42} ${s * 0.3} ${s * 0.38} ${s * 0.7} ${half} ${s * 0.7}C${s * 0.62} ${s * 0.7} ${s * 0.58} ${s * 0.3} ${s * 0.7} ${s * 0.3}C${s * 0.82} ${s * 0.3} ${s * 0.94} ${half} ${s * 0.94} ${half}" stroke="${color}" stroke-width="${s * 0.06}" fill="none" stroke-linecap="round"/>
             <path d="M${s * 0.12} ${s * 0.62}C${s * 0.12} ${s * 0.62} ${s * 0.22} ${s * 0.46} ${s * 0.34} ${s * 0.46}C${s * 0.46} ${s * 0.46} ${s * 0.42} ${s * 0.78} ${s * 0.54} ${s * 0.78}C${s * 0.66} ${s * 0.78} ${s * 0.62} ${s * 0.46} ${s * 0.74} ${s * 0.46}C${s * 0.86} ${s * 0.46} ${s * 0.88} ${s * 0.62} ${s * 0.88} ${s * 0.62}" stroke="${color}" stroke-width="${s * 0.04}" fill="none" stroke-linecap="round" opacity="0.5"/>`;
      break;
    case 'mountain':
      path = `<path d="M${s * 0.08} ${s * 0.82}L${s * 0.38} ${s * 0.2}L${s * 0.52} ${s * 0.44}L${s * 0.64} ${s * 0.28}L${s * 0.92} ${s * 0.82}Z" fill="${color}" opacity="0.9"/>
             <path d="M${s * 0.08} ${s * 0.82}L${s * 0.38} ${s * 0.2}L${s * 0.52} ${s * 0.44}" fill="${color}"/>`;
      break;
    case 'lightning':
      path = `<path d="M${s * 0.56} ${s * 0.06}L${s * 0.24} ${s * 0.46}H${s * 0.44}L${s * 0.38} ${s * 0.94}L${s * 0.76} ${s * 0.44}H${s * 0.54}Z" fill="${color}"/>`;
      break;
    case 'moon':
      path = `<path d="M${s * 0.62} ${s * 0.1}C${s * 0.36} ${s * 0.14} ${s * 0.18} ${s * 0.36} ${s * 0.18} ${s * 0.56}C${s * 0.18} ${s * 0.78} ${s * 0.36} ${s * 0.92} ${s * 0.56} ${s * 0.92}C${s * 0.68} ${s * 0.92} ${s * 0.78} ${s * 0.86} ${s * 0.84} ${s * 0.76}C${s * 0.7} ${s * 0.88} ${s * 0.52} ${s * 0.88} ${s * 0.4} ${s * 0.72}C${s * 0.3} ${s * 0.58} ${s * 0.34} ${s * 0.36} ${half} ${s * 0.22}C${s * 0.56} ${s * 0.16} ${s * 0.6} ${s * 0.12} ${s * 0.62} ${s * 0.1}Z" fill="${color}"/>`;
      break;
    default:
      path = `<circle cx="${half}" cy="${half}" r="${half * 0.6}" fill="${color}"/>`;
  }

  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
}

// --- State ---

const state = {
  screen: 'profiles',
  profiles: [],
  activeProfileId: null,
  setupSlot: null, // index of slot being set up, or null
  setupForm: { name: '', icon: 'flame', theme: 'ocean' },
  canvasMode: 0, // index into MODES
};

// --- localStorage ---

function loadProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state.profiles = JSON.parse(raw);
    }
  } catch (e) {
    state.profiles = [];
  }
}

function saveProfiles() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profiles));
  } catch (e) {
    // Private browsing fallback — profiles stay in memory this session
  }
}

function getProfilePrefs(id) {
  try {
    const raw = localStorage.getItem(`calm-station-${id}-prefs`);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveProfilePrefs(id, prefs) {
  try {
    localStorage.setItem(`calm-station-${id}-prefs`, JSON.stringify(prefs));
  } catch (e) {
    // silent
  }
}

var SIGNAL_LIMIT = 500;
var SIGNAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
var DEV_CONTROLS_KEY = 'calm-station-dev-controls';

function getDevControls() {
  try {
    var raw = localStorage.getItem(DEV_CONTROLS_KEY);
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (e) {
    return {};
  }
}

function saveDevControls(controls) {
  try {
    localStorage.setItem(DEV_CONTROLS_KEY, JSON.stringify(controls || {}));
  } catch (e) {
    // silent
  }
}

function getProfileDevControl(profileId) {
  var controls = getDevControls();
  var control = controls[profileId];
  if (!control || typeof control !== 'object' || Array.isArray(control)) return {};
  return control;
}

function getSignalKey(profileId) {
  return 'calm-station-' + profileId + '-signals';
}

function readSignals(profileId) {
  try {
    var raw = localStorage.getItem(getSignalKey(profileId));
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function(event) {
      return event && typeof event === 'object' && !Array.isArray(event);
    });
  } catch (e) {
    return [];
  }
}

function writeSignals(profileId, events) {
  try {
    var cutoff = Date.now() - SIGNAL_MAX_AGE_MS;
    var capped = events.filter(function(event) {
      if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
      return !event.ts || new Date(event.ts).getTime() >= cutoff;
    }).slice(-SIGNAL_LIMIT);
    localStorage.setItem(getSignalKey(profileId), JSON.stringify(capped));
  } catch (e) {
    // silent
  }
}

function getProfileById(profileId) {
  return state.profiles.find(function(profile) {
    return profile && profile.id === profileId;
  }) || null;
}

function getSignalContext(profileId) {
  var profile = getProfileById(profileId);
  var mode = null;
  var currentAudio = typeof audio !== 'undefined' && audio ? audio : null;

  try {
    mode = MODES[state.canvasMode] || null;
  } catch (e) {
    mode = null;
  }

  return {
    theme: profile ? profile.theme : null,
    mode: mode,
    soundId: currentAudio ? currentAudio.currentId || null : null,
    soundPlaying: currentAudio ? currentAudio.playing === true : false,
    musicId: currentAudio ? currentAudio.musicId || null : null,
    musicPlaying: currentAudio ? currentAudio.musicPlaying === true : false,
  };
}

function recordSignal(type, payload) {
  if (!state.activeProfileId) return;
  recordSignalForProfile(state.activeProfileId, type, payload);
}

function recordSignalForProfile(profileId, type, payload) {
  recordSignalForProfileWithContext(profileId, type, payload, getSignalContext(profileId));
}

function recordSignalForProfileWithContext(profileId, type, payload, context) {
  if (!profileId || !type) return;
  var events = readSignals(profileId);
  events.push({
    id: generateId(),
    ts: new Date().toISOString(),
    type: type,
    context: context,
    payload: payload || {},
  });
  writeSignals(profileId, events);
}

function secondsBetween(start, end) {
  if (!start || !end) return 0;
  var startMs = new Date(start).getTime();
  var endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

function isValidDateValue(value) {
  return !!value && !Number.isNaN(new Date(value).getTime());
}

function formatDuration(seconds) {
  if (!seconds) return '0s';
  var minutes = Math.floor(seconds / 60);
  var rest = seconds % 60;
  if (minutes === 0) return rest + 's';
  return minutes + 'm ' + rest + 's';
}

function computeSignalSummary(profileId) {
  var events = readSignals(profileId);
  var modeTime = {};
  var soundCounts = {};
  var musicCounts = {};
  var promptShown = 0;
  var promptOpened = 0;
  var promptIgnored = 0;
  var exerciseCompleted = 0;
  var sessions = 0;
  var completedSessions = 0;
  var totalSessionSeconds = 0;
  var activeSessionStart = null;
  var activeMode = null;
  var activeModeStart = null;

  events.forEach(function(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;
    var payload = event.payload && typeof event.payload === 'object' ? event.payload : {};

    if (event.type === 'session_start') {
      sessions += 1;
      activeSessionStart = event.ts;
    }
    if (event.type === 'session_end' && activeSessionStart) {
      var sessionSeconds = secondsBetween(activeSessionStart, event.ts);
      if (isValidDateValue(activeSessionStart) && isValidDateValue(event.ts)) {
        totalSessionSeconds += sessionSeconds;
        completedSessions += 1;
      }
      activeSessionStart = null;
    }
    if (event.type === 'mode_start') {
      activeMode = payload.mode;
      activeModeStart = event.ts;
    }
    if (event.type === 'mode_end' && activeModeStart) {
      var mode = payload.mode || activeMode || 'unknown';
      modeTime[mode] = (modeTime[mode] || 0) + secondsBetween(activeModeStart, event.ts);
      activeMode = null;
      activeModeStart = null;
    }
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
    if (event.type === 'prompt_shown') promptShown += 1;
    if (event.type === 'prompt_opened') promptOpened += 1;
    if (event.type === 'prompt_ignored') promptIgnored += 1;
    if (event.type === 'exercise_completed') exerciseCompleted += 1;
  });

  var topMode = Object.keys(modeTime).sort(function(a, b) {
    return modeTime[b] - modeTime[a];
  })[0] || null;

  var topSound = Object.keys(soundCounts).sort(function(a, b) {
    return soundCounts[b] - soundCounts[a];
  })[0] || null;

  var topMusic = Object.keys(musicCounts).sort(function(a, b) {
    return musicCounts[b] - musicCounts[a];
  })[0] || null;

  return {
    events: events,
    sessions: sessions,
    averageSessionSeconds: completedSessions ? Math.round(totalSessionSeconds / completedSessions) : 0,
    modeTime: modeTime,
    topMode: topMode,
    topModeSeconds: topMode ? modeTime[topMode] : 0,
    topSound: topSound,
    soundCounts: soundCounts,
    topMusic: topMusic,
    musicCounts: musicCounts,
    promptShown: promptShown,
    promptOpened: promptOpened,
    promptIgnored: promptIgnored,
    exerciseCompleted: exerciseCompleted,
  };
}

// --- Generate ID ---

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// --- DOM References ---

const $profilesGrid = document.querySelector('.profiles-grid');
const $screenProfiles = document.getElementById('screen-profiles');
const $screenCanvas = document.getElementById('screen-canvas');
const $btnBack = document.getElementById('btn-back');
const $ambientCanvas = document.getElementById('ambient-canvas');

function setScreenAccessibility(screenEl, isActive) {
  if (!screenEl) return;
  if (isActive) {
    screenEl.removeAttribute('aria-hidden');
    screenEl.removeAttribute('inert');
  } else {
    screenEl.setAttribute('aria-hidden', 'true');
    screenEl.setAttribute('inert', '');
  }
}

function setActiveScreenAccessibility(activeScreenEl) {
  [$screenProfiles, $screenCanvas, $screenParent, $screenDev].forEach(function(screenEl) {
    setScreenAccessibility(screenEl, screenEl === activeScreenEl);
  });
}

// --- Render Profile Cards ---

function renderProfileCards() {
  // Clear grid
  $profilesGrid.textContent = '';

  for (let i = 0; i < MAX_PROFILES; i++) {
    const profile = state.profiles[i];

    if (state.setupSlot === i) {
      $profilesGrid.appendChild(createSetupCard(i));
    } else if (profile) {
      $profilesGrid.appendChild(createFilledProfileCard(profile, i));
    } else {
      $profilesGrid.appendChild(createEmptyProfileCard(i));
    }
  }
}

function createFilledProfileCard(profile, index) {
  const theme = THEMES[profile.theme] || THEMES.ocean;

  const card = document.createElement('div');
  card.className = 'profile-card filled';
  card.dataset.action = 'enter';
  card.dataset.index = index;
  card.style.setProperty('--accent', theme.accent);
  card.style.setProperty('--accent-glow', hexToRgba(theme.accent, 0.3));
  card.style.setProperty('--accent-dim', hexToRgba(theme.accent, 0.1));

  const iconWrap = document.createElement('div');
  iconWrap.className = 'profile-icon';
  iconWrap.innerHTML = getIconSVG(profile.icon, theme.accent, 48);

  const nameEl = document.createElement('div');
  nameEl.className = 'profile-name';
  nameEl.textContent = profile.name;

  card.appendChild(iconWrap);
  card.appendChild(nameEl);
  return card;
}

function createEmptyProfileCard(index) {
  const card = document.createElement('div');
  card.className = 'profile-card empty';
  card.dataset.action = 'setup';
  card.dataset.index = index;

  const icon = document.createElement('div');
  icon.className = 'add-icon';
  icon.textContent = '+';

  const label = document.createElement('div');
  label.className = 'add-label';
  label.textContent = 'New Profile';

  card.appendChild(icon);
  card.appendChild(label);
  return card;
}

function createSetupCard(index) {
  const card = document.createElement('div');
  card.className = 'profile-card setup';
  card.dataset.index = index;

  // Name label + input
  const nameLabel = document.createElement('div');
  nameLabel.className = 'setup-label';
  nameLabel.textContent = 'Name';
  card.appendChild(nameLabel);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'setup-name-input';
  nameInput.placeholder = 'Enter name';
  nameInput.maxLength = 20;
  nameInput.autocomplete = 'off';
  nameInput.value = state.setupForm.name;
  card.appendChild(nameInput);

  // Icon label + picker
  const iconLabel = document.createElement('div');
  iconLabel.className = 'setup-label';
  iconLabel.textContent = 'Icon';
  card.appendChild(iconLabel);

  const iconPicker = document.createElement('div');
  iconPicker.className = 'icon-picker';

  const currentTheme = THEMES[state.setupForm.theme] || THEMES.ocean;

  ICONS.forEach(function(ic) {
    const opt = document.createElement('div');
    opt.className = 'icon-option' + (state.setupForm.icon === ic.id ? ' selected' : '');
    opt.dataset.action = 'pick-icon';
    opt.dataset.icon = ic.id;
    opt.innerHTML = getIconSVG(ic.id, state.setupForm.icon === ic.id ? currentTheme.accent : '#5a7a8a', 24);
    opt.setAttribute('role', 'button');
    opt.setAttribute('aria-label', ic.name);
    iconPicker.appendChild(opt);
  });

  card.appendChild(iconPicker);

  // Theme label + picker
  const themeLabel = document.createElement('div');
  themeLabel.className = 'setup-label';
  themeLabel.textContent = 'Theme';
  card.appendChild(themeLabel);

  const themePicker = document.createElement('div');
  themePicker.className = 'theme-picker';

  Object.keys(THEMES).forEach(function(key) {
    const t = THEMES[key];
    const opt = document.createElement('div');
    opt.className = 'theme-option' + (state.setupForm.theme === key ? ' selected' : '');
    opt.dataset.action = 'pick-theme';
    opt.dataset.theme = key;
    opt.style.background = t.accent;
    opt.setAttribute('role', 'button');
    opt.setAttribute('aria-label', t.name);
    themePicker.appendChild(opt);
  });

  card.appendChild(themePicker);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'setup-actions';

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn-done';
  doneBtn.textContent = 'Done';
  doneBtn.dataset.action = 'save';
  doneBtn.disabled = !state.setupForm.name.trim();
  actions.appendChild(doneBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.dataset.action = 'cancel';
  actions.appendChild(cancelBtn);

  card.appendChild(actions);

  // Auto-focus name input after card is in DOM
  requestAnimationFrame(function() {
    nameInput.focus();
  });

  // Name input event — update state without full re-render
  nameInput.addEventListener('input', function(e) {
    state.setupForm.name = e.target.value;
    doneBtn.disabled = !e.target.value.trim();
  });

  return card;
}

// --- Event Delegation on Profile Grid ---

$profilesGrid.addEventListener('click', function(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'setup': {
      const index = parseInt(target.dataset.index, 10);
      state.setupSlot = index;
      state.setupForm = { name: '', icon: 'flame', theme: 'ocean' };
      renderProfileCards();
      break;
    }
    case 'enter': {
      const index = parseInt(target.dataset.index, 10);
      const profile = state.profiles[index];
      if (profile) enterProfile(profile);
      break;
    }
    case 'pick-icon': {
      const iconId = target.dataset.icon;
      state.setupForm.icon = iconId;
      // Update icon picker UI in place
      updateIconPickerUI();
      break;
    }
    case 'pick-theme': {
      const themeKey = target.dataset.theme;
      state.setupForm.theme = themeKey;
      // Update theme picker + icon colors in place
      updateThemePickerUI();
      updateIconPickerUI();
      break;
    }
    case 'save': {
      saveNewProfile();
      break;
    }
    case 'cancel': {
      state.setupSlot = null;
      renderProfileCards();
      break;
    }
  }
});

// --- In-place UI Updates (no full re-render) ---

function updateIconPickerUI() {
  const icons = $profilesGrid.querySelectorAll('.icon-option');
  const currentTheme = THEMES[state.setupForm.theme] || THEMES.ocean;

  icons.forEach(function(opt) {
    const id = opt.dataset.icon;
    const isSelected = id === state.setupForm.icon;
    opt.classList.toggle('selected', isSelected);
    opt.innerHTML = getIconSVG(id, isSelected ? currentTheme.accent : '#5a7a8a', 24);
  });
}

function updateThemePickerUI() {
  const opts = $profilesGrid.querySelectorAll('.theme-option');
  opts.forEach(function(opt) {
    opt.classList.toggle('selected', opt.dataset.theme === state.setupForm.theme);
  });
}

// --- Save Profile ---

function saveNewProfile() {
  const name = state.setupForm.name.trim();
  if (!name) return;

  const profile = {
    id: generateId(),
    name: name,
    icon: state.setupForm.icon,
    theme: state.setupForm.theme,
    createdAt: new Date().toISOString(),
  };

  // Place at the setup slot index
  if (state.setupSlot !== null && state.setupSlot < MAX_PROFILES) {
    // If slot already has a profile, replace; otherwise push
    if (state.profiles[state.setupSlot]) {
      state.profiles[state.setupSlot] = profile;
    } else {
      // Ensure array is long enough
      while (state.profiles.length < state.setupSlot) {
        state.profiles.push(null);
      }
      state.profiles[state.setupSlot] = profile;
    }
  }

  // Clean nulls from end
  while (state.profiles.length > 0 && state.profiles[state.profiles.length - 1] == null) {
    state.profiles.pop();
  }

  state.setupSlot = null;
  saveProfiles();
  renderProfileCards();
}

// --- Canvas Visual Modes ---

const MODES = ['trails', 'particles', 'ripples', 'geometric', 'drawing'];
const MODE_LABELS = {
  trails: 'Finger Trails',
  particles: 'Particles',
  ripples: 'Ripples',
  geometric: 'Geometric',
  drawing: 'Freeform',
};

// --- Screen Navigation ---

function enterProfile(profile) {
  state.screen = 'canvas';
  state.activeProfileId = profile.id;
  var devControl = getProfileDevControl(profile.id);
  var defaultModeIndex = MODES.indexOf(devControl.defaultMode);
  state.canvasMode = defaultModeIndex >= 0 ? defaultModeIndex : 0;

  // Apply theme to canvas screen
  $screenCanvas.classList.remove('theme-ocean', 'theme-sunset', 'theme-forest', 'theme-neon', 'theme-mono');
  $screenCanvas.classList.add('theme-' + profile.theme);

  // Resolve theme colors for canvas rendering
  var theme = THEMES[profile.theme] || THEMES.ocean;
  canvas.accentRGB = hexToRGB(theme.accent);
  canvas.secondaryRGB = hexToRGB(theme.secondary);
  canvas.drawColor = canvas.accentRGB;

  $screenProfiles.classList.remove('active');
  $screenCanvas.classList.add('active');
  setActiveScreenAccessibility($screenCanvas);
  $ambientCanvas.classList.add('hidden');

  initCanvas();
  showModeIndicator();
  startSignalSession();
  loadSoundPrefs();
  // Must run before any sound can start: clears the previous profile's rate
  // so a residual oscillator can't leak into this profile's first sound.
  applyEntrainment(getProfileDevControl(profile.id).entrainmentRate);
  startSfxScheduler(profile.id);
  startGentlePromptTimer();
}

function backToProfiles() {
  state.screen = 'profiles';

  endSignalSession();
  stopCanvas();
  stopSoundOnExit();
  stopGentlePromptTimer();
  closeBreatheOverlay();
  closeGroundOverlay();
  closeAllEnergyOverlays();
  state.activeProfileId = null;

  $screenCanvas.classList.remove('active');
  $screenProfiles.classList.add('active');
  setActiveScreenAccessibility($screenProfiles);
  $ambientCanvas.classList.remove('hidden');
}

function closeAllEnergyOverlays() {
  document.getElementById('energy-checkin').classList.remove('active');
  document.getElementById('energy-checkout').classList.remove('active');
  closeExerciseFlow();
}

$btnBack.addEventListener('click', backToProfiles);

// --- Canvas DOM ---

var $mainCanvas = document.getElementById('main-canvas');
var $btnClear = document.getElementById('btn-clear');
var $modeIndicator = document.getElementById('mode-indicator');

// --- Interactive Canvas Engine ---

var canvas = {
  ctx: null,
  width: 0,
  height: 0,
  dpr: 1,
  animId: null,
  lastTime: 0,
  accentRGB: [72, 181, 160],
  secondaryRGB: [58, 143, 183],
  // Touch state
  touches: {},       // active touches: id -> {x, y, prevX, prevY}
  // Trails mode
  trails: [],        // array of trail segments
  // Particles mode
  particles: [],
  particlePool: [],  // reuse particles
  // Ripples mode
  ripples: [],
  // Geometric mode
  shapes: [],
  // Drawing mode
  drawPaths: [],      // completed stroke segments
  drawColor: null,    // current drawing color (set from accent)
  // Pinch zoom
  scale: 1,
  pinchStartDist: 0,
  pinchStartScale: 1,
};

var signalSession = {
  active: false,
  mode: null,
  touchCount: 0,
  touchTimer: null,
};

function initCanvas() {
  canvas.ctx = $mainCanvas.getContext('2d');
  resizeCanvas();
  canvas.trails = [];
  canvas.particles = [];
  canvas.ripples = [];
  canvas.shapes = [];
  canvas.drawPaths = [];
  canvas.drawColor = null;
  canvas.scale = 1;
  canvas.touches = {};
  canvas.lastTime = performance.now();

  window.addEventListener('resize', resizeCanvas);
  tickCanvas(performance.now());
}

function stopCanvas() {
  if (canvas.animId) {
    cancelAnimationFrame(canvas.animId);
    canvas.animId = null;
  }
  window.removeEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  canvas.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  $mainCanvas.width = canvas.width * canvas.dpr;
  $mainCanvas.height = canvas.height * canvas.dpr;
  canvas.ctx.setTransform(canvas.dpr, 0, 0, canvas.dpr, 0, 0);
}

// --- Canvas Render Loop ---

function tickCanvas(now) {
  if (state.screen !== 'canvas' || document.hidden) {
    canvas.animId = null;
    return;
  }

  var dt = Math.min((now - canvas.lastTime) / 1000, 0.05); // cap at 50ms
  canvas.lastTime = now;

  var ctx = canvas.ctx;
  var w = canvas.width;
  var h = canvas.height;
  var mode = MODES[state.canvasMode];

  // Semi-transparent clear for trail persistence
  if (mode === 'trails') {
    ctx.fillStyle = 'rgba(13, 27, 42, 0.03)';
    ctx.fillRect(0, 0, w, h);
  } else if (mode === 'drawing') {
    // Drawing mode: no fade — strokes persist fully
  } else if (mode === 'geometric') {
    ctx.fillStyle = 'rgba(13, 27, 42, 0.04)';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = 'rgba(13, 27, 42, 0.15)';
    ctx.fillRect(0, 0, w, h);
  }

  if (mode === 'trails') renderTrails(ctx, dt);
  else if (mode === 'particles') renderParticles(ctx, dt, w, h);
  else if (mode === 'ripples') renderRipples(ctx, dt, w, h);
  else if (mode === 'geometric') renderGeometric(ctx, dt, w, h);
  else if (mode === 'drawing') renderDrawing(ctx);

  canvas.animId = requestAnimationFrame(tickCanvas);
}

// --- Visibility handling for canvas ---
document.addEventListener('visibilitychange', function() {
  if (!document.hidden && state.screen === 'canvas' && !canvas.animId) {
    canvas.lastTime = performance.now();
    tickCanvas(performance.now());
  }
});

// --- TRAILS MODE ---

function addTrailPoint(x, y, prevX, prevY) {
  canvas.trails.push({
    x: x, y: y,
    prevX: prevX, prevY: prevY,
    life: 1.0,
    width: 3 + Math.random() * 4,
    color: Math.random() > 0.3 ? canvas.accentRGB : canvas.secondaryRGB,
  });
  // Limit trail count
  if (canvas.trails.length > 2000) canvas.trails.splice(0, 200);
}

function renderTrails(ctx, dt) {
  for (var i = canvas.trails.length - 1; i >= 0; i--) {
    var t = canvas.trails[i];
    t.life -= dt * 0.3;
    if (t.life <= 0) {
      canvas.trails.splice(i, 1);
      continue;
    }
    var alpha = t.life * 0.8;
    var glow = t.life * 0.4;
    var c = t.color;

    // Glow layer
    ctx.beginPath();
    ctx.moveTo(t.prevX, t.prevY);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + glow + ')';
    ctx.lineWidth = t.width * 3 * canvas.scale;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Core line
    ctx.beginPath();
    ctx.moveTo(t.prevX, t.prevY);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
    ctx.lineWidth = t.width * canvas.scale;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// --- PARTICLES MODE ---

function spawnParticles(x, y, count) {
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 40 + Math.random() * 120;
    var c = Math.random() > 0.3 ? canvas.accentRGB : canvas.secondaryRGB;
    canvas.particles.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      maxLife: 1.5 + Math.random() * 1.5,
      radius: (1.5 + Math.random() * 3) * canvas.scale,
      color: c,
    });
  }
  // Limit
  if (canvas.particles.length > 1500) canvas.particles.splice(0, 300);
}

function renderParticles(ctx, dt, w, h) {
  for (var i = canvas.particles.length - 1; i >= 0; i--) {
    var p = canvas.particles[i];
    p.life -= dt / p.maxLife;
    if (p.life <= 0) {
      canvas.particles.splice(i, 1);
      continue;
    }

    // Friction
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.vy += 8 * dt; // subtle gravity
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    var alpha = p.life * 0.7;
    var c = p.color;

    // Glow
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha * 0.2) + ')';
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
    ctx.fill();
  }

  // Continuous spawn from active touches
  var keys = Object.keys(canvas.touches);
  for (var k = 0; k < keys.length; k++) {
    var touch = canvas.touches[keys[k]];
    spawnParticles(touch.x, touch.y, 2);
  }
}

// --- RIPPLES MODE ---

function addRipple(x, y) {
  var c = Math.random() > 0.3 ? canvas.accentRGB : canvas.secondaryRGB;
  canvas.ripples.push({
    x: x, y: y,
    radius: 5 * canvas.scale,
    maxRadius: (80 + Math.random() * 120) * canvas.scale,
    life: 1.0,
    width: 2 + Math.random() * 2,
    color: c,
  });
  if (canvas.ripples.length > 100) canvas.ripples.splice(0, 20);
}

function renderRipples(ctx, dt, w, h) {
  for (var i = canvas.ripples.length - 1; i >= 0; i--) {
    var r = canvas.ripples[i];
    r.life -= dt * 0.5;
    if (r.life <= 0) {
      canvas.ripples.splice(i, 1);
      continue;
    }

    var progress = 1 - r.life;
    r.radius = 5 + progress * r.maxRadius;

    var alpha = r.life * 0.6;
    var c = r.color;

    // Outer ring
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
    ctx.lineWidth = r.width * canvas.scale;
    ctx.stroke();

    // Inner glow ring
    if (r.life > 0.5) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha * 0.3) + ')';
      ctx.lineWidth = r.width * 2 * canvas.scale;
      ctx.stroke();
    }
  }
}

// --- GEOMETRIC PATTERNS MODE ---

var SHAPE_TYPES = ['circle', 'triangle', 'hexagon', 'square', 'diamond'];

function addShape(x, y) {
  var c = Math.random() > 0.3 ? canvas.accentRGB : canvas.secondaryRGB;
  var type = SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)];
  canvas.shapes.push({
    x: x, y: y,
    size: 0,
    maxSize: (30 + Math.random() * 80) * canvas.scale,
    life: 1.0,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.5,
    sides: type,
    color: c,
    lineWidth: 1 + Math.random() * 1.5,
  });
  if (canvas.shapes.length > 200) canvas.shapes.splice(0, 40);
}

function renderGeometric(ctx, dt, w, h) {
  for (var i = canvas.shapes.length - 1; i >= 0; i--) {
    var s = canvas.shapes[i];
    s.life -= dt * 0.25;
    if (s.life <= 0) { canvas.shapes.splice(i, 1); continue; }

    var growth = 1 - s.life;
    s.size = growth * s.maxSize;
    s.rotation += s.rotSpeed * dt;

    var alpha = s.life * 0.6;
    var c = s.color;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
    ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
    ctx.lineWidth = s.lineWidth * canvas.scale;

    // Glow
    ctx.shadowColor = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha * 0.5) + ')';
    ctx.shadowBlur = 8 * canvas.scale;

    ctx.beginPath();
    if (s.sides === 'circle') {
      ctx.arc(0, 0, s.size, 0, Math.PI * 2);
    } else if (s.sides === 'triangle') {
      drawPolygon(ctx, 3, s.size);
    } else if (s.sides === 'square') {
      drawPolygon(ctx, 4, s.size);
    } else if (s.sides === 'diamond') {
      drawPolygon(ctx, 4, s.size); // rotated via rotation already
    } else if (s.sides === 'hexagon') {
      drawPolygon(ctx, 6, s.size);
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawPolygon(ctx, sides, radius) {
  for (var i = 0; i <= sides; i++) {
    var angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    var px = Math.cos(angle) * radius;
    var py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// --- FREEFORM DRAWING MODE ---

function addDrawPoint(x, y, prevX, prevY) {
  var c = canvas.drawColor || canvas.accentRGB;
  canvas.drawPaths.push({
    x: x, y: y,
    prevX: prevX, prevY: prevY,
    color: c,
    width: (2 + Math.random() * 2) * canvas.scale,
  });
  if (canvas.drawPaths.length > 5000) canvas.drawPaths.splice(0, 500);
}

function renderDrawing(ctx) {
  for (var i = 0; i < canvas.drawPaths.length; i++) {
    var p = canvas.drawPaths[i];
    var c = p.color;

    // Glow layer
    ctx.beginPath();
    ctx.moveTo(p.prevX, p.prevY);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.2)';
    ctx.lineWidth = p.width * 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Core
    ctx.beginPath();
    ctx.moveTo(p.prevX, p.prevY);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.85)';
    ctx.lineWidth = p.width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// --- Touch / Pointer Events ---

var lastTapTime = 0;
var lastTapX = 0;
var lastTapY = 0;

$mainCanvas.addEventListener('pointerdown', function(e) {
  if (sfx.active && !audio.ctx) ensureAudioContext();
  e.preventDefault();
  $mainCanvas.setPointerCapture(e.pointerId);
  var x = e.clientX;
  var y = e.clientY;

  canvas.touches[e.pointerId] = { x: x, y: y, prevX: x, prevY: y };
  queueTouchSignal();

  var mode = MODES[state.canvasMode];
  if (mode === 'particles') spawnParticles(x, y, 8);
  if (mode === 'ripples') addRipple(x, y);
  if (mode === 'geometric') addShape(x, y);

  // Double-tap detection
  var now = Date.now();
  var dx = x - lastTapX;
  var dy = y - lastTapY;
  var dist = Math.sqrt(dx * dx + dy * dy);
  if (now - lastTapTime < 350 && dist < 50) {
    cycleMode();
    lastTapTime = 0;
  } else {
    lastTapTime = now;
    lastTapX = x;
    lastTapY = y;
  }

  // Pinch detection — if 2 pointers, start pinch
  var touchKeys = Object.keys(canvas.touches);
  if (touchKeys.length === 2) {
    var t0 = canvas.touches[touchKeys[0]];
    var t1 = canvas.touches[touchKeys[1]];
    canvas.pinchStartDist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
    canvas.pinchStartScale = canvas.scale;
  }
});

$mainCanvas.addEventListener('pointermove', function(e) {
  e.preventDefault();
  var touch = canvas.touches[e.pointerId];
  if (!touch) return;

  touch.prevX = touch.x;
  touch.prevY = touch.y;
  touch.x = e.clientX;
  touch.y = e.clientY;

  var mode = MODES[state.canvasMode];
  if (mode === 'trails') addTrailPoint(touch.x, touch.y, touch.prevX, touch.prevY);
  if (mode === 'ripples' && Math.random() < 0.15) addRipple(touch.x, touch.y);
  if (mode === 'geometric' && Math.random() < 0.2) addShape(touch.x, touch.y);
  if (mode === 'drawing') addDrawPoint(touch.x, touch.y, touch.prevX, touch.prevY);

  // Pinch zoom
  var touchKeys = Object.keys(canvas.touches);
  if (touchKeys.length === 2) {
    var t0 = canvas.touches[touchKeys[0]];
    var t1 = canvas.touches[touchKeys[1]];
    var dist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
    if (canvas.pinchStartDist > 0) {
      canvas.scale = Math.max(0.5, Math.min(3, canvas.pinchStartScale * (dist / canvas.pinchStartDist)));
    }
  }
});

$mainCanvas.addEventListener('pointerup', function(e) {
  delete canvas.touches[e.pointerId];
});

$mainCanvas.addEventListener('pointercancel', function(e) {
  delete canvas.touches[e.pointerId];
});

// --- Mode Cycling ---

function cycleMode() {
  var previousMode = MODES[state.canvasMode];
  state.canvasMode = (state.canvasMode + 1) % MODES.length;
  var nextMode = MODES[state.canvasMode];
  recordModeChange(previousMode, nextMode);
  // Clear current effects for clean transition
  canvas.trails = [];
  canvas.particles = [];
  canvas.ripples = [];
  canvas.shapes = [];
  canvas.drawPaths = [];
  // Set drawing color from current accent
  canvas.drawColor = canvas.accentRGB;
  clearCanvasFull();
  showModeIndicator();
}

function showModeIndicator() {
  var label = MODE_LABELS[MODES[state.canvasMode]];
  $modeIndicator.textContent = label;
  $modeIndicator.classList.add('visible');
  clearTimeout(showModeIndicator._timer);
  showModeIndicator._timer = setTimeout(function() {
    $modeIndicator.classList.remove('visible');
  }, 1500);
}

function startSignalSession() {
  if (!state.activeProfileId || signalSession.active) return;
  signalSession.active = true;
  signalSession.mode = MODES[state.canvasMode];
  signalSession.touchCount = 0;
  recordSignal('session_start', {});
  recordSignal('mode_start', { mode: signalSession.mode });
}

function endSignalSession() {
  if (!state.activeProfileId || !signalSession.active) return;
  flushTouchSignals();
  recordSignal('mode_end', { mode: signalSession.mode });
  recordSignal('session_end', {});
  signalSession.active = false;
  signalSession.mode = null;
}

function recordModeChange(previousMode, nextMode) {
  recordSignal('mode_end', { mode: previousMode });
  recordSignal('mode_cycle', { from: previousMode, to: nextMode });
  recordSignal('mode_start', { mode: nextMode });
  signalSession.mode = nextMode;
}

function queueTouchSignal() {
  if (!signalSession.active) return;
  signalSession.touchCount += 1;
  clearTimeout(signalSession.touchTimer);
  signalSession.touchTimer = setTimeout(flushTouchSignals, 2000);
}

function flushTouchSignals() {
  clearTimeout(signalSession.touchTimer);
  signalSession.touchTimer = null;
  if (!signalSession.touchCount) return;
  recordSignal('canvas_touch', { count: signalSession.touchCount });
  signalSession.touchCount = 0;
}

// --- Clear Button ---

$btnClear.addEventListener('click', function() {
  recordSignal('clear_canvas', { mode: MODES[state.canvasMode] });
  canvas.trails = [];
  canvas.particles = [];
  canvas.ripples = [];
  canvas.shapes = [];
  canvas.drawPaths = [];
  clearCanvasFull();
});

function clearCanvasFull() {
  if (!canvas.ctx) return;
  // Save and reset transform so we fill the entire buffer
  canvas.ctx.save();
  canvas.ctx.setTransform(1, 0, 0, 1, 0, 0);
  canvas.ctx.fillStyle = '#0d1b2a';
  canvas.ctx.fillRect(0, 0, $mainCanvas.width, $mainCanvas.height);
  canvas.ctx.restore();
}

// --- Gentle Prompt ---

var $gentleOrb = document.getElementById('gentle-orb');
var $promptChoice = document.getElementById('prompt-choice');
var gentlePrompt = {
  timer: null,
  fadeTimer: null,
  shown: false,       // shown this session
  choiceOpen: false,
};

function startGentlePromptTimer() {
  if (gentlePrompt.shown) return;
  clearTimeout(gentlePrompt.timer);
  var devControl = state.activeProfileId ? getProfileDevControl(state.activeProfileId) : {};
  var promptDelaySeconds = Number(devControl.promptDelaySeconds);
  if (devControl.promptEnabled === false) return;
  if (Number.isFinite(promptDelaySeconds) && promptDelaySeconds > 0 && promptDelaySeconds <= 600) {
    gentlePrompt.timer = setTimeout(showGentleOrb, promptDelaySeconds * 1000);
    return;
  }
  // 3-5 min random delay (180-300s)
  var delay = (180 + Math.random() * 120) * 1000;
  gentlePrompt.timer = setTimeout(showGentleOrb, delay);
}

function stopGentlePromptTimer() {
  clearTimeout(gentlePrompt.timer);
  clearTimeout(gentlePrompt.fadeTimer);
  hideGentleOrb();
  hidePromptChoice();
  gentlePrompt.shown = false;
}

function showGentleOrb() {
  if (state.screen !== 'canvas' || gentlePrompt.shown) return;
  gentlePrompt.shown = true;
  $gentleOrb.classList.add('visible');
  recordSignal('prompt_shown', {});
  // Auto-fade after 30s if not tapped
  gentlePrompt.fadeTimer = setTimeout(function() {
    recordSignal('prompt_ignored', {});
    hideGentleOrb();
  }, 30000);
}

function hideGentleOrb() {
  $gentleOrb.classList.remove('visible');
  hidePromptChoice();
}

function hidePromptChoice() {
  $promptChoice.classList.remove('visible');
  gentlePrompt.choiceOpen = false;
}

$gentleOrb.addEventListener('click', function(e) {
  e.stopPropagation();
  clearTimeout(gentlePrompt.fadeTimer);
  if (gentlePrompt.choiceOpen) {
    hidePromptChoice();
  } else {
    $promptChoice.classList.add('visible');
    gentlePrompt.choiceOpen = true;
    recordSignal('prompt_opened', {});
  }
});

$promptChoice.addEventListener('click', function(e) {
  var btn = e.target.closest('.prompt-btn');
  if (!btn) return;
  var exercise = btn.dataset.exercise;
  hideGentleOrb();
  startEnergyCheckin(exercise);
});

// Close choice on outside click
document.addEventListener('click', function(e) {
  if (gentlePrompt.choiceOpen && !$promptChoice.contains(e.target) && e.target !== $gentleOrb) {
    hidePromptChoice();
  }
});

// --- Breathing Exercise ---

var BREATH_PATTERNS = [
  { name: 'Box', inhale: 4, hold1: 4, exhale: 4, hold2: 4, desc: '4-4-4-4' },
  { name: '4-7-8', inhale: 4, hold1: 7, exhale: 8, hold2: 0, desc: '4-7-8' },
  { name: 'Simple', inhale: 5, hold1: 0, exhale: 5, hold2: 0, desc: '5-5' },
];
var TOTAL_CYCLES = 4;

var $breatheOverlay = document.getElementById('breathe-overlay');
var $breatheClose = document.getElementById('breathe-close');
var $breathePatterns = document.getElementById('breathe-patterns');
var $breatheCircle = document.getElementById('breathe-circle');
var $breatheLabel = document.getElementById('breathe-label');
var $breatheCounter = document.getElementById('breathe-counter');
var $breatheStart = document.getElementById('breathe-start');
var $breatheSkip = document.getElementById('breathe-skip');

var breathe = {
  patternIndex: 0,
  running: false,
  timers: [],
  cycle: 0,
};

function openBreatheOverlay() {
  breathe.patternIndex = 0;
  breathe.running = false;
  breathe.cycle = 0;
  clearBreathTimers();

  renderBreathPatterns();
  $breatheCircle.className = 'breathe-circle';
  $breatheCircle.style.transitionDuration = '';
  $breatheLabel.textContent = '';
  $breatheCounter.textContent = '';
  $breatheStart.classList.remove('hidden');
  $breatheStart.textContent = 'Start';
  $breatheSkip.textContent = 'Skip';
  $breatheOverlay.classList.add('active');
}

function closeBreatheOverlay() {
  clearBreathTimers();
  breathe.running = false;
  $breatheOverlay.classList.remove('active');
}

function renderBreathPatterns() {
  $breathePatterns.textContent = '';
  BREATH_PATTERNS.forEach(function(p, i) {
    var btn = document.createElement('button');
    btn.className = 'pattern-btn' + (i === breathe.patternIndex ? ' selected' : '');
    btn.textContent = p.name + ' (' + p.desc + ')';
    btn.dataset.index = i;
    $breathePatterns.appendChild(btn);
  });
}

$breathePatterns.addEventListener('click', function(e) {
  var btn = e.target.closest('.pattern-btn');
  if (!btn || breathe.running) return;
  breathe.patternIndex = parseInt(btn.dataset.index, 10);
  // Update selected state
  var all = $breathePatterns.querySelectorAll('.pattern-btn');
  all.forEach(function(b, i) { b.classList.toggle('selected', i === breathe.patternIndex); });
});

$breatheStart.addEventListener('click', function() {
  if (breathe.running) return;
  $breatheStart.classList.add('hidden');
  startBreathing();
});

$breatheClose.addEventListener('click', function() {
  closeBreatheOverlay();
  closeExerciseFlow();
});
$breatheSkip.addEventListener('click', function() {
  var wasComplete = !breathe.running;
  closeBreatheOverlay();
  if (wasComplete) {
    startEnergyCheckout();
  } else {
    closeExerciseFlow();
  }
});

function clearBreathTimers() {
  breathe.timers.forEach(function(t) { clearTimeout(t); });
  breathe.timers = [];
}

function startBreathing() {
  breathe.running = true;
  breathe.cycle = 0;
  runBreathCycle(0);
}

function runBreathCycle(cycle) {
  if (cycle >= TOTAL_CYCLES) {
    breathe.running = false;
    $breatheLabel.textContent = 'Nice work';
    $breatheCircle.className = 'breathe-circle';
    $breatheCircle.style.transitionDuration = '1s';
    $breatheCounter.textContent = '';
    $breatheSkip.textContent = 'Done';
    return;
  }

  breathe.cycle = cycle + 1;
  $breatheCounter.textContent = breathe.cycle + ' / ' + TOTAL_CYCLES;

  var p = BREATH_PATTERNS[breathe.patternIndex];
  var phases = [];
  phases.push({ label: 'Breathe in', duration: p.inhale, cls: 'inhale' });
  if (p.hold1 > 0) phases.push({ label: 'Hold', duration: p.hold1, cls: 'hold' });
  phases.push({ label: 'Breathe out', duration: p.exhale, cls: 'exhale' });
  if (p.hold2 > 0) phases.push({ label: 'Hold', duration: p.hold2, cls: 'hold' });

  var delay = 0;
  phases.forEach(function(ph) {
    var tid = setTimeout(function() {
      $breatheLabel.textContent = ph.label;
      $breatheCircle.className = 'breathe-circle ' + ph.cls;
      $breatheCircle.style.transitionDuration = ph.duration + 's';
    }, delay);
    breathe.timers.push(tid);
    delay += ph.duration * 1000;
  });

  var nextTid = setTimeout(function() { runBreathCycle(cycle + 1); }, delay);
  breathe.timers.push(nextTid);
}

// --- Energy Levels ---

var ENERGY_LEVELS = [
  { value: 5, label: 'Overload',  color: '#d64550', desc: "Can't think straight" },
  { value: 4, label: 'Wired',     color: '#e8a838', desc: 'Restless or tense' },
  { value: 3, label: 'Calm Zone', color: '#48b5a0', desc: 'Ready to think' },
  { value: 2, label: 'Low',       color: '#6b9ac4', desc: 'Tired or foggy' },
  { value: 1, label: 'Shutdown',  color: '#4a6fa5', desc: 'Frozen or numb' },
];

// --- Grounding Prompts ---

var GROUND_PROMPTS = [
  { sense: 'See',   count: 5, icon: '👁',  prompt: 'Name 5 things you can see right now' },
  { sense: 'Touch', count: 4, icon: '✋', prompt: 'Name 4 things you can feel or touch' },
  { sense: 'Hear',  count: 3, icon: '👂', prompt: 'Name 3 things you can hear' },
  { sense: 'Smell', count: 2, icon: '🫁', prompt: 'Name 2 things you can smell' },
  { sense: 'Taste', count: 1, icon: '👅', prompt: 'Name 1 thing you can taste' },
];

// --- Exercise Flow State ---

var exerciseFlow = {
  exerciseType: null,   // 'breathe' | 'ground'
  energyBefore: null,
  energyAfter: null,
  completed: false,
};

// --- Energy Check-In ---

var $energyCheckin = document.getElementById('energy-checkin');
var $energyCheckinClose = document.getElementById('energy-checkin-close');
var $energyCheckinLevels = document.getElementById('energy-checkin-levels');
var $energyCheckinGo = document.getElementById('energy-checkin-go');

function startEnergyCheckin(exerciseType) {
  exerciseFlow.exerciseType = exerciseType;
  recordSignal('exercise_choice', { exerciseType: exerciseFlow.exerciseType });
  exerciseFlow.energyBefore = null;
  exerciseFlow.energyAfter = null;
  exerciseFlow.completed = false;
  renderEnergyLevels($energyCheckinLevels, 'checkin');
  $energyCheckinGo.disabled = true;
  $energyCheckin.classList.add('active');
}

function renderEnergyLevels(container, context) {
  container.textContent = '';
  ENERGY_LEVELS.forEach(function(level) {
    var btn = document.createElement('button');
    btn.className = 'energy-btn';
    btn.dataset.value = level.value;
    btn.dataset.context = context;

    var dot = document.createElement('span');
    dot.className = 'energy-dot';
    dot.style.background = level.color;
    btn.appendChild(dot);

    var info = document.createElement('div');
    var label = document.createElement('div');
    label.className = 'energy-btn-label';
    label.textContent = level.label;
    info.appendChild(label);

    var desc = document.createElement('div');
    desc.className = 'energy-btn-desc';
    desc.textContent = level.desc;
    info.appendChild(desc);

    btn.appendChild(info);
    container.appendChild(btn);
  });
}

$energyCheckinLevels.addEventListener('click', function(e) {
  var btn = e.target.closest('.energy-btn');
  if (!btn) return;
  exerciseFlow.energyBefore = parseInt(btn.dataset.value, 10);
  // Update selection UI
  var all = $energyCheckinLevels.querySelectorAll('.energy-btn');
  var level = ENERGY_LEVELS.find(function(l) { return l.value === exerciseFlow.energyBefore; });
  all.forEach(function(b) {
    var selected = parseInt(b.dataset.value, 10) === exerciseFlow.energyBefore;
    b.classList.toggle('selected', selected);
    b.style.borderColor = selected ? level.color : '';
  });
  $energyCheckinGo.disabled = false;
});

$energyCheckinGo.addEventListener('click', function() {
  if (exerciseFlow.energyBefore === null) return;
  $energyCheckin.classList.remove('active');
  recordSignal('exercise_started', { exerciseType: exerciseFlow.exerciseType });
  if (exerciseFlow.exerciseType === 'breathe') {
    openBreatheOverlay();
  } else if (exerciseFlow.exerciseType === 'ground') {
    openGroundOverlay();
  }
});

$energyCheckinClose.addEventListener('click', function() {
  $energyCheckin.classList.remove('active');
  closeExerciseFlow();
});

// --- Grounding Exercise ---

var $groundOverlay = document.getElementById('ground-overlay');
var $groundClose = document.getElementById('ground-close');
var $groundProgress = document.getElementById('ground-progress');
var $groundSenseIcon = document.getElementById('ground-sense-icon');
var $groundSenseTitle = document.getElementById('ground-sense-title');
var $groundSensePrompt = document.getElementById('ground-sense-prompt');
var $groundCircles = document.getElementById('ground-circles');
var $groundNext = document.getElementById('ground-next');
var $groundSkipBtn = document.getElementById('ground-skip-btn');

var ground = {
  step: 0,
  checked: [],
  complete: false,
};

function openGroundOverlay() {
  ground.step = 0;
  ground.checked = [];
  ground.complete = false;
  renderGroundStep();
  $groundOverlay.classList.add('active');
}

function closeGroundOverlay() {
  $groundOverlay.classList.remove('active');
}

function renderGroundStep() {
  // Progress bars
  $groundProgress.textContent = '';
  for (var i = 0; i < GROUND_PROMPTS.length; i++) {
    var bar = document.createElement('div');
    bar.className = 'ground-progress-bar';
    if (i < ground.step) bar.classList.add('done');
    else if (i === ground.step) bar.classList.add('current');
    $groundProgress.appendChild(bar);
  }

  if (ground.step >= GROUND_PROMPTS.length) {
    // Complete
    ground.complete = true;
    $groundSenseIcon.textContent = '✓';
    $groundSenseTitle.textContent = 'Nice work';
    $groundSensePrompt.textContent = 'You grounded yourself in the present.';
    $groundCircles.textContent = '';
    $groundNext.textContent = 'Done';
    $groundNext.disabled = false;
    $groundSkipBtn.style.display = 'none';
    return;
  }

  var sense = GROUND_PROMPTS[ground.step];
  $groundSenseIcon.textContent = sense.icon;
  $groundSenseTitle.textContent = sense.sense;
  $groundSensePrompt.textContent = sense.prompt;
  $groundSkipBtn.style.display = '';

  // Tap circles
  ground.checked = [];
  $groundCircles.textContent = '';
  for (var j = 0; j < sense.count; j++) {
    var circle = document.createElement('button');
    circle.className = 'ground-circle';
    circle.dataset.index = j;
    circle.textContent = j + 1;
    $groundCircles.appendChild(circle);
  }

  $groundNext.textContent = ground.step < GROUND_PROMPTS.length - 1 ? 'Next' : 'Almost done';
  $groundNext.disabled = true;
}

$groundCircles.addEventListener('click', function(e) {
  var circle = e.target.closest('.ground-circle');
  if (!circle) return;
  var idx = parseInt(circle.dataset.index, 10);
  var pos = ground.checked.indexOf(idx);
  if (pos === -1) {
    ground.checked.push(idx);
    circle.classList.add('checked');
    circle.textContent = '✓';
  } else {
    ground.checked.splice(pos, 1);
    circle.classList.remove('checked');
    circle.textContent = (idx + 1);
  }

  var sense = GROUND_PROMPTS[ground.step];
  $groundNext.disabled = ground.checked.length < sense.count;
});

$groundNext.addEventListener('click', function() {
  if (ground.complete) {
    closeGroundOverlay();
    startEnergyCheckout();
    return;
  }
  ground.step++;
  renderGroundStep();
});

$groundClose.addEventListener('click', function() {
  closeGroundOverlay();
  closeExerciseFlow();
});

$groundSkipBtn.addEventListener('click', function() {
  closeGroundOverlay();
  closeExerciseFlow();
});

// --- Energy Check-Out ---

var $energyCheckout = document.getElementById('energy-checkout');
var $energyCheckoutClose = document.getElementById('energy-checkout-close');
var $checkoutSelect = document.getElementById('checkout-select');
var $energyCheckoutLevels = document.getElementById('energy-checkout-levels');
var $energyCheckoutDone = document.getElementById('energy-checkout-done');
var $checkoutCompare = document.getElementById('checkout-compare');
var $compareBDot = document.getElementById('compare-before-dot');
var $compareBText = document.getElementById('compare-before-text');
var $compareADot = document.getElementById('compare-after-dot');
var $compareAText = document.getElementById('compare-after-text');
var $checkoutMessage = document.getElementById('checkout-message');
var $checkoutFinish = document.getElementById('checkout-finish');

function startEnergyCheckout() {
  exerciseFlow.energyAfter = null;
  renderEnergyLevels($energyCheckoutLevels, 'checkout');
  $energyCheckoutDone.disabled = true;
  $checkoutSelect.style.display = '';
  $checkoutCompare.style.display = 'none';
  $energyCheckout.classList.add('active');
}

$energyCheckoutLevels.addEventListener('click', function(e) {
  var btn = e.target.closest('.energy-btn');
  if (!btn) return;
  exerciseFlow.energyAfter = parseInt(btn.dataset.value, 10);
  var all = $energyCheckoutLevels.querySelectorAll('.energy-btn');
  var level = ENERGY_LEVELS.find(function(l) { return l.value === exerciseFlow.energyAfter; });
  all.forEach(function(b) {
    var selected = parseInt(b.dataset.value, 10) === exerciseFlow.energyAfter;
    b.classList.toggle('selected', selected);
    b.style.borderColor = selected ? level.color : '';
  });
  $energyCheckoutDone.disabled = false;
});

$energyCheckoutDone.addEventListener('click', function() {
  if (exerciseFlow.energyAfter === null) return;
  showCheckoutComparison();
});

function showCheckoutComparison() {
  $checkoutSelect.style.display = 'none';
  $checkoutCompare.style.display = '';

  var before = ENERGY_LEVELS.find(function(l) { return l.value === exerciseFlow.energyBefore; });
  var after = ENERGY_LEVELS.find(function(l) { return l.value === exerciseFlow.energyAfter; });

  $compareBDot.style.background = before ? before.color : '#888';
  $compareBText.textContent = before ? before.label : '';
  $compareADot.style.background = after ? after.color : '#888';
  $compareAText.textContent = after ? after.label : '';

  // Contextual message
  var msg = '';
  if (exerciseFlow.energyAfter === 3) {
    msg = "You're in the calm zone. This is where you can think clearly and solve problems.";
  } else if (exerciseFlow.energyAfter < exerciseFlow.energyBefore) {
    msg = 'Your energy shifted down. Every time you practice, this gets easier.';
  } else if (exerciseFlow.energyAfter > exerciseFlow.energyBefore) {
    msg = "Sometimes regulation takes more than one round. That's completely normal. Try again anytime.";
  } else {
    msg = 'You checked in with yourself. That awareness is a skill on its own.';
  }
  $checkoutMessage.textContent = msg;

  // Log session
  logSession();
}

$checkoutFinish.addEventListener('click', function() {
  $energyCheckout.classList.remove('active');
  closeExerciseFlow();
});

$energyCheckoutClose.addEventListener('click', function() {
  $energyCheckout.classList.remove('active');
  closeExerciseFlow();
});

// Close exercise flow without checkout (user closed mid-exercise)
function closeExerciseFlow() {
  if (exerciseFlow.exerciseType && !exerciseFlow.completed) {
    recordSignal('exercise_closed', { exerciseType: exerciseFlow.exerciseType });
  }
  exerciseFlow.exerciseType = null;
  exerciseFlow.energyBefore = null;
  exerciseFlow.energyAfter = null;
  exerciseFlow.completed = false;
}

// --- Session Logging ---

function logSession() {
  if (!state.activeProfileId) return;
  var session = {
    date: new Date().toISOString(),
    energyBefore: exerciseFlow.energyBefore,
    energyAfter: exerciseFlow.energyAfter,
    exerciseType: exerciseFlow.exerciseType,
  };
  try {
    var key = 'calm-station-' + state.activeProfileId + '-sessions';
    var raw = localStorage.getItem(key);
    var sessions = raw ? JSON.parse(raw) : [];
    sessions.push(session);
    // Keep last 100 sessions
    if (sessions.length > 100) sessions = sessions.slice(-100);
    localStorage.setItem(key, JSON.stringify(sessions));
  } catch (e) {
    // silent
  }
  recordSignal('exercise_completed', {
    exerciseType: exerciseFlow.exerciseType,
    energyBefore: exerciseFlow.energyBefore,
    energyAfter: exerciseFlow.energyAfter,
  });
  exerciseFlow.completed = true;

  // Notify parent
  var profile = state.profiles.find(function(p) { return p && p.id === state.activeProfileId; });
  if (profile) {
    notifyParentOnExercise(profile.name, exerciseFlow.exerciseType);
  }
}

// --- Audio Engine ---

var SOUNDS = [
  { id: 'rain',       name: 'Rain' },
  { id: 'drone',      name: 'Ambient Drone' },
  { id: 'ocean',      name: 'Ocean Waves' },
  { id: 'whitenoise', name: 'White Noise' },
];

var MUSIC_TRACKS = [
  { id: 'bowls',      name: 'Bowls',       file: 'audio/music/bowls.mp3' },
  { id: 'tides',      name: 'Tides',       file: 'audio/music/tides.mp3' },
  { id: 'forestrain', name: 'Forest Rain', file: 'audio/music/forest-rain.mp3' },
];
var LOOP_EDGE_S = 0.15; // runtime loop points trim encoder padding
// Rain droplet pitches: A-major pentatonic at A=432 —
// mix of exact JI ratios from 216 (1/1, 9/8, 3/2) and rounded 12-TET (maj3, maj6).
var DROPLET_FREQS = [216, 243, 272, 324, 363];

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
  musicGen: 0,         // decode-lifecycle generation counter
  pauseSnapshot: null, // remembered layers for play/pause
  volume: 0.5,
};

var $btnSound = document.getElementById('btn-sound');
var $soundPanel = document.getElementById('sound-panel');
var $soundOptions = document.getElementById('sound-options');
var $musicOptions = document.getElementById('music-options');
var $btnPlayPause = document.getElementById('btn-play-pause');
var $iconPlay = document.getElementById('icon-play');
var $iconPause = document.getElementById('icon-pause');
var $volumeSlider = document.getElementById('volume-slider');

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

    if (entrainment.rate) {
      var pending = entrainment.rate;
      entrainment.rate = null;
      applyEntrainment(pending);
    }
  } catch (e) {
    // Web Audio not supported, or init failed partway — reset so a later
    // call can retry cleanly instead of reusing a half-built graph.
    if (audio.ctx) { try { audio.ctx.close(); } catch (e2) {} }
    audio.ctx = null;
    audio.masterGain = null;
    audio.musicBus = null;
    audio.ambientBus = null;
    audio.sfxBus = null;
    audio.entrainGain = null;
  }
}

// --- Noise buffer (shared) ---

var _noiseBuffer = null;
function getNoiseBuffer() {
  if (_noiseBuffer) return _noiseBuffer;
  var ctx = audio.ctx;
  var len = ctx.sampleRate * 2;
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  _noiseBuffer = buf;
  return buf;
}

var _pinkBuffer = null;
function getPinkNoiseBuffer() {
  // Paul Kellet pink-noise approximation, precomputed into a loop buffer.
  // Generates 1s extra and keeps the LAST 4s: head and tail then both carry
  // converged filter state, so the loop seam is an ordinary interior step
  // instead of a zero-state-vs-converged jump (audible-tick prevention).
  if (_pinkBuffer) return _pinkBuffer;
  var ctx = audio.ctx;
  var warm = ctx.sampleRate;           // 1s discarded warm-up
  var len = ctx.sampleRate * 4;
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var data = buf.getChannelData(0);
  var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (var i = 0; i < warm + len; i++) {
    var white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    if (i >= warm) {
      data[i - warm] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    }
    b6 = white * 0.115926;
  }
  _pinkBuffer = buf;
  return buf;
}

// --- Rain Generator ---

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
  // NOTE: same wall-clock-timer-during-suspend invariant as the ocean wave
  // engine — repeated firings while hidden are harmless (osc lifetimes are
  // self-contained and the ctx renders nothing while suspended).
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

// --- Drone Generator ---

function detunedPair(ctx, freq, gainValue, dest) {
  // Two oscillators ±3 cents apart: slow phase drift = natural warmth.
  var g = ctx.createGain();
  g.gain.value = gainValue;
  g.connect(dest);
  // 0.5 sum-scaler: the two ±3¢ oscillators are highly correlated, so summing
  // near-doubles amplitude; halving keeps nominal gain comparable to one osc.
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

  // Gentle lowpass over the oscillator stack. NOTE: on pure sines its audible
  // effect is minimal — the drone's "breathing" comes from the 0.1 Hz amplitude
  // swell and the ±3-cent pair beating below, not this filter.
  var sweep = ctx.createBiquadFilter();
  sweep.type = 'lowpass';
  sweep.frequency.value = 400;
  sweep.connect(mixGain);

  // 432-family stack (C in A=432 temperament), each a detuned pair
  var base = detunedPair(ctx, 64.22, 0.15, sweep);     // C2
  var octave = detunedPair(ctx, 128.43, 0.045, sweep); // C3
  var sub = detunedPair(ctx, 32.11, 0.03, sweep);      // C1

  // Filter sweep LFO (~0.03 Hz) — subtle at best on sine partials (kept for cheapness)
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

// --- Ocean Waves Generator ---

function createOcean(ctx, dest) {
  var buf = getNoiseBuffer();

  var mix = ctx.createGain();
  mix.gain.value = 1;
  // Uniform loudness scale toward picker parity. Must be its own node:
  // mix.gain is the crossfade handle playSound ramps 0->1, so any value
  // planted there is overwritten on select.
  var scale = ctx.createGain();
  scale.gain.value = 1.4;
  mix.connect(scale);
  var pan = null;
  if (ctx.createStereoPanner) {
    pan = ctx.createStereoPanner();
    scale.connect(pan);
    pan.connect(dest);
  } else {
    scale.connect(dest);
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
  deepGain.gain.value = 0.14;
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
  // NOTE: setTimeout keeps firing on wall-clock while the ctx is suspended
  // (tab hidden); repeated firings all land on the frozen currentTime and
  // cancelScheduledValues makes them safe — only the last envelope survives.
  var waveTimer = null;
  function scheduleWave() {
    var period = 8 + Math.random() * 8;               // 8–16 s
    var peak = 0.12 + Math.random() * 0.13;           // varying height
    var rise = period * (0.35 + Math.random() * 0.15);
    var t = ctx.currentTime;
    waveGain.gain.cancelScheduledValues(t);
    waveGain.gain.setValueAtTime(Math.max(0.04, waveGain.gain.value), t);
    waveGain.gain.linearRampToValueAtTime(peak, t + rise);
    waveGain.gain.linearRampToValueAtTime(0.06, t + period);
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

// --- White Noise Generator ---

function createWhiteNoise(ctx, dest) {
  var noise = ctx.createBufferSource();
  noise.buffer = getPinkNoiseBuffer();
  noise.loop = true;

  // Soften remaining top end further
  var shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 3000;
  shelf.gain.value = -6;

  // Internal level driver. NOT the crossfade handle: playSound schedules
  // setValueAtTime(0) + ramp-to-1 on the returned gain at select, which
  // would wipe any preset value planted there (see ocean commit 2f37861).
  var level = ctx.createGain();
  level.gain.value = 0.25;

  var gain = ctx.createGain(); // crossfade handle (playSound ramps this 0->1)
  gain.gain.value = 1;

  // Barely perceptible undulation so it doesn't feel frozen. Targets the
  // level node, not the crossfade handle, to avoid two writers on one AudioParam.
  var lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.05;
  var lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain);
  lfoGain.connect(level.gain);

  noise.connect(shelf);
  shelf.connect(level);
  level.connect(gain);
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

var generators = {
  rain: createRain,
  drone: createDrone,
  ocean: createOcean,
  whitenoise: createWhiteNoise,
};

// --- Crossfade ---

function playSound(soundId, options) {
  options = options || {};
  ensureAudioContext();
  if (!audio.ctx) return;
  if (audio.ctx.state === 'suspended') audio.ctx.resume();

  var ctx = audio.ctx;

  // Fade out current
  if (audio.currentNodes) {
    var old = audio.currentNodes;
    old.gain.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
    old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    setTimeout(function() { try { old.stop(); } catch(e) {} }, 600);
  }

  // If selecting same sound while playing, just stop (toggle off)
  if (soundId === audio.currentId && audio.playing) {
    if (audio.pauseSnapshot) audio.pauseSnapshot.soundId = null;
    audio.currentId = null;
    audio.currentNodes = null;
    audio.playing = false;
    updateSoundUI();
    updateDucking();
    recordSignal('sound_stop', { soundId: soundId, layer: 'ambient' });
    saveSoundPrefs();
    return;
  }

  // Create new sound
  var gen = generators[soundId];
  if (!gen) return;

  var nodes = gen(ctx, audio.ambientBus);
  nodes.gain.gain.setValueAtTime(0, ctx.currentTime);
  nodes.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.5);

  audio.currentId = soundId;
  audio.currentNodes = nodes;
  audio.playing = true;
  if (!options.suppressSignal) {
    recordSignal('sound_select', { soundId: soundId, layer: 'ambient' });
  }
  updateSoundUI();
  updateDucking();
  saveSoundPrefs();
}

function stopSound() {
  if (!audio.ctx || !audio.currentNodes) return;
  var ctx = audio.ctx;
  var old = audio.currentNodes;
  var stoppedSoundId = audio.currentId;
  old.gain.gain.cancelScheduledValues(ctx.currentTime);
  old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
  old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
  setTimeout(function() { try { old.stop(); } catch(e) {} }, 600);
  audio.currentNodes = null;
  audio.playing = false;
  if (stoppedSoundId) recordSignal('sound_stop', { soundId: stoppedSoundId, layer: 'ambient' });
  updateSoundUI();
  updateDucking();
  saveSoundPrefs();
}

// --- Music layer (Soundscape 2.0) ---

function getMusicTrack(trackId) {
  for (var i = 0; i < MUSIC_TRACKS.length; i++) {
    if (MUSIC_TRACKS[i].id === trackId) return MUSIC_TRACKS[i];
  }
  return null;
}

var musicLoad = { promise: null, trackId: null };

function loadMusicBuffer(track) {
  if (audio.musicBufferId === track.id && audio.musicBuffer) {
    return Promise.resolve(audio.musicBuffer);
  }
  // De-dupe: reuse an in-flight decode of the same track.
  if (musicLoad.promise && musicLoad.trackId === track.id) {
    return musicLoad.promise;
  }
  var p = fetch(track.file)
    .then(function(res) {
      if (!res.ok) throw new Error('fetch failed: ' + track.file);
      return res.arrayBuffer();
    })
    .then(function(data) {
      return audio.ctx.decodeAudioData(data);
    })
    .then(function(buffer) {
      if (musicLoad.promise === p) { musicLoad.promise = null; musicLoad.trackId = null; }
      return buffer;
    }, function(err) {
      if (musicLoad.promise === p) { musicLoad.promise = null; musicLoad.trackId = null; }
      throw err;
    });
  musicLoad.promise = p;
  musicLoad.trackId = track.id;
  return p;
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
    if (audio.pauseSnapshot) audio.pauseSnapshot.musicId = null;
    stopMusic();
    return;
  }
  var track = getMusicTrack(trackId);
  if (!track) return;

  audio.musicGen += 1;
  var gen = audio.musicGen;

  // Fade out current music
  if (audio.musicNodes) {
    var old = audio.musicNodes;
    old.gain.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
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
    // Bail if this decode outlived its selection (switch/stop/exit since).
    if (!buffer || gen !== audio.musicGen || audio.musicId !== trackId || !audio.musicPlaying) return;
    // Memory rule: single decoded track, written only by the current selection.
    audio.musicBuffer = buffer;
    audio.musicBufferId = track.id;
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
    if (gen === audio.musicGen) markTrackUnavailable(trackId);
  });
}

function stopMusic() {
  audio.musicGen += 1;
  var stoppedId = audio.musicId;
  if (audio.ctx && audio.musicNodes) {
    var ctx = audio.ctx;
    var old = audio.musicNodes;
    old.gain.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
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
  // When both layers play, ambient becomes the bed under the music.
  if (!audio.ctx || !audio.ambientBus) return;
  var target = (audio.musicPlaying && audio.playing) ? 0.7 : 1.0;
  audio.ambientBus.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.7); // ~2s settle
}

// --- Entrainment modulator (dev-gated experiment) ---
// Monaural amplitude modulation on the ambient bus. Evidence for these
// rates is mixed/emerging — they are observable experiment variables,
// never kid-visible controls, never defaults.
// Depth 0.15: ~7.5x the drone's background theta tremor (0.02) — deep enough
// to be measurable as a stimulus, shallow enough to stay comfortable at 40 Hz.

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
    audio.entrainGain.gain.setTargetAtTime(1, t, 0.5);
    entrainment.rate = null;
    return;
  }
  var depth = 0.15;
  audio.entrainGain.gain.setTargetAtTime(1 - depth, t, 0.5);
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

function togglePlayPause() {
  ensureAudioContext();
  var anyPlaying = audio.playing || audio.musicPlaying;
  if (anyPlaying) {
    var prior = audio.pauseSnapshot || {};
    audio.pauseSnapshot = {
      soundId: audio.playing ? audio.currentId : (prior.soundId || null),
      musicId: audio.musicPlaying ? audio.musicId : (prior.musicId || null),
    };
    if (audio.musicPlaying) stopMusic();
    if (audio.playing) stopSound();
  } else {
    var r = audio.pauseSnapshot || {};
    if (r.musicId) playMusic(r.musicId);
    if (r.soundId) {
      playSound(r.soundId);
    } else if (!r.musicId) {
      // Nothing remembered: default to rain (existing behavior)
      playSound(audio.currentId || 'rain');
    }
  }
}

var volumeSignalTimer = null;

function recordVolumeChange(val) {
  var profileId = state.activeProfileId;
  var context = profileId ? getSignalContext(profileId) : null;
  clearTimeout(volumeSignalTimer);
  volumeSignalTimer = setTimeout(function() {
    if (profileId) {
      recordSignalForProfileWithContext(profileId, 'volume_change', { volume: val }, context);
    }
  }, 500);
}

function setVolume(val) {
  audio.volume = val;
  if (audio.masterGain) {
    audio.masterGain.gain.setTargetAtTime(val, audio.ctx.currentTime, 0.05);
  }
  recordVolumeChange(val);
  saveSoundPrefs();
}

// --- Sound UI ---

function renderSoundOptions() {
  $soundOptions.textContent = '';
  SOUNDS.forEach(function(s) {
    var btn = document.createElement('button');
    btn.className = 'sound-option' + (audio.currentId === s.id && audio.playing ? ' selected' : '');
    btn.dataset.sound = s.id;

    var dot = document.createElement('span');
    dot.className = 'sound-dot';
    btn.appendChild(dot);

    var label = document.createTextNode(s.name);
    btn.appendChild(label);

    $soundOptions.appendChild(btn);
  });
}

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

// --- Sound Panel Toggle ---

var soundPanelOpen = false;

$btnSound.addEventListener('click', function(e) {
  e.stopPropagation();
  ensureAudioContext(); // iOS requires user gesture
  soundPanelOpen = !soundPanelOpen;
  $soundPanel.classList.toggle('open', soundPanelOpen);
  if (soundPanelOpen) recordSignal('sound_panel_open', {});
  if (soundPanelOpen) renderSoundOptions();
  if (soundPanelOpen) renderMusicOptions();
});

// Close panel on outside click
document.addEventListener('click', function(e) {
  if (soundPanelOpen && !$soundPanel.contains(e.target) && e.target !== $btnSound) {
    soundPanelOpen = false;
    $soundPanel.classList.remove('open');
  }
});

// Sound option click
$soundOptions.addEventListener('click', function(e) {
  var btn = e.target.closest('.sound-option');
  if (!btn) return;
  playSound(btn.dataset.sound);
});

// Music option click
$musicOptions.addEventListener('click', function(e) {
  var btn = e.target.closest('.sound-option');
  if (!btn) return;
  playMusic(btn.dataset.music);
});

// Play/pause
$btnPlayPause.addEventListener('click', togglePlayPause);

// Volume
$volumeSlider.addEventListener('input', function(e) {
  setVolume(parseInt(e.target.value, 10) / 100);
});

// --- Pause/Resume on Visibility ---

document.addEventListener('visibilitychange', function() {
  if (!audio.ctx) return;
  if (document.hidden) {
    if (audio.ctx.state === 'running') audio.ctx.suspend();
  } else {
    if ((audio.playing || audio.musicPlaying) && audio.ctx.state === 'suspended') audio.ctx.resume();
  }
});

// --- Sound Prefs per Profile ---

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

function loadSoundPrefs() {
  if (!state.activeProfileId) return;
  var prefs = getProfilePrefs(state.activeProfileId);
  if (prefs.volume !== undefined) {
    audio.volume = prefs.volume;
    $volumeSlider.value = Math.round(prefs.volume * 100);
    if (audio.masterGain) audio.masterGain.gain.value = prefs.volume;
  }
  if (prefs.soundId && prefs.soundPlaying) {
    audio.currentId = prefs.soundId;
    playSound(prefs.soundId, { suppressSignal: true });
  } else {
    audio.currentId = prefs.soundId || null;
  }
  if (prefs.musicId && prefs.musicPlaying) {
    playMusic(prefs.musicId, { suppressSignal: true });
  } else {
    audio.musicId = prefs.musicId || null;
  }
  updateSoundUI();
}

function stopSoundOnExit() {
  stopSfxScheduler();
  if (audio.currentNodes) {
    try { audio.currentNodes.stop(); } catch(e) {}
    audio.currentNodes = null;
  }
  audio.musicGen += 1;
  if (audio.musicNodes) {
    try { audio.musicNodes.stop(); } catch (e) {}
    audio.musicNodes = null;
  }
  audio.musicPlaying = false;
  audio.musicId = null;
  audio.musicBuffer = null;     // release decoded PCM
  audio.musicBufferId = null;
  audio.playing = false;
  audio.currentId = null;
  audio.pauseSnapshot = null;
  soundPanelOpen = false;
  $soundPanel.classList.remove('open');
  $btnSound.classList.remove('active');
  updateDucking();
}

// --- Ambient Background ---

const ambient = {
  ctx: null,
  width: 0,
  height: 0,
  gradients: [],
  particles: [],
  animId: null,
  time: 0,
};

function initAmbient() {
  ambient.ctx = $ambientCanvas.getContext('2d');
  resizeAmbient();
  createGradients();
  createParticles();
  window.addEventListener('resize', resizeAmbient);
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      cancelAnimationFrame(ambient.animId);
      ambient.animId = null;
    } else if (state.screen === 'profiles' && !ambient.animId) {
      tickAmbient();
    }
  });
  tickAmbient();
}

function resizeAmbient() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ambient.width = window.innerWidth;
  ambient.height = window.innerHeight;
  $ambientCanvas.width = ambient.width * dpr;
  $ambientCanvas.height = ambient.height * dpr;
  $ambientCanvas.style.width = ambient.width + 'px';
  $ambientCanvas.style.height = ambient.height + 'px';
  ambient.ctx.scale(dpr, dpr);
}

function createGradients() {
  ambient.gradients = [
    { x: 0.3, y: 0.4, radius: 0.4, color: '72, 181, 160', opacity: 0.06, speedX: 0.015, speedY: 0.012, phaseX: 0, phaseY: 0.5 },
    { x: 0.7, y: 0.3, radius: 0.35, color: '58, 143, 183', opacity: 0.05, speedX: 0.012, speedY: 0.018, phaseX: 1.2, phaseY: 0 },
    { x: 0.5, y: 0.7, radius: 0.45, color: '72, 181, 160', opacity: 0.04, speedX: 0.018, speedY: 0.01, phaseX: 2.5, phaseY: 1.8 },
  ];
}

function createParticles() {
  ambient.particles = [];
  const count = 35;
  for (let i = 0; i < count; i++) {
    ambient.particles.push({
      x: Math.random(),
      y: Math.random(),
      radius: 1 + Math.random() * 2,
      opacity: 0.08 + Math.random() * 0.25,
      vx: (Math.random() - 0.5) * 0.0004,
      vy: (Math.random() - 0.5) * 0.0003 - 0.0001, // slight upward drift
    });
  }
}

function tickAmbient() {
  if (document.hidden || state.screen !== 'profiles') return;

  const ctx = ambient.ctx;
  const w = ambient.width;
  const h = ambient.height;

  // Clear
  ctx.clearRect(0, 0, w, h);

  ambient.time += 0.016; // ~60fps

  // Layer 1: Gradient blobs
  ambient.gradients.forEach(function(g) {
    const cx = (g.x + Math.sin(ambient.time * g.speedX + g.phaseX) * 0.1) * w;
    const cy = (g.y + Math.sin(ambient.time * g.speedY + g.phaseY) * 0.1) * h;
    const r = g.radius * Math.max(w, h);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(' + g.color + ', ' + g.opacity + ')');
    grad.addColorStop(1, 'rgba(' + g.color + ', 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  // Layer 2: Floating particles
  ambient.particles.forEach(function(p) {
    p.x += p.vx;
    p.y += p.vy;

    // Wrap around edges
    if (p.x < -0.02) p.x = 1.02;
    if (p.x > 1.02) p.x = -0.02;
    if (p.y < -0.02) p.y = 1.02;
    if (p.y > 1.02) p.y = -0.02;

    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(72, 181, 160, ' + p.opacity + ')';
    ctx.fill();
  });

  ambient.animId = requestAnimationFrame(tickAmbient);
}

// --- Utility ---

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

function hexToRGB(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// --- Parent Dashboard ---

var $screenParent = document.getElementById('screen-parent');
var $parentBack = document.getElementById('parent-back');
var $parentProfiles = document.getElementById('parent-profiles');
var $telegramUrl = document.getElementById('telegram-url');
var $telegramSave = document.getElementById('telegram-save');
var $telegramTest = document.getElementById('telegram-test');
var $telegramStatus = document.getElementById('telegram-status');
var $screenDev = document.getElementById('screen-dev');
var $devBack = document.getElementById('dev-back');
var $devProfiles = document.getElementById('dev-profiles');
var $devControls = document.getElementById('dev-controls');
var $devEvents = document.getElementById('dev-events');
var $devExport = document.getElementById('dev-export');
var $devReset = document.getElementById('dev-reset');
var $devSaveControls = document.getElementById('dev-save-controls');
var $devStatus = document.getElementById('dev-status');

setActiveScreenAccessibility($screenProfiles);

var PARENT_STORAGE_KEY = 'calm-station-parent';

function getParentPrefs() {
  try {
    var raw = localStorage.getItem(PARENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveParentPrefs(prefs) {
  try {
    localStorage.setItem(PARENT_STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    // silent
  }
}

// Hidden access: long-press on title (3s)
var titlePressTimer = null;
var $title = document.querySelector('.profiles-header h1');
if ($title) {
  $title.addEventListener('pointerdown', function(e) {
    titlePressTimer = setTimeout(function() {
      openParentDashboard();
    }, 3000);
  });
  $title.addEventListener('pointerup', function() {
    clearTimeout(titlePressTimer);
  });
  $title.addEventListener('pointercancel', function() {
    clearTimeout(titlePressTimer);
  });
  $title.addEventListener('pointerleave', function() {
    clearTimeout(titlePressTimer);
  });
}

// URL param access
function checkParentUrlParam() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('dev') === 'true') {
    setTimeout(openDevDashboard, 100);
    return;
  }
  if (params.get('parent') === 'true') {
    openParentDashboard();
  }
}

function openParentDashboard() {
  state.screen = 'parent';
  $screenProfiles.classList.remove('active');
  $screenCanvas.classList.remove('active');
  $screenParent.classList.add('active');
  $screenDev.classList.remove('active');
  setActiveScreenAccessibility($screenParent);
  $ambientCanvas.classList.add('hidden');

  // Load saved webhook URL
  var prefs = getParentPrefs();
  $telegramUrl.value = prefs.telegramUrl || '';

  renderParentDashboard();
}

function closeParentDashboard() {
  state.screen = 'profiles';
  $screenParent.classList.remove('active');
  $screenProfiles.classList.add('active');
  setActiveScreenAccessibility($screenProfiles);
  $ambientCanvas.classList.remove('hidden');
}

$parentBack.addEventListener('click', closeParentDashboard);

// --- Developer Dashboard ---

function openDevDashboard() {
  state.screen = 'dev';
  $screenProfiles.classList.remove('active');
  $screenCanvas.classList.remove('active');
  $screenParent.classList.remove('active');
  $screenDev.classList.add('active');
  setActiveScreenAccessibility($screenDev);
  $ambientCanvas.classList.add('hidden');
  renderDevDashboard();
}

function closeDevDashboard() {
  state.screen = 'profiles';
  $screenDev.classList.remove('active');
  $screenCanvas.classList.remove('active');
  $screenParent.classList.remove('active');
  $screenProfiles.classList.add('active');
  setActiveScreenAccessibility($screenProfiles);
  $ambientCanvas.classList.remove('hidden');
}

function renderDevDashboard() {
  renderDevProfiles();
  renderDevControls();
  renderDevEvents();
}

function escapeHTML(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function devStat(value, label) {
  return '<div class="dev-stat">' +
    '<span class="dev-stat-value">' + escapeHTML(value) + '</span>' +
    '<span class="dev-stat-label">' + escapeHTML(label) + '</span>' +
  '</div>';
}

function getSoundLabel(soundId) {
  if (!soundId) return 'None';
  if (soundId === 'off') return 'Stopped';
  var sound = SOUNDS.find(function(item) { return item.id === soundId; });
  return sound ? sound.name : soundId;
}

function getValidProfiles() {
  var profiles = Array.isArray(state.profiles) ? state.profiles : [];
  return profiles.filter(function(profile) {
    return profile && typeof profile === 'object';
  });
}

function renderDevProfiles() {
  $devProfiles.textContent = '';
  var profiles = getValidProfiles();

  if (profiles.length === 0) {
    $devProfiles.innerHTML = '<div class="parent-no-data">No profiles yet. Create a kid profile to see preference signals.</div>';
    return;
  }

  profiles.forEach(function(profile) {
    var summary = computeSignalSummary(profile.id);
    var topMode = summary.topMode ? (MODE_LABELS[summary.topMode] || summary.topMode) : 'No mode time yet';
    var topModeTime = summary.topModeSeconds ? formatDuration(summary.topModeSeconds) : '0s';
    var soundUse = summary.topSound ? getSoundLabel(summary.topSound) + ' (' + summary.soundCounts[summary.topSound] + ')' : 'No sound use yet';
    var mt = getMusicTrack(summary.topMusic);
    var musicName = summary.topMusic === 'off' ? 'Stopped' : (mt ? mt.name : summary.topMusic);
    var musicUse = summary.topMusic ? musicName + ' (' + summary.musicCounts[summary.topMusic] + ')' : 'No music use yet';

    var card = document.createElement('div');
    card.className = 'dev-profile-card';
    card.innerHTML = '<h4>' + escapeHTML(profile.name || 'Unnamed profile') + '</h4>' +
      '<div class="dev-stat-grid">' +
        devStat(summary.sessions, 'Sessions') +
        devStat(formatDuration(summary.averageSessionSeconds), 'Avg Session') +
        devStat(topMode, 'Top Mode') +
        devStat(topModeTime, 'Top Mode Time') +
        devStat(soundUse, 'Sound Use') +
        devStat(musicUse, 'Top Music') +
        devStat(summary.promptOpened, 'Prompt Opens') +
      '</div>';
    $devProfiles.appendChild(card);
  });
}

function renderDevControls() {
  $devControls.textContent = '';
  var profiles = getValidProfiles();

  if (profiles.length === 0) {
    $devControls.innerHTML = '<div class="parent-no-data">No profiles available for developer controls.</div>';
    return;
  }

  profiles.forEach(function(profile) {
    var control = getProfileDevControl(profile.id);
    var promptEnabled = control.promptEnabled === false ? 'false' : 'true';
    var promptDelaySeconds = Number(control.promptDelaySeconds);
    var promptDelayValue = Number.isFinite(promptDelaySeconds) && promptDelaySeconds > 0 ? String(promptDelaySeconds) : '';
    var experimentLabel = control.experimentLabel || '';
    var options = '<option value="">App default</option>' + MODES.map(function(mode) {
      var selected = control.defaultMode === mode ? ' selected' : '';
      return '<option value="' + escapeHTML(mode) + '"' + selected + '>' +
        escapeHTML(MODE_LABELS[mode] || mode) +
      '</option>';
    }).join('');
    var entrainRates = ['', 'theta', 'alpha', 'gamma40'];
    var entrainOptions = entrainRates.map(function(rate) {
      var selected = (control.entrainmentRate || '') === rate ? ' selected' : '';
      var label = rate === '' ? 'Off'
        : rate === 'theta' ? 'Theta ~6 Hz'
        : rate === 'alpha' ? 'Alpha ~10 Hz'
        : 'Gamma 40 Hz';
      return '<option value="' + rate + '"' + selected + '>' + label + '</option>';
    }).join('');

    var card = document.createElement('div');
    card.className = 'dev-control-card';
    card.dataset.profileId = profile.id;
    card.innerHTML = '<h4>' + escapeHTML(profile.name || 'Unnamed profile') + '</h4>' +
      '<label>Default Mode' +
        '<select data-dev-control="defaultMode">' + options + '</select>' +
      '</label>' +
      '<label>Prompt Delay Seconds' +
        '<input data-dev-control="promptDelaySeconds" inputmode="numeric" type="number" min="1" max="600" step="1" value="' + escapeHTML(promptDelayValue) + '">' +
      '</label>' +
      '<label>Prompt Enabled' +
        '<select data-dev-control="promptEnabled">' +
          '<option value="true"' + (promptEnabled === 'true' ? ' selected' : '') + '>Enabled</option>' +
          '<option value="false"' + (promptEnabled === 'false' ? ' selected' : '') + '>Disabled</option>' +
        '</select>' +
      '</label>' +
      '<label>Experiment Label' +
        '<input data-dev-control="experimentLabel" type="text" maxlength="80" value="' + escapeHTML(experimentLabel) + '">' +
      '</label>' +
      '<label>Entrainment (experiment)' +
        '<select data-dev-control="entrainmentRate">' + entrainOptions + '</select>' +
      '</label>' +
      '<label>SFX accents (experiment)' +
        '<input data-dev-control="sfxEnabled" type="checkbox"' + (control.sfxEnabled ? ' checked' : '') + '>' +
      '</label>';
    $devControls.appendChild(card);
  });
}

function renderDevEvents() {
  $devEvents.textContent = '';
  var profiles = getValidProfiles();
  var events = [];

  profiles.forEach(function(profile) {
    readSignals(profile.id).forEach(function(event) {
      if (!event || typeof event !== 'object') return;
      events.push({ profile: profile, event: event });
    });
  });

  events.sort(function(a, b) {
    return new Date(b.event.ts).getTime() - new Date(a.event.ts).getTime();
  });

  if (events.length === 0) {
    $devEvents.innerHTML = '<div class="parent-no-data">No preference signal events recorded yet.</div>';
    return;
  }

  events.slice(0, 50).forEach(function(entry) {
    var payloadText = '';
    try {
      payloadText = JSON.stringify(entry.event.payload || {});
    } catch (e) {
      payloadText = '{}';
    }

    var row = document.createElement('div');
    row.className = 'dev-event-row';
    row.innerHTML = '<span>' + escapeHTML(formatSessionDate(entry.event.ts)) + '</span>' +
      '<span class="dev-event-type">' + escapeHTML(entry.event.type || 'unknown') + '</span>' +
      '<span>' + escapeHTML(entry.profile.name || 'Unnamed profile') + ': ' + escapeHTML(payloadText) + '</span>';
    $devEvents.appendChild(row);
  });
}

function exportSignalData() {
  var profiles = Array.isArray(state.profiles) ? state.profiles : [];
  return {
    exportedAt: new Date().toISOString(),
    profiles: profiles.filter(Boolean).map(function(profile) {
      return {
        id: profile.id,
        name: profile.name,
        theme: profile.theme,
        summary: computeSignalSummary(profile.id),
        events: readSignals(profile.id),
      };
    }),
  };
}

function saveControlsFromUI() {
  var controls = {};
  Array.prototype.forEach.call($devControls.querySelectorAll('.dev-control-card'), function(card) {
    var profileId = card.dataset.profileId;
    if (!profileId) return;
    var defaultMode = card.querySelector('[data-dev-control="defaultMode"]').value;
    var delayInput = card.querySelector('[data-dev-control="promptDelaySeconds"]').value;
    var promptEnabled = card.querySelector('[data-dev-control="promptEnabled"]').value;
    var experimentLabel = card.querySelector('[data-dev-control="experimentLabel"]').value.trim();
    var entrainmentRate = card.querySelector('[data-dev-control="entrainmentRate"]').value;
    var sfxEnabled = card.querySelector('[data-dev-control="sfxEnabled"]').checked;
    var profileControl = {};
    var delaySeconds = Number(delayInput);

    if (MODES.indexOf(defaultMode) >= 0) profileControl.defaultMode = defaultMode;
    if (Number.isFinite(delaySeconds) && delaySeconds > 0 && delaySeconds <= 600) {
      profileControl.promptDelaySeconds = Math.round(delaySeconds);
    }
    profileControl.promptEnabled = promptEnabled !== 'false';
    if (experimentLabel) profileControl.experimentLabel = experimentLabel;
    if (ENTRAINMENT_RATES[entrainmentRate]) profileControl.entrainmentRate = entrainmentRate;
    if (sfxEnabled) profileControl.sfxEnabled = true;
    controls[profileId] = profileControl;
  });
  saveDevControls(controls);
  return controls;
}

if (typeof window !== 'undefined') {
  window.CalmStationDev = {
    exportSignals: exportSignalData,
    recordTestEvent: function(profileId, type, payload) {
      recordSignalForProfile(profileId, type, payload);
    },
    resetSignals: function() {
      var profiles = Array.isArray(state.profiles) ? state.profiles : [];
      profiles.forEach(function(profile) {
        if (profile) localStorage.removeItem(getSignalKey(profile.id));
      });
    },
  };
}

$devBack.addEventListener('click', closeDevDashboard);
$devSaveControls.addEventListener('click', function() {
  saveControlsFromUI();
  renderDevDashboard();
  $devStatus.textContent = 'Developer controls saved.';
});
$devExport.addEventListener('click', function() {
  $devStatus.textContent = JSON.stringify(exportSignalData(), null, 2);
});
$devReset.addEventListener('click', function() {
  window.CalmStationDev.resetSignals();
  renderDevDashboard();
  $devStatus.textContent = 'Preference signals reset.';
});

function getProfileSessions(profileId) {
  try {
    var key = 'calm-station-' + profileId + '-sessions';
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function renderParentDashboard() {
  $parentProfiles.textContent = '';

  if (state.profiles.length === 0) {
    var noData = document.createElement('div');
    noData.className = 'parent-no-data';
    noData.textContent = 'No profiles created yet.';
    $parentProfiles.appendChild(noData);
    return;
  }

  state.profiles.forEach(function(profile) {
    if (!profile) return;
    var card = document.createElement('div');
    card.className = 'parent-kid-card';

    var theme = THEMES[profile.theme] || THEMES.ocean;
    var sessions = getProfileSessions(profile.id);

    // Header
    var header = document.createElement('div');
    header.className = 'parent-kid-header';

    var iconEl = document.createElement('div');
    iconEl.className = 'parent-kid-icon';
    iconEl.innerHTML = getIconSVG(profile.icon, theme.accent, 32);
    header.appendChild(iconEl);

    var nameWrap = document.createElement('div');
    var nameEl = document.createElement('div');
    nameEl.className = 'parent-kid-name';
    nameEl.textContent = profile.name;
    nameWrap.appendChild(nameEl);

    var themeEl = document.createElement('div');
    themeEl.className = 'parent-kid-theme';
    themeEl.textContent = theme.name + ' theme';
    nameWrap.appendChild(themeEl);
    header.appendChild(nameWrap);
    card.appendChild(header);

    // Stats grid
    var statGrid = document.createElement('div');
    statGrid.className = 'parent-stat-grid';

    var breatheCount = sessions.filter(function(s) { return s.exerciseType === 'breathe'; }).length;
    var groundCount = sessions.filter(function(s) { return s.exerciseType === 'ground'; }).length;

    var lastSessionDate = sessions.length > 0 ? sessions[sessions.length - 1].date : null;
    var lastActive = lastSessionDate ? formatRelativeDate(lastSessionDate) : 'Never';

    addStat(statGrid, sessions.length, 'Total Sessions');
    addStat(statGrid, breatheCount, 'Breathing');
    addStat(statGrid, groundCount, 'Grounding');
    addStat(statGrid, lastActive, 'Last Active');

    card.appendChild(statGrid);

    // Session list (last 10)
    if (sessions.length > 0) {
      var listLabel = document.createElement('h3');
      listLabel.style.fontSize = '0.6875rem';
      listLabel.style.fontWeight = '600';
      listLabel.style.color = '#5a7a8a';
      listLabel.style.textTransform = 'uppercase';
      listLabel.style.letterSpacing = '0.08em';
      listLabel.style.marginBottom = '8px';
      listLabel.textContent = 'Recent Sessions';
      card.appendChild(listLabel);

      var list = document.createElement('div');
      list.className = 'parent-session-list';

      var recent = sessions.slice(-10).reverse();
      recent.forEach(function(s) {
        var row = document.createElement('div');
        row.className = 'parent-session-row';

        var dateEl = document.createElement('span');
        dateEl.className = 'parent-session-date';
        dateEl.textContent = formatSessionDate(s.date);
        row.appendChild(dateEl);

        var typeEl = document.createElement('span');
        typeEl.className = 'parent-session-type';
        typeEl.textContent = s.exerciseType || '—';
        row.appendChild(typeEl);

        if (s.energyBefore !== undefined && s.energyBefore !== null) {
          var energyEl = document.createElement('span');
          energyEl.className = 'parent-session-energy';

          var beforeLevel = ENERGY_LEVELS.find(function(l) { return l.value === s.energyBefore; });
          var afterLevel = ENERGY_LEVELS.find(function(l) { return l.value === s.energyAfter; });

          var bDot = document.createElement('span');
          bDot.className = 'parent-session-dot';
          bDot.style.background = beforeLevel ? beforeLevel.color : '#888';
          energyEl.appendChild(bDot);

          var bLabel = document.createTextNode((beforeLevel ? beforeLevel.label : '?'));
          energyEl.appendChild(bLabel);

          var arrow = document.createTextNode(' → ');
          energyEl.appendChild(arrow);

          var aDot = document.createElement('span');
          aDot.className = 'parent-session-dot';
          aDot.style.background = afterLevel ? afterLevel.color : '#888';
          energyEl.appendChild(aDot);

          var aLabel = document.createTextNode((afterLevel ? afterLevel.label : '?'));
          energyEl.appendChild(aLabel);

          row.appendChild(energyEl);
        }

        list.appendChild(row);
      });

      card.appendChild(list);
    } else {
      var noSessions = document.createElement('div');
      noSessions.className = 'parent-no-data';
      noSessions.textContent = 'No exercise sessions yet.';
      card.appendChild(noSessions);
    }

    $parentProfiles.appendChild(card);
  });
}

function addStat(container, value, label) {
  var stat = document.createElement('div');
  stat.className = 'parent-stat';

  var valEl = document.createElement('div');
  valEl.className = 'parent-stat-value';
  valEl.textContent = value;
  stat.appendChild(valEl);

  var labEl = document.createElement('div');
  labEl.className = 'parent-stat-label';
  labEl.textContent = label;
  stat.appendChild(labEl);

  container.appendChild(stat);
}

function formatSessionDate(isoDate) {
  try {
    var d = new Date(isoDate);
    var month = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    var time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return month + ', ' + time;
  } catch (e) {
    return isoDate;
  }
}

function formatRelativeDate(isoDate) {
  try {
    var d = new Date(isoDate);
    var now = new Date();
    var diff = now - d;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + 'd ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '—';
  }
}

// --- Telegram Webhook Notification ---

$telegramSave.addEventListener('click', function() {
  var url = $telegramUrl.value.trim();
  var prefs = getParentPrefs();
  prefs.telegramUrl = url;
  saveParentPrefs(prefs);
  $telegramStatus.textContent = url ? 'Saved.' : 'Cleared.';
  $telegramStatus.style.color = '#48b5a0';
  setTimeout(function() { $telegramStatus.textContent = ''; }, 3000);
});

$telegramTest.addEventListener('click', function() {
  sendTelegramNotification('Test notification from Calm Station!', function(ok) {
    if (ok) {
      $telegramStatus.textContent = 'Test sent successfully!';
      $telegramStatus.style.color = '#48b5a0';
    } else {
      $telegramStatus.textContent = 'Failed to send. Check the URL.';
      $telegramStatus.style.color = '#d64550';
    }
    setTimeout(function() { $telegramStatus.textContent = ''; }, 5000);
  });
});

function sendTelegramNotification(message, callback) {
  var prefs = getParentPrefs();
  var url = prefs.telegramUrl;
  if (!url) {
    if (callback) callback(false);
    return;
  }

  // The URL should be a full Telegram Bot API sendMessage endpoint
  // e.g. https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<ID>
  // We append the text parameter
  var separator = url.includes('?') ? '&' : '?';
  var fullUrl = url + separator + 'text=' + encodeURIComponent(message);

  fetch(fullUrl, { method: 'GET', mode: 'no-cors' })
    .then(function() {
      if (callback) callback(true);
    })
    .catch(function() {
      if (callback) callback(false);
    });
}

// Called after exercise session is logged
function notifyParentOnExercise(profileName, exerciseType) {
  var msg = 'Calm Station: ' + profileName + ' completed a ' + exerciseType + ' exercise.';
  sendTelegramNotification(msg);
}

// --- Splash Screen ---

function dismissSplash() {
  var splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('hidden');
  setTimeout(function() {
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  }, 700);
}

// --- Web Audio Error Handling ---

function checkWebAudioSupport() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    // Hide sound button if Web Audio not supported
    var btnSound = document.getElementById('btn-sound');
    if (btnSound) btnSound.style.display = 'none';
  }
}

// --- Init ---

document.addEventListener('DOMContentLoaded', function() {
  loadProfiles();
  renderProfileCards();
  initAmbient();
  checkParentUrlParam();
  checkWebAudioSupport();

  // Dismiss splash after content is ready
  requestAnimationFrame(function() {
    setTimeout(dismissSplash, 400);
  });
});
