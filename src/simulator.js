// simulator.js: UI-only stand-in for the SmartSpectra SDK, used by `npm run simulate`
// and the browser preview. It emits decoded-Metrics-shaped objects so the rest of the
// app runs unchanged. Hold the Space bar to "smile". The app shows a SIMULATED banner
// whenever this is active; it is never used in the real build.

import { ExpressionType } from './smile-detector.js';

export class SimulatedSDK {
  constructor({ requestPulse = false } = {}) {
    this.handlers = {};
    this.requestPulse = requestPulse;
    this.timer = null;
    this.happy = 5;
    this.smiling = false;
    this.onKey = (e) => {
      if (e.code !== 'Space' || e.target?.tagName === 'INPUT') return;
      e.preventDefault();
      this.smiling = e.type === 'keydown';
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
    const target = this.smiling ? 88 : 6;
    this.happy += (target - this.happy) * 0.35;
    const now = Date.now() * 1000;
    const rest = Math.max(0, 100 - this.happy);
    const metrics = {
      face: {
        expression: [{
          stable: true,
          timestamp: now,
          scores: [
            { type: ExpressionType.HAPPY, confidence: this.happy },
            { type: ExpressionType.NEUTRAL, confidence: rest * 0.9 },
            { type: ExpressionType.SURPRISE, confidence: rest * 0.1 },
          ],
        }],
      },
    };
    if (this.requestPulse) {
      metrics.cardio = { pulseRate: [{ value: 68 + Math.sin(now / 4e6) * 4, timestamp: now, stable: true }] };
    }
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
