/* Query Mirror — app.js (UI only; every SQL decision lives in engine.js) */
(function () {
'use strict';
const Q = window.QueryMirror;
const ER = window.SchemaMirror;
const schemas = Object.fromEntries(Object.entries(Q.DDL).map(([name, ddl]) => [name, ER.parseSchema(ddl)]));
const $ = s => document.querySelector(s);
const SVG_TAGS = new Set(['svg', 'rect', 'line', 'text', 'defs', 'pattern', 'path', 'g', 'title', 'circle', 'polyline']);
const h = (tag, attrs = {}, ...kids) => {
  const el = SVG_TAGS.has(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'value' || k === 'open') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid === null || kid === undefined || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
};
// replaceChildren() does not flatten arrays or skip nulls the way h() does — everything goes through this.
const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false).map(k => k.nodeType ? k : document.createTextNode(String(k)))); return el; };
const DB_LABEL = { hospital: 'Hospital', ecommerce: 'E-Commerce', movies: 'Movies', university: 'University' };

// ── state ──
let SQL = null, dbs = {}, ready = false;
// failed: the engine did not start. Every render reads it, so no later update() (the 300ms loading timer, a click)
// can put "Loading SQLite…" back over the error.
let failed = false;
let state, mode, exercise;
({ state, mode, exercise } = Q.decodeState(location.search));
// A first visit shows an actual result immediately; explicit legacy/deep links retain their state.
if (!location.search) state = Q.exerciseState('hospital', 'names');
let lastSQL = '', lastResult = null, lastError = null, lastBuildError = null;   // lastBuildError: the controls cannot make a query (no columns); lastError: SQLite refused it
// the loading state appears only when loading takes 300ms or more (a shorter wait shows nothing, so nothing flashes)
let slow = false;
const practice = { answer: '', verdict: null, result: null, error: null, revealed: false, showAll: false, variant: null };
let tracedSQL = '', tracedLabel = '', tracedDB = '';
let progressStorage = null, progressAvailable = false;
try { progressStorage = window.localStorage; progressStorage.setItem('query-mirror.probe', '1'); progressStorage.removeItem('query-mirror.probe'); progressAvailable = true; } catch (e) {}
if (exercise) practice.answer = Q.loadProgress(progressStorage, state.db, exercise).answer;
const currentExercise = () => Q.EXERCISES[state.db].find(t => t.id === exercise);
function saveDraft(completed = false) {
  if (exercise) progressAvailable = Q.saveProgress(progressStorage, state.db, exercise, practice.answer, completed);
}

// ── helpers ──
// Table cards show the row count SQLite reports for the loaded data, not a number typed into the schema.
const ROWCOUNT = {};
function exec(db, sql) { return Q.runQuery(dbs[db], sql); }   // keeps the column names of a zero-row result (engine.js)
function toast(msg, opts = {}) {
  const t = h('div', { class: 'toast enter', role: opts.alert ? 'alert' : 'status' }, msg);
  $('#toasts').append(t); requestAnimationFrame(() => t.classList.remove('enter'));
  setTimeout(() => { t.classList.add('leave'); setTimeout(() => t.remove(), 200); }, opts.ms || 2600);
}
function syncURL() { history.replaceState(null, '', Q.encodeState(state, mode, exercise)); }
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function highlightSQL(sql) {
  let s = escapeHtml(sql);
  const tokens = [];
  const tok = (cls, text) => { tokens.push('<span class="' + cls + '">' + text + '</span>'); return '\u0000T' + (tokens.length - 1) + '\u0000'; };
  s = s.replace(/'[^']*'/g, m => tok('sv', m));
  s = s.replace(/\/\*[^*]*\*\//g, m => tok('sc', m));
  s = s.replace(/\b(COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|LENGTH|UPPER|LOWER|TRIM|SUBSTR|CAST)\b(?=\s*\()/gi, m => tok('skf', m.toUpperCase()));
  s = s.replace(/\b(INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+OUTER\s+JOIN|FULL\s+JOIN)\b/gi, m => tok('ska', m.replace(/\s+/g, ' ').toUpperCase()));
  s = s.replace(/\b(ON|AND|OR|NOT|IN|BETWEEN|LIKE|IS\s+NOT\s+NULL|IS\s+NULL)\b/gi, m => tok('ska', m.replace(/\s+/g, ' ').toUpperCase()));
  s = s.replace(/\b(SELECT\s+DISTINCT|GROUP\s+BY|ORDER\s+BY)\b/gi, m => tok('sk', m.replace(/\s+/g, ' ').toUpperCase()));
  s = s.replace(/\b(SELECT|FROM|WHERE|HAVING|LIMIT|DISTINCT|AS|ASC|DESC|NULL|TEXT)\b/gi, m => tok('sk', m.toUpperCase()));
  s = s.replace(/(&lt;&gt;|!=|&gt;=|&lt;=|=|&gt;|&lt;)/g, m => tok('sop', m));
  s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, m => tok('sn', m));
  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\./g, (m, alias) => tok('st', alias) + '.');
  return s.replace(/\u0000T(\d+)\u0000/g, (_, i) => tokens[+i]);
}
const cols = () => Q.availableCols(state.db, state.tables);
const colById = id => cols().find(c => c.id === id);
const tablesLabel = () => {
  const sc = Q.SCHEMA[state.db];
  const sel = state.tables.map(t => sc.tables[t].label);
  const br = Q.bridgesFor(state.db, state.tables).map(t => sc.tables[t].label);
  return sel.join(' + ') + (br.length ? ' (joined through ' + br.join(', ') + ')' : '');
};

