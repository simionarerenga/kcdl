// src/utils/syncManager.js
// ─────────────────────────────────────────────────────────────────────────────
// Offline-first write queue.
//
// All Firebase writes are:
//   1. Applied to device forage immediately (instant UI update, works offline)
//   2. Queued in forage as pending Firebase ops
//   3. Flushed to Firebase automatically when the device comes online
//
// Usage:
//   import { newDocId, queueWrite, startSyncManager } from '../utils/syncManager';
//
//   const id = newDocId();                 // Firestore-compatible ID, no network
//   await queueWrite({ type:'setDoc', col:'farmers', id, data });
//   startSyncManager(db);                 // call once in App.jsx useEffect
//
// Increment helper (Firestore's increment() can't be JSON-serialised):
//   import { inc } from '../utils/syncManager';
//   await queueWrite({ ..., data: { balance: inc(-1) } });   // stored as { __inc: -1 }
//   → restored to increment(-1) when the op is flushed to Firebase
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from './storage';

const QUEUE_KEY = 'offlineWriteQueue';

// ── ID generation ────────────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Generate a Firestore-compatible 20-char ID without any network access. */
export function newDocId() {
  let id = '';
  for (let i = 0; i < 20; i++) id += CHARS[Math.floor(Math.random() * 62)];
  return id;
}

// ── Increment placeholder ────────────────────────────────────────────────────
/** Encode a Firestore atomic increment so it survives JSON serialisation. */
export function inc(delta) { return { __inc: delta }; }

// ── Queue management ─────────────────────────────────────────────────────────
/** Append one operation to the offline write queue. */
export async function queueWrite(op) {
  const raw   = await storageGet(QUEUE_KEY);
  const queue = raw ? JSON.parse(raw) : [];
  queue.push({
    ...op,
    _qid: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  });
  await storageSet(QUEUE_KEY, JSON.stringify(queue));
}

/** How many writes are waiting to be flushed (useful for a sync badge). */
export async function getPendingCount() {
  const raw = await storageGet(QUEUE_KEY);
  return raw ? JSON.parse(raw).length : 0;
}

// ── Queue processing ─────────────────────────────────────────────────────────
/**
 * Flush all queued operations to Firebase.
 * Failed ops remain in the queue and will be retried on the next flush.
 * Returns { flushed, failed }.
 */
export async function flushQueue(db) {
  const raw = await storageGet(QUEUE_KEY);
  if (!raw) return { flushed: 0, failed: 0 };
  const queue = JSON.parse(raw);
  if (!queue.length) return { flushed: 0, failed: 0 };

  const fs = await import('firebase/firestore');
  const failed  = [];
  let   flushed = 0;

  for (const op of queue) {
    try {
      await runOp(op, db, fs);
      flushed++;
    } catch (e) {
      console.warn('[SyncManager] op failed, will retry:', op._qid, e.message);
      failed.push({ ...op, _lastErr: e.message });
    }
  }

  await storageSet(QUEUE_KEY, JSON.stringify(failed));
  return { flushed, failed: failed.length };
}

async function runOp(op, db, { doc, setDoc, updateDoc, writeBatch, increment }) {
  const resolve = d => rehydrate(d, increment);

  switch (op.type) {
    case 'setDoc':
      await setDoc(doc(db, op.col, op.id), resolve(op.data), op.opts || {});
      break;
    case 'updateDoc':
      await updateDoc(doc(db, op.col, op.id), resolve(op.data));
      break;
    case 'batch': {
      const batch = writeBatch(db);
      for (const bop of op.ops) {
        const ref = doc(db, bop.col, bop.id);
        if (bop.type === 'set')    batch.set(ref, resolve(bop.data), bop.opts || {});
        if (bop.type === 'update') batch.update(ref, resolve(bop.data));
      }
      await batch.commit();
      break;
    }
    default:
      throw new Error(`[SyncManager] Unknown op type: "${op.type}"`);
  }
}

/** Restore inc() placeholders to real Firestore increment() calls. */
function rehydrate(data, increment) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && '__inc' in v) {
      out[k] = increment(v.__inc);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = rehydrate(v, increment);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
/**
 * Start the sync manager.
 * - Flushes the queue immediately if the device is online.
 * - Re-flushes every time the device comes back online.
 * Returns a cleanup function (call on unmount / for tests).
 */
export function startSyncManager(db) {
  const flush = () => {
    flushQueue(db)
      .then(({ flushed, failed }) => {
        if (flushed > 0 || failed > 0)
          console.log(`[SyncManager] flushed=${flushed} failed=${failed}`);
      })
      .catch(console.error);
  };

  if (typeof navigator !== 'undefined' && navigator.onLine) flush();
  window.addEventListener('online', flush);
  return () => window.removeEventListener('online', flush);
}
