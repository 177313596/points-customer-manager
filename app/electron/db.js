'use strict';

/**
 * 数据层：嵌入式 SQLite（sql.js / WASM 构建，无原生依赖）
 * 数据文件为标准 SQLite 格式，可用任意 SQLite 工具直接打开、备份、导入。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

let SQL = null;
let db = null;
let dbFile = null;
let dataDirRef = null;

const DEFAULT_SETTINGS = {
  shop_name: '积分客户管理系统',
  operator_name: '管理员',
  // 每满 per_amount_cents 分（1000分=10元）积 points_per_unit 分
  points_rule: JSON.stringify({ per_amount_cents: 1000, points_per_unit: 1 }),
  // 每 redeem.points 分兑换 redeem.balance_cents 分余额（15分→10元）
  redeem_rule: JSON.stringify({ points: 15, balance_cents: 1000 }),
  cloud_config: JSON.stringify({
    enabled: false,
    provider: 'generic',
    endpoint: '',
    token: '',
    appId: '',
    appSecret: '',
    appToken: '',
    tableId: '',
    intervalSec: 60,
    lastSyncAt: '',
    lastError: '',
  }),
  login_username: 'admin',
  login_hash: '',
  op_hash: '',
  // 首次使用须同意《使用声明》，存同意时间（ISO 串），空 = 尚未同意
  terms_accepted: '',
  // 个性化配色：主色 accent
  theme: JSON.stringify({ accent: '#0F766E' }),
  // 登录页背景图（可多张，轮流切换）：图片本体在 userData\login-bg\，这里存 file:/// 数组
  login_bg_list: '[]',
  // 背景图自动切换（每 8 秒一张）：默认关闭，只显示第一张
  login_bg_rotate: 'false',
  // 界面模式：standard（标准版，含背景图与高斯模糊过渡）/ lite（简洁版，关掉动画与背景图，更快）
  ui_mode: 'standard',
};

/* ---------------- 工具 ---------------- */

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmtDateTime(d) {
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ` +
         `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
}

function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function toInt(v, def = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/* ---------------- 初始化 ---------------- */

async function open(dataDir) {
  if (db) return;
  dataDirRef = dataDir;
  fs.mkdirSync(dataDir, { recursive: true });

  SQL = await initSqlJs({
    locateFile: (f) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f),
  });

  dbFile = path.join(dataDir, 'points-data.db');
  if (fs.existsSync(dbFile)) {
    const buf = fs.readFileSync(dbFile);
    db = new SQL.Database(new Uint8Array(buf));
    backupIfNeeded();
  } else {
    db = new SQL.Database();
  }
  migrate();
  persist();
}

