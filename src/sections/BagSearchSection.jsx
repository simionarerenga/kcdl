// src/sections/BagSearchSection.jsx
import { useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export default function BagSearchSection({ onNavigate }) {
  const [serial, setSerial]       = useState('');
  const [results, setResults]     = useState(null);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg]             = useState('');
  const [detailModal, setDetailModal] = useState(null);

  async function handleSearch() {
    const s = serial.trim().toUpperCase();
    if (!s) { setMsg('⚠️ Enter a bag serial number.'); return; }
    setSearching(true);
    setMsg('');
    setResults(null);
    try {
      const [issSnap, shedSnap, shipSnap] = await Promise.all([
        getDocs(query(collection(db, 'bagIssuances'), where('bagSerial', '==', s), orderBy('issuedAt', 'desc'))),
        getDocs(query(collection(db, 'shedStock'),   where('bagSerial', '==', s), orderBy('weighedAt', 'desc'))),
        getDocs(query(collection(db, 'shipments'), orderBy('shippedAt', 'desc'))),
      ]);

      const issuances = issSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const shed      = shedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const shipments = shipSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(sh => (sh.bags || []).some(b => b.bagSerial === s));

      if (!issuances.length && !shed.length && !shipments.length) {
        setMsg(`No records found for bag ${s}.`);
      } else {
        const res = { serial: s, issuances, shed, shipments };
        setResults(res);
        // Auto-open detail modal
        setDetailModal(buildBagDetail(s, issuances, shed, shipments));
      }
    } catch (e) {
      setMsg('❌ Search error: ' + e.message);
    } finally {
      setSearching(false);
    }
  }

  function buildBagDetail(serial, issuances, shed, shipments) {
    // Determine current status
    const latestShed = shed[0];
    const latestIssuance = issuances[0];
    const latestShipment = shipments[0];

    let location = null;
    let status = null;
    let weight = null;
    let bagType = null;
    let farmerName = null;
    let vesselName = null;

    if (latestShipment) {
      const bagInShip = (latestShipment.bags || []).find(b => b.bagSerial === serial);
      status = 'shipped';
      location = `🚢 Shipped — ${latestShipment.vesselName || 'Vessel'}`;
      weight = bagInShip?.stationWeight || latestShed?.stationWeight || null;
      vesselName = latestShipment.vesselName;
      farmerName = latestShed?.farmerName || latestIssuance?.farmerName;
    } else if (latestShed && latestShed.status === 'in_shed') {
      status = 'in_warehouse';
      location = '📦 In Station Warehouse (has copra)';
      weight = latestShed.stationWeight;
      farmerName = latestShed.farmerName;
    } else if (latestShed) {
      status = 'was_warehoused';
      location = '📦 Was in warehouse — now shipped or returned';
      weight = latestShed.stationWeight;
      farmerName = latestShed.farmerName;
    } else if (latestIssuance && latestIssuance.status === 'issued') {
      status = 'at_farmer';
      location = `👩‍🌾 At Farmer — ${latestIssuance.farmerName}`;
      farmerName = latestIssuance.farmerName;
    } else if (latestIssuance && latestIssuance.status === 'returned') {
      status = 'returned';
      location = '↩️ Returned to station (empty bag)';
      farmerName = latestIssuance.farmerName;
    } else if (latestIssuance) {
      status = 'issued';
      location = `👩‍🌾 Issued to ${latestIssuance.farmerName}`;
      farmerName = latestIssuance.farmerName;
    }

    // Bag type
    if (shed.length > 0) {
      bagType = shed[0].isRestock ? '♻️ Restocked (non-standard → standard)' : '📦 Standard bag with copra record';
    } else if (issuances.length > 0) {
      bagType = '🆕 New bag — no copra weighed yet';
    } else {
      bagType = '❓ Unknown';
    }

    return { serial, status, location, weight, bagType, farmerName, vesselName,
      issuanceDate: latestIssuance?.issuedDate,
      weighedDate:  latestShed?.weighedDate,
      shipDate:     latestShipment?.shipDate,
      weighedBy:    latestShed?.weighedBy,
      issuedCount:  issuances.length,
      totalHistory: issuances.length + shed.length + shipments.length,
    };
  }

  const statusColor = s => s.status === 'in_shed' ? '#e65100' : '#1565c0';
  const statusBadge = (status) => {
    const colors = { issued: '#007c91', returned: '#2e7d32', in_shed: '#e65100', shipped: '#1565c0' };
    return <span className="badge" style={{ background: colors[status] || '#888' }}>{status.replace('_', ' ')}</span>;
  };

  const STATUS_COLORS = {
    shipped:       '#1565c0',
    in_warehouse:  '#e65100',
    was_warehoused:'#ff8f00',
    at_farmer:     '#2e7d32',
    returned:      '#888',
    issued:        '#007c91',
  };
  const STATUS_LABELS = {
    shipped:       '🚢 Shipped',
    in_warehouse:  '📦 In Warehouse',
    was_warehoused:'📦 Was Warehoused',
    at_farmer:     '👩‍🌾 At Farmer',
    returned:      '↩️ Returned',
    issued:        '📤 Issued',
  };

  return (
    <section>
      <h2 className="section-title">🔍 Bag Search</h2>
      <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: 16 }}>
        Enter a bag serial number to see its full history.
      </p>

      <div className="row-between" style={{ marginBottom: 14 }}>
        <input
          type="text"
          placeholder="e.g. KCDL-0047"
          value={serial}
          onChange={e => setSerial(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          autoCapitalize="characters"
        />
        <button className="btn-primary"
          onClick={handleSearch} disabled={searching} type="button">
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {msg && <div className="section-msg">{msg}</div>}

      {results && (
        <div>
          {/* Summary tap card */}
          <div className="bag-summary-tap" onClick={() => setDetailModal(buildBagDetail(results.serial, results.issuances, results.shed, results.shipments))}>
            <div className="bag-summary-tap-inner">
              <span className="list-card-title">🏷️ {results.serial}</span>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Tap to view details &rarr;</span>
            </div>
          </div>

          {/* History cards */}
          {results.issuances.length > 0 && (
            <div>
              <div className="history-section-title">📤 Issuance History</div>
              {results.issuances.map(i => (
                <div key={i.id} className="list-card" style={{ cursor: 'pointer' }}
                  onClick={() => setDetailModal(buildBagDetail(results.serial, results.issuances, results.shed, results.shipments))}>
                  <div className="list-card-header">
                    <span className="list-card-title">Issued to {i.farmerName}</span>
                    {statusBadge(i.status)}
                  </div>
                  <div className="list-card-meta">🪪 {i.farmerIdCard} · 📅 {i.issuedDate}</div>
                  {i.returnedAt && <div className="list-card-meta">↩️ Returned: {i.returnedAt?.slice(0,10)}</div>}
                </div>
              ))}
            </div>
          )}

          {results.shed.length > 0 && (
            <div>
              <div className="history-section-title">⚖️ Warehouse History</div>
              {results.shed.map(s => (
                <div key={s.id} className="list-card" style={{ cursor: 'pointer' }}
                  onClick={() => setDetailModal(buildBagDetail(results.serial, results.issuances, results.shed, results.shipments))}>
                  <div className="list-card-header">
                    <span className="list-card-title">Weighed at Warehouse</span>
                    {statusBadge(s.status)}
                  </div>
                  <div className="list-card-meta">👩‍🌾 {s.farmerName} · 🪪 {s.farmerIdCard}</div>
                  <div className="list-card-meta">⚖️ {s.stationWeight?.toFixed(2)} kg · 📅 {s.weighedDate}</div>
                </div>
              ))}
            </div>
          )}

          {results.shipments.length > 0 && (
            <div>
              <div className="history-section-title">🚢 Shipment History</div>
              {results.shipments.map(sh => {
                const bagInShip = (sh.bags || []).find(b => b.bagSerial === results.serial);
                return (
                  <div key={sh.id} className="list-card" style={{ cursor: 'pointer' }}
                    onClick={() => setDetailModal(buildBagDetail(results.serial, results.issuances, results.shed, results.shipments))}>
                    <div className="list-card-header">
                      <span className="list-card-title">🚢 {sh.vesselName}</span>
                      <span className="badge" style={{ background: '#1565c0' }}>Shipped</span>
                    </div>
                    <div className="list-card-meta">📅 {sh.shipDate}</div>
                    {bagInShip && <div className="list-card-meta">⚖️ Weight: {bagInShip.stationWeight?.toFixed(2)} kg</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bag Detail Modal */}
      {detailModal && (
        <div className="overlay" onClick={() => setDetailModal(null)}>
          <div className="overlay-card bag-detail-card" onClick={e => e.stopPropagation()}>
            <div className="bag-detail-header">
              <div>
                <div className="bag-detail-serial">🏷️ {detailModal.serial}</div>
                <span className="badge" style={{ background: STATUS_COLORS[detailModal.status] || '#888', marginTop: 6, display: 'inline-block' }}>
                  {STATUS_LABELS[detailModal.status] || detailModal.status}
                </span>
              </div>
              <button className="bag-detail-close" onClick={() => setDetailModal(null)} type="button">✕</button>
            </div>

            <div className="bag-detail-rows">
              <div className="bag-detail-row">
                <span className="bag-detail-label">Serial No.</span>
                <span className="bag-detail-value">{detailModal.serial}</span>
              </div>
              <div className="bag-detail-row">
                <span className="bag-detail-label">Bag Type</span>
                <span className="bag-detail-value">{detailModal.bagType}</span>
              </div>
              {detailModal.weight != null && (
                <div className="bag-detail-row">
                  <span className="bag-detail-label">Weight</span>
                  <span className="bag-detail-value">{Number(detailModal.weight).toFixed(2)} kg</span>
                </div>
              )}
              <div className="bag-detail-row">
                <span className="bag-detail-label">Location</span>
                <span className="bag-detail-value">{detailModal.location || '—'}</span>
              </div>
              {detailModal.farmerName && (
                <div className="bag-detail-row">
                  <span className="bag-detail-label">Farmer</span>
                  <span className="bag-detail-value">👩‍🌾 {detailModal.farmerName}</span>
                </div>
              )}
              {detailModal.issuanceDate && (
                <div className="bag-detail-row">
                  <span className="bag-detail-label">Issued</span>
                  <span className="bag-detail-value">📅 {detailModal.issuanceDate}</span>
                </div>
              )}
              {detailModal.weighedDate && (
                <div className="bag-detail-row">
                  <span className="bag-detail-label">Weighed In</span>
                  <span className="bag-detail-value">📅 {detailModal.weighedDate}</span>
                </div>
              )}
              {detailModal.shipDate && (
                <div className="bag-detail-row">
                  <span className="bag-detail-label">Shipped</span>
                  <span className="bag-detail-value">📅 {detailModal.shipDate}</span>
                </div>
              )}
              {detailModal.vesselName && (
                <div className="bag-detail-row">
                  <span className="bag-detail-label">Vessel</span>
                  <span className="bag-detail-value">🚢 {detailModal.vesselName}</span>
                </div>
              )}
              {detailModal.weighedBy && (
                <div className="bag-detail-row">
                  <span className="bag-detail-label">Weighed By</span>
                  <span className="bag-detail-value">🧑 {detailModal.weighedBy}</span>
                </div>
              )}
              <div className="bag-detail-row">
                <span className="bag-detail-label">Total Records</span>
                <span className="bag-detail-value">{detailModal.totalHistory} record{detailModal.totalHistory !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <button className="btn-primary" style={{ marginTop: 16 }} type="button"
              onClick={() => setDetailModal(null)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}
