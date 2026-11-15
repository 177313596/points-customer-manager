'use strict';
/* 端到端验证：界面模式（标准版 / 简洁版）
   1) 默认 standard
   2) 设置页切 lite 只需登录、不需要操作密码（elevated 未开启也能成功）
   3) settings:get 与 auth:status 都能读到 lite（登录页据此不加载背景图）
   4) 非法值被拒绝
   5) 切回 standard 生效 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-uimode-' + Date.now());
app.setName('pm-uimode-test');
app.setPath('userData', TMP);

require(path.join(__dirname, '..', 'electron', 'main.js'));

const logFile = path.join(os.tmpdir(), 'pm-uimode-result.txt');
const lines = [];
const say = (s) => { lines.push(String(s)); console.log(String(s)); };
const flush = () => { try { fs.writeFileSync(logFile, lines.join('\n') + '\n', 'utf8'); } catch (e) { /* ignore */ } };

setTimeout(() => { say('TIMEOUT-EXIT'); flush(); app.exit(1); }, 30000);

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const win = new BrowserWindow({
    show: false, width: 400, height: 300,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  const blank = path.join(TMP, 'blank.html');
  fs.writeFileSync(blank, '<html><body>x</html>');
  await win.loadFile(blank);
  await new Promise((r) => setTimeout(r, 300));

  const res = await win.webContents.executeJavaScript(`
    (async () => {
      const out = {};
      const api = window.api;

      // 未登录时不允许改（证明它需要登录态，只是不需要操作密码）
      out.anonRejected = (await api.settings.setUiMode('lite')).ok === false;

      await api.setup('pass123', 'op456', '管理员');
      await api.login('管理员', 'pass123');

      const g0 = await api.settings.get();
      out.defaultMode = g0.ok ? g0.data.ui_mode : 'ERR:' + g0.error;
      const s0 = await api.status();
      out.statusDefault = s0.ok ? s0.data.ui_mode : 'ERR';

      // 没有 verifyOp（elevated 未开启），切 lite 仍应成功
      const a = await api.settings.setUiMode('lite');
      out.liteOk = a.ok;
      out.liteReturned = a.ok ? a.data.ui_mode : 'ERR:' + a.error;
      const g1 = await api.settings.get();
      out.afterLite = g1.ok ? g1.data.ui_mode : 'ERR';
      const s1 = await api.status();
      out.statusLite = s1.ok ? s1.data.ui_mode : 'ERR';

      const bad = await api.settings.setUiMode('fancy');
      out.badRejected = bad.ok === false && String(bad.error).includes('standard');

      const b = await api.settings.setUiMode('standard');
      out.backOk = b.ok;
      const g2 = await api.settings.get();
      out.backMode = g2.ok ? g2.data.ui_mode : 'ERR';

      // 设置总保存（settings:save）也兼容 ui_mode 字段（这个接口本身要操作密码，先授权）
      await api.verifyOp('op456');
      const viaSave = await api.settings.save({ ui_mode: 'lite' });
      out.viaSaveOk = viaSave.ok;
      out.viaSaveMode = viaSave.ok ? viaSave.data.ui_mode : 'ERR:' + viaSave.error;
      await api.settings.setUiMode('standard');

      return out;
    })()
  `);

  Object.entries(res).forEach(([k, v]) => say(k + ' = ' + JSON.stringify(v)));

  const expect = {
    anonRejected: true,
    defaultMode: 'standard',
    statusDefault: 'standard',
    liteOk: true,
    liteReturned: 'lite',
    afterLite: 'lite',
    statusLite: 'lite',
    badRejected: true,
    backOk: true,
    backMode: 'standard',
    viaSaveOk: true,
    viaSaveMode: 'lite',
  };
  let allPass = true;
  Object.entries(expect).forEach(([k, v]) => {
    const ok = res[k] === v;
    if (!ok) allPass = false;
    say((ok ? 'PASS ' : 'FAIL ') + k + ' expect=' + JSON.stringify(v));
  });
  say(allPass ? 'RESULT ALL-PASS' : 'RESULT HAS-FAIL');
  flush();
  app.exit(allPass ? 0 : 1);
});
