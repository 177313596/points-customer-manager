'use strict';
/* 端到端验证：settings:set-login-bg 真的把图片写进 userData\login-bg\，库里只留 file:// 指向 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-ipc-' + Date.now());
app.setName('pm-ipc-test');
app.setPath('userData', TMP);

require(path.join(__dirname, '..', 'electron', 'main.js'));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const logFile = path.join(os.tmpdir(), 'pm-ipc-result.txt');
const lines = [];
const say = (s) => lines.push(String(s));
say('userData=' + TMP);

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const blank = path.join(TMP, 'blank.html');
  fs.writeFileSync(blank, '<html><body>x</html>');
  win.webContents.on('preload-error', (e, p, err) => say('preload-error ' + p + ' :: ' + err.message));
  win.webContents.on('console-message', (e, level, msg) => say('console: ' + msg));
  await win.loadFile(blank);
  await new Promise((r) => setTimeout(r, 300));

  const run = (code) => win.webContents.executeJavaScript(code);

  const r = await run(`
    (async () => {
      const out = {};
      try {
        const api = window.api;
        out.hasApi = !!api;
        if (!api) return out;
        out.setup = await api.setup('pass123', 'op456', '管理员');
        out.login = await api.login('管理员', 'pass123');
        out.verify = await api.verifyOp('op456');
        out.badType = await api.settings.setLoginBg('hello');
        out.save = await api.settings.setLoginBg(${JSON.stringify(PNG)});
        out.status = await api.status();
      } catch (e) {
        out.fatal = e && e.message;
      }
      return out;
    })()
  `);
  say('fatal: ' + (r.fatal || 'none'));

  say('setup ok=' + (r.setup && r.setup.ok));
  say('login ok=' + (r.login && r.login.ok));
  say('verify ok=' + (r.verify && r.verify.ok));
  say('非图片被拒: ' + JSON.stringify(r.badType && r.badType.error));
  say('save: ' + JSON.stringify(r.save && r.save.data));
  const saved = (r.save && r.save.data && r.save.data.login_bg) || '';
  say('返回是 file:// : ' + saved.startsWith('file:///'));
  say('status 里的 login_bg: ' + String((r.status && r.status.data && r.status.data.login_bg) || '').slice(0, 120));

  const filePath = path.join(TMP, 'login-bg', 'login-bg.png');
  say('磁盘文件存在: ' + fs.existsSync(filePath) + ' 字节=' + (fs.existsSync(filePath) ? fs.statSync(filePath).size : -1));

  const dbFile = path.join(TMP, 'data', 'points-data.db');
  const dbSize = fs.existsSync(dbFile) ? fs.statSync(dbFile).size : -1;
  say('数据库大小(字节): ' + dbSize + '（应很小，说明大图没进库）');

  // 移除背景：文件应被删掉，库里也该清空
  const rm = await run(`window.api.settings.setLoginBg('')`);
  say('移除返回: ' + JSON.stringify(rm && rm.data));
  say('移除后磁盘目录还在: ' + fs.existsSync(path.join(TMP, 'login-bg')));

  // 清理测试库
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  fs.writeFileSync(logFile, lines.join('\n') + '\n');

  const ok = lines.every((l) => !/false|-1|: none|error/i.test(l));
  app.exit(ok ? 0 : 3);
});
