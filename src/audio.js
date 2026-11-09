// audio.js: one shared Web Audio context with separate buses for music and sound effects.
//
//   music bus ─┐
//              ├─► master (volume) ─► speakers
//   sfx bus  ──┘
//
// The context is created only after the player interacts with the app (browsers require it,
// and it means nothing plays before the player has done anything). No audio files, no network.

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
const prefs = { volume: 0.7, music: true, sfx: true };

export function audioContext() { return ctx; }

/** Create (or resume) the context. Call from a user gesture. Returns null if Web Audio is missing. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(ctx.destination);
      applyPrefs(true);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function applyPrefs(instant = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const ramp = (param, v) => {
    param.cancelScheduledValues(t);
    if (instant) param.setValueAtTime(v, t);
    else { param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(v, t + 0.25); }
  };
  ramp(master.gain, prefs.volume);
  ramp(musicBus.gain, prefs.music ? 0.55 : 0);
  ramp(sfxBus.gain, prefs.sfx ? 1 : 0);
}

export function setAudioPrefs({ volume, music, sfx } = {}) {
  if (typeof volume === 'number' && Number.isFinite(volume)) prefs.volume = Math.max(0, Math.min(1, volume));
  if (typeof music === 'boolean') prefs.music = music;
  if (typeof sfx === 'boolean') prefs.sfx = sfx;
  applyPrefs();
}

export function audioPrefs() { return { ...prefs }; }

/** The bus a sound should connect to, or null when that kind of sound is off or audio isn't unlocked. */
export function bus(kind) {
  if (!ctx) return null;
  if (kind === 'music') return prefs.music ? musicBus : null;
  return prefs.sfx ? sfxBus : null;
}

/** The music bus itself (the music player fades its own tracks into it). */
export function musicNode() { return musicBus; }

let held = false;
/** Keep the music lowered while Momo is talking (true), and bring it back afterwards (false). */
export function holdDuck(on, to = 0.3) {
  held = !!on;
  if (!ctx || !prefs.music) return;
  const t = ctx.currentTime;
  const g = musicBus.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(held ? 0.55 * to : 0.55, t + (held ? 0.15 : 0.6));
}

/** Briefly lower the music, e.g. under an evolution fanfare. */
export function duckMusic(seconds = 2.2, to = 0.15) {
  if (!ctx || !prefs.music || held) return;
  const t = ctx.currentTime;
  const g = musicBus.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0.55 * to, t + 0.2);
  g.setValueAtTime(0.55 * to, t + seconds);
  g.linearRampToValueAtTime(0.55, t + seconds + 0.8);
}
