import React, { useEffect, useRef, useState } from 'react';
import { api, fmtMoney, typeClass } from '../utils';
import { Icon, Empty } from '../ui';

const PAGE_SIZE = 20;

export default function Records({ call, notify, bump }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, sum_amount_cents: 0, sum_points: 0, sum_balance_cents: 0 });
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  async function load() {
    setLoading(true);
    const r = await api.tx.list({ q, type, from, to, page, page_size: PAGE_SIZE });
    setLoading(false);
    if (r.ok) setData(r.data);
  }

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, q ? 260 : 0);
    return () => clearTimeout(timer.current);
  }, [q, type, from, to, page, bump]);

  async function exportNow() {
    const r = await call(() => api.io.exportData('transactions', { q, type, from, to }));
    if (!r.ok) return notify(r.error, 'err');
    if (r.data.canceled) return;
    notify(`已导出 ${r.data.count} 条记录`);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="page-records">
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input className="input input-plain" value={q} placeholder="搜索姓名 / 班级 / 备注"
            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <select className="select" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">全部类型</option>
          <option value="consume">积分转化</option>
          <option value="spend">消费余额</option>
          <option value="topup">充值</option>
          <option value="redeem">积分兑换</option>
          <option value="adjust">手动调整</option>
        </select>
        <div className="date-range">
          <input className="input input-date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <span className="muted">至</span>
          <input className="input input-date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          {(from || to) ? <button className="icon-btn" onClick={() => { setFrom(''); setTo(''); setPage(1); }}><Icon name="x" size={13} /></button> : null}
        </div>
        <div className="toolbar-spacer" />
        <button className="btn btn-ghost" onClick={exportNow}><Icon name="download" size={15} />导出明细</button>
      </div>

      <section className="summary-row">
        <div className="summary-item"><span>记录数</span><strong>{data.total}</strong></div>
        <div className="summary-item"><span>消费合计</span><strong>{fmtMoney(data.sum_amount_cents)}</strong></div>
        <div className="summary-item"><span>积分变动</span><strong className={data.sum_points >= 0 ? 'ok' : 'warn'}>{data.sum_points > 0 ? '+' : ''}{data.sum_points}</strong></div>
        <div className="summary-item"><span>余额变动</span><strong>{fmtMoney(data.sum_balance_cents)}</strong></div>
      </section>

      <div className="card table-card">
        {loading ? <div className="loading-bar" /> : null}
        {data.rows.length === 0 ? (
          <Empty icon="receipt" title="没有符合条件的记录" desc="调整筛选条件，或先去「工作台」录入一笔消费" />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th className="col-time">时间</th>
                  <th>顾客</th>
                  <th>班级</th>
                  <th>类型</th>
                  <th className="num">消费金额</th>
                  <th className="num">积分</th>
                  <th className="num">余额变动</th>
                  <th className="col-note">备注</th>
                  <th>操作人</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.created_at}</td>
                    <td><strong>{t.customer_name}</strong></td>
                    <td className="muted">{t.class_name || '—'}</td>
                    <td><span className={'tag ' + typeClass(t.type)}>{t.type_label}</span></td>
                    <td className="num">{t.amount_cents ? fmtMoney(t.amount_cents) : '—'}</td>
                    <td className={'num ' + (t.points_delta > 0 ? 'ok' : t.points_delta < 0 ? 'warn' : 'muted')}>
                      {t.points_delta > 0 ? '+' : ''}{t.points_delta || 0}
                    </td>
                    <td className={'num ' + (t.balance_delta_cents !== 0 ? '' : 'muted')}>
                      {t.balance_delta_cents ? fmtMoney(t.balance_delta_cents) : '—'}
                    </td>
                    <td className="note-cell muted" title={t.note}>{t.note || '—'}</td>
                    <td className="muted">{t.operator || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pager">
              <span className="muted">第 {page} / {totalPages} 页 · 时间精确到秒</span>
              <div className="pager-btns">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="chevronLeft" size={14} />上一页</button>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页<Icon name="chevronRight" size={14} /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
