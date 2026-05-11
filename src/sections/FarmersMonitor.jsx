// src/sections/FarmersMonitor.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppData } from '../context/AppDataContext';

import { fmt, csvExport } from '../utils/helpers';

/* ─── Reusable dropdown button ───────────────────────── */
function FilterDropdown({ value, options, placeholder, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOut(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [open]);

  const label = value
    ? (options.find(o => o.value === value)?.label || value)
    : placeholder;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{ gap: 6, minWidth: 130, opacity: disabled ? 0.5 : 1 }}
      >
        {label} ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          background: 'var(--surface)', border: '1.5px solid var(--border-mid)',
          borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 50,
          minWidth: 190, overflow: 'hidden', maxHeight: 260, overflowY: 'auto',
        }}>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            style={{
              display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
              background: !value ? 'var(--teal-dim)' : 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.85rem', color: !value ? 'var(--teal)' : 'var(--text-primary)',
              fontWeight: !value ? 700 : 400, borderBottom: '1px solid var(--border)',
            }}
          >
            {placeholder}
          </button>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                background: value === o.value ? 'var(--teal-dim)' : 'none',
                border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                color: value === o.value ? 'var(--teal)' : 'var(--text-primary)',
                fontWeight: value === o.value ? 700 : 400,
                borderBottom: '1px solid var(--border)',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FARMERS MONITOR
═══════════════════════════════════════════════════════ */
export default function FarmersMonitor() {
  const { farmers, loading } = useAppData();
  const [search,  setSearch]  = useState('');
  const [island,  setIsland]  = useState('');
  const [station, setStation] = useState('');
  const [detail,  setDetail]  = useState(null);


  /* ── Derived filter options ── */
  const allIslands = useMemo(() =>
    [...new Set(farmers.map(f => f.island).filter(Boolean))].sort()
      .map(i => ({ value: i, label: i })),
    [farmers]
  );

  // Stations scoped to selected island (or all stations when no island selected)
  const availableStations = useMemo(() => {
    const base = island ? farmers.filter(f => f.island === island) : farmers;
    return [...new Set(base.map(f => f.stationId).filter(Boolean))].sort()
      .map(s => ({ value: s, label: s }));
  }, [farmers, island]);

  // Reset station when island changes and current station is no longer available
  useEffect(() => {
    if (station && !availableStations.find(s => s.value === station)) {
      setStation('');
    }
  }, [island, availableStations, station]);

  /* ── Filtered rows ── */
  const filtered = useMemo(() => farmers.filter(f => {
    if (island  && f.island    !== island)  return false;
    if (station && f.stationId !== station) return false;
    if (search) {
      const q = search.toLowerCase();
      return (f.name      || '').toLowerCase().includes(q)
          || (f.farmerId  || '').toLowerCase().includes(q)
          || (f.idCard    || '').toLowerCase().includes(q)
          || (f.village   || '').toLowerCase().includes(q)
          || (f.island    || '').toLowerCase().includes(q)
          || (f.stationId || '').toLowerCase().includes(q)
          || (f.phone     || '').includes(q);
    }
    return true;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  [farmers, island, station, search]);

  const totalIslands  = allIslands.length;
  const totalStations = [...new Set(farmers.map(f => f.stationId).filter(Boolean))].length;

  /* ── CSV export ── */
  function handleExport() {
    csvExport(filtered.map(f => ({
      Island:    f.island    || '',
      Station:   f.stationId || '',
      Farmer_ID: f.farmerId  || '',
      Full_Name: f.name      || '',
      Card:      f.idCard    || '',
      Village:   f.village   || '',
      Gender:    f.gender    || '',
      Phone:     f.phone     || '',
      WhatsApp:  f.whatsapp  || '',
    })), `KCDL_Farmers_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-title">👩‍🌾 Farmers Registry</div>
          <div className="page-subtitle">All registered copra farmers across all warehouses</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleExport} type="button">⬇ Export CSV</button>
      </div>

      {/* Summary stat cards — Total · Islands · Stations */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        {[
          { icon: '👥', val: farmers.length, lbl: 'Total Farmers', col: 'var(--teal)'  },
          { icon: '🏝️', val: totalIslands,   lbl: 'Islands',       col: 'var(--gold)'  },
          { icon: '📍', val: totalStations,  lbl: 'Warehouses',      col: 'var(--green)' },
        ].map(s => (
          <div key={s.lbl} className="stat-card" style={{ '--accent-color': s.col }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value" style={{ fontSize: '1.6rem' }}>{s.val}</div>
            <div className="stat-label">{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-bar">
          <input
            placeholder="Search name, ID, warehouse, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Island dropdown filter */}
        <FilterDropdown
          value={island}
          options={allIslands}
          placeholder="All Islands"
          onChange={val => setIsland(val)}
        />

        {/* Station dropdown — scoped to selected island */}
        <FilterDropdown
          value={station}
          options={availableStations}
          placeholder="All Warehouses"
          onChange={val => setStation(val)}
          disabled={availableStations.length === 0}
        />

        {(island || station || search) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setIsland(''); setStation(''); setSearch(''); }}
            type="button"
          >
            ✕ Clear
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {filtered.length} of {farmers.length} farmers
        </div>
      </div>

      {/* Table */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Island</th>
              <th>Warehouse</th>
              <th>Farmer ID</th>
              <th>Full Name</th>
              <th>Card</th>
              <th>Settlement</th>
              <th>Gender</th>
              <th>Phone</th>
              <th>WhatsApp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id}>
                <td style={{ fontWeight: 600, color: 'var(--teal-light)' }}>{f.island || '—'}</td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{f.stationId || '—'}</td>
                <td className="tbl-mono" style={{ color: 'var(--teal-light)', fontWeight: 700 }}>{f.farmerId || '—'}</td>
                <td style={{ fontWeight: 600 }}>{f.name || '—'}</td>
                <td className="tbl-mono">{f.idCard || '—'}</td>
                <td>{f.village || '—'}</td>
                <td>
                  {f.gender ? (
                    <span className={`tbl-badge ${f.gender === 'Female' ? 'badge-purple' : 'badge-teal'}`}>
                      {f.gender}
                    </span>
                  ) : '—'}
                </td>
                <td className="tbl-mono">{f.phone || '—'}</td>
                <td className="tbl-mono" style={{ color: 'var(--green)' }}>{f.whatsapp || '—'}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetail(f)} type="button">View</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  No farmers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Farmer detail modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">👩‍🌾 Farmer Profile — {detail.farmerId}</div>
              <button className="modal-close" onClick={() => setDetail(null)} type="button">✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', background: 'var(--teal)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {detail.gender === 'Female' ? '♀' : '♂'}
                </div>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{detail.name || 'N/A'}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--teal-light)', fontFamily: 'var(--font-mono)' }}>{detail.farmerId}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {detail.island || '—'} · Station: {detail.stationId || '—'}
                  </div>
                </div>
              </div>
              <div className="form-row form-row-2">
                {[
                  ['Island',     detail.island],
                  ['Warehouse',    detail.stationId],
                  ['ID Card',    detail.idCard],
                  ['Settlement', detail.village],
                  ['Gender',     detail.gender],
                  ['Phone',      detail.phone],
                  ['WhatsApp',   detail.whatsapp],
                  ['Email',      detail.email],
                  ['Registered', fmt.datetime(detail.createdAt)],
                  ['Updated',    fmt.datetime(detail.updatedAt)],
                ].map(([k, v]) => (
                  <div key={k} className="form-group">
                    <div className="form-label">{k}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600, padding: '6px 0' }}>
                      {v || '—'}
                    </div>
                  </div>
                ))}
              </div>
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
