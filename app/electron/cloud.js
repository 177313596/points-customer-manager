'use strict';

/**
 * 云端同步：本地优先（local-first）
 * - 未启用时完全不联网，所有功能照常工作
 * - 启用后按队列增量推送，失败自动重试，不阻塞收银
 * - 适配器：generic（自有 HTTP 接口）/ feishu（飞书多维表格）
 */

const db = require('./db');

function cfg() {
  return db.getSettingsPublic().cloud_config || {};
}

function yuan(cents) { return Number(cents || 0) / 100; }

function tsToFeishuDate(v) {
  // 飞书多维表格日期字段需要毫秒时间戳
  if (!v) return Date.now();
  const t = new Date(String(v).replace(/-/g, '/')).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

async function postJson(url, body, headers = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 通用 HTTP 接口 ---------- */
async function pushGeneric(config, items) {
  const records = items.map((it) => ({
    entity: it.entity,
    record_id: it.record_id,
    payload: it.payload,
    created_at: it.created_at,
  }));
  await postJson(config.endpoint, { source: 'points-manager-desktop', records, sent_at: new Date().toISOString() },
    config.token ? { Authorization: `Bearer ${config.token}` } : {});
}

/* ---------- 飞书多维表格 ---------- */
async function feishuToken(config) {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`飞书鉴权失败：${json.msg || json.code}`);
  return json.tenant_access_token;
}

function toCustomerFields(p) {
  return {
    '顾客ID': String(p.id),
    '姓名': String(p.name || ''),
    '班级': String(p.class_name || ''),
    '手机': String(p.phone || ''),
    '积分': Number(p.points || 0),
    '余额(元)': yuan(p.balance_cents),
    '累计消费(元)': yuan(p.total_spent_cents),
    '备注': String(p.note || ''),
    '创建时间': tsToFeishuDate(p.created_at),
    '更新时间': tsToFeishuDate(p.updated_at),
  };
}

function toTxFields(p) {
  return {
    '记录ID': String(p.id),
    '顾客ID': String(p.customer_id),
    '姓名': String(p.customer_name || ''),
    '班级': String(p.class_name || ''),
    '类型': String(db.TYPE_LABEL[p.type] || p.type || ''),
    '金额(元)': yuan(p.amount_cents),
    '积分变动': Number(p.points_delta || 0),
    '余额变动(元)': yuan(p.balance_delta_cents),
    '备注': String(p.note || ''),
    '操作人': String(p.operator || ''),
    '时间': tsToFeishuDate(p.created_at),
  };
}

async function pushFeishu(config, items) {
  const token = await feishuToken(config);
  const auth = { Authorization: `Bearer ${token}` };
  const base = `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables`;

  const custRoot = items.filter((it) => it.entity === 'customer');
  const txRoot = items.filter((it) => it.entity === 'transaction');

  if (custRoot.length) {
    if (!config.tableIdCustomers) throw new Error('未配置“顾客表” table_id');
    await postJson(`${base}/${config.tableIdCustomers}/records/batch_create`,
      { records: custRoot.map((it) => ({ fields: toCustomerFields(it.payload) })) }, auth);
  }
  if (txRoot.length) {
    if (!config.tableIdTransactions) throw new Error('未配置“消费记录表” table_id');
    await postJson(`${base}/${config.tableIdTransactions}/records/batch_create`,
      { records: txRoot.map((it) => ({ fields: toTxFields(it.payload) })) }, auth);
  }
}

/* ---------- 对外接口 ---------- */

async function syncNow({ limit = 200 } = {}) {
  const config = cfg();
  if (!config.enabled) throw new Error('云同步尚未启用，请先在“设置 - 云端同步”中开启并填写配置');

  const items = db.takeQueue(limit);
  if (!items.length) return { pushed: 0, rest: 0, message: '没有待同步数据' };

  const payloadItems = items.filter((it) => it.payload && it.entity !== 'customer_delete');

  try {
    if (config.provider === 'feishu') {
      if (!config.appId || !config.appSecret) throw new Error('请填写飞书 App ID / App Secret');
      // 飞书单次批量上限 100 条
      for (let i = 0; i < payloadItems.length; i += 100) {
        await pushFeishu(config, payloadItems.slice(i, i + 100));
      }
    } else {
      if (!config.endpoint) throw new Error('请填写云端接口地址');
      await pushGeneric(config, payloadItems);
    }

    db.markSynced(items.map((it) => it.id));
    const saved = db.setSettings({ cloud_config: { lastSyncAt: new Date().toISOString(), lastError: '' } });
    return { pushed: items.length, rest: db.queueCount(), message: `已同步 ${items.length} 条` };
  } catch (err) {
    for (const it of items) db.markFailed(it.id, err.message || String(err));
    db.setSettings({ cloud_config: { lastError: String(err.message || err).slice(0, 300) } });
    throw new Error(`同步失败：${err.message || err}`);
  }
}

async function testConnection(config) {
  if (!config || !config.enabled) throw new Error('请先开启云同步');
  if (config.provider === 'feishu') {
    if (!config.appId || !config.appSecret) throw new Error('请填写飞书 App ID / App Secret');
    await feishuToken(config);
    return { ok: true, message: '飞书应用鉴权通过' };
  }
  if (!config.endpoint) throw new Error('请填写云端接口地址');
  await postJson(config.endpoint, { source: 'points-manager-desktop', ping: true },
    config.token ? { Authorization: `Bearer ${config.token}` } : {});
  return { ok: true, message: '接口连通' };
}

module.exports = { syncNow, testConnection, cfg };
