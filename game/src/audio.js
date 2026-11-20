// Solmar Heat — procedural WebAudio only: no audio files, no network. The
// engine hums with speed, sirens wail two tones, gunshots crack, pickups
// chime, rain hisses. Everything is oscillators and filtered noise.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.rainSrc = null;
    this.rainGain = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    // engine: a low sawtooth through a lowpass, pitch follows speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // siren: a sine that alternates two tones
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** Flip mute and return the new state. */
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setEngine(speed01) {
    if (!this.ctx || !this.engineOsc) return;
    this.engineOsc.frequency.value = 50 + speed01 * 140;
    this.engineGain.gain.value = speed01 > 0.02 ? 0.05 + speed01 * 0.06 : 0;
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenOsc) return;
    this.sirenGain.gain.value = on ? 0.045 : 0;
  }

  update(dt) {
    if (!this.ctx || !this.sirenOsc) return;
    if (this.sirenGain.gain.value > 0) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.value = this.sirenHigh ? 720 : 960;
      }
    }
  }

  _burst(duration, filterFreq, gain, type) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(this.ctx.currentTime + duration);
  }

  gunshot() {
    this._burst(0.18, 900, 0.5);
    this._burst(0.08, 3200, 0.25, 'highpass');
  }

  punch() {
    this._burst(0.09, 500, 0.3);
  }

  crash() {
    this._burst(0.35, 300, 0.55);
  }

  chime() {
    if (!this.ctx) return;
    for (const [freq, when] of [[660, 0], [880, 0.09], [1320, 0.18]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.16, this.ctx.currentTime + when);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + when + 0.25);
      osc.connect(g);
      g.connect(this.master);
      osc.start(this.ctx.currentTime + when);
      osc.stop(this.ctx.currentTime + when + 0.3);
    }
  }

  click() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 880;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.07);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  setRain(on) {
    if (!this.ctx) return;
    if (on && !this.rainSrc) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 0.4;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.035;
      src.connect(filter);
      filter.connect(this.rainGain);
      this.rainGain.connect(this.master);
      src.start();
      this.rainSrc = src;
    } else if (!on && this.rainSrc) {
      try { this.rainSrc.stop(); } catch { /* already stopped */ }
      this.rainSrc = null;
      this.rainGain = null;
    }
  }
}
