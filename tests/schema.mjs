#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Q = require('../engine.js');
const original = fs.readFileSync(new URL('../schema.js', import.meta.url), 'utf8');
const mutations = {
  schema: ['return { tables, foreignKeys };', 'return { tables, foreignKeys: [] };', 'schema parsing'],
  aliases: ["alias = ts[i++].v; }", "alias = ts[i++].v; alias = name; }", 'aliases'],
  self: ['instances.push(instance); return instance;', "if (instances.some(t => t.table === name)) throw Error('self join disabled'); instances.push(instance); return instance;", 'self-joins'],
  multi: ["joins.push({ target: target.id,", "if (joins.length) continue; joins.push({ target: target.id,", 'multi-join'],
  note: ["const NO_FK = 'No declared foreign key for this join.';", "const NO_FK = '';", 'no-foreign-key note']
};
if (process.argv.includes('--mutations')) {
  for (const [name, [, , guard]] of Object.entries(mutations)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--break=' + name], { encoding: 'utf8' });
    process.stdout.write(r.stdout);
    assert.equal(r.status, 1, name + ' mutant must exit 1');
    assert.ok(r.stdout.includes('FAIL ' + guard), name + ' must fail its intended guard');
    console.log('CAUGHT ' + name + ': intended guard failed\n');
  }
  console.log('ALL PASS: 5/5 source mutations caught');
  process.exit(0);
}
let source = original;
const breaking = process.argv.find(a => a.startsWith('--break='))?.split('=')[1];
if (breaking) {
  const [before, after] = mutations[breaking] || [];
  assert.ok(before && source.includes(before), 'mutation must apply');
  source = source.replace(before, after);
  console.log('Applied source mutation: ' + breaking);
}
const ctx = { self: {} }; vm.createContext(ctx); vm.runInContext(source, ctx);
const ER = ctx.self.SchemaMirror;
let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + e.message); } };
const schema = ER.parseSchema(`
-- CREATE TABLE fake(id);
CREATE TABLE IF NOT EXISTS "Person" (
 "id" INTEGER PRIMARY KEY, name TEXT DEFAULT 'JOIN, REFERENCES fake(x)',
 mentor INTEGER REFERENCES Person, city TEXT, CONSTRAINT self_fk FOREIGN KEY(mentor) REFERENCES Person(id)
);
CREATE TABLE team(a INTEGER, b INTEGER, name TEXT, PRIMARY KEY(a,b));
CREATE TABLE membership(person INTEGER REFERENCES Person(id), a INTEGER, b INTEGER,
 CONSTRAINT pair FOREIGN KEY(a,b) REFERENCES team(a,b), CHECK(a IN (1,2)));
`);
const movies = ER.parseSchema(Q.DDL.movies), commerce = ER.parseSchema(Q.DDL.ecommerce);
test('schema parsing: quoted identifiers, inline/table/composite keys, implicit parent PK and comments', () => {
  assert.equal(schema.tables.length, 3);
  assert.equal(schema.tables[0].columns.length, 4);
  assert.equal(schema.tables[0].primaryKey.join(), 'id');
  assert.equal(schema.tables[1].primaryKey.join(), 'a,b');
  assert.equal(schema.foreignKeys.length, 4);
  assert.equal(schema.foreignKeys[0].references.join(), 'id');
  assert.equal(schema.foreignKeys[3].columns.join(), 'a,b');
  assert.equal(schema.foreignKeys[3].references.join(), 'a,b');
});
test('aliases: quoted AS aliases, reverse equalities, comments and literals do not add tables', () => {
  const p = ER.queryPath(`SELECT 'FROM fake JOIN ghost' FROM film AS "Movie" /* JOIN ghost */ JOIN cast_link AS "Credit" ON "Movie".film_id = "Credit".film_id`, movies);
  assert.equal(p.instances.map(t => t.alias).join(), 'movie,credit');
  assert.equal(p.joins[0].matches.length, 1);
  assert.equal(p.activeKeys.length, 1);
});
test('self-joins: three instances keep separate alias endpoints and two paths', () => {
  const p = ER.queryPath('SELECT * FROM customer AS child JOIN customer AS parent ON parent.cust_id=child.referred_by LEFT JOIN customer AS grand ON parent.referred_by=grand.cust_id', commerce);
  assert.equal(p.instances.length, 3);
  assert.equal(p.joins.length, 2);
  assert.equal(p.joins[0].matches[0].from, 'instance-0');
  assert.equal(p.joins[0].matches[0].to, 'instance-1');
  assert.equal(p.joins[1].matches[0].from, 'instance-1');
  assert.equal(p.joins[1].matches[0].to, 'instance-2');
});
test('multi-join: a four-table chain resolves all three relationships and bridge tables', () => {
  const p = ER.queryPath('SELECT * FROM customer c JOIN order_hdr o ON o.cust_id=c.cust_id JOIN order_item i ON i.order_id=o.order_id JOIN product p ON p.prod_id=i.prod_id', commerce);
  assert.equal(p.instances.length, 4);
  assert.equal(p.joins.length, 3);
  assert.equal(p.activeKeys.length, 3);
  assert.ok(p.joins.every(j => j.matches.length === 1));
});
test('no-foreign-key note: same table pair on a different column never highlights a schema key', () => {
  const p = ER.queryPath('SELECT * FROM customer a JOIN customer b ON a.city=b.city', commerce);
  assert.equal(p.joins[0].note, 'No declared foreign key for this join.');
  assert.equal(p.activeKeys.length, 0);
});
test('composite foreign key requires all corresponding column equalities', () => {
  const full = ER.queryPath('SELECT * FROM membership m JOIN team t ON (m.a=t.a AND m.b=t.b)', schema);
  const half = ER.queryPath('SELECT * FROM membership m JOIN team t ON m.a=t.a', schema);
  assert.equal(full.activeKeys.length, 1); assert.equal(half.activeKeys.length, 0);
});
test('OR, NOT and non-equality predicates cannot falsely confirm foreign keys', () => {
  for (const condition of ['c.cust_id=o.cust_id OR c.city=\'London\'', 'c.cust_id=o.cust_id OR (c.cust_id=2 AND c.cust_id=o.cust_id)', 'NOT (c.cust_id=o.cust_id)', 'c.cust_id>o.cust_id']) {
    const p = ER.queryPath('SELECT * FROM customer c JOIN order_hdr o ON ' + condition, commerce);
    assert.equal(p.activeKeys.length, 0);
  }
});
test('USING resolves an unambiguous join; CROSS/comma/NATURAL joins show no confirmed key', () => {
  assert.equal(ER.queryPath('SELECT * FROM customer c JOIN order_hdr o USING(cust_id)', commerce).activeKeys.length, 1);
  for (const join of ['CROSS JOIN', ',', 'NATURAL JOIN']) {
    const p = ER.queryPath('SELECT * FROM customer c ' + join + ' order_hdr o', commerce);
    assert.equal(p.joins.length, 1); assert.equal(p.activeKeys.length, 0);
  }
});
test('unsupported scopes, unknown tables and duplicate aliases fail closed', () => {
  for (const sql of ['WITH a AS (SELECT * FROM film) SELECT * FROM a', 'SELECT * FROM (SELECT * FROM film)', 'SELECT * FROM film UNION SELECT * FROM film', 'SELECT * FROM missing', 'SELECT * FROM film a JOIN film a ON a.film_id=a.film_id']) {
    const p = ER.queryPath(sql, movies); assert.equal(p.instances.length, 0); assert.ok(p.message.startsWith('Path unavailable'));
  }
});
test('a non-equality join links its real alias endpoints, not merely adjacent FROM tables', () => {
  const p = ER.queryPath('SELECT * FROM customer c JOIN order_hdr o ON o.cust_id=c.cust_id JOIN product p ON p.stock_qty>c.cust_id', commerce);
  assert.equal(p.joins[1].pairs[0].a.instance.alias, 'p');
  assert.equal(p.joins[1].pairs[0].b.instance.alias, 'c');
  assert.equal(p.joins[1].pairs[0].operator, '>');
  assert.equal(p.joins[1].matches.length, 0);
});
test('every built-in exercise traces exactly the tables and relationships its SQL uses', () => {
  for (const [db, tasks] of Object.entries(Q.EXERCISES)) for (const task of tasks) {
    const state = Q.exerciseState(db, task.id), p = ER.queryPath(Q.buildSQL(state).sql, ER.parseSchema(Q.DDL[db]));
    assert.equal(p.message, '', db + '/' + task.id);
    assert.equal(p.instances.length, Q.allTables(db, state.tables).length);
    assert.ok(p.joins.every(j => j.matches.length > 0));
  }
});
const initSqlJs = require('../vendor/sql-wasm.js');
const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(new URL('../vendor/sql-wasm.wasm', import.meta.url)) });
test('all loaded DDL keys agree with SQLite and existing rows satisfy enforced foreign keys', () => {
  for (const [id, ddl] of Object.entries(Q.DDL)) {
    const db = new SQL.Database(); db.run('PRAGMA foreign_keys=ON'); db.run(ddl);
    assert.equal(db.exec('PRAGMA foreign_key_check').length, 0, id);
    const s = ER.parseSchema(ddl);
    for (const t of s.tables) {
      const info = Q.runQuery(db, 'PRAGMA table_info(' + t.name + ')').rows;
      assert.equal(t.columns.length, info.length);
      assert.equal(t.primaryKey.join(), info.filter(r => r[5]).sort((a,b) => a[5]-b[5]).map(r => r[1]).join());
      assert.equal(s.foreignKeys.filter(f => f.from === t.name).reduce((n,f) => n+f.columns.length, 0), Q.runQuery(db, 'PRAGMA foreign_key_list(' + t.name + ')').rows.length);
    }
    db.close();
  }
});
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
