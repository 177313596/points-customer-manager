'use strict';
/* 截图验证：登录页与工作台左上角的图片 logo、以及全站圆角（临时 userData，不碰真实数据） */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-brand-shot-' + Date.now());
app.setName('pm-brand-shot');
app.setPath('userData', TMP);
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);
  await wait(1000);

  await win.webContents.executeJavaScript(`
    (async () => {
      const s = await window.api.setup('pass123', 'op456', '管理员');
      const t = await window.api.acceptTerms(new Date().toISOString());
      return JSON.stringify({ setup: s.ok, terms: t.ok });
    })()
  `).catch((e) => 'ERR:' + e.message);

  win.reload();
  await wait(2200);

  // 先截登录页
  const loginImg = await win.webContents.capturePage();
  const loginOut = path.join(os.tmpdir(), 'pm-shot-login.png');
  fs.writeFileSync(loginOut, loginImg.toPNG());
  const loginInfo = await win.webContents.executeJavaScript(`
    JSON.stringify({
      logos: [...document.querySelectorAll('.brand-logo')].map(i => i.naturalWidth + 'x' + i.naturalHeight),
      radius: (() => { const c = document.querySelector('.login-card'); return c ? getComputedStyle(c).borderRadius : ''; })(),
    })
  `).catch((e) => 'ERR:' + e.message);
  console.log('login:', loginInfo, '->', loginOut);

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
  `).catch((e) => console.log('fill err', e.message));
  await wait(2600);

  const dashImg = await win.webContents.capturePage();
  const dashOut = path.join(os.tmpdir(), 'pm-shot-dash.png');
  fs.writeFileSync(dashOut, dashImg.toPNG());
  const dashInfo = await win.webContents.executeJavaScript(`
    JSON.stringify({
      logos: [...document.querySelectorAll('.brand-logo')].length,
      cards: [...document.querySelectorAll('.card')].slice(0, 3).map(c => getComputedStyle(c).borderRadius),
      btns: [...document.querySelectorAll('.btn')].slice(0, 2).map(b => getComputedStyle(b).borderRadius),
    })
  `).catch((e) => 'ERR:' + e.message);
  console.log('dash:', dashInfo, '->', dashOut);
  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
