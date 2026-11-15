'use strict';

/**
 * 云端接收端示例（零依赖，Node.js 直接运行）
 *
 * 用途：演示「积分客户管理系统」的通用 HTTP 同步接口怎么写，
 *      也可直接当作一个内网/公网的最小接收端使用。
 *
 * 启动：node 云端接收端示例.js
 * 默认监听 http://127.0.0.1:8787/sync
 *
 * 在应用「设置 - 云端同步」里填：
 *   云端类型：自有 HTTP 接口 / Webhook
 *   接口地址：http://127.0.0.1:8787/sync
 *   访问令牌：与下面的 TOKEN 一致
 *   开启开关 -> 保存配置 -> 测试连接 -> 立即同步
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8787;
const TOKEN = 'change-me-please'; // 生产环境请改成随机长字符串
const DATA_FILE = path.join(__dirname, 'received-data.json');

// 已收到的数据按实体分类，取最新一条（record_id 相同则覆盖）
const store = { customers: new Map(), transactions: new Map() };

function load() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    Object.entries(raw).forEach(([entity, list]) => {
      list.forEach((it) => store[entity] && store[entity].set(String(it.record_id), it));
    });
  } catch (e) {
    console.warn('读取历史数据失败：', e.message);
  }
}

function save() {
  const out = {};
  Object.entries(store).forEach(([entity, map]) => { out[entity] = [...map.values()]; });
  fs.writeFileSync(DATA_FILE, JSON.stringify(out, null, 2), 'utf8');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 20 * 1024 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('onerror', reject);
  });
}

load();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    const counts = Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v.size]));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, received: counts }, null, 2));
  }

  if (req.method !== 'POST' || url.pathname !== '/sync') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('not found');
  }

  const auth = req.headers.authorization || '';
  if (TOKEN && auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: 'bad token' }));
  }

  try {
    const body = JSON.parse(await readBody(req));

    if (body.ping) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, pong: true }));
    }

    const records = body.records || [];
    let handled = 0;
    for (const r of records) {
      const bucket = r.entity === 'transaction' ? store.transactions
        : r.entity === 'customer' ? store.customers : null;
      if (!bucket) continue;
      bucket.set(String(r.record_id), r);
      handled++;
    }
    save();

    console.log(`[${new Date().toLocaleTimeString()}] 收到 ${records.length} 条，写入 ${handled} 条`);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, received: records.length }));
  } catch (e) {
    console.error('处理失败：', e.message);
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`云端接收端已启动：http://127.0.0.1:${PORT}/sync`);
  console.log(`访问令牌：${TOKEN}`);
  console.log('浏览器打开 http://127.0.0.1:8787/ 可查看累计接收数量');
});
