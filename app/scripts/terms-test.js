'use strict';
/* 验证《使用声明》同意记录：IPC 通行 + 真正写进 db 的 settings 表 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-terms-' + Date.now());
app.setName('pm-terms-test');
app.setPath('userData', TMP);

require(path.join(__dirname, '..', 'electron', 'main.js'));

const logFile = path.join(os.tmpdir(), 'pm-terms-result.txt');
const lines = [];
const say = (s) => lines.push(String(s));

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  const blank = path.join(TMP, 'blank.html');
  fs.writeFileSync(blank, '<html><body>x</html>');
  await win.loadFile(blank);
  await new Promise((r) => setTimeout(r, 300));

  const r = await win.webContents.executeJavaScript(`
    (async () => {
      const out = {};
      out.statusBefore = await window.api.status();
      out.accept = await window.api.acceptTerms('2026-11-08T09:30:00.000Z');
      out.statusAfter = await window.api.status();
      return out;
    })()
  `);

  const before = r.statusBefore && r.statusBefore.ok ? r.statusBefore.data.terms_accepted : 'ERR';
  const after = r.statusAfter && r.statusAfter.ok ? r.statusAfter.data.terms_accepted : 'ERR';
  say('status before = [' + before + ']');
  say('before empty: ' + (before === ''));
  say('accept ok: ' + !!(r.accept && r.accept.ok) + ' -> ' + (r.accept && r.accept.data && r.accept.data.terms_accepted));
  say('status after = [' + after + ']');
  say('after non-empty: ' + (!!after && after !== ''));

  // 从磁盘上的库文件里核对确实落库了
  const dbFile = path.join(TMP, 'data', 'points-data.db');
  say('db exists: ' + fs.existsSync(dbFile));
  let persisted = 'ERR';
  try {
    const SQL = await require('sql.js')({
      locateFile: (f) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f),
    });
    const buf = fs.readFileSync(dbFile);
    const dbh = new SQL.Database(new Uint8Array(buf));
    const res = dbh.exec("SELECT value FROM settings WHERE key='terms_accepted'");
    persisted = res.length ? JSON.stringify(res[0].values) : 'no-row';
    dbh.close();
  } catch (e) {
    persisted = 'err: ' + e.message;
  }
  say('persisted in db: ' + persisted);
  say('db file bytes: ' + (fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0));

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  fs.writeFileSync(logFile, lines.join('\n') + '\n');
  const pass = lines.every((l) => /true|bytes|before =|after =|persisted|db exists: true/.test(l));
  app.exit(pass ? 0 : 3);
});
