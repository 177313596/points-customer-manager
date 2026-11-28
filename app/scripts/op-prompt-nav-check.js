'use strict';
/* 注册完成提醒：时机（先主界面后弹窗）+「现在去设置」落点 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');

app.setName('pm-op-prompt');
app.setPath('userData', path.join(os.tmpdir(), 'pm-op-prompt-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await js(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const ins = [...document.querySelectorAll('.login-card input')];
      const n = ins.length;
      const labels = [...document.querySelectorAll('.login-card .field-label')].map((l) => l.textContent);
      if (n >= 3) { setVal(ins[0], '管理员'); setVal(ins[1], 'pass123'); setVal(ins[2], 'pass123'); }
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.includes('完成初始化')).click();
      return JSON.stringify({ fields: n, labels, hasOpField: labels.some((t) => t.includes('操作密码')) });
    })()
  `).then((r) => console.log('setup-form:', r));

  const t0 = Date.now();
  let order = [];
  for (let i = 0; i < 60; i += 1) {
    const s = JSON.parse(await js(`(() => JSON.stringify({ sk: !!document.querySelector('.sk-scope'), nav: !!document.querySelector('.nav-item'), modal: !!document.querySelector('.modal') }))()`));
    const key = (s.sk ? 'skeleton ' : '') + (s.nav ? 'main ' : '') + (s.modal ? 'modal' : '');
    if (!order.length || order[order.length - 1].key !== key.trim()) order.push({ at: Date.now() - t0, key: key.trim() });
    if (s.modal) break;
    await wait(50);
  }
  console.log('phase-order:', JSON.stringify(order));

  const goSet = await js(`
    (() => { const b = [...document.querySelectorAll('.modal .btn')].find((x) => x.textContent.includes('现在去设置')); if (b) b.click(); return 'clicked'; })()
  `);
  await wait(600);
  const where = await js(`
    (() => {
      const h = document.querySelector('.topbar h2');
      const active = [...document.querySelectorAll('.set-nav-item.active')].map((x) => x.textContent.trim());
      const paneTitle = document.querySelector('.set-pane h3');
      return JSON.stringify({ page: h && h.textContent, setTab: active, pane: paneTitle && paneTitle.textContent, modalClosed: !document.querySelector('.modal') });
    })()
  `);
  console.log('go-settings:', goSet, where);

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
