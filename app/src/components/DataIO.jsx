import React, { useState } from 'react';
import { api } from '../utils';
import { Icon } from '../ui';

function ResultBox({ result }) {
  if (!result) return null;
  const ok = result.created !== undefined ? `新增 ${result.created} 条，更新 ${result.updated} 条` : `导入 ${result.imported} 条`;
  return (
    <div className="result-box">
      <div className="result-head">
        <Icon name="check" size={15} />
        <strong>{result.file ? result.file.split(/[\\/]/).pop() : '导入完成'}：{ok}</strong>
        {result.skipped ? <span className="warn">跳过 {result.skipped} 条</span> : null}
      </div>
      {result.errors && result.errors.length ? (
        <ul className="result-errors">
          {result.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export default function DataIO({ call, refresh, notify }) {
  const [busy, setBusy] = useState('');
  const [resCust, setResCust] = useState(null);
  const [resTx, setResTx] = useState(null);
  const [autoCreate, setAutoCreate] = useState(true);

  async function run(key, fn, setter) {
    setBusy(key);
    const r = await call(fn);
    setBusy('');
    if (!r.ok) return notify(r.error, 'err');
    if (r.data.canceled) return;
    setter(r.data);
    refresh();
    notify('导入完成，数据已刷新');
  }

  async function exportOne(kind) {
    setBusy('export');
    const r = await call(() => api.io.exportData(kind));
    setBusy('');
    if (!r.ok) return notify(r.error, 'err');
    if (r.data.canceled) return;
    notify(`已导出 ${r.data.count} 条`);
  }

  async function template(kind) {
    const r = await call(() => api.io.template(kind));
    if (!r.ok) return notify(r.error, 'err');
    if (!r.data.canceled) notify('模板已保存，按表头填写后即可导入');
  }

  return (
    <div className="page-io">
      <div className="io-grid">
        <section className="card io-card">
          <div className="card-head">
            <h3><Icon name="users" size={16} />导入顾客名单</h3>
            <span className="card-sub">Excel / CSV，首次建档或批量更新</span>
          </div>
          <div className="card-body">
            <p className="io-desc">支持 <b>.xlsx / .xls / .csv</b>。表头可用「姓名 / 班级 / 手机 / 积分 / 余额 / 备注」，姓名必填。</p>
            <div className="io-cols">
              <span>姓名*</span><span>班级</span><span>手机</span><span>积分</span><span>余额(元)</span><span>备注</span>
            </div>
            <div className="io-actions">
              <button className="btn btn-primary" disabled={busy === 'cust'} onClick={() => run('cust', () => api.io.importCustomers(), setResCust)}>
                <Icon name="upload" size={15} />{busy === 'cust' ? '导入中…' : '选择文件导入'}
              </button>
              <button className="btn btn-ghost" onClick={() => template('customers')}>下载模板</button>
            </div>
            <p className="io-note">同名且同班的顾客会被识别为同一人：只更新基本信息；若表中有积分/余额则作为期初数据累加。</p>
            <ResultBox result={resCust} />
          </div>
        </section>

        <section className="card io-card">
          <div className="card-head">
            <h3><Icon name="receipt" size={16} />导入消费记录</h3>
            <span className="card-sub">批量补录历史流水，自动补积分</span>
          </div>
          <div className="card-body">
            <p className="io-desc">表头可用「姓名 / 班级 / 消费金额 / 时间 / 备注 / 类型」。时间支持 <b>2026-11-07 10:23:45</b> 或 Excel 日期格式，导入后精确到秒保存。</p>
            <div className="io-cols">
              <span>姓名*</span><span>班级</span><span>消费金额(元)*</span><span>时间</span><span>备注</span>
            </div>
            <label className="check-line">
              <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} />
              名单里没有的顾客自动建档
            </label>
            <div className="io-actions">
              <button className="btn btn-primary" disabled={busy === 'tx'} onClick={() => run('tx', () => api.io.importTransactions(autoCreate), setResTx)}>
                <Icon name="upload" size={15} />{busy === 'tx' ? '导入中…' : '选择文件导入'}
              </button>
              <button className="btn btn-ghost" onClick={() => template('transactions')}>下载模板</button>
            </div>
            <p className="io-note">按表中金额与规则自动计算积分；「类型」写“充值”则记为充值（仅导入可用），其余记为积分转化。</p>
            <ResultBox result={resTx} />
          </div>
        </section>

        <section className="card io-card">
          <div className="card-head">
            <h3><Icon name="download" size={16} />导出数据</h3>
            <span className="card-sub">可保存为 Excel 或 CSV</span>
          </div>
          <div className="card-body">
            <p className="io-desc">导出可用于对账、备份或迁移到其它系统。CSV 已加 UTF-8 BOM，Excel 直接双击打开不乱码。</p>
            <div className="io-actions col">
              <button className="btn btn-ghost btn-block" onClick={() => exportOne('customers')} disabled={busy === 'export'}>
                <Icon name="users" size={15} />导出顾客名单（含积分与余额）
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => exportOne('transactions')} disabled={busy === 'export'}>
                <Icon name="receipt" size={15} />导出消费记录（精确到秒）
              </button>
            </div>
          </div>
        </section>

        <section className="card io-card">
          <div className="card-head">
            <h3><Icon name="database" size={16} />数据安全</h3>
            <span className="card-sub">本地数据库 + 自动日备份</span>
          </div>
          <div className="card-body">
            <p className="io-desc">所有数据保存在本机 SQLite 文件（标准 .db 格式）。系统每天首次启动会自动留存一份备份，最多保留 8 份。</p>
            <div className="io-actions col">
              <button className="btn btn-ghost btn-block" onClick={async () => {
                const r = await call(() => api.app.backup());
                if (!r.ok) return notify(r.error, 'err');
                if (!r.data.canceled) notify('已备份数据库文件');
              }}><Icon name="database" size={15} />立即备份</button>
              <button className="btn btn-ghost btn-block" onClick={async () => {
                const r = await call(() => api.app.openDataDir());
                if (!r.ok) return notify(r.error, 'err');
              }}><Icon name="arrowRight" size={15} />打开数据目录</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
