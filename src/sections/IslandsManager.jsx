// src/sections/IslandsManager.jsx
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppData } from '../context/AppDataContext';

import { KIRIBATI_ISLANDS } from '../utils/constants';

const BLANK = { name: '', region: '', notes: '' };

export default function IslandsManager() {
  const { cprEntries: cprs, villages, cooperatives: coops } = useAppData();
  const [firestoreIslands, setFirestoreIslands] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [modal,            setModal]            = useState(null);   // null | 'add' | island-obj
  const [viewIsland,       setViewIsland]       = useState(null);   // { name, region, notes, id? }
  const [form,             setForm]             = useState(BLANK);
  const [saving,           setSaving]           = useState(false);
  const [msg,              setMsg]              = useState('');
  const [search,           setSearch]           = useState('');
  const [confirmDel,       setConfirmDel]       = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'islands'), s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setFirestoreIslands(docs);
      setLoading(false);

      // Auto-register any hardcoded island not yet in Firestore
      const existingNames = new Set(docs.map(d => d.name));
      const missing = KIRIBATI_ISLANDS.filter(name => !existingNames.has(name));
      missing.forEach(name => {
        addDoc(collection(db, 'islands'), { name, region: '', notes: '', createdAt: new Date().toISOString() });
      });
    });
    return () => u1();
  }, []);

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  // Merge KIRIBATI_ISLANDS with Firestore docs.
  // Every hardcoded island is always shown; Firestore adds extra islands + enriches existing ones.
  const mergedIslands = useMemo(() => {
    const byName = {};
    // Seed with hardcoded list (no Firestore id)
    KIRIBATI_ISLANDS.forEach(name => { byName[name] = { name }; });
    // Layer Firestore docs on top
    firestoreIslands.forEach(il => {
      byName[il.name] = { ...byName[il.name], ...il };
    });
    // Add any Firestore islands not in the hardcoded list
    firestoreIslands.forEach(il => {
      if (!byName[il.name]) byName[il.name] = il;
    });
    return Object.values(byName);
  }, [firestoreIslands]);

  const filtered = useMemo(() => {
    if (!search) return mergedIslands;
    const q = search.toLowerCase();
    return mergedIslands.filter(il =>
      (il.name   || '').toLowerCase().includes(q) ||
      (il.region || '').toLowerCase().includes(q));
  }, [mergedIslands, search]);

  function openAdd()    { setForm(BLANK); setModal('add'); }
  function openEdit(il) {
    setForm({ name: il.name || '', region: il.region || '', notes: il.notes || '' });
    setModal(il.id ? il : 'add-named'); // if no Firestore doc, open add with name pre-filled
    if (!il.id) setForm({ name: il.name, region: il.region || '', notes: il.notes || '' });
  }

  async function handleSave() {
    if (!form.name.trim()) { flash('⚠️ Island name is required.'); return; }
    setSaving(true);
    try {
      if (modal === 'add' || modal === 'add-named') {
        await addDoc(collection(db, 'islands'), { ...form, createdAt: new Date().toISOString() });
        flash('✅ Island added to registry.');
      } else {
        await updateDoc(doc(db, 'islands', modal.id), { ...form, updatedAt: new Date().toISOString() });
        flash('✅ Island updated.');
      }
      setModal(null);
    } catch (e) { flash('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(il) {
    if (!il.id) return; // can't delete a hardcoded-only entry
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'islands', il.id));
      flash(`✅ ${il.name} removed from registry.`);
      setConfirmDel(null);
    } catch (e) { flash('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  const registeredCount = firestoreIslands.length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🏝️ Islands</div>
          <div className="page-subtitle">Registry of all outer islands in operations</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd} type="button">+ Add Island</button>
      </div>

      {msg && (
        <div className={`flash-bar ${msg.startsWith('✅') ? 'flash-success' : msg.startsWith('⚠️') ? 'flash-warn' : 'flash-error'}`}
          style={{ marginBottom: 16 }}>{msg}</div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        {[
          { icon: '🏝️', val: mergedIslands.length, lbl: 'Total Islands',    col: 'var(--teal)'   },
          { icon: '📋', val: cprs.length,           lbl: 'CPRs Filed',       col: 'var(--gold)'   },
          { icon: '🗂️', val: registeredCount,       lbl: 'In Registry',      col: 'var(--purple)' },
        ].map(s => (
          <div key={s.lbl} className="stat-card" style={{ '--accent-color': s.col }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value" style={{ fontSize: '1.8rem' }}>{s.val}</div>
            <div className="stat-label">{s.lbl}</div>
          </div>
        ))}
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="search-bar">
          <input placeholder="Search island name or region…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {filtered.length} of {mergedIslands.length} islands
        </div>
      </div>

      {/* Two-column clickable name list */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
        {filtered.map(il => {
          const hasDoc = !!il.id;
          return (
            <button
              key={il.name}
              type="button"
              onClick={() => setViewIsland(il)}
              style={{
                background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
                padding: '9px 12px', borderRadius: 8,
                color: 'var(--teal-light)',
                fontSize: '0.88rem', fontWeight: 600, transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--purple)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem',
              }}>🏝️</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {il.name}
              </span>
              {il.region && (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic', flexShrink: 0 }}>
                  {il.region}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🏝️</div>
          <div className="empty-state-text">No islands found</div>
        </div>
      )}

      {/* ══ PROFILE VIEW MODAL ══ */}
      {viewIsland && (() => {
        const il = viewIsland;
        const ilCprs = cprs.filter(c => c.island === il.name);
        const totalWeight = (ilCprs.reduce((s, c) => s + (parseFloat(c.total_weight_cpr) || 0), 0) / 1000).toFixed(2);
        const hasDoc = !!il.id;
        return (
          <div className="modal-overlay" onClick={() => setViewIsland(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-head">
                <div className="modal-title">🏝️ Island Profile</div>
                <button className="modal-close" onClick={() => setViewIsland(null)} type="button">✕</button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--purple)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.4rem',
                  }}>🏝️</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{il.name}</div>
                    {il.region
                      ? <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{il.region}</div>
                      : <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                          {hasDoc ? 'No region set' : 'Not yet added to registry'}
                        </div>
                    }
                  </div>
                </div>

                {[
                  ['📋 CPRs Filed',   ilCprs.length],
                  ['🏭 Warehouses',    villages.filter(v => v.island === il.name).length],
                  ['⚖️ Total Weight', `${totalWeight} t`],
                  ['🗺️ Region',       il.region || '—'],
                  ['📝 Notes',        il.notes  || '—'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-dim)', fontSize: '0.83rem', gap: 12 }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                    <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
                  </div>
                ))}

                {!hasDoc && (
                  <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--navy)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    💡 This island is part of the Kiribati island list but hasn't been added to the registry yet. Click <strong style={{ color: 'var(--teal)' }}>Add to Registry</strong> to add region, notes and extra details.
                  </div>
                )}
              </div>
              <div className="modal-foot">
                <button className="btn btn-ghost" onClick={() => setViewIsland(null)} type="button">Close</button>
                {hasDoc ? (
                  <>
                    <button className="btn btn-secondary" onClick={() => { setViewIsland(null); openEdit(il); }} type="button">✏️ Edit</button>
                    <button className="btn btn-danger" onClick={() => { setViewIsland(null); setConfirmDel(il); }} type="button">Remove</button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={() => { setViewIsland(null); openEdit(il); }} type="button">+ Add to Registry</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ ADD / EDIT MODAL ══ */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <div className="modal-title">
                {(modal === 'add' || modal === 'add-named')
                  ? '🏝️ Add Island to Registry'
                  : `Edit Island — ${modal.name}`}
              </div>
              <button className="modal-close" onClick={() => setModal(null)} type="button">✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Island Name *</label>
                <input className="form-input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Tabiteuea"
                  readOnly={modal === 'add-named'}
                  style={modal === 'add-named' ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                  autoFocus={modal === 'add'} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Region</label>
                <select className="form-select" value={form.region}
                  onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  style={!form.region ? { color: 'var(--text-muted)', fontStyle: 'italic' } : {}}>
                  <option value="" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>— Select Region —</option>
                  <option value="Gilbertese Group">Gilbertese Group</option>
                  <option value="Line Islands">Line Islands</option>
                  <option value="Phoenix Islands">Phoenix Islands</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={3} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes…" />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setModal(null)} type="button">Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} type="button">
                {saving ? '…Saving' : (modal === 'add' || modal === 'add-named') ? '✓ Add to Registry' : '✓ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DELETE CONFIRM ══ */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <div className="modal-title">⚠️ Remove Island</div>
              <button className="modal-close" onClick={() => setConfirmDel(null)} type="button">✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Are you sure you want to remove <strong style={{ color: 'var(--text-primary)' }}>{confirmDel.name}</strong> from the registry?
                The island will still appear in the list — only its saved details will be removed.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)} type="button">Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDel)} disabled={saving} type="button">
                {saving ? '…Removing' : 'Remove from Registry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
