'use strict';
/* 校验无边框圆角窗口：窗口透明、外壳圆角、最大化撤圆角、窗口按钮 IPC 可用（临时 userData） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-winframe-' + Date.now());
app.setName('pm-winframe');
app.setPath('userData', TMP);
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  await wait(1600);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1200, 800);
  await wait(1200);

  const before = await win.webContents.executeJavaScript(`
    (async () => {
      const st = await window.api.app.state();
      const shell = document.querySelector('.shell') || document.querySelector('.login-wrap');
      return JSON.stringify({
        state: st.ok ? st.data : st.error,
        bodyClass: document.body.className,
        radius: shell ? getComputedStyle(shell).borderRadius : '',
        controls: document.querySelectorAll('.win-btn').length,
        drag: !!document.querySelector('.win-drag'),
      });
    })()
  `);
  console.log('normal:', before);
  const img1 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(os.tmpdir(), 'pm-win-normal.png'), img1.toPNG());

  win.maximize();
  await wait(900);
  const maxed = await win.webContents.executeJavaScript(`
    (async () => {
      const st = await window.api.app.state();
      const shell = document.querySelector('.shell') || document.querySelector('.login-wrap');
      return JSON.stringify({ state: st.ok ? st.data : st.error, bodyClass: document.body.className, radius: shell ? getComputedStyle(shell).borderRadius : '' });
    })()
  `);
  console.log('maximized:', maxed);

  win.unmaximize();
  await wait(800);
  const back = await win.webContents.executeJavaScript(`
    (async () => {
      const shell = document.querySelector('.shell') || document.querySelector('.login-wrap');
      return JSON.stringify({ bodyClass: document.body.className, radius: shell ? getComputedStyle(shell).borderRadius : '' });
    })()
  `);
  console.log('restored:', back);

  // 窗口按钮 IPC（public，登录前也应该能用）
  const ipcOk = await win.webContents.executeJavaScript(`
    (async () => {
      const r = await window.api.app.maximize();
      return JSON.stringify({ ok: r.ok, maximizedNow: r.ok ? r.data : null });
    })()
  `);
  console.log('win ipc:', ipcOk);

  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
