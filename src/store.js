// store.js: everything Smile Monster keeps, in one localStorage record on this device.
//
// Kept: consent timestamp, settings, the campaign (cause, sponsors with their snack jokes,
// pledge terms and confirmed donations), the monster's "diet" (how many smiles each joke
// category earned, plus a count of surprise moments), and
// per-session totals. Never kept: video, images, face landmarks, expression scores, blink,
// talking or breathing data, pulse values, or anything that identifies a person.

import { emptyMonster } from './monster.js';
import { emptyProgress, normalizeProgress } from './adventure/levels.js';

export const SPONSOR_COLOURS = ['#ef6f5e', '#2f8fd8', '#f4a72a', '#7b4cd8', '#2f9e6b', '#e05aa8'];

export const STORAGE_KEY = 'smilemonster.v1';
// Saves made by earlier versions of the app used this key. load() moves them across once.
export const LEGACY_STORAGE_KEYS = ['smilejar.v1'];
export const CONSENT_VERSION = 1;

export function defaultState() {
  return {
    version: 1,
    consent: null, // { version, acceptedAt }
    settings: { telemetry: false, showPulse: false, breathMirror: true, sessionMinutes: 2, sound: true, music: true, volume: 0.7, howToSeen: false, diagnostics: false },
    storySeen: false, // the opening story plays once; it can be replayed from the home screen
    campaign: {
      cause: 'Local food bank',
      goalCents: 2500,
      sponsors: [
        { id: 's1', name: 'Grandma Lee', centsPerSmile: 10, capCents: 1000, color: SPONSOR_COLOURS[0],
          snack: 'Why did the banana go to the doctor? It was not peeling well.', snackSmiles: 0, confirmedCents: 0 },
        { id: 's2', name: 'Office crew', centsPerSmile: 5, capCents: 500, color: SPONSOR_COLOURS[1],
          snack: 'Remember when the printer jammed during the big client demo?', snackSmiles: 0, confirmedCents: 0 },
      ],
    },
    monster: emptyMonster(),
    pastMonsters: [], // { name, stage, smiles, retiredAt } when the user starts a new monster
    sessions: [],
    adventure: emptyProgress(), // Expression Adventure: levels unlocked and best stars / score
  };
}

/** Fill in fields that older saves (or a freshly added row) may not have. */
export function normalizeSponsor(sp, i = 0) {
  return {
    id: sp?.id || `s${Date.now()}${i}`,
    name: String(sp?.name || 'Sponsor'),
    centsPerSmile: Math.max(0, Math.round(Number(sp?.centsPerSmile) || 0)),
    capCents: Math.max(0, Math.round(Number(sp?.capCents) || 0)),
    color: sp?.color || SPONSOR_COLOURS[i % SPONSOR_COLOURS.length],
    snack: String(sp?.snack || ''),
    snackSmiles: Math.max(0, Math.round(Number(sp?.snackSmiles) || 0)),
    confirmedCents: Math.max(0, Math.round(Number(sp?.confirmedCents) || 0)),
  };
}

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/**
 * Move a save from an older key to the current one. The old copy is removed only after the new
 * one has been written and reads back identical, so a failure can never lose progress.
 */
export function migrateLegacySave(st = storage()) {
  if (!st) return false;
  try {
    if (st.getItem(STORAGE_KEY)) return false;
    for (const key of LEGACY_STORAGE_KEYS) {
      const raw = st.getItem(key);
      if (!raw) continue;
      JSON.parse(raw); // only move a save that is readable
      st.setItem(STORAGE_KEY, raw);
      if (st.getItem(STORAGE_KEY) === raw) st.removeItem(key);
      return true;
    }
  } catch { /* leave everything where it was */ }
  return false;
}

export function load() {
  const base = defaultState();
  try {
    migrateLegacySave();
    const raw = storage()?.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((k) => storage()?.getItem(k)).find(Boolean);
    if (!raw) return base;
    const s = JSON.parse(raw);
    const sessions = Array.isArray(s.sessions) ? s.sessions : [];
    const campaign = { ...base.campaign, ...(s.campaign || {}) };
    campaign.sponsors = (Array.isArray(campaign.sponsors) ? campaign.sponsors : []).map(normalizeSponsor);
    // A save from before the monster existed: give it the smiles already earned.
    const oldMonster = s.monster ? {} : { smiles: sessions.reduce((a, x) => a + (x.smiles || 0), 0) };
    return {
      ...base,
      ...s,
      settings: { ...base.settings, ...(s.settings || {}) },
      campaign,
      monster: { ...base.monster, ...oldMonster, ...(s.monster || {}), diet: { ...base.monster.diet, ...(s.monster?.diet || {}) } },
      pastMonsters: Array.isArray(s.pastMonsters) ? s.pastMonsters : [],
      sessions,
      adventure: normalizeProgress(s.adventure), // older saves have none: start at Level 1
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
  try { for (const k of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) storage()?.removeItem(k); } catch { /* nothing stored */ }
  return defaultState();
}

export function hasConsent(state) {
  return !!state.consent && state.consent.version === CONSENT_VERSION;
}

export function totalSmiles(state) {
  return state.sessions.reduce((a, s) => a + (s.smiles || 0), 0);
}
