# Calm Station — Technical Specification

## App State Management

The app uses a simple vanilla JS state object with a central render function.

```javascript
const state = {
  phase: 'check-in',       // 'check-in' | 'breathe' | 'ground' | 'reflect'
  energyBefore: null,       // 1-5
  energyAfter: null,        // 1-5
  
  // Breathing
  breathPattern: 0,         // index into patterns array
  breathState: 'idle',      // 'idle' | 'inhale' | 'hold' | 'exhale' | 'hold2' | 'done'
  breathCycle: 0,
  breathLabel: '',
  
  // Grounding
  groundStep: 0,            // 0-4 (which sense)
  groundChecked: [],        // indices of tapped circles
  
  // Completion
  showComplete: false,
  
  // Preferences (loaded from localStorage)
  prefs: {
    visual: 'particles',    // 'particles' | 'waves' | 'aurora' | 'stars' | 'none'
    sound: 'none',          // 'rain' | 'whitenoise' | 'ocean' | 'drone' | 'none'
    volume: 0.5,
  },
  
  // UI
  showSettings: false,
  sessionCount: 0,
  musicPlaying: false,
};
```

### Render Pattern
```javascript
function render() {
  // Hide all phase containers
  // Show the active phase
  // Update nav dots
  // Update dynamic content in active phase
}

function setState(updates) {
  Object.assign(state, updates);
  render();
}
```

Keep it simple. No virtual DOM, no diffing. Each phase has its own container div that gets shown/hidden. Dynamic content within phases is updated directly via `textContent`, `classList`, and `style` changes.

## Procedural Audio — Implementation Guide

### Architecture
```
AudioContext
├── masterGain (volume control)
│   ├── Rain generator
│   ├── White noise generator
│   ├── Ocean generator
│   └── Drone generator
```

### Rain Sound
```javascript
// Concept: filtered noise + low rumble
// 1. Create noise buffer (white noise)
// 2. Bandpass filter at ~1000-3000Hz for rain texture
// 3. Add low-frequency rumble (oscillator at ~80Hz, very low gain)
// 4. Modulate amplitude slightly for variation (slow LFO)

function createRain(ctx, dest) {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 0.5;
  
  const gain = ctx.createGain();
  gain.gain.value = 0.3;
  
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  noise.start();
  
  return { stop: () => noise.stop(), gain };
}
```

### White Noise
```javascript
// Simple filtered noise buffer — slightly warmer than pure white
// Lowpass at ~8000Hz to soften it
```

### Ocean Waves
```javascript
// Noise buffer with amplitude modulated by a very slow sine LFO
// LFO frequency: ~0.08Hz (one wave cycle every ~12 seconds)
// Bandpass filter around 500-2000Hz
// Add a second layer: very low filtered noise for deep water rumble
```

### Deep Hum/Drone
```javascript
// Base: sine oscillator at ~65Hz (C2)
// Add harmonic: sine at ~130Hz (octave up) at 30% volume
// Add sub-harmonic: sine at ~32.5Hz at 20% volume  
// Very slow pitch wobble: LFO at 0.05Hz modulating +/-2Hz
// Optional: filtered noise layer for texture, very quiet
```

### Audio Crossfade
When switching sounds, fade out current over 500ms, fade in new over 500ms. Never hard-cut — it's jarring.

```javascript
function crossfadeTo(newSound) {
  if (currentSound) {
    currentSound.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    setTimeout(() => currentSound.stop(), 600);
  }
  const next = generators[newSound](ctx, masterGain);
  next.gain.gain.setValueAtTime(0, ctx.currentTime);
  next.gain.gain.linearRampToValueAtTime(state.prefs.volume, ctx.currentTime + 0.5);
  currentSound = next;
}
```

## Canvas Visuals — Implementation Guide

### Architecture
- Single `<canvas>` element, positioned fixed, full viewport, z-index 0
- App content sits on top with z-index 1
- One `requestAnimationFrame` loop drives whichever visual is active
- Visual functions receive canvas context + time delta

