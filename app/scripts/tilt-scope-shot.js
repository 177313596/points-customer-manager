'use strict';
/* v1.2.0 截图：工作台卡片悬停会倾斜 / 其它页面卡片悬停只亮不倾 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-tilt-shot');
app.setPath('userData', path.join(os.tmpdir(), 'pm-tiltshot-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'C:\\Users\\17731\\Doubao\\chats\\2026-11-07\\new-chat-2\\docs\\screenshots';

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  win.setContentSize(1360, 860);
  win.show();
  const js = (code) => win.webContents.executeJavaScript(code).catch((e) => 'ERR:' + e.message);
  const until = async (expr, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await js(`!!(${expr})`)) return true;
      await wait(200);
    }
    return false;
  };
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  const snap = async (name) => {
    const r = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  };

  await js(`(async () => { await window.api.setup('pass123','','管理员'); await window.api.acceptTerms(new Date().toISOString()); return true; })()`);
  win.reload();
  await until(`document.querySelector('.login-card input')`);
  await js(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
    })()
  `);
  await until(`document.querySelector('.nav-pill')`);
  await wait(1600);

  const hoverReal = async (sel, fx, fy) => {
    const r = JSON.parse(await js(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return 'null'; const b = el.getBoundingClientRect();
        return JSON.stringify([Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]); })()
    `));
    if (!r || r === 'null' || !r.length) return null;
    const [L, T, W, H] = r;
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(L + W * fx), y: Math.round(T + H * fy) });
    await wait(80);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(L + W * fx) + 2, y: Math.round(T + H * fy) + 1 });
    await wait(560);
    return JSON.parse(await js(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)});
        return JSON.stringify({ tx: el.style.getPropertyValue('--tx'), ty: el.style.getPropertyValue('--ty'), hot: el.classList.contains('is-hot'),
          transform: getComputedStyle(el).transform.slice(0, 40) }); })()
    `));
  };

  const goPage = async (label) => {
    await js(`
      (() => { const items = [...document.querySelectorAll('.nav-item')];
        const b = items.find(x => x.textContent.replace(/\\s+/g,'').includes(${JSON.stringify(label)}));
        if (b) b.click(); })()
    `);
    await wait(1000);
  };

  const dash = await hoverReal('.dash .card', 0.86, 0.5);
  await snap('tilt-20-dashboard-tilt.png');
  console.log('dashboard: ' + JSON.stringify(dash));

  await goPage('顾客管理');
  const cust = await hoverReal('.content .card', 0.86, 0.5);
  await snap('tilt-21-customers-flat.png');
  console.log('customers: ' + JSON.stringify(cust));

  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
