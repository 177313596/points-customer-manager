'use strict';
/* 验证「注册不设二级操作密码、设置里开启/关闭」这条链路：
   1. 初始化只设登录密码 → op_required=false
   2. 未启用时：建顾客 / 手动调整积分都不需要操作密码
   3. 设置页启用（auth:set-op-password）→ op_required=true
   4. 启用后：敏感接口返回 NEED_OP，手动调整必须当次输密码
   5. 关闭（auth:disable-op）需要正确的当前操作密码 → 关闭后恢复免验证
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-optest-' + Date.now());
app.setName('pm-op-test');
app.setPath('userData', TMP);

require(path.join(__dirname, '..', 'electron', 'main.js'));

const logFile = path.join(os.tmpdir(), 'pm-op-test-result.txt');
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
        // 1) 注册：只给登录密码，操作密码传空
        out.setup = await api.setup('pass123', '', '管理员');
        const st = await api.status();
        out.opRequiredAfterSetup = st.ok ? st.data.op_required : 'status-failed';
        out.verifyWhenOff = await api.verifyOp('op456');

        // 2) 未启用时，建顾客 / 手动调整都不该被拦
        const c = await api.customers.create({ name: '测试甲', class_name: '一班' });
        out.createWhenOff = c;
        const cid = c.ok ? c.data.id : null;
        out.adjustWhenOff = cid ? await api.tx.adjust(cid, 5, '免密调整', '') : 'no-customer';

        // 3) 设置页启用（启用后当场会获得 10 分钟授权，重新登录把授权清空再验拦截）
        out.setOp = await api.setOpPassword('op456');
        out.statusAfterEnable = (await api.status()).data.op_required;
        out.relogin = await api.login('管理员', 'pass123');

        // 4) 启用后：敏感接口要 NEED_OP，手动调整要当次密码
        out.createWhenOn = await api.customers.create({ name: '测试乙', class_name: '二班' });
        out.adjustNoPw = await api.tx.adjust(cid, 1, '没输密码', '');
        out.adjustWrongPw = await api.tx.adjust(cid, 1, '错密码', 'wrong');
        out.adjustWithPw = await api.tx.adjust(cid, 1, '正确密码', 'op456');

        // 5) 关闭：错密码被拒，正确密码关掉
        out.disableWrong = await api.disableOp('op4561');
        out.disableOk = await api.disableOp('op456');
        out.statusAfterDisable = (await api.status()).data.op_required;
        out.adjustAfterDisable = await api.tx.adjust(cid, 2, '关闭后调整', '');
      } catch (e) {
        out.fatal = e && e.message;
      }
      return out;
    })()
  `);

  const ok = (x) => !!(x && x.ok);
  const code = (x) => (x && x.code) || '';
  const err = (x) => (x && x.error) || '';

  say('fatal: ' + (r.fatal || 'none'));
  say('setup(仅登录密码) ok=' + ok(r.setup));
  say('op_required(初始化后)= ' + r.opRequiredAfterSetup);
  say('verifyOp 未启用被拒: ' + (!ok(r.verifyWhenOff)) + ' -> ' + err(r.verifyWhenOff));
  say('未启用时建顾客 ok=' + ok(r.createWhenOff));
  say('未启用时免密调整 ok=' + ok(r.adjustWhenOff));
  say('启用操作密码 ok=' + ok(r.setOp) + ' -> op_required=' + r.statusAfterEnable);
  say('重新登录 ok=' + ok(r.relogin));
  say('启用后建顾客 code=' + code(r.createWhenOn) + '（应为 NEED_OP）');
  say('启用后不输密码调整被拒: ' + (!ok(r.adjustNoPw)) + ' -> ' + err(r.adjustNoPw));
  say('启用后错密码被拒: ' + (!ok(r.adjustWrongPw)) + ' -> ' + err(r.adjustWrongPw));
  say('启用后正确密码调整 ok=' + ok(r.adjustWithPw));
  say('错误密码无法关闭: ' + (!ok(r.disableWrong)) + ' -> ' + err(r.disableWrong));
  say('正确密码关闭 ok=' + ok(r.disableOk) + ' -> op_required=' + r.statusAfterDisable);
  say('关闭后免密调整 ok=' + ok(r.adjustAfterDisable));

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  fs.writeFileSync(logFile, lines.join('\n') + '\n');

  const expect = [];
  expect.push(ok(r.setup));
  expect.push(r.opRequiredAfterSetup === false);
  expect.push(!ok(r.verifyWhenOff));
  expect.push(ok(r.createWhenOff));
  expect.push(ok(r.adjustWhenOff));
  expect.push(ok(r.setOp));
  expect.push(r.statusAfterEnable === true);
  expect.push(ok(r.relogin));
  expect.push(code(r.createWhenOn) === 'NEED_OP');
  expect.push(!ok(r.adjustNoPw));
  expect.push(!ok(r.adjustWrongPw));
  expect.push(ok(r.adjustWithPw));
  expect.push(!ok(r.disableWrong));
  expect.push(ok(r.disableOk));
  expect.push(r.statusAfterDisable === false);
  expect.push(ok(r.adjustAfterDisable));

  const pass = !r.fatal && expect.every(Boolean);
  fs.appendFileSync(logFile, 'RESULT ' + (pass ? 'ALL-PASS' : 'FAIL') + '\n');
  app.exit(pass ? 0 : 3);
});
