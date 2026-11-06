// build.mjs: bundles renderer.js into dist/renderer.bundle.js with esbuild.
// The API key is read from the SMARTSPECTRA_API_KEY environment variable or
// from a local .env file (never committed). Pass --simulate to build a UI-only
// preview that fakes the expression signal (clearly labelled in the app).
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';

function readDotEnv() {
  if (!existsSync('.env')) return {};
  const out = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const simulate = process.argv.includes('--simulate');
const apiKey = process.env.SMARTSPECTRA_API_KEY || readDotEnv().SMARTSPECTRA_API_KEY || '';

if (!simulate && !apiKey) {
  console.warn('\n[smile-jar] No SMARTSPECTRA_API_KEY found. Copy .env.example to .env and add your key,\n' +
               '            or run `npm run simulate` to try the UI without the SDK.\n');
}

await build({
  entryPoints: ['renderer.js'],
  bundle: true,
  outfile: 'dist/renderer.bundle.js',
  platform: 'browser',
  format: 'iife',
  logLevel: 'warning',
  define: {
    __SMARTSPECTRA_API_KEY__: JSON.stringify(simulate ? '' : apiKey),
    __SIMULATE__: JSON.stringify(simulate),
  },
});
console.log(`[smile-jar] built dist/renderer.bundle.js (${simulate ? 'SIMULATED signal' : 'live SmartSpectra SDK'})`);
