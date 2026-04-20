// src/sections/FarmersSection.jsx
import { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, updateDoc, onSnapshot, query, where, orderBy, getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { storageGet, storageSet } from '../utils/storage';
import { newDocId, queueWrite } from '../utils/syncManager';

const EMPTY = { name: '', idCard: '', village: '', gender: '', email: '', phone: '', whatsapp: '' };

function genFarmerId(existing) {
  const max = existing.reduce((m, f) => {
    const n = parseInt((f.farmerId || '').replace('KI-', ''));
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `KI-${String(max + 1).padStart(3, '0')}`;
}

const gIcon = g => g === 'Male' ? '♂' : g === 'Female' ? '♀' : '';

/* ── shared style tokens ── */
const th = { padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.4px' };
const td = { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' };

const TAB_STRIP = {
  display: 'flex', overflowX: 'auto', gap: 6,
  marginBottom: 20, WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none', paddingBottom: 2
};

const tabBtn = (active) => ({
  whiteSpace: 'nowrap', padding: '8px 20px', border: 'none',
  borderRadius: 20, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
  background: active ? '#007c91' : '#e8f4f7',
  color: active ? '#fff' : '#007c91',
  flexShrink: 0, transition: 'all 0.18s'
});

const backBtn = {
  background: 'none', border: 'none', color: '#007c91', fontWeight: 700,
  fontSize: '0.9rem', cursor: 'pointer', padding: '10px 0 4px',
  display: 'flex', alignItems: 'center', gap: 4
};

/* ═══════════════ PROFILE SCREEN ═══════════════ */
function FarmerProfile({ farmer: init, onSaved, user }) {
  const [farmer, setFarmer] = useState(init);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState('');

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000); }

  function startEdit() {
    setForm({
      name:     farmer.name     || '',
      idCard:   farmer.idCard   || '',
      village:  farmer.village  || '',
      gender:   farmer.gender   || '',
      email:    farmer.email    || '',
      phone:    farmer.phone    || '',
      whatsapp: farmer.whatsapp || '',
    });
    setEditing(true);
  }

  async function save() {
    if (!form.name.trim())   { flash('⚠️ Name is required.'); return; }
    if (!form.idCard.trim()) { flash('⚠️ ID Card is required.'); return; }
    setSaving(true);
    const data = {
      name: form.name.trim(), idCard: form.idCard.trim(),
      village: form.village.trim(), gender: form.gender,
      email: form.email.trim(), phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(), updatedAt: new Date().toISOString(),
    };
    // 1. Optimistic UI update
    const updated = { ...farmer, ...data };
    setFarmer(updated);
    if (onSaved) onSaved(updated);
    setEditing(false);
    flash('✅ Profile updated.');
    // 2. Queue Firebase write — will sync when online
    try {
      await queueWrite({ type: 'updateDoc', col: 'farmers', id: farmer.id, data });
    } catch (e) { console.warn('[FarmerProfile] queue failed:', e.message); }
    setSaving(false);
  }

  const LabelVal = ({ label, value, href, icon }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: '0.71rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.5px', color: '#888', marginBottom: 3 }}>{label}</div>
      {href
        ? <a href={href} style={{ color: '#007c91', fontWeight: 600, fontSize: '0.97rem', textDecoration: 'none' }}>
            {icon && <span style={{ marginRight: 5 }}>{icon}</span>}{value || '—'}
          </a>
        : <div style={{ fontSize: '0.97rem', fontWeight: 500, color: '#222' }}>
            {icon && <span style={{ marginRight: 5 }}>{icon}</span>}{value || '—'}
          </div>}
    </div>
  );

  const card = (children) => (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '16px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.09)', marginBottom: 14
    }}>{children}</div>
  );

  const sectionHead = (label) => (
    <div style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase',
      letterSpacing: '0.5px', color: '#888', marginBottom: 14 }}>{label}</div>
  );

  if (editing) return (
    <div>
      {msg && <div className="section-msg">{msg}</div>}
      {card(<>
        {sectionHead('Edit Profile')}
        <label className="field-label">Full Name *</label>
        <input className="field-input" type="text" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

        <label className="field-label">Gender</label>
        <select className="field-input" value={form.gender}
          onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
          <option value="">— Select —</option>
          <option value="Male">♂ Male</option>
          <option value="Female">♀ Female</option>
        </select>

        <label className="field-label">ID Card Number *</label>
        <input className="field-input" type="text" value={form.idCard}
          onChange={e => setForm(f => ({ ...f, idCard: e.target.value }))} />

        <label className="field-label">Phone Number</label>
        <input className="field-input" type="tel" value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />

        <label className="field-label">WhatsApp Number</label>
        <input className="field-input" type="tel" value={form.whatsapp}
          onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
          placeholder="e.g. +686 71234567" />

        <label className="field-label">Email</label>
        <input className="field-input" type="email" value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />

        <label className="field-label">Village / Island</label>
        <input className="field-input" type="text" value={form.village}
          onChange={e => setForm(f => ({ ...f, village: e.target.value }))} />

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn-secondary" style={{ flex: 1 }}
            onClick={() => setEditing(false)} type="button">Cancel</button>
          <button className="btn-primary" style={{ flex: 1 }}
            onClick={save} disabled={saving} type="button">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </>)}
    </div>
  );

  return (
    <div>
      {/* Hero card */}
      <div style={{
        background: 'linear-gradient(135deg,#007c91,#339bbf)', borderRadius: 16,
        padding: '20px 18px', color: '#fff', marginBottom: 16
      }}>
        <div style={{ fontSize: '1.45rem', fontWeight: 800 }}>
          {farmer.name} {gIcon(farmer.gender) && <span style={{ fontSize: '1rem', opacity: 0.85 }}>{gIcon(farmer.gender)}</span>}
        </div>
        <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: 4 }}>
          🪪 {farmer.idCard} &nbsp;·&nbsp; 🆔 {farmer.farmerId}
        </div>
        {farmer.village && <div style={{ fontSize: '0.82rem', opacity: 0.8, marginTop: 3 }}>📍 {farmer.village}</div>}
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      {card(<>
        {sectionHead('Contact')}
        <LabelVal label="Phone" value={farmer.phone} href={farmer.phone ? `tel:${farmer.phone}` : undefined} icon="📞" />
        <LabelVal label="WhatsApp" value={farmer.whatsapp}
          href={farmer.whatsapp ? `https://wa.me/${farmer.whatsapp.replace(/[^0-9]/g,'')}` : undefined} icon="💬" />
        <LabelVal label="Email" value={farmer.email} href={farmer.email ? `mailto:${farmer.email}` : undefined} icon="✉️" />
      </>)}

      {card(<>
        {sectionHead('Details')}
        <LabelVal label="Gender" value={farmer.gender} />
        <LabelVal label="Village / Island" value={farmer.village} icon="📍" />
        <LabelVal label="Registered At" value={farmer.registeredAt ? new Date(farmer.registeredAt).toLocaleDateString() : '—'} />
        <LabelVal label="Registered By" value={farmer.registeredBy} />
      </>)}

      <button className="btn-primary" onClick={startEdit} type="button" style={{ width: '100%' }}>
        ✏️ Edit Profile
      </button>
    </div>
  );
}