// ── state mutations ──
function setDB(db) { if (db === state.db) return; exercise = null; state = Q.emptyState(db); resetPractice(); update(); }
function setMode(m) { if (m === mode) return; exercise = null; mode = m; resetPractice(); update(); if (m === 'practice') setTimeout(() => { const ed = $('#editor'); if (ed) ed.focus(); }, 0); }
function openExercise(id) {
  if (!id) { exercise = null; mode = 'explore'; resetPractice(); update(); return; }
  const target = Q.exerciseState(state.db, id); if (!target) return;
  state = target; exercise = id; mode = 'practice'; resetPractice();
  practice.answer = Q.loadProgress(progressStorage, state.db, id).answer;
  update();
}
function resetPractice() { practice.answer = ''; practice.verdict = null; practice.result = null; practice.error = null; practice.revealed = false; practice.showAll = false; practice.variant = null; tracedSQL = ''; tracedLabel = ''; }
function toggleTable(t) {
  const i = state.tables.indexOf(t);
  if (i >= 0) state.tables.splice(i, 1); else state.tables.push(t);
  // Changing the table set changes the column universe, so every dependent control resets (as the original explorer did).
  state.cols = Q.defaultCols(state.db, state.tables);
  state.filters = []; state.sort = null; state.limit = 'All'; state.group = null; state.distinct = false;
  resetPractice(); update();
}
function toggleCol(id) { const i = state.cols.indexOf(id); if (i >= 0) state.cols.splice(i, 1); else state.cols.push(id); update(); }
function setSort(col, dir) { state.sort = col ? { col, dir: dir || 'ASC' } : null; update(); }
function clickSort(col) { if (state.sort && state.sort.col === col) state.sort.dir = state.sort.dir === 'ASC' ? 'DESC' : 'ASC'; else state.sort = { col, dir: 'ASC' }; update(); }
function setLimit(l) { state.limit = l; update(); }
function toggleDistinct() { state.distinct = !state.distinct; update(); }
function addFilter() { const c = cols()[0]; if (!c) return; state.filters.push({ col: c.id, op: 'equals', val: '' }); update(); }
function setGroup(col) {
  if (col) {
    const all = cols();
    state.group = { col, aggs: {}, having: [] };
    state.cols = [col, ...all.filter(c => c.type === 'number' && c.id !== col && !c.hide && state.cols.includes(c.id)).map(c => c.id)];
  } else {
    state.group = null;
    state.cols = Q.defaultCols(state.db, state.tables);
  }
  update();
}
function setAgg(colId, fn) {
  if (!state.group) return;
  if (fn === 'none') delete state.group.aggs[colId]; else state.group.aggs[colId] = fn;
  state.group.having = state.group.having.filter(x => x.aggCol.split('|')[0] !== colId || fn !== 'none');
  update();
}
function addHaving() { const a = Object.entries(state.group.aggs)[0]; if (!a) return; state.group.having.push({ aggCol: a[0] + '|' + a[1], op: 'is more than', val: '' }); update(); }

