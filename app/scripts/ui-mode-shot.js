'use strict';
/* 截图 + 断言：界面模式（标准版 / 简洁版）在真实渲染层的样子
   产出：%TEMP%\pm-mode-standard.png（设置页：两种模式卡片）
         %TEMP%\pm-mode-lite.png（简洁版工作台：无背景层、无动画）
   临时 userData，不碰真实数据库 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-mode-shot-' + Date.now());
app.setName('pm-mode-shot');
app.setPath('userData', TMP);
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (win, name) => {
  const img = await win.webContents.capturePage();
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, img.toPNG());
  return p;
};

async function login(win) {
  await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        d.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const inputs = [...document.querySelectorAll('.login-card input')];
      setVal(inputs[0], '管理员');
      setVal(inputs[1], 'pass123');
      const btn = [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统'));
      btn.click();
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
    (async () => {
      await window.api.setup('pass123', 'op456', '管理员');
      await window.api.acceptTerms(new Date().toISOString());
      return true;
    })()
  `).catch(() => { });
  win.reload();
  await wait(2200);
  await login(win);

  // 进设置 -> 外观与背景
  await win.webContents.executeJavaScript(`
    (() => {
      const nav = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.includes('设置'));
      if (nav) nav.click();
    })()
  `);
  await wait(1200);
  await win.webContents.executeJavaScript(`
    (() => {
      const t = [...document.querySelectorAll('.set-nav-item')].find(n => n.textContent.includes('外观'));
      if (t) t.click();
    })()
  `);
  await wait(900);

  const stdInfo = await win.webContents.executeJavaScript(`
    JSON.stringify({
      mode: (document.body.className || '').includes('ui-lite') ? 'lite' : 'standard',
      cards: [...document.querySelectorAll('.ui-mode-card')].map(c => c.textContent.slice(0, 6) + (c.className.includes('active') ? '*' : '')),
      pageAnim: (() => { const p = document.querySelector('.page-fade'); return p ? getComputedStyle(p).animationName : ''; })(),
      bgLayers: document.querySelectorAll('.app-bg-layer').length,
    })
  `);
  const stdShot = await shot(win, 'pm-mode-standard.png');

  // 给临时库塞一张背景图，验证"标准版有背景层、简洁版完全不渲染"
  const iconB64 = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.png')).toString('base64');
  await win.webContents.executeJavaScript(`
    (async () => {
      await window.api.verifyOp('op456');
      await window.api.settings.addLoginBg('data:image/png;base64,${iconB64}');
      return true;
    })()
  `).catch(() => { });
  win.reload();
  await wait(2200);
  await login(win);
  const stdBg = await win.webContents.executeJavaScript(
    `JSON.stringify({ mode: (document.body.className||''), layers: document.querySelectorAll('.app-bg-layer').length, bg: (()=>{const l=document.querySelector('.app-bg-layer');return l?getComputedStyle(l).backgroundImage.slice(0,22):'';})() })`
  );

  // 切简洁版：走设置接口 -> 重载（模拟设置后重开） -> 重新登录
  await win.webContents.executeJavaScript(`window.api.settings.setUiMode('lite')`);
  win.reload();
  await wait(2200);
  await login(win);

  const liteInfo = await win.webContents.executeJavaScript(`
    JSON.stringify({
      bodyClass: document.body.className,
      bgLayers: document.querySelectorAll('.app-bg-layer, .login-bg-layer').length,
      pageAnim: (() => { const p = document.querySelector('.page-fade'); return p ? getComputedStyle(p).animationName : ''; })(),
      cardShadow: (() => { const c = document.querySelector('.card'); return c ? getComputedStyle(c).boxShadow : ''; })(),
      workbench: !!document.querySelector('.quick-btn'),
    })
  `);
  const liteShot = await shot(win, 'pm-mode-lite.png');

  console.log('standard:', stdInfo, '->', stdShot);
  console.log('standard+背景图:', stdBg);
  console.log('lite:', liteInfo, '->', liteShot);

  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
