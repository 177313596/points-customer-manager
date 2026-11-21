import React, { useEffect, useState } from 'react';
import { api } from '../utils';
import { Icon, PasswordInput, Modal, Spotlight } from '../ui';
import TermsGate, { TermsBody } from './TermsGate';
import { applyTheme } from '../theme';
import brandLogo from '../assets/brand-logo.png';

const BG_ROTATE_MS = 8000; // 多张背景图轮播间隔

export default function Login({ onAuthed }) {
  const [mode, setMode] = useState('loading');
  const [shopName, setShopName] = useState('积分客户管理系统');
  const [storedUser, setStoredUser] = useState('');
  const [version, setVersion] = useState('');
  const [uname, setUname] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [setupDone, setSetupDone] = useState(false); // 初始化完成 → 弹窗提醒可设二级密码
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginBgs, setLoginBgs] = useState([]);   // 背景图列表（可多张，默认只显示第一张）
  const [bgRotate, setBgRotate] = useState(false); // 是否每 8 秒自动切换（设置里控制，默认关）
  const [bgIdx, setBgIdx] = useState(0);
  const [prevBg, setPrevBg] = useState('');       // 上一张，垫在新图下面做模糊过渡
  const [termsAccepted, setTermsAccepted] = useState(''); // '' = 尚未同意，需要先同意声明
  const [showTerms, setShowTerms] = useState(false);      // 仅是"查看声明"，不要求同意

  useEffect(() => {
    api.status().then((r) => {
      if (r.ok) {
        setShopName(r.data.shop_name || '积分客户管理系统');
        setVersion(r.data.version || '');
        setStoredUser(r.data.username || '');
        // 简洁版：登录页也不加载背景图（设置里改了模式后重开或退出登录即生效）
        const liteMode = r.data.ui_mode === 'lite';
        const list = liteMode ? [] : (Array.isArray(r.data.login_bgs) && r.data.login_bgs.length
          ? r.data.login_bgs
          : (r.data.login_bg ? [r.data.login_bg] : []));
        setLoginBgs(list);
        setBgIdx(0);
        setBgRotate(!liteMode && r.data.login_bg_rotate === true);
        document.body.classList.toggle('ui-lite', liteMode);
        applyTheme(r.data.theme);
        setTermsAccepted(r.data.terms_accepted || '');
        setMode(r.data.hasPassword ? 'login' : 'setup');
      } else {
        setErr(r.error);
        setMode('login');
      }
    });
  }, []);

  // 多张背景图：仅在设置里打开"自动切换"时才按固定间隔轮换，切换时新图用"高斯模糊 → 清晰"淡入
  useEffect(() => {
    if (!bgRotate || loginBgs.length < 2) return;
    const t = setInterval(() => {
      setBgIdx((i) => {
        const next = (i + 1) % loginBgs.length;
        setPrevBg(loginBgs[i] || '');
        return next;
      });
    }, BG_ROTATE_MS);
    return () => clearInterval(t);
  }, [loginBgs, bgRotate]);


  async function doLogin(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!loginUser.trim()) return setErr('请输入用户名');
    setBusy(true);
    const r = await api.login(loginUser.trim(), pw);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onAuthed();
  }

  async function doSetup(e) {
    e.preventDefault();
    setErr('');
    if (!uname.trim()) return setErr('请设置用户名');
    if (uname.trim().length > 20) return setErr('用户名最多 20 个字符');
    if (pw.length < 4) return setErr('登录密码至少 4 位');
    if (pw !== pw2) return setErr('两次输入的登录密码不一致');
    setBusy(true);
    // 二级操作密码不再在注册时必填：默认关闭，可在设置 → 安全设置里开启
    const r = await api.setup(pw, '', uname.trim());
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setSetupDone(true);
  }

  function finishSetup(withOp) {
    setSetupDone(false);
    if (withOp) onAuthed({ page: 'settings', tab: 'security' });
    else onAuthed();
  }

  return (
    <div className="login-wrap">
      <aside className="login-brand">
        <img className="brand-logo lg" src={brandLogo} alt="积分客户管理系统" draggable={false} />
        <h1>积分客户管理</h1>
        <p className="brand-sub">本地数据 · 秒级记录 · 云端可达</p>
        <ul className="brand-list">
          <li><Icon name="check" size={15} />每满 10 元自动积 1 分</li>
          <li><Icon name="check" size={15} />15 分兑换 10 元余额</li>
          <li><Icon name="check" size={15} />Excel / CSV 批量进出</li>
          <li><Icon name="check" size={15} />双重密码保护</li>
        </ul>
        <div className="brand-foot">数据仅保存在本机，未启用云同步时不联网</div>
      </aside>

      <main className={'login-main' + (loginBgs.length ? ' has-bg' : '')}>
        {loginBgs.length ? (
          <div className="login-bg-stack" aria-hidden="true">
            {prevBg ? <div className="login-bg-layer under" style={{ backgroundImage: `url("${prevBg}")` }} /> : null}
            <div
              key={loginBgs[bgIdx]}
              className="login-bg-layer"
              style={{ backgroundImage: `url("${loginBgs[bgIdx]}")` }}
            />
          </div>
        ) : null}
        <Spotlight />
        {mode === 'loading' ? (
          <div className="login-card"><div className="loading-dot" /></div>
        ) : mode === 'setup' ? (
          <form className="login-card" onSubmit={doSetup}>
            <span className="pill">首次使用 · 初始化</span>
            <h2>设置用户名与登录密码</h2>
            <p className="login-hint">用户名用于登录识别；登录密码用于进入系统。二级操作密码默认关闭，可在「设置 → 安全设置」里随时开启。</p>

            <label className="field-label">用户名</label>
            <input className="input" type="text" value={uname} onChange={(e) => setUname(e.target.value)} placeholder="如：管理员" autoFocus />

            <label className="field-label">登录密码</label>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="至少 4 位" className="input" />
            <label className="field-label">确认登录密码</label>
            <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再输入一次" className="input" />

            {err ? <div className="err"><Icon name="alert" size={14} />{err}</div> : null}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '创建中…' : '完成初始化并进入'}</button>
          </form>
        ) : (
          <form className="login-card" onSubmit={doLogin}>
            <span className="pill">安全登录</span>
            <h2>{shopName}</h2>
            <p className="login-hint">请输入用户名与登录密码以进入系统</p>
            <label className="field-label">用户名</label>
            <input
              className="input input-lg"
              type="text"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              placeholder={storedUser ? `如 ${storedUser}` : '请输入用户名'}
              autoFocus
            />
            <label className="field-label">登录密码</label>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="登录密码" />
            {err ? <div className="err"><Icon name="alert" size={14} />{err}</div> : null}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '验证中…' : '进入系统'}</button>
          </form>
        )}
        {version ? <div className="login-version">v{version}</div> : null}
        <button type="button" className="login-terms-link" onClick={() => setShowTerms(true)}>
          <Icon name="shield" size={13} />《使用声明》
        </button>
      </main>

      {mode !== 'loading' && !termsAccepted ? (
        <TermsGate onAccepted={(v) => { setTermsAccepted(v || 'ok'); }} />
      ) : null}

      {/* 初始化完成后的提醒：二级操作密码是可选项，随时可在设置里开启 */}
      <Modal
        open={setupDone}
        title="初始化完成"
        subtitle="二级操作密码（可选 · 默认关闭）"
        onClose={() => finishSetup(false)}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => finishSetup(false)} type="button">稍后再说</button>
            <button className="btn btn-primary" onClick={() => finishSetup(true)} type="button">现在去设置</button>
          </>
        )}
      >
        <p className="io-note" style={{ marginTop: 0 }}>系统已创建完成，现在只用登录密码即可进入。</p>
        <p className="io-note">
          如需给消费、兑换、导入、修改设置等敏感操作再加一道验证，可前往「设置 → 安全设置」开启二级操作密码。
          开启后每次登录只需验证一次；之后连续 5 分钟内有操作就一直免验证，超过 5 分钟没操作才会重新要求输入（手动调整积分每次都需输入）。
        </p>
      </Modal>

      {showTerms ? (
        <div className="terms-gate" onClick={() => setShowTerms(false)}>
          <div className="terms-card" onClick={(e) => e.stopPropagation()}>
            <div className="terms-head">
              <Icon name="shield" size={18} />
              <div>
                <h3>积分客户管理系统 使用声明</h3>
                <p className="terms-sub">仅供查阅；功能与规则以软件内最新版本为准。</p>
              </div>
            </div>
            <TermsBody />
            <div className="terms-foot">
              <button type="button" className="btn btn-primary btn-block" onClick={() => setShowTerms(false)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