// ── render ──
// Every render replaces the page's elements, so the control a keyboard user was on disappears and focus drops to <body>:
// no focus ring, and Tab starts again from the top of the page (found 2026-09-16 with real key presses). The wrapper puts
// focus back on the same control (same attribute, or the same kind of control at the same position) or, when that control
// is gone, on the first visible heading of the page.
function focusKey(el) {
  if (!el || el === document.body || el === document.documentElement) return null;
  const scope = el.parentElement && el.parentElement.closest('[id]'), within = scope ? '#' + CSS.escape(scope.id) + ' ' : '', tag = el.tagName.toLowerCase();
  const quote = v => '"' + v.replace(/["\\]/g, '\\$&') + '"';
  const tries = ['id', 'data-id', 'data-key', 'data-sort', 'href', 'name'].filter(a => el.getAttribute(a)).map(a => within + tag + '[' + a + '=' + quote(el.getAttribute(a)) + ']');
  const kind = tag + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).map(c => CSS.escape(c)).join('.') : '');
  // a control inside a record (an element with data-id, such as a table row) is looked for in that same record first, then in
  // the record now at its place in the list (the next one moved up), and only then does focus go to the heading
  const rec = el.parentElement && el.parentElement.closest('[data-id]'), recs = rec ? within + rec.tagName.toLowerCase() + '[data-id]' : null;
  const recId = rec && rec.getAttribute('data-id'), recAt = rec ? [...document.querySelectorAll(recs)].indexOf(rec) : -1, inRec = rec ? [...rec.querySelectorAll(kind)].indexOf(el) : -1;
  const index = [...document.querySelectorAll(within + kind)].indexOf(el);
  const find = () => {
    for (const s of tries) { const x = document.querySelector(s); if (x) return x; }
    if (rec) { const r = document.querySelector(within + rec.tagName.toLowerCase() + '[data-id=' + quote(recId) + ']') || document.querySelectorAll(recs)[recAt]; return r ? r.querySelectorAll(kind)[inRec] || null : null; }
    return index < 0 ? null : document.querySelectorAll(within + kind)[index] || null;
  };
  find.caret = typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd] : null;   // a text field keeps its caret
  return find;
}
// Where focus goes when there is no control to go back to, and where the skip link sends it: the first visible h1 in main,
// else the first visible h2, else main itself
function firstHeading() {
  const seen = x => { const r = x.getBoundingClientRect(), cs = getComputedStyle(x); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && !/inset\(50%\)|rect\(0/.test(cs.clipPath + cs.clip); };
  const x = [...document.querySelectorAll('main h1')].find(seen) || [...document.querySelectorAll('main h2')].find(seen) || $('#main');
  if (x && !x.hasAttribute('tabindex')) x.setAttribute('tabindex', '-1');
  return x;
}
function restoreFocus(find) {
  if (!find || (document.activeElement && document.activeElement !== document.body)) return;
  let el = find();
  if (!el || !el.getClientRects().length) el = firstHeading();
  if (el) { el.focus(); if (document.activeElement !== el && (el = firstHeading())) el.focus(); }   // a disabled control does not take focus
  if (el && find.caret && el.setSelectionRange) try { el.setSelectionRange(find.caret[0], find.caret[1]); } catch (e) { /* not a text field */ }
}
function update(opts = {}) { const find = focusKey(document.activeElement); updatePanels(opts); restoreFocus(find); }
function updatePanels(opts) {
  runMirror();
  syncURL();
  renderSubbar(); renderExercises(); renderTables();
  $('#controls').hidden = !!exercise;
  // Value boxes call update({controls:false}): rebuilding the panel on every keystroke would replace the
  // focused <input> and drop the caret after the first character.
  if (opts.controls !== false) renderControls();
  renderMirror(); renderResults(); renderSchema();
}
function renderExercises() {
  const tasks = Q.EXERCISES[state.db];
  const completed = tasks.filter(t => Q.loadProgress(progressStorage, state.db, t.id).completed).length;
  fill($('#exercises'),
    h('label', { for: 'exercise-select' }, DB_LABEL[state.db] + ' exercises'),
    h('select', { id: 'exercise-select', class: 'ctl-sel', onchange: e => openExercise(e.target.value) },
      h('option', { value: '', selected: !exercise }, 'Explore freely · or choose a task'),
      tasks.map((t, i) => h('option', { value: t.id, selected: exercise === t.id }, (i + 1) + '. ' + t.title + (Q.loadProgress(progressStorage, state.db, t.id).completed ? ' ✓' : '')))),
    h('span', { id: 'exercise-progress', role: 'status' }, completed + ' / ' + tasks.length + ' complete · ' + (progressAvailable ? 'saved in this browser' : 'saving unavailable')));
}
function runMirror() {
  const prevSQL = lastSQL;
  lastSQL = ''; lastResult = null; lastError = null; lastBuildError = null;
  if (mode === 'explore') { tracedSQL = ''; tracedLabel = ''; tracedDB = state.db; }
  if (!state.tables.length) return;
  const { sql, error } = Q.buildSQL(state);
  if (!sql) { lastBuildError = error; return; }
  lastSQL = sql;
  if (prevSQL && prevSQL !== sql && (practice.verdict || practice.error)) { practice.verdict = null; practice.result = null; practice.error = null; }
  if (!ready) return;
  try {
    lastResult = exec(state.db, sql);
    if (mode === 'explore') { tracedSQL = sql; tracedLabel = 'Explore query'; tracedDB = state.db; }
  } catch (e) { lastError = e.message; }
}

function renderSchema() {
  const schema = schemas[state.db];
  // In practice the hidden target is never traced; edits do not replace the last run.
  const trace = ER.queryPath(tracedDB === state.db ? tracedSQL : '', schema);
  const active = new Set(trace.instances.map(t => t.table));
  fill($('#schema-status'), trace.message || tracedLabel + ' · ' + trace.instances.length + ' table instances · ' + trace.joins.length + ' joins');
  const instanceLabel = id => { const t = trace.instances.find(t => t.id === id); return t ? t.table + ' AS ' + t.alias : '?'; };
  fill($('#query-path'),
    trace.instances.length ? h('div', { class: 'erd-instances', 'aria-label': 'Query table instances' }, trace.instances.map((t, i) =>
      h('span', { class: 'erd-instance' }, (i + 1) + ' · ' + t.table + ' AS ' + t.alias))) : null,
    trace.joins.length ? h('ol', { class: 'erd-joins' }, trace.joins.map(j => h('li', { class: j.matches.length ? 'erd-declared' : 'erd-unlinked' },
      h('strong', {}, j.kind.toUpperCase() + ' ' + instanceLabel(j.target)),
      h('code', {}, j.predicate || 'No ON condition (all combinations)'),
      h('span', {}, j.note),
      j.pairs.map(p => h('small', {}, p.a.instance.alias + '.' + p.a.column + ' ' + p.operator.toUpperCase() + ' ' + p.b.instance.alias + '.' + p.b.column))))) : null);
  if (trace.instances.length) {
    const pathGraph = h('svg', { width: trace.instances.length * 220, height: 100 + trace.joins.length * 26, class: 'erd-svg', 'aria-hidden': 'true', focusable: 'false' });
    trace.joins.forEach((j, index) => {
      const targetIndex = trace.instances.findIndex(t => t.id === j.target);
      const sources = [...new Set(j.pairs.map(p => p.a.instance.id === j.target ? p.b.instance.id : p.a.instance.id))];
      if (!sources.length && !j.predicate && !j.kind.includes('natural')) sources.push(trace.instances[targetIndex - 1].id);
      sources.forEach(id => {
        const from = trace.instances.findIndex(t => t.id === id), y = 95 + index * 26;
        pathGraph.append(h('path', { d: `M ${from * 220 + 108} 68 V ${y} H ${targetIndex * 220 + 108} V 68`, class: j.matches.length ? 'erd-edge erd-active-edge' : 'erd-edge erd-query-edge' }),
          h('text', { x: (from + targetIndex) * 110 + 108, y: y - 5, 'text-anchor': 'middle' }, 'Join ' + (index + 1) + (j.matches.length ? ' · FK' : ' · no confirmed FK')));
      });
    });
    trace.instances.forEach((t, i) => pathGraph.append(h('g', { class: 'erd-table erd-active-table' },
      h('rect', { x: i * 220 + 8, y: 8, width: 200, height: 60, rx: 8 }),
      h('text', { x: i * 220 + 20, y: 32, class: 'erd-title' }, t.table),
      h('text', { x: i * 220 + 20, y: 54 }, 'AS ' + t.alias))));
    $('#query-path').prepend(h('div', { class: 'erd-scroll', tabindex: '0', role: 'region', 'aria-label': 'Query join diagram, aliases are separate nodes; scroll to explore' }, pathGraph));
  }
  const positions = new Map(schema.tables.map((t, i) => [t.name, { x: 32 + (i % 3) * 310, y: 32 + Math.floor(i / 3) * 340 }]));
  const width = Math.min(3, schema.tables.length) * 310 + 24;
  const height = Math.ceil(schema.tables.length / 3) * 340;
  const graph = h('svg', { width, height, viewBox: '0 0 ' + width + ' ' + height, 'aria-hidden': 'true', focusable: 'false', class: 'erd-svg' });
  for (const fk of schema.foreignKeys) {
    const a = positions.get(fk.from), b = positions.get(fk.to);
    const y1 = a.y + 58 + schema.tables.find(t => t.name === fk.from).columns.findIndex(c => c.name === fk.columns[0]) * 25;
    const y2 = b.y + 58 + schema.tables.find(t => t.name === fk.to).columns.findIndex(c => c.name === fk.references[0]) * 25;
    const d = fk.from === fk.to
      ? `M ${a.x + 260} ${y1} h 20 V ${y2} h -20`
      : `M ${a.x + 260} ${y1} H ${a.x + 278} V ${a.y + 300} H ${b.x - 12} V ${y2} H ${b.x}`;
    graph.append(h('path', { d, class: trace.activeKeys.includes(fk.id) ? 'erd-edge erd-active-edge' : 'erd-edge', 'data-key': fk.id }));
  }
  for (const t of schema.tables) {
    const { x, y } = positions.get(t.name), on = active.has(t.name);
    graph.append(h('g', { class: on ? 'erd-table erd-active-table' : 'erd-table', 'data-table': t.name },
      h('rect', { x, y, width: 260, height: 45 + t.columns.length * 25, rx: 8 }),
      h('text', { x: x + 12, y: y + 26, class: 'erd-title' }, (on ? '● ' : '') + t.name),
      t.columns.map((c, i) => h('text', { x: x + 12, y: y + 62 + i * 25 },
        (t.primaryKey.includes(c.name) ? 'PK ' : '') + (schema.foreignKeys.some(f => f.from === t.name && f.columns.includes(c.name)) ? 'FK ' : '') + c.name + ' · ' + c.type))));
  }
  fill($('#schema-graph'), graph);
  fill($('#schema-description'), schema.tables.map(t => h('div', {}, h('h3', {}, t.name + (active.has(t.name) ? ' · in query' : '')),
    h('ul', {}, t.columns.map(c => h('li', {}, c.name + ' · ' + c.type + (t.primaryKey.includes(c.name) ? ' · primary key' : '')))))),
    h('h3', {}, 'Declared foreign keys'),
    schema.foreignKeys.length ? h('ul', {}, schema.foreignKeys.map(f => h('li', {},
      f.from + '(' + f.columns.join(', ') + ') → ' + f.to + '(' + f.references.join(', ') + ')' + (trace.activeKeys.includes(f.id) ? ' · used by query' : '')))) : h('p', {}, 'No foreign keys declared.'));
}
function renderSubbar() {
  const sb = $('#subbar'); fill(sb, 
    h('span', { class: 'seg-label' }, 'Dataset'),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Dataset' }, Object.keys(Q.SCHEMA).map(db => h('button', { type: 'button', role: 'radio', 'aria-checked': String(db === state.db), onclick: () => setDB(db) }, DB_LABEL[db]))),
    h('span', { class: 'seg-label' }, 'Mode'),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Mode' }, [['explore', 'Explore'], ['practice', 'Practice']].map(([m, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(m === mode), onclick: () => setMode(m) }, l))),
    h('span', { class: 'status ' + (ready ? 'ok' : failed ? 'err' : slow ? 'busy' : 'wait'), id: 'status' }, ready || failed || slow ? h('i') : null, ready ? 'SQLite ready · ' + Object.keys(Q.SCHEMA).length + ' datasets in memory' : failed ? 'SQLite failed to load' : slow ? 'Loading SQLite…' : '')
  );
}
function renderTables() {
  const sc = Q.SCHEMA[state.db]; const list = $('#tbl-list'); const bridges = Q.bridgesFor(state.db, state.tables);
  fill(list, 
    sc.order.filter(t => !sc.tables[t].bridge).map(t => {
      const on = state.tables.includes(t);
      return h('li', {}, h('label', { class: on ? 'on' : '' },
        h('input', { type: 'checkbox', checked: on, disabled: !!exercise, onchange: () => toggleTable(t), 'aria-label': sc.tables[t].label }),
        h('span', {}, sc.tables[t].label), h('span', { class: 'cnt' }, (ROWCOUNT[state.db] && ROWCOUNT[state.db][t] != null ? ROWCOUNT[state.db][t] : '…') + ' rows')));
    }),
    bridges.length ? h('li', {}, h('div', { class: 'sect' }, 'Joined automatically')) : null,
    bridges.map(t => h('li', {}, h('div', { class: 'bridge', style: 'display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:var(--space-2);align-items:center;height:32px;padding:0 var(--space-2);font-size:var(--text-sm)' },
      h('span', { class: 'ico' }, h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': 'true' }, h('path', { d: 'M6 10l4-4M5 7a2.5 2.5 0 0 0-3.5 3.5l1 1A2.5 2.5 0 0 0 6 11M10 9a2.5 2.5 0 0 0 3.5-3.5l-1-1A2.5 2.5 0 0 0 10 5', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }))),
      h('span', {}, sc.tables[t].label), h('span', { class: 'tag tag-info' }, 'link'))))
  );
}
function renderControls() {
  const box = $('#ctl'); const all = cols();
  if (!state.tables.length) { fill(box, h('p', { class: 'none' }, 'Pick a table first.')); return; }
  const sel = (opts, value, onchange, extra = {}) => h('select', { class: 'ctl-sel', onchange: e => onchange(e.target.value), ...extra }, opts.map(o => h('option', { value: o.v, selected: o.v === value }, o.t)));
  const colOpts = all.map(c => ({ v: c.id, t: c.label + (state.tables.length + Q.bridgesFor(state.db, state.tables).length > 1 ? ' · ' + c.tableLabel : '') }));
  // Filters
  const filters = h('div', {},
    h('h3', {}, 'Only rows where', h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: addFilter }, '+ condition')),
    state.filters.length ? state.filters.map((f, i) => {
      const col = colById(f.col) || all[0]; const isNum = col.type === 'number'; const ops = isNum ? Q.OPS_NUM : Q.OPS_TEXT;
      const noVal = f.op === 'is blank' || f.op === 'has a value';
      const row = h('div', { class: 'row' + (noVal ? ' novalue' : '') },
        sel(colOpts, f.col, v => { f.col = v; f.op = 'equals'; f.val = ''; update(); }, { 'aria-label': 'Column' }),
        sel(ops.map(o => ({ v: o.label, t: o.label })), f.op, v => { f.op = v; update(); }, { 'aria-label': 'Condition' }));
      if (!noVal) {
        const inp = h('input', { class: 'ctl-inp', type: isNum ? 'number' : 'text', value: f.val, placeholder: isNum ? 'number' : 'value…', 'aria-label': 'Value', list: col.opts ? 'dl-' + col.id : null, oninput: e => { f.val = e.target.value; update({ controls: false }); } });
        row.append(inp);
        if (col.opts && !document.getElementById('dl-' + col.id)) document.body.append(h('datalist', { id: 'dl-' + col.id }, col.opts.map(o => h('option', { value: o }))));
      }
      row.append(h('button', { type: 'button', class: 'icon-del', 'aria-label': 'Remove condition', onclick: () => { state.filters.splice(i, 1); update(); } }, '×'));
      return [i ? sel([{ v: 'AND', t: 'AND · both must match' }, { v: 'OR', t: 'OR · either can match' }], f.join || 'AND', v => { f.join = v; update(); }, { 'aria-label': 'Join condition ' + (i + 1) }) : null,
        row, f.op === 'LIKE' ? h('p', { class: 'none' }, '% matches any text; _ matches one character.') : null];
    }) : h('p', { class: 'none' }, 'No conditions — every row passes.'),
    state.filters.length > 1 ? h('p', { class: 'none' }, 'SQL evaluates AND before OR. The mirror shows the exact expression.') : null);
  // Summarize
  const g = state.group;
  const numCols = all.filter(c => c.type === 'number' && (!g || c.id !== g.col));
  const sum = h('div', {},
    h('h3', {}, 'Summarize'),
    h('div', { class: 'row two' }, h('span', { class: 'lbl' }, 'Group rows by'), sel([{ v: '', t: 'No grouping' }, ...colOpts], g ? g.col : '', v => setGroup(v), { 'aria-label': 'Group rows by' })),
    g && numCols.length ? h('div', { class: 'lbl', style: 'margin-top:var(--space-1)' }, 'For each group, calculate') : null,
    g ? numCols.map(c => h('div', { class: 'row two' }, h('span', { class: 'lbl' }, c.label),
      sel(Object.entries(Q.AGG_LABELS).map(([v, t]) => ({ v, t })), g.aggs[c.id] || 'none', v => setAgg(c.id, v), { 'aria-label': 'Aggregate for ' + c.label }))) : null,
    g && Object.keys(g.aggs).length ? h('h3', { style: 'margin-top:var(--space-2)' }, 'Only keep groups where', h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: addHaving }, '+ condition')) : null,
    g ? g.having.map((x, i) => h('div', { class: 'row' },
      sel(Object.entries(g.aggs).map(([cid, fn]) => ({ v: cid + '|' + fn, t: Q.AGG_LABELS[fn] + ' of ' + (colById(cid) || {}).label })), x.aggCol, v => { x.aggCol = v; update(); }, { 'aria-label': 'Aggregate' }),
      sel(Q.HAV_OPS.map(o => ({ v: o.label, t: o.label })), x.op, v => { x.op = v; update(); }, { 'aria-label': 'Condition' }),
      h('input', { class: 'ctl-inp', type: 'number', value: x.val, placeholder: 'number', 'aria-label': 'Value', oninput: e => { x.val = e.target.value; update({ controls: false }); } }),
      h('button', { type: 'button', class: 'icon-del', 'aria-label': 'Remove condition', onclick: () => { g.having.splice(i, 1); update(); } }, '×'))) : null
  );
  fill(box, filters, sum);
}
// runPractice and the mirror's own buttons re-render only this panel, so it keeps focus the same way update() does
function renderMirror() { const find = focusKey(document.activeElement); renderMirrorPanel(); restoreFocus(find); }
function renderMirrorPanel() {
  const m = $('#mirror');
  if (!state.tables.length) {
    fill(m, h('div', { class: 'empty' }, h('h3', {}, 'Pick a table to start'),
      h('p', {}, 'Every checkbox, condition, grouping and sort becomes one SELECT here — then runs below.'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => toggleTable(Q.SCHEMA[state.db].order[0]) }, 'Start with ' + Q.SCHEMA[state.db].tables[Q.SCHEMA[state.db].order[0]].label)));
    return;
  }
  if (mode === 'practice') { renderPractice(m); return; }
  const noRows = !!lastResult && lastResult.rows.length === 0;
  fill(m, 
    h('div', { class: 'card-head' }, h('h2', {}, 'SQL mirror'), h('span', { class: 'tag tag-neutral' }, 'SQLite'), h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: copySQL }, 'Copy'),
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: noRows, 'aria-describedby': noRows ? 'practice-why' : null, onclick: () => setMode('practice') }, 'Practice this query')),
    // a query with no rows makes a task any empty answer would pass, so it cannot be practised
    noRows ? h('p', { class: 'explain', id: 'practice-why' }, 'Nothing to practise — this query returns no rows. Loosen a condition first.') : null,
    lastSQL ? h('pre', { html: highlightSQL(Q.formatSQL(lastSQL)) }) : h('p', { class: 'none' }, lastBuildError || lastError || ''),
    h('p', { class: 'explain' }, 'Reading: ', h('b', {}, tablesLabel()), state.limit !== 'All' ? ' · top ' + state.limit + ' rows' : '', state.sort ? ' · sorted by ' + (colById(state.sort.col) || {}).label + ' ' + (state.sort.dir === 'ASC' ? 'ascending' : 'descending') : '')
  );
}
function copySQL() {
  if (!lastSQL) return;
  const done = () => toast('SQL copied');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastSQL).then(done, () => toast('Copy failed — select the text instead', { alert: true }));
  else toast('Clipboard unavailable — select the text instead', { alert: true });
}
function renderPractice(m) {
  const expected = lastResult; const ordered = !!state.sort;
  if (expected && expected.rows.length === 0) {   // opened from a link: the same rule as the disabled button in explore
    fill(m, h('div', { class: 'card-head' }, h('h2', {}, 'Practice')), h('div', { class: 'empty' }, h('h3', {}, 'Nothing to practise'),
      h('p', {}, "This task's result has no rows, so any query that returns nothing would count as correct."),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => setMode('explore') }, 'Back to explore')));
    return;
  }
  const v = practice.verdict;
  const editor = h('textarea', { id: 'editor', class: 'editor', spellcheck: 'false', placeholder: 'SELECT …', 'aria-label': 'Your SQL', 'aria-invalid': practice.error ? 'true' : null, 'aria-describedby': practice.error ? 'practice-error' : null, oninput: e => { practice.answer = e.target.value; saveDraft(); }, onkeydown: e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runPractice(); } } });
  editor.value = practice.answer;
  const preview = expected ? resultTable(expected, { compact: true, mark: v ? { miss: v.missing } : null, limit: practice.showAll ? Infinity : 6, empty: 'This task matches no rows.' })
    : h('p', { class: 'none' }, lastBuildError ? 'This task has no result yet (' + lastBuildError + ') — go back to Explore and pick its columns.' : lastError || (slow && !failed ? 'Loading…' : ''));
  fill(m, 
    h('div', { class: 'card-head' }, h('h2', {}, 'Practice'), expected ? h('span', { class: 'tag tag-neutral' }, expected.rows.length + ' row' + (expected.rows.length === 1 ? '' : 's') + ' expected') : null, ordered ? h('span', { class: 'tag tag-warning' }, 'row order counts') : null, h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: shareTask }, 'Copy task link')),
    h('div', { class: 'task' },
      h('p', { class: 'ask' }, currentExercise() ? currentExercise().prompt : ['Write one SELECT that returns exactly this result from the ', h('b', {}, DB_LABEL[state.db]), ' dataset — reading ', h('b', {}, tablesLabel()), '. The controls say it in plain English.']),
      currentExercise() ? h('details', { id: 'exercise-hint' }, h('summary', {}, 'Show hint'), h('p', {}, currentExercise().hint)) : null,
      h('p', { class: 'muted', style: 'font-size:var(--text-xs)' }, 'Column order and column names do not matter; row order ' + (ordered ? 'does (the task has a sort)' : 'does not') + '. SQLite syntax. Only one statement, only SELECT.'),
      h('div', {}, h('h3', { style: 'font-size:var(--text-xs);font-weight:var(--weight-medium);color:var(--text-2);margin-bottom:var(--space-1)' }, 'Expected result'), h('div', { class: 'tablewrap', style: 'max-height:none', tabindex: expected ? '0' : null, role: expected ? 'region' : null, 'aria-label': expected ? 'Expected result' : null }, preview),
        expected && expected.rows.length > 6 ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', style: 'margin-top:var(--space-1)', onclick: () => { practice.showAll = !practice.showAll; renderMirror(); } }, practice.showAll ? 'Show fewer' : 'Show all ' + expected.rows.length + ' rows') : null),
      editor,
      h('div', { class: 'acts' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: runPractice }, 'Run & check'),
        h('button', { type: 'button', class: 'btn btn-ghost', 'aria-pressed': String(practice.revealed), onclick: () => { practice.revealed = !practice.revealed; renderMirror(); } }, practice.revealed ? 'Hide the mirror' : 'Reveal the mirror'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => setMode('explore') }, 'Back to explore'),
        exercise ? h('button', { type: 'button', id: 'next-exercise', class: 'btn btn-ghost', disabled: Q.EXERCISES[state.db].at(-1).id === exercise, onclick: () => { const tasks = Q.EXERCISES[state.db]; openExercise(tasks[tasks.findIndex(t => t.id === exercise) + 1]?.id); } }, 'Next exercise') : null,
        h('span', { class: 'keys' }, h('kbd', {}, '⌘/Ctrl'), ' + ', h('kbd', {}, 'Enter'), ' runs')),
      practice.error ? h('div', { class: 'verdict bad', role: 'alert', id: 'practice-error' }, h('span', {}, '✗'), h('span', {}, h('b', {}, 'SQL error'), ' — ', practice.error,
        practice.errorFromSQLite ? h('span', { style: 'display:block;margin-top:var(--space-1)' }, 'Check the table and column names against the dataset on the left, then run again.') : null)) : null,
      v ? h('div', { class: 'verdict ' + (v.ok ? 'ok' : 'bad'), role: 'status' }, h('span', {}, v.ok ? '✓' : '✗'), h('span', {}, h('b', {}, v.ok ? 'Correct' : 'Not yet'), ' — ', v.reason, v.ok ? ' · ' + v.actualRows + ' row' + (v.actualRows === 1 ? '' : 's') : '',
        !v.ok && v.unmatchedColumns && v.unmatchedColumns.length && v.unmatchedColumns.length < (lastResult ? lastResult.columns.length : 0)
          ? h('span', { style: 'display:block;margin-top:var(--space-1)' }, 'No column in your result matches ', v.unmatchedColumns.map((c, i) => [i ? ', ' : '', h('code', {}, c)]), '.') : null)) : null,
      v && v.variantFail && practice.variant ? h('div', { id: 'counterexample' },
        h('h3', { style: 'font-size:var(--text-xs);font-weight:var(--weight-medium);color:var(--text-2);margin-bottom:var(--space-1)' }, 'Counterexample: when ' + practice.variant.variant.label),
        h('div', { class: 'legend', style: 'margin-bottom:var(--space-2)' }, h('span', { class: 'm' }, h('i'), 'expected but missing from yours'), h('span', { class: 'x' }, h('i'), 'in yours but not expected')),
        h('div', { class: 'diff' },
          h('div', {}, h('h3', {}, 'Expected on this data'), h('div', { class: 'tablewrap', style: 'max-height:280px', tabindex: '0', role: 'region', 'aria-label': 'Expected on the counterexample data' }, resultTable(practice.variant.expected, { compact: true, mark: { miss: practice.variant.verdict.missing }, empty: 'No rows expected.' }))),
          practice.variant.actual ? h('div', {}, h('h3', {}, 'Yours on this data'), h('div', { class: 'tablewrap', style: 'max-height:280px', tabindex: '0', role: 'region', 'aria-label': 'Your result on the counterexample data' }, resultTable(practice.variant.actual, { compact: true, mark: { extra: practice.variant.verdict.extra }, empty: 'Your query returned no rows.' }))) : null)) : null,
      v && !v.ok && !v.variantFail && practice.result ? h('div', {},
        h('div', { class: 'legend', style: 'margin-bottom:var(--space-2)' }, h('span', { class: 'm' }, h('i'), 'expected but missing from yours'), h('span', { class: 'x' }, h('i'), 'in yours but not expected')),
        h('div', { class: 'diff' }, h('div', {}, h('h3', {}, 'Your result (' + practice.result.rows.length + ' row' + (practice.result.rows.length === 1 ? '' : 's') + ')'), h('div', { class: 'tablewrap', style: 'max-height:280px', tabindex: '0', role: 'region', 'aria-label': 'Your result' }, resultTable(practice.result, { compact: true, mark: { extra: v.extra }, empty: 'Your query returned no rows.' }))))) : null,
      v && v.ok && practice.result ? h('div', { class: 'tablewrap', style: 'max-height:280px', tabindex: '0', role: 'region', 'aria-label': 'Your result' }, resultTable(practice.result, { compact: true, empty: 'Your query returned no rows.' })) : null,
      practice.revealed && lastSQL ? h('div', {}, h('h3', { style: 'font-size:var(--text-xs);font-weight:var(--weight-medium);color:var(--text-2);margin-bottom:var(--space-1)' }, 'The mirror'), h('pre', { class: 'mono', style: 'margin:0;padding:var(--space-3) var(--space-4);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);font-size:var(--text-sm);line-height:1.7;overflow-x:auto', html: highlightSQL(Q.formatSQL(lastSQL)) })) : null
    )
  );
}
function runPractice() {
  const ed = $('#editor'); practice.answer = ed ? ed.value : practice.answer;
  practice.verdict = null; practice.result = null; practice.error = null; practice.errorFromSQLite = false; practice.variant = null;
  const sql = practice.answer.trim();
  if (!ready) { toast(failed ? 'SQLite could not start. Reload the page.' : 'The engine is still loading', { alert: true }); return; }
  if (!lastResult) { practice.error = 'the task has no result to compare with (' + (lastBuildError || lastError || 'nothing selected') + ') — go back to Explore and fix the task first'; renderMirror(); return; }
  if (!sql) { practice.error = 'write a SELECT first'; renderMirror(); return; }
  if (!Q.isSelectOnly(sql)) { practice.error = 'one statement, starting with SELECT (or WITH). Practice mode never runs anything else.'; renderMirror(); return; }
  tracedSQL = ''; tracedLabel = ''; tracedDB = state.db;
  // Run on a throwaway copy so nothing a student types can touch the shared in-memory database.
  const scratch = new SQL.Database(dbs[state.db].export());
  try {
    practice.result = Q.runQuery(scratch, sql.replace(/;\s*$/, ''));
    tracedSQL = sql; tracedLabel = 'Your last executed query';
    practice.verdict = Q.grade(lastResult, practice.result, { ordered: !!state.sort });
    // Right on the teaching data: also check the exercise's counterexample datasets (engine.js VARIANTS), but only while
    // the task is still the exercise as defined (the student may have changed it in Explore).
    if (practice.verdict.ok && exercise && Q.variantsFor(state.db, exercise).length && Q.buildSQL(state).sql === Q.buildSQL(Q.exerciseState(state.db, exercise)).sql) {
      const vr = Q.gradeOnVariants(state.db, exercise, sql.replace(/;\s*$/, ''), v => { const d = new SQL.Database(dbs[state.db].export()); d.run(v.sql); return d; });
      practice.variant = vr;
      if (!vr.ok) practice.verdict = { ...practice.verdict, ok: false, missing: [], extra: [], variantFail: true, reason: 'right on the teaching data, but not when ' + vr.variant.label + ' (' + vr.verdict.reason + ')' };
      else practice.verdict = { ...practice.verdict, reason: practice.verdict.reason + '; also right on ' + vr.checked + ' counterexample dataset' + (vr.checked === 1 ? '' : 's') };
    }
    practice.showAll = !practice.verdict.ok;
  } catch (e) { practice.error = e.message; practice.errorFromSQLite = true; }
  finally { scratch.close(); }
  saveDraft(!!practice.verdict?.ok); renderExercises();
  renderMirror(); renderSchema();
  const st = $('#mirror .verdict'); if (st) st.scrollIntoView({ block: 'nearest' });
}
function shareTask() {
  const url = new URL(Q.encodeState(state, 'practice', exercise), location.href).href;
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Task link copied — it opens straight in practice mode'), () => toast('Copy failed: ' + url, { alert: true, ms: 6000 }));
  else toast(url, { ms: 6000 });
}
function cellNode(v) {
  if (v === null || v === undefined) return h('td', {}, h('span', { class: 'null' }, '—'));
  // Display only: trims binary floating-point noise (AVG gives 3.7399999999999998). Grading compares raw values.
  if (typeof v === 'number') return h('td', { class: 'num', title: Number.isInteger(v) ? null : String(v) }, Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4))));
  return h('td', {}, String(v));
}
function resultTable(res, opts = {}) {
  const limit = opts.limit || Infinity; const mark = opts.mark || {};
  const miss = new Set(mark.miss || []), extra = new Set(mark.extra || []);
  const rows = res.rows.slice(0, limit);
  // a column whose values are all numbers is right-aligned in the header too, like its cells, as in the family's other tables
  const numeric = res.columns.map((_, j) => { const vals = res.rows.map(r => r[j]).filter(v => v !== null && v !== undefined); return vals.length > 0 && vals.every(v => typeof v === 'number'); });
  return h('table', { class: 'data' + (opts.compact ? ' compact' : '') },
    h('thead', {}, h('tr', {}, res.columns.map((c, j) => {
      if (!opts.sortable) return h('th', { scope: 'col', class: numeric[j] ? 'num' : null }, c);
      const col = cols().find(x => x.label === c);
      const active = col && state.sort && state.sort.col === col.id;
      return h('th', { scope: 'col', class: numeric[j] ? 'num' : null, 'aria-sort': active ? (state.sort.dir === 'ASC' ? 'ascending' : 'descending') : null },
        col ? h('button', { type: 'button', onclick: () => clickSort(col.id), title: 'Sort by ' + c }, c) : c);
    }))),
    h('tbody', {}, rows.length ? rows.map((r, i) => h('tr', { class: miss.has(i) ? 'miss' : (extra.has(i) ? 'extra' : null) }, r.map(cellNode)))
      : h('tr', {}, h('td', { class: 'empty-row', colspan: res.columns.length || 1 }, opts.empty ? opts.empty : [h('b', {}, 'No rows match'), ' — loosen a condition above',
          opts.sortable && state.filters.length ? [', or ', h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { state.filters = []; update(); } }, 'Remove all conditions')] : '.']))),
    res.rows.length > limit ? h('tfoot', {}, h('tr', {}, h('td', { colspan: res.columns.length, class: 'faint', style: 'font-size:var(--text-2xs)' }, '+ ' + (res.rows.length - limit) + ' more rows'))) : null);
}
let colsOpen = false;
// the Columns button, its checkboxes and the header buttons are rebuilt on every change: keep focus on the same control
// (Enter on Columns, or Space on a checkbox, left focus on <body>; 2026-09-16)
function renderResults() { const find = focusKey(document.activeElement); renderResultsPanel(); restoreFocus(find); }
function renderResultsPanel() {
  const r = $('#results');
  if (failed) { r.hidden = false; fill(r, engineFailed()); return; }
  r.hidden = mode === 'practice' && state.tables.length > 0;
  if (!state.tables.length) { fill(r, h('p', { class: 'none', style: 'font-size:var(--text-xs);color:var(--text-3)' }, 'Results appear here.')); return; }
  if (!ready) { fill(r, slow ? h('div', { class: 'loading' }, h('span', {}, 'Loading SQLite (650 KB, runs locally)…'), h('div', { class: 'bar' }, h('i', { id: 'ldbar' }))) : null); return; }
  const all = cols(); const sc = Q.SCHEMA[state.db];
  const groups = Q.allTables(state.db, state.tables).map(t => ({ t, label: sc.tables[t].label, cols: all.filter(c => c.table === t) }));
  const colsBtn = h('div', { class: 'cols' },
    h('button', { type: 'button', class: 'btn btn-sm', 'aria-expanded': String(colsOpen), 'aria-haspopup': 'true', onclick: e => { e.stopPropagation(); colsOpen = !colsOpen; renderResults(); } }, 'Columns ', h('span', { class: 'chip' }, state.cols.length + '/' + all.length)),
    colsOpen ? h('div', { class: 'menu', role: 'group', 'aria-label': 'Columns', onclick: e => e.stopPropagation() }, groups.map(gp => [h('div', { class: 'sect' }, gp.label), gp.cols.map(c => h('label', {}, h('input', { type: 'checkbox', checked: state.cols.includes(c.id), onchange: () => toggleCol(c.id) }), c.label))])) : null);
  const sortSel = h('select', { class: 'ctl-sel', 'aria-label': 'Sort by', onchange: e => setSort(e.target.value, state.sort ? state.sort.dir : 'ASC') }, h('option', { value: '', selected: !state.sort }, 'Sort: none'), all.map(c => h('option', { value: c.id, selected: !!state.sort && state.sort.col === c.id }, 'Sort: ' + c.label)));
  const dirSel = state.sort ? h('select', { class: 'ctl-sel', 'aria-label': 'Sort direction', onchange: e => setSort(state.sort.col, e.target.value) }, [['ASC', 'A → Z'], ['DESC', 'Z → A']].map(([v, t]) => h('option', { value: v, selected: state.sort.dir === v }, t))) : null;
  const limSel = h('select', { class: 'ctl-sel', 'aria-label': 'Rows to show', onchange: e => setLimit(e.target.value) }, Q.LIMITS.map(l => h('option', { value: l, selected: state.limit === l }, l === 'All' ? 'All rows' : 'Top ' + l)));
  // no columns is a state of the controls, not a failed query: it gets its own message and the way out (it used to read
  // "The query failed — usually a condition value of the wrong type", on a screen with no conditions)
  const body = lastBuildError === 'no columns chosen' ? h('div', { class: 'empty' }, h('h3', {}, 'No columns chosen'), h('p', {}, 'Every column is unticked in Columns, so there is nothing to select.'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { state.cols = all.map(c => c.id); update(); } }, 'Show all columns'))
    : lastBuildError ? h('p', { class: 'none' }, lastBuildError)
    : lastError ? h('div', { class: 'error', role: 'alert' }, h('h3', {}, 'The query failed'), h('pre', {}, lastError), h('p', { class: 'muted', style: 'font-size:var(--text-xs)' }, 'Usually a condition value of the wrong type. Fix or remove it above.'),
      h('div', {}, state.filters.length ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { state.filters = []; update(); } }, 'Remove all conditions')
        : h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { Object.assign(state, { cols: Q.defaultCols(state.db, state.tables), filters: [], group: null, sort: null, distinct: false, limit: 'All' }); update(); } }, 'Reset this query')))
    : lastResult ? h('div', { class: 'tablewrap' }, resultTable(lastResult, { sortable: true })) : null;
  fill(r, 
    h('div', { class: 'toolbar' }, h('h2', { style: 'font-size:var(--text-sm);font-weight:var(--weight-semibold);margin:0' }, 'Result'), colsBtn,
      h('button', { type: 'button', class: 'btn btn-sm', 'aria-pressed': String(state.distinct), disabled: !!state.group, title: state.group ? 'Grouping already collapses duplicates' : 'Hide rows identical in every column', onclick: toggleDistinct }, 'Hide duplicates'),
      sortSel, dirSel, limSel,
      h('span', { class: 'showing' }, lastResult ? lastResult.rows.length + ' row' + (lastResult.rows.length === 1 ? '' : 's') + (state.limit !== 'All' ? ' (top ' + state.limit + ')' : '') : '')),
    body
  );
}
document.addEventListener('click', () => { if (colsOpen) { colsOpen = false; renderResults(); } });

