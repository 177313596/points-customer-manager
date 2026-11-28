'use strict';
/* 验证：菜单当前项的玻璃胶囊
   1) 采样 transform（每 30ms 一次，共 700ms），量化弹簧的滑行、过冲、拉伸峰值
   2) 截三张图：静止 / 切换过程中 / 到位后
   产出：%TEMP%\pm-pill-*.png，日志打印到 stdout */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-pill-shot');
app.setPath('userData', path.join(os.tmpdir(), 'pm-pill-shot-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (win, name) => win.webContents.capturePage().then((img) => {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, img.toPNG());
  return p;
});

const CLICK = (sel, text) => `
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)}));
    if (!el) return 'not-found';
    el.click();
    return 'clicked';
  })()
`;

/* 采样 700ms 内胶囊的 translate/scale，同时记录目标位置 */
const SAMPLE = (hostSel) => `
  (() => new Promise((resolve) => {
    const host = document.querySelector(${JSON.stringify(hostSel)});
    const pill = host && host.querySelector('.nav-glass-pill');
    const el = host && (host.querySelector(':scope > .active') || host.querySelector('.active'));
    if (!pill || !host || !el) return resolve('missing');
    const hr = host.getBoundingClientRect(), r = el.getBoundingClientRect();
    const target = (r.top - hr.top) + r.height / 2;   // 目标中心（竖向）
    const samples = [];
    const t0 = performance.now();
    const tick = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(pill).transform);
      const sy = Math.hypot(m.b, m.d) || 1;            // scaleY（近似，竖向拉伸）
      const sx = Math.hypot(m.a, m.c) || 1;
      const y = m.f;
      samples.push({ t: Math.round(performance.now() - t0), y: +y.toFixed(2), sx: +sx.toFixed(3), sy: +sy.toFixed(3) });
      if (performance.now() - t0 < 720) requestAnimationFrame(tick);
      else {
        const peakStretch = Math.max(...samples.map(s => s.sy));
        const peakSquash = Math.min(...samples.map(s => s.sx));
        const over = Math.max(...samples.map(s => (s.y + pill.offsetHeight / 2) - target));
        resolve(JSON.stringify({ target: +target.toFixed(1), peakStretch, peakSquash, overshootPx: +over.toFixed(2), frames: samples.length,
          steps: pill.dataset.steps || '0', paint: pill.dataset.paint || '', dbg: pill.dataset.dbg || '',
          h: +pill.offsetHeight.toFixed(1), tail: samples.slice(-3) }));
      }
    };
    requestAnimationFrame(tick);
  }))()
`;

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);

  const until = async (expr, label, timeout = 9000) => {
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
  const logged = await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      if (!ins.length) return 'no-login';
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
      return 'ok';
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('login:', logged);
  await until(`document.querySelector('.nav-pill')`, 'nav pill', 12000);
  await wait(900);

  const pillBase = await win.webContents.executeJavaScript(`
    (() => {
      const p = document.querySelector('.nav-pill');
      if (!p) return 'missing';
      const cs = getComputedStyle(p);
      return JSON.stringify({
        w: p.style.width, h: p.style.height, opacity: cs.opacity,
        radius: cs.borderRadius,
        backdrop: (cs.backdropFilter || cs.webkitBackdropFilter || 'none').slice(0, 40),
        rim: cs.boxShadow.split('inset')[1] ? cs.boxShadow.slice(0, 120) : cs.boxShadow.slice(0, 120),
        transform: cs.transform,
      });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('pill:', pillBase);
  console.log('shot idle:', await shot(win, 'pm-pill-01-idle.png'));

  /* 侧边栏：从「工作台」跳到「顾客管理」，采一次全程 */
  let r = await win.webContents.executeJavaScript(CLICK('.nav-item', '顾客管理'));
  console.log('click 顾客管理:', r);
  /* 先抢两张运动中的画面（capturePage 本身有几十毫秒延迟，正好落在滑行中段） */
  await wait(40);
  console.log('shot mid-1:', await shot(win, 'pm-pill-06-mid.png'));
  await wait(60);
  console.log('shot mid-2:', await shot(win, 'pm-pill-07-mid.png'));
  const sampled = await win.webContents.executeJavaScript(SAMPLE('.side-nav'));
  console.log('slide sample:', sampled);
  console.log('shot moving(last frames captured after):', await shot(win, 'pm-pill-02-after-nav.png'));

  await wait(700);
  console.log('shot settled:', await shot(win, 'pm-pill-03-nav-settled.png'));

  /* 设置页二级栏目：基础信息 → 安全设置 */
  await win.webContents.executeJavaScript(CLICK('.nav-item', '设置'));
  await wait(900);
  const setPill = await win.webContents.executeJavaScript(`
    (() => {
      const p = document.querySelector('.set-pill');
      if (!p) return 'missing';
      const cs = getComputedStyle(p);
      return JSON.stringify({ w: p.style.width, h: p.style.height, opacity: cs.opacity, radius: cs.borderRadius, transform: cs.transform.slice(0, 60) });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('set pill:', setPill);
  console.log('shot settings:', await shot(win, 'pm-pill-04-settings.png'));

  r = await win.webContents.executeJavaScript(CLICK('.set-nav-item', '安全设置'));
  console.log('click 安全设置:', r);
  const setSample = await win.webContents.executeJavaScript(SAMPLE('.set-nav'));
  console.log('set slide sample:', setSample);
  await wait(400);
  console.log('shot settings settled:', await shot(win, 'pm-pill-05-settings-settled.png'));

  /* 简洁版：确认胶囊仍在但不做弹簧（加 ui-lite 后点击应一帧到位） */
  await win.webContents.executeJavaScript(`document.body.classList.add('ui-lite')`).catch(() => { });
  await wait(400);
  await win.webContents.executeJavaScript(CLICK('.set-nav-item', '基础信息'));
  await wait(60);
  const liteInfo = await win.webContents.executeJavaScript(`
    (() => {
      const p = document.querySelector('.set-pill');
      const cs = getComputedStyle(p);
      const m = new DOMMatrixReadOnly(cs.transform);
      const host = p.parentElement;
      const el = host.querySelector('.active');
      const hr = host.getBoundingClientRect(), r = el.getBoundingClientRect();
      return JSON.stringify({
        lite: document.body.classList.contains('ui-lite'),
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
        sy: +Math.hypot(m.b, m.d).toFixed(3),
        offsetFromTarget: +((m.f + p.offsetHeight / 2) - ((r.top - hr.top) + r.height / 2)).toFixed(2),
      });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('lite (60ms after click):', liteInfo);
  await win.webContents.executeJavaScript(`document.body.classList.remove('ui-lite')`).catch(() => { });

  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
