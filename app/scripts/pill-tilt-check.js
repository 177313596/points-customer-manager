'use strict';
/* 验证：卡片 3D 倾斜状态下，菜单胶囊是否仍然精确落在当前项上。
   做法：把鼠标停在菜单底部（卡片被倾斜到接近 4°）→ 点击某个导航项 → 等弹簧到位 →
   比较胶囊与该项的屏幕矩形中心。倾斜由卡片 transform 施加，两者在同一变换子树里，
   若胶囊量的是布局坐标，两个矩形中心应该重合。 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');

app.setName('pm-pill-tilt');
app.setPath('userData', path.join(os.tmpdir(), 'pm-pill-tilt-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);

  const until = async (expr, label, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const ok = await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false);
      if (ok) return true;
      await wait(250);
    }
    console.log('timeout waiting for ' + label);
    return false;
  };

  await win.webContents.executeJavaScript(`
    (async () => { await window.api.setup('pass123','','管理员'); await window.api.acceptTerms(new Date().toISOString()); return true; })()
  `).catch(() => { });
  win.reload();
  await until(`document.querySelector('.login-card input')`, 'login card');
  await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
      return 'ok';
    })()
  `);
  await until(`document.querySelector('.nav-pill')`, 'nav pill');
  await wait(800);

  const probe = (hostSel, itemText) => `
    (() => {
      const host = document.querySelector(${JSON.stringify(hostSel)});
      const el = [...host.querySelectorAll('.active')][0];
      const pill = host.querySelector('.nav-glass-pill');
      const hostEl = host.closest('.glass-surface') || host;
      const hcs = getComputedStyle(hostEl);
      const pr = pill.getBoundingClientRect();
      const cr = el.getBoundingClientRect();
      return JSON.stringify({
        item: el.textContent.trim().slice(0, 8),
        diag: +(Math.hypot((pr.left + pr.width / 2) - (cr.left + cr.width / 2), (pr.top + pr.height / 2) - (cr.top + cr.height / 2))).toFixed(2),
        dx: +((pr.left + pr.width / 2) - (cr.left + cr.width / 2)).toFixed(2),
        dy: +((pr.top + pr.height / 2) - (cr.top + cr.height / 2)).toFixed(2),
        size: [ +pr.width.toFixed(1), +pr.height.toFixed(1), +cr.width.toFixed(1), +cr.height.toFixed(1) ],
        tilt: hcs.transform.slice(0, 30),
      });
    })()
  `;

  const clickNav = (text) => `
    (() => { [...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes(${JSON.stringify(text)})).click(); return 'ok'; })()
  `;

  /* ① 鼠标停在菜单上部 → 点击底部项（此时卡片朝上倾斜，位移最大） */
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 120, y: 150 });
  await wait(120);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 126, y: 156 });
  await wait(420);
  const tiltNow = await win.webContents.executeJavaScript(`
    (() => { const s = document.querySelector('.sidebar'); return s.style.getPropertyValue('--tx') + '/' + s.style.getPropertyValue('--ty'); })()
  `);
  console.log('当前倾斜:', tiltNow);
  await win.webContents.executeJavaScript(clickNav('设置'));
  await wait(950);
  console.log('倾斜中落点(主菜单):', await win.webContents.executeJavaScript(probe('.side-nav')));

  /* ② 设置页二级栏目：同样先倾斜再点 */
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 150 });
  await wait(120);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 408, y: 158 });
  await wait(400);
  const setTilt = await win.webContents.executeJavaScript(`
    (() => { const s = document.querySelector('.set-nav'); const c = getComputedStyle(s); return (s.style.getPropertyValue('--tx') || '0') + '/' + (s.style.getPropertyValue('--ty') || '0') + ' ' + c.transform.slice(0, 24); })()
  `);
  console.log('设置栏目倾斜:', setTilt);
  await win.webContents.executeJavaScript(`
    (() => { [...document.querySelectorAll('.set-nav-item')].find(b => b.textContent.includes('数据与备份')).click(); return 'ok'; })()
  `);
  await wait(950);
  console.log('倾斜中落点(设置):', await win.webContents.executeJavaScript(probe('.set-nav')));

  /* ③ 鼠标移到内容区（无倾斜）再点，作为对照 */
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 900, y: 700 });
  await wait(500);
  await win.webContents.executeJavaScript(clickNav('工作台'));
  await wait(950);
  console.log('无倾斜对照:', await win.webContents.executeJavaScript(probe('.side-nav')));

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
