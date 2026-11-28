'use strict';
/* 只看扫光的可见度：进主界面骨架屏时把光带停在不同位置各截一张 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-sweep-shot');
app.setPath('userData', path.join(os.tmpdir(), 'pm-sweep-shot-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function cdpShot(win, name) {
  const dbg = win.webContents.debugger;
  try { if (!dbg.isAttached()) dbg.attach('1.3'); } catch (e) { /* noop */ }
  return dbg.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true })
    .then(({ data }) => { const p = path.join(os.tmpdir(), name); fs.writeFileSync(p, Buffer.from(data, 'base64')); return p; })
    .catch((e) => 'SHOT-ERR:' + e.message);
}

app.whenReady().then(async () => {
  await wait(1200);
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(code).catch((e) => 'ERR:' + e.message);
  const until = async (expr, label, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false)) return true;
      await wait(60);
    }
    console.log('timeout:', label); return false;
  };
  win.setContentSize(1360, 860);

  await until(`document.querySelector('.login-card input')`, 'setup');
  await js(`
    (async () => {
      await window.api.setup('pass123', '', '管理员');
      await window.api.acceptTerms(new Date().toISOString());
      await window.api.login('管理员', 'pass123');
      const a = await window.api.customers.create({ name: '张三', class_name: '一班' });
      const b = await window.api.customers.create({ name: '李四', class_name: '二班' });
      for (const r of [a, b]) await window.api.tx.consume(r.data.id, 1234, '验收');
      await window.api.logout();
      return 'ok';
    })()
  `);
  win.reload();
  await until(`document.querySelector('.login-card input')`, 'login form');
  await wait(700);

  await js(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.includes('进入系统')).click();
      return 'ok';
    })()
  `);
  await until(`document.querySelector('.sk-shine')`, 'main skeleton');

  const freeze = (sec) => js(`
    (() => {
      let st = document.getElementById('sk-freeze');
      if (!st) { st = document.createElement('style'); st.id = 'sk-freeze'; document.head.appendChild(st); }
      st.textContent = '.sk-shine::before{animation-play-state:paused!important;animation-delay:-${sec}s!important}';
      const sh = document.querySelector('.sk-shine');
      return JSON.stringify({ t: getComputedStyle(sh, '::before').transform });
    })()
  `);

  console.log('pos A:', await freeze(0.55));
  await wait(60);
  console.log('shot A:', await cdpShot(win, 'load-anim-sweep-a.png'));
  console.log('pos B:', await freeze(0.95));
  await wait(60);
  console.log('shot B:', await cdpShot(win, 'load-anim-sweep-b.png'));

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