// ── theme / help ──
Appearance.bindToggle($('#theme'));   // ◐ switches light/dark only (appearance.js)
Appearance.bindSettings($('#nl-settings-button'), { shortcuts: '? opens help. Turn it off if you use voice control. On by default.' });   // the gear: palette, light/dark, single-key shortcuts
// the skip link goes to the first visible heading in main, without touching the address
document.querySelector('.skip').addEventListener('click', e => { e.preventDefault(); firstHeading().focus(); });
function openHelp() {
  const d = $('#dlg'); fill(d, 
    h('h2', {}, 'How Query Mirror works'),
    h('p', {}, 'Tick tables, set conditions, group and sort. The mirror shows the one SELECT those clicks produce and runs it in SQLite, inside this tab. Practice mode hides the mirror and grades your own SQL by comparing result sets — column order and names are ignored, row order only matters when the task has a sort.'),
    Appearance.shortcutsOn() ? null : h('p', {}, 'Single-key shortcuts are off — turn them on in Settings.'),
    h('table', {}, h('tbody', {}, [['⌘/Ctrl + Enter', 'Run & check (practice)'], ['?', 'This help'], ['Esc', 'Close dialogs']].map(([k, t]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, t))))),
    h('p', {}, 'Share a task: “Copy task link” puts the whole state (dataset, tables, conditions, grouping, sort) in the URL with practice mode on.'),
    h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Close')));
  d.showModal();
}
$('#help').addEventListener('click', openHelp);
// ? is a page-level single key, so the Settings switch can turn it off (WCAG 2.1.4); the ? button still opens help
document.addEventListener('keydown', e => { if (e.key === '?' && Appearance.shortcutsOn() && !document.querySelector('dialog[open]') && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); openHelp(); } });

