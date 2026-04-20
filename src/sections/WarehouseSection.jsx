// src/sections/WarehouseSection.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, onSnapshot, orderBy,
  doc, updateDoc, addDoc, getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { storageGet, storageSet } from '../utils/storage';
import { newDocId, queueWrite } from '../utils/syncManager';

const SORT_OPTIONS = [
  { value: 'date_desc',   label: '📅 Date (Newest)' },
  { value: 'date_asc',    label: '📅 Date (Oldest)' },
  { value: 'weight_desc', label: '⚖️ Weight (High→Low)' },
  { value: 'weight_asc',  label: '⚖️ Weight (Low→High)' },
  { value: 'serial_asc',  label: '🏷️ Serial (A→Z)' },
  { value: 'farmer_asc',  label: '👩‍🌾 Farmer (A→Z)' },
];

const WEIGH_EVENT_TYPES = [
  { value: 'reweigh_damage',  label: '💧 Re-weigh — Damage (wet/dried)' },
  { value: 'reweigh_content', label: '🔄 Re-weigh — Content Change' },
  { value: 'preshipment',     label: '🚢 Pre-shipment Weigh' },
  { value: 'other',           label: '📝 Other' },
];

function applySortBy(arr, sortBy) {
  const a = [...arr];
  switch (sortBy) {
    case 'date_asc':    return a.sort((x,y) => (x.weighedAt||'') < (y.weighedAt||'') ? -1 : 1);
    case 'weight_desc': return a.sort((x,y) => (y.stationWeight||0) - (x.stationWeight||0));
    case 'weight_asc':  return a.sort((x,y) => (x.stationWeight||0) - (y.stationWeight||0));
    case 'serial_asc':  return a.sort((x,y) => (x.bagSerial||'').localeCompare(y.bagSerial||''));
    case 'farmer_asc':  return a.sort((x,y) => (x.farmerName||'').localeCompare(y.farmerName||''));
    default:            return a.sort((x,y) => (x.weighedAt||'') > (y.weighedAt||'') ? -1 : 1);
  }
}

