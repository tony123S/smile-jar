// simulator.js: UI-only stand-in for the SmartSpectra SDK, used by `npm run simulate`
// and the browser preview. It emits decoded-Metrics-shaped objects so the rest of the
// app runs unchanged. Hold Space to "smile", G for a big grin, W for surprise, T to "talk",
// B to blink, H to step out of view (no face). It also fakes a slow breathing trace. The app shows a SIMULATED banner
// whenever this is active; it is never used in the real build.

import { ExpressionType } from './smile-detector.js';

export class SimulatedSDK {
  constructor({ requestPulse = false } = {}) {
    this.handlers = {};
    this.requestPulse = requestPulse;
    this.timer = null;
    this.happy = 5;
    this.surprise = 3;
    this.smiling = false;
    this.bigGrin = false;
    this.surprised = false;
    this.talking = false;
    this.blinking = false;
    this.away = false;
    this.t0 = Date.now();
    this.nextAutoBlink = Date.now() + 2500;
    this.onKey = (e) => {
      if (e.target?.tagName === 'INPUT') return;
      const down = e.type === 'keydown';
      if (e.code === 'Space') { e.preventDefault(); this.smiling = down; }
      if (e.code === 'KeyG') this.bigGrin = down;   // hold G for a golden grin
      if (e.code === 'KeyW') this.surprised = down; // hold W for a jaw-drop
      if (e.code === 'KeyT') this.talking = down;   // hold T to "talk"
      if (e.code === 'KeyB') this.blinking = down;  // hold B to blink
      if (e.code === 'KeyH') this.away = down;      // hold H to step out of view (no face at all)
    };
  }

  on(event, cb) { (this.handlers[event] ||= []).push(cb); return this; }
  emit(event, ...args) { for (const cb of this.handlers[event] || []) cb(...args); }

  async start() {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.emit('processingStatus', 2);
    setTimeout(() => this.emit('processingStatus', 3), 300);
    setTimeout(() => this.emit('validationStatus', 0, Date.now() * 1000, ''), 400);
    this.timer = setInterval(() => this.tick(), 100);
  }

  tick() {
    const target = this.bigGrin ? 98 : this.smiling ? 88 : 6;
    this.happy += (target - this.happy) * 0.35;
    this.surprise += ((this.surprised ? 85 : 3) - this.surprise) * 0.35;
    const now = Date.now() * 1000;
    const rest = Math.max(0, 100 - this.happy);
    const metrics = {
      face: {
        expression: [{
          stable: true,
          timestamp: now,
          scores: [
            { type: ExpressionType.HAPPY, confidence: this.happy },
            { type: ExpressionType.NEUTRAL, confidence: Math.max(0, rest - this.surprise) },
            { type: ExpressionType.SURPRISE, confidence: this.surprise },
          ],
        }],
      },
    };
    const ms = Date.now();
    let blink = this.blinking;
    if (ms >= this.nextAutoBlink) { blink = true; if (ms >= this.nextAutoBlink + 150) this.nextAutoBlink = ms + 2500 + Math.random() * 2500; }
    metrics.face.blinking = [{ detected: blink, stable: true, timestamp: now }];
    metrics.face.talking = [{ detected: this.talking, stable: true, timestamp: now }];
    metrics.breathing = { upperTrace: [{ value: Math.sin(((ms - this.t0) / 4000) * Math.PI * 2), timestamp: now, stable: true }] };
    if (this.requestPulse) {
      metrics.cardio = { pulseRate: [{ value: 68 + Math.sin(now / 4e6) * 4, timestamp: now, stable: true }] };
    }
    if (this.away) { delete metrics.face; delete metrics.breathing; } // like a real camera with nobody in it
    this.emit('metrics', metrics, now);
  }

  async stop() {
    clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.emit('processingStatus', 1);
  }

  async reset() { await this.stop(); }
  destroy() { clearInterval(this.timer); }
}
