#!/usr/bin/env node
// Query Mirror — tests/boot-failure.mjs
// When the SQL engine cannot start, the page must keep saying so. Copies the page into a temp folder, replaces
// vendor/sql-wasm-b64.js with a broken engine (truncated, garbage, empty, not base64), opens it in headless Chrome
// and reads the DOM after 1.5 s: the "SQLite could not start" alert with its Reload button must still be there and
// the status line must say "SQLite failed to load". Until this test, the 300 ms loading timer called update() after
// the failure and "Loading SQLite…" replaced the alert for good. A control copy with the real engine must reach
// "SQLite ready" and show no alert, so a harness that sees nothing cannot pass.
//
//   node tests/boot-failure.mjs            # Chrome from $CHROME, or the usual install paths
//
// Exits 1 on any failure, including "no Chrome found" (a skipped browser test would read as a pass).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };

const CANDIDATES = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const CHROME = CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME) { console.log('FAIL: no Chrome found (set CHROME=/path/to/chrome); tried ' + CANDIDATES.join(', ')); process.exit(1); }

const BREAKS = {
  truncated: 'AGFzbQEAAAD/////',   // the wasm magic word and version, then a section cut off mid-length
  garbage: 'AAAAAAAAAAAAAAAA',     // valid base64, not wasm
  empty: '',
  notbase64: '@@not-base64@@',     // atob() throws before sql.js is called
};
// no tables (the first visit) and a deep link with tables selected: #results takes a different branch in each
const URLS = { 'first visit': '', 'deep link': '?db=movies&tables=film,director' };

function copyPage(b64) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qm-boot-'));
  for (const f of fs.readdirSync(ROOT)) if (/\.(html|js|css|svg|png)$/.test(f)) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.mkdirSync(path.join(dir, 'vendor'));
  for (const f of ['sql-wasm.js', 'sql-wasm-b64.js']) fs.copyFileSync(path.join(ROOT, 'vendor', f), path.join(dir, 'vendor', f));
  if (b64 !== null) fs.writeFileSync(path.join(dir, 'vendor/sql-wasm-b64.js'), `window.SQL_WASM_B64 = ${JSON.stringify(b64)};\n`);
  return dir;
}
function dom(dir, query) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qm-chrome-'));
  try {
    return execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', `--user-data-dir=${profile}`,
      '--virtual-time-budget=1500', '--dump-dom', pathToFileURL(path.join(dir, 'index.html')).href + query],
      { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
}
const text = html => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const results = html => (html.match(/<section class="card" id="results"[^>]*>([\s\S]*?)<\/section>/) || [])[1];
const status = html => { const m = html.match(/<span class="status ([a-z]+)" id="status">([\s\S]*?)<\/span>/); return m ? { cls: m[1], text: text(m[2]).trim() } : null; };

console.log('1. control: the real engine starts (the harness can see the page)');
const good = copyPage(null);
try {
  for (const [label, q] of Object.entries(URLS)) {
    const html = dom(good, q); const st = status(html);
    ok(st && st.cls === 'ok' && /^SQLite ready/.test(st.text) && !/role="alert"/.test(html), `${label}: status "${st ? st.text : '(no #status)'}", no alert`);
  }
} finally { fs.rmSync(good, { recursive: true, force: true }); }

console.log('2. broken engine: the alert survives the 300 ms loading timer (DOM read after 1.5 s)');
for (const [name, b64] of Object.entries(BREAKS)) {
  const dir = copyPage(b64);
  try {
    for (const [label, q] of Object.entries(URLS)) {
      const html = dom(dir, q); const r = results(html) || ''; const st = status(html);
      const alert = /<div class="error" role="alert">/.test(r) && text(r).includes('SQLite could not start');
      const reload = /<button type="button" class="btn btn-sm">Reload<\/button>/.test(r);
      ok(alert && reload && st && st.cls === 'err' && st.text === 'SQLite failed to load' && !/Loading SQLite/.test(html),
        `${name}, ${label}: alert ${alert ? 'present' : 'MISSING'}, Reload button ${reload ? 'present' : 'MISSING'}, status "${st ? st.text : '(no #status)'}"`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
