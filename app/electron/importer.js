'use strict';

/**
 * Excel / CSV 批量导入导出
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const db = require('./db');

/* ---------------- 表头别名 ---------------- */
const ALIAS = {
  name: ['姓名', '顾客姓名', '学生姓名', '名字', '客户姓名', 'name', 'customer'],
  class_name: ['班级', '所属班级', '班级名称', 'class', 'class_name', 'grade'],
  phone: ['手机', '手机号', '联系电话', '电话', 'phone', 'mobile'],
  points: ['积分', '当前积分', '现有积分', 'points'],
  balance: ['余额', '余额(元)', '账户余额', 'balance'],
  total_spent: ['累计消费', '累计消费(元)', '累计消费额', '消费总额'],
  note: ['备注', '说明', 'note', 'remark'],
  amount: ['金额', '金额(元)', '消费金额', '消费金额(元)', 'amount', 'money'],
  type: ['类型', '交易类型', 'type'],
  time: ['时间', '交易时间', '消费时间', '日期', 'created_at', 'time', 'date'],
  created_at: ['创建时间', '建档时间', '注册时间'],
};

function normKey(k) {
  return String(k || '').replace(/\s|　/g, '').replace(/\*/g, '').trim();
}

function pick(row, field) {
  const keys = Object.keys(row);
  for (const k of keys) {
    const nk = normKey(k);
    for (const alias of ALIAS[field] || []) {
      if (normKey(alias) === nk) return row[k];
    }
  }
  return undefined;
}

