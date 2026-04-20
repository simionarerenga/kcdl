// src/sections/TWCSection.jsx
import { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import Modal from '../components/Modal';
import { captureImage } from '../utils/camera';
import { storageGet, storageSet } from '../utils/storage';
import { newDocId, queueWrite } from '../utils/syncManager';

const KEY = 'twcEntries';

const blank = (name = '', island = '') => ({
  island, cooperative_name: '', copra_inspector_name: name, vessel_name: '',
  date: new Date().toISOString().slice(0, 10),
  start_time: '', twc_number: '', number_of_sacks: '', total_weight_twc: '', comments: '', end_time: '',
});

const fmt12 = t => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const canEdit = (date, end) => {
  if (!date || !end) return false;
  const [h, m] = end.split(':').map(Number);
  const d = new Date(date); d.setHours(h, m, 0, 0);
  return Date.now() < d.getTime() + 20 * 60 * 1000;
};

export default function TWCSection({ user, userProfile }) {
  const [tab, setTab]             = useState('form');
  const [entries, setEntries]     = useState([]);
  const [form, setForm]           = useState(blank());
  const [editId, setEditId]       = useState(null);
  const [image, setImage]         = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [modal, setModal]         = useState(null);
  const [errors, setErrors]       = useState({});
  const [msg, setMsg]             = useState('');
  const [saving, setSaving]       = useState(false);

  const stationId = user?.stationId || user?.uid;

  useEffect(() => {
    storageGet(KEY).then(v => { if (v) try { setEntries(JSON.parse(v)); } catch {} });
  }, []);

  useEffect(() => {
    if (userProfile && !editId) {
      setForm(f => ({
        ...f,
        copra_inspector_name: f.copra_inspector_name || userProfile.email || '',
        island: f.island || userProfile.island || '',
      }));
    }
  }, [userProfile]);

  const persist = useCallback(async updated => {
    setEntries(updated);
    await storageSet(KEY, JSON.stringify(updated));
  }, []);

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  function validate() {
    const e = {};
    if (!form.island.trim())               e.island = 'Required';
    if (!form.cooperative_name.trim())     e.cooperative_name = 'Required';
    if (!form.copra_inspector_name.trim()) e.copra_inspector_name = 'Required';
    if (!form.vessel_name.trim())          e.vessel_name = 'Required';
    if (!form.date)                        e.date = 'Required';
    if (!form.start_time)                  e.start_time = 'Required';
    if (!form.twc_number.trim())           e.twc_number = 'Required';
    if (!form.number_of_sacks)             e.number_of_sacks = 'Required';
    if (!form.total_weight_twc)            e.total_weight_twc = 'Required';
    if (!form.end_time)                    e.end_time = 'Required';
    if (!editId && !image)                 e.image = 'TWC photo is required';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const textData = {
        island: form.island.trim(), cooperative_name: form.cooperative_name.trim(),
        copra_inspector_name: form.copra_inspector_name.trim(),
        vessel_name: form.vessel_name.trim(), date: form.date,
        start_time: form.start_time, twc_number: form.twc_number.trim(),
        number_of_sacks: form.number_of_sacks, total_weight_twc: form.total_weight_twc,
        comments: form.comments.trim(), end_time: form.end_time,
        stationId, inspectorEmail: user?.email || '',
        savedAt: new Date().toISOString(), hasImage: true,
      };

      if (editId) {
        // ── Edit existing entry ──────────────────────────────────────────
        const existing = entries.find(e => e.localId === editId);
        const localId  = existing.localId;
        const fsId     = existing.firestoreId || newDocId();
        const updated  = {
          ...existing, ...form,
          twc_image_base64: image || existing.twc_image_base64,
          firestoreId: fsId,
          updatedAt: new Date().toISOString(),
        };
        // 1. Persist to forage immediately
        await persist(entries.map(e => e.localId === editId ? updated : e));
        // 2. Queue Firebase write
        await queueWrite({ type: 'setDoc', col: 'twcEntries', id: fsId,
          data: { ...textData, localId }, opts: { merge: true } });
        flash('✅ TWC entry updated.');
      } else {
        // ── New entry ────────────────────────────────────────────────────
        const localId = Date.now().toString();
        const fsId    = newDocId();
        // 1. Persist to forage immediately
        await persist([...entries, {
          ...form, twc_image_base64: image,
          localId, firestoreId: fsId, savedAt: new Date().toISOString(),
        }]);
        // 2. Queue Firebase write
        await queueWrite({ type: 'setDoc', col: 'twcEntries', id: fsId,
          data: { ...textData, localId } });
        flash('✅ Saved locally — will sync when online.');
      }
      reset(); setTab('journal');
    } catch (e) { flash('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  function reset() {
    setForm(blank(userProfile?.email || '', userProfile?.island || ''));
    setImage(null); setEditId(null); setErrors({});
  }

  function openEdit(en) {
    setForm({ island: en.island||'', cooperative_name: en.cooperative_name||'',
      copra_inspector_name: en.copra_inspector_name||'', vessel_name: en.vessel_name||'',
      date: en.date||'', start_time: en.start_time||'', twc_number: en.twc_number||'',
      number_of_sacks: en.number_of_sacks||'', total_weight_twc: en.total_weight_twc||'',
      comments: en.comments||'', end_time: en.end_time||'' });
    setImage(en.twc_image_base64 || null);
    setEditId(en.localId); setTab('form');
  }

  async function handleDelete(en) {
    if (!window.confirm('Delete this TWC entry?')) return;
    await persist(entries.filter(e => e.localId !== en.localId));
    flash('🗑️ Entry deleted.');
  }

  async function handleCapture() {
    setCapturing(true);
    try { setImage(await captureImage()); }
    catch (err) { if (err.message !== 'Cancelled') flash('Camera error: ' + err.message); }
    finally { setCapturing(false); }
  }

  const F = (key, label, type = 'text', extra = {}) => (
    <div key={key}>
      <label className="field-label">{label}</label>
      <input className={`field-input${errors[key] ? ' field-input-err' : ''}`}
        type={type} value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} {...extra} />
      {errors[key] && <p className="field-error">{errors[key]}</p>}
    </div>
  );

  return (
    <section>
      <div className="tab-bar">
        <button className={`tab-btn${tab === 'form' ? ' active' : ''}`}
          onClick={() => { reset(); setTab('form'); }} type="button">⚖️ TWC Form</button>
        <button className={`tab-btn${tab === 'journal' ? ' active' : ''}`}
          onClick={() => setTab('journal')} type="button">
          Journal {entries.length > 0 && <span className="tab-badge">{entries.length}</span>}
        </button>
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      {tab === 'form' && (
        <div className="form-body">
          {F('island', 'Island')}
          {F('cooperative_name', 'Cooperative Name')}
          {F('copra_inspector_name', 'Inspector Name')}
          {F('vessel_name', 'Vessel Name')}
          {F('date', 'Date', 'date')}
          <div className="grid-2">
            {F('start_time', 'Start Time', 'time')}
            {F('end_time', 'End Time', 'time')}
          </div>
          {F('twc_number', 'TWC Number')}
          <div className="grid-2">
            <div>
              <label className="field-label">No. of Sacks <span className="req">*</span></label>
              <input className={`field-input${errors.number_of_sacks ? ' field-input-err' : ''}`}
                type="number" min="0" step="1" value={form.number_of_sacks}
                onChange={e => setForm(f => ({ ...f, number_of_sacks: e.target.value }))} />
              {errors.number_of_sacks && <p className="field-error">{errors.number_of_sacks}</p>}
            </div>
            <div>
              <label className="field-label">Total Weight (kg) <span className="req">*</span></label>
              <input className={`field-input${errors.total_weight_twc ? ' field-input-err' : ''}`}
                type="number" step="0.01" min="0" value={form.total_weight_twc} placeholder="0.00"
                onChange={e => setForm(f => ({ ...f, total_weight_twc: e.target.value }))} />
              {errors.total_weight_twc && <p className="field-error">{errors.total_weight_twc}</p>}
            </div>
          </div>

          <label className="field-label">TWC Photo {!editId && <span className="req">*</span>}</label>
          <div className="photo-row">
            <button className={`btn-photo${image ? ' captured' : ''}`}
              onClick={handleCapture} disabled={capturing} type="button">
              {capturing ? 'Opening…' : image ? '📷 Retake' : '📷 Take Photo'}
            </button>
            {image && <img src={image} alt="TWC" className="photo-thumb"
              onClick={() => setModal({ type: 'image', src: image })} />}
          </div>
          {errors.image && <p className="field-error">{errors.image}</p>}

          <label className="field-label">Comments</label>
          <textarea className="field-textarea" rows={3} value={form.comments}
            placeholder="Issues, observations, notes…"
            onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} />

          <button className="btn-primary" onClick={handleSave} disabled={saving} type="button">
            {saving ? 'Saving…' : editId ? 'Update TWC Entry' : 'Save TWC Entry'}
          </button>
          {editId && (
            <button className="btn-secondary" onClick={() => { reset(); setTab('journal'); }} type="button">
              Cancel Edit
            </button>
          )}
        </div>
      )}

      {tab === 'journal' && (
        <div>
          {entries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⚖️</div>
              <div>No TWC entries yet.</div>
            </div>
          ) : [...entries].reverse().map(en => (
            <div key={en.localId} className="list-card">
              <div className="list-card-header">
                <span className="list-card-title">TWC #{en.twc_number}</span>
                <span className={`badge ${en.firestoreId ? 'badge-synced' : 'badge-pending'}`}>
                  {en.firestoreId ? '☁ Synced' : '⏳ Pending'}
                </span>
              </div>
              <div className="list-card-meta">🚢 {en.vessel_name}</div>
              <div className="list-card-meta">📍 {en.island} · {en.cooperative_name}</div>
              <div className="list-card-meta">📅 {en.date} · {fmt12(en.start_time)} – {fmt12(en.end_time)}</div>
              <div className="list-card-meta">
                {en.number_of_sacks && `📦 ${en.number_of_sacks} sacks`}
                {en.total_weight_twc && ` · ⚖️ ${en.total_weight_twc} kg`}
              </div>
              {en.comments && (
                <div className="list-card-meta tap-expand"
                  onClick={() => setModal({ type: 'comment', text: en.comments })}>
                  💬 {en.comments.slice(0, 60)}{en.comments.length > 60 ? '…' : ''}
                </div>
              )}
              <div className="list-card-row">
                {en.twc_image_base64 && (
                  <img src={en.twc_image_base64} alt="TWC" className="photo-thumb-sm"
                    onClick={() => setModal({ type: 'image', src: en.twc_image_base64 })} />
                )}
                {canEdit(en.date, en.end_time) && (
                  <div className="list-card-actions">
                    <button className="btn-edit" onClick={() => openEdit(en)} type="button">Edit</button>
                    <button className="btn-remove" onClick={() => handleDelete(en)} type="button">Delete</button>
                  </div>
                )}
                {!canEdit(en.date, en.end_time) && <span className="locked-label">🔒 Locked</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <Modal type={modal.type} src={modal.src} text={modal.text} onClose={() => setModal(null)} />}
    </section>
  );
}
