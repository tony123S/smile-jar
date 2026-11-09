// voice.js: Momo talks out loud, using the computer's own speech voices (SpeechSynthesis).
// Nothing is recorded or sent anywhere; this only speaks. If the computer has no voices
// (common on Linux) or voice is switched off, Momo's lines still appear in the speech bubble.
//
// Rules so it never gets messy:
//   - one line at a time, never two voices on top of each other
//   - while a line is playing, only the newest waiting line is kept; old ones are dropped
//   - a waiting line that is too old by the time it would start is skipped (it no longer fits)
//   - the music dips while Momo talks

export const VOICE = Object.freeze({
  pitch: 1.55,    // small and squeaky
  rate: 1.08,
  staleMs: 2500,  // a line that waited longer than this is skipped
});

/** Pick a friendly English voice from what the computer has, or null if there are none. */
export function pickVoice(voices) {
  const en = (voices || []).filter((v) => /^en/i.test(v.lang || ''));
  if (!en.length) return null;
  const nice = en.find((v) => /female|samantha|karen|zira|aria|jenny|google us english|moira|tessa/i.test(v.name));
  return nice || en.find((v) => v.default) || en[0];
}

export class MomoVoice {
  /**
   * @param {object} o
   * @param {object} [o.synth]    a SpeechSynthesis (window.speechSynthesis); missing = bubbles only
   * @param {Function} [o.Utterance] the SpeechSynthesisUtterance constructor
   * @param {Function} [o.onTalk] called with true when Momo starts talking and false when it stops (to dip the music)
   * @param {Function} [o.now]
   */
  constructor({ synth = null, Utterance = null, onTalk = () => {}, now = () => Date.now(), ...opts } = {}) {
    this.o = { ...VOICE, ...opts };
    this.synth = synth;
    this.Utterance = Utterance;
    this.onTalk = onTalk;
    this.now = now;
    this.enabled = true;
    this.volume = 0.8;
    this.speaking = null;
    this.pending = null;
  }

  /** True when the computer can actually speak (has a synth and at least one English voice). */
  available() {
    if (!this.synth || !this.Utterance) return false;
    try { return !!pickVoice(this.synth.getVoices()); } catch { return false; }
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.stop();
  }

  setVolume(v) { this.volume = Math.max(0, Math.min(1, Number(v) || 0)); }

  /** Say a line (or queue it behind the current one). Returns true if it will be spoken aloud. */
  say(text) {
    if (!text || !this.enabled || !this.available()) return false;
    const line = { text, at: this.now() };
    if (this.speaking) { this.pending = line; return true; }
    this.start(line);
    return true;
  }

  start(line) {
    let u;
    try {
      u = new this.Utterance(line.text);
      u.pitch = this.o.pitch;
      u.rate = this.o.rate;
      u.volume = this.volume;
      const v = pickVoice(this.synth.getVoices());
      if (v) { u.lang = v.lang; u.voice = v; }
    } catch {
      // A speech engine that misbehaves must never break the game: the bubble still shows the line.
      if (!u) return;
    }
    const done = () => {
      if (this.speaking !== u) return;
      this.speaking = null;
      const next = this.pending;
      this.pending = null;
      if (next && this.now() - next.at <= this.o.staleMs && this.enabled) this.start(next);
      else this.onTalk(false);
    };
    u.onend = done;
    u.onerror = done;
    if (!this.speaking) this.onTalk(true);
    this.speaking = u;
    try { this.synth.speak(u); } catch { done(); }
  }

  /** Stop talking now and forget anything waiting (end of a level, voice switched off). */
  stop() {
    const was = !!this.speaking;
    this.pending = null;
    this.speaking = null;
    try { this.synth?.cancel(); } catch { /* nothing to cancel */ }
    if (was) this.onTalk(false);
  }
}
