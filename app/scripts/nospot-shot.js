'use strict';
/* 验证：鼠标聚光（Spotlight）已移除
   1) 登录页、后台页分别断言页面里不存在 .spotlight 节点
   2) 截两张图，确认背景只剩背景图本身
   产出：%TEMP%\pm-clean-*.png */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-nospot-shot');
app.setPath('userData', path.join(os.tmpdir(), 'pm-nospot-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (win, name) => win.webContents.capturePage().then((img) => {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, img.toPNG());
  return p;
});

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);

  const until = async (expr, label, timeout = 9000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const ok = await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false);
      if (ok) return true;
      await wait(250);
    }
    console.log('timeout waiting for ' + label);
    return false;
  };

  await win.webContents.executeJavaScript(`
    (async () => { await window.api.setup('pass123','','管理员'); await window.api.acceptTerms(new Date().toISOString()); return true; })()
  `).catch(() => { });
  win.reload();
  await until(`document.querySelector('.login-card input')`, 'login card');

  const loginSpot = await win.webContents.executeJavaScript(
    `JSON.stringify({ spotlight: document.querySelectorAll('.spotlight').length, card: !!document.querySelector('.login-card') })`
  ).catch((e) => 'err ' + e.message);
  console.log('登录页: ' + loginSpot);
  console.log('shot login:', await shot(win, 'pm-clean-login.png'));

  const logged = await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      if (!ins.length) return 'no-login';
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
      return 'ok';
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('login:', logged);
  await until(`document.querySelector('.nav-pill')`, 'nav pill', 12000);
  await wait(900);

  /* 鼠标在页面中央划两下——移除前这里会点亮一块柔光 */
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 500, y: 300 });
  await wait(120);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 900, y: 500 });
  await wait(700);

  const dashSpot = await win.webContents.executeJavaScript(`
    (() => {
      const n = document.querySelectorAll('.spotlight').length;
      const glow = [...document.querySelectorAll('div')].filter(d => {
        const cs = getComputedStyle(d);
        return cs.position === 'absolute' && parseFloat(cs.width) > 600 && (cs.backgroundImage || '').includes('radial-gradient') && cs.zIndex === '0' && cs.pointerEvents === 'none';
      }).length;
      return JSON.stringify({ spotlight: n, radialGlow: glow, navPill: !!document.querySelector('.nav-pill'), bgLayer: !!document.querySelector('.app-bg-layer') });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('后台页: ' + dashSpot);
  console.log('shot dash:', await shot(win, 'pm-clean-dash.png'));

  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
