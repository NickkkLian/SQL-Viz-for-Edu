#!/usr/bin/env node
// New behaviour checks execute the same vendored SQLite used by the page.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Q = require(process.env.QM_ENGINE_PATH || '../engine.js');
const initSqlJs = require('../vendor/sql-wasm.js');
const SQL = await initSqlJs({ wasmBinary: require('node:fs').readFileSync(new URL('../vendor/sql-wasm.wasm', import.meta.url)) });
let pass = 0, fail = 0;
const test = (name, fn) => { try { if (!fn()) throw new Error('assertion false'); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + e.message); } };
const dbs = Object.fromEntries(Object.entries(Q.DDL).map(([id, ddl]) => { const db = new SQL.Database(); db.run(ddl); return [id, db]; }));
const run = (db, sql) => Q.runQuery(dbs[db], sql);
const st = { ...Q.emptyState('movies'), tables: ['film'], cols: ['fi_title', 'fi_rating'], limit: '10', sort: { col: 'fi_rating', dir: 'DESC' } };
test('displayed LIMIT is executable SQLite and returns the same ten rows', () => {
  const sql = Q.buildSQL(st).sql, shown = Q.formatSQL(sql);
  return /\nLIMIT 10$/.test(shown) && !shown.includes('ROWNUM') && run('movies', shown).rows.length === 10 && Q.grade(run('movies', sql), run('movies', shown), { ordered: true }).ok;
});
test('formatting preserves quoted keywords, apostrophes and whitespace', () => {
  const sql = `SELECT 'rock AND roll  OR LIMIT 10', 'O''Brien' AS "FROM here"`;
  return Q.grade(run('movies', sql), run('movies', Q.formatSQL(sql))).ok;
});
const mixed = { ...st, limit: 'All', filters: [{ col: 'fi_genre', op: 'equals', val: 'Drama' }, { col: 'fi_genre', op: 'equals', val: 'Sci-Fi', join: 'OR' }, { col: 'fi_rating', op: 'is at least', val: '8', join: 'AND' }] };
test('mixed AND/OR conditions use SQL precedence (AND before OR)', () => Q.grade(run('movies', Q.buildSQL(mixed).sql), run('movies', "select title, rating from film where genre='Drama' OR genre='Sci-Fi' AND rating>=8 order by rating desc"), { ordered: true }).ok);
test('LIKE exposes SQL wildcards and escapes apostrophes as data', () => {
  const col = Q.findCol('movies', ['film'], 'fi_title');
  return Q.OPS_TEXT.some(o => o.label === 'LIKE') && Q.opToSQL(col, 'LIKE', '%a_') === "fi.title LIKE '%a_'" && Q.opToSQL(col, 'LIKE', "O'Brien%") === "fi.title LIKE 'O''Brien%'" && run('movies', "select title from film fi where " + Q.opToSQL(col, 'LIKE', '%a_')).rows.length > 0;
});
test('AND/OR and LIKE survive task-link round trips; unknown connectors default to AND', () => {
  const state = { ...mixed, filters: [...mixed.filters, { col: 'fi_title', op: 'LIKE', val: '%a_', join: 'OR' }] };
  const decoded = Q.decodeState(Q.encodeState(state, 'practice'));
  const unsafe = Q.decodeState(Q.encodeState({ ...state, filters: [{ ...state.filters[0] }, { ...state.filters[1], join: 'OR 1=1' }] }));
  return decoded.mode === 'practice' && Q.buildSQL(decoded.state).sql === Q.buildSQL(state).sql && !Q.buildSQL(unsafe.state).sql.includes('1=1');
});
for (const db of Object.keys(Q.DDL)) {
  test(db + ': eight unique exercises with prompts and hints', () => Q.EXERCISES[db].length === 8 && new Set(Q.EXERCISES[db].map(t => t.id)).size === 8 && Q.EXERCISES[db].every(t => t.title && t.prompt && t.hint && t.referenceSQL));
  for (let i = 0; i < 8; i++) test(db + ': exercise ' + (i + 1) + ' matches an independent reference query and survives a task link', () => {
    const task = Q.EXERCISES[db][i], state = Q.exerciseState(db, task.id);
    const result = run(db, Q.buildSQL(state).sql), reference = run(db, task.referenceSQL);
    const decoded = Q.decodeState(Q.encodeState(state, 'practice', task.id));
    return result.rows.length > 0 && Q.grade(reference, result, { ordered: !!state.sort }).ok && decoded.exercise === task.id && decoded.mode === 'practice' && JSON.stringify(decoded.state) === JSON.stringify(state);
  });
}
test('unknown exercise IDs are ignored without breaking old custom task links', () => Q.decodeState('?db=movies&tables=film&exercise=unknown&mode=practice').exercise === null && Q.decodeState('?db=movies&tables=film&mode=practice').state.tables[0] === 'film');
test('exercise links resolve to a fixed target even if query state is altered', () => {
  const id = Q.EXERCISES.movies[0].id;
  const decoded = Q.decodeState('?db=movies&tables=viewer&exercise=' + id);
  return decoded.mode === 'practice' && JSON.stringify(decoded.state) === JSON.stringify(Q.exerciseState('movies', id));
});
const values = new Map(), storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) };
test('progress restores drafts and completion per dataset/task; a later wrong answer preserves completion', () => {
  const id = Q.EXERCISES.movies[0].id;
  Q.saveProgress(storage, 'movies', id, 'select title from film', true);
  Q.saveProgress(storage, 'movies', id, 'select 1', false);
  const saved = Q.loadProgress(storage, 'movies', id);
  return saved.answer === 'select 1' && saved.completed && !Q.loadProgress(storage, 'hospital', Q.EXERCISES.hospital[0].id).completed;
});
test('malformed or unavailable storage does not prevent practice', () => {
  const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const malformed = { getItem: () => '{broken', setItem() {} };
  return Q.loadProgress(broken, 'movies', 'select').answer === '' && Q.loadProgress(malformed, 'movies', 'select').completed === false && Q.saveProgress(broken, 'movies', 'select', '', false) === false;
});
Object.values(dbs).forEach(db => db.close());
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
