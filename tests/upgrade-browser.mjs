#!/usr/bin/env node
// No dependencies/server: Chrome DevTools over a pipe, with all HTTP(S) requests blocked.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
if (!chrome) throw Error('Chrome required');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qm-browser-'));
const proc = spawn(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-background-networking', '--disable-component-update', '--remote-debugging-pipe', '--user-data-dir=' + profile], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let seq = 0, buffer = '', pass = 0, fail = 0;
const pending = new Map();
proc.stdio[4].on('data', data => {
  buffer += data;
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    const p = pending.get(msg.id); if (p) { pending.delete(msg.id); clearTimeout(p.timer); msg.error ? p.reject(Error(msg.error.message)) : p.resolve(msg.result); }
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 15000);
  pending.set(id, { resolve, reject, timer }); proc.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
});
const test = async (name, fn) => { try { if (!await fn()) throw Error('assertion false'); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ': ' + e.message); } };
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  const evaluate = async expression => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text + ': ' + r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
  const navigate = async query => {
    await cdp('Page.navigate', { url: url + query });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#status.ok')`)) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw Error('SQLite did not become ready');
  };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('');
  await test('first visit shows real result rows and the result-grading explanation', () => evaluate(`!!document.querySelector('#results table.data tbody tr') && document.querySelector('#grading-note').textContent.includes('missing or extra')`));
  await test('LIMIT control shows real SQL and limits the visible result to ten rows', () => evaluate(`var e=document.querySelector('select[aria-label="Rows to show"]'); e.value='10'; e.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#mirror pre').textContent.includes('LIMIT 10') && document.querySelectorAll('#results table.data tbody tr').length===10`));
  await test('condition controls expose AND/OR and LIKE', async () => {
    await evaluate(`document.querySelector('#ctl h3 button').click(); document.querySelector('#ctl h3 button').click()`);
    await evaluate(`let col=document.querySelector('select[aria-label="Column"]'); col.value='pa_name'; col.dispatchEvent(new Event('change',{bubbles:true}))`);
    return evaluate(`!!document.querySelector('select[aria-label="Join condition 2"] option[value="OR"]') && [...document.querySelectorAll('select[aria-label="Condition"] option')].some(o=>o.value==='LIKE')`);
  });
  await test('changing LIKE and OR controls updates the SQL and executes immediately', async () => {
    await evaluate(`var e=document.querySelector('select[aria-label="Condition"]'); e.value='LIKE'; e.dispatchEvent(new Event('change',{bubbles:true}))`);
    await evaluate(`var e=document.querySelector('input[aria-label="Value"]'); e.value='E%'; e.dispatchEvent(new Event('input',{bubbles:true}))`);
    await evaluate(`var e=document.querySelectorAll('select[aria-label="Column"]')[1]; e.value='pa_city'; e.dispatchEvent(new Event('change',{bubbles:true}))`);
    await evaluate(`var e=document.querySelectorAll('input[aria-label="Value"]')[1]; e.value='Toronto'; e.dispatchEvent(new Event('input',{bubbles:true}))`);
    await evaluate(`var e=document.querySelector('select[aria-label="Join condition 2"]'); e.value='OR'; e.dispatchEvent(new Event('change',{bubbles:true}))`);
    return evaluate(`document.querySelector('#mirror pre').textContent.includes("LIKE 'E%'") && document.querySelector('#mirror pre').textContent.includes("OR pa.city='Toronto'") && !!document.querySelector('#results table.data tbody tr') && !document.querySelector('#results [role="alert"]')`);
  });
  await navigate('?db=hospital&exercise=names');
  await test('exercise link opens a fixed practice task with hint, hidden SQL and disabled target controls', () => evaluate(`!!document.querySelector('#editor') && !!document.querySelector('#exercise-hint') && !document.querySelector('#mirror pre') && document.querySelector('#controls').hidden && [...document.querySelectorAll('#tbl-list input')].every(e=>e.disabled)`));
  await test('hint reveals relevant teaching text', () => evaluate(`document.querySelector('#exercise-hint').open=true; document.querySelector('#exercise-hint').textContent.includes('first_name')`));
  await test('draft is restored after a reload', async () => {
    await evaluate(`let ed=document.querySelector('#editor'); ed.value='select 1'; ed.dispatchEvent(new Event('input',{bubbles:true}))`);
    await navigate('?db=hospital&exercise=names');
    return evaluate(`document.querySelector('#editor').value==='select 1'`);
  });
  await test('wrong answer shows missing/extra rows and does not mark completion', () => evaluate(`document.querySelector('#mirror .btn-primary').click(); !!document.querySelector('.verdict.bad') && !!document.querySelector('.legend') && !document.querySelector('#exercise-progress').textContent.startsWith('1 /')`));
  await test('equivalent answer with swapped columns passes and marks progress', () => evaluate(`document.querySelector('#editor').value="SELECT city, first_name||' '||last_name FROM patient"; document.querySelector('#mirror .btn-primary').click(); !!document.querySelector('.verdict.ok') && document.querySelector('#exercise-progress').textContent.startsWith('1 /')`));
  await test('copy task link preserves the fixed exercise and works as a file URL', async () => {
    await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async url=>{window.copied=url}}}); [...document.querySelectorAll('#mirror button')].find(b=>b.textContent==='Copy task link').click()`);
    return evaluate(`copied.startsWith('file://') && new URL(copied).searchParams.get('exercise')==='names' && new URL(copied).searchParams.get('mode')==='practice'`);
  });
  await test('completion and answer survive a reload', async () => {
    await navigate('?db=hospital&exercise=names');
    return evaluate(`document.querySelector('#editor').value.includes('SELECT city') && document.querySelector('#exercise-progress').textContent.startsWith('1 /')`);
  });
  await test('next exercise opens a new task without carrying the prior answer', () => evaluate(`document.querySelector('#next-exercise').click(); location.search.includes('exercise=fees') && document.querySelector('#editor').value===''`));
  await test('switching dataset keeps progress separate', () => evaluate(`[...document.querySelectorAll('[aria-label="Dataset"] button')].find(e=>e.textContent==='Movies').click(); document.querySelector('#exercise-progress').textContent.startsWith('0 /')`));
  await navigate('?db=ecommerce&exercise=prices');
  await test('a boundary mistake that matches the teaching data is caught by a counterexample dataset in the page', () => evaluate(`document.querySelector('#editor').value='SELECT prod_name, unit_price FROM product WHERE unit_price>=50'; document.querySelector('#mirror .btn-primary').click(); !!document.querySelector('.verdict.bad') && document.querySelector('.verdict.bad').textContent.includes('right on the teaching data') && !!document.querySelector('#counterexample') && document.querySelector('#counterexample').textContent.includes('priced exactly 50') && !!document.querySelector('#counterexample tr.extra') && !document.querySelector('#exercise-progress').textContent.startsWith('1 /')`));
  await test('the correct answer passes the teaching data and the counterexample dataset', () => evaluate(`document.querySelector('#editor').value='SELECT prod_name, unit_price FROM product WHERE unit_price > 50'; document.querySelector('#mirror .btn-primary').click(); !!document.querySelector('.verdict.ok') && document.querySelector('.verdict.ok').textContent.includes('counterexample dataset') && !document.querySelector('#counterexample')`));
  await navigate('?db=hospital&tables=patient&mode=practice');
  await test('legacy custom practice link still opens the editor', () => evaluate(`!!document.querySelector('#editor') && !document.querySelector('#exercise-hint')`));
  await test('multiple statements and writes are rejected by the actual practice UI', () => evaluate(`document.querySelector('#editor').value='SELECT 1; DROP TABLE patient'; document.querySelector('#mirror .btn-primary').click(); document.querySelector('#practice-error').textContent.includes('one statement')`));
  await navigate('?db=hospital&tables=patient,doctor');
  await test('hospital bridge join still produces 38 rows and 11 columns in the shipped engine', () => evaluate(`document.querySelector('#results .showing').textContent==='38 rows' && document.querySelectorAll('#results table.data thead th').length===11 && document.querySelector('#mirror pre').textContent.includes('appointment')`));
  await navigate('?db=university&tables=student');
  await test('grouping, AVG and HAVING can still be built by clicks', async () => {
    await evaluate(`var e=document.querySelector('select[aria-label="Group rows by"]'); e.value='st_major'; e.dispatchEvent(new Event('change',{bubbles:true}))`);
    await evaluate(`var e=document.querySelector('select[aria-label="Aggregate for GPA"]'); e.value='AVG'; e.dispatchEvent(new Event('change',{bubbles:true}))`);
    await evaluate(`[...document.querySelectorAll('#ctl h3')].find(e=>e.textContent.includes('Only keep groups')).querySelector('button').click()`);
    await evaluate(`var e=document.querySelector('#ctl input[aria-label="Value"]'); e.value='3.4'; e.dispatchEvent(new Event('input',{bubbles:true}))`);
    return evaluate(`document.querySelector('#mirror pre').textContent.includes('HAVING AVG(st.gpa)>3.4') && !!document.querySelector('#results table.data tbody tr')`);
  });
  await navigate('?db=ecommerce&tables=customer&mode=practice');
  await test('practice never reveals the hidden target in the query diagram', () => evaluate(`document.querySelectorAll('#query-path .erd-instance').length===0 && document.querySelector('#schema-status').textContent.includes('Run a query')`));
  await test('running a four-table aliased query highlights all three declared relationships', () => evaluate(`document.querySelector('#editor').value='SELECT c.cust_id FROM customer c JOIN order_hdr o ON o.cust_id=c.cust_id JOIN order_item i ON i.order_id=o.order_id JOIN product p ON p.prod_id=i.prod_id'; document.querySelector('#mirror .btn-primary').click(); document.querySelectorAll('#schema-graph .erd-active-edge').length===3 && document.querySelectorAll('#query-path .erd-instance').length===4 && document.querySelectorAll('#schema-graph .erd-active-table').length===4 && document.querySelector('#schema-status').textContent.includes('Your last executed query')`));
  await test('editing a draft does not change the last executed path', () => evaluate(`document.querySelector('#editor').value='SELECT * FROM product'; document.querySelector('#editor').dispatchEvent(new Event('input',{bubbles:true})); document.querySelectorAll('#query-path .erd-instance').length===4`));
  const erdShots = process.env.QM_SCREENSHOTS;
  const captureER = async name => {
    if (!erdShots) return;
    fs.mkdirSync(erdShots, { recursive: true });
    for (const width of [1440, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: width===1440?1100:844, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.querySelector('#schema-panel').scrollIntoView({block:'start'})`);
      await test(name + ' ' + width + 'px: diagram overflows only within keyboard scroll regions', () => evaluate(`document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('#schema-panel .erd-scroll')].every(e=>e.tabIndex===0) && (innerWidth>600 || document.querySelector('#schema-graph').scrollWidth>document.querySelector('#schema-graph').clientWidth)`));
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(erdShots, name + '-' + width + '.png'), Buffer.from(shot.data, 'base64'));
      await evaluate(`document.querySelector('#schema-graph').scrollIntoView({block:'start'})`);
      const schemaShot = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(erdShots, name + '-schema-' + width + '.png'), Buffer.from(schemaShot.data, 'base64'));
    }
  };
  await captureER('erd-multi-join');
  await test('a self-join renders distinct alias nodes and the declared schema loop', () => evaluate(`document.querySelector('#editor').value='SELECT child.cust_id FROM customer child LEFT JOIN customer parent ON child.referred_by=parent.cust_id'; document.querySelector('#mirror .btn-primary').click(); document.querySelectorAll('#query-path .erd-instance').length===2 && document.querySelector('#query-path').textContent.includes('AS child') && document.querySelector('#query-path').textContent.includes('AS parent') && document.querySelectorAll('#schema-graph .erd-active-edge').length===1 && document.querySelectorAll('#schema-graph .erd-active-table').length===1`));
  await captureER('erd-self-join');
  await test('a valid non-key join says plainly it has no declared foreign key', () => evaluate(`document.querySelector('#editor').value='SELECT a.cust_id FROM customer a JOIN customer b ON a.city=b.city'; document.querySelector('#mirror .btn-primary').click(); document.querySelector('#query-path').textContent.includes('No declared foreign key for this join.') && document.querySelectorAll('#schema-graph .erd-active-edge').length===0 && !!document.querySelector('#query-path .erd-query-edge')`));
  await captureER('erd-no-foreign-key');
  await test('diagram disclosure and scroll region are keyboard operable', async () => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('#schema-heading').focus()`);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    if (!await evaluate(`!document.querySelector('#schema-details').open`)) throw Error('Enter did not close disclosure; focus=' + await evaluate('document.activeElement.id'));
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await evaluate(`document.querySelector('#schema-graph').focus(); document.querySelector('#schema-text').open=true`);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await new Promise(r => setTimeout(r, 200));
    const state = await evaluate(`({open:document.querySelector('#schema-details').open, focus:document.activeElement.id, scroll:document.querySelector('#schema-graph').scrollLeft, text:document.querySelector('#schema-description').textContent.includes('primary key')})`);
    if (!state.open || state.focus!=='schema-graph' || !state.scroll || !state.text) throw Error(JSON.stringify(state));
    return true;
  });
  await test('a nested query runs in SQLite but explicitly declines an inaccurate diagram', () => evaluate(`document.querySelector('#editor').value='SELECT * FROM (SELECT * FROM customer)'; document.querySelector('#mirror .btn-primary').click(); document.querySelector('#schema-status').textContent.includes('Path unavailable') && document.querySelectorAll('#schema-graph .erd-active-table').length===0`));
  await test('a SQLite error clears highlights rather than implying a successful trace', () => evaluate(`document.querySelector('#editor').value='SELECT bogus FROM customer'; document.querySelector('#mirror .btn-primary').click(); !!document.querySelector('#practice-error') && document.querySelectorAll('#query-path .erd-instance').length===0`));
  await navigate('?db=movies&tables=film,director');
  await test('Explore highlights its actual bridge join and resets across dataset changes', () => evaluate(`document.querySelectorAll('#schema-graph .erd-active-edge').length===2 && [...document.querySelectorAll('#schema-graph .erd-active-table')].some(e=>e.dataset.table==='cast_link') && document.querySelector('#schema-status').textContent.includes('Explore query')`));
  const blockedStorage = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})` });
  await navigate('?db=hospital&exercise=names');
  await test('blocked storage still allows practice and reports unsaved progress', () => evaluate(`!!document.querySelector('#editor') && document.querySelector('#exercise-progress').textContent.includes('unavailable')`));
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: blockedStorage.identifier });
  const out = process.env.QM_SCREENSHOTS;
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    await navigate(''); await evaluate('localStorage.clear()');
    for (const width of [1440, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: width===1440?1000:844, deviceScaleFactor: 1, mobile: false });
      await navigate('');
      await test(width + 'px: first screen has no horizontal overflow', () => evaluate(`document.documentElement.scrollWidth<=innerWidth`));
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, 'first-screen-' + width + '.png'), Buffer.from(shot.data, 'base64'));
    }
  }
} finally {
  await send('Browser.close').catch(() => {});
  await new Promise(resolve => { if(proc.exitCode!==null) resolve(); else proc.once('exit',resolve); });
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