### Particles
```javascript
// 40-60 particles
// Each: { x, y, radius(1-3px), opacity(0.1-0.4), vx, vy }
// Velocity: very slow (0.1-0.3 px/frame)
// Color: teal at varying opacity
// Wrap around edges
// Optional: subtle parallax (particles at different "depths" move at different speeds)
```

### Waves
```javascript
// 3-4 overlapping sine waves
// Each at different frequency, amplitude, phase offset
// Draw as filled paths from bottom
// Colors: variations of deep navy/teal at low opacity
// Animate by incrementing phase offset each frame
// Speed: very slow (phase += 0.002 per frame)
```

### Aurora
```javascript
// 3-5 gradient bands
// Each band: horizontal bezier curve across screen
// Colors shift slowly through teal/blue/green palette
// Bands drift vertically with sine motion
// Use globalAlpha for transparency layering
// Gaussian blur effect via multiple overlapping draws
```

### Starfield
```javascript
// 80-120 stars
// Each: { x, y, brightness(0.1-0.8), twinkleSpeed, twinklePhase }
// Slow drift in one direction (simulates movement)
// Twinkle: brightness oscillates with sin(time * twinkleSpeed + phase)
// A few "brighter" stars (radius 2px instead of 1px)
// Very dark background — canvas clearColor matches --bg-deep
```

### Performance
- Use `requestAnimationFrame` (not `setInterval`)
- Skip frames if delta > 32ms (keep minimum 30fps)
- Pause entirely when `document.hidden === true`
- Particle/star counts: start conservative, profile on actual tablet

## localStorage Schema

```javascript
// Preferences
localStorage.setItem('calm-station-prefs', JSON.stringify({
  visual: 'particles',
  sound: 'none',
  volume: 0.5,
}));

// Session log
localStorage.setItem('calm-station-sessions', JSON.stringify([
  { date: '2026-02-25T14:30:00Z', before: 5, after: 3 },
  { date: '2026-02-24T09:15:00Z', before: 4, after: 3 },
]));

// Session count
localStorage.setItem('calm-station-session-count', '12');
```

## Breathing Timer Logic (from prototype)

The prototype uses a chain of `setTimeout` calls per cycle. This pattern works well — port it directly:

```javascript
function runBreathCycle(cycle) {
  if (cycle >= totalCycles) { /* done state */ return; }
  
  const phases = [];
  phases.push({ label: 'Breathe in', duration: pattern.inhale, state: 'inhale' });
  if (pattern.hold1 > 0) phases.push({ label: 'Hold', duration: pattern.hold1, state: 'hold' });
  phases.push({ label: 'Breathe out', duration: pattern.exhale, state: 'exhale' });
  if (pattern.hold2 > 0) phases.push({ label: 'Hold', duration: pattern.hold2, state: 'hold2' });
  
  let delay = 0;
  phases.forEach(ph => {
    setTimeout(() => {
      setState({ breathState: ph.state, breathLabel: ph.label });
      // Drive circle scale via CSS transition matching ph.duration
    }, delay);
    delay += ph.duration * 1000;
  });
  setTimeout(() => runBreathCycle(cycle + 1), delay);
}
```

The breathing circle uses CSS `transition: transform Xs linear` where X is the phase duration. JS sets the target scale, CSS handles the smooth animation. This is more reliable than JS-driven animation for this use case.

## Mobile / Touch Considerations

- All interactive elements: minimum 48x48px touch target
- Use `touchstart` for immediate feedback (no 300ms delay)
- Prevent double-tap zoom on buttons: `touch-action: manipulation`
- Prevent pull-to-refresh: `overscroll-behavior: none` on body
- Safe area padding for notched devices: `env(safe-area-inset-bottom)`
- Test on iOS Safari specifically — it has unique AudioContext restrictions
  - AudioContext must be created/resumed inside a user gesture handler
  - `audioContext.resume()` on first tap
