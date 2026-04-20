// src/sections/BagsHubSection.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  collection, addDoc, onSnapshot, query, where, orderBy,
  doc, updateDoc, setDoc, increment, getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { storageGet, storageSet } from '../utils/storage';
import { newDocId, queueWrite, inc } from '../utils/syncManager';

const ISSUE_SORT_OPTIONS = [
  { value: 'date_desc',   label: '📅 Date Issued (Newest)' },
  { value: 'date_asc',    label: '📅 Date Issued (Oldest)' },
  { value: 'bags_desc',   label: '🔢 Most Bags Issued' },
  { value: 'bags_asc',    label: '🔢 Fewest Bags Issued' },
  { value: 'name_asc',    label: '👩‍🌾 Farmer Name (A→Z)' },
  { value: 'name_desc',   label: '👩‍🌾 Farmer Name (Z→A)' },
  { value: 'overdue',     label: '⚠️ Overdue (Longest held)' },
];

// ── Bag profile mini-modal (serial only click) ──────────────────────────────
function BagQuickModal({ bag, onClose }) {
  if (!bag) return null;
  const isHQ = (bag.bagSerial||'').startsWith('KI-');
  const rows = [
    ['Serial No.',   bag.bagSerial],
    ['Bag Type',     isHQ ? '✅ HQ-issued' : '♻ Station-assigned'],
    ['Farmer',       bag.farmerName],
    ['Farmer ID',    bag.farmerIdCard],
    ['Issued On',    bag.issuedDate || '—'],
    ['Issued By',    bag.issuedBy],
    ['Status',       bag.status === 'issued' ? '📤 With Farmer' : '↩️ Returned'],
    bag.returnedAt && ['Returned At', new Date(bag.returnedAt).toLocaleDateString()],
    bag.notes && ['Notes', bag.notes],
  ].filter(Boolean);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card bag-detail-card" onClick={e => e.stopPropagation()}>
        <div className="bag-detail-header">
          <div>
            <div className="bag-detail-serial">🏷️ {bag.bagSerial}</div>
            <span className="badge" style={{ background: bag.status==='issued'?'#007c91':'#2e7d32', marginTop:6, display:'inline-block' }}>
              {bag.status==='issued'?'📤 With Farmer':'↩️ Returned'}
            </span>
          </div>
          <button className="bag-detail-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="bag-detail-rows">
          {rows.map(([label, value]) => (
            <div key={label} className="bag-detail-row">
              <span className="bag-detail-label">{label}</span>
              <span className="bag-detail-value">{value}</span>
            </div>
          ))}
        </div>
        <button className="btn-primary" style={{ marginTop:16, width:'100%' }} type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── Farmer bags modal (3-col serial grid) ───────────────────────────────────
function FarmerBagsModal({ farmer, bags, onClose }) {
  const [selectedBag, setSelectedBag] = useState(null);
  if (!farmer) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" style={{ maxHeight:'85vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:'1.05rem' }}>👩‍🌾 {farmer}</div>
            <div style={{ fontSize:'0.78rem', color:'#888', marginTop:2 }}>Issued bags — tap serial to view profile</div>
          </div>
          <button className="bag-detail-close" onClick={onClose} type="button">✕</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          {bags.map(bag => (
            <button key={bag.id} type="button" onClick={() => setSelectedBag(bag)}
              style={{
                background: bag.status==='returned' ? '#f5f5f5' : '#fff',
                border:`1.5px solid ${bag.status==='returned'?'#ccc':'#e0eef2'}`,
                borderRadius:10, padding:'10px 6px', cursor:'pointer',
                fontWeight:700, fontSize:'0.75rem',
                color: bag.status==='returned' ? '#aaa' : '#007c91',
                textAlign:'center', wordBreak:'break-all',
                boxShadow:'0 1px 4px rgba(0,0,0,0.07)',
                textDecoration: bag.status==='returned' ? 'line-through' : 'none',
              }}>
              {bag.bagSerial}
              {bag.status==='returned' && <div style={{ fontSize:'0.62rem', color:'#aaa', marginTop:2 }}>returned</div>}
            </button>
          ))}
        </div>
        <button className="btn-secondary" style={{ marginTop:16 }} type="button" onClick={onClose}>Close</button>
        {selectedBag && <BagQuickModal bag={selectedBag} onClose={() => setSelectedBag(null)} />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Issued Bags
// ══════════════════════════════════════════════════════════════════════════════
function IssueBagsTab({ user }) {
  const [issuances, setIssuances] = useState([]);
  const [farmers,   setFarmers]   = useState([]);
  const [form,      setForm]      = useState({ bagSuffix:'', farmerId:'', farmerName:'', farmerIdCard:'', notes:'' });
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState('');
  const [balance,   setBalance]   = useState(null); // live bag stock balance
  const [loading,   setLoading]   = useState(true);
  const [sortBy,    setSortBy]    = useState('date_desc');
  const [showSort,  setShowSort]  = useState(false);
  const [selFarmer, setSelFarmer] = useState(null); // for farmer bags modal

  const stationId = user?.stationId || user?.uid;
  const today     = new Date().toISOString().slice(0, 10);
  const stockRef  = doc(db, 'bagStock', stationId);

  useEffect(() => {
    if (!stationId) return;
    const KEY = `hubIssuances_${stationId}`;
    // Hydrate from device storage for instant display
    storageGet(KEY).then(v => {
      if (v) try { setIssuances(JSON.parse(v)); setLoading(false); } catch {}
    });
    const u1 = onSnapshot(
      query(collection(db, 'bagIssuances'), where('stationId','==',stationId), orderBy('issuedAt','desc')),
      snap => {
        const data = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        setIssuances(data);
        setLoading(false);
        storageSet(KEY, JSON.stringify(data));
      }
    );
    const u2 = onSnapshot(
      query(collection(db, 'farmers'), where('stationId','==',stationId), orderBy('name')),
      snap => setFarmers(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    );
    // Live balance subscription — blocks issuing when stock is empty
    const u3 = onSnapshot(stockRef, snap => {
      setBalance(snap.exists() ? (snap.data().balance || 0) : 0);
    });
    return () => { u1(); u2(); u3(); };
  }, [stationId]);

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  function selectFarmer(fId) {
    const f = farmers.find(x => x.id === fId);
    setForm(x => f
      ? { ...x, farmerId:f.id, farmerName:f.name, farmerIdCard:f.idCard||'' }
      : { ...x, farmerId:'', farmerName:'', farmerIdCard:'' }
    );
  }

  async function handleIssue() {
    if (!form.bagSuffix.trim()) { flash('⚠️ Bag serial required.'); return; }
    if (!form.farmerId)         { flash('⚠️ Select a farmer.'); return; }
    if (balance !== null && balance <= 0) {
      flash('⚠️ No bags in stock. Request a resupply from Tarawa before issuing.'); return;
    }
    const serial = 'KI-' + form.bagSuffix.trim().toUpperCase();
    const active = issuances.find(i => i.bagSerial === serial && i.status === 'issued');
    if (active) { flash(`⚠️ ${serial} already issued to ${active.farmerName}.`); return; }
    setSaving(true);
    const id  = newDocId();
    const txnId = newDocId();
    const now = new Date().toISOString();
    const issuanceData = {
      bagSerial:serial, farmerId:form.farmerId, farmerName:form.farmerName,
      farmerIdCard:form.farmerIdCard, stationId,
      issuedBy:user?.email||'', issuedAt:now,
      issuedDate:today, status:'issued', notes:form.notes.trim(),
    };
    const farmerName = form.farmerName;

    // 1. Update forage + UI immediately
    const KEY      = `hubIssuances_${stationId}`;
    const newList  = [{ id, ...issuanceData }, ...issuances];
    const newBal   = (balance || 0) - 1;
    await storageSet(KEY, JSON.stringify(newList));
    setIssuances(newList);
    setBalance(newBal);
    setForm({ bagSuffix:'', farmerId:'', farmerName:'', farmerIdCard:'', notes:'' });
    setShowForm(false);
    flash(`✅ ${serial} issued to ${farmerName}.`);

    // 2. Queue Firebase writes
    try {
      await queueWrite({ type:'setDoc', col:'bagIssuances', id, data:issuanceData });
      await queueWrite({ type:'setDoc', col:'bagStock', id:stationId,
        data:{ balance:inc(-1), stationId, updatedAt:now }, opts:{ merge:true } });
      await queueWrite({ type:'setDoc', col:'bagTransactions', id:txnId,
        data:{ stationId, type:'issue', qty:1, bagSerial:serial,
               farmerName, note:`Issued to ${farmerName}`,
               recordedBy:user?.email||'', createdAt:now, date:today } });
    } catch (e) { flash('❌ Queue error: ' + e.message); }
    setSaving(false);
  }

  // Group issuances by farmer — only farmers with at least one issued bag
  const farmerMap = useMemo(() => {
    const map = {};
    issuances.forEach(i => {
      if (!map[i.farmerName]) map[i.farmerName] = { farmerName:i.farmerName, bags:[], latestDate:i.issuedDate };
      map[i.farmerName].bags.push(i);
      if (i.issuedDate > map[i.farmerName].latestDate) map[i.farmerName].latestDate = i.issuedDate;
    });
    return Object.values(map);
  }, [issuances]);

  // Only farmers who have at least one currently issued bag
  const activeFarmers = farmerMap.filter(f => f.bags.some(b => b.status === 'issued'));

  const sorted = useMemo(() => {
    const arr = [...activeFarmers];
    const now = Date.now();
    switch (sortBy) {
      case 'date_asc':   return arr.sort((a,b) => a.latestDate.localeCompare(b.latestDate));
      case 'bags_desc':  return arr.sort((a,b) => b.bags.filter(x=>x.status==='issued').length - a.bags.filter(x=>x.status==='issued').length);
      case 'bags_asc':   return arr.sort((a,b) => a.bags.filter(x=>x.status==='issued').length - b.bags.filter(x=>x.status==='issued').length);
      case 'name_asc':   return arr.sort((a,b) => a.farmerName.localeCompare(b.farmerName));
      case 'name_desc':  return arr.sort((a,b) => b.farmerName.localeCompare(a.farmerName));
      case 'overdue':    return arr.sort((a,b) => {
        const aOld = Math.min(...a.bags.filter(x=>x.status==='issued').map(x=>new Date(x.issuedAt).getTime()));
        const bOld = Math.min(...b.bags.filter(x=>x.status==='issued').map(x=>new Date(x.issuedAt).getTime()));
        return aOld - bOld;
      });
      default: return arr.sort((a,b) => b.latestDate.localeCompare(a.latestDate));
    }
  }, [activeFarmers, sortBy]);

  const activeCount = issuances.filter(i => i.status==='issued').length;
  const sortLabel = ISSUE_SORT_OPTIONS.find(o=>o.value===sortBy)?.label || 'Sort';

  return (
    <div>
      {/* "With Farmers" card + Issue button on same line */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <div style={{
          background:'linear-gradient(135deg,#e65100,#ff8f00)',
          borderRadius:12, padding:'8px 16px', color:'#fff',
          display:'inline-flex', alignItems:'center', gap:8, boxShadow:'0 2px 8px rgba(0,0,0,0.15)'
        }}>
          <span style={{ fontSize:'1.25rem', fontWeight:800, lineHeight:1 }}>{activeCount}</span>
          <span style={{ fontSize:'0.74rem', opacity:0.9, fontWeight:600 }}>With Farmers</span>
        </div>
        <div style={{ flex:1 }} />
        <button className="btn-primary" type="button"
          onClick={() => { setForm({bagSuffix:'',farmerId:'',farmerName:'',farmerIdCard:'',notes:''}); setShowForm(true); }}>
          + Issue
        </button>
      </div>

      {/* Stock warning banner */}
      {balance !== null && balance <= 0 && (
        <div style={{
          background:'#fff3e0', border:'1.5px solid #e65100', borderRadius:10,
          padding:'10px 14px', marginBottom:12,
          fontSize:'0.82rem', fontWeight:700, color:'#e65100',
        }}>
          ⚠️ Bag stock is empty — issuing is disabled until HQ sends a resupply.
        </div>
      )}
      {balance !== null && balance > 0 && balance < 10 && (
        <div style={{
          background:'#fff8e1', border:'1.5px solid #fbc02d', borderRadius:10,
          padding:'10px 14px', marginBottom:12,
          fontSize:'0.82rem', fontWeight:700, color:'#f57f17',
        }}>
          ⚠️ Only {balance} bag{balance !== 1 ? 's' : ''} remaining — request resupply soon.
        </div>
      )}

      {/* Sort button */}
      <div style={{ position:'relative', marginBottom:14 }}>
        <button className="sort-toggle-btn" type="button" onClick={() => setShowSort(s=>!s)}>
          ↕ {sortLabel}
        </button>
        {showSort && (
          <div className="sort-dropdown">
            {ISSUE_SORT_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                className={`sort-option${sortBy===opt.value?' active':''}`}
                onClick={() => { setSortBy(opt.value); setShowSort(false); }}>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      {loading ? <div className="empty-state">Loading…</div>
        : sorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📤</div>
            <div>No bags currently issued to farmers.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {sorted.map(f => {
              const issuedCount = f.bags.filter(b=>b.status==='issued').length;
              const oldestIso   = f.bags.filter(b=>b.status==='issued').reduce((o,b)=>b.issuedAt<o?b.issuedAt:o, f.bags[0]?.issuedAt||'');
              const daysHeld    = oldestIso ? Math.floor((Date.now()-new Date(oldestIso))/86400000) : 0;
              return (
                <button key={f.farmerName} type="button"
                  onClick={() => setSelFarmer(f)}
                  style={{
                    background: daysHeld >= 7 ? '#fff8f0' : '#fff',
                    border:`1.5px solid ${daysHeld>=7?'#ffcc80':'#e0eef2'}`,
                    borderRadius:12, padding:'12px 8px', cursor:'pointer',
                    fontWeight:700, fontSize:'0.8rem', color:'#1a1a1a',
                    textAlign:'center', boxShadow:'0 1px 5px rgba(0,0,0,0.07)',
                  }}>
                  <div style={{ marginBottom:6 }}>
                    {f.farmerName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?'}
                  </div>
                  <div style={{ fontSize:'0.72rem', fontWeight:600, color:'#333', marginBottom:4, wordBreak:'break-word' }}>
                    {f.farmerName}
                  </div>
                  <div style={{ fontSize:'0.68rem', color:'#007c91', fontWeight:700 }}>
                    {issuedCount} bag{issuedCount!==1?'s':''}
                  </div>
                  {daysHeld >= 7 && (
                    <div style={{ fontSize:'0.65rem', color:'#e65100', marginTop:3 }}>⚠️ {daysHeld}d</div>
                  )}
                </button>
              );
            })}
          </div>
        )
      }

      {/* Farmer bags modal */}
      {selFarmer && (
        <FarmerBagsModal
          farmer={selFarmer.farmerName}
          bags={selFarmer.bags}
          onClose={() => setSelFarmer(null)}
        />
      )}

      {/* Issue bag modal */}
      {showForm && (
        <div className="overlay">
          <div className="overlay-card">
            <h3>📤 Issue Bag to Farmer</h3>
            <label className="field-label">Bag Serial Number (KI-) *</label>
            <div style={{
              display:'flex', alignItems:'center',
              border:'1.5px solid #ccc', borderRadius:8, overflow:'hidden', marginBottom:12
            }}>
              <div style={{
                padding:'0 10px', background:'#e8f4f7', fontWeight:800, fontSize:'0.88rem',
                color:'#007c91', borderRight:'1.5px solid #b2dfdb',
                height:44, display:'flex', alignItems:'center', flexShrink:0
              }}>KI-</div>
              <input type="text" value={form.bagSuffix}
                onChange={e => setForm(f=>({...f, bagSuffix:e.target.value}))}
                placeholder="00042" autoCapitalize="characters"
                style={{ flex:1, border:'none', padding:'0 10px', height:44, fontSize:'0.97rem', outline:'none' }} />
            </div>
            <label className="field-label">Farmer *</label>
            <select className="field-input" value={form.farmerId} onChange={e => selectFarmer(e.target.value)}>
              <option value="">— Select Farmer —</option>
              {farmers.map(f => <option key={f.id} value={f.id}>{f.name} ({f.farmerId})</option>)}
            </select>
            {form.farmerIdCard && (
              <p style={{ margin:'-8px 0 10px', fontSize:'0.82rem', color:'#888' }}>🪪 {form.farmerIdCard}</p>
            )}
            <label className="field-label">Notes (optional)</label>
            <input className="field-input" type="text" value={form.notes}
              onChange={e => setForm(f=>({...f,notes:e.target.value}))}
              placeholder="e.g. Replacement bag" />
            <div className="overlay-actions" style={{ flexDirection:'row', gap:10, marginTop:16 }}>
              <button className="btn-secondary" style={{ flex:1 }} onClick={() => setShowForm(false)} type="button">Cancel</button>
              <button className="btn-primary" style={{ flex:1 }} onClick={handleIssue} disabled={saving} type="button">
                {saving ? 'Saving…' : 'Confirm Issue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Bag Stock
// ══════════════════════════════════════════════════════════════════════════════
function BagStockTab({ user }) {
  const [balance,    setBalance]    = useState(0);
  const [emptyBags,  setEmptyBags]  = useState([]); // confirmed individual serials
  const [deliveries, setDeliveries] = useState([]); // pending from HQ
  const [issuances,  setIssuances]  = useState([]); // for returned bags flow
  const [farmers,    setFarmers]    = useState([]);
  const [msg,        setMsg]        = useState('');
  const [loading,    setLoading]    = useState(true);
  const [showPending,setShowPending]= useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [selBag,     setSelBag]     = useState(null);

  // Pending delivery confirm state
  const [pendingSelected, setPendingSelected] = useState(new Set());
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);

  // Return state
  const [returnFarmerId, setReturnFarmerId] = useState('');
  const [returnSelected, setReturnSelected] = useState(new Set());
  const [returningBags,  setReturningBags]  = useState(false);

  const stationId = user?.stationId || user?.uid;
  const stockRef  = doc(db, 'bagStock', stationId);
  const today     = new Date().toISOString().slice(0, 10);

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  useEffect(() => {
    if (!stationId) return;
    const BAGS_KEY = `hubEmptyBags_${stationId}`;
    const DEL_KEY  = `hubDeliveries_${stationId}`;
    // Hydrate from device storage for instant display
    storageGet(BAGS_KEY).then(v => {
      if (v) try { setEmptyBags(JSON.parse(v)); } catch {}
    });
    storageGet(DEL_KEY).then(v => {
      if (v) try { setDeliveries(JSON.parse(v)); } catch {}
    });
    const u1 = onSnapshot(stockRef, snap => {
      setBalance(snap.exists() ? (snap.data().balance||0) : 0);
      setLoading(false);
    });
    // Empty bags in stock (confirmed, not issued)
    const u2 = onSnapshot(
      query(collection(db,'bagInventory'), where('stationId','==',stationId), where('status','==','in_stock'), orderBy('receivedAt','desc')),
      snap => {
        const data = snap.docs.map(d=>({id:d.id,...d.data()}));
        setEmptyBags(data);
        storageSet(BAGS_KEY, JSON.stringify(data));
      }
    );
    // Pending deliveries from HQ
    const u3 = onSnapshot(
      query(collection(db,'bagDeliveries'), where('stationId','==',stationId), where('confirmed','==',false), orderBy('dispatchedAt','desc')),
      snap => {
        const data = snap.docs.map(d=>({id:d.id,...d.data()}));
        setDeliveries(data);
        storageSet(DEL_KEY, JSON.stringify(data));
      }
    );
    // Issued bags (for return flow)
    const u4 = onSnapshot(
      query(collection(db,'bagIssuances'), where('stationId','==',stationId), where('status','==','issued'), orderBy('issuedAt','desc')),
      snap => setIssuances(snap.docs.map(d=>({id:d.id,...d.data()})))
    );
    const u5 = onSnapshot(
      query(collection(db,'farmers'), where('stationId','==',stationId), orderBy('name')),
      snap => setFarmers(snap.docs.map(d=>({id:d.id,...d.data()})))
    );
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [stationId]);

  // Farmer's currently issued bags for return selection
  const farmerIssuedBags = useMemo(() =>
    issuances.filter(i => i.farmerId === returnFarmerId),
    [issuances, returnFarmerId]
  );

  async function confirmDelivery() {
    if (!pendingSelected.size) { flash('⚠️ Select the bags you physically received.'); return; }
    setConfirmingDelivery(true);
    const delivery        = deliveries[0];
    const selectedSerials = [...pendingSelected];
    const confirmedAt     = new Date().toISOString();
    const txnId           = newDocId();

    // 1. Update forage + UI immediately
    const BAGS_KEY   = `hubEmptyBags_${stationId}`;
    const DEL_KEY    = `hubDeliveries_${stationId}`;
    const newBagDocs = selectedSerials.map(serial => ({
      id: newDocId(), bagSerial:serial, stationId, status:'in_stock',
      receivedAt:confirmedAt, receivedDate:today,
      deliveryId:delivery?.id||'', recordedBy:user?.email||'',
    }));
    const newEmptyBags  = [...newBagDocs, ...emptyBags];
    const newDeliveries = deliveries.filter(d => d.id !== delivery?.id);
    await storageSet(BAGS_KEY, JSON.stringify(newEmptyBags));
    await storageSet(DEL_KEY,  JSON.stringify(newDeliveries));
    setEmptyBags(newEmptyBags);
    setDeliveries(newDeliveries);
    setBalance(b => b + selectedSerials.length);
    setPendingSelected(new Set()); setShowPending(false);
    flash(`✅ ${selectedSerials.length} bags confirmed and added to stock.`);

    // 2. Queue Firebase writes
    try {
      await Promise.all(newBagDocs.map(({ id, ...data }) =>
        queueWrite({ type:'setDoc', col:'bagInventory', id, data })
      ));
      await queueWrite({ type:'setDoc', col:'bagStock', id:stationId,
        data:{ balance:inc(selectedSerials.length), stationId, updatedAt:confirmedAt }, opts:{ merge:true } });
      await queueWrite({ type:'setDoc', col:'bagTransactions', id:txnId,
        data:{ stationId, type:'receive', qty:selectedSerials.length,
               note:`Received from HQ delivery (${selectedSerials.length} of ${delivery?.bags?.length||'?'} bags confirmed)`,
               recordedBy:user?.email||'', createdAt:confirmedAt, date:today } });
      if (delivery) {
        await queueWrite({ type:'updateDoc', col:'bagDeliveries', id:delivery.id,
          data:{ confirmed:true, confirmedAt, confirmedCount:selectedSerials.length } });
      }
    } catch (e) { flash('❌ Queue error: ' + e.message); }
    setConfirmingDelivery(false);
  }

  async function handleReturn() {
    if (!returnFarmerId)      { flash('⚠️ Select a farmer.'); return; }
    if (!returnSelected.size) { flash('⚠️ Select at least one bag.'); return; }
    setReturningBags(true);
    const returnedAt = new Date().toISOString();
    const count      = returnSelected.size;
    const txnId      = newDocId();
    const patch      = { status:'returned', returnedAt };

    // 1. Update forage + UI immediately
    const newIssuances = issuances.map(i =>
      returnSelected.has(i.id) ? { ...i, ...patch } : i
    );
    setIssuances(newIssuances);
    setBalance(b => b + count);
    setReturnSelected(new Set()); setReturnFarmerId(''); setShowReturn(false);
    flash(`✅ ${count} bag${count!==1?'s':''} returned to stock.`);

    // 2. Queue Firebase writes
    try {
      await Promise.all([...returnSelected].map(id =>
        queueWrite({ type:'updateDoc', col:'bagIssuances', id, data:patch })
      ));
      await queueWrite({ type:'setDoc', col:'bagStock', id:stationId,
        data:{ balance:inc(count), stationId, updatedAt:returnedAt }, opts:{ merge:true } });
      await queueWrite({ type:'setDoc', col:'bagTransactions', id:txnId,
        data:{ stationId, type:'return', qty:count,
               note:`${count} bag${count!==1?'s':''} returned by farmer`,
               recordedBy:user?.email||'', createdAt:returnedAt, date:today } });
    } catch (e) { flash('❌ ' + e.message); }
    setReturningBags(false);
  }

  const pendingDelivery = deliveries[0];
  const pendingSerials  = pendingDelivery?.bags || [];

  return (
    <div>
      {/* Action buttons row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:8 }}>
        <button type="button" onClick={() => setShowReturn(true)}
          style={{ padding:'9px 14px', background:'#e8f4f7', border:'1.5px solid #007c91', borderRadius:8,
            fontWeight:700, fontSize:'0.85rem', color:'#007c91', cursor:'pointer' }}>
          ↩️ Returned
        </button>
        <button type="button" onClick={() => setShowPending(true)}
          style={{ padding:'9px 14px', background: deliveries.length>0?'#e65100':'#007c91',
            border:'none', borderRadius:8, fontWeight:700, fontSize:'0.85rem', color:'#fff', cursor:'pointer',
            position:'relative' }}>
          📥 Pending Deliveries
          {deliveries.length > 0 && (
            <span style={{ position:'absolute', top:-6, right:-6, background:'#fbc02d',
              color:'#333', borderRadius:'50%', width:18, height:18, fontSize:'0.7rem',
              fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {deliveries.length}
            </span>
          )}
        </button>
      </div>

      {/* Bag Balance card */}
      <div style={{ background:'linear-gradient(135deg,#007c91,#339bbf)', borderRadius:14,
        padding:'18px 20px', marginBottom:20, color:'white' }}>
        <div style={{ fontSize:'0.75rem', opacity:0.8, textTransform:'uppercase', letterSpacing:'0.4px' }}>Bag Balance</div>
        <div style={{ fontSize:'2.5rem', fontWeight:800, lineHeight:1.1 }}>{loading?'…':balance}</div>
        <div style={{ fontSize:'0.8rem', opacity:0.8 }}>empty bags available at this station</div>
        {balance < 10 && !loading && (
          <div style={{ marginTop:8, background:'rgba(255,255,255,0.2)', borderRadius:8,
            padding:'6px 10px', fontSize:'0.78rem', fontWeight:700 }}>
            ⚠️ Low stock — request resupply from Tarawa
          </div>
        )}
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      {/* Empty Bags In Stock */}
      <div className="home-section-label">Empty Bags In Stock</div>
      {emptyBags.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🛍️</div>
          <div>No confirmed empty bags in stock.</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          {emptyBags.map(bag => (
            <button key={bag.id} type="button" onClick={() => setSelBag(bag)}
              style={{
                background:'#fff', border:'1.5px solid #e0eef2', borderRadius:10,
                padding:'10px 6px', cursor:'pointer', fontWeight:700, fontSize:'0.78rem',
                color:'#007c91', textAlign:'center', wordBreak:'break-all',
                boxShadow:'0 1px 4px rgba(0,0,0,0.07)',
              }}>
              {bag.bagSerial}
            </button>
          ))}
        </div>
      )}

      {/* Bag quick view */}
      {selBag && <BagQuickModal bag={selBag} onClose={() => setSelBag(null)} />}

      {/* Pending Deliveries modal */}
      {showPending && (
        <div className="overlay">
          <div className="overlay-card" style={{ maxHeight:'85vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 6px' }}>📥 Pending Delivery from Tarawa</h3>
            {!pendingDelivery ? (
              <><p style={{ color:'#888', fontSize:'0.88rem' }}>No pending deliveries from HQ.</p>
              <button className="btn-secondary" type="button" onClick={() => setShowPending(false)}>Close</button></>
            ) : (<>
              <p style={{ fontSize:'0.82rem', color:'#555', margin:'0 0 14px' }}>
                HQ dispatched <strong>{pendingSerials.length}</strong> bags on {new Date(pendingDelivery.dispatchedAt).toLocaleDateString()}.
                Select only the bags you physically received.
              </p>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.82rem', fontWeight:600, marginBottom:10 }}>
                <input type="checkbox"
                  checked={pendingSelected.size===pendingSerials.length && pendingSerials.length>0}
                  onChange={() => setPendingSelected(pendingSelected.size===pendingSerials.length
                    ? new Set() : new Set(pendingSerials))} />
                Select all ({pendingSerials.length})
              </label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
                {pendingSerials.map(serial => (
                  <label key={serial} style={{
                    display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                    background: pendingSelected.has(serial)?'#e8f4f7':'#fff',
                    border:`1.5px solid ${pendingSelected.has(serial)?'#007c91':'#e0eef2'}`,
                    borderRadius:10, padding:'10px 6px', cursor:'pointer',
                    fontWeight:700, fontSize:'0.78rem', color:'#007c91', textAlign:'center'
                  }}>
                    <input type="checkbox" checked={pendingSelected.has(serial)}
                      onChange={() => { const n=new Set(pendingSelected); n.has(serial)?n.delete(serial):n.add(serial); setPendingSelected(n); }}
                      style={{ marginBottom:2 }} />
                    {serial}
                  </label>
                ))}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn-secondary" style={{ flex:1 }} type="button" onClick={() => setShowPending(false)}>Cancel</button>
                <button className="btn-primary" style={{ flex:1 }} type="button"
                  onClick={confirmDelivery} disabled={confirmingDelivery||!pendingSelected.size}>
                  {confirmingDelivery?'Confirming…':`✅ Confirm (${pendingSelected.size})`}
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* Return bags modal */}
      {showReturn && (
        <div className="overlay">
          <div className="overlay-card" style={{ maxHeight:'85vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 14px' }}>↩️ Farmer Returns Empty Bags</h3>
            <label className="field-label">Select Farmer</label>
            <select className="field-input" value={returnFarmerId} onChange={e => { setReturnFarmerId(e.target.value); setReturnSelected(new Set()); }}>
              <option value="">— Select Farmer —</option>
              {[...new Set(issuances.map(i=>i.farmerId))].map(fId => {
                const f = issuances.find(i=>i.farmerId===fId);
                return <option key={fId} value={fId}>{f?.farmerName}</option>;
              })}
            </select>
            {returnFarmerId && farmerIssuedBags.length > 0 && (
              <>
                <div style={{ fontSize:'0.82rem', color:'#555', margin:'10px 0 8px' }}>
                  Select bags being returned:
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 }}>
                  {farmerIssuedBags.map(bag => (
                    <label key={bag.id} style={{
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                      background: returnSelected.has(bag.id)?'#e8f4f7':'#fff',
                      border:`1.5px solid ${returnSelected.has(bag.id)?'#007c91':'#e0eef2'}`,
                      borderRadius:10, padding:'10px 6px', cursor:'pointer',
                      fontWeight:700, fontSize:'0.78rem', color:'#007c91', textAlign:'center'
                    }}>
                      <input type="checkbox" checked={returnSelected.has(bag.id)}
                        onChange={() => { const n=new Set(returnSelected); n.has(bag.id)?n.delete(bag.id):n.add(bag.id); setReturnSelected(n); }}
                        style={{ marginBottom:2 }} />
                      {bag.bagSerial}
                    </label>
                  ))}
                </div>
              </>
            )}
            {returnFarmerId && farmerIssuedBags.length === 0 && (
              <p style={{ color:'#888', fontSize:'0.85rem' }}>No bags currently issued to this farmer.</p>
            )}
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="btn-secondary" style={{ flex:1 }} type="button" onClick={() => { setShowReturn(false); setReturnFarmerId(''); setReturnSelected(new Set()); }}>Cancel</button>
              <button className="btn-primary" style={{ flex:1 }} type="button"
                onClick={handleReturn} disabled={returningBags||!returnSelected.size}>
                {returningBags?'Saving…':`✅ Confirm Return (${returnSelected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function BagsHubSection({ user }) {
  const [tab, setTab] = useState('issue');
  return (
    <section>
      <h2 className="section-title">📦 Bags &amp; Stock</h2>
      <div className="tab-bar">
        <button className={`tab-btn${tab==='issue'?' active':''}`} onClick={() => setTab('issue')} type="button">📤 Issued Bags</button>
        <button className={`tab-btn${tab==='stock'?' active':''}`} onClick={() => setTab('stock')} type="button">🛍️ Bag Stock</button>
      </div>
      {tab==='issue' ? <IssueBagsTab user={user} /> : <BagStockTab user={user} />}
    </section>
  );
}