function toCents(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v).replace(/[¥￥,，\s元]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toIntVal(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function toDateTime(v, fallback) {
  if (v instanceof Date) return db.fmtDateTime(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel 序列号日期
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return db.fmtDateTime(new Date(ms));
  }
  const s = String(v || '').trim();
  if (!s) return fallback;
  const m = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:\s*(\d{1,2})[:：时](\d{1,2})(?:[:：分](\d{1,2}))?)?/);
  if (!m) return fallback;
  const [, y, mo, d, h, mi, se] = m;
  const pad = (x) => String(x || 0).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(se)}`;
}

function readRows(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true, cellNF: false, cellText: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('文件中没有工作表');
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true, blankrows: false });
  return rows;
}

function readTextRows(filePath) {
  // 中文 Excel 另存的 CSV 默认是 GBK，直接按 utf8 读会整列变乱码；先按 utf8 读，
  // 出现替换字符（\uFFFD）就改用 GBK 再解一次。
  const buf = fs.readFileSync(filePath);
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('\uFFFD')) {
    try { text = new TextDecoder('gbk').decode(buf); } catch (e) { /* 没有 GBK 支持就保持 utf8 结果 */ }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const wb = XLSX.read(text, { type: 'string', cellDates: true, raw: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('文件中没有工作表');
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: true, blankrows: false });
}

/* ---------------- 导入顾客 ---------------- */

function importCustomers(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const rows = (ext === '.csv' || ext === '.txt') ? readTextRows(filePath) : readRows(filePath);
  if (!rows.length) throw new Error('文件为空或没有可识别的数据行');

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const name = String(pick(row, 'name') || '').trim();
    if (!name) { skipped++; if (errors.length < 20) errors.push(`第 ${line} 行：缺少姓名，已跳过`); return; }

    const class_name = String(pick(row, 'class_name') || '').trim();
    const phone = String(pick(row, 'phone') || '').trim();
    const note = String(pick(row, 'note') || '').trim();
    const points = Math.max(0, toIntVal(pick(row, 'points')));
    const balance_cents = Math.max(0, toCents(pick(row, 'balance')));
    const total_spent_cents = Math.max(0, toCents(pick(row, 'total_spent')));

    try {
      const exist = db.listCustomers({ q: name, page_size: 200 }).rows
        .find((c) => c.name === name && (c.class_name || '') === class_name);

      if (exist) {
        db.updateCustomer(exist.id, { name, class_name, phone, note });
        if (points || balance_cents || total_spent_cents) {
          try {
            db.adjustCustomer({
              customer_id: exist.id,
              points_delta: points,
              balance_delta_cents: balance_cents,
              note: '批量导入期初数据',
              operator: '导入',
            });
          } catch (e) { errors.push(`第 ${line} 行（${name}）：${e.message}`); }
        }
        updated++;
      } else {
        db.createCustomer({ name, class_name, phone, note, points, balance_cents, total_spent_cents });
        created++;
      }
    } catch (e) {
      skipped++;
      if (errors.length < 20) errors.push(`第 ${line} 行（${name}）：${e.message}`);
    }
  });

  return { created, updated, skipped, errors, total: rows.length };
}

/* ---------------- 导入消费记录 ---------------- */

function importTransactions(filePath, { autoCreate = false, operator = '导入' } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const rows = (ext === '.csv' || ext === '.txt') ? readTextRows(filePath) : readRows(filePath);
  if (!rows.length) throw new Error('文件为空或没有可识别的数据行');

  let imported = 0, skipped = 0;
  const errors = [];

  // 顾客索引只建一次：原先每行都调一次带 COUNT + ORDER 的分页查询，几千行的表会慢到卡住，
  // 而且 page_size 上限 500，顾客超过 500 人时后面的记录还会"找不到顾客"。
  const byKey = new Map();  // 姓名 + 班级 -> id
  const byName = new Map(); // 姓名 -> [id, ...]
  for (const c of db.customerIndex()) {
    byKey.set(c.name + '\u0000' + c.class_name, c.id);
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c.id);
  }
  const remember = (cust) => {
    if (!cust || !cust.id) return;
    byKey.set(cust.name + '\u0000' + (cust.class_name || ''), cust.id);
    if (!byName.has(cust.name)) byName.set(cust.name, []);
    byName.get(cust.name).push(cust.id);
  };

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const name = String(pick(row, 'name') || '').trim();
    const class_name = String(pick(row, 'class_name') || '').trim();
    const amount = toCents(pick(row, 'amount'));
    const ts = toDateTime(pick(row, 'time'), db.fmtDateTime(new Date()));
    const note = String(pick(row, 'note') || '').trim() || '批量导入消费';
    const typeRaw = String(pick(row, 'type') || '').trim();

    if (!name) { skipped++; if (errors.length < 20) errors.push(`第 ${line} 行：缺少姓名`); return; }
    if (amount <= 0) { skipped++; if (errors.length < 20) errors.push(`第 ${line} 行（${name}）：金额为空或无效`); return; }

    try {
      // 有班级就精确到班级；没写班级就按姓名取第一个同名顾客
      let custId = class_name ? (byKey.get(name + '\u0000' + class_name) || 0) : ((byName.get(name) || [])[0] || 0);

      if (!custId && autoCreate) {
        const created = db.createCustomer({ name, class_name });
        remember(created);
        custId = created.id;
      }
      if (!custId) {
        skipped++;
        if (errors.length < 20) errors.push(`第 ${line} 行（${name}）：未找到该顾客，请先导入顾客名单`);
        return;
      }

      let type = 'consume';
      if (typeRaw.includes('充值')) type = 'topup';

      if (type === 'topup') {
        db.createTopup({ customer_id: custId, amount_cents: amount, note, operator, created_at: ts });
      } else {
        // 历史流水补录：只还原消费金额与积分，不追溯扣减当前余额
        db.createConsume({ customer_id: custId, amount_cents: amount, note, operator, created_at: ts, deduct_balance: false });
      }
      imported++;
    } catch (e) {
      skipped++;
      if (errors.length < 20) errors.push(`第 ${line} 行（${name}）：${e.message}`);
    }
  });

  return { imported, skipped, errors, total: rows.length };
}

/* ---------------- 导出 ---------------- */

function writeTable(filePath, header, rows, widths) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    const esc = (v) => {
      const s = String(v === null || v === undefined ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const content = '\uFEFF' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    fs.writeFileSync(filePath, content, 'utf8');
    return;
  }
  const aoa = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filePath);
}

function exportCustomers(filePath, filters = {}) {
  const data = db.listCustomers({ ...filters, page: 1, page_size: 5000 });
  const header = ['姓名', '班级', '手机', '积分', '余额(元)', '累计消费(元)', '备注', '建档时间'];
  const rows = data.rows.map((c) => [
    c.name, c.class_name, c.phone, Number(c.points),
    (Number(c.balance_cents) / 100).toFixed(2),
    (Number(c.total_spent_cents) / 100).toFixed(2),
    c.note, c.created_at,
  ]);
  writeTable(filePath, header, rows, [12, 16, 16, 10, 12, 14, 24, 22]);
  return { count: rows.length, file: filePath };
}

function exportTransactions(filePath, filters = {}) {
  const data = db.listTransactions({ ...filters, page: 1, page_size: 5000 });
  const header = ['时间', '姓名', '班级', '类型', '消费金额(元)', '积分变动', '余额变动(元)', '备注', '操作人'];
  const rows = data.rows.map((t) => [
    t.created_at, t.customer_name, t.class_name, db.TYPE_LABEL[t.type] || t.type,
    (Number(t.amount_cents) / 100).toFixed(2),
    Number(t.points_delta),
    (Number(t.balance_delta_cents) / 100).toFixed(2),
    t.note, t.operator,
  ]);
  writeTable(filePath, header, rows, [22, 12, 16, 12, 14, 12, 14, 28, 12]);
  return { count: rows.length, file: filePath };
}

function exportTemplate(filePath, kind = 'customers') {
  if (kind === 'transactions') {
    writeTable(filePath,
      ['姓名', '班级', '消费金额(元)', '时间', '备注'],
      [['张三', '三年级二班', '25.5', '2026-11-07 10:23:45', '购买文具'],
       ['李四', '三年级一班', '10', '2026/11/07 09:00', '购买教辅']],
      [12, 16, 14, 22, 24]);
  } else {
    writeTable(filePath,
      ['姓名', '班级', '手机', '积分', '余额(元)', '备注'],
      [['张三', '三年级二班', '13800138000', '35', '12.50', '会员'],
       ['李四', '三年级一班', '', '0', '0', '']],
      [12, 16, 16, 10, 12, 20]);
  }
  return { file: filePath };
}

module.exports = { importCustomers, importTransactions, exportCustomers, exportTransactions, exportTemplate };
