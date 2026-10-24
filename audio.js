(() => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    window.EMAudio = {
      supported: false,
      demos: [],
      getDemoForEntry: () => null,
      onState: () => () => {},
      playDemo: () => false,
      playFingerprint: () => false,
      setFingerprintLayers: () => [],
      getFingerprint: () => null,
      stop: () => {},
      toggleMute: () => false,
      setVolume: () => {},
      getState: () => ({ supported: false, playing: false }),
      startLab: () => false,
      setLabGroups: () => {},
      playStructure: () => false,
      playMetronome: () => false,
      structureSections: [],
      startStudio: () => false,
      updateStudio: () => {},
      stopStudio: () => {},
      setChainOrder: () => false,
      auditionTrack: () => false,
      getStudioPlayhead: () => null,
      getPlayhead: () => null,
      previewStudio: () => false,
    };
    return;
  }

  const midi = (note) => 440 * 2 ** ((note - 69) / 12);
  const CHORDS = {
    Fm: [53, 56, 60],
    Ab: [56, 60, 63],
    Eb: [51, 55, 58],
    Bb: [58, 62, 65],
    Cm: [48, 51, 55],
    Gm: [55, 58, 62],
    Dm: [50, 53, 57],
  };
  const STRUCTURE_SECTIONS = ['Intro', 'Breakdown', 'Build-up', 'Drop', 'Breakdown 2', 'Build-up 2', 'Drop 2', 'Outro'];

  const engine = {
    ctx: null,
    studioFx: null,
    master: null,
    compressor: null,
    output: null,
    reverb: null,
    reverbInput: null,
    noise: null,
    session: null,
    fingerprint: null,
    fpMute: new Set(),
    volume: 0.72,
    muted: false,
    listeners: new Set(),
    labGroups: {
      drums: true,
      bass: true,
      chords: true,
      vocal: false,
      lead: true,
      ambient: true,
      fx: false,
    },
    structureSections: STRUCTURE_SECTIONS,
    drumPattern: {
      kick: [true, false, false, false, true, false, false, false],
      snare: [false, false, true, false, false, false, true, false],
      hat: [true, true, true, true, true, true, true, true],
    },
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ensure() {
    if (engine.ctx) {
      if (engine.ctx.state === 'suspended') engine.ctx.resume();
      return engine.ctx;
    }
    const ctx = new AudioCtx();
    engine.ctx = ctx;

    engine.master = ctx.createGain();
    engine.master.gain.value = 0.82;

    engine.compressor = ctx.createDynamicsCompressor();
    engine.compressor.threshold.value = -18;
    engine.compressor.knee.value = 16;
    engine.compressor.ratio.value = 4;
    engine.compressor.attack.value = 0.004;
    engine.compressor.release.value = 0.22;

    engine.output = ctx.createGain();
    engine.output.gain.value = engine.muted ? 0 : engine.volume;
    engine.compressor.connect(engine.output);
    engine.master.connect(engine.compressor);

    // Tap the master bus so the interface can show real levels instead of faked meters.
    engine.analyser = ctx.createAnalyser();
    engine.analyser.fftSize = 64;
    engine.analyser.smoothingTimeConstant = 0.72;
    engine.levelData = new Uint8Array(engine.analyser.frequencyBinCount);
    engine.output.connect(engine.analyser);
    engine.analyser.connect(ctx.destination);

    engine.reverb = ctx.createConvolver();
    engine.reverb.buffer = makeImpulse(ctx, 2.4, 2.6);
    engine.reverbInput = ctx.createGain();
    engine.reverbInput.gain.value = 1;
    const reverbLevel = ctx.createGain();
    reverbLevel.gain.value = 0.32;
    engine.reverbInput.connect(engine.reverb);
    engine.reverb.connect(reverbLevel);
    reverbLevel.connect(engine.compressor);

    const length = Math.floor(ctx.sampleRate * 1.2);
    engine.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = engine.noise.getChannelData(0);
    for (let index = 0; index < length; index += 1) channel[index] = Math.random() * 2 - 1;

    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function makeImpulse(ctx, seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** decay;
      }
    }
    return buffer;
  }

  function distortionCurve(amount = 20) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const k = amount;
    for (let index = 0; index < samples; index += 1) {
      const x = (index * 2) / samples - 1;
      curve[index] = ((3 + k) * x * 20 * Math.PI) / 180 / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function notify() {
    const snapshot = getState();
    for (const listener of engine.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error(error);
      }
    }
  }

  class Session {
    constructor({ bpm, bars = 2, stepsPerBar = 16, loop = true, label, demoId, pattern, onComplete }) {
      const ctx = ensure();
      this.ctx = ctx;
      this.bpm = bpm;
      this.bars = bars;
      this.stepsPerBar = stepsPerBar;
      this.loop = loop;
      this.label = label;
      this.demoId = demoId;
      this.pattern = pattern;
      this.onComplete = onComplete;
      this.stepDuration = 60 / bpm / (stepsPerBar / 4);
      this.totalSteps = bars * stepsPerBar;
      this.step = 0;
      // Monotonic counters. `step` wraps at totalSteps so a 4-bar loop always
      // reports bar 0..3, which is what the grid needs. But the arrangement in
      // the song module runs far longer than 4 bars, so the gate has to know
      // which bar of the *whole song* is playing. `loops` never resets, so
      // absBar = loops * bars + bar gives a position that keeps counting up.
      this.loops = 0;
      this.absStep = 0;
      this.startTime = ctx.currentTime + 0.1;
      this.nextTime = this.startTime;
      this.running = true;
      this.stopped = false;
      this.active = new Set();

      this.gain = ctx.createGain();
      this.gain.gain.value = 0.92;
      this.gain.connect(engine.master);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.28;
      this.reverbSend.connect(engine.reverbInput);

      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
      if (!loop) {
        const wait = (this.startTime - ctx.currentTime + this.totalSteps * this.stepDuration + 0.45) * 1000;
        this.endTimer = setTimeout(() => this.stop('complete'), Math.max(100, wait));
      }
      engine.session = this;
      notify();
    }

    tick() {
      if (!this.running) return;
      while (this.nextTime < this.ctx.currentTime + 0.12) {
        const step = this.step % this.stepsPerBar;
        const bar = Math.floor(this.step / this.stepsPerBar);
        // Absolute position across the whole performance, not just this loop.
        // The song gate reads this so the arrangement follows the audio clock
        // instead of the UI frame rate.
        const absBar = this.loops * this.bars + bar;
        try {
          this.pattern({ session: this, time: this.nextTime, step, bar, globalStep: this.step, absBar });
        } catch (error) {
          console.error('Audio pattern error', error);
        }
        this.nextTime += this.stepDuration;
        this.step += 1;
        this.absStep += 1;
        if (!this.loop) {
          if (this.step >= this.totalSteps) {
            this.running = false;
            clearInterval(this.timer);
            break;
          }
        } else if (this.step >= this.totalSteps) {
          this.step = 0;
          this.loops += 1;
        }
      }
    }

    route(node, reverb = 0) {
      node.connect(this.gain);
      const extra = [];
      if (reverb > 0) {
        const send = this.ctx.createGain();
        send.gain.value = reverb;
        node.connect(send);
        send.connect(this.reverbSend);
        extra.push(send);
      }
      return extra;
    }

    track(source, nodes) {
      this.active.add(source);
      source.onended = () => {
        this.active.delete(source);
        for (const node of nodes) {
          try {
            node.disconnect();
          } catch {
            // Already disconnected.
          }
        }
      };
    }

    stop(reason = 'stop') {
      if (this.stopped) return;
      this.stopped = true;
      this.running = false;
      clearInterval(this.timer);
      clearTimeout(this.endTimer);
      const now = this.ctx.currentTime;
      try {
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setTargetAtTime(0.0001, now, 0.02);
      } catch {
        // Ignore if the context is closed.
      }
      for (const source of this.active) {
        try {
          source.stop(now + 0.02);
        } catch {
          // Already stopped.
        }
      }
      setTimeout(() => {
        try {
          this.gain.disconnect();
          this.reverbSend.disconnect();
        } catch {
          // Ignore.
        }
        if (engine.session === this) engine.session = null;
        notify();
        if (this.onComplete) this.onComplete(reason);
      }, 130);
    }

    info() {
      const elapsed = Math.max(0, this.ctx.currentTime - this.startTime);
      const duration = this.totalSteps * this.stepDuration;
      return {
        bpm: this.bpm,
        bars: this.bars,
        loop: this.loop,
        label: this.label,
        demoId: this.demoId,
        elapsed,
        duration,
        progress: clamp(elapsed / duration, 0, 1),
        section: this.demoId === 'structure' ? Math.min(7, Math.floor(elapsed / (duration / 8))) : null,
      };
    }
  }

  function stop() {
    if (engine.session) engine.session.stop('stop');
  }

  function startSession(options) {
    if (engine.session) engine.session.stop('replace');
    const session = new Session(options);
    return session;
  }

  function getState() {
    const info = engine.session?.info() || null;
    return {
      supported: true,
      context: engine.ctx?.state || 'not-created',
      playing: Boolean(engine.session && engine.session.running),
      demoId: info?.demoId || null,
      label: info?.label || null,
      bpm: info?.bpm || null,
      progress: info?.progress || 0,
      section: info?.section ?? null,
      elapsed: info?.elapsed || 0,
      duration: info?.duration || 0,
      muted: engine.muted,
      volume: engine.volume,
    };
  }

  function onState(listener) {
    engine.listeners.add(listener);
    listener(getState());
    return () => engine.listeners.delete(listener);
  }

  function toggleMute() {
    ensure();
    engine.muted = !engine.muted;
    engine.output.gain.setTargetAtTime(engine.muted ? 0 : engine.volume, engine.ctx.currentTime, 0.02);
    notify();
    return engine.muted;
  }

  function setVolume(value) {
    engine.volume = clamp(Number(value) || 0, 0, 1);
    if (engine.ctx && engine.output) {
      engine.output.gain.setTargetAtTime(engine.muted ? 0 : engine.volume, engine.ctx.currentTime, 0.02);
    }
    notify();
  }

  // Voice helpers

  function trackVoice(session, source, nodes) {
    session.track(source, [...new Set(nodes.filter(Boolean))]);
  }

  function kick(session, time, options = {}) {
    const ctx = session.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const nodes = [osc, gain];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(options.pitch || 155, time);
    osc.frequency.exponentialRampToValueAtTime(options.endPitch || 44, time + 0.075);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.9, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (options.decay ?? 0.35));
    let tail = osc;
    if (options.drive) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(options.drive);
      shaper.oversample = '2x';
      tail.connect(shaper);
      tail = shaper;
      nodes.push(shaper);
    }
    tail.connect(gain);
    gain.connect(session.gain);
    osc.start(time);
    osc.stop(time + (options.decay ?? 0.35) + 0.05);
    trackVoice(session, osc, nodes);
  }

  function snare(session, time, options = {}) {
    const ctx = session.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = engine.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(options.gain ?? 0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (options.decay ?? 0.18));
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(options.tone || 185, time);
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.12, time);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(session.gain);
    tone.connect(toneGain);
    toneGain.connect(session.gain);
    noise.start(time);
    noise.stop(time + (options.decay ?? 0.18) + 0.03);
    tone.start(time);
    tone.stop(time + 0.12);
    trackVoice(session, noise, [noise, filter, gain, tone, toneGain]);
  }

  function clap(session, time, options = {}) {
    const ctx = session.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = engine.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    for (let burst = 0; burst < 3; burst += 1) {
      const start = time + burst * 0.012;
      gain.gain.setValueAtTime(options.gain ?? 0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.035);
    }
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(session.gain);
    noise.start(time);
    noise.stop(time + 0.14);
    trackVoice(session, noise, [noise, filter, gain]);
  }

  function hat(session, time, options = {}) {
    const ctx = session.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = engine.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = options.open ? 6200 : 7600;
    const gain = ctx.createGain();
    const decay = options.open ? 0.2 : 0.045;
    gain.gain.setValueAtTime(options.gain ?? 0.055, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(session.gain);
    noise.start(time);
    noise.stop(time + decay + 0.02);
    trackVoice(session, noise, [noise, filter, gain]);
  }

  function bass(session, time, options = {}) {
    const ctx = session.ctx;
    const duration = options.duration ?? 0.22;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const nodes = [gain, filter];
    filter.type = 'lowpass';
    filter.Q.value = options.resonance ?? 2;
    const cutoff = options.cutoff ?? 420;
    filter.frequency.setValueAtTime(cutoff, time);
    if (options.cutoffEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.cutoffEnd), time + duration);

    const osc = ctx.createOscillator();
    osc.type = options.type || 'sawtooth';
    osc.frequency.setValueAtTime(midi(options.note ?? 41), time);
    if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(midi(options.slideTo), time + duration * 0.8);
    nodes.push(osc);

    let tail = osc;
    if (options.drive) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(options.drive);
      tail.connect(shaper);
      tail = shaper;
      nodes.push(shaper);
    }
    tail.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.18, time + (options.reverse ? 0.09 : 0.006));
    gain.gain.setValueAtTime(options.gain ?? 0.18, time + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    const extra = session.route(gain, options.reverb || 0);
    nodes.push(...extra);

    if (options.lfo) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = options.lfo;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = options.lfoDepth ?? 280;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(time);
      lfo.stop(time + duration + 0.05);
      nodes.push(lfo, lfoGain);
    }
    osc.start(time);
    osc.stop(time + duration + 0.03);
    trackVoice(session, osc, nodes);
  }

  function chord(session, time, options = {}) {
    const ctx = session.ctx;
    const notes = options.notes || [53, 56, 60];
    const duration = options.duration ?? 0.7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = options.resonance ?? 1;
    filter.frequency.setValueAtTime(options.cutoff ?? 2000, time);
    if (options.cutoffEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(80, options.cutoffEnd), time + duration);
    const gain = ctx.createGain();
    const attack = options.attack ?? 0.012;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.055, time + attack);
    gain.gain.setValueAtTime(options.gain ?? 0.055, time + duration * 0.72);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    filter.connect(gain);
    const extra = session.route(gain, options.reverb ?? 0.2);
    const oscillators = [];
    const detunes = options.detune ? [-options.detune, options.detune] : [0];
    for (const note of notes) {
      for (const detune of detunes) {
        const osc = ctx.createOscillator();
        osc.type = options.type || 'sawtooth';
        osc.frequency.value = midi(note);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + duration + 0.05);
        oscillators.push(osc);
      }
    }
    trackVoice(session, oscillators[0], [filter, gain, ...extra, ...oscillators]);
  }

  function lead(session, time, options = {}) {
    const ctx = session.ctx;
    const duration = options.duration ?? 0.22;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.cutoff ?? 3200, time);
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.06, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    const first = ctx.createOscillator();
    first.type = options.type || 'sawtooth';
    first.frequency.value = midi(options.note ?? 72);
    const second = ctx.createOscillator();
    second.type = options.type || 'sawtooth';
    second.frequency.value = midi(options.note ?? 72);
    second.detune.value = options.detune ?? 7;
    first.connect(filter);
    second.connect(filter);
    filter.connect(gain);
    const extra = session.route(gain, options.reverb ?? 0.22);
    first.start(time);
    first.stop(time + duration + 0.04);
    second.start(time);
    second.stop(time + duration + 0.04);
    trackVoice(session, first, [first, second, filter, gain, ...extra]);
  }

  function pluck(session, time, options = {}) {
    const ctx = session.ctx;
    const duration = options.duration ?? 0.16;
    const osc = ctx.createOscillator();
    osc.type = options.type || 'triangle';
    osc.frequency.value = midi(options.note ?? 72);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.cutoff ?? 4200, time);
    filter.frequency.exponentialRampToValueAtTime(700, time + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(options.gain ?? 0.045, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    const extra = session.route(gain, options.reverb ?? 0.18);
    osc.start(time);
    osc.stop(time + duration + 0.03);
    trackVoice(session, osc, [osc, filter, gain, ...extra]);
  }

  function pad(session, time, options = {}) {
    const ctx = session.ctx;
    const notes = options.notes || [53, 60];
    const duration = options.duration ?? 2;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = options.cutoff ?? 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(options.gain ?? 0.03, time + 0.5);
    gain.gain.setValueAtTime(options.gain ?? 0.03, time + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0.0001, time + duration);
    const oscillators = [];
    for (const note of notes) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midi(note);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + duration + 0.05);
        oscillators.push(osc);
      }
    }
    filter.connect(gain);
    const extra = session.route(gain, options.reverb ?? 0.45);
    trackVoice(session, oscillators[0], [filter, gain, ...extra, ...oscillators]);
  }

  function vocal(session, time, options = {}) {
    const ctx = session.ctx;
    const duration = options.duration ?? 0.4;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midi(options.note ?? 65);
    const formantA = ctx.createBiquadFilter();
    formantA.type = 'bandpass';
    formantA.frequency.value = 800;
    formantA.Q.value = 5;
    const formantB = ctx.createBiquadFilter();
    formantB.type = 'bandpass';
    formantB.frequency.value = 1150;
    formantB.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.05, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(formantA);
    osc.connect(formantB);
    formantA.connect(gain);
    formantB.connect(gain);
    const extra = session.route(gain, 0.35);
    osc.start(time);
    osc.stop(time + duration + 0.04);
    trackVoice(session, osc, [osc, formantA, formantB, gain, ...extra]);
  }

  function fxRiser(session, time, options = {}) {
    const ctx = session.ctx;
    const duration = options.duration ?? 1.6;
    const noise = ctx.createBufferSource();
    noise.buffer = engine.noise;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(320, time);
    filter.frequency.exponentialRampToValueAtTime(9200, time + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.1, time + duration * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    noise.connect(filter);
    filter.connect(gain);
    const extra = session.route(gain, 0.35);
    noise.start(time);
    noise.stop(time + duration + 0.05);
    trackVoice(session, noise, [noise, filter, gain, ...extra]);
  }

  function impact(session, time, options = {}) {
    const ctx = session.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(options.gain ?? 0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.7);
    osc.connect(gain);
    const extra = session.route(gain, 0.3);
    osc.start(time);
    osc.stop(time + 0.75);
    trackVoice(session, osc, [osc, gain, ...extra]);
  }

  function metronome(session, time, accent) {
    const ctx = session.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = accent ? 1480 : 980;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(accent ? 0.12 : 0.07, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    osc.connect(gain);
    gain.connect(session.gain);
    osc.start(time);
    osc.stop(time + 0.06);
    trackVoice(session, osc, [osc, gain]);
  }

  // Patterns

  const DEMOS = {
    bigroom: {
      id: 'bigroom',
      name: 'Bigroom House',
      zh: '大房间浩室',
      bpm: 128,
      entryId: 'g-1581',
      blurb: '巨大的 Kick、宽混响的 Lead、极简旋律；先听 Drop 的骨架。',
      play({ session, time, step, bar }) {
        if (step % 4 === 0) kick(session, time, { gain: 0.88, decay: 0.38 });
        if (step === 4 || step === 12) clap(session, time, { gain: 0.16 });
        if (step % 4 === 2) {
          hat(session, time, { gain: 0.05 });
          bass(session, time, { note: bar ? 44 : 41, duration: 0.14, gain: 0.15, cutoff: 460 });
        }
        if (step === 0 || step === 8) chord(session, time, { notes: bar ? CHORDS.Ab : CHORDS.Fm, duration: 0.86, gain: 0.05, cutoff: 2300, reverb: 0.28 });
        if (bar === 1 && [0, 3, 6, 10, 14].includes(step)) {
          lead(session, time, { note: [72, 75, 72, 77, 75][[0, 3, 6, 10, 14].indexOf(step)], duration: 0.18, gain: 0.055, cutoff: 3600 });
        }
      },
    },
    electro: {
      id: 'electro',
      name: 'Electro House',
      zh: '电气浩室',
      bpm: 128,
      entryId: 'g-1525',
      blurb: '嗡嗡作响的 Bassline、锯齿波和失真，像一台漏电的机器在跳舞。',
      play({ session, time, step, bar }) {
        if (step % 4 === 0) kick(session, time, { gain: 0.8, decay: 0.3 });
        if (step === 4 || step === 12) clap(session, time, { gain: 0.15 });
        if (step % 4 === 2) {
          hat(session, time, { gain: 0.05 });
          bass(session, time, { note: 41, duration: 0.13, type: 'sawtooth', cutoff: 850, resonance: 7, gain: 0.16, drive: 6 });
        }
        if (step === 3 || step === 7 || step === 11 || step === 15) {
          chord(session, time, { notes: [53, 56, 60, 65], duration: 0.1, gain: 0.04, cutoff: 3200, attack: 0.004, reverb: 0.15 });
        }
        if (bar === 1 && step % 4 === 0) lead(session, time, { note: 72, duration: 0.12, gain: 0.045, cutoff: 3000 });
      },
    },
    deep: {
      id: 'deep',
      name: 'Deep House',
      zh: '深邃浩室',
      bpm: 118,
      entryId: 'g-1135',
      blurb: '更慢、更克制；闷音 Bassline 和灵魂和弦，适合先感受“留白”。',
      play({ session, time, step, bar }) {
        if (step % 4 === 0) kick(session, time, { gain: 0.72, decay: 0.3, pitch: 135 });
        if (step === 4 || step === 12) clap(session, time, { gain: 0.1, decay: 0.12 });
        if (step % 4 === 2) {
          hat(session, time, { gain: 0.035 });
          bass(session, time, { note: 41, duration: 0.2, type: 'triangle', cutoff: 320, gain: 0.14 });
        }
        if (step === 0 || step === 8) {
          chord(session, time, { notes: bar ? CHORDS.Gm : CHORDS.Cm, duration: 1.7, gain: 0.035, cutoff: 1100, attack: 0.08, type: 'triangle', reverb: 0.3 });
        }
        if (step === 3 || step === 11) pluck(session, time, { note: bar ? 67 : 63, duration: 0.22, gain: 0.03, cutoff: 2600 });
      },
    },
    uplifting: {
      id: 'uplifting',
      name: 'Uplifting Trance',
      zh: '振奋迷幻',
      bpm: 138,
      entryId: 'g-2999',
      blurb: '长 Breakdown、Supersaw 和明亮大调和弦；注意旋律如何被慢慢举起来。',
      play({ session, time, step, bar }) {
        if (step % 4 === 0) kick(session, time, { gain: 0.76, decay: 0.3 });
        if (step === 4 || step === 12) clap(session, time, { gain: 0.1 });
        if (step % 4 === 2) {
          hat(session, time, { gain: 0.045, open: true });
          bass(session, time, { note: 41, duration: 0.16, type: 'sawtooth', cutoff: 520, gain: 0.14 });
        }
        if (step === 0 || step === 8) {
          chord(session, time, { notes: bar ? CHORDS.Bb : CHORDS.Fm, duration: 1.1, gain: 0.04, cutoff: 2800, detune: 9, reverb: 0.4 });
        }
        if (step % 2 === 0) {
          const arp = [72, 75, 77, 79, 77, 75, 72, 70];
          pluck(session, time, { note: arp[(step / 2) % arp.length], duration: 0.13, gain: 0.025, cutoff: 3800, reverb: 0.25 });
        }
        if (bar === 1 && [0, 6, 10].includes(step)) lead(session, time, { note: [77, 80, 79][[0, 6, 10].indexOf(step)], duration: 0.32, gain: 0.04, cutoff: 4200, reverb: 0.35 });
      },
    },
    techno: {
      id: 'techno',
      name: 'Techno',
      zh: '科技舞曲',
      bpm: 132,
      entryId: 'f-2077',
      blurb: '冰冷、机械、重复；听 Kick 和 Acid 线条如何用很小的变化推进。',
      play({ session, time, step, bar }) {
        if (step % 4 === 0) kick(session, time, { gain: 0.82, decay: 0.32 });
        if (step === 4 || step === 12) clap(session, time, { gain: 0.12 });
        if (step % 2 === 1) hat(session, time, { gain: 0.03 });
        if (step === 2 || step === 6 || step === 10 || step === 14) {
          bass(session, time, { note: bar ? 36 : 33, duration: 0.16, type: 'sawtooth', cutoff: 1100, cutoffEnd: 220, resonance: 13, gain: 0.12, lfo: 5, lfoDepth: 140 });
        }
        if (step === 0 || step === 8) chord(session, time, { notes: [48, 55, 60], duration: 2, gain: 0.025, cutoff: 900, attack: 0.3, reverb: 0.3 });
        if (step === 7 || step === 15) lead(session, time, { note: bar ? 72 : 69, duration: 0.1, gain: 0.04, cutoff: 2600 });
      },
    },
    trap: {
      id: 'trap',
      name: 'Trap',
      zh: '陷阱音乐',
      bpm: 140,
      entryId: 'g-10159',
      blurb: '厚重 808、密集 Hi-hat、半拍感；注意军鼓落在哪里。',
      play({ session, time, step, bar }) {
        if (step === 0 || step === 7) kick(session, time, { gain: 0.7, decay: 0.25 });
        if (step === 8) snare(session, time, { gain: 0.2, decay: 0.16 });
        if (step === 0) bass(session, time, { note: 29, duration: 0.55, type: 'sine', cutoff: 190, gain: 0.28, slideTo: 32 });
        if (step === 10) bass(session, time, { note: 32, duration: 0.42, type: 'sine', cutoff: 220, gain: 0.24, slideTo: 29 });
        hat(session, time, { gain: 0.035, decay: 0.025 });
        if ([2, 3, 6, 11, 14].includes(step)) hat(session, time + 0.055, { gain: 0.025, decay: 0.02 });
        if (step === 4 || step === 12) chord(session, time, { notes: [53, 56, 60], duration: 0.9, gain: 0.022, cutoff: 1600, attack: 0.1, reverb: 0.35 });
      },
    },
    futurebass: {
      id: 'futurebass',
      name: 'Future Bass',
      zh: '未来贝斯',
      bpm: 150,
      entryId: 'g-11151',
      blurb: '失谐 Supersaw 和弦、明亮琶音、半拍鼓组；Drop 不是“炸”，而是“亮”。',
      play({ session, time, step, bar }) {
        if (step === 0 || step === 10) kick(session, time, { gain: 0.65, decay: 0.24 });
        if (step === 8) snare(session, time, { gain: 0.16, decay: 0.18 });
        if (step === 0 || step === 8) {
          chord(session, time, { notes: bar ? CHORDS.Ab : CHORDS.Fm, duration: 0.72, gain: 0.045, cutoff: 3600, detune: 12, type: 'sawtooth', reverb: 0.28 });
        }
        if (step % 2 === 0) {
          const arp = [72, 75, 79, 84, 79, 75, 72, 79];
          pluck(session, time, { note: arp[(step / 2) % arp.length], duration: 0.1, gain: 0.025, cutoff: 5000, reverb: 0.22 });
        }
        if (step === 4 || step === 12) vocal(session, time, { note: 68, duration: 0.28, gain: 0.035 });
        if (step === 0) bass(session, time, { note: 41, duration: 0.4, type: 'sine', cutoff: 240, gain: 0.16 });
        hat(session, time, { gain: 0.02, decay: 0.025 });
      },
    },
    dubstep: {
      id: 'dubstep',
      name: 'US Dubstep',
      zh: '美式回响贝斯',
      bpm: 140,
      entryId: 'g-6167',
      blurb: '2-step 鼓组 + 140 BPM + Wobble/Growl Bass；Drop 像金属怪兽开始呼吸。',
      play({ session, time, step, bar }) {
        if (step === 0 || step === 10) kick(session, time, { gain: 0.72, decay: 0.25 });
        if (step === 8) snare(session, time, { gain: 0.22, decay: 0.18 });
        if (step === 0) impact(session, time, { gain: 0.2 });
        if (step % 2 === 0) {
          bass(session, time, { note: bar ? 29 : 32, duration: 0.18, type: 'sawtooth', cutoff: 700, cutoffEnd: 220, resonance: 8, gain: 0.2, lfo: 7, lfoDepth: 420, drive: 8 });
        }
        if (step % 4 === 2) hat(session, time, { gain: 0.03 });
        if (step === 4 || step === 12) chord(session, time, { notes: [53, 56, 60], duration: 0.22, gain: 0.018, cutoff: 1200, reverb: 0.4 });
      },
    },
    hardstyle: {
      id: 'hardstyle',
      name: 'Hardstyle',
      zh: '硬派',
      bpm: 150,
      entryId: 'g-8566',
      blurb: '过载 Kick + 反向 Bass + Screech；速度不是最快，但冲击力最直接。',
      play({ session, time, step, bar }) {
        if (step % 4 === 0) kick(session, time, { gain: 0.82, decay: 0.22, drive: 30, pitch: 170, endPitch: 48 });
        if (step === 4 || step === 12) clap(session, time, { gain: 0.13 });
        if (step % 4 === 2) bass(session, time, { note: 36, duration: 0.13, type: 'sawtooth', cutoff: 420, cutoffEnd: 120, gain: 0.14, reverse: true });
        if (step === 0 || step === 8) {
          lead(session, time, { note: bar ? 72 : 69, duration: 0.26, type: 'sawtooth', gain: 0.05, cutoff: 5200, detune: 14, reverb: 0.2 });
        }
        if (step === 6 || step === 14) hat(session, time, { gain: 0.03, open: true });
      },
    },
    futurerave: {
      id: 'futurerave',
      name: 'Future Rave',
      zh: '未来锐舞',
      bpm: 128,
      entryId: 'g-2017',
      blurb: '复古高混响锯齿波 Lead + 空旷空间感 + Electro 元素；像把主舞台推进一条更暗的隧道。',
      play({ session, time, step, bar }) {
        if (step % 4 === 0) kick(session, time, { gain: 0.8, decay: 0.34 });
        if (step === 4 || step === 12) clap(session, time, { gain: 0.14 });
        if (step % 4 === 2) {
          hat(session, time, { gain: 0.04 });
          bass(session, time, { note: bar ? 44 : 41, duration: 0.15, cutoff: 420, gain: 0.13 });
        }
        if (step === 0 || step === 8) {
          chord(session, time, { notes: bar ? CHORDS.Eb : CHORDS.Cm, duration: 1.0, gain: 0.045, cutoff: 2600, detune: 10, reverb: 0.45 });
        }
        if (bar === 1 && [0, 4, 8, 12].includes(step)) lead(session, time, { note: [72, 75, 79, 75][[0, 4, 8, 12].indexOf(step)], duration: 0.22, gain: 0.045, cutoff: 3800, reverb: 0.4 });
      },
    },
  };

  const DEMO_LIST = Object.values(DEMOS);

  function demoForEntry(entryId) {
    return DEMO_LIST.find((demo) => demo.entryId === entryId) || null;
  }

  /* ------------------------------------------------------------------------
     配方引擎 / FINGERPRINT ENGINE

     配方是 data/fingerprints.js 里的数据，不是代码。这里只做翻译：
     16 格图案 → Web Audio 调用。加一个风格不需要动这个文件。

     分层的意义：drums / bass / chord / lead 可以单独静音，
     所以「只听低音」是一个真实的操作，而不是一句形容词。
     ------------------------------------------------------------------------ */

  function fpBank() {
    return (window.EM_FINGERPRINTS && window.EM_FINGERPRINTS.recipes) || null;
  }

  function fpRecipe(id) {
    const bank = fpBank();
    return (bank && bank[id]) || null;
  }

  function fpHit(pattern, index) {
    if (!pattern) return false;
    const ch = pattern[index % pattern.length];
    return ch === 'x' || ch === 'o';
  }

  function fpIndex(bar, step) {
    return bar * 16 + step;
  }

  function renderFingerprint(fp, { session, time, step, bar }) {
    if (!fp) return;
    const mute = engine.fpMute;
    const at = (voice) => fpHit(voice && voice.p, fpIndex(bar, step));
    const chordNotes = fp.chords ? fp.chords[bar % fp.chords.length] : (fp.chord && fp.chord.notes) || [0, 3, 7];

    if (!mute.has('drums')) {
      if (at(fp.kick)) {
        kick(session, time, {
          pitch: fp.kick.pitch, endPitch: fp.kick.end, gain: fp.kick.gain,
          decay: fp.kick.decay, drive: fp.kick.drive,
        });
      }
      if (at(fp.snare)) {
        snare(session, time, { gain: fp.snare.gain, decay: fp.snare.decay, tone: fp.snare.tone });
      }
      if (at(fp.clap)) {
        clap(session, time, { gain: fp.clap.gain });
      }
      if (at(fp.hat)) {
        hat(session, time, { gain: fp.hat.gain, open: fp.hat.open });
        if (fp.hat.rolls && step % 4 === 3) {
          hat(session, time + 0.055, { gain: (fp.hat.gain || 0.02) * 0.7 });
        }
      }
    }

    if (!mute.has('bass') && at(fp.bass)) {
      const offset = (fp.bass.note || 0);
      const note = fp.key + offset;
      bass(session, time, {
        note,
        duration: fp.bass.dur,
        type: fp.bass.wave,
        cutoff: fp.bass.cut,
        cutoffEnd: fp.bass.cutEnd,
        resonance: fp.bass.res,
        gain: fp.bass.gain,
        drive: fp.bass.drive,
        reverse: fp.bass.reverse,
        reverb: fp.bass.rev,
        lfo: fp.bass.lfo,
        lfoDepth: fp.bass.lfoDepth,
        slideTo: fp.bass.slide ? note - 3 : (fp.bass.log ? note - 5 : undefined),
      });
    }

    if (!mute.has('chord')) {
      if (at(fp.chord)) {
        chord(session, time, {
          notes: chordNotes.map((n) => fp.key + 24 + n),
          duration: fp.chord.dur,
          type: fp.chord.type,
          cutoff: fp.chord.cut,
          gain: fp.chord.gain,
          attack: fp.chord.attack,
          detune: fp.chord.detune,
          reverb: fp.chord.rev,
        });
      }
      if (at(fp.pad)) {
        pad(session, time, {
          notes: ((fp.pad.notes || chordNotes)).map((n) => fp.key + 24 + n),
          duration: fp.pad.dur,
          cutoff: fp.pad.cut,
          gain: fp.pad.gain,
          reverb: fp.pad.rev,
        });
      }
    }

    if (!mute.has('lead')) {
      if (at(fp.lead)) {
        lead(session, time, {
          note: fp.key + 36 + (fp.lead.note || 0),
          duration: fp.lead.dur,
          type: fp.lead.type,
          cutoff: fp.lead.cut,
          gain: fp.lead.gain,
          detune: fp.lead.detune,
          reverb: fp.lead.rev,
        });
      }
      if (at(fp.arp)) {
        const pick = chordNotes[Math.floor(step / 2) % chordNotes.length] + 12;
        pluck(session, time, {
          note: fp.key + 36 + pick,
          duration: fp.arp.dur,
          cutoff: fp.arp.cut,
          gain: fp.arp.gain,
          reverb: fp.arp.rev,
        });
      }
      if (at(fp.pluck)) {
        pluck(session, time, {
          note: fp.key + 36 + (fp.pluck.note || 0),
          duration: fp.pluck.dur,
          cutoff: fp.pluck.cut,
          gain: fp.pluck.gain,
          reverb: fp.pluck.rev,
        });
      }
      if (at(fp.spark)) {
        pluck(session, time, {
          note: fp.key + 60,
          duration: fp.spark.dur,
          type: 'sine',
          cutoff: fp.spark.cut,
          gain: fp.spark.gain,
          reverb: fp.spark.rev,
        });
      }
    }
  }

  function playFingerprint(id, options = {}) {
    const fp = fpRecipe(id);
    if (!fp) return false;
    ensure();
    const bpm = clamp(Number(options.bpm) || fp.bpm, 60, 200);
    const barSeconds = 240 / bpm;
    // 卡片上写「听 8 秒」，那就真的是 8 秒左右，而不是两小节循环
    const bars = options.bars || Math.max(2, Math.min(8, Math.round(8 / barSeconds)));
    engine.fingerprint = fp;
    if (options.resetLayers !== false) engine.fpMute = new Set();
    startSession({
      bpm,
      bars,
      loop: options.loop !== false,
      label: options.label || fp.label,
      demoId: 'fp:' + id,
      pattern: (args) => renderFingerprint(fp, args),
    });
    return true;
  }

  function setFingerprintLayers(muted) {
    engine.fpMute = new Set(Array.isArray(muted) ? muted : []);
    notify();
    return [...engine.fpMute];
  }

  function getFingerprint(id) {
    return fpRecipe(id);
  }

  function playDemo(id) {
    const demo = DEMOS[id];
    if (!demo) return false;
    ensure();
    startSession({
      bpm: demo.bpm,
      bars: 2,
      loop: true,
      label: demo.name,
      demoId: demo.id,
      pattern: demo.play,
    });
    return true;
  }

  function labPattern({ session, time, step, bar }) {
    const groups = engine.labGroups;
    if (groups.drums) {
      if (step % 4 === 0) kick(session, time, { gain: 0.78, decay: 0.32 });
      if (step === 4 || step === 12) clap(session, time, { gain: 0.12 });
      if (step % 4 === 2) hat(session, time, { gain: 0.04 });
    }
    if (groups.bass && step % 4 === 2) {
      bass(session, time, { note: bar ? 44 : 41, duration: 0.16, type: 'sawtooth', cutoff: 520, gain: 0.14 });
    }
    if (groups.chords && (step === 0 || step === 8)) {
      chord(session, time, { notes: bar ? CHORDS.Ab : CHORDS.Fm, duration: 0.9, gain: 0.04, cutoff: 2200, detune: 7, reverb: 0.3 });
    }
    if (groups.vocal && bar === 1 && (step === 4 || step === 12)) {
      vocal(session, time, { note: 68, duration: 0.32, gain: 0.04 });
    }
    if (groups.lead && bar === 1 && [0, 3, 6, 10, 14].includes(step)) {
      lead(session, time, { note: [72, 75, 72, 79, 75][[0, 3, 6, 10, 14].indexOf(step)], duration: 0.18, gain: 0.05, cutoff: 3600 });
    }
    if (groups.ambient && step === 0) {
      pad(session, time, { notes: [53, 60], duration: 2.8, gain: 0.022, cutoff: 1000, reverb: 0.45 });
    }
    if (groups.fx && (bar === 1 && step === 12)) {
      fxRiser(session, time, { duration: 1.4, gain: 0.09 });
    }
  }

  function startLab({ bpm = 124, groups = engine.labGroups } = {}) {
    ensure();
    engine.labGroups = { ...groups };
    startSession({
      bpm: clamp(Number(bpm) || 124, 100, 160),
      bars: 2,
      loop: true,
      label: '七组音色实验室',
      demoId: 'lab',
      pattern: labPattern,
    });
    return true;
  }

  function setLabGroups(groups) {
    engine.labGroups = { ...engine.labGroups, ...groups };
    notify();
  }

  function structurePattern({ session, time, step, bar }) {
    const section = Math.min(7, Math.floor(bar / 2));
    const secondBar = bar % 2;
    if (section === 0) {
      if (step === 0) pad(session, time, { notes: CHORDS.Fm, duration: 3.2, gain: 0.025, cutoff: 900, reverb: 0.45 });
      if (step === 0 || step === 8) kick(session, time, { gain: 0.3, decay: 0.2 });
      if (step % 4 === 2) hat(session, time, { gain: 0.025 });
    } else if (section === 1) {
      if (step === 0) chord(session, time, { notes: CHORDS.Fm, duration: 2.4, gain: 0.035, cutoff: 1600, detune: 6, reverb: 0.35 });
      if (step === 4 || step === 12) vocal(session, time, { note: 65, duration: 0.4, gain: 0.03 });
      if (step % 4 === 2) hat(session, time, { gain: 0.025 });
    } else if (section === 2) {
      if (step % 4 === 0) kick(session, time, { gain: 0.55, decay: 0.24 });
      if (step >= 8 && step % 2 === 0) snare(session, time, { gain: step === 14 ? 0.18 : 0.09, decay: 0.08 });
      if (step === 8) fxRiser(session, time, { duration: 1.6, gain: 0.09 });
      if (step === 0) chord(session, time, { notes: CHORDS.Fm, duration: 1.5, gain: 0.025, cutoff: 1200, reverb: 0.3 });
    } else if (section === 3) {
      if (step % 4 === 0) kick(session, time, { gain: 0.85, decay: 0.34 });
      if (step === 4 || step === 12) clap(session, time, { gain: 0.16 });
      if (step % 4 === 2) {
        hat(session, time, { gain: 0.045 });
        bass(session, time, { note: 41, duration: 0.14, cutoff: 480, gain: 0.16 });
      }
      if (step === 0 || step === 8) chord(session, time, { notes: CHORDS.Fm, duration: 0.9, gain: 0.05, cutoff: 2400, detune: 8, reverb: 0.28 });
      if ([0, 3, 6, 10, 14].includes(step)) lead(session, time, { note: [72, 75, 72, 77, 75][[0, 3, 6, 10, 14].indexOf(step)], duration: 0.18, gain: 0.05, cutoff: 3600 });
    } else if (section === 4) {
      if (step === 0) pad(session, time, { notes: CHORDS.Ab, duration: 3.2, gain: 0.03, cutoff: 1100, reverb: 0.45 });
      if (step === 4 || step === 12) vocal(session, time, { note: 68, duration: 0.42, gain: 0.04 });
      if (step % 4 === 2) hat(session, time, { gain: 0.025 });
    } else if (section === 5) {
      if (step % 4 === 0) kick(session, time, { gain: 0.5, decay: 0.24 });
      if (step >= 8 && step % 2 === 0) snare(session, time, { gain: step === 14 ? 0.2 : 0.1, decay: 0.08 });
      if (step === 8) fxRiser(session, time, { duration: 1.6, gain: 0.1 });
      if (step === 0) chord(session, time, { notes: CHORDS.Ab, duration: 1.4, gain: 0.03, cutoff: 1400, reverb: 0.35 });
    } else if (section === 6) {
      if (step % 4 === 0) kick(session, time, { gain: 0.86, decay: 0.34 });
      if (step === 4 || step === 12) clap(session, time, { gain: 0.16 });
      if (step % 4 === 2) {
        hat(session, time, { gain: 0.045 });
        bass(session, time, { note: 44, duration: 0.14, cutoff: 520, gain: 0.16 });
      }
      if (step === 0 || step === 8) chord(session, time, { notes: CHORDS.Ab, duration: 0.9, gain: 0.05, cutoff: 2600, detune: 10, reverb: 0.3 });
      if ([0, 4, 8, 12].includes(step)) lead(session, time, { note: [77, 80, 77, 75][[0, 4, 8, 12].indexOf(step)], duration: 0.22, gain: 0.05, cutoff: 4200, reverb: 0.35 });
    } else {
      if (step === 0) pad(session, time, { notes: CHORDS.Fm, duration: 3.2, gain: 0.025, cutoff: 900, reverb: 0.45 });
      if (step % 4 === 0) kick(session, time, { gain: 0.28, decay: 0.2 });
      if (step % 4 === 2) hat(session, time, { gain: 0.022 });
    }
  }

  function startDrumMachine({ bpm = 118, pattern = engine.drumPattern } = {}) {
    ensure();
    engine.drumPattern = pattern;
    startSession({
      bpm: clamp(Number(bpm) || 118, 80, 180),
      bars: 1,
      stepsPerBar: 8,
      loop: true,
      label: '鼓组步进器',
      demoId: 'drum-machine',
      pattern: ({ session, time, step }) => {
        const current = engine.drumPattern;
        if (current.kick?.[step]) kick(session, time, { gain: 0.72, decay: 0.28 });
        if (current.snare?.[step]) snare(session, time, { gain: 0.16, decay: 0.15 });
        if (current.hat?.[step]) hat(session, time, { gain: 0.035, decay: 0.03 });
      },
    });
    return true;
  }

  function setDrumPattern(pattern) {
    engine.drumPattern = pattern;
  }

  function previewChord(notes = [53, 56, 60], label = '和弦试听') {
    ensure();
    startSession({
      bpm: 100,
      bars: 1,
      stepsPerBar: 16,
      loop: false,
      label,
      demoId: 'preview',
      pattern: ({ session, time, step }) => {
        if (step === 0) chord(session, time, { notes, duration: 1.8, gain: 0.06, cutoff: 2600, detune: 6, reverb: 0.35 });
      },
    });
    return true;
  }

  function playStructure() {
    ensure();
    startSession({
      bpm: 128,
      bars: 16,
      loop: false,
      label: '八段结构示例',
      demoId: 'structure',
      pattern: structurePattern,
    });
    return true;
  }

  function playMetronome(bpm = 128) {
    ensure();
    startSession({
      bpm: clamp(Number(bpm) || 128, 80, 180),
      bars: 2,
      loop: false,
      label: `${clamp(Number(bpm) || 128, 80, 180)} BPM 节拍`,
      demoId: 'metronome',
      pattern: ({ session, time, step }) => {
        if (step % 4 === 0) metronome(session, time, step === 0);
      },
    });
    return true;
  }


  // --------------------------------------------------------------------------
  // Studio: one looping 4-bar session that reads a live project object on every
  // 16th note. Edits are heard on the next step, without stopping playback —
  // the same "always running loop" feel as a hardware groovebox.
  // --------------------------------------------------------------------------

  const STUDIO_BARS = 4;

  // --------------------------------------------------------------------------
  // Insert effects for the signal-chain module.
  //
  // That module teaches exactly one thing: the ORDER of effects changes the
  // result. So every insert has a fixed setting and a stable in/out pair, and
  // reordering only rewires connections — it never touches a parameter. If the
  // settings moved between takes, an A/B comparison would be comparing two
  // sounds instead of two orders, and the lesson would be a lie.
  // --------------------------------------------------------------------------

  const CHAIN_EFFECT_IDS = ['distortion', 'eq', 'compressor', 'reverb'];

  // One insert: a stable input/output pair wrapping however the effect is built
  // internally. Keeping the pair means the chain can be wired in any order
  // without the caller knowing anything about the inside.
  function makeInsert(ctx, id) {
    const input = ctx.createGain();
    const output = ctx.createGain();

    if (id === 'distortion') {
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(14);
      shaper.oversample = '2x';
      // Hard clipping lifts the average level a lot. Without this trim,
      // "distortion first" would win every A/B test on volume alone, which
      // teaches the wrong thing.
      const trim = ctx.createGain();
      trim.gain.value = 0.5;
      input.connect(shaper);
      shaper.connect(trim);
      trim.connect(output);
      return { id, input, output, nodes: [input, shaper, trim, output] };
    }

    if (id === 'eq') {
      // A mid-scoop plus a presence lift, deliberately not a lowpass: the sound
      // module already owns the master lowpass, so this is a different tool
      // with a different job. Push a bright signal into the distortion after
      // this and it clips harder — which is the whole point of the module.
      const scoop = ctx.createBiquadFilter();
      scoop.type = 'peaking';
      scoop.frequency.value = 380;
      scoop.Q.value = 0.9;
      scoop.gain.value = -8;
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 2800;
      presence.Q.value = 0.9;
      presence.gain.value = 7;
      input.connect(scoop);
      scoop.connect(presence);
      presence.connect(output);
      return { id, input, output, nodes: [input, scoop, presence, output] };
    }

    if (id === 'compressor') {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -26;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      // Makeup gain, so "compressor first" is not just "compressor quieter".
      const makeup = ctx.createGain();
      makeup.gain.value = 1.45;
      input.connect(comp);
      comp.connect(makeup);
      makeup.connect(output);
      return { id, input, output, nodes: [input, comp, makeup, output] };
    }

    // Reverb as a serial insert with a wet/dry mix. A send would not let the
    // order matter the way the lesson describes: put it before the distortion
    // and the tail itself gets clipped; put it after and it stays smooth.
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 2.4, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    const dry = ctx.createGain();
    dry.gain.value = 0.68;
    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(output);
    input.connect(dry);
    dry.connect(output);
    return { id, input, output, nodes: [input, convolver, wet, dry, output] };
  }

  // Rewire only the chain segment: chainInput → inserts (in fx.order) → chainOut.
  // The session, the master bus and the global reverb are never touched, so a
  // reorder is heard on the next note without dropping the running loop.
  function wireStudioChain(fx) {
    try {
      fx.chainInput.disconnect();
    } catch (error) {
      // Not connected yet.
    }
    for (const insert of fx.inserts) {
      try {
        insert.output.disconnect();
      } catch (error) {
        // Not connected yet.
      }
    }
    let tail = fx.chainInput;
    for (const id of fx.order) {
      const insert = fx.inserts.find((item) => item.id === id);
      if (!insert) continue;
      tail.connect(insert.input);
      tail = insert.output;
    }
    tail.connect(fx.chainOut);
  }

  function studioChain(session, project) {
    const ctx = session.ctx;
    const bpm = session.bpm;

    // Everything that should pass through the inserts enters here: the looping
    // session and the single-voice auditions alike. Auditioning anywhere else
    // would make "点轨道头试听" play a signal that never met the chain.
    const chainInput = ctx.createGain();
    const inserts = CHAIN_EFFECT_IDS.map((id) => makeInsert(ctx, id));

    // Master tone, owned by the sound module. It sits after the chain so the
    // two modules stack the way an insert → bus chain does in a real project:
    // the chain changes order, the bus changes tone.
    const drive = ctx.createWaveShaper();
    drive.oversample = '2x';

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const chainOut = ctx.createGain();
    chainOut.gain.value = 1;

    // Re-route the session output into the chain.
    try {
      session.gain.disconnect();
    } catch (error) {
      // Already disconnected.
    }
    session.gain.connect(chainInput);

    const chainState = (project && project.chain) || {};
    const wanted = Array.isArray(chainState)
      ? chainState
      : chainState[chainState.slot === 'b' ? 'b' : 'a'];
    const order = (Array.isArray(wanted) ? wanted : []).filter((id) => CHAIN_EFFECT_IDS.includes(id));
    // Every effect stays in the chain exactly once. A chain that silently
    // dropped one would make A/B compare two different chains rather than two
    // orders of the same one.
    for (const id of CHAIN_EFFECT_IDS) if (!order.includes(id)) order.push(id);

    const fx = { ctx, session, chainInput, inserts, order, chainOut, drive, filter };
    wireStudioChain(fx);
    chainOut.connect(drive);
    drive.connect(filter);
    filter.connect(engine.master);

    // Delay send with feedback, tapped after the master tone.
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = (60 / bpm) * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.18;
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 2600;
    filter.connect(delaySend);
    delaySend.connect(delay);
    delay.connect(delayTone);
    delayTone.connect(feedback);
    feedback.connect(delay);
    // Straight to the master, not back into the chain: feeding the delay into
    // the chain input would create a feedback loop through the inserts.
    delayTone.connect(engine.master);

    Object.assign(fx, { delay, feedback, delaySend, delayTone });
    engine.studioFx = fx;
    applyStudioFx(project);
    return fx;
  }

  function applyStudioFx(project) {
    const fx = engine.studioFx;
    if (!fx || !fx.session) return;
    const ctx = fx.session.ctx;
    const now = ctx.currentTime;
    const sound = project.sound || {};
    const cutoff = clamp(Number(sound.cutoff) || 12000, 220, 18000);
    const resonance = clamp(Number(sound.resonance) ?? 0.9, 0, 16);
    const driveAmount = clamp(Number(sound.drive) || 0, 0, 1);
    const delayAmount = clamp(Number(sound.delay) || 0, 0, 1);
    const reverbAmount = clamp(Number(sound.reverb) || 0, 0, 1);

    fx.filter.frequency.setTargetAtTime(cutoff, now, 0.03);
    fx.filter.Q.setTargetAtTime(resonance, now, 0.03);
    fx.drive.curve = driveAmount > 0.02 ? distortionCurve(1 + driveAmount * 24) : null;
    fx.delaySend.gain.setTargetAtTime(delayAmount * 0.55, now, 0.04);
    fx.feedback.gain.setTargetAtTime(0.1 + delayAmount * 0.46, now, 0.04);
    fx.delay.delayTime.setTargetAtTime((60 / fx.session.bpm) * 0.75, now, 0.05);
    // Reverb is a per-voice send; scaling the bus gives one global amount.
    fx.session.reverbSend.gain.setTargetAtTime(0.06 + reverbAmount * 0.5, now, 0.04);

    applyChainOrder(project.chain);
  }

  // Reorder the insert chain without interrupting the loop.
  //
  // Reordering means reconnecting nodes, which is safe to do while audio is
  // flowing: already-scheduled voices keep their old path until they finish,
  // and everything scheduled from here on takes the new one. That is what makes
  // "drag it while the loop runs" audible instead of a stop-and-restart.
  function applyChainOrder(chain) {
    const fx = engine.studioFx;
    if (!fx || !fx.inserts) return false;
    const wanted = Array.isArray(chain)
      ? chain
      : ((chain || {})[((chain || {}).slot === 'b' ? 'b' : 'a')]);
    if (!Array.isArray(wanted) || !wanted.length) return false;
    const order = wanted.filter((id) => CHAIN_EFFECT_IDS.includes(id));
    for (const id of CHAIN_EFFECT_IDS) if (!order.includes(id)) order.push(id);
    if (order.length !== fx.order.length || order.some((id, index) => id !== fx.order[index])) {
      fx.order = order;
      wireStudioChain(fx);
      return true;
    }
    return false;
  }

  function chordRootFor(project, bar) {
    const name = (project.chords || [])[bar];
    const chord = CHORDS[name];
    if (!chord) return 53;
    return chord[0];
  }

  function scaleNote(project, degree) {
    const scale = project.scaleIntervals && project.scaleIntervals.length
      ? project.scaleIntervals
      : [0, 2, 3, 5, 7, 8, 10];
    const base = Number(project.melodyBase) || 65;
    const size = scale.length;
    const octave = Math.floor(degree / size);
    return base + scale[((degree % size) + size) % size] + octave * 12;
  }

  function startStudio({ read }) {
    if (typeof read !== 'function') return false;
    ensure();
    const project = read();
    engine.stopStudioPending = true;
    const bpm = clamp(Number(project.bpm) || 124, 60, 180);

    const session = startSession({
      bpm,
      bars: STUDIO_BARS,
      stepsPerBar: 16,
      loop: true,
      label: '工作室循环',
      demoId: 'studio',
      pattern: ({ session: live, time, step, bar, absBar }) => {
        // absBar is the bar of the whole performance, not of the 4-bar loop.
        // The song gate uses it to decide which arrangement block is sounding,
        // so the arrangement follows the audio clock instead of the UI frame
        // rate. read() ignores the argument outside song mode.
        const state = read(absBar);
        const swing = clamp(Number(state.swing) || 0, 0, 0.6);
        // Push the off-beat 16ths later for a shuffled feel.
        const t = time + (step % 2 === 1 ? live.stepDuration * swing * 0.5 : 0);
        const drums = state.drums || {};
        const sound = state.sound || {};
        const osc = sound.osc || 'sawtooth';

        if (drums.kick && drums.kick[step]) kick(live, t, { gain: 0.8, decay: 0.3 });
        if (drums.clap && drums.clap[step]) clap(live, t, { gain: 0.42, decay: 0.16 });
        if (drums.hat && drums.hat[step]) hat(live, t, { gain: 0.05 });
        if (drums.openhat && drums.openhat[step]) hat(live, t, { gain: 0.042, open: true });

        const root = chordRootFor(state, bar);
        const chordName = (state.chords || [])[bar];
        if (step === 0 && CHORDS[chordName]) {
          const duration = live.stepDuration * 15.2;
          if (sound.chordVoice === 'pad') {
            pad(live, t, {
              notes: CHORDS[chordName],
              duration,
              gain: 0.032,
              cutoff: Math.min(Number(sound.cutoff) || 2000, 2200),
            });
          } else {
            chord(live, t, {
              notes: CHORDS[chordName],
              duration,
              gain: 0.048,
              cutoff: Math.min(Number(sound.cutoff) || 2400, 3600),
              detune: sound.chordVoice === 'stab' ? 0 : 7,
              attack: sound.chordVoice === 'pad' ? 0.35 : 0.012,
              reverb: 0.24,
            });
          }
        }

        // Bass rows are chord tones, so the line always follows the harmony.
        const bassRows = state.bass || [];
        const bassOffsets = [0, 7, 12];
        for (let row = 0; row < bassRows.length; row += 1) {
          if (!bassRows[row] || !bassRows[row][step]) continue;
          bass(live, t, {
            note: root - 12 + (bassOffsets[row] || 0),
            duration: live.stepDuration * 1.7,
            gain: 0.2,
            cutoff: clamp(Number(sound.bassCutoff) || 620, 180, 2400),
            resonance: 3,
            type: osc,
            drive: sound.bassDrive || 0,
          });
        }

        // Melody rows are scale degrees, so it stays in key when chords change.
        const melodyRows = state.melody || [];
        for (let row = 0; row < melodyRows.length; row += 1) {
          if (!melodyRows[row] || !melodyRows[row][step]) continue;
          const note = scaleNote(state, row);
          if (sound.melodyVoice === 'lead') {
            lead(live, t, {
              note,
              duration: live.stepDuration * 1.5,
              gain: 0.05,
              cutoff: clamp((Number(sound.cutoff) || 3200) * 0.9, 600, 8000),
              detune: 6,
              reverb: 0.3,
            });
          } else {
            pluck(live, t, {
              note,
              duration: live.stepDuration * 1.4,
              gain: 0.055,
              cutoff: clamp((Number(sound.cutoff) || 4200) * 0.8, 600, 9000),
              type: sound.melodyVoice === 'bell' ? 'sine' : 'triangle',
            });
          }
        }
      },
    });

    studioChain(session, project);
    engine.stopStudioPending = false;
    return true;
  }

  // Reorder the running chain from the UI.
  //
  // Returns true when a live chain was rewired, false when there was nothing to
  // rewire (no session yet, or the order is already in force). "No session" is
  // not a failure: the order lives in the project and startStudio() reads it
  // when playback begins, so a reorder made while stopped still takes effect.
  function setChainOrder(chain) {
    return applyChainOrder(chain);
  }

  function updateStudio(project) {
    if (project) applyStudioFx(project);
  }

  function stopStudio() {
    const fx = engine.studioFx;
    engine.studioFx = null;
    if (engine.session && engine.session.demoId === 'studio') engine.session.stop('stop');
    if (!fx) return;
    setTimeout(() => {
      try {
        for (const insert of fx.inserts || []) {
          for (const node of insert.nodes) {
            try {
              node.disconnect();
            } catch (error) {
              // Already disconnected.
            }
          }
        }
        fx.chainInput.disconnect();
        fx.chainOut.disconnect();
        fx.filter.disconnect();
        fx.drive.disconnect();
      } catch (error) {
        // Already disconnected.
      }
    }, 260);
  }

  // Position of a running session, derived from the audio clock rather than a
  // UI timer. Anything that highlights the current step reads this, so the
  // picture can never drift away from the sound.
  function getPlayhead(demoId) {
    const session = engine.session;
    if (!session || !session.ctx || !session.running) return null;
    if (demoId && session.demoId !== demoId) return null;
    const stepsPerBar = session.stepsPerBar;
    // startTime sits ~0.1s in the future so the first note is scheduled safely.
    // Before it arrives the elapsed time is negative: report position zero
    // instead of letting the modulo wrap it to the end of the loop, which would
    // flash every readout to 100% for the first frame.
    const elapsed = Math.max(0, session.ctx.currentTime - session.startTime);
    const total = session.totalSteps;
    let pos = (elapsed / session.stepDuration) % total;
    if (!Number.isFinite(pos)) return null;
    if (pos < 0) pos += total;
    // Absolute bar across the whole performance, derived from the same elapsed
    // time as everything else.
    //
    // This must NOT use session.loops. The scheduler runs ~120ms ahead, so
    // `loops` increments before the playhead actually crosses the loop point;
    // mixing a look-ahead counter with a current-time position made absBar jump
    // forward and then fall back at every boundary. Deriving it from `elapsed`
    // keeps it monotonic and exactly consistent with `step` and `bar`.
    const absPos = elapsed / session.stepDuration;
    const absBar = Math.floor(absPos / stepsPerBar);
    return {
      demoId: session.demoId,
      step: Math.floor(pos) % stepsPerBar,
      bar: Math.floor(pos / stepsPerBar),
      absBar: Number.isFinite(absBar) ? absBar : 0,
      phase: pos % 1,
      stepsPerBar,
      bars: session.bars,
      loop: session.loop,
      progress: pos / total,
      bpm: session.bpm,
    };
  }

  function getStudioPlayhead() {
    return getPlayhead('studio');
  }

  // One-off audition that plays over the running loop instead of replacing it.
  //
  // It enters the studio chain when one exists, so an audition hears the same
  // inserts as the loop. That is the point of the signal-chain module: clicking
  // a track head or a chain node should demonstrate the current order, not a
  // bypassed copy of it.
  function previewStudio({ notes = [60], duration = 0.9, type = 'triangle', gain = 0.07, reverb = 0.25, throughChain = true } = {}) {
    const ctx = ensure();
    const now = ctx.currentTime + 0.02;
    const fx = engine.studioFx;
    const bus = ctx.createGain();
    bus.gain.value = gain;
    const target = throughChain && fx && fx.chainInput ? fx.chainInput : engine.master;
    bus.connect(target);
    let send = null;
    // A serial reverb insert already wets the signal. Adding the global send on
    // top would make the audition drier-or-wetter than the loop it is meant to
    // represent, so skip it when the signal is already going through the chain.
    const useSend = reverb > 0 && target !== (fx && fx.chainInput);
    if (useSend) {
      send = ctx.createGain();
      send.gain.value = reverb;
      bus.connect(send);
      send.connect(engine.reverbInput);
    }
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3600;
      osc.type = type;
      osc.frequency.value = midi(note);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(1, now + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(filter);
      filter.connect(env);
      env.connect(bus);
      osc.start(now);
      osc.stop(now + duration + 0.05);
      osc.onended = () => {
        try {
          env.disconnect();
          bus.disconnect();
          if (send) send.disconnect();
        } catch (error) {
          // Already disconnected.
        }
      };
    }
    return true;
  }

  // Audition one track on its own: the same voice functions the loop uses, so
  // "点轨道头试听" hears that track's actual sound and not a placeholder beep.
  //
  // `voice` names a track, not a synthesis method — the five track types come
  // from the glossary (drums / bass / chords / lead / fx). A track with nothing
  // programmed still answers, because the point is to hear which instrument
  // owns that track before you put notes in it.
  function auditionTrack({ voice = 'chords', project = {} } = {}) {
    const ctx = ensure();
    const fx = engine.studioFx;
    const target = fx && fx.chainInput ? fx.chainInput : engine.master;
    const now = ctx.currentTime + 0.03;

    // A minimal session-shaped object. The voice helpers only ever read
    // `ctx`, `gain`, `reverbSend` and the `route`/`track` methods, so this
    // lets them run without a scheduler. `route` points straight at the
    // chain input when there is one, which keeps the audition in the chain.
    const fake = {
      ctx,
      gain: ctx.createGain(),
      reverbSend: ctx.createGain(),
      route(node, reverb = 0) {
        node.connect(this.gain);
        const extra = [];
        if (reverb > 0) {
          const send = ctx.createGain();
          send.gain.value = reverb;
          node.connect(send);
          send.connect(this.reverbSend);
          extra.push(send);
        }
        return extra;
      },
      track(source, nodes) {
        source.onended = () => {
          for (const node of nodes) {
            try {
              node.disconnect();
            } catch (error) {
              // Already disconnected.
            }
          }
          try {
            this.gain.disconnect();
            this.reverbSend.disconnect();
          } catch (error) {
            // Already disconnected.
          }
        };
      },
    };
    fake.gain.gain.value = 0.9;
    fake.gain.connect(target);
    fake.reverbSend.connect(target);

    const sound = project.sound || {};
    const root = 53; // F3, the tonic the starter progression sits on.

    if (voice === 'drums') {
      kick(fake, now, { gain: 0.8, decay: 0.3 });
      clap(fake, now + 0.25, { gain: 0.42, decay: 0.16 });
      hat(fake, now + 0.5, { gain: 0.05 });
      hat(fake, now + 0.625, { gain: 0.042, open: true });
    } else if (voice === 'bass') {
      bass(fake, now, {
        note: root - 12,
        duration: 0.5,
        gain: 0.22,
        cutoff: clamp(Number(sound.bassCutoff) || 620, 180, 2400),
        resonance: 3,
        type: sound.osc || 'sawtooth',
        drive: sound.bassDrive || 0,
      });
    } else if (voice === 'chords') {
      if (sound.chordVoice === 'pad') {
        pad(fake, now, { notes: [53, 56, 60], duration: 1.5, gain: 0.036, cutoff: Math.min(Number(sound.cutoff) || 2000, 2200) });
      } else {
        chord(fake, now, { notes: [53, 56, 60], duration: 1.2, gain: 0.05, cutoff: Math.min(Number(sound.cutoff) || 2400, 3600), detune: 7, reverb: 0.24 });
      }
    } else if (voice === 'lead') {
      if (sound.melodyVoice === 'lead') {
        lead(fake, now, { note: 77, duration: 0.5, gain: 0.055, cutoff: clamp((Number(sound.cutoff) || 3200) * 0.9, 600, 8000), detune: 6, reverb: 0.3 });
      } else {
        pluck(fake, now, { note: 77, duration: 0.45, gain: 0.06, cutoff: clamp((Number(sound.cutoff) || 4200) * 0.8, 600, 9000), type: sound.melodyVoice === 'bell' ? 'sine' : 'triangle' });
      }
    } else if (voice === 'fx') {
      fxRiser(fake, now, { duration: 1.1, gain: 0.09 });
      impact(fake, now + 0.15, { gain: 0.22 });
    } else {
      return false;
    }
    return true;
  }

  window.EMAudio = {
    supported: true,
    demos: DEMO_LIST,
    structureSections: STRUCTURE_SECTIONS,
    getDemoForEntry: demoForEntry,
    getState,
    onState,
    getLevels() {
      if (!engine.analyser || !engine.ctx || engine.ctx.state !== 'running') return null;
      engine.analyser.getByteFrequencyData(engine.levelData);
      return engine.levelData;
    },
    playDemo,
    playFingerprint,
    setFingerprintLayers,
    getFingerprint,
    stop,
    toggleMute,
    setVolume,
    startLab,
    setLabGroups,
    startDrumMachine,
    setDrumPattern,
    previewChord,
    startStudio,
    updateStudio,
    stopStudio,
    setChainOrder,
    auditionTrack,
    getStudioPlayhead,
    getPlayhead,
    previewStudio,
    playStructure,
    playMetronome,
    get isMuted() {
      return engine.muted;
    },
    get volume() {
      return engine.volume;
    },
  };
})();
