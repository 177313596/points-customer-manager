import React, { useState } from 'react';
import { api, fmtMoney, parseMoneyToCents, sanitizeMoneyInput } from '../utils';
import { Icon, Empty } from '../ui';
import TxModal, { CustomerPicker } from './TxModal';

function Stat({ icon, label, value, sub, tone }) {
  return (
    <div className={'stat-card ' + (tone || '')}>
      <div className="stat-top">
        <span className="stat-ic"><Icon name={icon} size={16} /></span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export default function Dashboard({ settings, overview, call, refresh, notify, bump }) {
  const [pick, setPick] = useState(null);
  const [modal, setModal] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  // 消费余额模块
  const [spendPick, setSpendPick] = useState(null);
  const [spendAmount, setSpendAmount] = useState('');
  const [spendBusy, setSpendBusy] = useState(false);
  const [modalCustomer, setModalCustomer] = useState(null);

  const cents = parseMoneyToCents(amount);
  const perCents = settings?.points_rule?.per_amount_cents || 1000;
  const perPoints = settings?.points_rule?.points_per_unit || 1;
  const preview = Math.floor(Math.max(0, cents) / perCents) * perPoints;
  const ov = overview || {};
  const maxTrend = Math.max(1, ...(ov.trend || []).map((t) => t.amount_cents));

  const spendCents = parseMoneyToCents(spendAmount);
  const spendBalance = Number(spendPick?.balance_cents || 0);
  const spendShort = spendCents > spendBalance;
  const spendLeft = spendBalance - spendCents;

  const rp = settings?.redeem_rule?.points || 15;
  const rb = settings?.redeem_rule?.balance_cents || 1000;
  const spendPoints = Number(spendPick?.points || 0);
  const spendMaxTimes = spendPick ? Math.floor(spendPoints / rp) : 0;
  const spendGainCents = spendMaxTimes * rb;

  function openRedeem(target) {
    if (!target) return;
    setModalCustomer(target);
    setModal('redeem');
  }

  /* 兑换后把选中顾客的积分/余额就地刷新，免得"可用余额"还是旧值 */
  function syncPick(customer) {
    if (!customer) return;
    setPick((prev) => (prev && prev.id === customer.id ? { ...prev, ...customer } : prev));
    setSpendPick((prev) => (prev && prev.id === customer.id ? { ...prev, ...customer } : prev));
  }

  async function quickConsume() {
    if (!pick || cents <= 0) return;
    setBusy(true);
    const r = await call(() => api.tx.consume(pick.id, cents, '快捷操作'));
    setBusy(false);
    if (!r.ok) return notify(r.error, 'err');
    notify(`${pick.name} 转化积分：${fmtMoney(cents)} → +${r.data.points} 分，现有 ${r.data.customer.points} 分`);
    setAmount('');
    syncPick(r.data.customer);
    setPick(null);
    refresh();
  }

  async function quickSpend() {
    if (!spendPick || spendCents <= 0 || spendShort) return;
    setSpendBusy(true);
    const r = await call(() => api.tx.spend(spendPick.id, spendCents, '快捷操作'));
    setSpendBusy(false);
    if (!r.ok) return notify(r.error, 'err');
    notify(`${spendPick.name} 消费余额 ${fmtMoney(spendCents)}，剩余 ${fmtMoney(r.data.customer.balance_cents)}`);
    setSpendAmount('');
    setSpendPick(null);
    refresh();
  }

  async function doAction(kind) {
    if (kind === 'import') {
      const r = await call(() => api.io.importCustomers());
      if (!r.ok) return notify(r.error, 'err');
      if (r.data.canceled) return;
      notify(`导入完成：新增 ${r.data.created}，更新 ${r.data.updated}，跳过 ${r.data.skipped}`);
      refresh();
    }
    if (kind === 'export') {
      const r = await call(() => api.io.exportData('customers'));
      if (!r.ok) return notify(r.error, 'err');
      if (!r.data.canceled) notify(`已导出 ${r.data.count} 条顾客数据`);
    }
    if (kind === 'backup') {
      const r = await call(() => api.app.backup());
      if (!r.ok) return notify(r.error, 'err');
      if (!r.data.canceled) notify('数据库已备份');
    }
    if (kind === 'sync') {
      const r = await call(() => api.cloud.sync());
      if (!r.ok) return notify(r.error, 'err');
      notify(r.data.message);
      refresh();
    }
  }

  return (
    <div className="dash">
      <section className="stats">
        <Stat icon="wallet" label="今日消费额" tone="primary"
          value={fmtMoney(ov.today_amount_cents || 0)}
          sub={`今日 ${ov.today_tx_count || 0} 笔交易`} />
        <Stat icon="spark" label="今日新增积分"
          value={(ov.today_points || 0) + ' 分'}
          sub={`累计发放 ${ov.redeemed_points_total || 0} 分已兑换`} />
        <Stat icon="users" label="会员总数"
          value={ov.customers || 0}
          sub={`今日新增 ${ov.today_new_customers || 0} 人`} />
      </section>

      <section className="quick-row">
        <button className="quick-btn" onClick={() => setModal('newCustomer')}>
          <Icon name="users" size={16} /><span>新增顾客</span>
        </button>
        <div className="quick-spacer" />
        <button className="quick-btn ghost" onClick={() => doAction('import')}>
          <Icon name="upload" size={16} /><span>批量导入</span>
        </button>
        <button className="quick-btn ghost" onClick={() => doAction('export')}>
          <Icon name="download" size={16} /><span>导出名单</span>
        </button>
        <button className="quick-btn ghost" onClick={() => doAction('backup')}>
          <Icon name="database" size={16} /><span>备份</span>
        </button>
        <button className="quick-btn ghost" onClick={() => doAction('sync')}>
          <Icon name="cloud" size={16} /><span>立即同步</span>
        </button>
      </section>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <h3>积分</h3>
            <span className="card-sub">选顾客 → 输金额 → 转化为积分</span>
          </div>
          <div className="card-body">
            <CustomerPicker value={pick} onChange={setPick} />
            <div className="cash-row">
              <div className="cash-input">
                <span className="cash-prefix">¥</span>
                <input
                  className="input input-plain input-lg"
                  inputMode="decimal"
                  value={amount}
                  placeholder="0.00"
                  onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && pick && cents > 0) quickConsume(); }}
                />
              </div>
              <div className="cash-preview">
                <span>预计得分</span>
                <strong>+{preview}</strong>
              </div>
              <button className="btn btn-primary" disabled={!pick || cents <= 0 || busy} onClick={quickConsume}>
                {busy ? '处理中…' : '转化积分'}
              </button>
            </div>
            {pick ? (
              <div className="calc-strip">
                <span>当前积分 {pick.points} 分{cents > 0 ? ` → 转化后 ${Number(pick.points || 0) + preview} 分` : ''}</span>
                {preview > 0 ? <strong className="ok">+{preview} 分</strong> : null}
              </div>
            ) : null}
            <p className="rule-hint">
              <Icon name="spark" size={13} />
              规则：每满 {(perCents / 100).toFixed(0)} 元积 {perPoints} 分；{settings?.redeem_rule?.points || 15} 分可兑换 {fmtMoney(settings?.redeem_rule?.balance_cents || 1000)} 余额
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>消费余额</h3>
            <span className="card-sub">选顾客 → 输金额 → 从余额扣款</span>
          </div>
          <div className="card-body">
            <CustomerPicker value={spendPick} onChange={setSpendPick} />
            {spendPick ? (
              <div className="redeem-inline">
                <span className="redeem-inline-text">
                  当前 <strong>{spendPoints}</strong> 分
                  {spendMaxTimes > 0
                    ? `，可兑换 ${spendMaxTimes} 份 → ${fmtMoney(spendGainCents)} 余额`
                    : `，还差 ${Math.max(0, rp - (spendPoints % rp || 0))} 分可兑 1 份`}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={spendMaxTimes < 1}
                  onClick={() => openRedeem(spendPick)}
                >
                  <Icon name="gift" size={14} />积分兑换
                </button>
              </div>
            ) : null}
            <div className="cash-row">
              <div className="cash-input">
                <span className="cash-prefix">¥</span>
                <input
                  className="input input-plain input-lg"
                  inputMode="decimal"
                  value={spendAmount}
                  placeholder="0.00"
                  onChange={(e) => setSpendAmount(sanitizeMoneyInput(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && spendPick && spendCents > 0 && !spendShort) quickSpend(); }}
                />
              </div>
              <div className="cash-preview">
                <span>可用余额</span>
                <strong>{fmtMoney(spendBalance)}</strong>
              </div>
              <button className="btn btn-primary" disabled={!spendPick || spendCents <= 0 || spendShort || spendBusy} onClick={quickSpend}>
                {spendBusy ? '处理中…' : '消费余额'}
              </button>
            </div>
            {spendPick ? (
              <div className="calc-strip">
                <span>消费后余额 {fmtMoney(Math.max(0, spendLeft))}{spendCents > 0 ? '' : '（未输入金额）'}</span>
                {spendShort ? <strong className="warn">余额不足</strong> : (spendCents > 0 ? <strong className="ok">可支付</strong> : null)}
              </div>
            ) : null}
            <p className="rule-hint">
              <Icon name="wallet" size={13} />
              余额只能通过「积分兑换」获得，只能在这里花掉；本次消费不产生积分。
            </p>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>近 7 日消费</h3>
          <span className="card-sub">合计 {fmtMoney((ov.trend || []).reduce((a, b) => a + b.amount_cents, 0))}</span>
        </div>
        <div className="card-body">
          {(ov.trend || []).length ? (
            <div className="bars">
              {(ov.trend || []).map((t) => (
                <div className="bar-col" key={t.date}>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ height: `${Math.max(3, (t.amount_cents / maxTrend) * 100)}%` }} />
                  </div>
                  <span className="bar-val">{t.amount_cents ? (t.amount_cents / 100).toFixed(0) : ''}</span>
                  <span className="bar-date">{t.date}</span>
                </div>
              ))}
            </div>
          ) : <Empty title="暂无数据" desc="录入第一笔消费后这里会出现趋势" />}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>积分榜</h3>
          <span className="card-sub">按当前积分排序</span>
        </div>
        <div className="card-body">
          {(ov.top || []).length === 0 ? (
            <Empty icon="users" title="还没有顾客" desc="通过「新增顾客」或「批量导入」开始建档" />
          ) : (
            <div className="top-list">
              {(ov.top || []).map((c, i) => (
                <div className="top-item" key={c.id}>
                  <span className={'rank' + (i < 3 ? ' hot' : '')}>{i + 1}</span>
                  <span className="top-name">{c.name}</span>
                  <span className="top-class">{c.class_name || '未分班'}</span>
                  <span className="top-points">{c.points} 分</span>
                  <span className="top-balance">{fmtMoney(c.balance_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <TxModal
        open={!!modal}
        mode={modal || 'consume'}
        customer={modal === 'newCustomer' ? null : (modalCustomer || pick)}
        rules={settings}
        onClose={() => { setModal(null); setModalCustomer(null); }}
        call={call}
        onDone={(data, mode) => {
          if (mode === 'newCustomer') {
            notify(`已新增顾客 ${data.name}`);
            setPick(data);
          } else if (mode === 'redeem') {
            notify(`${data.customer.name} 积分兑换：-${data.costPoints} 分 → +${fmtMoney(data.gainBalance)} 余额，现有 ${fmtMoney(data.customer.balance_cents)}`);
            syncPick(data.customer);
          } else {
            notify('操作完成');
          }
          setModalCustomer(null);
          refresh();
        }}
      />
    </div>
  );
}
