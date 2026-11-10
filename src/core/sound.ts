let ctx: AudioContext | null = null;

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType = "sine", gain = 0.08) {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch {
    /* audio unavailable */
  }
}

export const sounds = {
  pick: () => tone(660, 0, 0.08, "triangle", 0.05),
  correct: () => {
    tone(523, 0, 0.15);
    tone(784, 0.1, 0.25);
  },
  wrong: () => {
    tone(220, 0, 0.18, "sawtooth", 0.04);
    tone(165, 0.12, 0.3, "sawtooth", 0.04);
  },
  step: () => tone(880, 0, 0.06, "sine", 0.04),
};
