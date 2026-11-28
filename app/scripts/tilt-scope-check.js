'use strict';
/* 验证 v1.2.0 倾斜范围：只有工作台的卡片跟随指针倾斜；
   客户管理 / 记录 / 设置 等页面的卡片、左侧菜单、设置二级栏目一律不倾斜（光斑与边框提亮仍保留）。 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');

app.setName('pm-tilt-scope');
app.setPath('userData', path.join(os.tmpdir(), 'pm-tiltscope-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);
  const js = (code) => win.webContents.executeJavaScript(code).catch((e) => 'ERR:' + e.message);
  const until = async (expr, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await js(`!!(${expr})`)) return true;
      await wait(200);
    }
    console.log('timeout ' + expr); return false;
  };

  await js(`(async () => { await window.api.setup('pass123','','管理员'); await window.api.acceptTerms(new Date().toISOString()); return true; })()`);
  win.reload();
  await until(`document.querySelector('.login-card input')`);
  await wait(300);
  /* 登录卡单独测一次（登录后它就不在了） */
  const loginTilt = await (async () => {
    const r = JSON.parse(await js(`
      (() => { const b = document.querySelector('.login-card').getBoundingClientRect();
        return JSON.stringify([Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]); })()
    `));
    await js(`
      (() => {
        const el = document.querySelector('.login-card'); const b = el.getBoundingClientRect();
        const x = b.left + b.width * .9, y = b.top + b.height * .5;
        el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
        el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x + 1, clientY: y + 1 }));
      })()
    `);
    await wait(280);
    return JSON.parse(await js(`
      (() => { const el = document.querySelector('.login-card');
        return JSON.stringify({ tx: el.style.getPropertyValue('--tx'), ty: el.style.getPropertyValue('--ty'), hot: el.classList.contains('is-hot') }); })()
    `));
  })();
  await js(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
    })()
  `);
  await until(`document.querySelector('.nav-pill')`);
  await wait(900);

  const hover = async (sel, fx = 0.92, fy = 0.5) => {
    const r = JSON.parse(await js(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null';
        const b = el.getBoundingClientRect();
        return JSON.stringify([Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]); })()
    `));
    if (!r || r === 'null') return null;
    if (!r.length) return null;
    const [L, T, W, H] = r;
    /* 用合成 pointermove 打到元素本体（真实 mouseMove 会被窗口拖动区吞掉，也不稳定） */
    await js(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        const b = el.getBoundingClientRect();
        const x = b.left + b.width * ${fx}, y = b.top + b.height * ${fy};
        el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
        el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x + 1, clientY: y + 1 }));
      })()
    `);
    await wait(320);
    return JSON.parse(await js(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)});
        return JSON.stringify({
          tx: el.style.getPropertyValue('--tx'), ty: el.style.getPropertyValue('--ty'),
          mx: el.style.getPropertyValue('--mx'), hot: el.classList.contains('is-hot'),
          transform: getComputedStyle(el).transform.slice(0, 60),
        }); })()
    `));
  };

  const goPage = async (label) => {
    await js(`
      (() => {
        const items = [...document.querySelectorAll('.nav-item, .set-nav-item')];
        const b = items.find(x => x.textContent.replace(/\\s+/g,'').includes(${JSON.stringify(label)}));
        if (b) b.click();
      })()
    `);
    await wait(900);
  };

  const out = {};
  out.loginCard = loginTilt;
  out.dashCard = await hover('.dash .card');
  out.dashStat = await hover('.dash .stat-card');

  await goPage('顾客管理');
  out.customersCard = await hover('.content .card');
  out.customersCard2 = await hover('.content .card:nth-of-type(2)');

  await goPage('消费记录');
  out.recordsCard = await hover('.content .card.table-card');

  await goPage('导入导出');
  out.ioCard = await hover('.content .card');

  await goPage('设置');
  out.setPane = await hover('.set-pane .card');
  out.setNav = await hover('.set-nav');

  out.sidebar = await hover('.sidebar');

  console.log(JSON.stringify(out, null, 2));
  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
