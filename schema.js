/* Schema and query-path reader. No DOM, dependencies, evaluation or network. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SchemaMirror = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function tokens(sql) {
    const out = [];
    const re = /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[a-z_][\w$]*|\d+(?:\.\d+)?|<=|>=|<>|!=|==|[^\s]/gi;
    for (const m of sql.matchAll(re)) {
      const s = m[0];
      if (/^\s|^--|^\/\*/.test(s)) continue;
      const quoted = /^["`\[]/.test(s), string = s[0] === "'";
      out.push({ raw: s, v: (quoted ? s.slice(1, -1).replace(/""/g, '"').replace(/``/g, '`') : s).toLowerCase(),
        id: quoted || /^[a-z_][\w$]*$/i.test(s), word: !quoted && !string });
    }
    return out;
  }
  const is = (t, v) => !!t && t.word && t.v === v;
  function close(ts, start) {
    let depth = 0;
    for (let i = start; i < ts.length; i++) {
      if (is(ts[i], '(')) depth++;
      if (is(ts[i], ')') && --depth === 0) return i;
    }
    throw Error('Unclosed parentheses');
  }
  function split(ts, separator = ',') {
    const out = []; let start = 0, depth = 0;
    ts.forEach((t, i) => {
      if (is(t, '(')) depth++;
      if (is(t, ')')) depth--;
      if (!depth && is(t, separator)) { out.push(ts.slice(start, i)); start = i + 1; }
    });
    out.push(ts.slice(start)); return out;
  }
  function list(ts, start) {
    if (!is(ts[start], '(')) return [];
    return split(ts.slice(start + 1, close(ts, start))).map(p => p[0]?.v);
  }
  function parseSchema(ddl) {
    const ts = tokens(ddl), tables = [], foreignKeys = [];
    for (let i = 0; i < ts.length; i++) {
      if (!is(ts[i], 'create') || !is(ts[i + 1], 'table')) continue;
      let n = i + 2;
      if (is(ts[n], 'if')) n += 3;
      if (is(ts[n + 1], '.')) n += 2;
      const name = ts[n].v, end = close(ts, n + 1);
      const table = { name, columns: [], primaryKey: [] }; tables.push(table);
      for (let part of split(ts.slice(n + 2, end))) {
        if (is(part[0], 'constraint')) part = part.slice(2);
        if (is(part[0], 'primary')) { table.primaryKey = list(part, 2); continue; }
        const fk = is(part[0], 'foreign');
        if (!fk && ['unique', 'check'].some(k => is(part[0], k))) continue;
        if (!fk) {
          const stop = part.findIndex((t, j) => j > 0 && ['primary', 'references', 'not', 'unique', 'default', 'check', 'collate', 'constraint', 'generated'].some(k => is(t, k)));
          table.columns.push({ name: part[0].v, type: part.slice(1, stop < 0 ? part.length : stop).map(t => t.v).join(' ') });
          if (part.some((t, j) => is(t, 'primary') && is(part[j + 1], 'key'))) table.primaryKey.push(part[0].v);
        }
        const r = part.findIndex(t => is(t, 'references'));
        if (r >= 0) foreignKeys.push({ from: name, columns: fk ? list(part, 2) : [part[0].v], to: part[r + 1].v, references: list(part, r + 2) });
      }
      i = end;
    }
    foreignKeys.forEach((fk, i) => {
      fk.id = 'fk-' + i;
      if (!fk.references.length) fk.references = tables.find(t => t.name === fk.to)?.primaryKey.slice() || [];
    });
    return { tables, foreignKeys };
  }
  const NO_FK = 'No declared foreign key for this join.';
  function queryPath(sql, schema) {
    const empty = message => ({ instances: [], joins: [], activeKeys: [], message });
    if (!sql.trim()) return empty('Run a query to trace its tables and joins.');
    const ts = tokens(sql);
    // Fail closed: nested scopes and compound queries must never look like a complete trace.
    if (!is(ts[0], 'select') || ts.slice(1).some(t => ['select', 'union', 'intersect', 'except'].some(k => is(t, k))))
      return empty('Path unavailable: subqueries, CTEs and compound queries are outside this diagram’s SELECT subset.');
    let i = ts.findIndex(t => is(t, 'from'));
    if (i < 0) return empty('This query reads no tables.');
    i++;
    const instances = [], joins = [];
    const boundary = t => ['join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'natural', 'on', 'using', 'where', 'group', 'having', 'order', 'limit', 'offset', ';', ','].some(k => is(t, k));
    const table = () => {
      if (!ts[i]?.id) throw Error('Expected a table');
      let name = ts[i++].v;
      if (is(ts[i], '.')) { i++; name = ts[i++]?.v; }
      if (!schema.tables.some(t => t.name === name)) throw Error('Unknown table ' + name);
      let alias = name;
      if (is(ts[i], 'as')) { i++; if (!ts[i]?.id) throw Error('Expected an alias'); alias = ts[i++].v; }
      else if (ts[i]?.id && !boundary(ts[i])) alias = ts[i++].v;
      if (instances.some(t => t.alias === alias)) throw Error('Ambiguous alias ' + alias);
      const instance = { table: name, alias, id: 'instance-' + instances.length };
      instances.push(instance); return instance;
    };
    const ref = part => {
      if (part.length === 3 && is(part[1], '.')) {
        const inst = instances.find(t => t.alias === part[0].v);
        if (inst && schema.tables.find(t => t.name === inst.table).columns.some(c => c.name === part[2].v)) return { instance: inst, column: part[2].v };
      }
      if (part.length === 1 && part[0].id) {
        const candidates = instances.filter(t => schema.tables.find(s => s.name === t.table).columns.some(c => c.name === part[0].v));
        if (candidates.length === 1) return { instance: candidates[0], column: part[0].v };
      }
      return null;
    };
    const unwrap = part => {
      while (is(part[0], '(') && close(part, 0) === part.length - 1) part = part.slice(1, -1);
      return part;
    };
    function equalities(part) {
      part = unwrap(part);
      // An equality inside OR/NOT does not establish a foreign-key join.
      const pieces = split(part, 'and');
      if (pieces.length > 1) return pieces.flatMap(equalities);
      const eq = part.findIndex(t => ['=', '==', '>', '<', '>=', '<=', '!=', '<>', 'like', 'is'].some(k => is(t, k)));
      const a = ref(part.slice(0, eq)), b = ref(part.slice(eq + 1));
      return eq > 0 && a && b && a.instance !== b.instance ? [{ a, b, operator: part[eq].v }] : [];
    }
    try {
      table();
      while (i < ts.length && !['where', 'group', 'having', 'order', 'limit', 'offset', ';'].some(k => is(ts[i], k))) {
        let kind = [];
        if (is(ts[i], ',')) { kind = ['comma']; i++; }
        else {
          while (ts[i] && !is(ts[i], 'join')) {
            if (!['inner', 'left', 'right', 'full', 'outer', 'cross', 'natural'].some(k => is(ts[i], k))) throw Error('Unsupported FROM clause');
            kind.push(ts[i++].v);
          }
          if (!is(ts[i], 'join')) throw Error('Expected JOIN');
          i++;
        }
        const target = table(); let pairs = [], predicate = '', unconfirmed = kind.includes('natural');
        if (is(ts[i], 'on')) {
          const start = ++i; let depth = 0;
          while (i < ts.length) {
            if (!depth && boundary(ts[i]) && !is(ts[i], 'on') && !is(ts[i], 'using')) break;
            if (is(ts[i], '(')) depth++;
            if (is(ts[i], ')')) depth--;
            i++;
          }
          const condition = ts.slice(start, i);
          unconfirmed = condition.some(t => is(t, 'or') || is(t, 'not'));
          pairs = unconfirmed ? [] : equalities(condition);
          predicate = condition.map(t => t.raw).join(' ');
        } else if (is(ts[i], 'using')) {
          const names = list(ts, i + 1); i = close(ts, i + 1) + 1;
          for (const column of names) {
            const left = instances.slice(0, -1).filter(t => schema.tables.find(s => s.name === t.table).columns.some(c => c.name === column));
            if (left.length === 1) pairs.push({ a: { instance: left[0], column }, b: { instance: target, column }, operator: '=' });
            else unconfirmed = true;
          }
          predicate = 'using (' + names.join(', ') + ')';
        }
        pairs = pairs.filter(p => p.a.instance === target || p.b.instance === target);
        const matches = [];
        for (const fk of schema.foreignKeys) {
          for (const from of instances.filter(t => t.table === fk.from)) for (const to of instances.filter(t => t.table === fk.to && t !== from)) {
            if (from !== target && to !== target) continue;
            if (fk.references.length === fk.columns.length && fk.columns.every((c, n) => pairs.some(({ a, b, operator }) =>
              ['=', '=='].includes(operator) && ((a.instance === from && a.column === c && b.instance === to && b.column === fk.references[n]) ||
              (b.instance === from && b.column === c && a.instance === to && a.column === fk.references[n]))))) matches.push({ key: fk.id, from: from.id, to: to.id });
          }
        }
        joins.push({ target: target.id, kind: (kind.join(' ') || 'inner') + ' join', predicate, pairs, matches,
          note: matches.length ? 'Declared foreign key' : unconfirmed ? 'Foreign-key path not confirmed for this predicate or implicit join.' : NO_FK });
      }
      return { instances, joins, activeKeys: [...new Set(joins.flatMap(j => j.matches.map(m => m.key)))], message: '' };
    } catch (e) { return empty('Path unavailable: ' + e.message + '.'); }
  }
  return { parseSchema, queryPath, NO_FK };
});
