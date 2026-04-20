// src/sections/BagsIssuedSection.jsx
import { useState, useEffect } from 'react';
import {
  collection, addDoc, onSnapshot, query,
  where, orderBy, doc, updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { storageGet, storageSet } from '../utils/storage';
import { newDocId, queueWrite } from '../utils/syncManager';

const EMPTY = { bagSerial: '', farmerId: '', farmerName: '', farmerIdCard: '', notes: '' };

export default function BagsIssuedSection({ user, onNavigate }) {
  const [issuances, setIssuances] = useState([]);
  const [farmers, setFarmers]     = useState([]);
  const [form, setForm]           = useState(EMPTY);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [msg, setMsg]             = useState('');
  const [loading, setLoading]     = useState(true);

  const stationId = user?.stationId || user?.uid;
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!stationId) return;
    const KEY = `bagIssuances_${stationId}`;
    // Hydrate immediately from device storage for instant display
    storageGet(KEY).then(v => {
      if (v) try { setIssuances(JSON.parse(v)); setLoading(false); } catch {}
    });
    // Load issuances
    const q1 = query(
      collection(db, 'bagIssuances'),
      where('stationId', '==', stationId),
      orderBy('issuedAt', 'desc')
    );
    const u1 = onSnapshot(q1, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setIssuances(data);
      setLoading(false);
      storageSet(KEY, JSON.stringify(data));
    });
    // Load farmers for dropdown
    const q2 = query(collection(db, 'farmers'), where('stationId', '==', stationId), orderBy('name'));
    const u2 = onSnapshot(q2, snap => setFarmers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); };
  }, [stationId]);

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000); }

  function selectFarmer(farmerId) {
    const f = farmers.find(x => x.id === farmerId);
    if (!f) { setForm(x => ({ ...x, farmerId: '', farmerName: '', farmerIdCard: '' })); return; }
    setForm(x => ({ ...x, farmerId: f.id, farmerName: f.name, farmerIdCard: f.idCard }));
  }

  async function handleIssue() {
    if (!form.bagSerial.trim()) { flash('⚠️ Bag serial number is required.'); return; }
    if (!form.farmerId)         { flash('⚠️ Select a farmer.'); return; }

    const active = issuances.find(
      i => i.bagSerial.toUpperCase() === form.bagSerial.trim().toUpperCase() && i.status === 'issued'
    );
    if (active) { flash(`⚠️ Bag ${form.bagSerial} is already issued to ${active.farmerName}.`); return; }

    setSaving(true);
    try {
      const id  = newDocId();
      const now = new Date().toISOString();
      const newDoc = {
        id, bagSerial: form.bagSerial.trim().toUpperCase(),
        farmerId: form.farmerId, farmerName: form.farmerName,
        farmerIdCard: form.farmerIdCard, stationId,
        issuedBy: user?.email || '', issuedAt: now,
        issuedDate: today, status: 'issued', notes: form.notes.trim(),
      };

      // 1. Update forage + UI immediately
      const KEY     = `bagIssuances_${stationId}`;
      const newList = [newDoc, ...issuances];
      await storageSet(KEY, JSON.stringify(newList));
      setIssuances(newList);

      // 2. Queue Firebase write
      const { id: _id, ...data } = newDoc;
      await queueWrite({ type: 'setDoc', col: 'bagIssuances', id, data });

      flash(`✅ Bag ${newDoc.bagSerial} issued to ${form.farmerName}.`);
      setForm(EMPTY);
      setShowForm(false);
    } catch (e) {
      flash('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function markReturned(issuance) {
    if (!window.confirm(`Mark bag ${issuance.bagSerial} as returned by ${issuance.farmerName}?`)) return;
    try {
      const patch = { status: 'returned', returnedAt: new Date().toISOString() };

      // 1. Update forage + UI immediately
      const KEY     = `bagIssuances_${stationId}`;
      const newList = issuances.map(i => i.id === issuance.id ? { ...i, ...patch } : i);
      await storageSet(KEY, JSON.stringify(newList));
      setIssuances(newList);

      // 2. Queue Firebase write
      await queueWrite({ type: 'updateDoc', col: 'bagIssuances', id: issuance.id, data: patch });

      flash(`✅ Bag ${issuance.bagSerial} marked as returned.`);
    } catch (e) {
      flash('❌ ' + e.message);
    }
  }

  const filtered = issuances.filter(i =>
    i.bagSerial.toLowerCase().includes(search.toLowerCase()) ||
    i.farmerName.toLowerCase().includes(search.toLowerCase()) ||
    (i.farmerIdCard || '').toLowerCase().includes(search.toLowerCase())
  );

  const todayCount    = issuances.filter(i => i.issuedDate === today).length;
  const activeCount   = issuances.filter(i => i.status === 'issued').length;

  const statusColor = s => s === 'issued' ? '#007c91' : s === 'returned' ? '#2e7d32' : '#888';
  const statusLabel = s => s === 'issued' ? '📤 Issued' : s === 'returned' ? '✅ Returned' : s;

  return (
    <section>
      <h2 className="section-title">📤 Bags Issued</h2>

      {/* Stats */}
      <div className="summary-grid">
        <div className="summary-card-stat" style={{ background: 'linear-gradient(135deg,#007c91,#339bbf)' }}>
          <div className="sc-value">{todayCount}</div>
          <div className="sc-label">Issued Today</div>
        </div>
        <div className="summary-card-stat" style={{ background: 'linear-gradient(135deg,#e65100,#ff8f00)' }}>
          <div className="sc-value">{activeCount}</div>
          <div className="sc-label">With Farmers</div>
        </div>
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      {/* Search + Issue */}
      <div className="row-between" style={{ marginBottom: 14 }}>
        <input type="search" placeholder="Search bag, farmer..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, marginBottom: 0, marginRight: 10 }} />
        <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }}
          onClick={() => { setForm(EMPTY); setShowForm(true); }} type="button">
          + Issue
        </button>
      </div>

      {/* List */}
      {loading ? <div className="empty-state">Loading...</div>
        : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📤</div>
            <div>{search ? 'No results.' : 'No bags issued yet.'}</div>
          </div>
        ) : filtered.map(i => (
          <div key={i.id} className="list-card">
            <div className="list-card-header">
              <span className="list-card-title">🏷️ {i.bagSerial}</span>
              <span className="badge" style={{ background: statusColor(i.status) }}>{statusLabel(i.status)}</span>
            </div>
            <div className="list-card-meta">
              👩‍🌾 {i.farmerName} · 🪪 {i.farmerIdCard}
            </div>
            <div className="list-card-meta">
              📅 {i.issuedDate} · {i.issuedBy}
            </div>
            {i.notes ? <div className="list-card-meta">📝 {i.notes}</div> : null}
            {i.status === 'issued' && (
              <div className="list-card-actions">
                <button className="btn-edit" onClick={() => markReturned(i)} type="button">Mark Returned</button>
              </div>
            )}
          </div>
        ))
      }

      {/* Issue form overlay */}
      {showForm && (
        <div className="overlay">
          <div className="overlay-card">
            <h3>📤 Issue Bag to Farmer</h3>
            <label>Bag Serial Number *</label>
            <input type="text" value={form.bagSerial}
              onChange={e => setForm(f => ({ ...f, bagSerial: e.target.value }))}
              placeholder="e.g. KCDL-0047" autoCapitalize="characters" />
            <label>Farmer *</label>
            <select value={form.farmerId} onChange={e => selectFarmer(e.target.value)}>
              <option value="">-- Select Farmer --</option>
              {farmers.map(f => (
                <option key={f.id} value={f.id}>{f.name} ({f.farmerId})</option>
              ))}
            </select>
            {form.farmerIdCard && (
              <p style={{ margin: '-10px 0 14px', fontSize: '0.82rem', color: '#888' }}>
                🪪 ID: {form.farmerIdCard}
              </p>
            )}
            <label>Notes (optional)</label>
            <input type="text" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Replacement bag" />
            <div className="overlay-actions">
              <button className="btn-primary" onClick={handleIssue} disabled={saving} type="button">
                {saving ? 'Saving...' : 'Confirm Issue'}
              </button>
              <button className="btn-primary" style={{ background: '#888', marginTop: 8 }}
                onClick={() => setShowForm(false)} type="button">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
