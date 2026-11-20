'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('./db');
const importer = require('./importer');
const cloud = require('./cloud');

let win = null;
let dataDir = '';
const sessions = new Set();
let elevatedUntil = 0;
const ELEVATION_MS = 10 * 60 * 1000;

/* ---------------- IPC 包装 ---------------- */

function handle(channel, fn, opt = {}) {
  ipcMain.handle(channel, async (_evt, payload) => {
    try {
      const p = payload || {};
      if (!opt.public) {
        if (!p.__token || !sessions.has(p.__token)) {
          return { ok: false, error: '未登录或会话已失效，请重新登录', code: 'UNAUTH' };
        }
      }
      // 未启用操作密码（二级密码）时，敏感操作不再要求 10 分钟授权
      if (opt.elevated && db.isOpRequired() && Date.now() > elevatedUntil) {
        return { ok: false, error: '操作密码授权已过期，请重新验证', code: 'NEED_OP' };
      }
      const data = await fn(p);
      if (opt.syncOnWrite) kickSync();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err && err.message) ? err.message : String(err) };
    }
  });
}

function newToken() {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.add(t);
  return t;
}

/* ---------------- 窗口 ---------------- */

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    // 无边框 + 透明：窗口四角由界面自己画连续曲率圆角（Win10 也能圆），
    // 代价是标题栏/最小化按钮要自绘，见 renderer 的 <WinChrome />
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: true,
    thickFrame: true, // 保留 WS_THICKFRAME：无边框窗口仍然可以用鼠标拖边缘缩放
    title: '积分客户管理系统',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      if (!app.isPackaged) win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });

  win.on('closed', () => { win = null; });

  // 最大化/还原时告诉界面：最大化要撤掉圆角，否则四角会露出桌面
  const pushWinState = () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('win:state-changed', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
  };
  win.on('maximize', pushWinState);
  win.on('unmaximize', pushWinState);
  win.on('enter-full-screen', pushWinState);
  win.on('leave-full-screen', pushWinState);
}

/* ---------------- 主流程 ---------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    dataDir = path.join(app.getPath('userData'), 'data');
    await db.open(dataDir);
    createWindow();
    startAutoSync();

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('window-all-closed', () => {
  try { db.persist(); } catch (e) { /* ignore */ }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { try { db.persist(); } catch (e) { /* ignore */ } });

/* ---------------- 自动同步 ---------------- */

let syncTimer = null;

/** 写操作后 3 秒内把增量推上去，接近实时；失败留在队列由轮询重试 */
function kickSync() {
  try {
    const cfg = db.getSettingsPublic().cloud_config;
    if (!cfg || !cfg.enabled) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        await cloud.syncNow({ limit: 100 });
        if (win && !win.isDestroyed()) win.webContents.send('cloud:synced', { at: new Date().toISOString() });
      } catch (e) { /* 留在队列，下一次重试 */ }
    }, 3000);
  } catch (e) { /* ignore */ }
}

function startAutoSync() {
  setInterval(async () => {
    try {
      const cfg = db.getSettingsPublic().cloud_config;
      if (!cfg || !cfg.enabled) return;
      if (db.queueCount() === 0) return;
      await cloud.syncNow({ limit: 200 });
      if (win && !win.isDestroyed()) win.webContents.send('cloud:synced', { at: new Date().toISOString() });
    } catch (e) {
      if (win && !win.isDestroyed()) win.webContents.send('cloud:error', { message: e.message });
    }
  }, 30000);
}

/* ---------------- 认证 ---------------- */

handle('auth:status', async () => ({
  hasPassword: db.hasPassword(),
  username: db.getLoginUsername(),
  shop_name: db.getSettingsPublic().shop_name,
  login_bg: db.getLoginBg(),
  login_bgs: db.getLoginBgList(),
  login_bg_rotate: db.getLoginBgRotate(),
  ui_mode: db.getUiMode(),
  theme: db.getTheme(),
  terms_accepted: db.getTermsAccepted(),
  op_required: db.isOpRequired(),
  version: app.getVersion(),
}), { public: true });

// 首次使用同意《使用声明》：登录前就要能调用，故为公开接口
handle('auth:accept-terms', async (p) => {
  const v = db.setTermsAccepted(p && p.when);
  return { terms_accepted: v };
}, { public: true, syncOnWrite: true });

handle('auth:setup', async (p) => {
  if (db.hasPassword()) throw new Error('系统已完成初始化');
  db.setupPasswords(p.loginPw, p.opPw, p.username);
  return { token: newToken() };
}, { public: true });

