// src/sections/ShedStockSection.jsx
import { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { storageGet, storageSet } from '../utils/storage';
import { newDocId, queueWrite } from '../utils/syncManager';

// Firestore offline persistence (persistentLocalCache) is enabled in firebase.js.
// All writes are queued locally and synced automatically — no manual forage needed.

// ── Serial input with fixed prefix ────────────────────────────────────────
function SerialInput({ suffix, onChange, isStation, prefix, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      border: '1.5px solid #ccc', borderRadius: 8, overflow: 'hidden',
      background: disabled ? '#f5f5f5' : '#fff', opacity: disabled ? 0.6 : 1,
    }}>
      <div style={{
        padding: '0 10px', background: isStation ? '#fff3e0' : '#e8f4f7',
        fontWeight: 800, fontSize: '0.88rem',
        color: isStation ? '#e65100' : '#007c91',
        borderRight: `1.5px solid ${isStation ? '#ffcc80' : '#b2dfdb'}`,
        height: 44, display: 'flex', alignItems: 'center',
        flexShrink: 0, userSelect: 'none', letterSpacing: '0.5px',
      }}>
        {prefix}
      </div>
      <input type="text" value={suffix} onChange={e => onChange(e.target.value)}
        placeholder="00042" autoCapitalize="characters" disabled={disabled}
        style={{ flex: 1, border: 'none', padding: '0 10px', height: 44,
          fontSize: '0.97rem', outline: 'none', background: 'transparent' }} />
    </div>
  );
}

