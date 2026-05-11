// src/sections/Dashboard.jsx
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppData } from '../context/AppDataContext';

import { fmt, sumField, groupBy } from '../utils/helpers';

/* ─── Filter helpers ─────────────────────────────────── */
const TODAY      = new Date().toISOString().slice(0, 10);
const WEEK_AGO   = new Date(Date.now() - 7  * 864e5).toISOString().slice(0, 10);
const MONTH_AGO  = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const YEAR_AGO   = new Date(Date.now() - 365* 864e5).toISOString().slice(0, 10);

const DATE_PRESETS = [
  { label: 'All Time',    from: '',         to: '' },
  { label: 'Today',       from: TODAY,      to: TODAY },
  { label: 'Last 7 days', from: WEEK_AGO,   to: TODAY },
  { label: 'Last 30 days',from: MONTH_AGO,  to: TODAY },
  { label: 'Last Year',   from: YEAR_AGO,   to: TODAY },
  { label: 'Custom…',     from: null,       to: null },
];

function applyDateFilter(arr, dateField, from, to) {
  return arr.filter(r => {
    const d = (r[dateField] || '').slice(0, 10);
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
}

/* ─── Reusable dropdown ──────────────────────────────── */
function Dropdown({ trigger, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          background: 'var(--surface)', border: '1.5px solid var(--border-mid)',
          borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 50,
          minWidth: 190, overflow: 'hidden',
        }}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

/* ─── Reusable filter bar ────────────────────────────── */
function FilterBar({ from, to, setFrom, setTo }) {
  const [custom, setCustom] = useState(false);

  const activeLabel = useMemo(() => {
    if (!from && !to) return 'All Time';
    if (from === TODAY && to === TODAY) return 'Today';
    if (from === WEEK_AGO)  return 'Last 7 days';
    if (from === MONTH_AGO) return 'Last 30 days';
    if (from === YEAR_AGO)  return 'Last Year';
    return `${from || '…'} → ${to || '…'}`;
  }, [from, to]);

  return (
    <div>
      <Dropdown trigger={
        <button type="button" className="btn btn-sm btn-secondary" style={{ gap: 6 }}>
          🗓 {activeLabel} ▾
        </button>
      }>
        {(close) => DATE_PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              if (p.from === null) { setCustom(true); close(); return; }
              setFrom(p.from); setTo(p.to); setCustom(false); close();
            }}
            style={{
              display: 'block', width: '100%', padding: '10px 16px',
              textAlign: 'left', background: activeLabel === p.label ? 'var(--teal-dim)' : 'none',
              border: 'none', cursor: 'pointer', fontSize: '0.85rem',
              color: activeLabel === p.label ? 'var(--teal)' : 'var(--text-primary)',
              fontWeight: activeLabel === p.label ? 700 : 400,
              borderBottom: '1px solid var(--border)',
            }}
          >{p.label}</button>
        ))}
      </Dropdown>

      {custom && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" className="form-input" style={{ width: 148 }}
            value={from} onChange={e => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>to</span>
          <input type="date" className="form-input" style={{ width: 148 }}
            value={to} onChange={e => setTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}

/* ─── Breadcrumb (also handles device back button) ───── */
function Breadcrumb({ label, onBack }) {
  useEffect(() => {
    // Push a history entry so device back fires popstate
    window.history.pushState({ dashDetail: true }, '');
    function onPop() { onBack(); }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onBack]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={onBack}
        style={{ gap: 4, color: 'var(--teal)', fontFamily: 'var(--font-head)', fontWeight: 600 }}
      >
        ← Dashboard
      </button>
      <span style={{ color: 'var(--teal)', fontWeight: 700, fontSize: '1rem' }}>›</span>
      <span style={{
        fontFamily: 'var(--font-head)',
        fontWeight: 800,
        fontSize: '1.05rem',
        color: 'var(--teal)',
        letterSpacing: '-0.2px',
      }}>
        {label}
      </span>
    </div>
  );
}

/* ─── Section header row (title left, filter right) ─── */
function SectionHeader({ title, subtitle, from, to, setFrom, setTo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <FilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DETAIL SCREENS
═══════════════════════════════════════════════════════ */

/* ─── Reusable Sort Bar ───────────────────────────────── */
function SortBar({ sortField, sortDir, setSort, options }) {
  const active = options.find(o => o.field === sortField);
  const label  = active ? `${active.label} ${sortDir === 'asc' ? '↑' : '↓'}` : 'Sort by';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sort by:</span>
      <Dropdown trigger={
        <button type="button" className="btn btn-sm btn-secondary" style={{ gap: 6 }}>
          {label} ▾
        </button>
      }>
        {(close) => options.map(o => {
          const isActive = sortField === o.field;
          const nextDir  = isActive ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc';
          return (
            <button key={o.field} type="button"
              onClick={() => { setSort(o.field, isActive ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc'); close(); }}
              style={{
                display: 'block', width: '100%', padding: '10px 16px',
                textAlign: 'left', background: isActive ? 'var(--teal-dim)' : 'none',
                border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                color: isActive ? 'var(--teal)' : 'var(--text-primary)',
                fontWeight: isActive ? 700 : 400, borderBottom: '1px solid var(--border)',
              }}
            >
              {o.label} {isActive ? (sortDir === 'desc' ? '↓ — tap for ↑' : '↑ — tap for ↓') : '↓'}
            </button>
          );
        })}
      </Dropdown>
    </div>
  );
}

/* 1. CPR Records — by Island */
function DetailCPRRecords({ cprList, onBack }) {
  const [from,      setFrom]      = useState('');
  const [to,        setTo]        = useState('');
  const [sortField, setSortField] = useState('weight');
  const [sortDir,   setSortDir]   = useState('desc');

  const filtered = useMemo(() => applyDateFilter(cprList, 'date', from, to), [cprList, from, to]);

  const rows = useMemo(() => {
    const byIsland = groupBy(filtered, 'island');
    const totalW = sumField(filtered, 'total_weight_cpr');
    return Object.entries(byIsland)
      .map(([island, items]) => {
        const weight = sumField(items, 'total_weight_cpr');
        return {
          island,
          cooperatives: [...new Set(items.map(i => i.cooperative_name).filter(Boolean))].length,
          sessions: items.length,
          weight,
          pct: totalW > 0 ? (weight / totalW) * 100 : 0,
        };
      })
      .sort((a, b) => {
        let av = a[sortField], bv = b[sortField];
        if (sortField === 'island') { av = a.island; bv = b.island; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
        return sortDir === 'asc' ? av - bv : bv - av;
      });
  }, [filtered, sortField, sortDir]);

  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0);
  const totalWeight   = rows.reduce((s, r) => s + r.weight, 0);

  const SORT_OPTS = [
    { field: 'island',   label: 'Island' },
    { field: 'cooperatives', label: 'Cooperatives' },
    { field: 'sessions', label: 'CPR Sessions' },
    { field: 'weight',   label: 'Total Weight' },
    { field: 'pct',      label: '% of Total' },
  ];

  return (
    <div>
      <Breadcrumb label="CPR Records by Island" onBack={onBack} />
      <SectionHeader
        title="CPR Records by Island"
        subtitle={`${totalSessions} sessions · ${fmt.kg(totalWeight)} total`}
        from={from} to={to} setFrom={setFrom} setTo={setTo}
      />
      <SortBar sortField={sortField} sortDir={sortDir} options={SORT_OPTS}
        setSort={(f, d) => { setSortField(f); setSortDir(d); }} />
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Island</th>
              <th style={{ textAlign: 'right' }}>Cooperatives</th>
              <th style={{ textAlign: 'right' }}>CPR Sessions</th>
              <th style={{ textAlign: 'right' }}>Total Weight</th>
              <th style={{ textAlign: 'right' }}>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.island}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{r.island}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.cooperatives || '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.sessions}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{fmt.kg(r.weight)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {r.pct > 0 ? r.pct.toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No records found</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalSessions}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmt.kg(totalWeight)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* 2. CPR Weight — by Cooperative */
function DetailCPRWeight({ cprList, onBack }) {
  const [from,      setFrom]      = useState('');
  const [to,        setTo]        = useState('');
  const [sortField, setSortField] = useState('weight');
  const [sortDir,   setSortDir]   = useState('desc');

  const filtered = useMemo(() => applyDateFilter(cprList, 'date', from, to), [cprList, from, to]);

  const rows = useMemo(() => {
    const byCoop  = groupBy(filtered, 'cooperative_name');
    const totalW  = sumField(filtered, 'total_weight_cpr');
    return Object.entries(byCoop)
      .map(([coop, items]) => {
        const weight = sumField(items, 'total_weight_cpr');
        return {
          cooperative: coop,
          island:      items[0]?.island || '—',
          village:     items[0]?.stationId || '—',
          sessions:    items.length,
          weight,
          pct: totalW > 0 ? (weight / totalW) * 100 : 0,
        };
      })
      .sort((a, b) => {
        if (sortField === 'island')       return sortDir === 'asc' ? a.island.localeCompare(b.island)       : b.island.localeCompare(a.island);
        if (sortField === 'cooperative')  return sortDir === 'asc' ? a.cooperative.localeCompare(b.cooperative) : b.cooperative.localeCompare(a.cooperative);
        if (sortField === 'village')      return sortDir === 'asc' ? a.village.localeCompare(b.village)     : b.village.localeCompare(a.village);
        const av = a[sortField], bv = b[sortField];
        return sortDir === 'asc' ? av - bv : bv - av;
      });
  }, [filtered, sortField, sortDir]);

  const totalWeight   = rows.reduce((s, r) => s + r.weight, 0);
  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0);

  const SORT_OPTS = [
    { field: 'island',      label: 'Island' },
    { field: 'village',     label: 'Village' },
    { field: 'cooperative', label: 'Cooperative' },
    { field: 'sessions',    label: 'CPR Sessions' },
    { field: 'weight',      label: 'Total Weight' },
    { field: 'pct',         label: '% of Total' },
  ];

  return (
    <div>
      <Breadcrumb label="CPR Weight by Cooperative" onBack={onBack} />
      <SectionHeader
        title="CPR Weight by Cooperative"
        subtitle={`${rows.length} cooperatives · ${totalSessions} sessions · ${fmt.kg(totalWeight)}`}
        from={from} to={to} setFrom={setFrom} setTo={setTo}
      />
      <SortBar sortField={sortField} sortDir={sortDir} options={SORT_OPTS}
        setSort={(f, d) => { setSortField(f); setSortDir(d); }} />
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Island</th>
              <th>Warehouse</th>
              <th>Cooperative</th>
              <th style={{ textAlign: 'right' }}>CPR Sessions</th>
              <th style={{ textAlign: 'right' }}>Total Weight</th>
              <th style={{ textAlign: 'right' }}>% Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.cooperative}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{i + 1}</td>
                <td>{r.island}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.village}</td>
                <td style={{ fontWeight: 600 }}>{r.cooperative}</td>
                <td style={{ textAlign: 'right' }}>{r.sessions}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{fmt.kg(r.weight)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {r.pct > 0 ? r.pct.toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No records found</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalSessions}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmt.kg(totalWeight)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* 3. TWC Records — individual records */
function DetailTWCRecords({ twcList, onBack }) {
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortDir,   setSortDir]   = useState('desc');

  const filtered = useMemo(() => applyDateFilter(twcList, 'date', from, to), [twcList, from, to]);
  const totalWeight = useMemo(() => sumField(filtered, 'total_weight_twc'), [filtered]);

  const rows = useMemo(() => {
    return [...filtered]
      .map(t => ({
        ...t,
        _weight: parseFloat(t.total_weight_twc) || 0,
        _sacks:  parseInt(t.number_of_sacks) || 0,
        _pct:    totalWeight > 0 ? ((parseFloat(t.total_weight_twc)||0) / totalWeight) * 100 : 0,
      }))
      .sort((a, b) => {
        if (sortField === 'date')        return sortDir === 'asc' ? (a.date||'').localeCompare(b.date||'')        : (b.date||'').localeCompare(a.date||'');
        if (sortField === 'island')      return sortDir === 'asc' ? (a.island||'').localeCompare(b.island||'')    : (b.island||'').localeCompare(a.island||'');
        if (sortField === 'cooperative') return sortDir === 'asc' ? (a.cooperative_name||'').localeCompare(b.cooperative_name||'') : (b.cooperative_name||'').localeCompare(a.cooperative_name||'');
        const av = sortField === '_weight' ? a._weight : sortField === '_sacks' ? a._sacks : a._pct;
        const bv = sortField === '_weight' ? b._weight : sortField === '_sacks' ? b._sacks : b._pct;
        return sortDir === 'asc' ? av - bv : bv - av;
      });
  }, [filtered, totalWeight, sortField, sortDir]);

  const totalSacks     = rows.reduce((s, r) => s + r._sacks, 0);
  const totalShipments = rows.length;

  const SORT_OPTS = [
    { field: 'date',        label: 'Date' },
    { field: 'island',      label: 'Island' },
    { field: 'cooperative', label: 'Cooperative' },
    { field: '_sacks',      label: 'Sacks' },
    { field: '_weight',     label: 'Total Weight' },
    { field: '_pct',        label: '% of Total' },
  ];

  return (
    <div>
      <Breadcrumb label="TWC Records by Island" onBack={onBack} />
      <SectionHeader
        title="TWC Records by Island"
        subtitle={`${totalShipments} shipments · ${totalSacks.toLocaleString()} sacks · ${fmt.kg(totalWeight)}`}
        from={from} to={to} setFrom={setFrom} setTo={setTo}
      />
      <SortBar sortField={sortField} sortDir={sortDir} options={SORT_OPTS}
        setSort={(f, d) => { setSortField(f); setSortDir(d); }} />
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Island</th>
              <th>Cooperative</th>
              <th style={{ textAlign: 'right' }}>Shipments</th>
              <th style={{ textAlign: 'right' }}>Sacks</th>
              <th style={{ textAlign: 'right' }}>Total Weight</th>
              <th style={{ textAlign: 'right' }}>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{i + 1}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{r.date || '—'}</td>
                <td style={{ fontWeight: 600 }}>{r.island || '—'}</td>
                <td>{r.cooperative_name || '—'}</td>
                <td style={{ textAlign: 'right' }}>1</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r._sacks.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>{fmt.kg(r._weight)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {r._pct > 0 ? r._pct.toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No records found</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ fontWeight: 700 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalShipments}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{totalSacks.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmt.kg(totalWeight)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* 4. Inspectors — list with island */
function DetailInspectors({ inspectors, onBack }) {
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return inspectors
      .filter(u => !q
        || (u.email           || '').toLowerCase().includes(q)
        || (u.displayName     || '').toLowerCase().includes(q)
        || (u.name            || '').toLowerCase().includes(q)
        || (u.island          || '').toLowerCase().includes(q)
        || (u.stationId       || '').toLowerCase().includes(q)
        || (u.stationName     || '').toLowerCase().includes(q)
        || (u.cooperative     || '').toLowerCase().includes(q)
        || (u.cooperativeName || '').toLowerCase().includes(q)
        || (u.village         || '').toLowerCase().includes(q)
        || (u.warehouses || []).some(w =>
            (w.island  || '').toLowerCase().includes(q) ||
            (w.village || '').toLowerCase().includes(q))
        || (u.phone           || '').includes(q))
      .sort((a, b) => (a.island || '').localeCompare(b.island || ''));
  }, [inspectors, search]);

  return (
    <div>
      <Breadcrumb label="Inspectors" onBack={onBack} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Inspector Accounts</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{rows.length} inspectors with assigned warehouses</div>
        </div>
        <div className="search-bar" style={{ maxWidth: 240 }}>
          <input
            type="text"
            placeholder="Search inspectors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Island</th>
              <th>Full Name</th>
              <th>Cooperative Assigned to</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Warehouses</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.island || '—'}</td>
                <td style={{ fontWeight: 600 }}>{u.displayName || u.name || '—'}</td>
                <td>{u.cooperativeName || u.cooperative || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{u.phone || '—'}</td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  {u.stationId
                    ? <>{u.stationId}{u.stationName ? <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>{u.stationName}</span> : null}</>
                    : '—'}
                </td>
                <td>
                  <span className={`tbl-badge ${u.role === 'admin' || u.role === 'hq' ? 'badge-teal' : 'badge-muted'}`}>
                    {u.role || 'inspector'}
                  </span>
                </td>
                <td>
                  {(() => {
                    const whs = u.warehouses?.length
                      ? u.warehouses
                      : u.island ? [{ island: u.island, village: u.stationId || '' }] : [];
                    return whs.length === 0
                      ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                      : whs.map((w, i) => (
                          <div key={i} style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>
                            <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{w.island}</span>
                            {w.village && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>→ {w.village}</span>}
                          </div>
                        ));
                  })()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No inspectors found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* 5. Sacks/Bags Register */
function DetailBagsInStorage({ stock, onBack }) {
  const [stationFilter, setStationFilter] = useState('');
  const [showRegister,  setShowRegister]  = useState(false);
  const [showDistrib,   setShowDistrib]   = useState(false);

  // Register form state
  const [regPrefix,     setRegPrefix]     = useState('');
  const [regStart,      setRegStart]      = useState('');
  const [regEnd,        setRegEnd]        = useState('');
  const [regStation,    setRegStation]    = useState('');
  const [regBagType,    setRegBagType]    = useState('');

  // Distribute form state
  const [distFrom,      setDistFrom]      = useState('');
  const [distTo,        setDistTo]        = useState('');
  const [distSerialStart, setDistSerialStart] = useState('');
  const [distSerialEnd,   setDistSerialEnd]   = useState('');
  const [distDate,        setDistDate]        = useState(new Date().toISOString().slice(0,10));
  const [distNotes,       setDistNotes]       = useState('');

  // Serial validation — must match e.g. TRW-0001 (letters-digits) or pure digits
  const SERIAL_RE = /^[A-Za-z]{2,5}-\d{3,6}$|^\d{4,8}$/;
  const serialStartErr = distSerialStart && !SERIAL_RE.test(distSerialStart.trim());
  const serialEndErr   = distSerialEnd   && !SERIAL_RE.test(distSerialEnd.trim());

  const stations = useMemo(() =>
    [...new Set(stock.map(s => s.stationId).filter(Boolean))].sort(), [stock]);

  const byStation = useMemo(() => {
    const base = stationFilter ? stock.filter(s => s.stationId === stationFilter) : stock;
    const grp  = groupBy(base, 'stationId');
    return Object.entries(grp).map(([sid, bags]) => ({
      stationId:        sid,
      total:            bags.length,
      emptyShed:        bags.filter(b => b.status === 'empty_shed').length,
      emptyWarehouse:   bags.filter(b => b.status === 'empty_warehouse').length,
      distributed:      bags.filter(b => b.status === 'distributed').length,
      weighedShed:      bags.filter(b => b.status === 'in_shed').length,
      weighedWarehouse: bags.filter(b => b.status === 'in_warehouse').length,
      pending:          bags.filter(b => ['pending','registered','recently_weighed'].includes(b.status)).length,
    })).sort((a, b) => b.total - a.total);
  }, [stock, stationFilter]);

  const totals = byStation.reduce((acc, r) => ({
    total:            acc.total            + r.total,
    emptyShed:        acc.emptyShed        + r.emptyShed,
    emptyWarehouse:   acc.emptyWarehouse   + r.emptyWarehouse,
    distributed:      acc.distributed      + r.distributed,
    weighedShed:      acc.weighedShed      + r.weighedShed,
    weighedWarehouse: acc.weighedWarehouse + r.weighedWarehouse,
    pending:          acc.pending          + r.pending,
  }), { total:0, emptyShed:0, emptyWarehouse:0, distributed:0, weighedShed:0, weighedWarehouse:0, pending:0 });

  // Serial preview
  const regPreview = useMemo(() => {
    const s = parseInt(regStart), e = parseInt(regEnd);
    if (!regStart || !regEnd || isNaN(s) || isNaN(e) || e < s) return null;
    const count = e - s + 1;
    const pad = Math.max(regStart.length, regEnd.length);
    const first = regPrefix + String(s).padStart(pad, '0');
    const last  = regPrefix + String(e).padStart(pad, '0');
    return { count, first, last };
  }, [regPrefix, regStart, regEnd]);

  const thStyle = { textAlign: 'right', fontSize: '0.7rem', whiteSpace: 'nowrap' };
  const tdRight = { textAlign: 'right', fontFamily: 'var(--font-mono)' };

  return (
    <div>
      <Breadcrumb label="Sacks/Bags Register" onBack={onBack} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Sacks/Bags by Station</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{totals.total} bags across {byStation.length} stations</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-select" style={{ width: 160 }}
            value={stationFilter} onChange={e => setStationFilter(e.target.value)}>
            <option value="">All Warehouses</option>
            {stations.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-sm btn-primary"   type="button" onClick={() => setShowRegister(true)}>📋 Register</button>
          <button className="btn btn-sm btn-secondary" type="button" onClick={() => setShowDistrib(true)}>📦 Distribute</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Warehouse</th>
              <th style={thStyle}>Total Bags</th>
              <th style={thStyle}>Empty Bags at Shed</th>
              <th style={thStyle}>Empty Bags at Warehouse</th>
              <th style={thStyle}>Distributed to Farmers</th>
              <th style={thStyle}>Weighed & Stored in Shed</th>
              <th style={thStyle}>Weighed & Stored in Warehouse</th>
              <th style={thStyle}>Still to Arrive at Station</th>
            </tr>
          </thead>
          <tbody>
            {byStation.map(r => (
              <tr key={r.stationId}>
                <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{r.stationId}</td>
                <td style={{ ...tdRight, fontWeight: 700, color: 'var(--teal)' }}>{r.total}</td>
                <td style={{ ...tdRight, color: 'var(--amber)' }}>{r.emptyShed || '—'}</td>
                <td style={{ ...tdRight, color: 'var(--purple)' }}>{r.emptyWarehouse || '—'}</td>
                <td style={{ ...tdRight, color: 'var(--green)' }}>{r.distributed || '—'}</td>
                <td style={{ ...tdRight, color: 'var(--teal)' }}>{r.weighedShed || '—'}</td>
                <td style={{ ...tdRight, color: 'var(--gold)' }}>{r.weighedWarehouse || '—'}</td>
                <td style={{ ...tdRight, color: 'var(--text-muted)' }}>{r.pending || '—'}</td>
              </tr>
            ))}
            {byStation.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No bags found</td></tr>
            )}
          </tbody>
          {byStation.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ fontWeight: 700 }}>Total</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{totals.total}</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{totals.emptyShed}</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{totals.emptyWarehouse}</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{totals.distributed}</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{totals.weighedShed}</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{totals.weighedWarehouse}</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{totals.pending}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Register Modal ── */}
      {showRegister && (
        <div className="modal-overlay" onClick={() => setShowRegister(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <div className="modal-title">📋 Register Bags</div>
              <button className="modal-close" type="button" onClick={() => setShowRegister(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 14 }}>
                <div className="form-label">Bag Type / Description</div>
                <input className="form-input" placeholder="e.g. Hessian 50kg sack"
                  value={regBagType} onChange={e => setRegBagType(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <div className="form-label">Assign to Station</div>
                <select className="form-select" value={regStation} onChange={e => setRegStation(e.target.value)}>
                  <option value="">— Select Station —</option>
                  {stations.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-label" style={{ marginBottom: 8, fontWeight: 700 }}>Serial Number Range</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-label">Prefix (optional)</div>
                  <input className="form-input" placeholder="e.g. TRW-"
                    value={regPrefix} onChange={e => setRegPrefix(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-label">Start No.</div>
                  <input className="form-input" placeholder="0001"
                    value={regStart} onChange={e => setRegStart(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-label">End No.</div>
                  <input className="form-input" placeholder="0150"
                    value={regEnd} onChange={e => setRegEnd(e.target.value)} />
                </div>
              </div>
              {regPreview && (
                <div style={{ background: 'var(--teal-dim)', border: '1px solid var(--teal)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: 'var(--teal)', marginTop: 8 }}>
                  ✅ Will register <strong>{regPreview.count.toLocaleString()} bags</strong>: {regPreview.first} → {regPreview.last}
                </div>
              )}
              {regStart && regEnd && !regPreview && (
                <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: 'var(--red)', marginTop: 8 }}>
                  ⚠️ End number must be greater than or equal to start number.
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" type="button" onClick={() => setShowRegister(false)}>Cancel</button>
              <button className="btn btn-primary" type="button"
                disabled={!regPreview || !regStation}
                onClick={() => {
                  // TODO: write batch of regPreview.count docs to Firestore
                  alert(`Registered ${regPreview.count} bags (${regPreview.first} → ${regPreview.last}) for station ${regStation}.\n\nFirestore write goes here.`);
                  setShowRegister(false);
                }}>
                Register {regPreview ? `${regPreview.count} Bags` : 'Bags'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Distribute Modal ── */}
      {showDistrib && (
        <div className="modal-overlay" onClick={() => setShowDistrib(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <div className="modal-title">📦 Distribute Bags</div>
              <button className="modal-close" type="button" onClick={() => setShowDistrib(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-label">From (Station / HQ)</div>
                  <select className="form-select" value={distFrom} onChange={e => setDistFrom(e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="HQ">Head Office (HQ)</option>
                    {stations.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-label">To (Station)</div>
                  <select className="form-select" value={distTo} onChange={e => setDistTo(e.target.value)}>
                    <option value="">— Select —</option>
                    {stations.filter(s => s !== distFrom).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-label" style={{ marginBottom: 8, fontWeight: 700 }}>Bag Serial Range</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-label">Serial Start</div>
                  <input className="form-input" placeholder="e.g. TRW-0001"
                    value={distSerialStart}
                    onChange={e => setDistSerialStart(e.target.value)}
                    style={serialStartErr ? { borderColor: 'var(--red)', background: 'rgba(239,68,68,0.06)' } : {}} />
                  {serialStartErr && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 4 }}>
                      ⚠️ Invalid format — use e.g. <strong>TRW-0001</strong>
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-label">Serial End</div>
                  <input className="form-input" placeholder="e.g. TRW-0050"
                    value={distSerialEnd}
                    onChange={e => setDistSerialEnd(e.target.value)}
                    style={serialEndErr ? { borderColor: 'var(--red)', background: 'rgba(239,68,68,0.06)' } : {}} />
                  {serialEndErr && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 4 }}>
                      ⚠️ Invalid format — use e.g. <strong>TRW-0050</strong>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-label">Distribution Date</div>
                  <input type="date" className="form-input" value={distDate} onChange={e => setDistDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div className="form-label">Notes</div>
                <textarea className="form-input" rows={2} placeholder="Optional notes…"
                  value={distNotes} onChange={e => setDistNotes(e.target.value)}
                  style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" type="button" onClick={() => setShowDistrib(false)}>Cancel</button>
              <button className="btn btn-primary" type="button"
                disabled={!distFrom || !distTo || !distSerialStart || serialStartErr || serialEndErr}
                onClick={() => {
                  // TODO: write distribution record to Firestore
                  alert(`Distribution recorded:\n${distSerialStart} → ${distSerialEnd || distSerialStart}\nFrom: ${distFrom} → To: ${distTo}\nDate: ${distDate}\n\nFirestore write goes here.`);
                  setShowDistrib(false);
                }}>
                Confirm Distribution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* 6. Shed/Warehouse — Ready to Ship */
function DetailReadyToShip({ stock, onBack }) {
  const [island,  setIsland]  = useState('');
  const [station, setStation] = useState('');

  const ready   = useMemo(() => stock.filter(s => s.status === 'ready_to_ship'), [stock]);
  const islands = useMemo(() => [...new Set(ready.map(s => s.island || s.stationId).filter(Boolean))].sort(), [ready]);

  const filteredByIsland = useMemo(() =>
    ready.filter(s => !island || (s.island || s.stationId) === island), [ready, island]);

  const stationsForIsland = useMemo(() =>
    [...new Set(filteredByIsland.map(s => s.stationId).filter(Boolean))].sort(), [filteredByIsland]);

  const filtered = useMemo(() =>
    filteredByIsland.filter(s => !station || s.stationId === station), [filteredByIsland, station]);

  const byStation = useMemo(() => {
    const grp = groupBy(filtered, 'stationId');
    return Object.entries(grp).map(([sid, bags]) => ({
      stationId: sid,
      island:    bags[0]?.island || '—',
      bags:      bags.length,
      weight:    sumField(bags, 'stationWeight'),
    })).sort((a, b) => b.bags - a.bags);
  }, [filtered]);

  const totalBags   = byStation.reduce((s, r) => s + r.bags,   0);
  const totalWeight = byStation.reduce((s, r) => s + r.weight, 0);

  const subheader = station
    ? `Bags at Warehouse of ${station} Station`
    : island
    ? `Bags at Warehouse — ${island} Island`
    : 'Bags at Warehouse — by Warehouse';

  // Reset station if island changes and station no longer valid
  useEffect(() => {
    if (station && !stationsForIsland.includes(station)) setStation('');
  }, [island, stationsForIsland, station]);

  return (
    <div>
      <Breadcrumb label="Shed/Warehouse" onBack={onBack} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{subheader}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{totalBags} bags · {fmt.kg(totalWeight)} awaiting vessel loading</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-select" style={{ width: 150 }}
            value={island} onChange={e => { setIsland(e.target.value); setStation(''); }}>
            <option value="">All Islands</option>
            {islands.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <select className="form-select" style={{ width: 150 }}
            value={station} onChange={e => setStation(e.target.value)}
            disabled={stationsForIsland.length === 0}>
            <option value="">All Warehouses</option>
            {stationsForIsland.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Island</th>
              <th>Warehouse</th>
              <th style={{ textAlign: 'right' }}>Bags</th>
              <th style={{ textAlign: 'right' }}>Total Weight</th>
            </tr>
          </thead>
          <tbody>
            {byStation.map((r, i) => (
              <tr key={r.stationId}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{i + 1}</td>
                <td>{r.island}</td>
                <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{r.stationId}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.bags}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{fmt.kg(r.weight)}</td>
              </tr>
            ))}
            {byStation.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No bags ready to ship</td></tr>
            )}
          </tbody>
          {byStation.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalBags}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmt.kg(totalWeight)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* 7. Registered Farmers — by Island */
function DetailFarmers({ farmers, onBack }) {
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  const rows = useMemo(() => {
    const byIsland = groupBy(farmers, 'island');
    return Object.entries(byIsland)
      .map(([island, items]) => ({
        island,
        total:  items.length,
        male:   items.filter(f => f.gender === 'Male').length,
        female: items.filter(f => f.gender === 'Female').length,
        other:  items.filter(f => f.gender && f.gender !== 'Male' && f.gender !== 'Female').length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [farmers]);

  const totals = rows.reduce((acc, r) => ({
    total:  acc.total  + r.total,
    male:   acc.male   + r.male,
    female: acc.female + r.female,
    other:  acc.other  + r.other,
  }), { total: 0, male: 0, female: 0, other: 0 });

  return (
    <div>
      <Breadcrumb label="Registered Farmers" onBack={onBack} />
      <SectionHeader
        title="Registered Farmers by Island"
        subtitle={`${totals.total} total · ${totals.male} male · ${totals.female} female`}
        from={from} to={to} setFrom={setFrom} setTo={setTo}
      />
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Island</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Male</th>
              <th style={{ textAlign: 'right' }}>Female</th>
              <th style={{ textAlign: 'right' }}>Other</th>
              <th style={{ textAlign: 'right' }}>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.island}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{r.island}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.total}</td>
                <td style={{ textAlign: 'right', color: 'var(--teal)' }}>{r.male}</td>
                <td style={{ textAlign: 'right', color: 'var(--purple)' }}>{r.female}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.other || '—'}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {totals.total > 0 ? ((r.total / totals.total) * 100).toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No farmers registered</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight: 700 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totals.total}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--teal)' }}>{totals.male}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--purple)' }}>{totals.female}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totals.other}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ─── Generate Report dropdown menu ─────────────────── */
const REPORT_MENU = [
  { id: 'cpr_summary',        icon: '📋', label: 'CPR Summary' },
  { id: 'twc_summary',        icon: '🚢', label: 'TWC Summary' },
  { id: 'island_summary',     icon: '🏝️', label: 'Island Production' },
  { id: 'station_report',     icon: '📡', label: 'Station Activity' },
  { id: 'daily_report',       icon: '📅', label: 'Daily Operations' },
  { id: 'monthly_report',     icon: '📆', label: 'Monthly Summary' },
  { id: 'farmer_report',      icon: '👩‍🌾', label: 'Farmer Participation' },
  { id: 'stock_report',       icon: '⚖️',  label: 'Stock Status' },
  { id: 'shipment_report',    icon: '🛳️', label: 'Shipment Manifest' },
  { id: 'cooperative_report', icon: '🤝', label: 'Cooperative Report' },
];

function GenerateReportMenu({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn btn-sm btn-primary"
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ gap: 6 }}
      >
        📑 Generate Report {open ? '▴' : '▾'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          background: 'var(--surface)', border: '1.5px solid var(--border-mid)',
          borderRadius: 12, boxShadow: 'var(--shadow-lg)', zIndex: 100,
          minWidth: 230, overflow: 'hidden',
          animation: 'fadeIn 0.12s ease',
        }}>
          <div style={{ padding: '8px 14px 6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>
            Reports Centre
          </div>
          {REPORT_MENU.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onNavigate('reports', r.id);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px',
                border: 'none', background: 'none', cursor: 'pointer',
                textAlign: 'left', fontSize: '0.84rem',
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal-dim)'; e.currentTarget.style.color = 'var(--teal)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{r.icon}</span>
              <span style={{ fontWeight: 500 }}>{r.label}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.8rem' }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════════════ */
export default function Dashboard({ onNavigate, dashBackRef }) {
  const { cprEntries: cprList, twcEntries: twcList, stock, farmers, users: allUsers, loading } = useAppData();
  const inspectors = allUsers.filter(u => u.stationId || u.role === 'inspector');
  const [detail, setDetail] = useState(null); // which card is open

  // Keep hardware back button coordinated with App's handler
  useEffect(() => {
    if (dashBackRef) {
      dashBackRef.current = detail ? () => setDetail(null) : null;
    }
  }, [detail, dashBackRef]);


  // Derived
  const totalCPRWeight  = sumField(cprList, 'total_weight_cpr');
  const totalTWCWeight  = sumField(twcList, 'total_weight_twc');
  const totalSacks      = twcList.reduce((s, t) => s + (parseInt(t.number_of_sacks) || 0), 0);
  const inShed          = stock.filter(s => s.status === 'in_shed');
  const inWarehouse     = stock.filter(s => s.status === 'in_warehouse');
  const readyToShip     = stock.filter(s => s.status === 'ready_to_ship');
  const shedWeight      = sumField(inShed, 'stationWeight');
  const warehouseWeight = sumField(inWarehouse, 'stationWeight');
  const shipWeight      = sumField(readyToShip, 'stationWeight');

  // Island bar chart
  const byIsland = groupBy(cprList, 'island');
  const islandWeights = Object.entries(byIsland)
    .map(([island, items]) => ({ island, weight: sumField(items, 'total_weight_cpr') }))
    .sort((a, b) => b.weight - a.weight);
  const maxIslandWeight = islandWeights[0]?.weight || 1;

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  // ── Detail screen routing ──
  if (detail === 'cpr_records')  return <DetailCPRRecords   cprList={cprList}         onBack={() => setDetail(null)} />;
  if (detail === 'cpr_weight')   return <DetailCPRWeight    cprList={cprList}         onBack={() => setDetail(null)} />;
  if (detail === 'twc_records')  return <DetailTWCRecords   twcList={twcList}         onBack={() => setDetail(null)} />;
  if (detail === 'inspectors')   return <DetailInspectors   inspectors={inspectors}   onBack={() => setDetail(null)} />;
  if (detail === 'bags_storage') return <DetailBagsInStorage stock={stock}            onBack={() => setDetail(null)} />;
  if (detail === 'ready_ship')   return <DetailReadyToShip  stock={stock}             onBack={() => setDetail(null)} />;

  // ── Clickable stat card ──
  function ClickCard({ id, icon, value, label, accent, sub, hint }) {
    return (
      <button
        type="button"
        className="stat-card stat-card-btn"
        style={{ '--accent-color': accent, textAlign: 'left', width: '100%' }}
        onClick={() => setDetail(id)}
      >
        <div className="stat-icon">{icon}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub  && <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{sub}</div>}
        {hint && <div style={{ marginTop: 4, fontSize: '0.68rem', color: 'var(--teal)', fontWeight: 600 }}>Tap to view details →</div>}
      </button>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="dashboard-header-bar">
        <div className="dashboard-greeting">
          <div className="dashboard-greeting-text">{greeting}, HQ Admin</div>
          <div className="dashboard-greeting-title">Copra Operations Overview</div>
          <div className="dashboard-greeting-date">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="dashboard-live-badge">
            <div className="live-dot" /> Live · Firebase
          </div>
          <GenerateReportMenu onNavigate={onNavigate} />
        </div>
      </div>

      {/* Clickable KPI cards */}
      <div className="stat-grid">
        <ClickCard id="cpr_records"  icon="📋" value={cprList.length}          label="Total CPR Records"   accent="var(--teal)"         sub={`All time · ${[...new Set(cprList.map(c=>c.island))].length} islands`} hint />
        <ClickCard id="cpr_weight"   icon="⚖️"  value={fmt.kg(totalCPRWeight)}  label="Total CPR Weight"    accent="var(--gold)"         sub={`${[...new Set(cprList.map(c=>c.cooperative_name).filter(Boolean))].length} cooperatives`} hint />
        <ClickCard id="twc_records"  icon="🚢" value={twcList.length}          label="Total TWC Records"   accent="var(--purple)"       sub={`${totalSacks.toLocaleString()} sacks shipped`} hint />
        <ClickCard id="inspectors"   icon="👤" value={inspectors.length}       label="Inspectors"          accent="var(--green)"        sub="With assigned stations" hint />
        <ClickCard id="bags_storage" icon="🛍️" value={inShed.length + inWarehouse.length} label="Sacks/Bags Register" accent="var(--amber)" sub={fmt.kg(shedWeight + warehouseWeight)} hint />
        <ClickCard id="ready_ship"   icon="🏭" value={readyToShip.length}      label="Shed/Warehouse"      accent="var(--green)"        sub={fmt.kg(shipWeight)} hint />

        {/* Registered Farmers → opens Farmers Registry section */}
        <button
          type="button"
          className="stat-card stat-card-btn"
          style={{ '--accent-color': 'var(--teal-light)', textAlign: 'left', width: '100%' }}
          onClick={() => onNavigate('farmers')}
        >
          <div className="stat-icon">👩‍🌾</div>
          <div className="stat-value">{farmers.length}</div>
          <div className="stat-label">Registered Farmers</div>
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
            Across {[...new Set(farmers.map(f=>f.island).filter(Boolean))].length} islands
          </div>
          <div style={{ marginTop: 4, fontSize: '0.68rem', color: 'var(--teal)', fontWeight: 600 }}>Tap to view registry →</div>
        </button>

        {/* CPR Weight by Island — same-size square card in the 2-col grid */}
        <div
          className="stat-card"
          style={{
            '--accent-color': 'var(--gold)',
            padding: '12px 10px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ marginBottom: 6, flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ⚖️ CPR by Island
            </div>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => onNavigate('analytics')}
              type="button"
              style={{ padding: '2px 0', fontSize: '0.65rem', color: 'var(--teal)', fontWeight: 600 }}
            >
              Analytics →
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {islandWeights.slice(0, 4).map((row, i) => (
              <div key={row.island} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={row.island}>{row.island}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 700 }}>{fmt.kg(row.weight)}</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    width: `${Math.min(100, (row.weight / maxIslandWeight) * 100)}%`,
                    background: ['var(--teal)','var(--gold)','var(--purple)','var(--green)','var(--amber)'][i % 5],
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            ))}
            {islandWeights.length === 0 && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                No data
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
