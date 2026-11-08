// store.js: everything Smile Jar keeps, in one localStorage record on this device.
//
// Kept: consent timestamp, settings, the campaign (cause + sponsors), and per-session
// totals { endedAt, durationMs, smiles, pledgedCents }. Never kept: video, images,
// face landmarks, expression scores, pulse values, or anything that identifies a person.

export const STORAGE_KEY = 'smilejar.v1';
export const CONSENT_VERSION = 1;

export function defaultState() {
  return {
    version: 1,
    consent: null, // { version, acceptedAt }
    settings: { telemetry: false, showPulse: false, sessionMinutes: 2, sound: true },
    campaign: {
      cause: 'Local food bank',
      goalCents: 2500,
      sponsors: [
        { id: 's1', name: 'Grandma Lee', centsPerSmile: 10, capCents: 1000 },
        { id: 's2', name: 'Office crew', centsPerSmile: 5, capCents: 500 },
      ],
    },
    sessions: [],
  };
}

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function load() {
  const base = defaultState();
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    return {
      ...base,
      ...s,
      settings: { ...base.settings, ...(s.settings || {}) },
      campaign: { ...base.campaign, ...(s.campaign || {}) },
      sessions: Array.isArray(s.sessions) ? s.sessions : [],
    };
  } catch {
    return base;
  }
}

export function save(state) {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

/** Erase everything, including consent. The app returns to the consent screen. */
export function wipe() {
  try { storage()?.removeItem(STORAGE_KEY); } catch { /* nothing stored */ }
  return defaultState();
}

export function hasConsent(state) {
  return !!state.consent && state.consent.version === CONSENT_VERSION;
}

export function totalSmiles(state) {
  return state.sessions.reduce((a, s) => a + (s.smiles || 0), 0);
}
