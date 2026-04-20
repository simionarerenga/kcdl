// src/sections/QualityBagsSection.jsx
import { useState, useEffect } from 'react';
import {
  doc, onSnapshot, setDoc, collection, addDoc,
  query, where, orderBy, increment
} from 'firebase/firestore';
import { db } from '../firebase';
import { storageGet, storageSet } from '../utils/storage';
import { newDocId, queueWrite, inc } from '../utils/syncManager';

export default function QualityBagsSection({ user }) {
  const [balance, setBalance]     = useState(0);
  const [txns, setTxns]           = useState([]);
  const [mode, setMode]           = useState(null); // 'receive' | 'distribute'
  const [qty, setQty]             = useState('');
  const [note, setNote]           = useState('');
  const [msg, setMsg]             = useState('');
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [storageReady, setStorageReady] = useState(false);

  const stationId = user?.stationId || user?.uid;
  const stockRef  = doc(db, 'bagStock', stationId);

  // Hydrate from device storage on mount for instant display
  useEffect(() => {
    if (!stationId) return;
    storageGet(`qbags_${stationId}`).then(v => {
      if (v) try {
        const d = JSON.parse(v);
        if (d.balance !== undefined) setBalance(d.balance);
        if (d.txns?.length) { setTxns(d.txns); setLoading(false); }
      } catch {}
      setStorageReady(true);
    });
  }, [stationId]);

  // Persist combined balance + txns whenever either changes (after Firestore delivers fresh data)
  useEffect(() => {
    if (!stationId || !storageReady || loading) return;
    storageSet(`qbags_${stationId}`, JSON.stringify({ balance, txns }));
  }, [stationId, storageReady, balance, txns, loading]);

  // Live balance
  useEffect(() => {
    if (!stationId) return;
    const unsub = onSnapshot(stockRef, snap => {
      setBalance(snap.exists() ? (snap.data().balance || 0) : 0);
      setLoading(false);
    });
    return unsub;
  }, [stationId]);

  // Recent transactions
  useEffect(() => {
    if (!stationId) return;
    const q = query(
      collection(db, 'bagTransactions'),
      where('stationId', '==', stationId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => setTxns(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [stationId]);

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  async function handleSubmit() {
    const amount = parseInt(qty, 10);
    if (!amount || amount <= 0) { flash('⚠️ Enter a valid quantity.'); return; }
    if (mode === 'distribute' && amount > balance) { flash('⚠️ Not enough bags in stock.'); return; }

    setSaving(true);
    try {
      const delta      = mode === 'receive' ? amount : -amount;
      const newBalance = balance + delta;
      const txnId      = newDocId();
      const now        = new Date().toISOString();
      const noteText   = note.trim() || (mode === 'receive' ? 'Received from Tarawa HQ' : 'Distributed to farmer');
      const newTxn = {
        id: txnId, stationId, type: mode, qty: amount, note: noteText,
        recordedBy: user?.email || '', createdAt: now,
        date: new Date().toLocaleDateString('en-GB'),
      };

      // 1. Update forage immediately — UI reflects change before any network call
      const newTxns = [newTxn, ...txns];
      await storageSet(`qbags_${stationId}`, JSON.stringify({ balance: newBalance, txns: newTxns }));
      setBalance(newBalance);
      setTxns(newTxns);

      // 2. Queue Firebase writes — synced when online
      await queueWrite({
        type: 'setDoc', col: 'bagStock', id: stationId,
        data: { balance: inc(delta), stationId, updatedAt: now }, opts: { merge: true },
      });
      await queueWrite({
        type: 'setDoc', col: 'bagTransactions', id: txnId,
        data: { stationId, type: mode, qty: amount, note: noteText,
                recordedBy: user?.email || '', createdAt: now, date: newTxn.date },
      });

      flash(mode === 'receive'
        ? `✅ ${amount} bags received. Balance updated.`
        : `✅ ${amount} bags distributed. Balance updated.`);
      setQty(''); setNote(''); setMode(null);
    } catch (e) {
      flash('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="empty-state">Loading…</div>;

  const lowStock = balance <= 10;

  return (
    <section>
      <h2 className="section-title">🛍️ Quality Bags</h2>

      {/* Stock balance */}
      <div className={`bags-balance-card${lowStock ? ' bags-low' : ''}`}>
        <div className="bags-balance-label">Current Stock</div>
        <div className="bags-balance-number">{balance}</div>
        <div className="bags-balance-unit">bags available</div>
        {lowStock && <div className="bags-low-note">⚠️ Low stock — request resupply from Tarawa</div>}
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      {/* Action buttons */}
      {!mode && (
        <div className="bags-actions">
          <button className="bags-btn bags-btn-receive" onClick={() => setMode('receive')} type="button">
            📥 Receive from HQ
          </button>
          <button className="bags-btn bags-btn-distribute"
            onClick={() => setMode('distribute')} disabled={balance === 0} type="button">
            📤 Distribute to Farmer
          </button>
        </div>
      )}

      {/* Inline form */}
      {mode && (
        <div className="bags-form">
          <h3 className="bags-form-title">
            {mode === 'receive' ? '📥 Receive Bags from HQ' : '📤 Distribute to Farmer'}
          </h3>
          <label className="field-label">Quantity of Bags</label>
          <input className="field-input" type="number" min="1"
            placeholder="Enter number of bags" value={qty}
            onChange={e => setQty(e.target.value)} />
          <label className="field-label">
            {mode === 'receive' ? 'Batch / Reference No. (optional)' : 'Farmer Name (optional)'}
          </label>
          <input className="field-input" type="text"
            placeholder={mode === 'receive' ? 'e.g. TRW-2026-001' : 'e.g. Teakai Teniwa'}
            value={note} onChange={e => setNote(e.target.value)} />
          <div className="bags-form-buttons">
            <button className="btn-primary" onClick={handleSubmit} disabled={saving} type="button">
              {saving ? 'Saving…' : 'Confirm'}
            </button>
            <button className="btn-secondary"
              onClick={() => { setMode(null); setQty(''); setNote(''); }} type="button">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Transaction history */}
      {txns.length > 0 && (
        <div className="bags-history">
          <h3 className="bags-history-title">Recent Transactions</h3>
          {txns.slice(0, 15).map(tx => (
            <div key={tx.id} className={`bags-tx ${tx.type === 'receive' ? 'bags-tx-in' : 'bags-tx-out'}`}>
              <span className="bags-tx-icon">{tx.type === 'receive' ? '📥' : '📤'}</span>
              <div className="bags-tx-info">
                <span className="bags-tx-note">{tx.note}</span>
                <span className="bags-tx-date">{tx.date}</span>
              </div>
              <span className={`bags-tx-qty ${tx.type === 'receive' ? 'bags-tx-qty-in' : 'bags-tx-qty-out'}`}>
                {tx.type === 'receive' ? '+' : '-'}{tx.qty}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