function migrate() {
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      note TEXT DEFAULT '',
      points INTEGER NOT NULL DEFAULT 0,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      total_spent_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cust_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_cust_class ON customers(class_name);

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      class_name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      points_delta INTEGER NOT NULL DEFAULT 0,
      balance_delta_cents INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      operator TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_cust ON transactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_tx_time ON transactions(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      tries INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT ''
    );
  `);

  const existing = all('SELECT key FROM settings');
  const keys = new Set(existing.map((r) => r.key));
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!keys.has(k)) run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }
}

function backupIfNeeded() {
  try {
    const dir = path.join(dataDirRef, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const name = `points-data-${fmtDate(new Date())}.db`;
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(dbFile, target);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
      while (files.length > 8) {
        fs.unlinkSync(path.join(dir, files.shift()));
      }
    }
  } catch (e) {
    /* 备份失败不影响主流程 */
  }
}

/* ---------------- 基础读写 ---------------- */

function persist() {
  if (!db || !dbFile) return;
  const data = db.export();
  const tmp = dbFile + '.tmp';
  fs.writeFileSync(tmp, Buffer.from(data));
  fs.renameSync(tmp, dbFile);
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function one(sql, params = []) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : null;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    stmt.step();
  } finally {
    stmt.free();
  }
}

function lastId() {
  const r = one('SELECT last_insert_rowid() AS id');
  return r ? Number(r.id) : null;
}

/* ---------------- 设置 ---------------- */

function getRawSetting(key, def = '') {
  const r = one('SELECT value FROM settings WHERE key = ?', [key]);
  return r ? r.value : def;
}

function getSetting(key, def = '') {
  const raw = getRawSetting(key, '');
  if (!raw) return def;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

function setSetting(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, v]);
  persist();
}

function getSettingsPublic() {
  return {
    shop_name: getRawSetting('shop_name', DEFAULT_SETTINGS.shop_name),
    operator_name: getRawSetting('operator_name', DEFAULT_SETTINGS.operator_name),
    points_rule: getSetting('points_rule', { per_amount_cents: 1000, points_per_unit: 1 }),
    redeem_rule: getSetting('redeem_rule', { points: 15, balance_cents: 1000 }),
    cloud_config: getSetting('cloud_config', JSON.parse(DEFAULT_SETTINGS.cloud_config)),
    login_username: getLoginUsername(),
    login_bg: getLoginBg(),
    login_bgs: getLoginBgList(),
    login_bg_rotate: getLoginBgRotate(),
    ui_mode: getUiMode(),
    theme: getTheme(),
  };
}

/* ---------------- 个性化配色 ---------------- */

const DEFAULT_ACCENT = '#0F766E';
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function getTheme() {
  const t = getSetting('theme', { accent: DEFAULT_ACCENT });
  const accent = t && typeof t.accent === 'string' && HEX_RE.test(t.accent) ? t.accent.toUpperCase() : DEFAULT_ACCENT;
  return { accent };
}

function setTheme(patch) {
  const cur = getTheme();
  const accent = String((patch && patch.accent) || cur.accent).trim();
  if (!HEX_RE.test(accent)) throw new Error('颜色格式应为 #RRGGBB');
  const v = { accent: accent.toUpperCase() };
  setSetting('theme', v);
  return v;
}

/* ---------------- 登录页背景图 ---------------- */

// 图片本体存放在 userData\login-bg\（由主进程写入），库里只存一个 file:// 指向；
// 老版本遗留的 data: URL 仍然兼容。
const LOGIN_BG_MAX = 50 * 1024 * 1024; // 50MB

function isBgUrl(v) {
  return typeof v === 'string' && (v.startsWith('data:image/') || v.startsWith('file:///'));
}

function getLoginBgList() {
  const raw = getSetting('login_bg_list', []);
  const list = Array.isArray(raw) ? raw.filter(isBgUrl) : [];
  if (list.length) return list;
  const single = getRawSetting('login_bg', '');
  return isBgUrl(single) ? [single] : [];
}

function setLoginBgList(list) {
  const arr = (Array.isArray(list) ? list : []).filter(isBgUrl);
  for (const v of arr) {
    if (v.startsWith('data:') && v.length > LOGIN_BG_MAX) throw new Error('图片太大，请压缩到 50MB 以内');
  }
  setSetting('login_bg_list', arr);
  setSetting('login_bg', arr[0] || ''); // 兼容老字段/老界面
  return arr;
}

function getLoginBg() {
  const list = getLoginBgList();
  return list[0] || '';
}

// 背景图自动切换开关：默认关闭（老库没有这个键时也按关闭处理）
function getLoginBgRotate() {
  return String(getRawSetting('login_bg_rotate', DEFAULT_SETTINGS.login_bg_rotate)) === 'true';
}

function setLoginBgRotate(on) {
  setSetting('login_bg_rotate', on ? 'true' : 'false');
  return !!on;
}

/* ---------------- 界面模式 ---------------- */
// standard：标准版（背景图 + 高斯模糊过渡都开）
// lite：简洁版（不加载背景图、全局关动画与模糊，旧机器/低配更顺）
const UI_MODES = ['standard', 'lite'];

function getUiMode() {
  const v = String(getRawSetting('ui_mode', DEFAULT_SETTINGS.ui_mode) || '').trim();
  return UI_MODES.includes(v) ? v : 'standard';
}

function setUiMode(mode) {
  const v = String(mode || '').trim();
  if (!UI_MODES.includes(v)) throw new Error('界面模式只能是 standard 或 lite');
  setSetting('ui_mode', v);
  return v;
}

function setLoginBg(value) {
  const v = String(value || '').trim();
  if (!v) { setLoginBgList([]); return ''; }
  if (!isBgUrl(v)) throw new Error('只支持图片文件（png / jpg / webp）');
  setLoginBgList([v]);
  return v;
}

function setSettings(patch) {
  if (patch.shop_name !== undefined) setSetting('shop_name', String(patch.shop_name).trim() || DEFAULT_SETTINGS.shop_name);
  if (patch.theme) setTheme(patch.theme);
  if (patch.login_bg_rotate !== undefined) setLoginBgRotate(!!patch.login_bg_rotate);
  if (patch.ui_mode !== undefined) setUiMode(patch.ui_mode);
  if (patch.operator_name !== undefined) setSetting('operator_name', String(patch.operator_name).trim() || DEFAULT_SETTINGS.operator_name);
  if (patch.points_rule) {
    const r = patch.points_rule;
    setSetting('points_rule', {
      per_amount_cents: Math.max(1, toInt(r.per_amount_cents, 1000)),
      points_per_unit: Math.max(1, toInt(r.points_per_unit, 1)),
    });
  }
  if (patch.redeem_rule) {
    const r = patch.redeem_rule;
    setSetting('redeem_rule', {
      points: Math.max(1, toInt(r.points, 15)),
      balance_cents: Math.max(1, toInt(r.balance_cents, 1000)),
    });
  }
  if (patch.cloud_config) {
    const old = getSetting('cloud_config', {});
    setSetting('cloud_config', { ...old, ...patch.cloud_config });
  }
  return getSettingsPublic();
}

/* ---------------- 密码 ---------------- */

function makeHash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function checkHash(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
  } catch (e) { return false; }
}

function hasPassword() {
  return !!getRawSetting('login_hash', '');
}

function getTermsAccepted() {
  return String(getRawSetting('terms_accepted', '') || '');
}

function setTermsAccepted(when) {
  const v = String(when || '').trim() || fmtDateTime(new Date());
  setSetting('terms_accepted', v);
  return v;
}

function getLoginUsername() {
  return String(getRawSetting('login_username', DEFAULT_SETTINGS.login_username) || 'admin');
}

function setLoginUsername(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('用户名不能为空');
  if (n.length > 20) throw new Error('用户名最多 20 个字符');
  setSetting('login_username', n);
  return n;
}

function setupPasswords(loginPw, opPw, username) {
  if (!loginPw || String(loginPw).length < 4) throw new Error('登录密码至少 4 位');
  if (!opPw || String(opPw).length < 4) throw new Error('操作密码至少 4 位');
  if (String(loginPw) === String(opPw)) throw new Error('登录密码与操作密码不能相同');
  setLoginUsername(username);
  setSetting('login_hash', makeHash(loginPw));
  setSetting('op_hash', makeHash(opPw));
  return true;
}

// 用户名大小写不敏感；密码错误与用户名错误返回同一结果，不提示是哪一项错
function verifyLogin(username, pw) {
  const name = String(username || '').trim();
  if (!name) return false;
  if (name.toLowerCase() !== getLoginUsername().trim().toLowerCase()) return false;
  return checkHash(pw, getRawSetting('login_hash', ''));
}
function verifyOp(pw) { return checkHash(pw, getRawSetting('op_hash', '')); }

function changePassword(kind, newPw) {
  if (!newPw || String(newPw).length < 4) throw new Error('密码至少 4 位');
  if (kind === 'login') setSetting('login_hash', makeHash(newPw));
  else if (kind === 'op') setSetting('op_hash', makeHash(newPw));
  else throw new Error('未知的密码类型');
  return true;
}

/* ---------------- 规则计算 ---------------- */

function pointsForAmount(amountCents) {
  const rule = getSetting('points_rule', { per_amount_cents: 1000, points_per_unit: 1 });
  const amt = Math.max(0, toInt(amountCents, 0));
  const unit = Math.max(1, toInt(rule.per_amount_cents, 1000));
  const per = Math.max(1, toInt(rule.points_per_unit, 1));
  return Math.floor(amt / unit) * per;
}

function getRedeemRule() {
  const rule = getSetting('redeem_rule', { points: 15, balance_cents: 1000 });
  return {
    points: Math.max(1, toInt(rule.points, 15)),
    balance_cents: Math.max(1, toInt(rule.balance_cents, 1000)),
  };
}

/* ---------------- 顾客 ---------------- */

function normalizeCustomerInput(data) {
  return {
    name: String(data.name || '').trim(),
    class_name: String(data.class_name || '').trim(),
    phone: String(data.phone || '').trim(),
    note: String(data.note || '').trim(),
  };
}

function listCustomers(params = {}) {
  const q = String(params.q || '').trim();
  const className = String(params.class_name || '').trim();
  const sort = params.sort || 'created_desc';
  const page = Math.max(1, toInt(params.page, 1));
  const pageSize = Math.min(2000, Math.max(1, toInt(params.page_size, 20)));

  const where = [];
  const args = [];
  if (q) {
    where.push('(name LIKE ? OR class_name LIKE ? OR phone LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (className) { where.push('class_name = ?'); args.push(className); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const sortMap = {
    created_desc: 'id DESC',
    created_asc: 'id ASC',
    name_asc: 'name ASC, id ASC',
    points_desc: 'points DESC, id ASC',
    points_asc: 'points ASC, id ASC',
    balance_desc: 'balance_cents DESC, id ASC',
    spent_desc: 'total_spent_cents DESC, id ASC',
  };
  const orderSql = sortMap[sort] || sortMap.created_desc;

  const total = Number((one(`SELECT COUNT(*) AS c FROM customers ${whereSql}`, args) || {}).c || 0);
  const rows = all(
    `SELECT * FROM customers ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );
  return { total, page, page_size: pageSize, rows };
}

