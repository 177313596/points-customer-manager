'use strict';
/* 截图：标准版鼠标聚光（有背景图 / 无背景图两种底），指针位置用真实鼠标移动事件推过去
   产出：%TEMP%\pm-spot-main.png、pm-spot-login.png */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-spot-shot');
app.setPath('userData', path.join(os.tmpdir(), 'pm-spot-shot-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (win, name) => {
  await wait(1200);
  const img = await win.webContents.capturePage();
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, img.toPNG());
  return p;
};
const moveTo = async (win, x, y) => {
  for (let i = 1; i <= 6; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x * i / 6), y: Math.round(y * i / 6) });
    await wait(90);
  }
  await wait(500);
};

async function login(win) {
  await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
    })()
  `).catch(() => { });
  await wait(2400);
}

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);

  await win.webContents.executeJavaScript(`
    (async () => { await window.api.setup('pass123','op456','管理员'); await window.api.acceptTerms(new Date().toISOString()); return true; })()
  `).catch(() => { });
  win.reload();
  await wait(2200);

  /* 塞一张真实界面截图当背景图，聚光在照片上才看得清 */
  const bgFile = path.join(os.tmpdir(), 'pm-spot-bg.png');
  const bgB64 = fs.readFileSync(fs.existsSync(bgFile) ? bgFile : path.join(__dirname, '..', '..', 'docs', 'screenshots', 'dashboard.png')).toString('base64');
  await win.webContents.executeJavaScript(`
    (async () => { const r = await window.api.settings.addLoginBg('data:image/png;base64,${bgB64}'); return r && r.ok; })()
  `).catch(() => { });
  await win.webContents.executeJavaScript(`window.api.settings.setLiquidGlass(false)`).catch(() => { });
  win.reload();
  await wait(2200);

  /* 登录页：先用无背景的浅底看聚光，再推鼠标到右侧 */
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 60, y: 60 });
  await moveTo(win, 980, 420);
  const spotState = await win.webContents.executeJavaScript(`
    (() => {
      const s = document.querySelector('.spotlight');
      if (!s) return 'missing';
      const cs = getComputedStyle(s);
      return JSON.stringify({ on: s.classList.contains('on'), opacity: cs.opacity, size: cs.width, transform: cs.transform, z: cs.zIndex });
    })()
  `).catch(() => 'err');
  console.log('login spotlight:', spotState);
  const loginShot = await shot(win, 'pm-spot-login.png');

  await login(win);
  await moveTo(win, 1000, 460);
  const mainState = await win.webContents.executeJavaScript(`
    (() => {
      const s = document.querySelector('.spotlight');
      if (!s) return 'missing';
      return JSON.stringify({ on: s.classList.contains('on'), count: document.querySelectorAll('.spotlight').length });
    })()
  `).catch(() => 'err');
  console.log('main spotlight:', mainState);
  const mainShot = await shot(win, 'pm-spot-main.png');

  console.log('shots:', loginShot, mainShot);
  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
