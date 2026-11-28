'use strict';
/* 光斑强度量化：同一张卡片，光标移入前 / 移入 1s 后各截一张全窗图，
   用固定坐标做像素差（避免动画未结束、页面淡入等干扰）。 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-glow-measure');
app.setPath('userData', path.join(os.tmpdir(), 'pm-glow-' + Date.now()));
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
  const until = async (expr, label, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const ok = await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false);
      if (ok) return true;
      await wait(250);
    }
    console.log('timeout ' + label); return false;
  };

  await win.webContents.executeJavaScript(`
    (async () => { await window.api.setup('pass123','','管理员'); await window.api.acceptTerms(new Date().toISOString()); return true; })()
  `).catch(() => { });
  win.reload();
  await until(`document.querySelector('.login-card input')`, 'login card');
  await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
    })()
  `);
  await until(`document.querySelector('.nav-pill')`, 'nav pill');
  await wait(1600);

  const geom = JSON.parse(await win.webContents.executeJavaScript(`
    (() => {
      const card = [...document.querySelectorAll('.card')][0];
      const side = document.querySelector('.sidebar');
      const a = card.getBoundingClientRect(), b = side.getBoundingClientRect();
      return JSON.stringify({
        card: [Math.round(a.left), Math.round(a.top), Math.round(a.width), Math.round(a.height)],
        side: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
      });
    })()
  `));
  console.log('geom:', JSON.stringify(geom));

  // 光标停在两张卡片之间的缝里（不触发任何卡片）
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 690, y: 458 });
  await wait(900);
  console.log('idle:', await shot(win, 'glow-a-idle.png'));

  // 移入「积分」卡右下
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 405 });
  await wait(1000);
  const state = await win.webContents.executeJavaScript(`
    (() => {
      const c = [...document.querySelectorAll('.card')][0];
      return JSON.stringify({ before: getComputedStyle(c, '::before').opacity, after: getComputedStyle(c, '::after').opacity, tx: c.style.getPropertyValue('--tx'), ty: c.style.getPropertyValue('--ty'), mx: c.style.getPropertyValue('--mx') });
    })()
  `);
  console.log('hover state:', state);
  console.log('hover:', await shot(win, 'glow-b-hover.png'));

  // 深色菜单：光标停在菜单中部
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 126, y: 430 });
  await wait(1000);
  console.log('menu:', await shot(win, 'glow-c-menu.png'));

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
