'use strict';
/* 使用声明新状态截图：右上角无倒计时徽标；未勾选时底部按钮不是禁用键，
   点它会出提示并把勾选行晃一下（把晃动动画停在半途，截到高亮那一下）。 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'pm-terms-new-' + Date.now()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'C:\\Users\\17731\\Doubao\\chats\\2026-11-07\\new-chat-2\\docs\\screenshots';

app.whenReady().then(async () => {
  const ok = (data) => ({ ok: true, data });
  ipcMain.handle('auth:status', () => ok({
    hasPassword: true, username: '管理员', shop_name: '积分客户管理系统', version: '1.1.8',
    login_bg: '', login_bgs: [], theme: { accent: '#0F766E' }, terms_accepted: '', login_bg_rotate: false,
    ui_mode: 'standard',
  }));
  ipcMain.handle('auth:accept-terms', () => ok({ terms_accepted: '2026-11-28T00:00:00.000Z' }));

  const win = new BrowserWindow({
    show: true, width: 1360, height: 860, backgroundColor: '#0B5F58',
    webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(() => {});
  const js = (code) => win.webContents.executeJavaScript(code).catch((e) => 'ERR:' + e.message);

  const until = async (expr, label, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await js(`!!(${expr})`)) return true;
      await wait(80);
    }
    console.log('timeout:', label);
    return false;
  };

  await until(`document.querySelector('.terms-gate')`, 'terms gate');
  await wait(400);

  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  const snap = async (name) => {
    const r = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const p = path.join(OUT, name);
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    return p;
  };

  const state = await js(`
    (() => {
      const b = document.querySelector('.terms-foot .btn');
      const t = document.querySelector('.terms-timer');
      return JSON.stringify({ btn: b ? b.textContent.trim() : '', cursor: b ? getComputedStyle(b).cursor : '', timer: !!t });
    })()
  `);

  const p1 = await snap('terms-10-gate-no-timer.png');

  /* 未勾选点"同意"：出提示 + 勾选行晃动；把动画暂停在半途再截 */
  await js("document.querySelector('.terms-foot .btn').click()");
  await wait(120);
  await js("(() => { const c = document.querySelector('.terms-consent'); if (c) c.style.animationPlayState = 'paused'; })()");
  const p2 = await snap('terms-11-unchecked-click.png');
  await js("(() => { const c = document.querySelector('.terms-consent'); if (c) c.style.animationPlayState = ''; })()");

  const hint = await js(
    "(() => ({ hint: (document.querySelector('.terms-hint')||{}).textContent.trim(), checked: document.querySelector('.terms-consent').getAttribute('aria-checked') }))()"
  );

  console.log('state: ' + state);
  console.log('hint: ' + JSON.stringify(hint));
  console.log('shots: ' + p1 + ' | ' + p2);
  app.exit(0);
});

