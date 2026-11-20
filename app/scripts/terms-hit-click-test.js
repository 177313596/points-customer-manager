'use strict';
/* 用真实鼠标事件（webContents.sendInputEvent）点复选框 / 按钮左侧，
   判断是“控件真的点不中”还是“只是程序化 click 能过” */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'pm-hit2-' + Date.now()));
const logFile = path.join(os.tmpdir(), 'pm-hit2-result.txt');
const lines = [];
const say = (s) => lines.push(String(s));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const ok = (data) => ({ ok: true, data });
  ipcMain.handle('auth:status', () => ok({
    hasPassword: true, username: '管理员', shop_name: '积分客户管理系统', version: '1.0.0',
    login_bg: '', login_bgs: [], theme: { accent: '#0F766E' }, terms_accepted: '', login_bg_rotate: false,
    ui_mode: 'standard',
  }));

  const win = new BrowserWindow({
    show: false, width: 1360, height: 860,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.focus();
  await wait(700);

  const rect = async (sel) => {
    const r = await win.webContents.executeJavaScript(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()
    `);
    return r;
  };
  const state = async () => win.webContents.executeJavaScript(`
    (() => {
      const cb = document.querySelector('.terms-consent input');
      const btn = document.querySelector('.terms-foot .btn');
      return JSON.stringify({
        checked: cb ? cb.checked : null,
        disabledCb: cb ? cb.disabled : null,
        locked: !!document.querySelector('.terms-consent.locked'),
        btnText: btn ? btn.textContent.trim() : '',
        btnDisabled: btn ? btn.disabled : null,
        timer: (document.querySelector('.terms-timer') || {}).textContent || '',
      });
    })()
  `);

  say('t0 ' + await state());

  // 等倒计时结束（10 秒）
  await wait(10500);
  say('after countdown ' + await state());

  const clickAt = async (x, y) => {
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await wait(350);
  };

  const cb = await rect('.terms-consent input');
  say('checkbox rect ' + JSON.stringify(cb));
  await clickAt(cb.x + Math.round(cb.w / 2), cb.y + Math.round(cb.h / 2));
  say('after clicking box center ' + await state());

  // 再点方框左上角 2px 处（模拟点边缘）
  await clickAt(cb.x + 2, cb.y + 2);
  say('after clicking box corner ' + await state());

  // 点文案区
  const label = await rect('.terms-consent');
  await clickAt(label.x + Math.round(label.w / 2), label.y + Math.round(label.h / 2));
  say('after clicking label text ' + await state());

  // 勾上后点按钮最左侧 3px
  const btn = await rect('.terms-foot .btn');
  say('button rect ' + JSON.stringify(btn));
  await clickAt(btn.x + 3, btn.y + Math.round(btn.h / 2));
  await wait(500);
  say('after clicking button left ' + await state());

  fs.writeFileSync(logFile, lines.join('\n') + '\n');
  app.exit(0);
}).catch((e) => { fs.writeFileSync(logFile, 'ERR ' + (e && e.stack)); app.exit(2); });