function getCustomer(id) {
  return one('SELECT * FROM customers WHERE id = ?', [toInt(id, -1)]);
}

/* 导入时用的轻量索引：一次取出 姓名/班级/id，避免每行都跑一遍带 COUNT+排序的分页查询 */
function customerIndex() {
  return all('SELECT id, name, class_name FROM customers')
    .map((r) => ({ id: Number(r.id), name: String(r.name || ''), class_name: String(r.class_name || '') }));
}

function findCustomerExact(name, className) {
  const n = String(name || '').trim();
  if (!n) return null;
  const cls = String(className || '').trim();
  const row = cls
    ? one('SELECT id FROM customers WHERE name = ? AND class_name = ?', [n, cls])
    : one('SELECT id FROM customers WHERE name = ?', [n]);
  return row ? getCustomer(Number(row.id)) : null;
}

function createCustomer(data) {
  const c = normalizeCustomerInput(data);
  if (!c.name) throw new Error('顾客姓名不能为空');
  const ts = fmtDateTime(new Date());
  run(
    `INSERT INTO customers (name, class_name, phone, note, points, balance_cents, total_spent_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c.name, c.class_name, c.phone, c.note,
     Math.max(0, toInt(data.points, 0)),
     Math.max(0, toInt(data.balance_cents, 0)),
     Math.max(0, toInt(data.total_spent_cents, 0)), ts, ts]
  );
  const id = lastId();
  persist();
  enqueue('customer', id, getCustomer(id));
  return getCustomer(id);
}

function updateCustomer(id, data) {
  const cur = getCustomer(id);
  if (!cur) throw new Error('顾客不存在');
  const c = normalizeCustomerInput({ ...cur, ...data });
  if (!c.name) throw new Error('顾客姓名不能为空');
  const ts = fmtDateTime(new Date());
  run(
    `UPDATE customers SET name = ?, class_name = ?, phone = ?, note = ?, updated_at = ? WHERE id = ?`,
    [c.name, c.class_name, c.phone, c.note, ts, cur.id]
  );
  persist();
  enqueue('customer', cur.id, getCustomer(cur.id));
  return getCustomer(cur.id);
}

function deleteCustomer(id) {
  const cur = getCustomer(id);
  if (!cur) throw new Error('顾客不存在');
  const cnt = Number((one('SELECT COUNT(*) AS c FROM transactions WHERE customer_id = ?', [cur.id]) || {}).c || 0);
  if (cnt > 0) throw new Error(`该顾客有 ${cnt} 条交易记录，不能删除（可改为修改信息）`);
  run('DELETE FROM customers WHERE id = ?', [cur.id]);
  persist();
  enqueue('customer_delete', cur.id, { id: cur.id });
  return true;
}

function listClasses() {
  return all(
    `SELECT class_name AS name, COUNT(*) AS count FROM customers
     WHERE class_name <> '' GROUP BY class_name ORDER BY class_name`
  ).map((r) => ({ name: r.name, count: Number(r.count) }));
}

function clearAll() {
  run('DELETE FROM customers');
  run('DELETE FROM transactions');
  // 同步队列也要清空：否则清空后云端还会收到旧的待同步记录，把已删数据又推回去
  run('DELETE FROM sync_queue');
  run("DELETE FROM sqlite_sequence WHERE name IN ('customers','transactions','sync_queue')");
  persist();
  return true;
}

/* ---------------- 交易 ---------------- */

const TYPE_LABEL = {
  consume: '积分转化',
  spend: '消费余额',
  topup: '充值',
  redeem: '积分兑换',
  adjust: '手动调整',
  init: '期初导入',
};

function enqueue(entity, recordId, payload) {
  try {
    run('INSERT INTO sync_queue (entity, record_id, payload, created_at) VALUES (?, ?, ?, ?)',
      [entity, toInt(recordId, 0), JSON.stringify(payload), fmtDateTime(new Date())]);
  } catch (e) { /* 队列失败不阻塞业务 */ }
}

function insertTx(tx) {
  run(
    `INSERT INTO transactions
      (customer_id, customer_name, class_name, type, amount_cents, points_delta, balance_delta_cents, note, operator, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tx.customer_id, tx.customer_name, tx.class_name, tx.type,
     tx.amount_cents, tx.points_delta, tx.balance_delta_cents,
     tx.note, tx.operator, tx.created_at]
  );
  const id = lastId();
  const row = one('SELECT * FROM transactions WHERE id = ?', [id]);
  enqueue('transaction', id, row);
  return row;
}

