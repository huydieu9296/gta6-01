// Procedural WebAudio sound for Solmar Heat — no audio files, everything synthesised.
// All calls are safe when audio is unavailable (headless): failures are swallowed.
export function createAudio() {
  let ctx = null, master = null, engineOsc = null, engineOsc2 = null, engineGain = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = 0, rainSrc = null, rainGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 28;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(lp); engineOsc2.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start(); engineOsc2.start();
      // Siren: alternating two-tone.
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch { ctx = null; return false; }
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  function noiseBuffer(dur) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function blip(freq, dur, vol, type = 'sine', when = 0) {
    if (!ensure()) return;
    try {
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* silent */ }
  }

  return {
    unlock() { if (ensure()) resume(); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    setEngine(speed01, on) {
      if (!ensure()) return;
      try {
        const f = 50 + speed01 * 160;
        engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
        engineOsc2.frequency.setTargetAtTime(f * 0.5, ctx.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.05 : 0, ctx.currentTime, 0.1);
      } catch { /* silent */ }
    },
    setSiren(on, dt) {
      if (!ensure()) return;
      try {
        if (on) {
          sirenTimer += dt;
          const hi = Math.floor(sirenTimer * 2.2) % 2 === 0;
          sirenOsc.frequency.setTargetAtTime(hi ? 950 : 700, ctx.currentTime, 0.05);
          sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
        } else {
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        }
      } catch { /* silent */ }
    },
    gunshot() {
      if (!ensure()) return;
      try {
        const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.18);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        src.connect(lp); lp.connect(g); g.connect(master); src.start();
        blip(90, 0.12, 0.4, 'sine');
      } catch { /* silent */ }
    },
    pickup() { blip(660, 0.09, 0.25); blip(990, 0.12, 0.25, 'sine', 0.08); },
    crash() {
      if (!ensure()) return;
      try {
        const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.25);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.4, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        src.connect(lp); lp.connect(g); g.connect(master); src.start();
      } catch { /* silent */ }
    },
    click() { blip(440, 0.05, 0.15, 'square'); },
    missionOk() { blip(523, 0.12, 0.25); blip(659, 0.12, 0.25, 'sine', 0.1); blip(784, 0.2, 0.25, 'sine', 0.2); },
    missionFail() { blip(330, 0.15, 0.25, 'sawtooth'); blip(220, 0.25, 0.25, 'sawtooth', 0.12); },
    setRain(on) {
      if (!ensure()) return;
      try {
        if (on && !rainSrc) {
          rainSrc = ctx.createBufferSource(); rainSrc.buffer = noiseBuffer(2); rainSrc.loop = true;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
          rainGain = ctx.createGain(); rainGain.gain.value = 0.05;
          rainSrc.connect(lp); lp.connect(rainGain); rainGain.connect(master); rainSrc.start();
        } else if (!on && rainSrc) {
          rainSrc.stop(); rainSrc = null; rainGain = null;
        }
      } catch { /* silent */ }
    },
  };
}
