'use strict';
/* 端到端验证：多张背景图（add / remove / clear）与主题色（settings:save theme）真的走 IPC 落库落盘 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-multibg-' + Date.now());
app.setName('pm-multibg-test');
app.setPath('userData', TMP);

require(path.join(__dirname, '..', 'electron', 'main.js'));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const logFile = path.join(os.tmpdir(), 'pm-multibg-result.txt');
const lines = [];
const say = (s) => lines.push(String(s));
const flush = () => { try { fs.writeFileSync(logFile, lines.join('\n') + '\n', 'utf8'); } catch (e) { /* ignore */ } };

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
  win.webContents.on('preload-error', (e, p, err) => say('preload-error ' + p + ' :: ' + err.message));
  await win.loadFile(blank);
  await new Promise((r) => setTimeout(r, 300));

  const run = (code) => win.webContents.executeJavaScript(code);

  const out = await run(`
    (async () => {
      const res = {};
      const api = window.api;
      const setup = await api.setup('pass123', 'op456', '管理员');
      res.setup = setup.ok;
      const login = await api.login('管理员', 'pass123');
      res.login = login.ok;
      const op = await api.verifyOp('op456');
      res.elevated = op.ok;

      const a1 = await api.settings.addLoginBg(${JSON.stringify(PNG)});
      const a2 = await api.settings.addLoginBg(${JSON.stringify(PNG)});
      res.add1 = a1.ok ? a1.data.login_bgs.length : ('ERR:' + a1.error);
      res.add2 = a2.ok ? a2.data.login_bgs.length : ('ERR:' + a2.error);
      res.firstIsBg = a2.ok ? a2.data.login_bg.startsWith('file:///') : false;

      const cur = await api.settings.get();
      res.publicList = cur.ok ? cur.data.login_bgs.length : -1;
      res.publicFirst = cur.ok ? cur.data.login_bg === cur.data.login_bgs[0] : false;

      const st = await api.status();
      res.statusList = st.ok && Array.isArray(st.data.login_bgs) ? st.data.login_bgs.length : -1;

      const first = a2.ok ? a2.data.login_bgs[0] : '';
      const rm = await api.settings.removeLoginBg(first);
      res.afterRemove = rm.ok ? rm.data.login_bgs.length : ('ERR:' + rm.error);

      // 主题色：合法 + 非法
      const th = await api.settings.save({ theme: { accent: '#A33B2B' } });
      res.themeSave = th.ok;
      const bad = await api.settings.save({ theme: { accent: 'red' } });
      res.themeBadRejected = !bad.ok && String(bad.error).includes('格式');
      const g = await api.settings.get();
      res.themeNow = g.ok ? g.data.theme.accent : '';
      const st2 = await api.status();
      res.statusTheme = st2.ok ? st2.data.theme.accent : '';

      const cl = await api.settings.clearLoginBg();
      res.afterClear = cl.ok ? cl.data.login_bgs.length : ('ERR:' + cl.error);

      // 背景自动切换开关：默认关 -> 开 -> 关，且 settings.get / status 都要能看到
      const g0 = await api.settings.get();
      res.rotateDefault = g0.ok ? g0.data.login_bg_rotate : 'ERR';
      const on = await api.settings.save({ login_bg_rotate: true });
      res.rotateOn = on.ok ? on.data.login_bg_rotate : ('ERR:' + on.error);
      const g1 = await api.settings.get();
      res.rotatePersisted = g1.ok ? g1.data.login_bg_rotate : 'ERR';
      const st3 = await api.status();
      res.rotateStatus = st3.ok ? st3.data.login_bg_rotate : 'ERR';
      const off = await api.settings.save({ login_bg_rotate: false });
      res.rotateOff = off.ok ? off.data.login_bg_rotate : ('ERR:' + off.error);
      return JSON.stringify(res);
    })()
  `).catch((e) => 'ERR:' + e.message);

  let r = {};
  try { r = JSON.parse(out); } catch (e) { r = { raw: String(out) }; }
  say(JSON.stringify(r, null, 1));

  const bgDir = path.join(TMP, 'login-bg');
  const files = fs.existsSync(bgDir) ? fs.readdirSync(bgDir) : [];
  say('背景图目录文件数=' + files.length + ' ' + files.join(','));
  say('目录是否已清空=' + !fs.existsSync(bgDir));

  // 库里真正落盘的字段（直接读 sqlite 文件）
  const dbFile = path.join(TMP, 'data', 'points-data.db');
  say('db 文件存在=' + fs.existsSync(dbFile) + ' size=' + (fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0));

  const checks = {
    setup: r.setup === true,
    login: r.login === true,
    elevated: r.elevated === true,
    addFirst: r.add1 === 1,
    addSecond: r.add2 === 2,
    firstIsBgUrl: r.firstIsBg === true,
    publicHasList: r.publicList === 2 && r.publicFirst === true,
    statusHasList: r.statusList === 2,
    removeToOne: r.afterRemove === 1,
    themeSaved: r.themeSave === true,
    themeInvalidRejected: r.themeBadRejected === true,
    themePersisted: r.themeNow === '#A33B2B',
    statusHasTheme: r.statusTheme === '#A33B2B',
    clearAll: r.afterClear === 0,
    rotateDefaultOff: r.rotateDefault === false,
    rotateOnSaved: r.rotateOn === true,
    rotatePersisted: r.rotatePersisted === true,
    rotateInStatus: r.rotateStatus === true,
    rotateOffSaved: r.rotateOff === false,
    dirCleared: !fs.existsSync(bgDir),
    dbWritten: fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0,
  };
  Object.entries(checks).forEach(([k, v]) => say((v ? 'PASS ' : 'FAIL ') + k));
  say('RESULT ' + (Object.values(checks).every(Boolean) ? 'ALL-PASS' : 'HAS-FAIL'));
  flush();

  // 清理临时 userData 之后退出
  win.destroy();
  app.exit(Object.values(checks).every(Boolean) ? 0 : 3);
}).catch((e) => { say('ERROR ' + (e && e.stack ? e.stack : e)); flush(); app.exit(2); });
process.on('unhandledRejection', (e) => say('UNHANDLED ' + e));