function applyCustomerDelta(customerId, dPoints, dBalanceCents, dSpentCents = 0) {
  const cur = getCustomer(customerId);
  if (!cur) throw new Error('顾客不存在');
  const pts = Number(cur.points) + toInt(dPoints, 0);
  const bal = Number(cur.balance_cents) + toInt(dBalanceCents, 0);
  if (pts < 0) throw new Error('积分不足以完成本次操作');
  if (bal < 0) throw new Error('余额不足以完成本次操作');
  run('UPDATE customers SET points = ?, balance_cents = ?, total_spent_cents = ?, updated_at = ? WHERE id = ?',
    [pts, bal, Number(cur.total_spent_cents) + toInt(dSpentCents, 0), fmtDateTime(new Date()), customerId]);
  return getCustomer(customerId);
}

/**
 * 积分转化：按输入的消费金额计算积分并累加累计消费额，默认不扣减余额。
 * deduct_balance=true 时才从余额扣款（保留给需要“余额消费”的场景）。
 */
function createConsume({ customer_id, amount_cents, note = '', operator = '', created_at = '', deduct_balance = false }) {
  const cust = getCustomer(customer_id);
  if (!cust) throw new Error('顾客不存在');
  const amount = Math.round(Number(amount_cents));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('消费金额必须大于 0');
  const balance = Number(cust.balance_cents || 0);
  if (deduct_balance && balance < amount) {
    throw new Error(`余额不足：本次需 ${(amount / 100).toFixed(2)} 元，可用余额 ${(balance / 100).toFixed(2)} 元`);
  }
  const points = pointsForAmount(amount);
  const ts = created_at || fmtDateTime(new Date());

  const dBalance = deduct_balance ? -amount : 0;
  const updated = applyCustomerDelta(cust.id, points, dBalance, amount);
  const tx = insertTx({
    customer_id: cust.id, customer_name: updated.name, class_name: updated.class_name,
    type: 'consume', amount_cents: amount, points_delta: points, balance_delta_cents: dBalance,
    note, operator, created_at: ts,
  });
  persist();
  return { tx, customer: updated, points };
}