// ── boot ──
async function boot() {
  setTimeout(() => { slow = true; if (!ready) update(); }, 300);
  update();
  try {
    const b64 = window.SQL_WASM_B64 || '';
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    SQL = await initSqlJs({ wasmBinary: bin });
    const names = Object.keys(Q.DDL);
    for (let i = 0; i < names.length; i++) {
      const db = new SQL.Database();
      Q.DDL[names[i]].split(';').map(s => s.trim()).filter(s => s.length > 4).forEach(s => { try { db.run(s + ';'); } catch (e) { console.error(names[i], e); } });
      dbs[names[i]] = db;
      const bar = $('#ldbar'); if (bar) bar.style.transform = `scaleX(${(i + 1) / names.length})`;
      await new Promise(r => setTimeout(r, 0));
    }
    for (const db of names) { ROWCOUNT[db] = {}; for (const tbl of Object.keys((Q.SCHEMA[db] || {}).tables || {})) { try { ROWCOUNT[db][tbl] = dbs[db].exec(`SELECT COUNT(*) FROM ${tbl}`)[0].values[0][0]; } catch (e) { ROWCOUNT[db][tbl] = null; console.error('count', db, tbl, e); } } }
    ready = true; update();
  } catch (e) {
    console.error(e);
    failed = true; update();   // the status line and #results read `failed` (renderSubbar, renderResultsPanel)
  }
}
// what happened and what to do, without the engine's own exception text (it is in the console); Reload is the fix
function engineFailed() {
  return h('div', { class: 'error', role: 'alert' }, h('h3', {}, 'SQLite could not start'), h('p', { class: 'muted', style: 'font-size:var(--text-xs)' }, 'The SQL engine ships inside this folder (vendor/) and did not load in this browser. Reload; if it persists, the files were served incompletely.'),
    h('div', {}, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => location.reload() }, 'Reload')));
}
boot();
})();