handle('auth:login', async (p) => {
  if (!db.hasPassword()) throw new Error('系统尚未初始化');
  if (!String(p.username || '').trim()) throw new Error('请输入用户名');
  if (!db.verifyLogin(p.username, p.password)) throw new Error('用户名或密码错误');
  elevatedUntil = 0;
  return { token: newToken() };
}, { public: true });

handle('auth:set-username', async (p) => db.setLoginUsername(p.username), { elevated: true, syncOnWrite: true });

handle('auth:verify-op', async (p) => {
  if (!db.isOpRequired()) throw new Error('未启用操作密码，无需验证');
  if (!db.verifyOp(p.password)) throw new Error('操作密码错误');
  elevatedUntil = Date.now() + ELEVATION_MS;
  return { elevatedUntil, elevationMs: ELEVATION_MS };
});

// 设置页启用操作密码（二级密码）：直接设一个新密码并立刻开启
handle('auth:set-op-password', async (p) => {
  const pw = String(p.password || '');
  if (!pw.trim()) throw new Error('请输入操作密码');
  db.setOpPassword(pw);
  elevatedUntil = Date.now() + ELEVATION_MS;
  return { op_required: true, elevatedUntil, elevationMs: ELEVATION_MS };
}, { syncOnWrite: true });

// 设置页关闭操作密码：必须输入当前操作密码确认，关闭后敏感操作不再二次验证
handle('auth:disable-op', async (p) => {
  if (!db.isOpRequired()) return { op_required: false };
  if (!String(p.password || '').trim()) throw new Error('请输入当前操作密码');
  if (!db.verifyOp(p.password)) throw new Error('操作密码错误');
  db.clearOpPassword();
  elevatedUntil = 0;
  return { op_required: false };
}, { syncOnWrite: true });

handle('auth:change-password', async (p) => {
  const kind = p.kind === 'op' ? 'op' : 'login';
  const oldPw = String(p.oldPassword || '');
  const newPw = String(p.newPassword || '');
  if (!newPw) throw new Error('请输入新密码');
  if (newPw.length < 4) throw new Error('新密码至少 4 位');
  if (!oldPw) throw new Error(kind === 'op' ? '请输入当前操作密码' : '请输入当前登录密码');
  // 校验的是“原密码”，按修改的类型分别验：登录密码带上用户名（verifyLogin 是两参数）
  if (kind === 'op') {
    if (!db.isOpRequired()) throw new Error('当前未启用操作密码，请先启用');
    if (!db.verifyOp(oldPw)) throw new Error('当前操作密码错误');
  } else if (!db.verifyLogin(db.getLoginUsername(), oldPw)) {
    throw new Error('当前登录密码错误');
  }
  db.changePassword(kind, newPw);
  if (kind === 'op') elevatedUntil = 0; // 改了操作密码，之前的授权立即失效
  return { kind };
}, { syncOnWrite: true });

handle('auth:logout', async (p) => {
  sessions.delete(p.__token);
  elevatedUntil = 0;
  return true;
}, { public: true });

/* ---------------- 顾客 ---------------- */

handle('customers:list', async (p) => db.listCustomers(p.filters || {}));
handle('customers:get', async (p) => db.getCustomer(p.id));
handle('customers:create', async (p) => db.createCustomer(p.data || {}), { elevated: true, syncOnWrite: true });
handle('customers:update', async (p) => db.updateCustomer(p.id, p.data || {}), { elevated: true, syncOnWrite: true });
handle('customers:delete', async (p) => db.deleteCustomer(p.id), { elevated: true, syncOnWrite: true });
handle('customers:classes', async () => db.listClasses());

/* ---------------- 交易 ---------------- */

handle('tx:list', async (p) => db.listTransactions(p.filters || {}));
handle('tx:consume', async (p) => db.createConsume({ ...p, operator: db.getSettingsPublic().operator_name }), { elevated: true, syncOnWrite: true });
// 消费余额：只扣余额、不加积分
handle('tx:spend', async (p) => db.createBalanceSpend({ customer_id: p.customer_id, amount_cents: p.amount_cents, note: p.note, operator: db.getSettingsPublic().operator_name }), { elevated: true, syncOnWrite: true });
handle('tx:redeem', async (p) => db.redeemPoints({ ...p, operator: db.getSettingsPublic().operator_name }), { elevated: true, syncOnWrite: true });
// 手动调整：启用操作密码时，每次都必须当次输入操作密码；未启用时直接放行。且**不允许改余额**
handle('tx:adjust', async (p) => {
  if (db.isOpRequired()) {
    if (!String(p.op_password || '').trim()) throw new Error('请输入操作密码');
    if (!db.verifyOp(p.op_password)) throw new Error('操作密码错误');
  }
  if (Number(p.balance_delta_cents || 0) !== 0) throw new Error('余额不支持手动修改，请使用「消费余额」或「积分兑换」');
  return db.adjustCustomer({
    customer_id: p.customer_id,
    points_delta: p.points_delta,
    balance_delta_cents: 0,
    note: p.note,
    operator: db.getSettingsPublic().operator_name,
  });
}, { syncOnWrite: true });
handle('tx:preview-points', async (p) => db.pointsForAmount(p.amountCents));

