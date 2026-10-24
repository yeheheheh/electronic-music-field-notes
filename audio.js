(() => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    window.EMAudio = {
      supported: false,
      demos: [],
      getDemoForEntry: () => null,
      onState: () => () => {},
      playDemo: () => false,
      stop: () => {},
      toggleMute: () => false,
      setVolume: () => {},
      getState: () => ({ supported: false, playing: false }),
      startLab: () => false,
      setLabGroups: () => {},
      playStructure: () => false,
      playMetronome: () => false,
      structureSections: [],
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
    master: null,
    compressor: null,
    output: null,
    reverb: null,
    reverbInput: null,
    noise: null,
    session: null,
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
        try {
          this.pattern({ session: this, time: this.nextTime, step, bar, globalStep: this.step });
        } catch (error) {
          console.error('Audio pattern error', error);
        }
        this.nextTime += this.stepDuration;
        this.step += 1;
        if (!this.loop) {
          if (this.step >= this.totalSteps) {
            this.running = false;
            clearInterval(this.timer);
            break;
          }
        } else if (this.step >= this.totalSteps) {
          this.step = 0;
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
    stop,
    toggleMute,
    setVolume,
    startLab,
    setLabGroups,
    startDrumMachine,
    setDrumPattern,
    previewChord,
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
