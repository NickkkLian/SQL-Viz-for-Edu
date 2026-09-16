#!/usr/bin/env node
// Query Mirror — tests/parity.mjs
// Proves the rewrite kept the original explorer's SQL: loads the query builder out of the ORIGINAL single-file app
// (commit 5316da6, before engine.js existed), runs it in a sandbox over every state in tests/fixtures.json, and requires
// the new engine.buildSQL() to produce byte-identical SQL.
//
//   git show 5316da6:index.html > /tmp/explorer-5316da6.html
//   node tests/parity.mjs /tmp/explorer-5316da6.html
//
// Exits 1 on any difference, 2 if the old file does not look like the original explorer.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const Q = require(path.join(ROOT, 'engine.js'));

const oldPath = process.argv[2];
if (!oldPath) { console.error('usage: node tests/parity.mjs <index.html from commit 5316da6>'); process.exit(2); }
const oldSrc = fs.readFileSync(oldPath, 'utf8');
if (!oldSrc.includes('function recomputeBridges(') || oldSrc.includes('engine.js')) {
  console.error('not the original single-file explorer (expected recomputeBridges() and no engine.js)'); process.exit(2);
}

function fn(name) {
  const i = oldSrc.indexOf('\nfunction ' + name + '(');
  if (i < 0) { console.error('original function not found: ' + name); process.exit(2); }
  let j = oldSrc.indexOf('{', i), depth = 0;
  for (; j < oldSrc.length; j++) { if (oldSrc[j] === '{') depth++; else if (oldSrc[j] === '}') { depth--; if (!depth) break; } }
  return oldSrc.slice(i + 1, j + 1);
}
const between = (a, b) => oldSrc.slice(oldSrc.indexOf(a), oldSrc.indexOf(b));
let runSrc = fn('run');
runSrc = runSrc.slice(0, runSrc.indexOf('  displaySQL(sql);')) + '  return sql;\n}';   // stop before any DOM work

const ctx = {};
vm.createContext(ctx);
vm.runInContext([
  between('const SCHEMA={', '// ── SQL DISPLAY ──'),
  between('const OPS_TEXT=[', '// ── STATE ──'),
  'let selectedTables=new Set(),bridgeTables=new Set(),visibleCols=[],filters=[],sortColId=null,sortDir="ASC",rowLimit="All",groupByColId="",aggFns={},havingRows=[],distinctOn=false,currentDB="hospital";',
  fn('recomputeBridges'), fn('buildFrom'), fn('getAvailableCols'), fn('opToSQL'), runSrc,
  // set the original's globals from a fixture state, exactly as its UI handlers would have
  `this.oldSQL = function (st) {
     currentDB = st.db; selectedTables = new Set(st.tables); recomputeBridges();
     visibleCols = st.cols.slice();
     filters = st.filters.map(f => ({ ...f }));
     sortColId = st.sort ? st.sort.col : null; sortDir = st.sort ? st.sort.dir : 'ASC'; rowLimit = st.limit;
     groupByColId = st.group ? st.group.col : ''; aggFns = st.group ? { ...st.group.aggs } : {};
     havingRows = st.group ? st.group.having.map(h => ({ ...h })) : []; distinctOn = !!st.distinct;
     return run();
   };`,
].join('\n'), ctx);

const { fixtures } = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures.json'), 'utf8'));
let same = 0;
for (const f of fixtures) {
  const before = ctx.oldSQL(f.state), after = Q.buildSQL(f.state).sql;
  if (before === after) same++;
  else console.log(`DIFF ${f.id} (${f.note})\n  original: ${before}\n  engine:   ${after}`);
}
console.log(`parity with the original explorer: ${same}/${fixtures.length} fixture states produce byte-identical SQL`);
process.exit(same === fixtures.length ? 0 : 1);