/* ---------------- 统计 ---------------- */

handle('stats:overview', async () => db.overview());

/* ---------------- 设置 ---------------- */

handle('settings:get', async () => db.getSettingsPublic());
handle('settings:save', async (p) => db.setSettings(p.patch || {}), { elevated: true, syncOnWrite: true });

// 界面模式（标准版 / 简洁版）：纯显示偏好，不算敏感操作，只要求已登录、不要操作密码
handle('settings:set-ui-mode', async (p) => ({ ui_mode: db.setUiMode(p && p.mode) }), { syncOnWrite: true });

/* 登录页背景图（可多张）：图片本体写进 userData\login-bg\，库里只存 file:// 数组（避免大图撑爆数据库） */
const BG_DIR = () => path.join(app.getPath('userData'), 'login-bg');
const BG_MAX = 50 * 1024 * 1024;

function bgDirEnsure() {
  const dir = BG_DIR();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 把 data:image base64 落成磁盘文件，返回 file:/// 地址
function bgWriteDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('只支持图片文件（png / jpg / webp）');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw new Error('图片内容为空');
  if (buf.length > BG_MAX) throw new Error('图片太大，请压缩到 50MB 以内');
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const dir = bgDirEnsure();
  const stamp = Date.now();
  const rnd = Math.random().toString(36).slice(2, 6);
  const file = path.join(dir, `bg-${stamp}-${rnd}.${ext}`);
  fs.writeFileSync(file, buf);
  return { url: require('url').pathToFileURL(file).href, bytes: buf.length, file };
}

// 从 file:/// 地址反推磁盘路径，且必须落在 login-bg 目录内（防止误删别处文件）
function bgFileOf(url) {
  if (!String(url).startsWith('file:///')) return '';
  let p = '';
  try { p = require('url').fileURLToPath(url); } catch (e) { return ''; }
  const dir = path.resolve(BG_DIR());
  const abs = path.resolve(p);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) return '';
  return abs;
}

handle('settings:add-login-bg', async (p) => {
  const written = bgWriteDataUrl(p.dataUrl);
  const list = db.setLoginBgList([...db.getLoginBgList(), written.url]);
  return { login_bgs: list, login_bg: list[0] || '', added: written.url, bytes: written.bytes };
}, { elevated: true, syncOnWrite: true });

handle('settings:remove-login-bg', async (p) => {
  const url = String(p.url || '');
  const file = bgFileOf(url);
  if (file) { try { fs.rmSync(file, { force: true }); } catch (e) { /* ignore */ } }
  const list = db.setLoginBgList(db.getLoginBgList().filter((u) => u !== url));
  return { login_bgs: list, login_bg: list[0] || '' };
}, { elevated: true, syncOnWrite: true });

handle('settings:clear-login-bg', async () => {
  // 注意：磁盘文件删掉后必须同时把库里的列表清空，否则下次启动会读到一堆指向已删文件的地址
  try { fs.rmSync(BG_DIR(), { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const list = db.setLoginBgList([]);
  return { login_bgs: list, login_bg: '' };
}, { elevated: true, syncOnWrite: true });

// 兼容旧接口：一次只给一张，等于"清空后只留这一张"
handle('settings:set-login-bg', async (p) => {
  const dataUrl = String(p.dataUrl || '');
  const dir = BG_DIR();
  if (!dataUrl) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    const list = db.setLoginBgList([]);
    return { login_bg: '', login_bgs: list };
  }
  const written = bgWriteDataUrl(dataUrl);
  for (const f of fs.readdirSync(path.dirname(written.file))) {
    const abs = path.join(path.dirname(written.file), f);
    if (abs !== written.file) { try { fs.rmSync(abs, { force: true }); } catch (e) { /* ignore */ } }
  }
  const list = db.setLoginBgList([written.url]);
  return { login_bg: list[0] || '', login_bgs: list, bytes: written.bytes };
}, { elevated: true, syncOnWrite: true });
handle('settings:clear-data', async () => db.clearAll(), { elevated: true, syncOnWrite: true });

/* ---------------- 导入导出 ---------------- */

function defaultDir() {
  return path.join(app.getPath('documents'), '积分系统导出');
}

handle('io:import-customers', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择顾客名单文件',
    properties: ['openFile'],
    filters: [{ name: '表格文件', extensions: ['xlsx', 'xls', 'csv'] }],
  });
  if (res.canceled || !res.filePaths[0]) return { canceled: true };
  const result = importer.importCustomers(res.filePaths[0]);
  return { ...result, file: res.filePaths[0] };
}, { elevated: true, syncOnWrite: true });