/* ═══════════════ TRANSACTIONS SCREEN ═══════════════ */
function FarmerTransactions({ farmer }) {
  const [issuances, setIssuances] = useState([]);
  const [weighings, setWeighings] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let done = 0;
    const finish = () => { done++; if (done >= 3) setLoading(false); };
    const u1 = onSnapshot(
      query(collection(db,'bagIssuances'), where('farmerId','==',farmer.id), orderBy('issuedAt','desc')),
      snap => { setIssuances(snap.docs.map(d=>({id:d.id,...d.data()}))); finish(); }, () => finish()
    );
    const u2 = onSnapshot(
      query(collection(db,'shedStock'), where('farmerId','==',farmer.id), orderBy('weighedAt','desc')),
      snap => { setWeighings(snap.docs.map(d=>({id:d.id,...d.data()}))); finish(); }, () => finish()
    );
    const stId = farmer.stationId || '';
    const u3 = stId
      ? onSnapshot(
          query(collection(db,'shipments'), where('stationId','==',stId), orderBy('shippedAt','desc')),
          snap => {
            const all = snap.docs.map(d=>({id:d.id,...d.data()}));
            setShipments(all.filter(sh=>(sh.bags||[]).some(b=>b.farmerId===farmer.id)));
            finish();
          }, () => finish()
        )
      : (() => { finish(); return ()=>{}; })();
    return () => { u1(); u2(); u3(); };
  }, [farmer.id, farmer.stationId]);

  const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})
    : '--';

  const events = [];
  const byDate = {};
  issuances.forEach(i => {
    const d = i.issuedDate || fmtDate(i.issuedAt);
    if (!byDate[d]) byDate[d] = { date:d, ts:i.issuedAt, items:[], returns:[] };
    if (i.status === 'returned') byDate[d].returns.push(i);
    else byDate[d].items.push(i);
  });
  Object.values(byDate).forEach(g => {
    if (g.items.length)   events.push({ _ts:g.ts, _kind:'issue',  date:g.date, bags:g.items });
    if (g.returns.length) events.push({ _ts:g.returns[0].returnedAt||g.ts, _kind:'return', date:g.date, bags:g.returns });
  });
  const wByDate = {};
  weighings.forEach(w => {
    const d = w.weighedDate || fmtDate(w.weighedAt);
    if (!wByDate[d]) wByDate[d] = { date:d, ts:w.weighedAt, qualityBags:[], batches:[] };
    if (w.type==='unstacked_batch'||w.notes==='Unstacked batch') wByDate[d].batches.push(w);
    else wByDate[d].qualityBags.push(w);
  });
  Object.values(wByDate).forEach(g =>
    events.push({ _ts:g.ts, _kind:'weigh', date:g.date, qualityBags:g.qualityBags, batches:g.batches })
  );
  shipments.forEach(sh => {
    const fb = (sh.bags||[]).filter(b=>b.farmerId===farmer.id);
    if (fb.length) events.push({ _ts:sh.shippedAt, _kind:'ship', date:sh.shipDate, vessel:sh.vesselName, bags:fb });
  });
  events.sort((a,b)=>(b._ts||'').localeCompare(a._ts||''));

  if (loading) return <div className="empty-state">Loading transactions...</div>;
  if (!events.length) return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <div>No transactions found for this farmer.</div>
    </div>
  );

  const TxCard = ({ icon, color, bg, label, date, children }) => (
    <div style={{ background:'#fff', borderRadius:12, padding:'14px 16px',
      boxShadow:'0 1px 6px rgba(0,0,0,0.08)', marginBottom:10, borderLeft:`4px solid ${color}` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ background:bg, color, borderRadius:8, padding:'3px 10px', fontWeight:700, fontSize:'0.78rem' }}>
          {icon} {label}
        </span>
        <span style={{ fontSize:'0.74rem', color:'#888' }}>{date}</span>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ paddingBottom:20 }}>
      {events.map((ev, i) => {
        if (ev._kind === 'issue') return (
          <TxCard key={i} icon="📤" label="Issued Empty Bags" color="#007c91" bg="#e8f4f7" date={ev.date}>
            <div style={{ fontSize:'0.82rem', color:'#333', lineHeight:1.7 }}>
              {ev.bags.map(b=>b.bagSerial).join(', ')}
            </div>
            <div style={{ fontSize:'0.74rem', color:'#888', marginTop:4 }}>
              {ev.bags.length} bag{ev.bags.length!==1?'s':''} issued
            </div>
          </TxCard>
        );
        if (ev._kind === 'return') return (
          <TxCard key={i} icon="↩️" label="Returned Empty Bags" color="#2e7d32" bg="#e8f5e9" date={ev.date}>
            <div style={{ fontSize:'0.82rem', color:'#333', lineHeight:1.7 }}>
              {ev.bags.map(b=>b.bagSerial).join(', ')}
            </div>
          </TxCard>
        );
        if (ev._kind === 'weigh') {
          const totalKg = [...ev.qualityBags,...ev.batches].reduce((s,b)=>s+(b.stationWeight||0),0);
          const batchKg = ev.batches.reduce((s,b)=>s+(b.stationWeight||0),0);
          return (
            <TxCard key={i} icon="⚖️" label="Sold Copra" color="#e65100" bg="#fff3e0" date={ev.date}>
              {ev.qualityBags.length > 0 && (
                <div style={{ fontSize:'0.82rem', color:'#333', marginBottom:4 }}>
                  <strong>Quality bags:</strong>{' '}
                  {ev.qualityBags.map(b=>`${b.bagSerial} (${b.stationWeight?.toFixed(1)} kg)`).join(', ')}
                </div>
              )}
              {ev.batches.length > 0 && (
                <div style={{ fontSize:'0.82rem', color:'#333', marginBottom:4 }}>
                  <strong>Unstacked batches:</strong> {batchKg.toFixed(2)} kg total
                </div>
              )}
              <div style={{ fontSize:'0.74rem', color:'#888', marginTop:4, fontWeight:700 }}>
                Total: {totalKg.toFixed(2)} kg
              </div>
            </TxCard>
          );
        }
        if (ev._kind === 'ship') return (
          <TxCard key={i} icon="🚢" label="Shipped to Tarawa" color="#1565c0" bg="#e3f2fd" date={ev.date}>
            <div style={{ fontSize:'0.82rem', color:'#333', marginBottom:4 }}>
              <strong>Vessel:</strong> {ev.vessel}
            </div>
            <div style={{ fontSize:'0.82rem', color:'#333', lineHeight:1.7 }}>
              {ev.bags.map(b=>b.bagSerial).join(', ')}
            </div>
            <div style={{ fontSize:'0.74rem', color:'#888', marginTop:4 }}>
              {ev.bags.length} bag{ev.bags.length!==1?'s':''} · {ev.bags.reduce((s,b)=>s+(b.stationWeight||0),0).toFixed(2)} kg
            </div>
          </TxCard>
        );
        return null;
      })}
    </div>
  );
}

