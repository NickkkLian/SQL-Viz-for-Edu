#!/usr/bin/env node
// Query Mirror — check.mjs
// Pins the click→SQL generator (tests/fixtures.json, 31 states written against the original explorer),
// executes every fixture in the vendored sql.js, tests the practice grader and the URL codec, and
// re-hashes the vendored sql.js files. `node check.mjs --break` flips two fixtures and must go red.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BREAK = process.argv.includes('--break');
const Q = require(path.join(ROOT, 'engine.js'));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

console.log('1. vendored sql.js (vendor/SOURCE.md)');
const PIN = { 'sql-wasm.js': '3358bb12892642698c0804c85cba48de562bc2de324fe58a422f282832c79c01',
              'sql-wasm.wasm': '4c1c978826062f7b1bb6cc811503863b01415175d0e6dd9ce8a30a81a02c0afb' };
for (const [f, h] of Object.entries(PIN)) ok(sha(path.join(ROOT, 'vendor', f)) === h, `vendor/${f} sha256 = ${h.slice(0, 12)}…`);
const b64src = fs.readFileSync(path.join(ROOT, 'vendor/sql-wasm-b64.js'), 'utf8');
const b64 = (b64src.match(/SQL_WASM_B64 = "([^"]+)"/) || [])[1] || '';
ok(crypto.createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex') === PIN['sql-wasm.wasm'], 'vendor/sql-wasm-b64.js decodes to the pinned .wasm bytes');
const src = fs.readFileSync(path.join(ROOT, 'vendor/SOURCE.md'), 'utf8');
ok(Object.values(PIN).every(h => src.includes(h)), 'vendor/SOURCE.md lists both hashes');

console.log('2. engine loads as a browser global');
const ctx = { self: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8'), ctx);
ok(ctx.self.QueryMirror && ctx.self.QueryMirror.VERSION === Q.VERSION, `self.QueryMirror.VERSION = ${Q.VERSION}`);

console.log('3. generator fixtures (tests/fixtures.json)');
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures.json'), 'utf8'));
if (BREAK) { fx.fixtures[0].sql = fx.fixtures[0].sql.replace('SELECT', 'SELECT DISTINCT'); fx.fixtures[3].rows += 1; console.log('  (--break: fixture h01 SQL and h04 row count were altered)'); }
const initSqlJs = require(path.join(ROOT, 'vendor/sql-wasm.js'));
const SQL = await initSqlJs({ locateFile: f => path.join(ROOT, 'vendor', f) });
const dbs = {};
for (const [name, ddl] of Object.entries(Q.DDL)) {
  const db = new SQL.Database();
  ddl.split(';').map(s => s.trim()).filter(s => s.length > 4).forEach(s => { try { db.run(s + ';'); } catch (e) {} });
  dbs[name] = db;
}
const exec = (db, sql) => { const r = dbs[db].exec(sql); return r.length ? { columns: r[0].columns, rows: r[0].values } : { columns: [], rows: [] }; };
let sqlSame = 0, rowsSame = 0, rtSame = 0;
for (const f of fx.fixtures) {
  const built = Q.buildSQL(f.state).sql;
  if (built === f.sql) sqlSame++; else console.log(`  FAIL ${f.id} (${f.note})\n       want: ${f.sql}\n       got:  ${built}`);
  const res = exec(f.state.db, built);
  if (res.rows.length === f.rows && res.columns.length === f.columns) rowsSame++; else console.log(`  FAIL ${f.id} rows/cols: want ${f.rows}×${f.columns}, got ${res.rows.length}×${res.columns.length}`);
  const rt = Q.decodeState(Q.encodeState(f.state)).state;
  if (JSON.stringify(rt) === JSON.stringify(f.state)) rtSame++; else console.log(`  FAIL ${f.id} URL round-trip changed the state`);
}
ok(sqlSame === fx.fixtures.length, `${sqlSame}/${fx.fixtures.length} fixtures produce the pinned SQL`);
ok(rowsSame === fx.fixtures.length, `${rowsSame}/${fx.fixtures.length} fixtures run in sql.js with the pinned row and column counts`);
ok(rtSame === fx.fixtures.length, `${rtSame}/${fx.fixtures.length} fixtures survive encodeState → decodeState`);
ok(fx.fixtures.length >= 30, `fixture set has ≥30 states (${fx.fixtures.length})`);
const legacy = Q.decodeState('?db=movies&tables=film,director');
ok(legacy.state.db === 'movies' && legacy.state.tables.join() === 'film,director' && Q.bridgesFor('movies', legacy.state.tables).join() === 'cast_link', 'legacy deep link ?db=movies&tables=film,director still pre-selects and bridges through cast_link');
const junk = Q.decodeState('?db=nope&tables=film,cast_link,zzz&q=!!!&mode=practice');
ok(junk.state.db === 'hospital' && junk.state.tables.length === 0 && junk.mode === 'practice', 'unknown db/tables/bad q are dropped, never trusted');

console.log('4. practice grader');
const E = { columns: ['Name', 'Fee ($)'], rows: [['Emily Anderson', 150], ['Liam Brown', 200], ['Sophia Clark', 175]] };
ok(Q.grade(E, { columns: ['Fee ($)', 'Name'], rows: [[200, 'Liam Brown'], [175, 'Sophia Clark'], [150, 'Emily Anderson']] }).ok, 'same rows, different column order and row order → match (unordered task)');
ok(Q.grade(E, { columns: ['name', 'fee ($)'], rows: [['Emily Anderson', 150], ['Liam Brown', 200], ['Sophia Clark', 175]] }, { ordered: true }).ok, 'same rows in the same order → match (ordered task, header case ignored)');
const wrongOrder = Q.grade(E, { columns: ['Name', 'Fee ($)'], rows: [['Liam Brown', 200], ['Emily Anderson', 150], ['Sophia Clark', 175]] }, { ordered: true });
ok(!wrongOrder.ok && wrongOrder.firstDiff === 0, 'same rows, wrong order on an ordered task → mismatch at row 1');
const wrongCol = Q.grade(E, { columns: ['Name', 'Diagnosis'], rows: [['Emily Anderson', 'Hypertension'], ['Liam Brown', 'Migraine'], ['Sophia Clark', 'Arrhythmia']] });
ok(!wrongCol.ok && wrongCol.byValue && wrongCol.missing.length === 3 && wrongCol.extra.length === 3, 'wrong column selected → mismatch, every row flagged (missing 3 / extra 3)');
const partial = Q.grade(E, { columns: ['Name', 'Fee ($)'], rows: [['Emily Anderson', 150], ['Liam Brown', 200]] });
ok(!partial.ok && partial.missing.join() === '2' && partial.extra.length === 0, 'one row short → exactly that row reported missing');
const renamed = Q.grade(E, { columns: ['n', 'f'], rows: [['Sophia Clark', 175], ['Emily Anderson', 150], ['Liam Brown', 200]] });
ok(renamed.ok && renamed.byValue, 'renamed columns fall back to value matching and still pass');
ok(!Q.grade(E, { columns: ['Name'], rows: [['Emily Anderson']] }).ok, 'different column count → mismatch');
ok(Q.grade({ columns: ['x'], rows: [[0.1 + 0.2]] }, { columns: ['x'], rows: [[0.3]] }).ok, 'floating point compared with tolerance');
ok(Q.grade({ columns: ['x'], rows: [[null]] }, { columns: ['x'], rows: [[null]] }).ok && !Q.grade({ columns: ['x'], rows: [[null]] }, { columns: ['x'], rows: [['']] }).ok, 'NULL equals NULL but not the empty string');
ok(Q.isSelectOnly('SELECT 1') && Q.isSelectOnly('with t as (select 1) select * from t;') && !Q.isSelectOnly('select 1; drop table film') && !Q.isSelectOnly('DROP TABLE film') && !Q.isSelectOnly(''), 'practice accepts exactly one SELECT/WITH statement');
// end-to-end: a student answer graded against a real fixture through sql.js
const task = fx.fixtures.find(f => f.id === 'u02');
const expected = exec('university', task.sql);
const student = exec('university', 'select avg(gpa) as "Average of GPA", major as "Major" from student group by major having avg(gpa) > 3.4');
ok(Q.grade(expected, student).ok, 'fixture u02: a hand-written equivalent query with swapped columns is graded correct');
const studentWrong = exec('university', 'select major, max(gpa) from student group by major having avg(gpa) > 3.4');
const wrongVerdict = Q.grade(expected, studentWrong);
ok(!wrongVerdict.ok, 'fixture u02: MAX instead of AVG is graded wrong');
ok(wrongVerdict.unmatchedColumns.join() === 'Average of GPA', 'fixture u02: the verdict names the one wrong column (Average of GPA), not the right one (Major)');
ok(Q.grade(expected, student).unmatchedColumns.length === 0, 'fixture u02: a correct answer has no unmatched columns');

console.log('5. page hygiene');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Loaded resources only (anchors are links, not requests). The one allowed third party is the Google Fonts stylesheet.
const THIRD_PARTY = /<(script|img|iframe|source|video|audio)\b[^>]*\bsrc="https?:\/\/|<link\b(?=[^>]*\brel="(stylesheet|preload|modulepreload|icon|manifest)")(?![^>]*\bhref="https:\/\/fonts\.googleapis\.com\/)[^>]*\bhref="https?:\/\//;
ok(THIRD_PARTY.test('<script src="https://cdnjs.cloudflare.com/x.js"></script>') && THIRD_PARTY.test('<link rel="stylesheet" href="https://cdn.example/x.css">')
   && !THIRD_PARTY.test('<a href="https://github.com/x">') && !THIRD_PARTY.test('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'),
   'third-party resource pattern flags CDN scripts/styles and ignores links and the font stylesheet (negative control)');
ok(!THIRD_PARTY.test(html), 'index.html loads nothing from a third-party origin except the Google Fonts stylesheet');
ok(/vendor\/sql-wasm\.js/.test(html) && /vendor\/sql-wasm-b64\.js/.test(html) && /engine\.js/.test(html), 'index.html loads the vendored sql.js, the base64 wasm and engine.js');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
ok(readme.includes(`${fx.fixtures.length} fixtures`), `README states the fixture count (${fx.fixtures.length} fixtures)`);
ok(readme.includes(PIN['sql-wasm.wasm'].slice(0, 16)), 'README states the pinned sql-wasm.wasm hash');

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}: ${pass} passed, ${fail} failed${BREAK ? ' (--break run: red is the expected result)' : ''}`);
process.exit(fail ? 1 : 0);
