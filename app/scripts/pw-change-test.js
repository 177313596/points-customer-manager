'use strict';
/* 端到端验证 auth:change-password：登录密码 / 操作密码都要能真的改掉，且校验的是各自的"原密码" */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-pw-' + Date.now());
app.setName('pm-pw-test');
app.setPath('userData', TMP);

require(path.join(__dirname, '..', 'electron', 'main.js'));

const logFile = path.join(os.tmpdir(), 'pm-pw-result.txt');
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
      const api = window.api;
      const out = {};
      try {
        out.setup = await api.setup('pass123', 'op456', '管理员');
        out.login = await api.login('管理员', 'pass123');
        out.verify = await api.verifyOp('op456');

        // 1) 错误的原登录密码必须被拒
        out.wrongOld = await api.changePassword('login', 'badpass', 'newpass1');
        // 2) 正确的原登录密码可以改
        out.changeLogin = await api.changePassword('login', 'pass123', 'newpass1');
        // 3) 旧密码登不进去
        out.oldLoginFails = await api.login('管理员', 'pass123');
        // 4) 新密码能登进去
        out.newLoginOk = await api.login('管理员', 'newpass1');

        // 5) 改操作密码：错误的原操作密码被拒
        out.wrongOp = await api.changePassword('op', 'nope', 'newop789');
        // 6) 正确则改成功
        out.changeOp = await api.changePassword('op', 'op456', 'newop789');
        // 7) 旧操作密码失效、新操作密码可用
        out.oldOpFails = await api.verifyOp('op456');
        out.newOpOk = await api.verifyOp('newop789');

        // 8) 太短的新密码被拒
        out.tooShort = await api.changePassword('login', 'newpass1', '123');
      } catch (e) {
        out.fatal = e && e.message;
      }
      return out;
    })()
  `);

  const ok = (x) => !!(x && x.ok);
  const bad = (x) => !(x && x.ok) && !!(x && x.error);

  say('fatal: ' + (r.fatal || 'none'));
  say('setup ok=' + ok(r.setup));
  say('wrongOld 被拒: ' + bad(r.wrongOld) + ' -> ' + (r.wrongOld && r.wrongOld.error));
  say('changeLogin ok=' + ok(r.changeLogin));
  say('旧登录密码失效: ' + bad(r.oldLoginFails) + ' -> ' + (r.oldLoginFails && r.oldLoginFails.error));
  say('新登录密码可用: ' + ok(r.newLoginOk));
  say('wrongOp 被拒: ' + bad(r.wrongOp) + ' -> ' + (r.wrongOp && r.wrongOp.error));
  say('changeOp ok=' + ok(r.changeOp));
  say('旧操作密码失效: ' + bad(r.oldOpFails) + ' -> ' + (r.oldOpFails && r.oldOpFails.error));
  say('新操作密码可用: ' + ok(r.newOpOk));
  say('太短密码被拒: ' + bad(r.tooShort) + ' -> ' + (r.tooShort && r.tooShort.error));

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  fs.writeFileSync(logFile, lines.join('\n') + '\n');

  const pass = lines.every((l) => !/false|undefined|none/.test(l.replace('fatal: none', '')));
  app.exit(pass ? 0 : 3);
});
