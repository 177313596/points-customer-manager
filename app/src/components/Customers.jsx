import React, { useEffect, useRef, useState } from 'react';
import { api, fmtMoney } from '../utils';
import { Icon, Modal, Empty, Field } from '../ui';
import TxModal from './TxModal';

const PAGE_SIZE = 12;

export default function Customers({ settings, call, refresh, notify, bump }) {
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [sort, setSort] = useState('created_desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState(null);
  const [txMode, setTxMode] = useState(null);
  const [edit, setEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ name: '', class_name: '', phone: '', note: '' });
  const [err, setErr] = useState('');
  const timer = useRef(null);

  async function load() {
    setLoading(true);
    const r = await api.customers.list({ q, class_name: cls, sort, page, page_size: PAGE_SIZE });
    setLoading(false);
    if (r.ok) setData(r.data);
  }

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, q ? 260 : 0);
    return () => clearTimeout(timer.current);
  }, [q, cls, sort, page, bump]);

  useEffect(() => {
    api.customers.classes().then((r) => { if (r.ok) setClasses(r.data); });
  }, [bump]);

  function openEdit(c) {
    setEdit(c);
    setErr('');
    setForm({ name: c.name, class_name: c.class_name || '', phone: c.phone || '', note: c.note || '' });
  }

  async function saveEdit() {
    setErr('');
    const r = await call(() => api.customers.update(edit.id, form));
    if (!r.ok) return setErr(r.error);
    setEdit(null);
    notify('顾客信息已更新');
    refresh();
  }

  async function doDelete() {
    const r = await call(() => api.customers.remove(confirmDel.id));
    if (!r.ok) { setErr(r.error); return; }
    setConfirmDel(null);
    notify('顾客已删除');
    refresh();
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="page-customers">
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input
            className="input input-plain"
            value={q}
            placeholder="搜索姓名 / 班级 / 手机号"
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
          {q ? <button className="icon-btn" onClick={() => { setQ(''); setPage(1); }}><Icon name="x" size={13} /></button> : null}
        </div>
        <select className="select" value={cls} onChange={(e) => { setCls(e.target.value); setPage(1); }}>
          <option value="">全部班级</option>
          {classes.map((c) => <option key={c.name} value={c.name}>{c.name}（{c.count}）</option>)}
        </select>
        <select className="select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="created_desc">最新建档</option>
          <option value="created_asc">最早建档</option>
          <option value="name_asc">姓名 A→Z</option>
          <option value="points_desc">积分从高到低</option>
          <option value="points_asc">积分从低到高</option>
          <option value="balance_desc">余额从高到低</option>
          <option value="spent_desc">累计消费从高到低</option>
        </select>
        <div className="toolbar-spacer" />
        <span className="count-hint">共 {data.total} 位顾客</span>
        <button className="btn btn-primary" onClick={() => setTxMode('newCustomer')}>
          <Icon name="plus" size={15} />新增顾客
        </button>
      </div>

      <div className="card table-card">
        {loading ? <div className="loading-bar" /> : null}
        {data.rows.length === 0 ? (
          <Empty icon="users" title={q || cls ? '没有匹配的顾客' : '还没有顾客档案'}
            desc={q || cls ? '换个关键词或清空班级筛选试试' : '可以单个新增，也可以在「导入导出」里批量导入 Excel'} />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th className="col-name">顾客</th>
                  <th>班级</th>
                  <th>手机号</th>
                  <th className="num">积分</th>
                  <th className="num">余额</th>
                  <th className="num">累计消费</th>
                  <th className="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="row-name">
                        <span className="avatar sm">{c.name.slice(0, 1)}</span>
                        <span>
                          <strong>{c.name}</strong>
                          {c.note ? <em className="row-note">{c.note}</em> : null}
                        </span>
                      </div>
                    </td>
                    <td><span className="chip-soft">{c.class_name || '未分班'}</span></td>
                    <td className="muted">{c.phone || '—'}</td>
                    <td className="num"><strong>{c.points}</strong></td>
                    <td className="num">{fmtMoney(c.balance_cents)}</td>
                    <td className="num muted">{fmtMoney(c.total_spent_cents)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" title="消费余额" onClick={() => { setPick(c); setTxMode('balance'); }}><Icon name="wallet" size={15} /></button>
                        <button className="icon-btn" title="转化积分" onClick={() => { setPick(c); setTxMode('consume'); }}><Icon name="spark" size={15} /></button>
                        <button className="icon-btn" title="积分兑换" onClick={() => { setPick(c); setTxMode('redeem'); }}><Icon name="gift" size={15} /></button>
                        <button className="icon-btn" title="手动调整（需操作密码）" onClick={() => { setPick(c); setTxMode('adjust'); }}><Icon name="settings" size={15} /></button>
                        <button className="icon-btn" title="编辑" onClick={() => openEdit(c)}><Icon name="edit" size={15} /></button>
                        <button className="icon-btn danger" title="删除" onClick={() => { setConfirmDel(c); setErr(''); }}><Icon name="trash" size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pager">
              <span className="muted">第 {page} / {totalPages} 页</span>
              <div className="pager-btns">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="chevronLeft" size={14} />上一页</button>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页<Icon name="chevronRight" size={14} /></button>
              </div>
            </div>
          </>
        )}
      </div>

      <TxModal
        open={!!txMode}
        mode={txMode || 'consume'}
        customer={txMode === 'newCustomer' ? null : pick}
        rules={settings}
        onClose={() => setTxMode(null)}
        call={call}
        onDone={() => { notify('操作完成'); refresh(); }}
      />

      <Modal open={!!edit} title="编辑顾客" subtitle={edit?.name} onClose={() => setEdit(null)}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>取消</button>
            <button className="btn btn-primary" onClick={saveEdit}>保存</button>
          </>
        )}>
        <div className="form-grid">
          <Field label="姓名 *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="班级"><input className="input" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} /></Field>
          <Field label="手机号"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="备注"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>
        {err ? <div className="err"><Icon name="alert" size={14} />{err}</div> : null}
      </Modal>

      <Modal open={!!confirmDel} title="删除顾客" onClose={() => setConfirmDel(null)}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>取消</button>
            <button className="btn btn-danger" onClick={doDelete}>确认删除</button>
          </>
        )}>
        <p className="confirm-text">确定删除「{confirmDel?.name}」？该操作不可撤销。</p>
        <p className="field-hint">若有交易记录的顾客不允许删除，以保证账目完整。</p>
        {err ? <div className="err"><Icon name="alert" size={14} />{err}</div> : null}
      </Modal>
    </div>
  );
}
