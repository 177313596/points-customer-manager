'use strict';
/* 定位使用声明里「复选框」和「同意并继续」按钮的点击命中问题：
   输出各目标中心点/边缘点上的最上层元素，找出遮挡者 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'pm-hit-' + Date.now()));

const logFile = path.join(os.tmpdir(), 'pm-hit-result.txt');
const lines = [];
const say = (s) => lines.push(String(s));

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
  await new Promise((r) => setTimeout(r, 900));

  const res = await win.webContents.executeJavaScript(`
    (() => {
      const desc = (el) => {
        if (!el) return 'null';
        const cls = el.className ? ('.' + String(el.className).split(' ').join('.')) : '';
        return el.tagName + cls + (el.id ? ('#' + el.id) : '');
      };
      const stack = (x, y) => document.elementsFromPoint(x, y).slice(0, 4).map(desc).join(' < ');
      const out = {};

      const cb = document.querySelector('.terms-consent input');
      if (cb) {
        const r = cb.getBoundingClientRect();
        out.cbRect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
        out.cbCenter = stack(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        out.cbOffset2 = stack(Math.round(r.left + 2), Math.round(r.top + r.height / 2));
      } else out.cb = 'missing';

      const label = document.querySelector('.terms-consent');
      if (label) {
        const r = label.getBoundingClientRect();
        out.labelRect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
        out.labelMidRight = stack(Math.round(r.right - 40), Math.round(r.top + r.height / 2));
      }

      const btn = document.querySelector('.terms-foot .btn');
      if (btn) {
        const r = btn.getBoundingClientRect();
        out.btnRect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
        out.btnLeft2 = stack(Math.round(r.left + 2), Math.round(r.top + r.height / 2));
        out.btnLeft20 = stack(Math.round(r.left + 20), Math.round(r.top + r.height / 2));
        out.btnCenter = stack(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      } else out.btn = 'missing';

      const card = document.querySelector('.terms-card');
      if (card) {
        const r = card.getBoundingClientRect();
        out.cardRect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
      }
      const gate = document.querySelector('.terms-gate');
      if (gate) {
        const r = gate.getBoundingClientRect();
        out.gateRect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
      }
      // 找出所有比声明卡片更靠上、且覆盖卡片区域的固定/绝对定位元素
      out.overlays = [...document.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el);
        if (!/fixed|absolute/.test(s.position)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 100 && r.height > 30 && Number(s.zIndex || 0) >= 3000;
      }).map((el) => desc(el) + ' z=' + getComputedStyle(el).zIndex + ' @' +
        Math.round(el.getBoundingClientRect().left) + ',' + Math.round(el.getBoundingClientRect().top) +
        ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
      return out;
    })()
  `).catch((e) => ({ error: e && e.message }));

  say(JSON.stringify(res, null, 2));
  fs.writeFileSync(logFile, lines.join('\n') + '\n');
  app.exit(0);
}).catch((e) => { fs.writeFileSync(logFile, 'ERR ' + (e && e.stack)); app.exit(2); });
