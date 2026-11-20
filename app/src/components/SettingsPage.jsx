import React, { useEffect, useRef, useState } from 'react';
import { api, fmtMoney, relativeTime } from '../utils';
import { Icon, Field, Modal, Switch, PasswordInput } from '../ui';
import { ACCENT_PRESETS, DEFAULT_ACCENT, applyTheme, normalizeAccent } from '../theme';

function Section({ title, desc, icon, children, foot }) {
  return (
    <section className="card set-card">
      <div className="card-head">
        <h3><Icon name={icon} size={16} />{title}</h3>
        {desc ? <span className="card-sub">{desc}</span> : null}
      </div>
      <div className="card-body">{children}</div>
      {foot ? <div className="card-foot">{foot}</div> : null}
    </section>
  );
}

/* 设置页左侧二级栏目：所有设置项按用途归类 */
const TABS = [
  { key: 'basic', label: '基础信息', icon: 'grid', desc: '店铺名称与操作人' },
  { key: 'appearance', label: '外观与背景', icon: 'image', desc: '背景图 / 个性化配色' },
  { key: 'rules', label: '积分规则', icon: 'spark', desc: '累积与兑换比例' },
  { key: 'security', label: '安全设置', icon: 'shield', desc: '用户名 / 登录密码 / 可选二级密码' },
  { key: 'cloud', label: '云端同步', icon: 'cloud', desc: '本地优先，可随时关闭' },
  { key: 'data', label: '数据与备份', icon: 'database', desc: '单文件数据库与清空' },
];

