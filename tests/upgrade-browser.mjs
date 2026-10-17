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