function SortButton({ sortBy, setSortBy }) {
  const [open, setOpen] = useState(false);
  const label = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Sort';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button className="sort-toggle-btn" type="button" onClick={() => setOpen(o => !o)}>↕ {label}</button>
      {open && (
        <div className="sort-dropdown" style={{ left: 'auto', right: 0 }}>
          {SORT_OPTIONS.map(opt => (
            <button key={opt.value} type="button"
              className={`sort-option${sortBy === opt.value ? ' active' : ''}`}
              onClick={() => { setSortBy(opt.value); setOpen(false); }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bag Profile Modal with tabs ─────────────────────────────────────────────
function BagModal({ bag, onClose, user }) {
  const [tab, setTab]           = useState('profile');
  const [events, setEvents]     = useState([]);
  const [loadingEv, setLoadingEv] = useState(true);
  const [showAddEv, setShowAddEv] = useState(false);
  const [evType,  setEvType]    = useState('reweigh_damage');
  const [evWeight, setEvWeight] = useState('');
  const [evNotes,  setEvNotes]  = useState('');
  const [savingEv, setSavingEv] = useState(false);
  const [msg, setMsg]           = useState('');

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  useEffect(() => {
    if (!bag) return;
    const unsub = onSnapshot(
      query(collection(db, 'weighEvents'),
        where('bagSerial', '==', bag.bagSerial),
        orderBy('recordedAt', 'asc')),
      snap => { setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingEv(false); }
    );
    return unsub;
  }, [bag?.bagSerial]);

  if (!bag) return null;

  const isHQBag = (bag.bagSerial || '').startsWith('KI-');

  const location = bag.status === 'in_warehouse'    ? '📦 In Station Warehouse'
                 : bag.status === 'recently_weighed' ? '⚖️ Recently Weighed — awaiting warehouse move'
                 : bag.status === 'shipped'          ? '🚢 Shipped to Tarawa'
                 : bag.status === 'in_shed'          ? '📦 In Warehouse'
                 : '—';

  async function saveWeighEvent() {
    if (!evWeight || +evWeight <= 0) { flash('⚠️ Enter a valid weight.'); return; }
    setSavingEv(true);
    const id  = newDocId();
    const now = new Date().toISOString();
    const evData = {
      bagSerial: bag.bagSerial, bagId: bag.id,
      stationId: bag.stationId, eventType: evType,
      weight: parseFloat(evWeight), notes: evNotes.trim(),
      recordedBy: user?.email || '', recordedAt: now,
    };
    // 1. Optimistic UI update
    setEvents(prev => [...prev, { id, ...evData }]);
    setEvWeight(''); setEvNotes(''); setShowAddEv(false);
    flash('✅ Weigh event saved.');
    // 2. Queue Firebase write
    try {
      await queueWrite({ type: 'setDoc', col: 'weighEvents', id, data: evData });
    } catch (e) { flash('❌ ' + e.message); }
    setSavingEv(false);
  }

  const DRow = ({ label, value }) => (
    <div className="bag-detail-row">
      <span className="bag-detail-label">{label}</span>
      <span className="bag-detail-value">{value || '—'}</span>
    </div>
  );

  const fmtDT = iso => iso ? new Date(iso).toLocaleString('en-GB', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  }) : '—';

  const evLabel = v => WEIGH_EVENT_TYPES.find(t => t.value === v)?.label || v;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card bag-detail-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bag-detail-header">
          <div>
            <div className="bag-detail-serial">🏷️ {bag.bagSerial}</div>
            <span className="badge" style={{
              background: isHQBag ? '#007c91' : '#e65100',
              marginTop: 6, display: 'inline-block'
            }}>
              {isHQBag ? '✅ HQ Issued' : '♻ Station Assigned'}
            </span>
          </div>
          <button className="bag-detail-close" onClick={onClose} type="button">✕</button>
        </div>

        {msg && <div className="section-msg" style={{ marginBottom: 10 }}>{msg}</div>}

        {/* Tab strip */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {['profile', 'history'].map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                background: tab === t ? '#007c91' : '#e8f4f7',
                color: tab === t ? '#fff' : '#007c91',
              }}>
              {t === 'profile' ? '👤 Profile' : '📋 Weighing History'}
            </button>
          ))}
        </div>

        {/* ── Profile tab ── */}
        {tab === 'profile' && (
          <div className="bag-detail-rows">
            <DRow label="Serial No."    value={bag.bagSerial} />
            <DRow label="Bag Type"      value={isHQBag ? '✅ HQ-issued standard bag' : '♻ Station-assigned bag'} />
            <DRow label="Farmer"        value={bag.farmerName || 'From Unstacked'} />
            <DRow label="Farmer ID"     value={bag.farmerIdCard} />
            <DRow label="Station"       value={bag.stationId} />
            <DRow label="Inspector"     value={bag.weighedBy} />
            <DRow label="First Weighed" value={bag.weighedDate} />
            <DRow label="Bag Issued On" value={bag.issuedDate || '—'} />
            <DRow label="Location"      value={location} />
          </div>
        )}

        {/* ── Weighing History tab ── */}
        {tab === 'history' && (
          <div>
            {/* Initial weigh */}
            <div style={{
              background: '#e8f4f7', borderRadius: 10, padding: '12px 14px', marginBottom: 10
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#007c91' }}>
                  ⚖️ Initial Weighing
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#007c91' }}>
                  {bag.stationWeight?.toFixed(2)} kg
                </div>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#555', marginTop: 4 }}>
                📅 {fmtDT(bag.weighedAt)} · {bag.weighedBy}
              </div>
            </div>

            {/* Additional weigh events */}
            {loadingEv ? <div style={{ textAlign:'center', color:'#888', fontSize:'0.85rem', padding:'10px 0' }}>Loading…</div>
              : events.map(ev => (
                <div key={ev.id} style={{
                  background: '#fff', border: '1.5px solid #e0eef2',
                  borderRadius: 10, padding: '12px 14px', marginBottom: 10
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#333' }}>
                      {evLabel(ev.eventType)}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#e65100' }}>
                      {ev.weight?.toFixed(2)} kg
                    </div>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#555', marginTop: 4 }}>
                    📅 {fmtDT(ev.recordedAt)} · {ev.recordedBy}
                  </div>
                  {ev.notes && <div style={{ fontSize: '0.76rem', color: '#888', marginTop: 3 }}>📝 {ev.notes}</div>}
                </div>
              ))
            }

            {/* Tarawa arrival — always shown as pending unless Admin App records it */}
            <div style={{
              background: '#f5f5f5', border: '1.5px dashed #ccc',
              borderRadius: 10, padding: '12px 14px', marginBottom: 10, opacity: 0.7
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#888' }}>
                🏛️ Tarawa Arrival Weigh
              </div>
              <div style={{ fontSize: '0.76rem', color: '#aaa', marginTop: 4 }}>
                Awaiting HQ — recorded by Admin App on arrival
              </div>
            </div>

            {/* Add Weigh Event */}
            {!showAddEv ? (
              <button type="button" onClick={() => setShowAddEv(true)}
                style={{
                  width: '100%', padding: '12px', background: 'linear-gradient(135deg,#007c91,#339bbf)',
                  color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700,
                  fontSize: '0.9rem', cursor: 'pointer', marginTop: 4
                }}>
                ➕ Add Weigh Event
              </button>
            ) : (
              <div style={{ background: '#f9f9f9', borderRadius: 10, padding: '14px', border: '1.5px solid #e0eef2', marginTop: 4 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#333', marginBottom: 12 }}>New Weigh Event</div>
                <label className="field-label">Event Type</label>
                <select className="field-input" value={evType} onChange={e => setEvType(e.target.value)}>
                  {WEIGH_EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label className="field-label">New Weight (kg)</label>
                <input className="field-input" type="number" step="0.01" min="0.1"
                  placeholder="e.g. 84.50" value={evWeight} onChange={e => setEvWeight(e.target.value)} />
                <label className="field-label">Notes (optional)</label>
                <input className="field-input" type="text"
                  placeholder="e.g. Bag was wet, dried for 2 days"
                  value={evNotes} onChange={e => setEvNotes(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn-secondary" style={{ flex: 1 }} type="button" onClick={() => setShowAddEv(false)}>Cancel</button>
                  <button className="btn-primary" style={{ flex: 1 }} type="button" onClick={saveWeighEvent} disabled={savingEv}>
                    {savingEv ? 'Saving…' : 'Save Event'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <button className="btn-primary" style={{ marginTop: 16, width: '100%' }}
          type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — In Warehouse (3-col grid)
// ══════════════════════════════════════════════════════════════════════════════
function InWarehouseTab({ stock, loading, user }) {
  const [search,   setSearch]   = useState('');
  const [sortBy,   setSortBy]   = useState('date_desc');
  const [selected, setSelected] = useState(null);

  const bags = useMemo(() => {
    const base = stock.filter(s =>
      s.status === 'in_warehouse' && s.type !== 'unstacked_batch' && s.notes !== 'Unstacked batch'
    );
    const searched = search.trim()
      ? base.filter(s => (s.bagSerial||'').toLowerCase().includes(search.toLowerCase()))
      : base;
    return applySortBy(searched, sortBy);
  }, [stock, search, sortBy]);

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <input type="search" placeholder="Search bag serial number" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex:1, minWidth:0 }} />
        <SortButton sortBy={sortBy} setSortBy={setSortBy} />
      </div>
      {loading ? <div className="empty-state">Loading…</div>
        : bags.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div>{search ? 'No matching bags.' : 'No bags in warehouse yet.'}</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize:'0.75rem', color:'#888', marginBottom:10 }}>
              {bags.length} {bags.length === 1 ? 'bag' : 'bags'} in warehouse
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {bags.map(bag => (
                <button key={bag.id} type="button" onClick={() => setSelected(bag)}
                  style={{
                    background: (bag.bagSerial||'').startsWith('KI-') ? '#fff' : '#fff8f0',
                    border: `1.5px solid ${(bag.bagSerial||'').startsWith('KI-') ? '#e0eef2' : '#ffcc80'}`,
                    borderRadius:10, padding:'10px 6px', cursor:'pointer',
                    fontWeight:700, fontSize:'0.78rem',
                    color: (bag.bagSerial||'').startsWith('KI-') ? '#007c91' : '#e65100',
                    textAlign:'center', wordBreak:'break-all',
                    boxShadow:'0 1px 4px rgba(0,0,0,0.07)',
                  }}>
                  {bag.bagSerial}
                </button>
              ))}
            </div>
          </>
        )
      }
      {selected && <BagModal bag={selected} onClose={() => setSelected(null)} user={user} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Recently Weighed (2-col grid, checkbox select, Move to Warehouse)
// ══════════════════════════════════════════════════════════════════════════════
function RecentlyWeighedTab({ stock, loading, user }) {
  const [search,   setSearch]   = useState('');
  const [sortBy,   setSortBy]   = useState('date_desc');
  const [selected, setSelected] = useState(new Set());
  const [modal,    setModal]    = useState(null);
  const [moving,   setMoving]   = useState(false);
  const [msg,      setMsg]      = useState('');

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const bags = useMemo(() => {
    const base = stock.filter(s =>
      s.status === 'recently_weighed' && s.type !== 'unstacked_batch' && s.notes !== 'Unstacked batch'
    );
    const searched = search.trim()
      ? base.filter(s => (s.bagSerial||'').toLowerCase().includes(search.toLowerCase()))
      : base;
    return applySortBy(searched, sortBy);
  }, [stock, search, sortBy]);

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === bags.length ? new Set() : new Set(bags.map(b => b.id)));
  }

  async function handleMove() {
    if (!selected.size) { flash('⚠️ Select at least one bag.'); return; }
    setMoving(true);
    const movedAt   = new Date().toISOString();
    const ids       = [...selected];
    const patch     = { status: 'in_warehouse', movedToWarehouseAt: movedAt };
    const stationId = bags[0]?.stationId || '';

    // 1. Update shared forage shedStock key + UI immediately
    const SHED_KEY = `warehouseStock_${stationId}`;
    const raw      = await storageGet(SHED_KEY);
    if (raw) {
      try {
        const updated = JSON.parse(raw).map(b => ids.includes(b.id) ? { ...b, ...patch } : b);
        await storageSet(SHED_KEY, JSON.stringify(updated));
      } catch {}
    }
    setSelected(new Set());
    flash(`✅ ${ids.length} ${ids.length === 1 ? 'bag' : 'bags'} moved to warehouse.`);

    // 2. Queue Firebase writes
    try {
      await Promise.all(ids.map(id =>
        queueWrite({ type: 'updateDoc', col: 'shedStock', id, data: patch })
      ));
    } catch (e) { flash('❌ Move failed: ' + e.message); }
    setMoving(false);
  }

  return (
    <div>
      {msg && <div className="section-msg">{msg}</div>}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <input type="search" placeholder="Search bag serial number" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex:1, minWidth:0 }} />
        <SortButton sortBy={sortBy} setSortBy={setSortBy} />
      </div>
      {loading ? <div className="empty-state">Loading…</div>
        : bags.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⚖️</div>
            <div>{search ? 'No matching bags.' : 'No recently weighed bags.'}</div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.82rem', fontWeight:600, color:'#555', cursor:'pointer' }}>
                <input type="checkbox" checked={selected.size === bags.length && bags.length > 0} onChange={toggleAll} />
                Select all ({bags.length})
              </label>
              <span style={{ fontSize:'0.75rem', color:'#888' }}>{selected.size} selected</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:14 }}>
              {bags.map(bag => (
                <div key={bag.id}
                  onClick={() => toggleSelect(bag.id)}
                  style={{
                    background: selected.has(bag.id) ? '#e8f4f7' : '#fff',
                    border: `1.5px solid ${selected.has(bag.id) ? '#007c91' : '#e0eef2'}`,
                    borderRadius:10, padding:'10px', cursor:'pointer',
                    display:'flex', alignItems:'center', gap:8,
                    boxShadow:'0 1px 4px rgba(0,0,0,0.07)',
                  }}>
                  <input type="checkbox" checked={selected.has(bag.id)}
                    onChange={() => toggleSelect(bag.id)} onClick={e => e.stopPropagation()}
                    style={{ flexShrink:0 }} />
                  <button type="button" onClick={e => { e.stopPropagation(); setModal(bag); }}
                    style={{
                      background:'none', border:'none', padding:0, cursor:'pointer',
                      fontWeight:700, fontSize:'0.78rem',
                      color: (bag.bagSerial||'').startsWith('KI-') ? '#007c91' : '#e65100',
                      wordBreak:'break-all', textAlign:'left', flex:1
                    }}>
                    {bag.bagSerial}
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={handleMove} disabled={moving || selected.size === 0}
              style={{
                width:'100%', padding:'14px',
                background: selected.size > 0 ? 'linear-gradient(135deg,#007c91,#339bbf)' : '#b0bec5',
                color:'#fff', border:'none', borderRadius:12,
                fontSize:'0.97rem', fontWeight:800,
                cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
                boxShadow: selected.size > 0 ? '0 4px 14px rgba(0,124,145,0.3)' : 'none',
              }}>
              {moving ? '⏳ Moving…' : `📦 Move to Warehouse${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </>
        )
      }
      {modal && <BagModal bag={modal} onClose={() => setModal(null)} user={user} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Unstacked (communal pile, bag-only entry form, no farmer, no ♻)
// ══════════════════════════════════════════════════════════════════════════════
function UnstackedTab({ stock, loading, user, userProfile }) {
  const [bagSuffix,  setBagSuffix]  = useState('');
  const [bagWeight,  setBagWeight]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState('');

  const stationId = user?.stationId || user?.uid;
  const today     = new Date().toISOString().slice(0, 10);
  const nowISO    = () => new Date().toISOString();
  const nowDisplay = new Date().toLocaleString('en-GB', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  });

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const unstakedBatches = stock.filter(s =>
    (s.type === 'unstacked_batch' || s.notes === 'Unstacked batch') && s.status === 'in_shed'
  );
  const totalUnstakedKg = unstakedBatches.reduce((sum, b) => sum + (b.stationWeight||0), 0);
  const packedKg = stock
    .filter(s => s.farmerName === 'From Unstacked' && s.status !== 'in_shed')
    .reduce((sum, b) => sum + (b.stationWeight||0), 0);
  const remainingKg = Math.max(0, totalUnstakedKg - packedKg);

  async function handleSave() {
    if (!bagSuffix.trim())             { flash('⚠️ Enter a bag serial number.'); return; }
    if (!bagWeight || +bagWeight <= 0) { flash('⚠️ Enter a valid weight.'); return; }
    if (+bagWeight > remainingKg + 0.01) {
      flash(`⚠️ Weight exceeds remaining unstacked total (${remainingKg.toFixed(2)} kg).`); return;
    }
    const serial = 'KI-' + bagSuffix.trim().toUpperCase();
    const dup = stock.find(s => s.bagSerial === serial &&
      (s.status === 'recently_weighed' || s.status === 'in_warehouse'));
    if (dup) { flash(`⚠️ Bag ${serial} already exists.`); return; }
    setSaving(true);
    const id    = newDocId();
    const entry = {
      type: 'quality_bag', bagSerial: serial,
      farmerId: 'unstacked', farmerName: 'From Unstacked', farmerIdCard: '—',
      stationWeight: parseFloat(bagWeight),
      stationId, weighedBy: user?.email || '',
      weighedAt: nowISO(), weighedDate: today,
      status: 'recently_weighed', notes: 'From unstacked',
    };

    // 1. Update forage + UI immediately
    const SHED_KEY = `warehouseStock_${stationId}`;
    const raw      = await storageGet(SHED_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    await storageSet(SHED_KEY, JSON.stringify([{ id, ...entry }, ...existing]));

    setBagSuffix(''); setBagWeight('');
    flash(`✅ ${serial} — ${bagWeight} kg saved. Moved to Recently Weighed.`);

    // 2. Queue Firebase write
    try {
      await queueWrite({ type: 'setDoc', col: 'shedStock', id, data: entry });
    } catch (e) { flash('❌ Save failed: ' + e.message); }
    setSaving(false);
  }

  return (
    <div style={{ paddingBottom:40 }}>
      {/* Remaining pile card */}
      <div style={{
        background:'linear-gradient(135deg,#e65100,#ff8f00)',
        borderRadius:16, padding:'20px', color:'#fff', textAlign:'center',
        marginBottom:20, boxShadow:'0 4px 14px rgba(230,81,0,0.3)',
      }}>
        <div style={{ fontSize:'0.82rem', opacity:0.9, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>
          Unstacked Copra
        </div>
        <div style={{ fontSize:'2.4rem', fontWeight:900, lineHeight:1 }}>
          {loading ? '…' : `${remainingKg.toFixed(2)} kg`}
        </div>
        <div style={{ fontSize:'0.78rem', opacity:0.8, marginTop:6 }}>
          {unstakedBatches.length} batch{unstakedBatches.length !== 1 ? 'es' : ''} recorded
          {packedKg > 0 && ` · ${packedKg.toFixed(2)} kg already bagged`}
        </div>
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      {/* Bag entry form */}
      <div className="weigh-session-card">
        <div className="ws-field">
          <div className="ws-label">Date &amp; Time</div>
          <div className="ws-value-box">{nowDisplay}</div>
        </div>
        <div className="ws-field">
          <div className="ws-label">Inspector</div>
          <div className="ws-value-box ws-auto">{user?.email || '—'}</div>
        </div>
        <div className="ws-field">
          <div className="ws-label">Farmer</div>
          <div className="ws-value-box ws-auto" style={{ color:'#888', fontStyle:'italic' }}>
            From Unstacked (auto)
          </div>
        </div>
        {/* Serial — always KI- for bags filled from communal pile */}
        <div className="ws-field">
          <div className="ws-label">Bag Serial # (KI-)</div>
          <div style={{
            display:'flex', alignItems:'center',
            border:'1.5px solid #ccc', borderRadius:8, overflow:'hidden', background:'#fff'
          }}>
            <div style={{
              padding:'0 10px', background:'#e8f4f7',
              fontWeight:800, fontSize:'0.88rem', color:'#007c91',
              borderRight:'1.5px solid #b2dfdb',
              height:44, display:'flex', alignItems:'center', flexShrink:0
            }}>KI-</div>
            <input type="text" value={bagSuffix} onChange={e => setBagSuffix(e.target.value)}
              placeholder="00042" autoCapitalize="characters"
              style={{ flex:1, border:'none', padding:'0 10px', height:44, fontSize:'0.97rem', outline:'none' }} />
          </div>
        </div>
        <div className="ws-field">
          <div className="ws-label">Weight (kg)</div>
          <input className="field-input" type="number" step="0.01" min="0.1"
            placeholder="e.g. 87.50" value={bagWeight} onChange={e => setBagWeight(e.target.value)} />
        </div>
      </div>

      <button type="button" onClick={handleSave} disabled={saving}
        style={{
          width:'100%', marginTop:20, padding:'16px',
          background: saving ? '#b0bec5' : 'linear-gradient(135deg,#007c91,#339bbf)',
          color:'#fff', border:'none', borderRadius:14,
          fontSize:'1.05rem', fontWeight:800,
          cursor: saving ? 'not-allowed' : 'pointer',
          boxShadow: saving ? 'none' : '0 4px 14px rgba(0,124,145,0.35)',
        }}>
        {saving ? '⏳ Saving…' : '💾 Save Entry'}
      </button>
      <div style={{ textAlign:'center', fontSize:'0.74rem', color:'#aaa', marginTop:10 }}>
        Saved bags appear in the Recently Weighed tab
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function WarehouseSection({ user, userProfile }) {
  const [tab,     setTab]     = useState('in_warehouse');
  const [stock,   setStock]   = useState([]);
  const [loading, setLoading] = useState(true);

  const stationId = user?.stationId || user?.uid;

  useEffect(() => {
    if (!stationId) return;
    const KEY = `warehouseStock_${stationId}`;
    // Hydrate from device storage for instant display before Firestore responds
    storageGet(KEY).then(v => {
      if (v) try { setStock(JSON.parse(v)); setLoading(false); } catch {}
    });
    return onSnapshot(
      query(collection(db, 'shedStock'), where('stationId','==',stationId), orderBy('weighedAt','desc')),
      snap => {
        const data = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        setStock(data);
        setLoading(false);
        storageSet(KEY, JSON.stringify(data));
      }
    );
  }, [stationId]);

  const TABS = [
    { key:'in_warehouse',    label:'In Warehouse' },
    { key:'recently_weighed',label:'Recently Weighed' },
    { key:'unstacked',       label:'📦 Unstacked' },
  ];

  return (
    <section>
      <h2 className="section-title">🏚️ Warehouse</h2>
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.key} className={`tab-btn${tab===t.key?' active':''}`}
            onClick={() => setTab(t.key)} type="button">{t.label}</button>
        ))}
      </div>
      {tab==='in_warehouse'     && <InWarehouseTab     stock={stock} loading={loading} user={user} />}
      {tab==='recently_weighed' && <RecentlyWeighedTab stock={stock} loading={loading} user={user} />}
      {tab==='unstacked'        && <UnstackedTab       stock={stock} loading={loading} user={user} userProfile={userProfile} />}
    </section>
  );
}
