'use strict';
/* 操作密码“连续 5 分钟无操作即失效”回归：用 PM_OP_IDLE_MS=2000 把窗口压缩成 2 秒
   1. 初始化只设登录密码
   2. 启用操作密码 → 当场授权
   3. 授权内建顾客免密
   4. 空闲超过窗口 → NEED_OP
   5. 重新验证 → 恢复
   6. 持续上报活动 → 一直免密
   7. 再空闲 → 又失效
   8. 退出重登 → 授权清空
*/
process.env.PM_OP_IDLE_MS = '2000';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-idle-' + Date.now());
app.setName('pm-idle-test');
app.setPath('userData', TMP);

require(path.join(__dirname, '..', 'electron', 'main.js'));

const logFile = path.join(os.tmpdir(), 'pm-idle-result.txt');
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
  fs.writeFileSync(blank, '<html><body>x</body></html>');
  await win.loadFile(blank);
  await new Promise((r) => setTimeout(r, 300));

  const r = await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.api;
      const nap = (ms) => new Promise((res) => setTimeout(res, ms));
      const out = {};
      try {
        out.setup = await api.setup('login1234', '', 'admin');
        out.enable = await api.setOpPassword('op1234');
        out.statusOn = (await api.status()).data.op_required;
        out.createInWindow = await api.customers.create({ name: '甲', class_name: '一班' });

        await nap(2500);                       // 空闲 > 2 秒窗口
        out.createAfterIdle = await api.customers.create({ name: '乙', class_name: '一班' });

        out.verifyAgain = await api.verifyOp('op1234');
        out.createAfterVerify = await api.customers.create({ name: '丙', class_name: '二班' });

        await nap(1400);
        out.ping1 = await api.activity();
        await nap(1400);                       // 累计 2.8 秒，但中间有活动
        out.ping2 = await api.activity();
        out.createWithActivity = await api.customers.create({ name: '丁', class_name: '三班' });

        await nap(2500);
        out.createAfterIdle2 = await api.customers.create({ name: '戊', class_name: '三班' });

        await api.logout();
        out.relogin = await api.login('admin', 'login1234');
        out.createAfterRelogin = await api.customers.create({ name: '己', class_name: '四班' });
      } catch (e) {
        out.fatal = e && e.message;
      }
      return out;
    })()
  `);

  const ok = (x) => !!(x && x.ok);
  const code = (x) => (x && x.code) || '';
  const data = (x) => (x && x.data) || {};

  say('fatal: ' + (r.fatal || 'none'));
  say('setup ok=' + ok(r.setup));
  say('enable ok=' + ok(r.enable) + ' op_verified=' + data(r.enable).op_verified);
  say('op_required=' + r.statusOn);
  say('授权内建顾客 ok=' + ok(r.createInWindow));
  say('空闲后建顾客 code=' + code(r.createAfterIdle) + ' -> ' + ((r.createAfterIdle || {}).error || ''));
  say('重新验证 ok=' + ok(r.verifyAgain));
  say('重验证后建顾客 ok=' + ok(r.createAfterVerify));
  say('ping1 verified=' + data(r.ping1).op_verified + ' exp=' + data(r.ping1).expires_at);
  say('ping2 verified=' + data(r.ping2).op_verified + ' exp=' + data(r.ping2).expires_at);
  say('有活动时建顾客 ok=' + ok(r.createWithActivity));
  say('再次空闲后 code=' + code(r.createAfterIdle2) + ' -> ' + ((r.createAfterIdle2 || {}).error || ''));
  say('重登 ok=' + ok(r.relogin));
  say('重登后建顾客 code=' + code(r.createAfterRelogin) + ' -> ' + ((r.createAfterRelogin || {}).error || ''));

  const expect = [
    ok(r.setup),
    ok(r.enable) && data(r.enable).op_verified === true,
    r.statusOn === true,
    ok(r.createInWindow),
    code(r.createAfterIdle) === 'NEED_OP',
    ok(r.verifyAgain),
    ok(r.createAfterVerify),
    data(r.ping1).op_verified === true,
    data(r.ping2).op_verified === true,
    ok(r.createWithActivity),
    code(r.createAfterIdle2) === 'NEED_OP',
    ok(r.relogin),
    code(r.createAfterRelogin) === 'NEED_OP',
  ];
  const pass = !r.fatal && expect.every(Boolean);
  resultsLog();

  function resultsLog() {
    // 逐条打结果，方便定位
    say((expect[0] ? 'PASS' : 'FAIL') + ' 初始化仅登录密码');
    say((expect[1] ? 'PASS' : 'FAIL') + ' 启用后立即授权');
    say((expect[2] ? 'PASS' : 'FAIL') + ' op_required=true');
    say((expect[3] ? 'PASS' : 'FAIL') + ' 授权内免密建顾客');
    say((expect[4] ? 'PASS' : 'FAIL') + ' 空闲超时要求重输');
    say((expect[5] ? 'PASS' : 'FAIL') + ' 重新验证成功');
    say((expect[6] ? 'PASS' : 'FAIL') + ' 重验证后继续操作');
    say((expect[7] ? 'PASS' : 'FAIL') + ' 活动上报续期(1)');
    say((expect[8] ? 'PASS' : 'FAIL') + ' 活动上报续期(2)');
    say((expect[9] ? 'PASS' : 'FAIL') + ' 有操作时始终免密');
    say((expect[10] ? 'PASS' : 'FAIL') + ' 再次空闲后失效');
    say((expect[11] ? 'PASS' : 'FAIL') + ' 重新登录成功');
    say((expect[12] ? 'PASS' : 'FAIL') + ' 重登后需再验证一次');
  }

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  fs.writeFileSync(logFile, lines.join('\n') + '\n' + (pass ? 'RESULT ALL-PASS' : 'RESULT HAS-FAIL') + '\n');
  app.exit(pass ? 0 : 1);
}).catch((e) => { fs.writeFileSync(logFile, 'ERR ' + (e && e.stack)); app.exit(2); });
