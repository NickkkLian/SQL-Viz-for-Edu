#!/usr/bin/env node
// Counterexample datasets (variants): a query that matches the teaching data by luck must fail on a small,
// hand-written variant, while the reference and genuinely equivalent rewrites pass on every variant.
// Cases come from a probe of the 2.0.0 grader, where these eight boundary mistakes passed.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Q = require(process.env.QM_ENGINE_PATH || '../engine.js');
const initSqlJs = require('../vendor/sql-wasm.js');
const SQL = await initSqlJs({ wasmBinary: require('node:fs').readFileSync(new URL('../vendor/sql-wasm.wasm', import.meta.url)) });
let pass = 0, fail = 0;
const test = (name, fn) => { try { if (!fn()) throw new Error('assertion false'); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + e.message); } };
const base = Object.fromEntries(Object.entries(Q.DDL).map(([id, ddl]) => { const d = new SQL.Database(); d.run(ddl); return [id, d]; }));
const open = db => v => { const d = new SQL.Database(base[db].export()); d.run(v.sql); return d; };
const grade = (db, id, sql) => Q.grade(Q.runQuery(base[db], Q.buildSQL(Q.exerciseState(db, id)).sql), Q.runQuery(base[db], sql), { ordered: !!Q.exerciseState(db, id).sort });
const lit = v => v === null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const hardcoded = (db, id) => Q.runQuery(base[db], Q.EXERCISES[db].find(t => t.id === id).referenceSQL).rows.map(r => 'SELECT ' + r.map(lit).join(', ')).join(' UNION ALL ');
const ref = (db, id) => Q.EXERCISES[db].find(t => t.id === id).referenceSQL;

const PILOT = [
  ['hospital', 'and', 'SELECT appt_date, fee FROM appointment WHERE fee > 150 AND fee <= 250', 'SELECT appt_date, fee FROM appointment WHERE NOT (fee <= 150) AND NOT (fee >= 250)'],
  ['hospital', 'groups', 'SELECT city, COUNT(patient_id) FROM patient GROUP BY city HAVING COUNT(patient_id)>=1', 'SELECT city, COUNT(*) FROM patient GROUP BY city HAVING NOT COUNT(*) <= 1'],
  ['ecommerce', 'prices', 'SELECT prod_name, unit_price FROM product WHERE unit_price>=50', 'SELECT prod_name, unit_price FROM product WHERE NOT unit_price <= 50'],
  ['ecommerce', 'and', 'SELECT prod_name, stock_qty, unit_price FROM product WHERE stock_qty>=50 AND unit_price<50', 'SELECT prod_name, stock_qty, unit_price FROM product WHERE NOT (stock_qty <= 50 OR unit_price >= 50)'],
  ['ecommerce', 'and', 'SELECT prod_name, stock_qty, unit_price FROM product WHERE stock_qty>50 AND unit_price<=50', null],
  ['ecommerce', 'groups', 'SELECT category, AVG(unit_price) FROM product GROUP BY category HAVING AVG(unit_price)>=50', 'SELECT category, AVG(unit_price) AS a FROM product GROUP BY category HAVING NOT AVG(unit_price) <= 50'],
  ['movies', 'groups', 'SELECT genre, AVG(rating) FROM film GROUP BY genre HAVING AVG(rating)>=8', 'SELECT genre, AVG(rating) FROM film GROUP BY genre HAVING NOT AVG(rating) <= 8'],
  ['university', 'groups', 'SELECT major, AVG(gpa) FROM student GROUP BY major HAVING AVG(gpa)>=3.4', 'SELECT major, AVG(gpa) FROM student GROUP BY major HAVING NOT AVG(gpa) <= 3.4'],
];

test('the engine exposes variants and a variant grader', () => typeof Q.variantsFor === 'function' && typeof Q.gradeOnVariants === 'function');
for (const [db, id, wrong, equiv] of PILOT) {
  const tag = db + '/' + id + ': ';
  test(tag + 'has 1 to 3 variants, each with an id, a label and SQL', () => { const vs = Q.variantsFor(db, id); return vs.length >= 1 && vs.length <= 3 && vs.every(v => v.id && v.label && v.sql); });
  test(tag + 'the boundary mistake still passes the teaching data (the gap is real)', () => grade(db, id, wrong).ok);
  test(tag + 'the boundary mistake fails on a variant, which is named', () => { const r = Q.gradeOnVariants(db, id, wrong, open(db)); return !r.ok && r.variant && r.variant.label && !r.verdict.ok && (r.verdict.missing.length + r.verdict.extra.length) > 0; });
  test(tag + 'a hardcoded answer fails on a variant', () => !Q.gradeOnVariants(db, id, hardcoded(db, id), open(db)).ok);
  test(tag + 'the reference query passes every variant', () => Q.gradeOnVariants(db, id, ref(db, id), open(db)).ok);
  if (equiv) test(tag + 'an equivalent rewrite passes the teaching data and every variant', () => grade(db, id, equiv).ok && Q.gradeOnVariants(db, id, equiv, open(db)).ok);
}
test('variants only ADD rows (INSERT only) and leave the teaching data unchanged', () => Object.entries(Q.VARIANTS).every(([db, byId]) => Object.values(byId).flat().every(v => /^\s*INSERT INTO /i.test(v.sql) && !/\b(DELETE|UPDATE|DROP|ALTER|CREATE)\b/i.test(v.sql) && !Q.DDL[db].includes(v.sql))));
test('a SQL error on a variant is a failed check, not a crash', () => { const r = Q.gradeOnVariants('ecommerce', 'prices', 'SELECT nope FROM product', open('ecommerce')); return !r.ok && /error/i.test(r.verdict.reason); });
test('exercises without variants report ok with zero checked', () => { const r = Q.gradeOnVariants('movies', 'names', ref('movies', 'names'), open('movies')); return r.ok && r.checked === 0; });
const t0 = performance.now(); let n = 0;
for (const [db, id, , equiv] of PILOT) { Q.gradeOnVariants(db, id, equiv || ref(db, id), open(db)); n++; }
const ms = (performance.now() - t0) / n;
console.log(`  time per variant check, mean of ${n}: ${ms.toFixed(1)} ms`);
test('a variant check takes under 200 ms on this machine (measured above)', () => ms < 200);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
