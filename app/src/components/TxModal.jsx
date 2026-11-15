import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, fmtMoney, parseMoneyToCents, sanitizeMoneyInput, yuanStr } from '../utils';
import { Icon, Modal, Field, PasswordInput } from '../ui';

/* ---------- 顾客搜索选择器 ---------- */
export function CustomerPicker({ value, onChange, placeholder = '输入姓名 / 班级 / 手机号搜索' }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!open || !q.trim()) { setRows([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      const r = await api.customers.list({ q: q.trim(), page_size: 8, sort: 'created_desc' });
      setLoading(false);
      if (r.ok) setRows(r.data.rows);
    }, 180);
    return () => clearTimeout(timer.current);
  }, [q, open]);

  return (
    <div className="picker">
      <div className="picker-input">
        <Icon name="search" size={16} />
        <input
          className="input input-plain"
          value={q}
          placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && q.trim() ? (
        <div className="picker-pop">
          {loading ? <div className="picker-row muted">搜索中…</div> : null}
          {!loading && rows.length === 0 ? <div className="picker-row muted">没有匹配的顾客</div> : null}
          {rows.map((c) => (
            <button key={c.id} type="button" className="picker-row" onClick={() => { onChange(c); setOpen(false); setQ(''); }}>
              <span className="picker-name">{c.name}</span>
              <span className="picker-meta">{c.class_name || '未分班'}</span>
              <span className="picker-points">{c.points} 分</span>
            </button>
          ))}
        </div>
      ) : null}
      {value ? (
        <div className="picker-selected">
          <div className="avatar">{value.name.slice(0, 1)}</div>
          <div>
            <strong>{value.name}</strong>
            <span className="muted">{value.class_name || '未分班'}</span>
          </div>
          <div className="picker-selected-stat">
            <span>{value.points} 分</span>
            <span className="muted">{fmtMoney(value.balance_cents)}</span>
          </div>
          <button type="button" className="icon-btn" onClick={() => onChange(null)}><Icon name="x" size={14} /></button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 交易弹窗 ---------- */
const MODE_META = {
  consume: { title: '转化积分', icon: 'spark', verb: '确认转化' },
  balance: { title: '消费余额', icon: 'wallet', verb: '确认消费' },
  redeem: { title: '积分兑换', icon: 'gift', verb: '确认兑换' },
  adjust: { title: '手动调整', icon: 'settings', verb: '保存调整' },
  newCustomer: { title: '新增顾客', icon: 'plus', verb: '保存顾客' },
};

export default function TxModal({ open, mode, customer, rules, onClose, onDone, call }) {
  const [amount, setAmount] = useState('');
  const [times, setTimes] = useState(1);
  const [note, setNote] = useState('');
  const [dp, setDp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', class_name: '', phone: '', note: '' });
  const [adjustPw, setAdjustPw] = useState('');

  useEffect(() => {
    if (!open) return;
    setAmount(''); setTimes(1); setNote(''); setDp(''); setErr(''); setBusy(false); setAdjustPw('');
    setForm({ name: customer?.name || '', class_name: customer?.class_name || '', phone: customer?.phone || '', note: '' });
  }, [open, mode, customer]);

  const cents = parseMoneyToCents(amount);
  const perCents = rules?.points_rule?.per_amount_cents || 1000;
  const perPoints = rules?.points_rule?.points_per_unit || 1;
  const previewPoints = Math.floor(Math.max(0, cents) / perCents) * perPoints;

  const balanceCents = Number(customer?.balance_cents || 0);
  const balanceShort = mode === 'balance' && cents > balanceCents;

  const rp = rules?.redeem_rule?.points || 15;
  const rb = rules?.redeem_rule?.balance_cents || 1000;
  const maxTimes = customer ? Math.floor(Number(customer.points) / rp) : 0;

  const meta = MODE_META[mode] || MODE_META.consume;

  async function submit(e) {
    e && e.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    const run = call || ((fn) => fn());
    let r;
    if (mode === 'consume') {
      r = await run(() => api.tx.consume(customer.id, cents, note));
    } else if (mode === 'balance') {
      r = await run(() => api.tx.spend(customer.id, cents, note));
    } else if (mode === 'redeem') {
      r = await run(() => api.tx.redeem(customer.id, times, note));
    } else if (mode === 'adjust') {
      r = await run(() => api.tx.adjust(customer.id, parseInt(dp || '0', 10) || 0, note, adjustPw));
    } else if (mode === 'newCustomer') {
      r = await run(() => api.customers.create(form));
    }
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone && onDone(r.data, mode);
    onClose && onClose();
  }

  const canSubmit = mode === 'consume'
    ? cents > 0
    : mode === 'balance'
      ? cents > 0 && !balanceShort
      : mode === 'redeem'
        ? times > 0 && times <= maxTimes
        : mode === 'adjust'
          ? dp !== '' && parseInt(dp, 10) !== 0 && adjustPw.trim().length > 0
          : !!form.name.trim();

  return (
    <Modal
      open={open}
      title={meta.title}
      subtitle={customer ? `${customer.name} · ${customer.class_name || '未分班'}` : (mode === 'newCustomer' ? '建档后即可参与积分' : '')}
      onClose={onClose || (() => {})}
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose} type="button">取消</button>
          <button className={'btn btn-primary' + (mode === 'redeem' ? ' btn-accent' : '')} onClick={submit} disabled={busy || !canSubmit} type="button">
            {busy ? '处理中…' : meta.verb}
          </button>
        </>
      )}
    >
      {mode === 'newCustomer' ? (
        <div className="form-grid">
          <Field label="姓名 *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="顾客姓名" /></Field>
          <Field label="班级"><input className="input" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} placeholder="如 三年级二班" /></Field>
          <Field label="手机号"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="选填" /></Field>
          <Field label="备注"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="选填" /></Field>
        </div>
      ) : null}

      {mode === 'consume' ? (
        <>
          <Field label="消费金额（元）" hint="按积分规则换算为积分，不扣减余额">
            <input
              className="input input-lg input-money"
              inputMode="decimal"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
              placeholder="0.00"
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(e); }}
            />
          </Field>
          <div className="calc-strip">
            <span>按规则「每满 {(perCents / 100).toFixed(0)} 元积 {perPoints} 分」</span>
            <strong className={previewPoints > 0 ? 'ok' : ''}>本次 +{previewPoints} 分</strong>
          </div>
          <div className="calc-strip">
            <span>当前积分 {customer?.points ?? 0} 分{cents > 0 ? ` → 转化后 ${Number(customer?.points || 0) + previewPoints} 分` : ''}</span>
            {cents > 0 && previewPoints <= 0 ? <strong className="warn">不足 {(perCents / 100).toFixed(0)} 元，本次不得分</strong> : null}
          </div>
          <Field label="备注"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="选填，如 购买文具" /></Field>
        </>
      ) : null}

      {mode === 'redeem' ? (
        <>
          <div className="redeem-box">
            <div>
              <span className="muted">当前积分</span>
              <strong className="big">{customer?.points ?? 0}</strong>
            </div>
            <Icon name="arrowRight" size={18} />
            <div>
              <span className="muted">兑换后余额</span>
              <strong className="big">{fmtMoney(Number(customer?.balance_cents || 0) + rb * times)}</strong>
            </div>
          </div>
          <Field label={`兑换份数（每 ${rp} 分 → ${(rb / 100).toFixed(0)} 元）`}>
            <div className="stepper">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTimes(Math.max(1, times - 1))}>−</button>
              <input className="input input-center" value={times} onChange={(e) => setTimes(Math.max(1, parseInt(e.target.value || '1', 10) || 1))} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTimes(Math.min(maxTimes || 99, times + 1))}>+</button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setTimes(Math.max(1, maxTimes))}
                disabled={maxTimes < 1}
                title={maxTimes < 1 ? '积分不足，无法兑换' : `一键选到最大 ${maxTimes} 份`}
              >
                全部（{Math.max(0, maxTimes)} 份）
              </button>
              <span className="stepper-hint">最多可兑换 {maxTimes} 份</span>
            </div>
          </Field>
          <div className="calc-strip">
            <span>消耗 {rp * times} 分，获得 {fmtMoney(rb * times)} 余额</span>
            {times > maxTimes ? <strong className="warn">积分不足</strong> : <strong className="ok">可用</strong>}
          </div>
          <Field label="备注"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="选填" /></Field>
        </>
      ) : null}

      {mode === 'balance' ? (
        <>
          <Field label="消费金额（元）" hint="从顾客余额扣款，本次不产生积分">
            <input
              className="input input-lg input-money"
              inputMode="decimal"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
              placeholder="0.00"
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(e); }}
            />
          </Field>
          <div className="calc-strip">
            <span>可用余额 {fmtMoney(balanceCents)}{cents > 0 ? ` → 消费后 ${fmtMoney(Math.max(0, balanceCents - cents))}` : ''}</span>
            {balanceShort ? <strong className="warn">余额不足</strong> : (cents > 0 ? <strong className="ok">可支付</strong> : null)}
          </div>
          <Field label="备注"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="选填，如 购买文具" /></Field>
        </>
      ) : null}

      {mode === 'adjust' ? (
        <>
          <Field label="积分增减" hint="正数增加，负数扣减（余额不可手动调整）">
            <input className="input" value={dp} onChange={(e) => setDp(e.target.value)} placeholder="如 5 或 -3" />
          </Field>
          <div className="calc-strip">
            <span>当前积分 {customer?.points ?? 0} 分 → 调整后 {Number(customer?.points || 0) + (parseInt(dp || '0', 10) || 0)} 分</span>
            {dp !== '' && parseInt(dp || '0', 10) < 0 && Number(customer?.points || 0) + (parseInt(dp, 10) || 0) < 0 ? <strong className="warn">积分不足</strong> : null}
          </div>
          <Field label="调整原因（会写入记录）"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 补录上月消费积分" /></Field>
          <Field label="操作密码 *" hint="手动调整不受 10 分钟授权窗口影响，每次都必须重新输入">
            <PasswordInput value={adjustPw} onChange={(e) => setAdjustPw(e.target.value)} placeholder="请输入操作密码" className="input" />
          </Field>
        </>
      ) : null}

      {err ? <div className="err"><Icon name="alert" size={14} />{err}</div> : null}
    </Modal>
  );
}
