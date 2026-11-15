'use strict';
/* 截图验证：登录后的主界面是否真的用上了登录页背景图（不碰真实数据，全部在临时 userData 里跑） */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-mainbg-shot-' + Date.now());
app.setName('pm-mainbg-shot');
app.setPath('userData', TMP);
require(path.join(__dirname, '..', 'electron', 'main.js'));

const OUT = path.join(os.tmpdir(), 'pm-mainbg-shot.png');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);
  await wait(1200);

  const bgFile = process.env.PM_SHOT_BG || path.join(__dirname, '..', 'build', 'icon.png');
  const bgDataUrl = 'data:image/png;base64,' + fs.readFileSync(bgFile).toString('base64');

  const setup = await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.api;
      const s = await api.setup('pass123', 'op456', '管理员');
      const l = await api.login('管理员', 'pass123');
      const o = await api.verifyOp('op456');
      const b = await api.settings.addLoginBg(${JSON.stringify(bgDataUrl)});
      return JSON.stringify({ setup: s.ok, login: l.ok, op: o.ok, bg: b.ok ? b.data.login_bgs.length : b.error });
    })()
  `).catch((e) => 'ERR:' + e.message);
  console.log('setup:', setup);

  // 重新载入，走正常"登录 -> 进入系统"流程
  win.reload();
  await wait(2000);
  await win.webContents.executeJavaScript(`
    (async () => {
      const setVal = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        d.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const inputs = [...document.querySelectorAll('.login-card input')];
      if (!inputs.length) return 'no-inputs';
      setVal(inputs[0], '管理员');
      setVal(inputs[1], 'pass123');
      const btn = [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统'));
      if (!btn) return 'no-btn';
      btn.click();
      return 'clicked';
    })()
  `).catch((e) => 'ERR:' + e.message);
  await wait(2500);

  const info = await win.webContents.executeJavaScript(`
    (() => {
      const l = document.querySelector('.app-bg-layer');
      return JSON.stringify({
        layers: document.querySelectorAll('.app-bg-layer').length,
        bg: l ? getComputedStyle(l).backgroundImage.slice(0, 60) : '',
        hasText: document.body.innerText.includes('预计得分'),
      });
    })()
  `).catch((e) => 'ERR:' + e.message);
  console.log('info:', info);

  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log('saved:', OUT, fs.statSync(OUT).size);
  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
