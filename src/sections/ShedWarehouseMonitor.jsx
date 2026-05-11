// src/sections/ShedWarehouseMonitor.jsx
import { useState, useMemo } from 'react';
import { } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppData } from '../context/AppDataContext';

import { fmt, sumField, STATUS_LABELS, STATUS_BADGE, csvExport } from '../utils/helpers';

const STATUSES = ['recently_weighed','in_warehouse','ready_to_ship','shipped'];

export default function ShedWarehouseMonitor() {
  const { stock, loading } = useAppData();
  const [tab,      setTab]      = useState('all');
  const [search,   setSearch]   = useState('');
  const [station,  setStation]  = useState('');
  const [detail,   setDetail]   = useState(null);


  const stations = useMemo(() => [...new Set(stock.map(s => s.stationId).filter(Boolean))].sort(), [stock]);

  const filtered = useMemo(() => {
    return stock.filter(s => {
      if (tab !== 'all' && s.status !== tab) return false;
      if (station && s.stationId !== station) return false;
      if (search) {
        const q = search.toLowerCase();
        return (s.bagSerial||'').toLowerCase().includes(q)
          || (s.farmerName||'').toLowerCase().includes(q)
          || (s.farmerId||'').toLowerCase().includes(q)
          || (s.stationId||'').toLowerCase().includes(q);
      }
      return true;
    }).sort((a,b) => (b.weighedAt||b.createdAt||'') > (a.weighedAt||a.createdAt||'') ? 1 : -1);
  }, [stock, tab, station, search]);

  const counts = useMemo(() => {
    const c = { all: stock.length };
    STATUSES.forEach(s => { c[s] = stock.filter(b => b.status === s).length; });
    return c;
  }, [stock]);

  const totalWeight = sumField(filtered, 'stationWeight');

  function handleExport() {
    csvExport(filtered.map(s => ({
      Bag_Serial:    s.bagSerial || '',
      Status:        STATUS_LABELS[s.status] || s.status || '',
      Farmer_ID:     s.farmerId || '',
      Farmer_Name:   s.farmerName || '',
      Station_ID:    s.stationId || '',
      Weight_kg:     s.stationWeight || '',
      Preship_kg:    s.preShipWeight || '',
      Weighed_At:    fmt.datetime(s.weighedAt || s.createdAt),
    })), `KCDL_Stock_${new Date().toISOString().slice(0,10)}.csv`);
  }

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">⚖️ Warehouse Monitor</div>
          <div className="page-subtitle">All bag inventory across all outer island warehouses</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleExport} type="button">⬇ Export CSV</button>
      </div>

      {/* Status summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        {[
          { status:'recently_weighed', icon:'🆕', col:'var(--amber)'      },
          { status:'in_warehouse',     icon:'🏢', col:'var(--purple)'     },
          { status:'ready_to_ship',    icon:'✅', col:'var(--green)'      },
          { status:'shipped',          icon:'🛳️', col:'var(--text-muted)' },
        ].map(({ status, icon, col }) => (
          <div key={status} className="stat-card" style={{ '--accent-color': col, cursor:'pointer' }}
            onClick={() => setTab(status)}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-value" style={{ fontSize:'1.6rem' }}>{counts[status] || 0}</div>
            <div className="stat-label">{STATUS_LABELS[status]}</div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:6, fontFamily:'var(--font-mono)' }}>
              {fmt.kg(sumField(stock.filter(s=>s.status===status), 'stationWeight'))}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn${tab==='all'?' active':''}`} onClick={()=>setTab('all')} type="button">
          All Bags ({counts.all})
        </button>
        {STATUSES.map(s => (
          <button key={s} className={`tab-btn${tab===s?' active':''}`} onClick={()=>setTab(s)} type="button">
            {STATUS_LABELS[s]} ({counts[s]||0})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="toolbar">
        <div className="search-bar">
          <input placeholder="Search bag serial, farmer…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 190 }} value={station} onChange={e => setStation(e.target.value)}>
          <option value="">All Warehouses</option>
          {stations.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search||station) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStation(''); }} type="button">✕ Clear</button>
        )}
        <div style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:'0.82rem', color:'var(--text-muted)' }}>
          {filtered.length} bags · {fmt.kg(totalWeight)}
        </div>
      </div>

      {/* Table */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Bag Serial</th>
              <th>Status</th>
              <th>Farmer</th>
              <th>Farmer ID</th>
              <th>Warehouse</th>
              <th>Weight (kg)</th>
              <th>Pre-Ship (kg)</th>
              <th>Weighed At</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td className="tbl-mono" style={{ color:'var(--teal-light)', fontWeight:700 }}>{s.bagSerial || s.id.slice(0,8)}</td>
                <td>
                  <span className={`tbl-badge ${STATUS_BADGE[s.status] || 'badge-muted'}`}>
                    {STATUS_LABELS[s.status] || s.status || '—'}
                  </span>
                </td>
                <td style={{ fontWeight:600 }}>{s.farmerName || '—'}</td>
                <td className="tbl-mono" style={{ color:'var(--text-muted)' }}>{s.farmerId || '—'}</td>
                <td style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{s.stationId || '—'}</td>
                <td className="tbl-mono" style={{ fontWeight:700, color:'var(--gold)' }}>
                  {s.stationWeight ? (+s.stationWeight).toFixed(2) : '—'}
                </td>
                <td className="tbl-mono" style={{ color:'var(--text-secondary)' }}>
                  {s.preShipWeight ? (+s.preShipWeight).toFixed(2) : '—'}
                </td>
                <td className="tbl-mono" style={{ fontSize:'0.76rem', color:'var(--text-muted)' }}>
                  {fmt.datetime(s.weighedAt || s.createdAt)}
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetail(s)} type="button">View</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>
                No bags found
              </td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ padding:'10px 14px', fontWeight:700, color:'var(--text-secondary)', borderTop:'1px solid var(--border)' }}>
                  TOTAL ({filtered.length})
                </td>
                <td className="tbl-mono" style={{ fontWeight:700, color:'var(--gold)', borderTop:'1px solid var(--border)' }}>
                  {totalWeight.toLocaleString('en',{minimumFractionDigits:2})}
                </td>
                <td colSpan={3} style={{ borderTop:'1px solid var(--border)' }} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">📦 Bag Detail — {detail.bagSerial || detail.id}</div>
              <button className="modal-close" onClick={() => setDetail(null)} type="button">✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom:12 }}>
                <span className={`tbl-badge ${STATUS_BADGE[detail.status] || 'badge-muted'}`} style={{ fontSize:'0.8rem', padding:'4px 14px' }}>
                  {STATUS_LABELS[detail.status] || detail.status}
                </span>
              </div>
              <div className="form-row form-row-2">
                {[
                  ['Bag Serial',    detail.bagSerial],
                  ['Farmer',        detail.farmerName],
                  ['Farmer ID',     detail.farmerId],
                  ['Village',       detail.stationId],
                  ['Weight (kg)',   detail.stationWeight ? fmt.kg(detail.stationWeight) : '—'],
                  ['Pre-Ship (kg)', detail.preShipWeight ? fmt.kg(detail.preShipWeight) : '—'],
                  ['Weighed At',    fmt.datetime(detail.weighedAt || detail.createdAt)],
                  ['Reweighed At',  detail.reweighedAt ? fmt.datetime(detail.reweighedAt) : '—'],
                  ['Reweighed By',  detail.reweighedBy || '—'],
                  ['Type',          detail.type || '—'],
                ].map(([k,v]) => (
                  <div key={k} className="form-group">
                    <div className="form-label">{k}</div>
                    <div style={{ fontSize:'0.88rem', color:'var(--text-primary)', fontWeight:600, padding:'6px 0' }}>{v || '—'}</div>
                  </div>
                ))}
              </div>
              {detail.notes && (
                <>
                  <div className="divider" />
                  <div className="form-label">Notes</div>
                  <div style={{ fontSize:'0.85rem', color:'var(--text-secondary)', marginTop:8 }}>{detail.notes}</div>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setDetail(null)} type="button">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
