'use strict';
/* 交付截图：登录骨架 / 主界面骨架（含扫光与真实进度）/ 注册完成提醒 / 主界面 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-load-deliver');
app.setPath('userData', path.join(os.tmpdir(), 'pm-load-deliver-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const OUT = path.join(__dirname, '..', '..', 'docs', 'screenshots');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function cdpShot(win, file) {
  const dbg = win.webContents.debugger;
  try { if (!dbg.isAttached()) dbg.attach('1.3'); } catch (e) { /* noop */ }
  return dbg.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true })
    .then(({ data }) => {
      const p = path.join(OUT, file);
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(p, Buffer.from(data, 'base64'));
      return p;
    })
    .catch((e) => 'SHOT-ERR:' + e.message);
}

app.whenReady().then(async () => {
  await wait(1200);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);
  const js = (code) => win.webContents.executeJavaScript(code).catch((e) => 'ERR:' + e.message);
  const until = async (expr, label, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false)) return true;
      await wait(60);
    }
    console.log('timeout:', label); return false;
  };

  await until(`document.querySelector('.login-card input')`, 'setup');
  await wait(400);
  console.log('setup:', await cdpShot(win, 'loading-00-setup.png'));

  await js(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123'); setVal(ins[2], 'pass123');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.includes('完成初始化')).click();
      return 'ok';
    })()
  `);
  await until(`document.querySelector('.sk-shine')`, 'main skeleton');
  console.log('main-sk-1:', await cdpShot(win, 'loading-01-main-skeleton.png'));
  await wait(260);
  console.log('main-sk-2:', await cdpShot(win, 'loading-02-main-skeleton-sweep.png'));

  await until(`document.querySelector('.nav-item')`, 'main ui');
  await wait(1500);
  console.log('op-prompt:', await cdpShot(win, 'loading-03-op-prompt.png'));

  await js(`(() => { const b = [...document.querySelectorAll('.modal .btn')].find((x) => x.textContent.includes('稍后再说')); if (b) b.click(); return 'ok'; })()`);
  await wait(500);
  const seed = await js(`
    (async () => {
      const a = await window.api.customers.create({ name: '张三', class_name: '一班' });
      const b = await window.api.customers.create({ name: '李四', class_name: '二班' });
      for (const r of [a, b]) await window.api.tx.consume(r.data.id, 1234, '验收数据');
      const st = await window.api.stats();
      return JSON.stringify({ today: st.data.today_amount_cents, customers: st.data.customers });
    })()
  `);
  console.log('seed:', seed);
  await wait(400);
  console.log('dashboard:', await cdpShot(win, 'loading-04-dashboard.png'));

  /* 退出登录 → 登录骨架屏 */
  await js(`(() => { [...document.querySelectorAll('.sidebar .btn-ghost')].find((x) => x.textContent.includes('退出登录')).click(); return 'ok'; })()`);
  await wait(160);
  console.log('login-sk-1:', await cdpShot(win, 'loading-05-login-skeleton.png'));
  await wait(200);
  console.log('login-sk-2:', await cdpShot(win, 'loading-06-login-skeleton-sweep.png'));
  await until(`document.querySelector('.login-card input')`, 'login form');
  await wait(600);
  console.log('login:', await cdpShot(win, 'loading-07-login.png'));

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
