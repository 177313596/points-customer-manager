'use strict';
/* 本轮加载/入场动效验收（CDP 截图，避开 capturePage 的延迟）：
   ① 登录前的骨架屏：灰块 + 扫光 1500ms/linear/infinite
   ② 进入主界面的骨架屏 + 进度条随真实请求推进（不造假）
   ③ 卡片 700ms、起始 blur 14px、彼此 0.05s 错峰入场
   ④ 统计数字从 0 滚到目标值
   ⑤ 注册完成后的二级密码提醒延后到主界面（先主界面，后弹窗）
   临时 userData，不碰真实数据。产出 %TEMP%\load-anim-*.png */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-load-anim');
app.setPath('userData', path.join(os.tmpdir(), 'pm-load-anim-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function cdpShot(win, name) {
  const dbg = win.webContents.debugger;
  try { if (!dbg.isAttached()) dbg.attach('1.3'); } catch (e) { /* already attached */ }
  return dbg.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true })
    .then(({ data }) => {
      const p = path.join(os.tmpdir(), name);
      fs.writeFileSync(p, Buffer.from(data, 'base64'));
      return p;
    })
    .catch((e) => 'SHOT-ERR:' + e.message);
}

app.whenReady().then(async () => {
  await wait(1200);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);
  const js = (code) => win.webContents.executeJavaScript(code).catch((e) => 'ERR:' + e.message);
  const until = async (expr, label, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const ok = await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false);
      if (ok) return true;
      await wait(100);
    }
    console.log('timeout waiting for ' + label);
    return false;
  };

  /* ============ A. 全新库：注册 → 主界面骨架 → 弹窗 ============ */
  await until(`document.querySelector('.login-card input')`, 'setup card');
  await wait(500);
  console.log('setup-shot:', await cdpShot(win, 'load-anim-01-setup.png'));

  const signup = await js(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const ins = [...document.querySelectorAll('.login-card input')];
      if (ins.length < 3) return 'no-setup-form:' + ins.length;
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123'); setVal(ins[2], 'pass123');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.includes('完成初始化')).click();
      return 'ok';
    })()
  `);
  console.log('signup-click:', signup);
  const tSubmit = Date.now();

  /* 每 30ms 采一次，先把骨架屏的窗口和进度条轨迹量化下来 */
  const samples = [];
  let skShot = '';
  for (let i = 0; i < 40; i += 1) {
    const s = await js(`
      (() => {
        const sk = document.querySelector('.sk-scope');
        const bar = document.querySelector('.sk-progress i');
        const nav = document.querySelector('.nav-item');
        const modal = document.querySelector('.modal');
        const shine = document.querySelector('.sk-shine');
        const st = shine ? getComputedStyle(shine, '::before') : null;
        return JSON.stringify({
          t: ${Date.now()} - ${Date.now()},
          sk: !!sk, blocks: document.querySelectorAll('.sk').length,
          bar: bar ? getComputedStyle(bar).transform : null,
          nav: !!nav, modal: !!modal,
          sweep: st ? st.transform : null,
          sweepDur: st ? st.animationDuration : null,
          sweepTiming: st ? st.animationTimingFunction : null,
          sweepCount: st ? st.animationIterationCount : null
        });
      })()
    `);
    if (typeof s === 'string' && s.startsWith('{')) samples.push(JSON.parse(s));
    if (!skShot && s && s.includes('"sk":true')) skShot = await cdpShot(win, 'load-anim-02-main-skeleton.png');
    if (s && s.includes('"nav":true')) break;
    await wait(30);
  }
  console.log('main-load-samples:', JSON.stringify(samples.slice(0, 14), null, 0));
  console.log('main-skeleton-shot:', skShot);
  console.log('ui-after-ms:', Date.now() - tSubmit);

  const tEntry = Date.now();
  await wait(100);
  const cardsA = JSON.parse(await js(`
    (() => {
      const cards = [...document.querySelectorAll('.card, .stat-card')];
      const c0 = cards[0], c1 = cards[1], c2 = cards[2], c3 = cards[3];
      const s0 = getComputedStyle(c0);
      return JSON.stringify({
        n: cards.length,
        reveal: document.querySelectorAll('.reveal').length,
        c0: { dur: s0.animationDuration, delay: s0.animationDelay, filter: s0.filter, opacity: s0.opacity, i: c0.style.getPropertyValue('--reveal-i') },
        c1delay: getComputedStyle(c1).animationDelay,
        c2delay: getComputedStyle(c2).animationDelay,
        c3delay: getComputedStyle(c3).animationDelay,
        nums: [...document.querySelectorAll('.roll-num')].map((n) => n.textContent)
      });
    })()
  `));
  console.log('cards@100ms:', JSON.stringify(cardsA));

  /* 弹窗：主界面先出现，再延迟 ~1.1s 弹出 */
  const promptAt = [];
  for (let i = 0; i < 60; i += 1) {
    const m = await js(`(() => { const el = document.querySelector('.modal'); return el ? el.textContent.replace(/\\s+/g, ' ').slice(0, 40) : 'none'; })()`);
    if (m !== 'none') { promptAt.push({ at: Date.now() - tEntry, text: m }); break; }
    await wait(50);
  }
  await wait(450);
  console.log('op-prompt:', JSON.stringify(promptAt));
  console.log('op-prompt-shot:', await cdpShot(win, 'load-anim-03-op-prompt.png'));
  console.log('dash-before-seed-shot:', await cdpShot(win, 'load-anim-04-dashboard.png'));

  /* 关掉提醒，种两条真实数据，供数字滚动验证 */
  await js(`
    (() => { const b = [...document.querySelectorAll('.modal .btn')].find((x) => x.textContent.includes('稍后再说')); if (b) b.click(); return 'ok'; })()
  `);
  await wait(300);
  const seed = await js(`
    (async () => {
      const a = await window.api.customers.create({ name: '张三', class_name: '一班' });
      const b = await window.api.customers.create({ name: '李四', class_name: '二班' });
      const ids = [a, b].filter((r) => r && r.ok).map((r) => r.data.id);
      for (const id of ids) await window.api.tx.consume(id, 1234, '验收数据');
      const st = await window.api.stats();
      return JSON.stringify({ ids: ids.length, today: st.data && st.data.today_amount_cents, pts: st.data && st.data.today_points, customers: st.data && st.data.customers });
    })()
  `);
  console.log('seed:', seed);

  /* ============ B. 退出登录 → 登录骨架屏 ============ */
  const tLogout = Date.now();
  await js(`
    (() => { const b = [...document.querySelectorAll('.sidebar .btn-ghost')].find((x) => x.textContent.includes('退出登录')); if (b) b.click(); return 'ok'; })()
  `);
  await wait(40);
  const loginSkSample = [];
  let loginShot = '';
  for (let i = 0; i < 30; i += 1) {
    const s = await js(`
      (() => {
        const sk = document.querySelector('.sk-scope');
        if (!sk) return 'none';
        const bar = document.querySelector('.sk-progress i');
        const shine = document.querySelector('.sk-shine');
        const st = getComputedStyle(shine, '::before');
        return JSON.stringify({
          blocks: document.querySelectorAll('.sk').length,
          card: !!document.querySelector('.login-card.sk-card'),
          bar: getComputedStyle(bar).transform,
          sweep: st.transform, dur: st.animationDuration, timing: st.animationTimingFunction, count: st.animationIterationCount
        });
      })()
    `);
    if (s !== 'none') {
      loginSkSample.push(JSON.parse(s));
      if (!loginShot && loginSkSample.length >= 3) loginShot = await cdpShot(win, 'load-anim-05-login-skeleton.png');
    } else if (loginSkSample.length) break;
    await wait(30);
  }
  console.log('login-skeleton-samples:', JSON.stringify(loginSkSample.slice(0, 6)));
  console.log('login-skeleton-shot:', loginShot);
  console.log('login-form-after-ms:', Date.now() - tLogout);
  await wait(900);
  console.log('login-shot:', await cdpShot(win, 'load-anim-06-login.png'));

  /* ============ C. 登录 → 主界面骨架 + 进度 + 数字滚动 ============ */
  await js(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.includes('进入系统')).click();
      return 'ok';
    })()
  `);
  const tLogin = Date.now();
  const mainSamples = [];
  let mainShot = '';
  let navAt = -1;
  for (let i = 0; i < 60; i += 1) {
    const s = await js(`
      (() => {
        const sk = document.querySelector('.sk-scope');
        const bar = document.querySelector('.sk-progress i');
        return JSON.stringify({
          sk: !!sk,
          bar: bar ? getComputedStyle(bar).transform : null,
          nav: !!document.querySelector('.nav-item')
        });
      })()
    `);
    if (s && s.startsWith('{')) {
      const o = JSON.parse(s);
      o.at = Date.now() - tLogin;
      mainSamples.push(o);
      if (o.nav && navAt < 0) navAt = o.at;
      if (!mainShot && o.sk) mainShot = await cdpShot(win, 'load-anim-07-main-skeleton.png');
      if (o.nav) break;
    }
    await wait(40);
  }
  console.log('main-skeleton-samples:', JSON.stringify(mainSamples.slice(0, 12)));
  console.log('main-nav-at-ms:', navAt, 'skeleton-shot:', mainShot);

  /* 卡片的模糊入场 */
  await wait(90);
  const cardsB = JSON.parse(await js(`
    (() => {
      const cards = [...document.querySelectorAll('.card, .stat-card')];
      const s0 = getComputedStyle(cards[0]);
      return JSON.stringify({
        n: cards.length, reveal: document.querySelectorAll('.reveal').length,
        c0: { dur: s0.animationDuration, delay: s0.animationDelay, filter: s0.filter, opacity: s0.opacity },
        delays: cards.map((c) => getComputedStyle(c).animationDelay)
      });
    })()
  `));
  console.log('cards@90ms:', JSON.stringify(cardsB));

  const numSamples = [];
  for (let i = 0; i < 14; i += 1) {
    const nums = await js(`(() => JSON.stringify([...document.querySelectorAll('.stat-value .roll-num, .side-stat strong .roll-num')].map((n) => n.textContent)))()`);
    numSamples.push({ at: Date.now() - tLogin, nums: JSON.parse(nums || '[]') });
    await wait(80);
  }
  console.log('num-roll-samples:', JSON.stringify(numSamples.slice(0, 4)), '...', JSON.stringify(numSamples.slice(-2)));
  console.log('dash-after-ms:', Date.now() - tLogin);
  console.log('dashboard-shot:', await cdpShot(win, 'load-anim-08-dashboard.png'));
  const cardsDone = JSON.parse(await js(`
    (() => { const s = getComputedStyle(document.querySelector('.card')); return JSON.stringify({ filter: s.filter, opacity: s.opacity }); })()
  `));
  console.log('cards-final:', JSON.stringify(cardsDone));

  /* ============ D. 简洁版：所有新动效应自动失效 ============ */
  await js(`(async () => { const r = await window.api.settings.update({ ui_mode: 'lite', liquid_glass: false }); return JSON.stringify({ ok: r.ok }); })()`);
  const tLite = Date.now();
  await js(`(() => { const b = [...document.querySelectorAll('.sidebar .btn-ghost')].find((x) => x.textContent.includes('退出登录')); if (b) b.click(); return 'ok'; })()`);
  let lite = null;
  for (let i = 0; i < 12; i += 1) {
    const s = await js(`
      (() => {
        const sk = document.querySelector('.sk-scope');
        if (!sk) return 'none';
        const st = getComputedStyle(document.querySelector('.sk-shine'), '::before');
        return JSON.stringify({ dur: st.animationDuration, name: st.animationName, count: st.animationIterationCount });
      })()
    `);
    if (s !== 'none') { lite = s; break; }
    await wait(40);
  }
  console.log('lite-skeleton:', lite, 'after-ms:', Date.now() - tLite);
  console.log('lite-login-shot:', await cdpShot(win, 'load-anim-09-lite-login.png'));

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