/* ═══════════════ FARMER DETAIL (tab shell) ═══════════════ */
const TABS = [
  { key: 'profile',      label: 'Profile' },
  { key: 'transactions', label: 'Transactions History' },
];

function FarmerDetail({ farmer: init, onBack, onFarmerUpdated, user }) {
  const [tab, setTab]       = useState('profile');
  const [farmer, setFarmer] = useState(init);

  function handleSaved(updated) {
    setFarmer(updated);
    if (onFarmerUpdated) onFarmerUpdated(updated);
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <button onClick={onBack} type="button" style={backBtn}>← Farmers Registry</button>
      <div style={{ fontWeight: 800, fontSize: '1.15rem', margin: '6px 0 14px' }}>
        {farmer.name}
        {gIcon(farmer.gender) && (
          <span style={{ fontSize: '0.95rem', color: '#007c91', marginLeft: 6 }}>{gIcon(farmer.gender)}</span>
        )}
      </div>
      <div style={TAB_STRIP}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} style={tabBtn(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'profile' && <FarmerProfile farmer={farmer} onSaved={handleSaved} user={user} />}
      {tab === 'transactions' && <FarmerTransactions farmer={farmer} />}
    </div>
  );
}

/* ═══════════════ MAIN SECTION ═══════════════ */
export default function FarmersSection({ user }) {
  const [farmers, setFarmers]         = useState([]);
  const [search, setSearch]           = useState('');
  const [form, setForm]               = useState(EMPTY);
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState('');
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  // Duplicate ID card notification state
  const [dupAlert, setDupAlert]       = useState(null); // { name, village, stationId }

  const stationId = user?.stationId || user?.uid;
  const FARMERS_KEY = `farmers_${stationId}`;

  // ── Load farmers: forage first, then merge with Firebase snapshots ──────────
  useEffect(() => {
    if (!stationId) return;
    storageGet(FARMERS_KEY).then(v => {
      if (v) try { setFarmers(JSON.parse(v)); setLoading(false); } catch {}
    });
    const q = query(collection(db,'farmers'), where('stationId','==',stationId), orderBy('name'));
    const unsub = onSnapshot(q, snap => {
      const fbData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Merge: keep any locally-added farmers not yet in Firebase
      setFarmers(prev => {
        const fbIds   = new Set(fbData.map(f => f.id));
        const localOnly = prev.filter(f => !fbIds.has(f.id));
        const merged  = [...fbData, ...localOnly].sort((a,b) => a.name.localeCompare(b.name));
        storageSet(FARMERS_KEY, JSON.stringify(merged));
        return merged;
      });
      setLoading(false);
    });
    return unsub;
  }, [stationId]);

  // ── Check for pending duplicate ID card verifications when coming online ────
  useEffect(() => {
    if (!stationId) return;
    const PENDING_KEY = `pendingCardChecks_${stationId}`;
    const runChecks = async () => {
      const raw = await storageGet(PENDING_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending.length) return;
      const remaining = [];
      for (const item of pending) {
        try {
          const snap = await getDocs(
            query(collection(db,'farmers'), where('idCard','==',item.idCard))
          );
          const others = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(f => f.id !== item.localId);
          if (others.length > 0) {
            const dup = others[0];
            setDupAlert({
              idCard:   item.idCard,
              newName:  item.name,
              dupName:  dup.name,
              dupVillage: dup.village || '—',
              dupStation: dup.stationId || '—',
              sameStation: dup.stationId === stationId,
            });
          }
        } catch {
          remaining.push(item); // keep for next retry
        }
      }
      await storageSet(PENDING_KEY, JSON.stringify(remaining));
    };
    if (navigator.onLine) runChecks();
    window.addEventListener('online', runChecks);
    return () => window.removeEventListener('online', runChecks);
  }, [stationId]);

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 4000); }

  async function handleFarmerUpdated(updated) {
    const newList = farmers.map(f => f.id === updated.id ? updated : f);
    setFarmers(newList);
    await storageSet(FARMERS_KEY, JSON.stringify(newList));
  }

  async function handleSave() {
    if (!form.name.trim())   { flash('⚠️ Name is required.'); return; }
    if (!form.idCard.trim()) { flash('⚠️ ID Card number is required.'); return; }

    const cardUpper = form.idCard.trim().toUpperCase();

    // ── 1. Check forage for duplicate ID card ────────────────────────────────
    const localDup = farmers.find(f => (f.idCard||'').toUpperCase() === cardUpper);
    if (localDup) {
      flash(`⚠️ ID Card ${cardUpper} is already registered to ${localDup.name}${localDup.village ? ' from ' + localDup.village : ''}.`);
      return;
    }

    // ── 2. If online, check Firebase across ALL stations ─────────────────────
    if (navigator.onLine) {
      try {
        const snap = await getDocs(
          query(collection(db,'farmers'), where('idCard','==',cardUpper))
        );
        if (!snap.empty) {
          const dup = snap.docs[0].data();
          const loc = dup.village ? `${dup.village}` : '';
          const sta = dup.stationId !== stationId ? ' (different station)' : ' (this station)';
          flash(`⚠️ ID Card ${cardUpper} is already registered to ${dup.name}${loc ? ', ' + loc : ''}${sta}.`);
          return;
        }
      } catch (e) {
        console.warn('[FarmersSection] Firebase card check failed:', e.message);
        // fall through and allow save — will be verified when online later
      }
    }

    setSaving(true);
    const id       = newDocId();
    const farmerId = genFarmerId(farmers);
    const data = {
      name: form.name.trim(), idCard: cardUpper,
      village: form.village.trim(), gender: form.gender,
      email: form.email.trim(), phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(), farmerId, stationId,
      registeredBy: user?.email || '',
      registeredAt: new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };
    const newFarmer = { id, ...data };

    // ── 3. Update forage + UI immediately ────────────────────────────────────
    const newList = [...farmers, newFarmer].sort((a,b) => a.name.localeCompare(b.name));
    setFarmers(newList);
    setLoading(false);   // ← clear any lingering loading state so the list renders immediately
    await storageSet(FARMERS_KEY, JSON.stringify(newList));
    setShowForm(false);
    setForm(EMPTY);
    flash('✅ Farmer registered.');

    // ── 4. Queue Firebase write ───────────────────────────────────────────────
    try {
      await queueWrite({ type: 'setDoc', col: 'farmers', id, data });
    } catch (e) { flash('❌ Queue error: ' + e.message); }

    // ── 5. If offline, queue a pending card verification for when online ──────
    if (!navigator.onLine) {
      try {
        const PENDING_KEY = `pendingCardChecks_${stationId}`;
        const raw     = await storageGet(PENDING_KEY);
        const pending = raw ? JSON.parse(raw) : [];
        pending.push({ localId: id, idCard: cardUpper, name: data.name });
        await storageSet(PENDING_KEY, JSON.stringify(pending));
      } catch {}
    }

    setSaving(false);
  }

  const filtered = farmers.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.idCard||'').toLowerCase().includes(search.toLowerCase()) ||
    (f.farmerId||'').toLowerCase().includes(search.toLowerCase())
  );

  /* ─ Farmer detail screen ─ */
  if (selected) {
    const live = farmers.find(f => f.id === selected.id) || selected;
    return (
      <section>
        <h2 className="section-title">👩‍🌾 Farmers Registry</h2>
        <FarmerDetail farmer={live} onBack={() => setSelected(null)} user={user} onFarmerUpdated={handleFarmerUpdated} />
      </section>
    );
  }

  /* ─ Main list ─ */
  return (
    <section>
      <h2 className="section-title">👩‍🌾 Farmers Registry</h2>

      {/* Duplicate ID card alert */}
      {dupAlert && (
        <div style={{
          background: '#fff3cd', border: '1.5px solid #ffc107', borderRadius: 12,
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#856404', marginBottom: 6 }}>
            ⚠️ Duplicate ID Card Detected
          </div>
          <div style={{ fontSize: '0.84rem', color: '#533f03', lineHeight: 1.6 }}>
            The ID card <strong>{dupAlert.idCard}</strong> you registered for <strong>{dupAlert.newName}</strong> is
            already in use by <strong>{dupAlert.dupName}</strong>
            {dupAlert.dupVillage !== '—' ? ` from ${dupAlert.dupVillage}` : ''}
            {dupAlert.sameStation ? ' at this station' : ' at a different station'}.
            Please verify and correct the record.
          </div>
          <button type="button" onClick={() => setDupAlert(null)}
            style={{ marginTop: 10, background: '#856404', color: '#fff', border: 'none',
              borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        {[
          { value: farmers.length,  label: 'Registered', grad: 'linear-gradient(135deg,#007c91,#339bbf)' },
          { value: filtered.length, label: 'Shown',      grad: 'linear-gradient(135deg,#2e7d32,#66bb6a)' },
        ].map(s => (
          <div key={s.label} style={{
            background: s.grad, borderRadius: 12, padding: '8px 16px', color: '#fff',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}>
            <span style={{ fontSize:'1.25rem', fontWeight:800, lineHeight:1 }}>{s.value}</span>
            <span style={{ fontSize:'0.74rem', opacity:0.9, fontWeight:600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      <div className="row-between" style={{ marginBottom:14 }}>
        <input type="search" placeholder="Search name, ID, farmer #…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn-primary" onClick={() => { setForm(EMPTY); setShowForm(true); }} type="button">+ Add</button>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👩‍🌾</div>
          <div>{search ? 'No results found.' : 'No farmers registered yet.'}</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(f => (
            <button key={f.id} type="button" onClick={() => setSelected(f)}
              style={{
                width:'100%', textAlign:'left', background:'#fff',
                border:'1.5px solid #e0eef2', borderRadius:12,
                padding:'12px 16px', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                boxShadow:'0 1px 5px rgba(0,0,0,0.07)',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{
                  width:38, height:38, borderRadius:'50%',
                  background:'linear-gradient(135deg,#007c91,#339bbf)',
                  color:'#fff', fontWeight:800, fontSize:'1rem',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
                }}>
                  {f.name.trim()[0]?.toUpperCase()||'?'}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:'0.97rem', color:'#1a1a1a' }}>
                    {f.name}
                    {gIcon(f.gender) && <span style={{ fontSize:'0.85rem', color:'#007c91', marginLeft:5 }}>{gIcon(f.gender)}</span>}
                  </div>
                  <div style={{ fontSize:'0.76rem', color:'#888', marginTop:2 }}>
                    {f.farmerId}{f.village ? ` · 📍 ${f.village}` : ''}
                  </div>
                </div>
              </div>
              <span style={{ color:'#bbb', fontSize:'1.1rem' }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* Register Farmer modal */}
      {showForm && (
        <div className="overlay">
          <div className="overlay-card" style={{ maxHeight:'90vh', overflowY:'auto' }}>
            <h3>➕ Register Farmer</h3>
            <p style={{ fontSize:'0.82rem', color:'#888', marginTop:0 }}>Farmer ID will be auto-generated.</p>

            <label className="field-label">Full Name *</label>
            <input className="field-input" type="text" value={form.name}
              onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Timon Bauro" />

            <label className="field-label">Gender</label>
            <select className="field-input" value={form.gender}
              onChange={e => setForm(f=>({...f,gender:e.target.value}))}>
              <option value="">— Select —</option>
              <option value="Male">♂ Male</option>
              <option value="Female">♀ Female</option>
            </select>

            <label className="field-label">ID Card Number *</label>
            <input className="field-input" type="text" value={form.idCard}
              onChange={e => setForm(f=>({...f,idCard:e.target.value}))}
              placeholder="e.g. KI-1234567" autoCapitalize="characters" />

            <label className="field-label">Phone Number</label>
            <input className="field-input" type="tel" value={form.phone}
              onChange={e => setForm(f=>({...f,phone:e.target.value}))} placeholder="e.g. +686 71234567" />

            <label className="field-label">WhatsApp Number</label>
            <input className="field-input" type="tel" value={form.whatsapp}
              onChange={e => setForm(f=>({...f,whatsapp:e.target.value}))} placeholder="e.g. +686 71234567" />

            <label className="field-label">Email</label>
            <input className="field-input" type="email" value={form.email}
              onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="e.g. timon@example.com" />

            <label className="field-label">Village / Island</label>
            <input className="field-input" type="text" value={form.village}
              onChange={e => setForm(f=>({...f,village:e.target.value}))} placeholder="e.g. Nonouti" />

            <div className="overlay-actions" style={{ flexDirection:'row', gap:10, marginTop:16 }}>
              <button className="btn-secondary" style={{ flex:1 }}
                onClick={() => { setShowForm(false); setForm(EMPTY); }} type="button">Cancel</button>
              <button className="btn-primary" style={{ flex:1 }}
                onClick={handleSave} disabled={saving} type="button">
                {saving ? 'Checking…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