/**
 * 消费余额：只从余额扣款 + 累加累计消费额，**不产生积分**。
 * 余额的来源只有「积分兑换」，出口只有这个函数（手动调整不允许动余额）。
 */
function createBalanceSpend({ customer_id, amount_cents, note = '', operator = '', created_at = '' }) {
  const cust = getCustomer(customer_id);
  if (!cust) throw new Error('顾客不存在');
  const amount = Math.round(Number(amount_cents));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('消费金额必须大于 0');
  const balance = Number(cust.balance_cents || 0);
  if (balance < amount) {
    throw new Error(`余额不足：本次需 ${(amount / 100).toFixed(2)} 元，可用余额 ${(balance / 100).toFixed(2)} 元`);
  }
  const ts = created_at || fmtDateTime(new Date());
  const updated = applyCustomerDelta(cust.id, 0, -amount, amount);
  const tx = insertTx({
    customer_id: cust.id, customer_name: updated.name, class_name: updated.class_name,
    type: 'spend', amount_cents: amount, points_delta: 0, balance_delta_cents: -amount,
    note, operator, created_at: ts,
  });
  persist();
  return { tx, customer: updated, amount_cents: amount, points: 0 };
}

function createTopup({ customer_id, amount_cents, note = '', operator = '', created_at = '' }) {
  const cust = getCustomer(customer_id);
  if (!cust) throw new Error('顾客不存在');
  const amount = Math.round(Number(amount_cents));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('充值金额必须大于 0');
  const ts = created_at || fmtDateTime(new Date());
  const updated = applyCustomerDelta(cust.id, 0, amount);
  const tx = insertTx({
    customer_id: cust.id, customer_name: updated.name, class_name: updated.class_name,
    type: 'topup', amount_cents: amount, points_delta: 0, balance_delta_cents: amount,
    note, operator, created_at: ts,
  });
  persist();
  return { tx, customer: updated };
}

