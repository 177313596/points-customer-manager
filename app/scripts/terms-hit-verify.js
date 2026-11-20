'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'pm-hit6-' + Date.now()));
const logFile = path.join(os.tmpdir(), 'pm-hit6-result.txt');
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
  ipcMain.handle('auth:accept-terms', () => ok({ terms_accepted: '2026-11-20T00:00:00.000Z' }));

  const win = new BrowserWindow({
    show: false, width: 1360, height: 860,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  try { await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')); } catch (e) { say('load threw ' + e.message); }
  win.webContents.focus();
  await wait(1300);

  const snap = () => win.webContents.executeJavaScript(`
    (() => {
      const box = document.querySelector('.terms-box');
      const cs = document.querySelector('.terms-consent');
      const ft = document.querySelector('.terms-foot');
      const bt = document.querySelector('.terms-foot .btn');
      if (!cs || !bt) return JSON.stringify({ gate: !!document.querySelector('.terms-gate'), gone: true });
      const rb = box.getBoundingClientRect(), rc = cs.getBoundingClientRect(), rf = ft.getBoundingClientRect(), rbn = bt.getBoundingClientRect();
      return JSON.stringify({
        gate: true,
        box: [Math.round(rb.left), Math.round(rb.top), Math.round(rb.width), Math.round(rb.height)],
        consent: [Math.round(rc.left), Math.round(rc.top), Math.round(rc.width), Math.round(rc.height)],
        foot: [Math.round(rf.left), Math.round(rf.top), Math.round(rf.width), Math.round(rf.height)],
        btn: [Math.round(rbn.left), Math.round(rbn.top), Math.round(rbn.width), Math.round(rbn.height)],
        checked: cs.getAttribute('aria-checked'),
        locked: cs.classList.contains('locked'),
        hint: (document.querySelector('.terms-hint') || {}).textContent || '',
        btnText: bt.textContent.trim(),
      });
    })()
  `);

  const clickAt = async (x, y) => {
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await wait(400);
  };

  let s = JSON.parse(await snap());
  say('geom ' + JSON.stringify(s));

  // 1) 倒计时内点方框
  await clickAt(s.box[0] + s.box[2] / 2, s.box[1] + s.box[3] / 2);
  say('lock: click box -> ' + await snap());

  // 2) 倒计时内点按钮左侧留白
  await clickAt(s.foot[0] + 8, s.foot[1] + Math.round(s.foot[3] / 2));
  say('lock: click foot-left -> ' + await snap());

  // 等倒计时结束
  await wait(11000);
  s = JSON.parse(await snap());
  say('countdown done -> ' + JSON.stringify(s));

  // 3) 解锁后点方框
  await clickAt(s.box[0] + s.box[2] / 2, s.box[1] + s.box[3] / 2);
  say('unlock: click box -> ' + await snap());

  // 4) 点按钮左侧留白（本来点不到按钮的 24px padding 区）
  s = JSON.parse(await snap());
  await clickAt(s.foot[0] + 8, s.foot[1] + Math.round(s.foot[3] / 2));
  await wait(400);
  say('unlock: click foot-left -> ' + await snap());

  fs.writeFileSync(logFile, lines.join('\n') + '\n');
  app.exit(0);
}).catch((e) => { fs.writeFileSync(logFile, 'ERR ' + (e && e.stack)); app.exit(2); });