export default function SettingsPage({ settings, call, refresh, notify, elevatedUntil, initialTab }) {
  const [tab, setTab] = useState('basic');

  // 从登录页「现在去设置」跳转进来时，直接落到安全设置
  useEffect(() => {
    if (initialTab && TABS.some((t) => t.key === initialTab)) setTab(initialTab);
  }, [initialTab]);

  const [shop, setShop] = useState('');
  const [operator, setOperator] = useState('');
  const [perYuan, setPerYuan] = useState(10);
  const [perPoints, setPerPoints] = useState(1);
  const [redeemPoints, setRedeemPoints] = useState(15);
  const [redeemYuan, setRedeemYuan] = useState(10);

  const [cloud, setCloud] = useState({
    enabled: false, provider: 'generic', endpoint: '', token: '',
    appId: '', appSecret: '', appToken: '', tableIdCustomers: '', tableIdTransactions: '',
  });
  const [cloudStatus, setCloudStatus] = useState({ pending: 0 });
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [loginUser, setLoginUser] = useState('');
  const [pwKind, setPwKind] = useState('login');
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwErr, setPwErr] = useState('');

  /* ---- 二级操作密码（默认关闭，可在这里开启 / 关闭）---- */
  const opOn = !!(settings && settings.op_required);
  const [opEnableOpen, setOpEnableOpen] = useState(false);
  const [opDisableOpen, setOpDisableOpen] = useState(false);
  const [opNew, setOpNew] = useState('');
  const [opNew2, setOpNew2] = useState('');
  const [opOld, setOpOld] = useState('');
  const [opErr, setOpErr] = useState('');

  // 操作密码被关闭后，「修改哪套密码」不能停在“操作密码”上
  useEffect(() => {
    if (!(settings && settings.op_required) && pwKind === 'op') setPwKind('login');
  }, [settings && settings.op_required, pwKind]);

  const [info, setInfo] = useState(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearWord, setClearWord] = useState('');

  /* ---- 多张背景图 ---- */
  const [bgs, setBgs] = useState([]);
  const [bgBusy, setBgBusy] = useState(false);
  const bgFileRef = useRef(null);

  /* ---- 个性化配色 ---- */
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const savedAccentRef = useRef(DEFAULT_ACCENT);

  /* ---- 界面模式（标准版 / 简洁版），即时生效，不需要操作密码 ---- */
  const [uiMode, setUiMode] = useState('standard');

  useEffect(() => {
    if (!settings) return;
    setShop(settings.shop_name || '');
    setOperator(settings.operator_name || '');
    setPerYuan((settings.points_rule?.per_amount_cents || 1000) / 100);
    setPerPoints(settings.points_rule?.points_per_unit || 1);
    setRedeemPoints(settings.redeem_rule?.points || 15);
    setRedeemYuan((settings.redeem_rule?.balance_cents || 1000) / 100);
    setLoginUser(settings.login_username || '');
    setCloud((c) => ({ ...c, ...(settings.cloud_config || {}) }));
    const list = Array.isArray(settings.login_bgs) && settings.login_bgs.length
      ? settings.login_bgs
      : (settings.login_bg ? [settings.login_bg] : []);
    setBgs(list);
    setAccent(normalizeAccent(settings.theme?.accent) || DEFAULT_ACCENT);
    savedAccentRef.current = normalizeAccent(settings.theme?.accent) || DEFAULT_ACCENT;
    setUiMode(settings.ui_mode === 'lite' ? 'lite' : 'standard');
  }, [settings]);

  async function pickUiMode(next) {
    if (next === uiMode) return;
    const r = await call(() => api.settings.setUiMode(next));
    if (!r || r.ok === false) { notify((r && r.error) || '切换失败', 'err'); return; }
    setUiMode(next);
    document.body.classList.toggle('ui-lite', next === 'lite');
    notify(next === 'lite' ? '已切换到简洁版：背景图与模糊动画已关闭' : '已切换到标准版：背景图与模糊过渡已恢复');
    refresh();
  }

  // 离开设置页时，把"只是预览、没保存"的配色还原成库里那份
  useEffect(() => () => { applyTheme({ accent: savedAccentRef.current }); }, []);

  useEffect(() => {
    api.app.info().then((r) => { if (r.ok) setInfo(r.data); });
    api.cloud.status().then((r) => { if (r.ok) setCloudStatus(r.data); });
  }, []);

  async function saveBase() {
    const r = await call(() => api.settings.save({ shop_name: shop, operator_name: operator }));
    if (!r.ok) return notify(r.error, 'err');
    notify('已保存基础信息');
    refresh();
  }

  async function saveRules() {
    const patch = {
      points_rule: {
        per_amount_cents: Math.max(1, Math.round(Number(perYuan) * 100)),
        points_per_unit: Math.max(1, Math.round(Number(perPoints))),
      },
      redeem_rule: {
        points: Math.max(1, Math.round(Number(redeemPoints))),
        balance_cents: Math.max(1, Math.round(Number(redeemYuan) * 100)),
      },
    };
    const r = await call(() => api.settings.save(patch));
    if (!r.ok) return notify(r.error, 'err');
    notify('积分规则已更新，新规则从下一笔交易生效');
    refresh();
  }

  /* ---- 多张背景图 ---- */

  // 单张图读成 data URL；超过 8K（7680×4320）先在本地等比缩下来，避免渲染卡顿
  function readImageForBg(f) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const dataUrl = String(fr.result || '');
        const img = new Image();
        img.onload = () => {
          const MAXW = 7680;
          const MAXH = 4320;
          const w = img.naturalWidth || 0;
          const h = img.naturalHeight || 0;
          const scale = Math.min(1, MAXW / (w || 1), MAXH / (h || 1));
          if (scale >= 1) { resolve(dataUrl); return; }
          const cw = Math.round(w * scale);
          const ch = Math.round(h * scale);
          const cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(cv.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = () => reject(new Error('这张图片无法解析，请换一张'));
        img.src = dataUrl;
      };
      fr.onerror = () => reject(new Error('读取图片失败'));
      fr.readAsDataURL(f);
    });
  }

  function pickOpen() {
    if (bgBusy) return;
    if (bgFileRef.current) bgFileRef.current.click();
  }

  async function pickBgs(e) {
    const files = Array.from((e.target.files || []));
    e.target.value = '';
    if (!files.length) return;
    const ok = files.filter((f) => /^image\//.test(f.type) && f.size <= 50 * 1024 * 1024);
    const bad = files.length - ok.length;
    if (!ok.length) return notify('请选择图片文件（png / jpg / webp），单张不超过 50MB', 'err');
    if (bad) notify(`已跳过 ${bad} 个文件（格式不支持或超过 50MB）`, 'err');
    setBgBusy(true);
    let added = 0;
    let list = bgs;
    for (const f of ok) {
      try {
        const dataUrl = await readImageForBg(f);
        const r = await call(() => api.settings.addLoginBg(dataUrl));
        if (!r.ok) { notify(r.error, 'err'); continue; }
        list = r.data.login_bgs || list;
        added += 1;
      } catch (err) {
        notify(err.message || '导入失败', 'err');
      }
    }
    setBgs(list);
    setBgBusy(false);
    if (added) {
      notify(`已加入 ${added} 张背景图（默认只显示第一张，可在下方开启每 8 秒自动切换）`);
      refresh();
    }
  }

  async function removeBg(url) {
    const r = await call(() => api.settings.removeLoginBg(url));
    if (!r.ok) return notify(r.error, 'err');
    setBgs(r.data.login_bgs || []);
    notify('已删除这张背景图');
    refresh();
  }

  async function clearBgs() {
    const r = await call(() => api.settings.clearLoginBg());
    if (!r.ok) return notify(r.error, 'err');
    setBgs([]);
    notify('已清空背景图，登录页与工作台恢复默认浅色底');
    refresh();
  }

  async function toggleBgRotate(v) {
    const r = await call(() => api.settings.save({ login_bg_rotate: !!v }));
    if (!r.ok) return notify(r.error, 'err');
    notify(v ? '已开启背景自动切换：每 8 秒换一张' : '已关闭自动切换：只显示第一张背景');
    refresh();
  }

  /* ---- 个性化配色 ---- */

  function previewAccent(v) {
    const a = normalizeAccent(v);
    if (!a) return;
    setAccent(a);
    applyTheme({ accent: a }); // 即时预览，未保存时不会入库
  }

  async function saveAccent() {
    const r = await call(() => api.settings.save({ theme: { accent } }));
    if (!r.ok) return notify(r.error, 'err');
    notify('配色已保存，界面主色已切换为 ' + accent);
    refresh();
  }

  async function saveCloud() {
    const r = await call(() => api.settings.save({ cloud_config: cloud }));
    if (!r.ok) return notify(r.error, 'err');
    notify(cloud.enabled ? '云同步配置已保存并启用' : '云同步已关闭（纯本地运行）');
    refresh();
  }

  async function testCloud() {
    setTesting(true);
    const r = await api.cloud.test(cloud);
    setTesting(false);
    notify(r.ok ? r.data.message : r.error, r.ok ? 'ok' : 'err');
  }

  async function syncNow() {
    setSyncing(true);
    const r = await call(() => api.cloud.sync());
    setSyncing(false);
    if (!r.ok) return notify(r.error, 'err');
    notify(r.data.message);
    const s = await api.cloud.status();
    if (s.ok) setCloudStatus(s.data);
    refresh();
  }

  async function changePw() {
    setPwErr('');
    if (pwKind === 'op' && !opOn) return setPwErr('当前未启用操作密码，请点上方「启用」先设置一个');
    if (!oldPw.trim()) return setPwErr(pwKind === 'op' ? '请输入当前操作密码' : '请输入当前登录密码');
    if (newPw.length < 4) return setPwErr('新密码至少 4 位');
    if (newPw !== newPw2) return setPwErr('两次输入不一致');
    if (newPw === oldPw) return setPwErr('新密码不能和当前密码一样');
    const r = await call(() => api.changePassword(pwKind, oldPw, newPw));
    if (!r.ok) return setPwErr(r.error);
    setOldPw(''); setNewPw(''); setNewPw2('');
    notify(pwKind === 'login' ? '登录密码已修改，下次登录请用新密码' : '操作密码已修改，下次敏感操作用新密码');
  }

  /* ---- 启用 / 关闭二级操作密码 ---- */
  async function enableOp() {
    setOpErr('');
    if (opNew.length < 4) return setOpErr('操作密码至少 4 位');
    if (opNew !== opNew2) return setOpErr('两次输入不一致');
    const r = await call(() => api.setOpPassword(opNew));
    if (!r.ok) return setOpErr(r.error);
    setOpEnableOpen(false); setOpNew(''); setOpNew2('');
    notify('操作密码已启用，敏感操作需先验证');
    refresh();
  }

  async function disableOp() {
    setOpErr('');
    if (!opOld.trim()) return setOpErr('请输入当前操作密码');
    const r = await call(() => api.disableOp(opOld));
    if (!r.ok) return setOpErr(r.error);
    setOpDisableOpen(false); setOpOld('');
    notify('操作密码已关闭，敏感操作不再需要二次验证');
    refresh();
  }

  async function saveUsername() {
    const n = loginUser.trim();
    if (!n) return notify('用户名不能为空', 'err');
    const r = await call(() => api.setUsername(n));
    if (!r.ok) return notify(r.error, 'err');
    setLoginUser(r.data);
    notify('登录用户名已改为「' + r.data + '」，下次登录生效');
    refresh();
  }

  async function doClear() {
    const r = await call(() => api.settings.clearData());
    if (!r.ok) return notify(r.error, 'err');
    setClearOpen(false);
    setClearWord('');
    notify('已清空全部数据');
    refresh();
  }

  const cloudCfg = settings?.cloud_config || {};
  const elevatedLeft = Math.max(0, Math.floor((elevatedUntil - Date.now()) / 1000));
  const savedAccent = normalizeAccent(settings?.theme?.accent) || DEFAULT_ACCENT;

  return (
    <div className="set-layout">
      <aside className="set-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={'set-nav-item' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={16} />
            <span className="set-nav-txt">
              <strong>{t.label}</strong>
              <small>{t.desc}</small>
            </span>
          </button>
        ))}
      </aside>

      {/* key={tab}：切换栏目时整块重挂载，触发高斯模糊淡入 */}
      <div className="set-pane page-fade" key={tab}>
        {tab === 'basic' ? (
          <Section title="基础信息" icon="grid" desc="显示在登录页与侧边栏">
            <div className="form-grid">
              <Field label="店铺 / 机构名称"><input className="input" value={shop} onChange={(e) => setShop(e.target.value)} /></Field>
              <Field label="操作人名称" hint="写入每一笔记录，便于对账追溯">
                <input className="input" value={operator} onChange={(e) => setOperator(e.target.value)} />
              </Field>
            </div>
            <div className="set-actions"><button className="btn btn-primary" onClick={saveBase}>保存</button></div>
          </Section>
        ) : null}

        {tab === 'appearance' ? (
          <>
            <Section title="界面模式" icon="spark" desc="标准版功能全，简洁版更快">
              <div className="ui-mode-row">
                <button
                  type="button"
                  className={'ui-mode-card' + (uiMode === 'standard' ? ' active' : '')}
                  onClick={() => pickUiMode('standard')}
                >
                  <strong>标准版</strong>
                  <span>背景图 + 高斯模糊过渡，界面质感最好（默认）</span>
                </button>
                <button
                  type="button"
                  className={'ui-mode-card' + (uiMode === 'lite' ? ' active' : '')}
                  onClick={() => pickUiMode('lite')}
                >
                  <strong>简洁版</strong>
                  <span>关闭背景图、模糊与动画，界面纯色简洁，低配电脑更流畅</span>
                </button>
              </div>
              <p className="io-note">
                切换立即生效、自动保存，不需要操作密码。简洁版下背景图设置会保留但暂不显示，切回标准版即恢复。
              </p>
            </Section>

            <Section title="背景图" icon="image" desc="登录页与工作台共用，默认只显示第一张">
              {uiMode === 'lite' ? (
                <p className="io-note warn">当前是简洁版，背景图不加载、不显示。切到标准版即可恢复。</p>
              ) : null}
              <input
                ref={bgFileRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={pickBgs}
              />
              <div className="bg-multi">
                {bgs.map((u, i) => (
                  <div className="bg-thumb" key={u}>
                    <div className="bg-thumb-img" style={{ backgroundImage: `url("${u}")` }} />
                    <div className="bg-thumb-bar">
                      <span className="bg-thumb-idx">{i + 1}</span>
                      <button
                        type="button"
                        className="icon-btn bg-thumb-del"
                        title="删除这张"
                        onClick={() => removeBg(u)}
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="bg-add" onClick={pickOpen} disabled={bgBusy}>
                  <Icon name="upload" size={20} />
                  <span>{bgBusy ? '导入中…' : '导入图片'}</span>
                  <small>可一次选多张</small>
                </button>
              </div>
              <div className="set-actions">
                <span className="field-hint">已添加 {bgs.length} 张{bgs.length > 1 ? '，按顺序排列' : ''}</span>
                {bgs.length ? <button className="btn btn-ghost" type="button" onClick={clearBgs}>清空全部</button> : null}
              </div>

              <div className="cloud-head" style={{ marginTop: 10 }}>
                <Switch checked={!!settings.login_bg_rotate} onChange={toggleBgRotate} />
                <div>
                  <strong>每 8 秒自动切换背景</strong>
                  <p className="field-hint">默认关闭，只显示第一张。打开后登录页与进入系统后的界面都会依次轮换（带高斯模糊过渡）。</p>
                </div>
              </div>

              <p className="io-note">
                单张支持到 8K（7680×4320）、不超过 50MB；png / jpg / webp。导入即保存，超过 8K 的图会自动等比缩到 8K 以内。
                背景原样铺满、不加蒙版；切换时新图从"高斯模糊"渐变到清晰。
              </p>
            </Section>

            <Section title="个性化配色" icon="spark" desc="改变按钮、选中项与侧栏主色">
              <div className="theme-block">
                <div className="theme-swatches">
                  {ACCENT_PRESETS.map((p) => (
                    <button
                      key={p.accent}
                      type="button"
                      className={'theme-swatch' + (accent === p.accent ? ' active' : '')}
                      title={p.name + ' ' + p.accent}
                      onClick={() => previewAccent(p.accent)}
                    >
                      <span className="theme-dot" style={{ background: p.accent }} />
                      <span className="theme-name">{p.name}</span>
                    </button>
                  ))}
                </div>
                <div className="theme-custom">
                  <label className="theme-custom-label" htmlFor="theme-color-input">自选颜色</label>
                  <input
                    id="theme-color-input"
                    className="theme-color"
                    type="color"
                    value={accent}
                    onChange={(e) => previewAccent(e.target.value)}
                  />
                  <span className="mono small">{accent}</span>
                  <button className="btn btn-primary" type="button" onClick={saveAccent} disabled={accent === savedAccent}>保存配色</button>
                  <button className="btn btn-ghost" type="button" onClick={() => previewAccent(DEFAULT_ACCENT)}>恢复默认</button>
                  {accent !== savedAccent ? <span className="warn small">尚未保存（仅预览）</span> : null}
                </div>
                <div className="theme-preview">
                  <button className="btn btn-primary" type="button" disabled>主色按钮</button>
                  <span className="chip chip-accent"><Icon name="shield" size={13} />强调标签</span>
                  <span className="theme-sample">配色会同步到登录页与主界面，重开程序后保持。</span>
                </div>
              </div>
            </Section>
          </>
        ) : null}

        {tab === 'rules' ? (
          <Section title="积分规则" icon="spark" desc="修改后对新交易生效，历史记录不变">
            <div className="rule-editor">
              <div className="rule-line">
                <span>每消费</span>
                <input className="input input-mini" value={perYuan} onChange={(e) => setPerYuan(e.target.value)} />
                <span>元，积</span>
                <input className="input input-mini" value={perPoints} onChange={(e) => setPerPoints(e.target.value)} />
                <span>分</span>
              </div>
              <div className="rule-line">
                <span>每</span>
                <input className="input input-mini" value={redeemPoints} onChange={(e) => setRedeemPoints(e.target.value)} />
                <span>分，兑换</span>
                <input className="input input-mini" value={redeemYuan} onChange={(e) => setRedeemYuan(e.target.value)} />
                <span>元余额</span>
              </div>
            </div>
            <div className="calc-strip">
              <span>试算：消费 88 元</span>
              <strong className="ok">+{Math.floor(88 / Math.max(1, Number(perYuan))) * Math.max(1, Number(perPoints))} 分</strong>
              <span>· 120 分可兑换 {fmtMoney(Math.floor(120 / Math.max(1, Number(redeemPoints))) * Math.max(1, Number(redeemYuan)) * 100)}</span>
            </div>
            <div className="set-actions"><button className="btn btn-primary" onClick={saveRules}>保存规则</button></div>
          </Section>
        ) : null}

        {tab === 'cloud' ? (
          <Section title="云端同步" icon="cloud" desc="本地优先：关闭时完全不联网">
            <div className="cloud-head">
              <Switch checked={!!cloud.enabled} onChange={(v) => setCloud({ ...cloud, enabled: v })} />
              <div>
                <strong>{cloud.enabled ? '已开启' : '仅本地'}</strong>
                <p className="field-hint">
                  {cloud.enabled
                    ? `待推送 ${cloudStatus.pending ?? 0} 条 · 上次同步 ${relativeTime(cloudCfg.lastSyncAt)}`
                    : '数据保存在本机，不产生任何网络请求'}
                </p>
              </div>
            </div>

            <div className="form-grid">
              <Field label="云端类型">
                <select className="select" value={cloud.provider || 'generic'} onChange={(e) => setCloud({ ...cloud, provider: e.target.value })}>
                  <option value="generic">自有 HTTP 接口 / Webhook</option>
                  <option value="feishu">飞书多维表格</option>
                </select>
              </Field>
              {cloud.provider === 'feishu' ? (
                <>
                  <Field label="App ID"><input className="input" value={cloud.appId || ''} onChange={(e) => setCloud({ ...cloud, appId: e.target.value })} placeholder="cli_xxx" /></Field>
                  <Field label="App Secret"><input className="input" type="password" value={cloud.appSecret || ''} onChange={(e) => setCloud({ ...cloud, appSecret: e.target.value })} /></Field>
                  <Field label="多维表格 app_token" hint="表格链接 /base/ 后面那一段"><input className="input" value={cloud.appToken || ''} onChange={(e) => setCloud({ ...cloud, appToken: e.target.value })} placeholder="bascnxxx" /></Field>
                  <Field label="顾客表 table_id"><input className="input" value={cloud.tableIdCustomers || ''} onChange={(e) => setCloud({ ...cloud, tableIdCustomers: e.target.value })} placeholder="tblxxx" /></Field>
                  <Field label="消费记录表 table_id"><input className="input" value={cloud.tableIdTransactions || ''} onChange={(e) => setCloud({ ...cloud, tableIdTransactions: e.target.value })} placeholder="tblxxx" /></Field>
                </>
              ) : (
                <>
                  <Field label="接口地址" hint="接收 POST JSON 的地址，如 https://你的服务/api/points-sync">
                    <input className="input" value={cloud.endpoint || ''} onChange={(e) => setCloud({ ...cloud, endpoint: e.target.value })} placeholder="https://" />
                  </Field>
                  <Field label="访问令牌（可选）" hint="以 Authorization: Bearer 形式发送">
                    <input className="input" type="password" value={cloud.token || ''} onChange={(e) => setCloud({ ...cloud, token: e.target.value })} />
                  </Field>
                </>
              )}
            </div>

            <p className="io-note">
              推送内容为增量队列（新增/变更的顾客与交易记录）。接口需返回 2xx；失败会保留在队列里自动重试，不影响本地使用。
            </p>

            <div className="set-actions">
              <button className="btn btn-primary" onClick={saveCloud}>保存配置</button>
              <button className="btn btn-ghost" onClick={testCloud} disabled={testing || !cloud.enabled}>{testing ? '测试中…' : '测试连接'}</button>
              <button className="btn btn-ghost" onClick={syncNow} disabled={syncing || !cloud.enabled}>
                <Icon name="refresh" size={15} />{syncing ? '同步中…' : '立即同步'}
              </button>
              {cloudCfg.lastError ? <span className="warn small">上次失败：{cloudCfg.lastError}</span> : null}
            </div>
          </Section>
        ) : null}

        {tab === 'security' ? (
          <Section title="安全设置" icon="shield" desc="登录密码进门；操作密码可选，默认关闭">
            <div className="form-grid">
              <Field
                label="二级操作密码（可选）"
                hint="默认关闭。开启后，消费、兑换、导入、修改设置等敏感操作在每次登录后只需验证一次；之后连续 5 分钟内有操作就一直免验证，超过 5 分钟没操作才需要重输（手动调整积分每次都要输入）。"
              >
                <div className="field-inline">
                  <span className="field-hint">{opOn ? '已启用：敏感操作需二次验证' : '未启用：仅用登录密码保护'}</span>
                  {opOn ? (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => { setOpOld(''); setOpErr(''); setOpDisableOpen(true); }}
                    >关闭</button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => { setOpNew(''); setOpNew2(''); setOpErr(''); setOpEnableOpen(true); }}
                    >启用</button>
                  )}
                </div>
              </Field>
            </div>
            <div className="form-grid">
              <Field label="登录用户名" hint="登录时需与此一致，最多 20 个字符">
                <div className="field-inline">
                  <input className="input" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="如：管理员" />
                  <button className="btn btn-ghost" onClick={saveUsername} type="button">保存</button>
                </div>
              </Field>
            </div>
            <div className="form-grid">
              <Field label="修改哪套密码">
                <select
                  className="select"
                  value={pwKind}
                  onChange={(e) => { setPwKind(e.target.value); setOldPw(''); setPwErr(''); }}
                >
                  <option value="login">登录密码</option>
                  {opOn ? <option value="op">操作密码</option> : null}
                </select>
              </Field>
              <Field label={pwKind === 'op' ? '当前操作密码' : '当前登录密码'} hint={pwKind === 'op' ? '改完立即生效，下次敏感操作要用新密码' : '改完立即生效，下次登录要用新密码'}>
                <PasswordInput value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder={pwKind === 'op' ? '请输入当前操作密码' : '请输入当前登录密码'} className="input" />
              </Field>
              <Field label="新密码" hint="至少 4 位">
                <PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="输入新密码" className="input" />
              </Field>
              <Field label="确认新密码">
                <PasswordInput value={newPw2} onChange={(e) => setNewPw2(e.target.value)} placeholder="再输一次新密码" className="input" />
              </Field>
            </div>
            {pwErr ? <div className="err"><Icon name="alert" size={14} />{pwErr}</div> : null}
            <div className="set-actions">
              <button className="btn btn-primary" onClick={changePw}>修改密码</button>
              <span className="field-hint" style={{ marginLeft: 12 }}>
                {pwKind === 'op'
                  ? '改操作密码：需要输入当前操作密码，不需要先做操作授权'
                  : '改登录密码：需要输入当前登录密码，下次登录生效'}
              </span>
            </div>
            {elevatedLeft > 0 ? (
              <p className="io-note">当前已开启操作授权，剩余 {Math.floor(elevatedLeft / 60)} 分 {elevatedLeft % 60} 秒。</p>
            ) : opOn ? (
              <p className="io-note">操作授权未开启：敏感操作会临时弹出操作密码校验。</p>
            ) : (
              <p className="io-note">当前未启用操作密码：敏感操作只校验登录状态，不会二次验证。</p>
            )}
          </Section>
        ) : null}

        {tab === 'data' ? (
          <Section title="数据与备份" icon="database" desc="SQLite 单文件，可复制、可恢复">
            <div className="db-path">
              <Icon name="database" size={15} />
              <span className="mono">{info?.dbPath || '读取中…'}</span>
            </div>
            <div className="set-actions">
              <button className="btn btn-ghost" onClick={async () => {
                const r = await call(() => api.app.backup());
                if (!r.ok) return notify(r.error, 'err');
                if (!r.data.canceled) notify('已备份数据库文件');
              }}>备份到文件</button>
              <button className="btn btn-ghost" onClick={async () => {
                const r = await call(() => api.app.restore());
                if (!r.ok) return notify(r.error, 'err');
                if (r.data.canceled) return;
                notify('已从备份恢复，数据已刷新');
                refresh();
              }}>从备份恢复</button>
              <button className="btn btn-ghost" onClick={async () => {
                const r = await call(() => api.app.openDataDir());
                if (!r.ok) return notify(r.error, 'err');
              }}>打开数据目录</button>
              <button className="btn btn-danger-ghost" onClick={() => setClearOpen(true)}>清空全部数据</button>
            </div>
          </Section>
        ) : null}
      </div>

      <Modal open={clearOpen} title="清空全部数据" subtitle="此操作不可撤销" onClose={() => setClearOpen(false)}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setClearOpen(false)}>取消</button>
            <button className="btn btn-danger" disabled={clearWord !== '清空'} onClick={doClear}>确认清空</button>
          </>
        )}>
        <p className="confirm-text">将删除所有顾客档案与交易记录（密码与云端配置保留）。建议先「备份到文件」。</p>
        <Field label="请输入「清空」以确认">
          <input className="input" value={clearWord} onChange={(e) => setClearWord(e.target.value)} placeholder="清空" />
        </Field>
      </Modal>
      {/* 启用二级操作密码 */}
      <Modal
        open={opEnableOpen}
        title="启用二级操作密码"
        subtitle="开启后每次登录验证一次，之后 5 分钟内有操作即持续有效"
        onClose={() => setOpEnableOpen(false)}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setOpEnableOpen(false)} type="button">取消</button>
            <button className="btn btn-primary" onClick={enableOp} type="button">启用</button>
          </>
        )}
      >
        <Field label="设置操作密码" hint="至少 4 位，不能与登录密码相同">
          <PasswordInput value={opNew} onChange={(e) => setOpNew(e.target.value)} placeholder="输入操作密码" className="input" />
        </Field>
        <Field label="确认操作密码">
          <PasswordInput value={opNew2} onChange={(e) => setOpNew2(e.target.value)} placeholder="再输入一次" className="input" />
        </Field>
        {opErr ? <div className="err"><Icon name="alert" size={14} />{opErr}</div> : null}
      </Modal>

      {/* 关闭二级操作密码：必须验证当前操作密码 */}
      <Modal
        open={opDisableOpen}
        title="关闭二级操作密码"
        subtitle="关闭后敏感操作不再需要二次验证"
        onClose={() => setOpDisableOpen(false)}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setOpDisableOpen(false)} type="button">取消</button>
            <button className="btn btn-danger" onClick={disableOp} type="button">确认关闭</button>
          </>
        )}
      >
        <p className="confirm-text">关闭后，消费、兑换、导入、改设置等操作只校验登录状态。之后可随时在这里重新启用。</p>
        <Field label="当前操作密码">
          <PasswordInput value={opOld} onChange={(e) => setOpOld(e.target.value)} placeholder="请输入当前操作密码" className="input" />
        </Field>
        {opErr ? <div className="err"><Icon name="alert" size={14} />{opErr}</div> : null}
      </Modal>
    </div>
  );
}