function redeemPoints({ customer_id, times = 1, note = '', operator = '', created_at = '' }) {
  const cust = getCustomer(customer_id);
  if (!cust) throw new Error('顾客不存在');
  const rule = getRedeemRule();
  const n = Math.max(1, toInt(times, 1));
  const costPoints = rule.points * n;
  const gainBalance = rule.balance_cents * n;
  if (Number(cust.points) < costPoints) {
    throw new Error(`积分不足：需要 ${costPoints} 分，当前 ${cust.points} 分`);
  }
  const ts = created_at || fmtDateTime(new Date());
  const updated = applyCustomerDelta(cust.id, -costPoints, gainBalance);
  const tx = insertTx({
    customer_id: cust.id, customer_name: updated.name, class_name: updated.class_name,
    type: 'redeem', amount_cents: 0, points_delta: -costPoints, balance_delta_cents: gainBalance,
    note: note || `${costPoints} 分兑换 ${(gainBalance / 100).toFixed(2)} 元余额`,
    operator, created_at: ts,
  });
  persist();
  return { tx, customer: updated, costPoints, gainBalance };
}

function adjustCustomer({ customer_id, points_delta = 0, balance_delta_cents = 0, note = '', operator = '' }) {
  const cust = getCustomer(customer_id);
  if (!cust) throw new Error('顾客不存在');
  const dp = toInt(points_delta, 0);
  const db_ = toInt(balance_delta_cents, 0);
  if (dp === 0 && db_ === 0) throw new Error('调整值不能同时为 0');
  const updated = applyCustomerDelta(cust.id, dp, db_);
  const tx = insertTx({
    customer_id: cust.id, customer_name: updated.name, class_name: updated.class_name,
    type: 'adjust', amount_cents: 0, points_delta: dp, balance_delta_cents: db_,
    note: note || '手动调整', operator, created_at: fmtDateTime(new Date()),
  });
  persist();
  return { tx, customer: updated };
}