export default function ShedStockSection({ user, userProfile }) {
  const [farmers,      setFarmers]      = useState([]);
  const [issuances,    setIssuances]    = useState([]); // bags issued to selected farmer
  const [showBagPicker,setShowBagPicker]= useState(false);
  const [msg,          setMsg]          = useState('');

  // Session
  const [sessionFarmerId,   setSessionFarmerId]   = useState('');
  const [sessionFarmerName, setSessionFarmerName] = useState('');
  const [sessionFarmerCard, setSessionFarmerCard] = useState('');
  const [sessionBags,       setSessionBags]       = useState([]);
  const [sessionBatches,    setSessionBatches]    = useState([]);

  // Bag modal
  const [showBagModal, setShowBagModal] = useState(false);
  const [bagSuffix,    setBagSuffix]    = useState('');
  const [bagWeight,    setBagWeight]    = useState('');
  const [bagIsStation, setBagIsStation] = useState(false);

  // Batch modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchWeight,    setBatchWeight]    = useState('');

  const [saving, setSaving] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const stationId  = user?.stationId || user?.uid;
  const today      = new Date().toISOString().slice(0, 10);
  const nowISO     = () => new Date().toISOString();
  const nowDisplay = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const stationPrefix = (
    userProfile?.stationCode ||
    (userProfile?.stationName || '').split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 3) ||
    'STN'
  );

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  useEffect(() => {
    if (!stationId) return;
    return onSnapshot(
      query(collection(db, 'farmers'), where('stationId', '==', stationId), orderBy('name')),
      snap => setFarmers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [stationId]);

  // Restore any in-progress session that was interrupted (crash / forced close)
  useEffect(() => {
    if (!stationId) return;
    storageGet(`shedSession_${stationId}`).then(v => {
      if (v) try {
        const s = JSON.parse(v);
        if (s.sessionFarmerId) {
          setSessionFarmerId(s.sessionFarmerId);
          setSessionFarmerName(s.sessionFarmerName || '');
          setSessionFarmerCard(s.sessionFarmerCard || '');
        }
        if (s.sessionBags?.length)    setSessionBags(s.sessionBags);
        if (s.sessionBatches?.length) setSessionBatches(s.sessionBatches);
      } catch {}
      setSessionLoaded(true);
    });
  }, [stationId]);

  // Persist session to device whenever it changes (only after restoration to avoid clobbering)
  useEffect(() => {
    if (!stationId || !sessionLoaded) return;
    storageSet(`shedSession_${stationId}`, JSON.stringify({
      sessionFarmerId, sessionFarmerName, sessionFarmerCard, sessionBags, sessionBatches,
    }));
  }, [stationId, sessionLoaded, sessionFarmerId, sessionFarmerName, sessionFarmerCard, sessionBags, sessionBatches]);

  function pickFarmer(fId) {
    const f = farmers.find(x => x.id === fId);
    if (f) { setSessionFarmerId(f.id); setSessionFarmerName(f.name); setSessionFarmerCard(f.idCard || ''); }
    else   { setSessionFarmerId(''); setSessionFarmerName(''); setSessionFarmerCard(''); }
    setSessionBags([]); setSessionBatches([]);
    setIssuances([]);
    if (!fId) return;
    // Load bags currently issued to this farmer
    import('firebase/firestore').then(({ getDocs, query: q, collection: col, where: w }) => {
      getDocs(q(col(db, 'bagIssuances'), w('farmerId', '==', fId), w('status', '==', 'issued')))
        .then(snap => setIssuances(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(() => {});
    });
  }

  // Called when inspector picks a bag from the picker modal
  function selectBagFromPicker(bag) {
    const serial  = bag.bagSerial;
    const isKI    = serial.startsWith('KI-');
    const suffix  = isKI ? serial.slice(3) : serial;
    setBagSuffix(suffix);
    setBagIsStation(!isKI);
    setShowBagPicker(false);
    setShowBagModal(true); // open weight entry with serial pre-filled
  }

  function handleAddBag() {
    if (!bagSuffix.trim())             { flash('⚠️ Enter the bag serial number.'); return; }
    if (!bagWeight || +bagWeight <= 0) { flash('⚠️ Enter a valid weight.'); return; }
    const prefix = bagIsStation ? `${stationPrefix}-` : 'KI-';
    const serial = prefix + bagSuffix.trim().toUpperCase();
    if (sessionBags.find(b => b.bagSerial === serial)) {
      flash(`⚠️ ${serial} already added in this session.`); return;
    }
    setSessionBags(prev => [...prev, {
      _id: Date.now() + Math.random(),
      type: 'quality_bag', bagSerial: serial,
      stationWeight: parseFloat(bagWeight),
    }]);
    setBagSuffix(''); setBagWeight(''); setBagIsStation(false);
    setShowBagModal(false);
    // Remove from local issuances list so it can't be re-picked this session
    setIssuances(prev => prev.filter(i => i.bagSerial !== serial));
  }

  function handleAddBatch() {
    if (!batchWeight || +batchWeight <= 0) { flash('⚠️ Enter a valid batch weight.'); return; }
    setSessionBatches(prev => [...prev, {
      _id: Date.now() + Math.random(),
      type: 'unstacked_batch',
      bagSerial: `BATCH-${Date.now()}`,
      stationWeight: parseFloat(batchWeight),
      notes: 'Unstacked batch',
    }]);
    setBatchWeight(''); setShowBatchModal(false);
  }

  function removeBag(id)   { setSessionBags(prev => prev.filter(b => b._id !== id)); }
  function removeBatch(id) { setSessionBatches(prev => prev.filter(b => b._id !== id)); }

  async function handleSaveSession() {
    if (!sessionFarmerId)                               { flash('⚠️ Select a farmer.'); return; }
    if (!sessionBags.length && !sessionBatches.length)  { flash('⚠️ Add at least one bag or batch.'); return; }
    setSaving(true);
    try {
      const base = {
        farmerId: sessionFarmerId, farmerName: sessionFarmerName,
        farmerIdCard: sessionFarmerCard, stationId,
        weighedBy: user?.email || '', weighedAt: nowISO(), weighedDate: today,
      };

      // Build new docs with local IDs
      const newDocs = [
        ...sessionBags.map(({ _id, ...b }) => ({
          id: newDocId(), ...base, ...b, status: 'recently_weighed', notes: '',
        })),
        ...sessionBatches.map(({ _id, ...b }) => ({
          id: newDocId(), ...base, ...b, status: 'in_shed',
        })),
      ];

      // 1. Update forage immediately (shedStock shared key used by Warehouse & Shipment)
      const SHED_KEY  = `shedStock_${stationId}`;
      const raw       = await storageGet(SHED_KEY);
      const existing  = raw ? JSON.parse(raw) : [];
      await storageSet(SHED_KEY, JSON.stringify([...newDocs, ...existing]));

      // 2. Queue Firebase writes
      await Promise.all(newDocs.map(({ id, ...data }) =>
        queueWrite({ type: 'setDoc', col: 'shedStock', id, data })
      ));

      const bc = sessionBags.length, btc = sessionBatches.length;
      const parts = [];
      if (bc)  parts.push(`${bc} bag${bc !== 1 ? 's' : ''}`);
      if (btc) parts.push(`${btc} batch${btc !== 1 ? 'es' : ''}`);
      flash(`✅ ${parts.join(' & ')} saved.`);
      setSessionBags([]); setSessionBatches([]);
      storageSet(`shedSession_${stationId}`, ''); // clear persisted session
    } catch (e) {
      flash('❌ Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const sessionTotalKg = [...sessionBags, ...sessionBatches].reduce((s, x) => s + (x.stationWeight || 0), 0);
  const hasSession     = sessionBags.length > 0 || sessionBatches.length > 0;

  return (
    <section style={{ paddingBottom: 40 }}>
      <h2 className="section-title">⚖️ Weigh Copra</h2>

      {msg && <div className="section-msg">{msg}</div>}

      {/* ── SESSION CARD ──────────────────────────────────────────────── */}
      <div className="weigh-session-card">

        <div className="ws-field">
          <div className="ws-label">Date &amp; Time</div>
          <div className="ws-value-box">{nowDisplay}</div>
        </div>

        <div className="ws-field">
          <div className="ws-label">Farmer</div>
          <select className="ws-select" value={sessionFarmerId} onChange={e => pickFarmer(e.target.value)}>
            <option value="">— Select Farmer —</option>
            {farmers.map(f => <option key={f.id} value={f.id}>{f.name} ({f.farmerId})</option>)}
          </select>
        </div>

        <div className="ws-field">
          <div className="ws-label">Station</div>
          <div className="ws-value-box ws-auto">{userProfile?.stationName || '—'}</div>
        </div>

        <div className="ws-field">
          <div className="ws-label">Inspector</div>
          <div className="ws-value-box ws-auto">{user?.email || '—'}</div>
        </div>

        <div className="ws-details-block">
          {!sessionFarmerId && (
            <div className="ws-no-farmer-hint">👆 Select a farmer above to enable weighing</div>
          )}

          {/* Quality Bags */}
          <div className="ws-sub-section">
            <div className="ws-sub-title">Quality Bags</div>
            <div className="ws-chips-row">
              {sessionBags.length === 0
                ? <span className="ws-chip-empty">No bags weighed yet</span>
                : sessionBags.map((b, i) => (
                  <span key={b._id} className="ws-chip ws-chip-bag"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {b.bagSerial} #{i + 1} &rarr; {b.stationWeight.toFixed(1)} kg
                    <button type="button" onClick={() => removeBag(b._id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: 'inherit', fontSize: '0.8rem', padding: '0 0 0 2px', lineHeight: 1, opacity: 0.7 }}>×</button>
                  </span>
                ))
              }
            </div>
            <button className="ws-weigh-btn ws-btn-bag" type="button"
              disabled={!sessionFarmerId}
              onClick={() => { setBagSuffix(''); setBagWeight(''); setBagIsStation(false); setShowBagModal(true); }}>
              ⚖️ Weigh Quality Bag
            </button>
          </div>

          {/* Unstacked Batches */}
          <div className="ws-sub-section" style={{ marginTop: 16 }}>
            <div className="ws-sub-title">Unstacked Batches</div>
            <div className="ws-chips-row">
              {sessionBatches.length === 0
                ? <span className="ws-chip-empty">No batches recorded yet</span>
                : sessionBatches.map((b, i) => (
                  <span key={b._id} className="ws-chip ws-chip-batch"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Batch {i + 1} &rarr; {b.stationWeight.toFixed(1)} kg
                    <button type="button" onClick={() => removeBatch(b._id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: 'inherit', fontSize: '0.8rem', padding: '0 0 0 2px', lineHeight: 1, opacity: 0.7 }}>×</button>
                  </span>
                ))
              }
            </div>
            <button className="ws-weigh-btn ws-btn-batch" type="button"
              disabled={!sessionFarmerId}
              onClick={() => { setBatchWeight(''); setShowBatchModal(true); }}>
              📦 Weigh Unstacked Batch
            </button>
          </div>
        </div>

        {hasSession && (
          <div className="ws-session-total">
            <span>Session Total Weight</span>
            <span className="ws-total-kg">{sessionTotalKg.toFixed(2)} kg</span>
          </div>
        )}
      </div>

      {/* ── SAVE ENTRY ────────────────────────────────────────────────── */}
      <button type="button" onClick={handleSaveSession}
        disabled={saving || !sessionFarmerId || !hasSession}
        style={{
          width: '100%', marginTop: 20, padding: '16px',
          background: saving || !sessionFarmerId || !hasSession
            ? '#b0bec5' : 'linear-gradient(135deg,#007c91,#339bbf)',
          color: '#fff', border: 'none', borderRadius: 14,
          fontSize: '1.05rem', fontWeight: 800,
          cursor: saving || !sessionFarmerId || !hasSession ? 'not-allowed' : 'pointer',
          boxShadow: saving || !sessionFarmerId || !hasSession
            ? 'none' : '0 4px 14px rgba(0,124,145,0.35)',
          transition: 'all 0.2s',
        }}>
        {saving ? '⏳ Saving…'
          : hasSession
            ? `💾 Save Entry (${sessionBags.length + sessionBatches.length} item${sessionBags.length + sessionBatches.length !== 1 ? 's' : ''})`
            : '💾 Save Entry'}
      </button>

      {/* ── QUALITY BAG MODAL ─────────────────────────────────────────── */}
      {showBagModal && (
        <div className="overlay">
          <div className="overlay-card">
            <h3 style={{ margin: '0 0 18px', color: 'var(--text-primary)' }}>⚖️ Weigh Quality Bag</h3>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="ws-modal-label" style={{ margin: 0 }}>
                {bagIsStation ? 'New Serial #' : 'Bag Serial #'}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6,
                fontSize: '0.82rem', fontWeight: 600,
                color: bagIsStation ? '#e65100' : '#888', cursor: 'pointer' }}>
                <input type="checkbox" checked={bagIsStation}
                  onChange={e => { setBagIsStation(e.target.checked); setBagSuffix(''); }} />
                ♻ Station bag
              </label>
            </div>
            <div style={{ position: 'relative' }}>
              <SerialInput suffix={bagSuffix} onChange={setBagSuffix}
                isStation={bagIsStation}
                prefix={bagIsStation ? `${stationPrefix}-` : 'KI-'} />
              {issuances.length > 0 && !bagSuffix && (
                <button type="button"
                  onClick={() => { setShowBagModal(false); setShowBagPicker(true); }}
                  style={{
                    position: 'absolute', right: 8, top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#007c91', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '4px 10px',
                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                  }}>
                  Pick
                </button>
              )}
            </div>
            {issuances.length > 0 && !bagSuffix && (
              <div style={{ fontSize: '0.74rem', color: '#007c91', marginTop: 4 }}>
                Tap <strong>Pick</strong> to select from {issuances.length} issued bag{issuances.length !== 1 ? 's' : ''}.
              </div>
            )}
            {bagIsStation && (
              <div style={{ fontSize: '0.76rem', color: '#e65100', margin: '6px 0 4px' }}>
                This bag was not issued by HQ — station serial will be assigned.
              </div>
            )}

            <label className="ws-modal-label" style={{ marginTop: 14 }}>Weight (kg)</label>
            <input className="field-input" type="number" step="0.01" min="0.1"
              placeholder="e.g. 87.50" value={bagWeight}
              onChange={e => setBagWeight(e.target.value)} />

            <div className="ws-modal-actions">
              <button className="ws-modal-btn-save" type="button" onClick={handleAddBag}>
                ➕ Add to Session
              </button>
              <button className="ws-modal-btn-cancel" type="button" onClick={() => setShowBagModal(false)}>
                ✖ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BAG PICKER MODAL ─────────────────────────────────────────── */}
      {showBagPicker && (
        <div className="overlay">
          <div className="overlay-card" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  Select Issued Bag
                </div>
                <div style={{ fontSize: '0.77rem', color: '#888', marginTop: 2 }}>
                  Bags issued to {sessionFarmerName}
                </div>
              </div>
              <button className="bag-detail-close" type="button"
                onClick={() => { setShowBagPicker(false); setShowBagModal(true); }}>✕</button>
            </div>
            {issuances.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#888', padding: '20px 0', fontSize: '0.88rem' }}>
                No issued bags found for this farmer.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {issuances.map(bag => {
                  const alreadyAdded = sessionBags.some(b => b.bagSerial === bag.bagSerial);
                  return (
                    <button key={bag.id} type="button"
                      onClick={() => !alreadyAdded && selectBagFromPicker(bag)}
                      disabled={alreadyAdded}
                      style={{
                        background: alreadyAdded ? '#f0f0f0' : '#fff',
                        border: `1.5px solid ${alreadyAdded ? '#ccc' : '#e0eef2'}`,
                        borderRadius: 10, padding: '10px 6px',
                        cursor: alreadyAdded ? 'default' : 'pointer',
                        fontWeight: 700, fontSize: '0.78rem',
                        color: alreadyAdded ? '#aaa' : '#007c91',
                        textAlign: 'center', wordBreak: 'break-all',
                        boxShadow: alreadyAdded ? 'none' : '0 1px 4px rgba(0,0,0,0.07)',
                      }}>
                      {bag.bagSerial}
                      {alreadyAdded && (
                        <div style={{ fontSize: '0.62rem', color: '#aaa', marginTop: 2 }}>added</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <button className="btn-secondary" style={{ marginTop: 14 }} type="button"
              onClick={() => { setShowBagPicker(false); setShowBagModal(true); }}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* ── BATCH MODAL ───────────────────────────────────────────────── */}
      {showBatchModal && (
        <div className="overlay">
          <div className="overlay-card">
            <h3 style={{ margin: '0 0 18px', color: 'var(--text-primary)' }}>📦 Weigh Unstacked Batch</h3>
            <label className="ws-modal-label">Batch Weight (kg)</label>
            <input className="field-input" type="number" step="0.01" min="0.1"
              placeholder="e.g. 320.00" value={batchWeight}
              onChange={e => setBatchWeight(e.target.value)} autoFocus />
            <div className="ws-modal-actions">
              <button className="ws-modal-btn-save" type="button" onClick={handleAddBatch}>
                ➕ Add to Session
              </button>
              <button className="ws-modal-btn-cancel" type="button" onClick={() => setShowBatchModal(false)}>
                ✖ Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
