// src/sections/DailySummarySection.jsx
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

const Stat = ({ value, label, color }) => (
  <div style={{
    background: color, borderRadius: 12, padding: '8px 14px', color: '#fff',
    display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  }}>
    <span style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1 }}>{value}</span>
    <span style={{ fontSize: '0.72rem', opacity: 0.9, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
  </div>
);

export default function DailySummarySection({ user }) {
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [issued,  setIssued]  = useState([]);
  const [shed,    setShed]    = useState([]);
  const [shipped, setShipped] = useState([]);

  const stationId = user?.stationId || user?.uid;

  useEffect(() => {
    if (!stationId) return;
    const u1 = onSnapshot(
      query(collection(db, 'bagIssuances'), where('stationId', '==', stationId), where('issuedDate', '==', date)),
      snap => setIssued(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const u2 = onSnapshot(
      query(collection(db, 'shedStock'), where('stationId', '==', stationId), where('weighedDate', '==', date)),
      snap => setShed(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const u3 = onSnapshot(
      query(collection(db, 'shipments'), where('stationId', '==', stationId), where('shipDate', '==', date)),
      snap => setShipped(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { u1(); u2(); u3(); };
  }, [stationId, date]);

  const qualityBags     = shed.filter(s => s.type !== 'unstacked_batch' && s.notes !== 'Unstacked batch');
  const batches         = shed.filter(s => s.type === 'unstacked_batch'  || s.notes === 'Unstacked batch');
  const qualityKg       = qualityBags.reduce((s, b) => s + (b.stationWeight || 0), 0);
  const batchKg         = batches.reduce((s, b) => s + (b.stationWeight || 0), 0);
  const totalKgWeighed  = qualityKg + batchKg;
  const shippedBags     = shipped.reduce((s, sh) => s + (sh.bagCount || 0), 0);
  const shippedKg       = shipped.reduce((s, sh) => s + (sh.totalKg   || 0), 0);
  const uniqueFarmers   = new Set(shed.map(s => s.farmerId).filter(Boolean)).size;
  const pendingRecent   = shed.filter(s => s.status === 'recently_weighed').length;
  const pendingUnstacked = batches.filter(s => s.status === 'in_shed').reduce((s, b) => s + (b.stationWeight || 0), 0);

  const timeline = useMemo(() => {
    const events = [];

    issued.forEach(i => events.push({
      _ts:  i.issuedAt,
      type: 'issue',
      text: `📤 Issued ${i.bagSerial} to ${i.farmerName}`,
      sub:  i.status === 'returned' ? '↩️ Returned' : '',
    }));

    const weighGroups = {};
    shed.forEach(s => {
      const key = `${s.farmerId}_${(s.weighedAt || '').slice(0, 16)}`;
      if (!weighGroups[key]) weighGroups[key] = { _ts: s.weighedAt, farmerName: s.farmerName, bags: [], batches: [] };
      if (s.type === 'unstacked_batch' || s.notes === 'Unstacked batch') weighGroups[key].batches.push(s);
      else weighGroups[key].bags.push(s);
    });
    Object.values(weighGroups).forEach(g => {
      const bagPart   = g.bags.length    ? `${g.bags.length} bag${g.bags.length !== 1 ? 's' : ''} (${g.bags.reduce((s, b) => s + (b.stationWeight || 0), 0).toFixed(1)} kg)` : '';
      const batchPart = g.batches.length ? `${g.batches.length} batch${g.batches.length !== 1 ? 'es' : ''} (${g.batches.reduce((s, b) => s + (b.stationWeight || 0), 0).toFixed(1)} kg)` : '';
      const parts     = [bagPart, batchPart].filter(Boolean).join(' + ');
      events.push({ _ts: g._ts, type: 'weigh', text: `⚖️ Weighed ${parts} — ${g.farmerName}` });
    });

    shipped.forEach(sh => events.push({
      _ts:  sh.shippedAt,
      type: 'ship',
      text: `🚢 Shipped ${sh.bagCount} bags (${sh.totalKg?.toFixed(1)} kg) — ${sh.vesselName}`,
    }));

    return events.sort((a, b) => (a._ts || '').localeCompare(b._ts || ''));
  }, [issued, shed, shipped]);

  const fmtTime  = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const typeColor = t => t === 'issue' ? '#007c91' : t === 'weigh' ? '#e65100' : '#1565c0';

  const dayTotals = [
    { label: 'Farmers Served',       value: uniqueFarmers },
    { label: 'Total Copra Received', value: `${totalKgWeighed.toFixed(2)} kg` },
    { label: 'Quality Bags Weighed', value: `${qualityBags.length} bags (${qualityKg.toFixed(2)} kg)` },
    { label: 'Unstacked Batches',    value: `${batches.length} batches (${batchKg.toFixed(2)} kg)` },
    { label: 'Bags Issued',          value: issued.length },
    { label: 'Bags Shipped',         value: shippedBags ? `${shippedBags} bags (${shippedKg.toFixed(2)} kg)` : '0' },
  ];

  const noActivity = !issued.length && !shed.length && !shipped.length;

  return (
    <section style={{ paddingBottom: 40 }}>
      <h2 className="section-title">📊 Daily Summary</h2>

      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: '0.88rem', color: '#555', flexShrink: 0 }}>Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ flex: 1, height: 42, padding: '0 12px', border: '1.5px solid #ddd', borderRadius: 8, fontSize: '0.95rem', outline: 'none' }}
        />
      </div>

      {/* Stats badges */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: 4, marginBottom: 20 }}>
        <Stat value={issued.length}                    label="Bags Issued"                              color="linear-gradient(135deg,#007c91,#339bbf)" />
        <Stat value={qualityBags.length}               label={`Quality Bags · ${qualityKg.toFixed(1)} kg`} color="linear-gradient(135deg,#e65100,#ff8f00)" />
        <Stat value={batches.length}                   label={`Batches · ${batchKg.toFixed(1)} kg`}    color="linear-gradient(135deg,#6d4c41,#a1887f)" />
        <Stat value={`${totalKgWeighed.toFixed(1)} kg`} label="Total Weighed"                          color="linear-gradient(135deg,#2e7d32,#66bb6a)" />
        <Stat value={shippedBags}                      label={`Shipped · ${shippedKg.toFixed(1)} kg`}  color="linear-gradient(135deg,#1565c0,#42a5f5)" />
        <Stat value={uniqueFarmers}                    label="Farmers Served"                           color="linear-gradient(135deg,#6a1b9a,#ab47bc)" />
      </div>

      {/* Activity Timeline */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="home-section-label">Activity Timeline</div>
          {timeline.map((ev, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ flexShrink: 0, width: 46, textAlign: 'center', fontSize: '0.72rem', color: '#888', fontWeight: 600, paddingTop: 3 }}>
                {fmtTime(ev._ts)}
              </div>
              <div style={{ flex: 1, background: '#fff', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 5px rgba(0,0,0,0.08)', borderLeft: `3px solid ${typeColor(ev.type)}` }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1a1a' }}>{ev.text}</div>
                {ev.sub && <div style={{ fontSize: '0.74rem', color: '#888', marginTop: 2 }}>{ev.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Day Totals */}
      <div style={{ marginBottom: 20 }}>
        <div className="home-section-label">Day Totals</div>
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.09)' }}>
          {dayTotals.map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: '0.82rem', color: '#555', fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontSize: '0.88rem', color: '#1a1a1a', fontWeight: 700 }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Tasks */}
      {(pendingRecent > 0 || pendingUnstacked > 0) && (
        <div style={{ marginBottom: 20 }}>
          <div className="home-section-label" style={{ color: '#e65100' }}>⚠️ Pending Tasks</div>
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.09)' }}>
            {pendingRecent > 0 && (
              <div style={{ padding: '9px 0', borderBottom: pendingUnstacked > 0 ? '1px solid #f0f0f0' : 'none' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e65100' }}>
                  📦 {pendingRecent} bag{pendingRecent !== 1 ? 's' : ''} in Recently Weighed
                </div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 2 }}>Not yet moved to Warehouse</div>
              </div>
            )}
            {pendingUnstacked > 0 && (
              <div style={{ padding: '9px 0' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e65100' }}>
                  🏚️ {pendingUnstacked.toFixed(2)} kg unstacked copra
                </div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 2 }}>Not yet bagged in Warehouse</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {noActivity && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div>No activity recorded for {date}.</div>
        </div>
      )}
    </section>
  );
}
