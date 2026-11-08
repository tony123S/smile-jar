import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, notesAt, loopLength, STEPS_PER_BAR } from '../src/music.js';
import { setAudioPrefs, audioPrefs, bus } from '../src/audio.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

test('every music track loops seamlessly', () => {
  for (const name of Object.keys(TRACKS)) {
    const len = loopLength(name);
    assert.equal(len % STEPS_PER_BAR, 0);
    assert.equal(TRACKS[name].melody.length, TRACKS[name].chords.length, `${name} melody covers every bar`);
    for (let s = 0; s < len; s++) assert.deepEqual(notesAt(name, s + len), notesAt(name, s), `${name} step ${s}`);
    assert.ok(notesAt(name, 0).some((n) => n.inst === 'pad'), `${name} starts each loop with a chord`);
    const all = Array.from({ length: len }, (_, s) => notesAt(name, s)).flat();
    assert.ok(all.every((n) => n.gain > 0 && n.gain < 0.3), `${name} stays gentle`);
  }
});

test('tracks have their own moods', () => {
  assert.ok(TRACKS.story.bpm < TRACKS.home.bpm && TRACKS.home.bpm < TRACKS.play.bpm, 'story is slowest, gameplay fastest');
  assert.ok(notesAt('play', 0).some((n) => n.inst === 'kick'), 'gameplay has a beat');
  assert.ok(!Array.from({ length: loopLength('story') }, (_, s) => notesAt('story', s)).flat().some((n) => n.inst === 'kick'), 'story has no drums');
});

test('audio prefs clamp volume and gate buses before the player interacts', () => {
  setAudioPrefs({ volume: 3, music: false, sfx: true });
  assert.equal(audioPrefs().volume, 1);
  assert.equal(audioPrefs().music, false);
  setAudioPrefs({ volume: -1 });
  assert.equal(audioPrefs().volume, 0);
  // no AudioContext exists until unlockAudio() runs from a user gesture, so nothing can play
  assert.equal(bus('sfx'), null);
  assert.equal(bus('music'), null);
});

test('an old Smile Jar save still loads, and the story is offered once', async () => {
  const old = {
    version: 1,
    consent: { version: 1, acceptedAt: '2026-11-01T00:00:00Z' },
    settings: { telemetry: false, showPulse: false, sessionMinutes: 2 },
    campaign: { cause: 'Animal shelter', goalCents: 5000, sponsors: [{ id: 's1', name: 'Gran', centsPerSmile: 10, capCents: 1000 }] },
    sessions: [{ id: 'x1', endedAt: '2026-11-01T00:05:00Z', durationMs: 120000, smiles: 9, mode: 'smile', pledgedCents: 90 }],
  };
  globalThis.localStorage = memoryStorage({ 'smilejar.v1': JSON.stringify(old) });
  const store = await import('../src/store.js');
  const s = store.load();
  assert.equal(store.hasConsent(s), true);
  assert.equal(s.campaign.cause, 'Animal shelter');
  assert.equal(s.sessions.length, 1);
  assert.equal(s.monster.smiles, 9, 'old smiles hatch the monster');
  assert.equal(s.campaign.sponsors[0].confirmedCents, 0);
  assert.match(s.campaign.sponsors[0].color, /^#/);
  assert.equal(s.settings.music, true);
  assert.equal(s.settings.volume, 0.7);
  assert.equal(s.storySeen, false);
  s.storySeen = true;
  store.save(s);
  assert.equal(store.load().storySeen, true, 'story is not shown again once seen');
  assert.equal(store.wipe().storySeen, false);
  delete globalThis.localStorage;
});
