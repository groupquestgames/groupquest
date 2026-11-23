const NOTES = {
  turn: [[174, 0, 0.1, 0.055], [260, 0.025, 0.12, 0.03]],
  light: [[392, 0, 0.34, 0.09], [587.33, 0.05, 0.32, 0.07], [783.99, 0.09, 0.46, 0.045]],
  dock: [[293.66, 0, 0.45, 0.09], [440, 0.08, 0.58, 0.07], [587.33, 0.16, 0.56, 0.07], [739.99, 0.24, 0.7, 0.045]],
  blocked: [[105, 0, 0.14, 0.08]],
  rewind: [[293.66, 0, 0.15, 0.04], [196, 0.06, 0.16, 0.03]]
};
export function createAudio(music) {
  music.volume = 0.32;
  let context, enabled = false;
  return {
    unlock() {
      if (enabled) return;
      enabled = true;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) context = new AudioContext();
      } catch {}
    },
    sync(settings, paused) {
      if (enabled && settings.music && !paused && document.visibilityState === 'visible') {
        music.play().catch(() => {});
      } else music.pause();
    },
    play(name, settings) {
      if (!settings.sound || !context) return;
      context.resume().catch(() => {});
      const now = context.currentTime;
      for (const [frequency, offset, length, volume] of NOTES[name]) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = name === 'turn' || name === 'blocked' ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(frequency, now + offset);
        if (name === 'turn') osc.frequency.exponentialRampToValueAtTime(frequency * 0.65, now + offset + length);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(volume, now + offset + 0.016);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + length);
        osc.connect(gain).connect(context.destination);
        osc.start(now + offset);
        osc.stop(now + offset + length);
      }
    }
  };
}