handle('io:import-transactions', async (p) => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择消费记录文件',
    properties: ['openFile'],
    filters: [{ name: '表格文件', extensions: ['xlsx', 'xls', 'csv'] }],
  });
  if (res.canceled || !res.filePaths[0]) return { canceled: true };
  const result = importer.importTransactions(res.filePaths[0], {
    autoCreate: !!p.autoCreate,
    operator: db.getSettingsPublic().operator_name,
  });
  return { ...result, file: res.filePaths[0] };
}, { elevated: true, syncOnWrite: true });

handle('io:export', async (p) => {
  const kind = p.kind || 'customers';
  const prefix = kind === 'customers' ? '顾客名单' : '消费记录';
  const stamp = db.fmtDate(new Date()).replace(/-/g, '');
  fs.mkdirSync(defaultDir(), { recursive: true });
  const res = await dialog.showSaveDialog(win, {
    title: `导出${prefix}`,
    defaultPath: path.join(defaultDir(), `${prefix}_${stamp}.xlsx`),
    filters: [
      { name: 'Excel 工作簿', extensions: ['xlsx'] },
      { name: 'CSV 文件', extensions: ['csv'] },
    ],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  const out = kind === 'customers'
    ? importer.exportCustomers(res.filePath, p.filters || {})
    : importer.exportTransactions(res.filePath, p.filters || {});
  return out;
}, { elevated: true, syncOnWrite: true });

handle('io:template', async (p) => {
  fs.mkdirSync(defaultDir(), { recursive: true });
  const kind = p.kind || 'customers';
  const name = kind === 'customers' ? '导入模板_顾客名单.xlsx' : '导入模板_消费记录.xlsx';
  const res = await dialog.showSaveDialog(win, {
    title: '保存导入模板',
    defaultPath: path.join(defaultDir(), name),
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }, { name: 'CSV 文件', extensions: ['csv'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  return importer.exportTemplate(res.filePath, kind);
});

/* ---------------- 云端同步 ---------------- */

handle('cloud:sync', async () => cloud.syncNow({ limit: 200 }), { elevated: true, syncOnWrite: true });
handle('cloud:status', async () => ({
  pending: db.queueCount(),
  config: db.getSettingsPublic().cloud_config,
}));
handle('cloud:test', async (p) => cloud.testConnection(p.config));

/* ---------------- 备份 / 恢复 ---------------- */

handle('app:info', async () => ({
  dataDir,
  dbPath: db.dbPath(),
  version: app.getVersion(),
  packaged: app.isPackaged,
}));

handle('app:open-data-dir', async () => {
  const p = await shell.openPath(dataDir);
  if (p) throw new Error(p);
  return true;
});

handle('app:backup', async () => {
  const stamp = db.fmtDateTime(new Date()).replace(/[-: ]/g, '').slice(0, 14);
  fs.mkdirSync(defaultDir(), { recursive: true });
  const res = await dialog.showSaveDialog(win, {
    title: '备份数据库',
    defaultPath: path.join(defaultDir(), `积分数据备份_${stamp}.db`),
    filters: [{ name: '数据库文件', extensions: ['db'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  db.backupTo(res.filePath);
  return { file: res.filePath };
}, { elevated: true, syncOnWrite: true });

handle('app:restore', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: '恢复数据库（会覆盖当前数据）',
    properties: ['openFile'],
    filters: [{ name: '数据库文件', extensions: ['db'] }],
  });
  if (res.canceled || !res.filePaths[0]) return { canceled: true };
  db.rawImport(fs.readFileSync(res.filePaths[0]));
  return { file: res.filePaths[0] };
}, { elevated: true, syncOnWrite: true });

/* ---------------- 窗口控制 ---------------- */

// 这几个必须 public：登录页还没有 token，但用户一样要能最小化/关闭窗口
handle('win:minimize', async () => { if (win) win.minimize(); return true; }, { public: true });
handle('win:maximize', async () => {
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
  return win.isMaximized();
}, { public: true });
handle('win:state', async () => ({ maximized: !!(win && win.isMaximized()), fullscreen: !!(win && win.isFullScreen()) }), { public: true });
handle('win:close', async () => { if (win) win.close(); return true; }, { public: true });

process.on('uncaughtException', (e) => {
  console.error('[uncaught]', e);
});
