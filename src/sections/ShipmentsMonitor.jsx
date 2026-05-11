// src/sections/ShipmentsMonitor.jsx
import { useState, useMemo } from 'react';
import { } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppData } from '../context/AppDataContext';

import { fmt, sumField, csvExport } from '../utils/helpers';

export default function ShipmentsMonitor() {
  const { stock, shipments, loading } = useAppData();
  const [tab,       setTab]       = useState('ready');
  const [search,    setSearch]    = useState('');
  const [station,   setStation]   = useState('');


  const readyToShip  = stock.filter(s => s.status === 'ready_to_ship');
  const shipped      = stock.filter(s => s.status === 'shipped');
  const stations     = useMemo(() => [...new Set(stock.map(s => s.stationId).filter(Boolean))].sort(), [stock]);

  const displayList  = tab === 'ready' ? readyToShip : tab === 'shipped' ? shipped : shipments;

  const filtered = useMemo(() => {
    if (tab === 'shipments') {
      return shipments.filter(s => {
        if (search) {
          const q = search.toLowerCase();
          return (s.vessel||'').toLowerCase().includes(q)
            || (s.stationId||'').toLowerCase().includes(q);
        }
        return true;
      });
    }
    return displayList.filter(s => {
      if (station && s.stationId !== station) return false;
      if (search) {
        const q = search.toLowerCase();
        return (s.bagSerial||'').toLowerCase().includes(q)
          || (s.farmerName||'').toLowerCase().includes(q);
      }
      return true;
    });
  }, [tab, displayList, shipments, station, search]);

  const readyWeight   = sumField(readyToShip, 'stationWeight');
  const shippedWeight = sumField(shipped, 'stationWeight');

  function exportReady() {
    csvExport(readyToShip.map(s => ({
      Bag_Serial:   s.bagSerial || '',
      Farmer:       s.farmerName || '',
      Farmer_ID:    s.farmerId || '',
      Station:      s.stationId || '',
      Weight_kg:    s.stationWeight || '',
      Preship_kg:   s.preShipWeight || '',
      Reweighed_By: s.reweighedBy || '',
    })), `KCDL_ReadyToShip_${new Date().toISOString().slice(0,10)}.csv`);
  }

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🛳️ Shipments Monitor</div>
          <div className="page-subtitle">Track copra from warehouse clearance through to vessel loading</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={exportReady} type="button">⬇ Export Ready List</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        {[
          { icon:'✅', val: readyToShip.length, lbl:'Ready to Ship', col:'var(--green)',  sub: fmt.kg(readyWeight) },
          { icon:'🛳️', val: shipped.length,     lbl:'Shipped Bags',  col:'var(--teal)',  sub: fmt.kg(shippedWeight) },
          { icon:'📋', val: shipments.length,   lbl:'Shipment Records',col:'var(--purple)', sub: '' },
          { icon:'⚖️', val: fmt.kg(readyWeight + shippedWeight), lbl:'Total Dispatched', col:'var(--gold)', sub: '' },
        ].map(s => (
          <div key={s.lbl} className="stat-card" style={{ '--accent-color': s.col }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value" style={{ fontSize: s.val.toString().length > 6 ? '1rem':'1.5rem' }}>{s.val}</div>
            <div className="stat-label">{s.lbl}</div>
            {s.sub && <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:6, fontFamily:'var(--font-mono)' }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab==='ready'?' active':''}`} onClick={()=>setTab('ready')} type="button">
          Ready to Ship ({readyToShip.length})
        </button>
        <button className={`tab-btn${tab==='shipped'?' active':''}`} onClick={()=>setTab('shipped')} type="button">
          Shipped Bags ({shipped.length})
        </button>
        <button className={`tab-btn${tab==='shipments'?' active':''}`} onClick={()=>setTab('shipments')} type="button">
          Shipment Records ({shipments.length})
        </button>
      </div>

      <div className="toolbar">
        <div className="search-bar">
          <input placeholder={tab==='shipments'?'Search vessel, warehouse…':'Search bag serial, farmer…'}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {tab !== 'shipments' && (
          <select className="form-select" style={{ width:190 }} value={station} onChange={e => setStation(e.target.value)}>
            <option value="">All Warehouses</option>
            {stations.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(search||station) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStation(''); }} type="button">✕ Clear</button>
        )}
      </div>

      {/* Ready to ship / Shipped bags table */}
      {tab !== 'shipments' && (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Bag Serial</th>
                <th>Farmer</th>
                <th>Farmer ID</th>
                <th>Warehouse</th>
                <th>Weight (kg)</th>
                <th>Pre-Ship (kg)</th>
                <th>Reweighed By</th>
                <th>Reweighed At</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="tbl-mono" style={{ color:'var(--green)', fontWeight:700 }}>{s.bagSerial || s.id.slice(0,8)}</td>
                  <td style={{ fontWeight:600 }}>{s.farmerName || '—'}</td>
                  <td className="tbl-mono" style={{ color:'var(--text-muted)' }}>{s.farmerId || '—'}</td>
                  <td style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{s.stationId || '—'}</td>
                  <td className="tbl-mono" style={{ fontWeight:700, color:'var(--gold)' }}>
                    {s.stationWeight ? (+s.stationWeight).toFixed(2) : '—'}
                  </td>
                  <td className="tbl-mono">{s.preShipWeight ? (+s.preShipWeight).toFixed(2) : '—'}</td>
                  <td style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{s.reweighedBy || '—'}</td>
                  <td className="tbl-mono" style={{ fontSize:'0.76rem', color:'var(--text-muted)' }}>
                    {fmt.datetime(s.reweighedAt || s.shippedAt)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>No bags</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding:'10px 14px', fontWeight:700, color:'var(--text-secondary)', borderTop:'1px solid var(--border)' }}>
                    TOTAL ({filtered.length} bags)
                  </td>
                  <td className="tbl-mono" style={{ fontWeight:700, color:'var(--gold)', borderTop:'1px solid var(--border)' }}>
                    {sumField(filtered,'stationWeight').toLocaleString('en',{minimumFractionDigits:2})}
                  </td>
                  <td colSpan={3} style={{ borderTop:'1px solid var(--border)' }} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Shipment records table */}
      {tab === 'shipments' && (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Vessel</th>
                <th>Warehouse</th>
                <th>Sacks</th>
                <th>Weight (kg)</th>
                <th>Status</th>
                <th>Dispatched By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="tbl-mono">{fmt.date(s.date || s.createdAt)}</td>
                  <td style={{ fontWeight:700, color:'var(--teal-light)' }}>{s.vessel || s.vesselName || '—'}</td>
                  <td style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{s.stationId || '—'}</td>
                  <td className="tbl-mono">{s.sacks || (s.bagIds||[]).length || '—'}</td>
                  <td className="tbl-mono" style={{ fontWeight:700, color:'var(--gold)' }}>
                    {s.totalWeight ? fmt.kg(s.totalWeight) : '—'}
                  </td>
                  <td>
                    <span className={`tbl-badge ${s.status==='shipped'?'badge-green':'badge-amber'}`}>
                      {s.status || 'pending'}
                    </span>
                  </td>
                  <td style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{s.dispatchedBy || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>No shipment records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
