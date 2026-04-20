// src/sections/ToolsSection.jsx
import { useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { storageGet } from '../utils/storage';

const isCapacitorNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform();
const isElectron        = typeof window !== 'undefined' && !!window.electronAPI;

async function shareOrDownload(jsonStr, filename) {
  if (isElectron) {
    const r = await window.electronAPI.backupData(jsonStr);
    return r.success ? `Saved to: ${r.filePath}` : null;
  }
  if (isCapacitorNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    await Filesystem.writeFile({ path: filename, data: jsonStr, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
    await Share.share({ title: 'KCDL Copra Report', url: uri });
    return 'Shared successfully.';
  }
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return 'Downloaded.';
}

export default function ToolsSection({ user }) {
  const [msg, setMsg]   = useState('');
  const [busy, setBusy] = useState(false);

  const stationId = user?.stationId || user?.uid;
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 5000); };

  async function exportDayReport() {
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [issSnap, shedSnap, shipSnap] = await Promise.all([
        getDocs(query(collection(db,'bagIssuances'), where('stationId','==',stationId), where('issuedDate','==',today))),
        getDocs(query(collection(db,'shedStock'),    where('stationId','==',stationId), where('weighedDate','==',today))),
        getDocs(query(collection(db,'shipments'),    where('stationId','==',stationId), where('shipDate','==',today))),
      ]);
      const cprRaw = await storageGet('cprEntries');
      const twcRaw = await storageGet('twcEntries');
      const cpr = cprRaw ? JSON.parse(cprRaw).filter(e => e.date === today) : [];
      const twc = twcRaw ? JSON.parse(twcRaw).filter(e => e.date === today) : [];

      const report = {
        exportedAt: new Date().toISOString(), stationId, date: today,
        bagsIssued:  issSnap.docs.map(d => d.data()),
        shedStock:   shedSnap.docs.map(d => d.data()),
        shipments:   shipSnap.docs.map(d => d.data()),
        cprEntries:  cpr.map(e => ({ ...e, cpr_image_base64: e.cpr_image_base64 ? '[image]' : null })),
        twcEntries:  twc.map(e => ({ ...e, twc_image_base64: e.twc_image_base64 ? '[image]' : null })),
      };

      const result = await shareOrDownload(
        JSON.stringify(report, null, 2),
        `copra-report-${today}.json`
      );
      if (result) flash('✅ ' + result);
    } catch (e) { flash('❌ ' + e.message); }
    finally { setBusy(false); }
  }

  async function exportAllData() {
    setBusy(true);
    try {
      const [issSnap, shedSnap, shipSnap, farmSnap] = await Promise.all([
        getDocs(query(collection(db,'bagIssuances'), where('stationId','==',stationId))),
        getDocs(query(collection(db,'shedStock'),    where('stationId','==',stationId))),
        getDocs(query(collection(db,'shipments'),    where('stationId','==',stationId))),
        getDocs(query(collection(db,'farmers'),      where('stationId','==',stationId))),
      ]);
      const cprRaw = await storageGet('cprEntries');
      const twcRaw = await storageGet('twcEntries');

      const backup = {
        exportedAt: new Date().toISOString(), stationId,
        farmers:     farmSnap.docs.map(d => d.data()),
        bagsIssued:  issSnap.docs.map(d => d.data()),
        shedStock:   shedSnap.docs.map(d => d.data()),
        shipments:   shipSnap.docs.map(d => d.data()),
        cprEntries:  cprRaw ? JSON.parse(cprRaw).map(e => ({ ...e, cpr_image_base64: '[image]' })) : [],
        twcEntries:  twcRaw ? JSON.parse(twcRaw).map(e => ({ ...e, twc_image_base64: '[image]' })) : [],
      };

      const result = await shareOrDownload(
        JSON.stringify(backup, null, 2),
        `copra-backup-${new Date().toISOString().slice(0,10)}.json`
      );
      if (result) flash('✅ ' + result);
    } catch (e) { flash('❌ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <h2 className="section-title">🔧 Tools</h2>

      <div className="info-card">
        <div className="info-card-icon">☁️</div>
        <div>
          <div className="info-card-title">Auto-Sync Active</div>
          <div className="info-card-body">
            All data is automatically saved and synced to Firebase. When offline, data is saved locally
            and synced to the office as soon as you reconnect.
          </div>
        </div>
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      <div className="tools-buttons">
        <button className="tools-button" onClick={exportDayReport} disabled={busy} type="button">
          📤 Export Today's Report
        </button>
        <button className="tools-button" onClick={exportAllData} disabled={busy} type="button">
          💾 Export All Station Data
        </button>
      </div>
    </section>
  );
}
