import React, { useEffect, useState } from 'react';
import { api } from '../utils';
import { Icon } from '../ui';

/* 《使用声明》正文 —— 首次使用必须同意，之后可在登录页随时查看 */
export const TERMS_SECTIONS = [
  {
    head: '一、软件说明',
    items: [
      '本软件是基于 React + Bolt Database 的本地桌面积分管理工具，提供顾客登记、积分核算、积分兑换、消费余额、消费记录、Excel/CSV 批量导入导出、可选二级密码管控与可选云端同步，仅用于内部经营登记。',
      '积分规则：每满 10 元积 1 分；15 分兑换 10 元消费余额。余额只能靠积分兑换增加、只能靠消费余额减少，不支持手动改余额。',
    ],
  },
  {
    head: '二、使用须知',
    items: [
      '账号与密码：系统默认只设登录密码（含用户名），用于进入系统；二级操作密码为可选项，默认关闭，可在「设置 → 安全设置」开启，开启后管积分调整、积分兑换、消费余额、导入、改设置等敏感操作。密码由使用者自行保管，因泄露、转借或保管不当造成的篡改与误操作，后果由使用方承担。',
      '数据与备份：支持本地保存 + 可选云端同步；请定期用「导出名单 / 备份到文件」自行备份，云端同步不等于免备份。因网络异常、云端服务波动、误删除造成的数据丢失，开发者不承担赔偿责任。',
      '导入校验：批量导入 Excel/CSV 会直接写入数据库，请先核对文件内容，错误导入产生的后果由操作人负责。',
      '操作凭证：消费、兑换、调整等记录精确到秒永久留存，作为操作凭证，提交前请确认顾客、数量与金额无误。',
      '背景图：登录页背景可自行导入，支持最高 8K、单文件 ≤50MB；请保证所传图片不侵权、不违规，版权责任由上传人承担。',
    ],
  },
  {
    head: '三、禁止事项',
    items: [
      '不得用于非法经营、传销、赌博、违规资金结算等违法违规场景。',
      '不得逆向破解、反编译、篡改程序、去除权限校验或绕过密码验证。',
      '不得伪造消费记录、虚假积分或兑换凭证用于欺骗顾客及其他欺诈行为。',
      '不得上传、存储违反法律法规的顾客信息、图片及资料。',
    ],
  },
  {
    head: '四、免责声明',
    items: [
      '本软件按现有功能现状提供，不承诺永久无缺陷或云端服务不间断；功能调整、优化与修复依需求迭代进行。',
      '本软件仅为内部记账辅助工具，不具备财务审计、金融结算资质，不可作为正式财务报税凭证，账务请按税务要求另行规范处理。',
      '因操作失误（误兑换、误录入、错误导入等）、网络故障、系统故障、第三方软件拦截等外部原因造成的损失，开发者不承担赔偿责任。',
      '如违反法律法规或本声明使用本软件，开发者有权终止云端同步服务。',
    ],
  },
  {
    head: '五、隐私说明',
    items: [
      '本软件只在积分管理业务范围内使用所录数据，不私自收集、不对外出售顾客姓名、班级、消费记录等信息；使用者作为数据控制人，应遵守个人信息保护相关法律，妥善保管顾客信息。',
    ],
  },
  {
    head: '六、其他',
    items: [
      '本声明随功能更新同步调整，以软件内展示的最新版本为准；对功能与规则有疑问，请及时反馈调整需求。',
    ],
  },
];

export function TermsBody() {
  return (
    <div className="terms-body">
      {TERMS_SECTIONS.map((s) => (
        <div className="terms-sec" key={s.head}>
          <h4>{s.head}</h4>
          {s.items.map((t, i) => (
            <p key={i}><span className="terms-dot" />{t}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

/* 首次使用：需读完 10 秒倒计时才能勾选同意，勾选后进入系统 */
const READ_SECONDS = 10;

export default function TermsGate({ onAccepted }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hint, setHint] = useState('');
  const [left, setLeft] = useState(READ_SECONDS);

  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const locked = left > 0;

  /* 倒计时结束自动清掉“还需阅读”提示 */
  useEffect(() => {
    if (!locked) setHint('');
  }, [locked]);

  /* 勾选区：始终可点击。倒计时内点它不再静默无反应，而是提示还差几秒 */
  function toggleConsent() {
    if (locked) { setHint(`还需阅读 ${left} 秒，读完后即可勾选同意`); return; }
    setHint('');
    setChecked((v) => !v);
  }

  async function agree() {
    if (busy) return;
    if (locked) { setHint(`还需阅读 ${left} 秒，读完后即可同意`); return; }
    if (!checked) { setHint('请先勾选左侧方框，确认已阅读《使用声明》'); return; }
    setErr('');
    setHint('');
    setBusy(true);
    const r = await api.acceptTerms(new Date().toISOString());
    setBusy(false);
    if (!r || !r.ok) { setErr((r && r.error) || '保存失败，请重试'); return; }
    onAccepted((r.data && r.data.terms_accepted) || 'ok');
  }

  const ready = !locked && checked && !busy;

  /* 底部整块（含按钮左右两侧留白）都可点击，避免“按钮左边一小段点不动” */
  function onFootClick(e) {
    if (e.target && e.target.closest && e.target.closest('.btn')) return;
    agree();
  }

  return (
    <div className="terms-gate">
      <div className="terms-card">
        <div className="terms-head">
          <Icon name="shield" size={18} />
          <div>
            <h3>积分客户管理系统 使用声明</h3>
            <p className="terms-sub">首次使用请阅读并同意以下条款；同意后不再弹出，可在登录页随时查看。</p>
          </div>
          {locked ? <span className="terms-timer">还需阅读 {left} 秒</span> : <span className="terms-timer done">可以同意</span>}
        </div>
        <TermsBody />
        {err ? <div className="err"><Icon name="alert" size={14} />{err}</div> : null}
        {/* 自定义勾选区：整行都能点，方框本体加大到 20px 并外扩热区；
            不用原生 checkbox + disabled，避免禁用态把鼠标事件吞掉 */}
        <div
          className={'terms-consent' + (locked ? ' locked' : '') + (checked ? ' on' : '')}
          role="checkbox"
          aria-checked={checked}
          aria-disabled={locked}
          tabIndex={0}
          onClick={toggleConsent}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleConsent(); }
          }}
        >
          <span className={'terms-box' + (checked ? ' on' : '')} aria-hidden="true">
            {checked ? <Icon name="check" size={12} /> : null}
          </span>
          <span>
            {locked
              ? `请先阅读声明，${left} 秒后才能勾选同意`
              : '我已阅读并同意上述《使用声明》，知悉积分/余额规则、数据备份责任与禁止事项'}
          </span>
        </div>
        {/* 提示条固定占位（空时不可见），避免弹出提示时整张卡片上下跳动 */}
        <div className={'terms-hint' + (hint ? '' : ' is-empty')}>{hint || ' '}</div>
        <div className="terms-foot" onClick={onFootClick}>
          <button type="button" className={'btn btn-primary btn-block' + (ready ? '' : ' is-idle')} aria-disabled={!ready} onClick={agree}>
            {busy ? '正在保存…' : locked ? `请阅读声明（${left} 秒后可同意）` : checked ? '同意并继续' : '请先勾选同意'}
          </button>
        </div>
      </div>
    </div>
  );
}