function listTransactions(params = {}) {
  const q = String(params.q || '').trim();
  const type = String(params.type || '').trim();
  const from = String(params.from || '').trim();
  const to = String(params.to || '').trim();
  const customerId = params.customer_id ? toInt(params.customer_id, 0) : 0;
  const page = Math.max(1, toInt(params.page, 1));
  const pageSize = Math.min(2000, Math.max(1, toInt(params.page_size, 20)));

  const where = [];
  const args = [];
  if (q) { where.push('(customer_name LIKE ? OR note LIKE ? OR class_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (type) { where.push('type = ?'); args.push(type); }
  if (from) { where.push('created_at >= ?'); args.push(from + ' 00:00:00'); }
  if (to) { where.push('created_at <= ?'); args.push(to + ' 23:59:59'); }
  if (customerId) { where.push('customer_id = ?'); args.push(customerId); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = Number((one(`SELECT COUNT(*) AS c FROM transactions ${whereSql}`, args) || {}).c || 0);
  const sums = one(
    `SELECT COALESCE(SUM(CASE WHEN type IN ('consume','spend') THEN amount_cents ELSE 0 END),0) AS amount,
            COALESCE(SUM(points_delta),0) AS pts,
            COALESCE(SUM(balance_delta_cents),0) AS bal
     FROM transactions ${whereSql}`, args) || {};

  const rows = all(
    `SELECT * FROM transactions ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]
  );

  return {
    total, page, page_size: pageSize, rows: rows.map((r) => ({ ...r, type_label: TYPE_LABEL[r.type] || r.type })),
    sum_amount_cents: Number(sums.amount || 0),
    sum_points: Number(sums.pts || 0),
    sum_balance_cents: Number(sums.bal || 0),
  };
}

/* ---------------- 统计 ---------------- */

function overview() {
  const today = fmtDate(new Date());
  const cust = one('SELECT COUNT(*) AS c, COALESCE(SUM(points),0) AS p, COALESCE(SUM(balance_cents),0) AS b, COALESCE(SUM(total_spent_cents),0) AS s FROM customers') || {};
  const todayRow = one(
    `SELECT COALESCE(SUM(CASE WHEN type IN ('consume','spend') THEN amount_cents ELSE 0 END),0) AS amount,
            COALESCE(SUM(CASE WHEN type='consume' THEN points_delta ELSE 0 END),0) AS pts,
            COUNT(*) AS c
     FROM transactions WHERE substr(created_at,1,10) = ?`, [today]) || {};
  const todayNew = Number((one('SELECT COUNT(*) AS c FROM customers WHERE substr(created_at,1,10) = ?', [today]) || {}).c || 0);
  const redeemTotal = Number((one("SELECT COALESCE(SUM(-points_delta),0) AS p FROM transactions WHERE type='redeem'") || {}).p || 0);

  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = fmtDate(d);
    const row = one(
      `SELECT COALESCE(SUM(CASE WHEN type IN ('consume','spend') THEN amount_cents ELSE 0 END),0) AS amount,
              COUNT(*) AS c FROM transactions WHERE substr(created_at,1,10) = ?`, [key]) || {};
    trend.push({ date: key.slice(5), amount_cents: Number(row.amount || 0), count: Number(row.c || 0) });
  }

  const top = all('SELECT id, name, class_name, points, balance_cents FROM customers ORDER BY points DESC, total_spent_cents DESC LIMIT 8')
    .map((r) => ({ ...r, points: Number(r.points), balance_cents: Number(r.balance_cents) }));

  return {
    customers: Number(cust.c || 0),
    total_points: Number(cust.p || 0),
    total_balance_cents: Number(cust.b || 0),
    total_spent_cents: Number(cust.s || 0),
    today_amount_cents: Number(todayRow.amount || 0),
    today_points: Number(todayRow.pts || 0),
    today_tx_count: Number(todayRow.c || 0),
    today_new_customers: todayNew,
    redeemed_points_total: redeemTotal,
    trend,
    top,
    pending_sync: Number((one('SELECT COUNT(*) AS c FROM sync_queue WHERE synced = 0') || {}).c || 0),
  };
}

/* ---------------- 同步队列 ---------------- */

function takeQueue(limit = 200) {
  return all('SELECT * FROM sync_queue WHERE synced = 0 ORDER BY id LIMIT ?', [limit])
    .map((r) => ({ ...r, payload: safeParse(r.payload) }));
}

function markSynced(ids) {
  for (const id of ids) run('UPDATE sync_queue SET synced = 1 WHERE id = ?', [id]);
  persist();
}

function markFailed(id, err) {
  run('UPDATE sync_queue SET tries = tries + 1, last_error = ? WHERE id = ?', [String(err).slice(0, 300), id]);
  persist();
}

function queueCount() {
  return Number((one('SELECT COUNT(*) AS c FROM sync_queue WHERE synced = 0') || {}).c || 0);
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

/* ---------------- 备份 / 导出原始数据 ---------------- */

function rawExport() {
  return Buffer.from(db.export());
}

function rawImport(buffer) {
  const next = new SQL.Database(new Uint8Array(buffer));
  // 简单完整性校验
  const r = next.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='customers'");
  if (!r.length) { next.close(); throw new Error('文件不是本系统的数据文件（缺少 customers 表）'); }
  db.close();
  db = next;
  migrate();
  persist();
  return true;
}

function backupTo(filePath) {
  fs.writeFileSync(filePath, rawExport());
  return filePath;
}

function dbPath() { return dbFile; }

module.exports = {
  open, persist,
  fmtDateTime, fmtDate,
  getSettingsPublic, setSettings, setLoginBg, getLoginBg, getLoginBgList, setLoginBgList,
  getLoginBgRotate, setLoginBgRotate, getTheme, setTheme, getUiMode, setUiMode,
  hasPassword, setupPasswords, verifyLogin, verifyOp, changePassword,
  getLoginUsername, setLoginUsername,
  getTermsAccepted, setTermsAccepted,
  pointsForAmount, getRedeemRule,
  listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, customerIndex, findCustomerExact,
  listClasses, clearAll,
  createConsume, createBalanceSpend, createTopup, redeemPoints, adjustCustomer,
  listTransactions,
  overview,
  takeQueue, markSynced, markFailed, queueCount,
  rawExport, rawImport, backupTo, dbPath,
  TYPE_LABEL,
};
