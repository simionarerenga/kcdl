// src/sections/ShipmentSection.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  collection, addDoc, onSnapshot, query,
  where, orderBy, doc, updateDoc, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { storageGet, storageSet } from '../utils/storage';
import { newDocId, queueWrite } from '../utils/syncManager';

// ── Shared stat badge ──────────────────────────────────────────────────────
const StatBadge = ({ value, label, color }) => (
  <div style={{
    background: color, borderRadius: 12, padding: '8px 16px', color: '#fff',
    display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)', minWidth: 80
  }}>
    <span style={{ fontSize: '1.4rem', fontWeight: 900, lineHeight: 1 }}>{value}</span>
    <span style={{ fontSize: '0.72rem', opacity: 0.9, fontWeight: 600, marginTop: 3 }}>{label}</span>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════
// TAB 1 — In Warehouse (re-weigh before shipping)
// Bags with status 'in_warehouse'. Inspector re-weighs, then moves to
// 'ready_to_ship'. Each move decrements In Warehouse, increments Ready to Ship.
// ══════════════════════════════════════════════════════════════════════════
function InWarehouseTab({ stock, user }) {
  const [selected,   setSelected]   = useState(new Set());
  const [reweighId,  setReweighId]  = useState(null);
  const [newWeight,  setNewWeight]  = useState('');
  const [savingRw,   setSavingRw]   = useState(false);
  const [moving,     setMoving]     = useState(false);
  const [msg,        setMsg]        = useState('');
  const [search,     setSearch]     = useState('');

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const bags = useMemo(() =>
    stock.filter(s => s.status === 'in_warehouse' && s.type !== 'unstacked_batch')
      .filter(s => search.trim()
        ? (s.bagSerial||'').toLowerCase().includes(search.toLowerCase())
        : true
      ),
    [stock, search]
  );

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === bags.length ? new Set() : new Set(bags.map(b => b.id)));
  }

  async function saveReweigh(bag) {
    if (!newWeight || +newWeight <= 0) { flash('⚠️ Enter a valid weight.'); return; }
    setSavingRw(true);
    const w      = parseFloat(newWeight);
    const now    = new Date().toISOString();
    const evId   = newDocId();
    const patch  = { stationWeight: w, preShipWeight: w, reweighedAt: now, reweighedBy: user?.email || '' };
    const evData = {
      bagSerial: bag.bagSerial, bagId: bag.id,
      stationId: bag.stationId, eventType: 'preshipment',
      weight: w, notes: 'Pre-shipment re-weigh',
      recordedBy: user?.email || '', recordedAt: now,
    };

    // 1. Update forage + UI immediately
    const STOCK_KEY = `shipmentStock_${bag.stationId}`;
    const raw       = await storageGet(STOCK_KEY);
    if (raw) {
      try {
        const updated = JSON.parse(raw).map(b => b.id === bag.id ? { ...b, ...patch } : b);
        await storageSet(STOCK_KEY, JSON.stringify(updated));
      } catch {}
    }
    setReweighId(null); setNewWeight('');
    flash(`✅ ${bag.bagSerial} re-weighed at ${w.toFixed(2)} kg.`);

    // 2. Queue Firebase writes
    try {
      await queueWrite({ type: 'updateDoc', col: 'shedStock', id: bag.id, data: patch });
      await queueWrite({ type: 'setDoc',    col: 'weighEvents', id: evId, data: evData });
    } catch (e) { flash('❌ ' + e.message); }
    setSavingRw(false);
  }

  async function moveToReadyToShip() {
    if (!selected.size) { flash('⚠️ Select at least one bag.'); return; }
    setMoving(true);
    const ids   = [...selected];
    const now   = new Date().toISOString();
    const patch = { status: 'ready_to_ship', readyAt: now };

    // 1. Update forage + UI immediately
    const stationId = bags[0]?.stationId || (user?.stationId || user?.uid);
    const STOCK_KEY = `shipmentStock_${stationId}`;
    const raw       = await storageGet(STOCK_KEY);
    if (raw) {
      try {
        const updated = JSON.parse(raw).map(b => ids.includes(b.id) ? { ...b, ...patch } : b);
        await storageSet(STOCK_KEY, JSON.stringify(updated));
      } catch {}
    }
    setSelected(new Set());
    flash(`✅ ${ids.length} bag${ids.length !== 1 ? 's' : ''} moved to Ready to Ship.`);

    // 2. Queue Firebase writes
    try {
      await Promise.all(ids.map(id =>
        queueWrite({ type: 'updateDoc', col: 'shedStock', id, data: patch })
      ));
    } catch (e) { flash('❌ ' + e.message); }
    setMoving(false);
  }

  return (
    <div>
      {msg && <div className="section-msg">{msg}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <input type="search" placeholder="Search bag serial…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
      </div>

      {bags.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div>{search ? 'No matching bags.' : 'No bags currently in warehouse.'}</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', fontWeight: 600, color: '#555', cursor: 'pointer' }}>
              <input type="checkbox"
                checked={selected.size === bags.length && bags.length > 0}
                onChange={toggleAll} />
              Select all ({bags.length})
            </label>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>{selected.size} selected</span>
          </div>

          {bags.map(bag => (
            <div key={bag.id} style={{
              background: selected.has(bag.id) ? '#e8f4f7' : '#fff',
              border: `1.5px solid ${selected.has(bag.id) ? '#007c91' : '#e0eef2'}`,
              borderRadius: 12, padding: '12px 14px', marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 1px 5px rgba(0,0,0,0.07)',
            }}>
              <input type="checkbox" checked={selected.has(bag.id)}
                onChange={() => toggle(bag.id)} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }} onClick={() => toggle(bag.id)}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a1a1a' }}>{bag.bagSerial}</div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 2 }}>
                  {bag.farmerName} · {bag.stationWeight?.toFixed(2)} kg
                  {bag.preShipWeight && bag.preShipWeight !== bag.stationWeight && (
                    <span style={{ color: '#007c91', marginLeft: 6 }}>
                      &rarr; {bag.preShipWeight?.toFixed(2)} kg (re-weighed)
                    </span>
                  )}
                </div>
              </div>
              {/* Re-weigh button */}
              {reweighId === bag.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <input type="number" step="0.01" min="0.1"
                    placeholder="kg" value={newWeight}
                    onChange={e => setNewWeight(e.target.value)}
                    style={{ width: 80, height: 36, padding: '0 8px', border: '1.5px solid #007c91',
                      borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
                    autoFocus />
                  <button type="button" onClick={() => saveReweigh(bag)} disabled={savingRw}
                    style={{ background: '#007c91', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '6px 10px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    ✓
                  </button>
                  <button type="button" onClick={() => { setReweighId(null); setNewWeight(''); }}
                    style={{ background: '#eee', color: '#555', border: 'none', borderRadius: 8,
                      padding: '6px 10px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => { setReweighId(bag.id); setNewWeight(''); }}
                  style={{ background: '#e8f4f7', color: '#007c91', border: '1.5px solid #b2dfdb',
                    borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: '0.78rem',
                    cursor: 'pointer', flexShrink: 0 }}>
                  ⚖️ Re-weigh
                </button>
              )}
            </div>
          ))}

          <button type="button" onClick={moveToReadyToShip}
            disabled={moving || selected.size === 0}
            style={{
              width: '100%', padding: '14px', marginTop: 8,
              background: selected.size > 0 ? 'linear-gradient(135deg,#1565c0,#42a5f5)' : '#b0bec5',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: '0.97rem', fontWeight: 800,
              cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
              boxShadow: selected.size > 0 ? '0 4px 14px rgba(21,101,192,0.3)' : 'none',
            }}>
            {moving ? '⏳ Moving…' : `🚢 Move to Ready to Ship${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 2 — Ready to Ship (select and create shipment)
// Bags with status 'ready_to_ship'. Select and confirm dispatch.
// ══════════════════════════════════════════════════════════════════════════
function ReadyToShipTab({ stock, user }) {
  const [selected,  setSelected]  = useState(new Set());
  const [vessel,    setVessel]    = useState('');
  const [shipDate,  setShipDate]  = useState(new Date().toISOString().slice(0, 10));
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState('');
  const [search,    setSearch]    = useState('');

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const bags = useMemo(() =>
    stock.filter(s => s.status === 'ready_to_ship' && s.type !== 'unstacked_batch')
      .filter(s => search.trim()
        ? (s.bagSerial||'').toLowerCase().includes(search.toLowerCase())
        : true
      ),
    [stock, search]
  );

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === bags.length ? new Set() : new Set(bags.map(b => b.id)));
  }

  async function handleShip() {
    if (!vessel.trim())    { flash('⚠️ Enter vessel name.'); return; }
    if (!selected.size)    { flash('⚠️ Select at least one bag.'); return; }

    const shipBags  = bags.filter(b => selected.has(b.id));
    const totalKg   = shipBags.reduce((s, b) => s + (b.preShipWeight || b.stationWeight || 0), 0);
    const shippedAt = new Date().toISOString();
    const stationId = user?.stationId || user?.uid;
    const shipId    = newDocId();
    const shipData  = {
      vesselName: vessel.trim(), shipDate, stationId,
      shippedBy: user?.email || '', shippedAt,
      bagCount: shipBags.length, totalKg,
      bags: shipBags.map(b => ({
        shedStockId: b.id, bagSerial: b.bagSerial,
        farmerId: b.farmerId, farmerName: b.farmerName, farmerIdCard: b.farmerIdCard,
        stationWeight: b.stationWeight, preShipWeight: b.preShipWeight || b.stationWeight,
      })),
      status: 'shipped',
    };
    const bagPatch = { status: 'shipped', shipmentId: shipId, shippedAt };

    // 1. Update forage + UI immediately
    const STOCK_KEY    = `shipmentStock_${stationId}`;
    const SHIP_KEY     = `shipments_${stationId}`;
    const bagIds       = new Set(shipBags.map(b => b.id));
    const stockRaw     = await storageGet(STOCK_KEY);
    const shipRaw      = await storageGet(SHIP_KEY);
    if (stockRaw) {
      try {
        const updated = JSON.parse(stockRaw).map(b => bagIds.has(b.id) ? { ...b, ...bagPatch } : b);
        await storageSet(STOCK_KEY, JSON.stringify(updated));
      } catch {}
    }
    if (shipRaw) {
      try {
        const updated = [{ id: shipId, ...shipData }, ...JSON.parse(shipRaw)];
        await storageSet(SHIP_KEY, JSON.stringify(updated));
      } catch {}
    }
    setSelected(new Set()); setVessel('');
    flash(`✅ ${shipBags.length} bags (${totalKg.toFixed(1)} kg) shipped on ${vessel.trim()}.`);

    // 2. Queue Firebase writes (shipment doc + each bag status update)
    setSaving(true);
    try {
      await queueWrite({ type: 'setDoc', col: 'shipments', id: shipId, data: shipData });
      await Promise.all(shipBags.map(b =>
        queueWrite({ type: 'updateDoc', col: 'shedStock', id: b.id, data: bagPatch })
      ));
    } catch (e) { flash('❌ Shipment failed: ' + e.message); }
    setSaving(false);
  }

  const selectedKg = bags
    .filter(b => selected.has(b.id))
    .reduce((s, b) => s + (b.preShipWeight || b.stationWeight || 0), 0);

  return (
    <div>
      {msg && <div className="section-msg">{msg}</div>}

      {bags.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🚢</div>
          <div>{search ? 'No matching bags.' : 'No bags ready to ship. Move bags from In Warehouse tab first.'}</div>
        </div>
      ) : (
        <>
          {/* Vessel + date */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 14 }}>
            <label className="field-label">Vessel Name *</label>
            <input className="field-input" type="text" value={vessel}
              onChange={e => setVessel(e.target.value)} placeholder="e.g. MV Nei Momi" />
            <label className="field-label" style={{ marginTop: 10 }}>Ship Date</label>
            <input className="field-input" type="date" value={shipDate}
              onChange={e => setShipDate(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <input type="search" placeholder="Search bag serial…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', fontWeight: 600, color: '#555', cursor: 'pointer' }}>
              <input type="checkbox"
                checked={selected.size === bags.length && bags.length > 0}
                onChange={toggleAll} />
              Select all ({bags.length})
            </label>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>{selected.size} bags · {selectedKg.toFixed(2)} kg</span>
          </div>

          {bags.map(bag => (
            <div key={bag.id}
              onClick={() => toggle(bag.id)}
              style={{
                background: selected.has(bag.id) ? '#e3f2fd' : '#fff',
                border: `1.5px solid ${selected.has(bag.id) ? '#1565c0' : '#e0eef2'}`,
                borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                boxShadow: '0 1px 5px rgba(0,0,0,0.07)',
              }}>
              <input type="checkbox" checked={selected.has(bag.id)} onChange={() => toggle(bag.id)}
                onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{bag.bagSerial}</div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 2 }}>
                  {bag.farmerName} · {(bag.preShipWeight || bag.stationWeight)?.toFixed(2)} kg
                  {bag.preShipWeight && <span style={{ color: '#007c91', marginLeft: 6 }}>⚖️ re-weighed</span>}
                </div>
              </div>
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1565c0', flexShrink: 0 }}>
                {(bag.preShipWeight || bag.stationWeight)?.toFixed(2)} kg
              </span>
            </div>
          ))}

          {selected.size > 0 && (
            <div style={{ background: '#e3f2fd', borderRadius: 10, padding: '10px 14px',
              marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1565c0' }}>
                {selected.size} bags selected
              </span>
              <span style={{ fontWeight: 900, fontSize: '1rem', color: '#1565c0' }}>
                {selectedKg.toFixed(2)} kg
              </span>
            </div>
          )}

          <button type="button" onClick={handleShip} disabled={saving || !selected.size || !vessel.trim()}
            style={{
              width: '100%', padding: '14px',
              background: selected.size > 0 && vessel.trim()
                ? 'linear-gradient(135deg,#1565c0,#42a5f5)' : '#b0bec5',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: '0.97rem', fontWeight: 800,
              cursor: selected.size > 0 && vessel.trim() ? 'pointer' : 'not-allowed',
              boxShadow: selected.size > 0 && vessel.trim() ? '0 4px 14px rgba(21,101,192,0.3)' : 'none',
            }}>
            {saving ? '⏳ Creating Shipment…' : `🚢 Ship ${selected.size} Bag${selected.size !== 1 ? 's' : ''}${selectedKg > 0 ? ` · ${selectedKg.toFixed(1)} kg` : ''}`}
          </button>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 3 — Shipment History
// ══════════════════════════════════════════════════════════════════════════
function HistoryTab({ shipments }) {
  const [detail, setDetail] = useState(null);

  return (
    <div>
      {shipments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🚢</div>
          <div>No shipments recorded yet.</div>
        </div>
      ) : shipments.map(s => (
        <div key={s.id} className="list-card" onClick={() => setDetail(s)} style={{ cursor: 'pointer' }}>
          <div className="list-card-header">
            <span className="list-card-title">🚢 {s.vesselName}</span>
            <span className="badge" style={{ background: '#1565c0' }}>{s.bagCount} bags</span>
          </div>
          <div className="list-card-meta">📅 {s.shipDate} · ⚖️ {s.totalKg?.toFixed(2)} kg</div>
          <div className="list-card-meta">📤 {s.shippedBy}</div>
        </div>
      ))}

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="overlay-card" style={{ maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>🚢 {detail.vesselName}</h3>
              <button className="bag-detail-close" type="button" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: 14 }}>
              📅 {detail.shipDate} · {detail.bagCount} bags · {detail.totalKg?.toFixed(2)} kg
            </div>
            {(detail.bags || []).map((b, i) => (
              <div key={i} className="list-card" style={{ marginBottom: 8 }}>
                <div className="list-card-header">
                  <span style={{ fontWeight: 700 }}>🏷️ {b.bagSerial}</span>
                  <span>{(b.preShipWeight || b.stationWeight)?.toFixed(2)} kg</span>
                </div>
                <div className="list-card-meta">👩‍🌾 {b.farmerName}</div>
              </div>
            ))}
            <button className="btn-secondary" style={{ marginTop: 12 }}
              type="button" onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════
export default function ShipmentSection({ user }) {
  const [tab,       setTab]       = useState('warehouse');
  const [stock,     setStock]     = useState([]);
  const [shipments, setShipments] = useState([]);

  const stationId = user?.stationId || user?.uid;

  useEffect(() => {
    if (!stationId) return;
    const STOCK_KEY    = `shipmentStock_${stationId}`;
    const SHIPMENT_KEY = `shipments_${stationId}`;
    // Hydrate from device storage for instant display before Firestore responds
    storageGet(STOCK_KEY).then(v => {
      if (v) try { setStock(JSON.parse(v)); } catch {}
    });
    storageGet(SHIPMENT_KEY).then(v => {
      if (v) try { setShipments(JSON.parse(v)); } catch {}
    });
    const u1 = onSnapshot(
      query(collection(db,'shedStock'), where('stationId','==',stationId), orderBy('weighedAt','desc')),
      snap => {
        const data = snap.docs.map(d=>({id:d.id,...d.data()}));
        setStock(data);
        storageSet(STOCK_KEY, JSON.stringify(data));
      }
    );
    const u2 = onSnapshot(
      query(collection(db,'shipments'), where('stationId','==',stationId), orderBy('shippedAt','desc')),
      snap => {
        const data = snap.docs.map(d=>({id:d.id,...d.data()}));
        setShipments(data);
        storageSet(SHIPMENT_KEY, JSON.stringify(data));
      }
    );
    return () => { u1(); u2(); };
  }, [stationId]);

  const inWarehouse   = stock.filter(s => s.status === 'in_warehouse'  && s.type !== 'unstacked_batch');
  const readyToShip   = stock.filter(s => s.status === 'ready_to_ship' && s.type !== 'unstacked_batch');
  const totalShippedKg = shipments.reduce((s, sh) => s + (sh.totalKg || 0), 0);

  const TABS = [
    { key: 'warehouse',   label: `📦 In Warehouse (${inWarehouse.length})` },
    { key: 'ready',       label: `🚢 Ready to Ship (${readyToShip.length})` },
    { key: 'history',     label: `📋 History (${shipments.length})` },
  ];

  return (
    <section>
      <h2 className="section-title">🚢 Shipments</h2>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <StatBadge value={inWarehouse.length}         label="In Warehouse"   color="linear-gradient(135deg,#007c91,#339bbf)" />
        <StatBadge value={readyToShip.length}         label="Ready to Ship"  color="linear-gradient(135deg,#1565c0,#42a5f5)" />
        <StatBadge value={`${totalShippedKg.toFixed(0)} kg`} label="Total Shipped" color="linear-gradient(135deg,#2e7d32,#66bb6a)" />
      </div>

      {/* Tab strip */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.key} className={`tab-btn${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)} type="button" style={{ fontSize: '0.82rem' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'warehouse' && <InWarehouseTab  stock={stock}     user={user} />}
      {tab === 'ready'     && <ReadyToShipTab  stock={stock}     user={user} />}
      {tab === 'history'   && <HistoryTab      shipments={shipments} />}
    </section>
  );
}
