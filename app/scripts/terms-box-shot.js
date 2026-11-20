'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'pm-shot-terms-' + Date.now()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const ok = (data) => ({ ok: true, data });
  ipcMain.handle('auth:status', () => ok({
    hasPassword: true, username: '管理员', shop_name: '积分客户管理系统', version: '1.1.0',
    login_bg: '', login_bgs: [], theme: { accent: '#0F766E' }, terms_accepted: '', login_bg_rotate: false,
    ui_mode: 'standard',
  }));
  ipcMain.handle('auth:accept-terms', () => ok({ terms_accepted: '2026-11-20T00:00:00.000Z' }));

  const win = new BrowserWindow({
    show: false, width: 1360, height: 860,
    webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  try { await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')); } catch (e) {}
  win.webContents.focus();
  await wait(1200);
  await wait(11000);   // 等倒计时结束，才能勾选

  const rects = () => win.webContents.executeJavaScript(`
    (() => {
      const lb = document.querySelector('.terms-consent');
      const b = document.querySelector('.terms-box').getBoundingClientRect();
      const h = document.querySelector('.terms-hit').getBoundingClientRect();
      if (!lb) return JSON.stringify({ none: true });
      const r = lb.getBoundingClientRect();
      return JSON.stringify({
        consent: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        visual: [Math.round(b.width), Math.round(b.height)],
        hit: [Math.round(h.width), Math.round(h.height)],
        checked: document.querySelector('.terms-box').classList.contains('on'),
        locked: lb.classList.contains('locked'),
      });
    })()
  `);

  const snap = async (tag, expand = 18) => {
    const info = JSON.parse(await rects());
    const [x, y, w, h] = info.consent;
    const shot = await win.webContents.capturePage({
      x: Math.max(0, x - expand), y: Math.max(0, y - expand),
      width: Math.min(1360 - Math.max(0, x - expand), w + expand * 2),
      height: Math.min(860 - Math.max(0, y - expand), h + expand * 2),
    });
    fs.writeFileSync(path.join(os.tmpdir(), 'pm-terms-' + tag + '.png'), shot.toPNG());
    return info;
  };

  const before = await snap('off');
  await win.webContents.executeJavaScript("document.querySelector('.terms-consent').click();").catch(() => {});
  await wait(500);
  const after = await snap('on');
  fs.writeFileSync(path.join(os.tmpdir(), 'pm-terms-metrics.txt'), JSON.stringify({ before, after }, null, 2));
  app.exit(0);
});
