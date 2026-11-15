'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

app.whenReady().then(async () => {
  // 复刻真实路径：带中文的 userData 目录
  const dir = path.join(process.env.APPDATA, '积分客户管理系统', 'login-bg');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'probe.png');
  fs.writeFileSync(file, Buffer.from(PNG, 'base64'));
  const href = url.pathToFileURL(file).href;
  console.log('href: ' + href);

  const win = new BrowserWindow({ show: false, width: 800, height: 600 });
  // 与应用一致：页面本身也从 file:// 加载（data: 页会拦掉 file 子资源，测不出真实情况）
  const html = path.join(dir, 'probe.html');
  fs.writeFileSync(html, '<html><body style="margin:0"><div id=x></div></body></html>');

  // 顺带验证：同样的 preload 能否挂上 window.api（排除 preload 路径/沙箱问题）
  const w2 = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  let r3 = 'none';
  w2.webContents.on('preload-error', (e, p, err) => { r3 = 'preload-error ' + err.message; });
  await w2.loadFile(html);
  const hasApi = await w2.webContents.executeJavaScript('typeof window.api').catch((e) => 'err ' + e.message);
  console.log('hasApi: ' + hasApi + ' ' + r3);

  await win.loadFile(html);
  const r = await win.webContents.executeJavaScript(`
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res('loaded ' + i.naturalWidth + 'x' + i.naturalHeight);
      i.onerror = () => res('error');
      i.src = ${JSON.stringify(href)};
      setTimeout(() => res('timeout'), 3000);
    })
  `);
  console.log('probe: ' + r);

  // 顺带验证 CSS 背景写法也能加载（含中文路径、中文文件名）
  const file2 = path.join(dir, '背景 测试.png');
  fs.writeFileSync(file2, Buffer.from(PNG, 'base64'));
  const href2 = url.pathToFileURL(file2).href;
  const r2 = await win.webContents.executeJavaScript(`
    new Promise((res) => {
      const d = document.getElementById('x');
      d.style.width = '100px'; d.style.height = '100px';
      d.style.backgroundImage = 'url("${href2}")';
      const i = new Image();
      i.onload = () => res('loaded ' + i.naturalWidth + 'x' + i.naturalHeight);
      i.onerror = () => res('error');
      i.src = ${JSON.stringify(href2)};
      setTimeout(() => res('timeout'), 3000);
    })
  `);
  console.log('probe-cn: ' + r2);

  try { fs.rmSync(file, { force: true }); } catch (e) {}
  try { fs.rmSync(file2, { force: true }); } catch (e) {}
  try { fs.rmSync(html, { force: true }); } catch (e) {}
  fs.writeFileSync(path.join(process.env.TEMP, 'pm-bg-probe.txt'),
    'href=' + href + '\nprobe=' + r + '\nprobe-cn=' + r2 + '\nhasApi=' + hasApi + ' ' + r3 + '\n');
  app.exit(r.startsWith('loaded') && r2.startsWith('loaded') ? 0 : 3);
});
