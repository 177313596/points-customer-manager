'use strict';
/* 把本地源码同步到 GitHub（不改历史，只在 main 上叠一个 commit）。
   本机 git push 直连 github.com 不通，所以走 Git Data API：
   逐文件算 git blob sha → 只上传有变化的 → 建 tree/commit → 移动 ref。 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = 'C:/Users/17731/Doubao/chats/2026-11-07/new-chat-2';
const REPO = '177313596/points-customer-manager';
const BRANCH = 'main';
const TOKEN = process.env.GH_TOKEN;
const API = 'https://api.github.com';
const MSG = process.argv[2] || 'chore: sync source';

if (!TOKEN) { console.error('missing GH_TOKEN'); process.exit(1); }

async function api(p, opt = {}) {
  const res = await fetch(API + p, {
    ...opt,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pm-publish',
      ...(opt.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opt.method || 'GET'} ${p} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

function listFiles() {
  const out = [];
  const skipName = /(^icon-orig\.png$|^\.DS_Store$|\.blockmap$)/;
  const files = ['README.md', '.gitignore', '使用说明.md', '修改指南.md', '云端同步接入说明.md',
    '构建安装包.ps1', '重新构建.ps1'];
  const dirs = ['app/src', 'app/scripts', 'app/electron', 'app/build', 'docs', '工具'];
  const singles = ['app/.npmrc', 'app/index.html', 'app/package.json', 'app/package-lock.json', 'app/vite.config.js'];
  for (const f of files) { if (fs.existsSync(path.join(ROOT, f))) out.push(f); }
  for (const s of singles) { if (fs.existsSync(path.join(ROOT, s))) out.push(s); }
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (skipName.test(ent.name)) continue;
      const r = rel + '/' + ent.name;
      if (ent.isDirectory()) walk(r);
      else out.push(r);
    }
  };
  dirs.forEach(walk);
  return out.map((p) => p.replace(/\\/g, '/'));
}

function blobSha(buf) {
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

(async () => {
  const ref = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const commit = await api(`/repos/${REPO}/git/commits/${headSha}`);
  const tree = await api(`/repos/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
  const remote = new Map(tree.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
  console.log('remote head ' + headSha.slice(0, 7) + ', blobs ' + remote.size);

  const local = listFiles();
  const entries = [];
  let uploaded = 0;
  for (const rel of local) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const sha = blobSha(buf);
    if (remote.get(rel) === sha) continue;
    const blob = await api(`/repos/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }),
    });
    entries.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
    uploaded++;
    console.log('  ~ ' + rel + (remote.has(rel) ? '' : ' (new)'));
  }
  console.log('changed blobs: ' + uploaded + ' / local files ' + local.length);
  if (!entries.length) { console.log('nothing to commit'); return; }

  const newTree = await api(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }),
  });
  const newCommit = await api(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: MSG, tree: newTree.sha, parents: [headSha] }),
  });
  await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });
  console.log('COMMITTED ' + newCommit.sha);
  console.log('https://github.com/' + REPO + '/commit/' + newCommit.sha);
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
