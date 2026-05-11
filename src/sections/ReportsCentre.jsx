// src/sections/ReportsCentre.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { useAppData } from '../context/AppDataContext';

import { fmt, sumField, groupBy, csvExport } from '../utils/helpers';

const REPORT_TYPES = [
  { id:'cpr_summary',        label:'CPR Summary Report',          icon:'📋', desc:'All CPR records grouped by island & cooperative' },
  { id:'twc_summary',        label:'TWC Summary Report',          icon:'🚢', desc:'TWC records by vessel and island' },
  { id:'island_summary',     label:'Island Production Report',    icon:'🏝️', desc:'Total weight and bags produced per island' },
  { id:'village_report',     label:'Warehouse Activity Report',   icon:'🏭', desc:'Copra activity per warehouse' },
  { id:'daily_report',       label:'Daily Operations Report',     icon:'📅', desc:'All activities for a selected date' },
  { id:'monthly_report',     label:'Monthly Summary Report',      icon:'📆', desc:'Month-by-month copra production totals' },
  { id:'farmer_report',      label:'Farmer Participation Report', icon:'👩‍🌾', desc:'Registered farmers and their weighing history' },
  { id:'stock_report',       label:'Stock Status Report',         icon:'⚖️', desc:'Current bag inventory by stage and warehouse' },
  { id:'shipment_report',    label:'Shipment Manifest',           icon:'🛳️', desc:'Ready-to-ship bags for a specific warehouse' },
  { id:'cooperative_report', label:'Cooperative Report',          icon:'🤝', desc:'CPR and weight breakdown by cooperative' },
];

function PrintBtn({ onPrint }) {
  return (
    <button className="btn btn-gold btn-sm" onClick={onPrint} type="button" style={{ fontWeight: 700 }}>
      🖨️ Print / Save PDF
    </button>
  );
}

/* ── Individual report renderers ─────────────────────────────────────────── */

function CPRSummaryReport({ cprs, from, to }) {
  const filtered = cprs.filter(c => {
    if (from && c.date < from) return false;
    if (to   && c.date > to)   return false;
    return true;
  });
  const byIsland = groupBy(filtered, 'island');
  const total    = sumField(filtered, 'total_weight_cpr');

  return (
    <div>
      <div className="report-section-title">CPR Records — {filtered.length} records</div>
      {Object.entries(byIsland).map(([island, items]) => {
        const iTotal = sumField(items, 'total_weight_cpr');
        return (
          <div key={island} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#007c91', marginBottom: 8, background: '#f0f8fa', padding: '6px 10px', borderRadius: 4 }}>
              {island} — {items.length} CPRs · {fmt.kg(iTotal)}
            </div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Date</th><th>CPR No.</th><th>Cooperative</th><th>Inspector</th>
                  <th>Start</th><th>End</th><th>Weight (kg)</th>
                </tr>
              </thead>
              <tbody>
                {items.sort((a, b) => a.date > b.date ? -1 : 1).map(r => (
                  <tr key={r.id}>
                    <td>{fmt.date(r.date)}</td>
                    <td style={{ fontWeight: 700 }}>{r.cpr_number || '—'}</td>
                    <td>{r.cooperative_name || '—'}</td>
                    <td style={{ fontSize: '0.75rem' }}>{r.inspectorEmail || r.copra_inspector_name || '—'}</td>
                    <td>{fmt.time12(r.start_time)}</td>
                    <td>{fmt.time12(r.end_time)}</td>
                    <td style={{ fontWeight: 700, textAlign: 'right' }}>{r.total_weight_cpr ? (+r.total_weight_cpr).toLocaleString('en', { minimumFractionDigits: 2 }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ fontWeight: 700 }}>Sub-Total ({items.length})</td>
                  <td style={{ fontWeight: 700, textAlign: 'right' }}>{iTotal.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
      <div style={{ background: '#e8f4f7', padding: '12px 16px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 12 }}>
        <span>GRAND TOTAL — {filtered.length} CPR records</span>
        <span>{total.toLocaleString('en', { minimumFractionDigits: 2 })} kg</span>
      </div>
    </div>
  );
}

function IslandSummaryReport({ cprs, twcs, from, to }) {
  const filteredCPR = cprs.filter(c => (!from || c.date >= from) && (!to || c.date <= to));
  const filteredTWC = twcs.filter(t => (!from || t.date >= from) && (!to || t.date <= to));
  const islandsCPR  = groupBy(filteredCPR, 'island');
  const islandsTWC  = groupBy(filteredTWC, 'island');
  const allIslands  = [...new Set([...Object.keys(islandsCPR), ...Object.keys(islandsTWC)])].sort();

  return (
    <div>
      <div className="report-section-title">Island Production Summary</div>
      <table className="report-table">
        <thead>
          <tr>
            <th>Island</th>
            <th style={{ textAlign: 'right' }}>CPR Sessions</th>
            <th style={{ textAlign: 'right' }}>CPR Weight (kg)</th>
            <th style={{ textAlign: 'right' }}>TWC Sessions</th>
            <th style={{ textAlign: 'right' }}>TWC Sacks</th>
            <th style={{ textAlign: 'right' }}>TWC Weight (kg)</th>
          </tr>
        </thead>
        <tbody>
          {allIslands.map(island => {
            const cItems = islandsCPR[island] || [];
            const tItems = islandsTWC[island] || [];
            return (
              <tr key={island}>
                <td style={{ fontWeight: 700 }}>{island}</td>
                <td style={{ textAlign: 'right' }}>{cItems.length}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(cItems, 'total_weight_cpr').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                <td style={{ textAlign: 'right' }}>{tItems.length}</td>
                <td style={{ textAlign: 'right' }}>{tItems.reduce((s, t) => s + (parseInt(t.number_of_sacks) || 0), 0)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(tItems, 'total_weight_twc').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ fontWeight: 700 }}>TOTAL</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{filteredCPR.length}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(filteredCPR, 'total_weight_cpr').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{filteredTWC.length}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{filteredTWC.reduce((s, t) => s + (parseInt(t.number_of_sacks) || 0), 0)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(filteredTWC, 'total_weight_twc').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DailyReport({ cprs, twcs, stock, date }) {
  if (!date) return <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>Select a date to generate this report.</div>;
  const dayCPR   = cprs.filter(c => c.date === date);
  const dayTWC   = twcs.filter(t => t.date === date);
  const dayStock = stock.filter(s => (s.weighedAt || s.createdAt || '').slice(0, 10) === date);

  return (
    <div>
      <div className="report-section-title">Daily Operations — {fmt.date(date)}</div>
      <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>
        📋 CPR Sessions ({dayCPR.length}) — {fmt.kg(sumField(dayCPR, 'total_weight_cpr'))}
      </div>
      {dayCPR.length > 0 ? (
        <table className="report-table" style={{ marginBottom: 16 }}>
          <thead><tr><th>CPR No.</th><th>Island</th><th>Cooperative</th><th>Inspector</th><th style={{ textAlign: 'right' }}>Weight (kg)</th></tr></thead>
          <tbody>
            {dayCPR.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700 }}>{r.cpr_number || '—'}</td>
                <td>{r.island || '—'}</td>
                <td>{r.cooperative_name || '—'}</td>
                <td style={{ fontSize: '0.75rem' }}>{r.inspectorEmail || r.copra_inspector_name || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.total_weight_cpr ? (+r.total_weight_cpr).toLocaleString('en', { minimumFractionDigits: 2 }) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p style={{ color: '#999', fontSize: '0.82rem', marginBottom: 12 }}>No CPR records for this date.</p>}

      <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>
        🚢 TWC Sessions ({dayTWC.length}) — {fmt.kg(sumField(dayTWC, 'total_weight_twc'))}
      </div>
      {dayTWC.length > 0 ? (
        <table className="report-table" style={{ marginBottom: 16 }}>
          <thead><tr><th>TWC No.</th><th>Vessel</th><th>Island</th><th>Sacks</th><th style={{ textAlign: 'right' }}>Weight (kg)</th></tr></thead>
          <tbody>
            {dayTWC.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700 }}>{r.twc_number || '—'}</td>
                <td>{r.vessel_name || '—'}</td>
                <td>{r.island || '—'}</td>
                <td>{r.number_of_sacks || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.total_weight_twc ? (+r.total_weight_twc).toLocaleString('en', { minimumFractionDigits: 2 }) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p style={{ color: '#999', fontSize: '0.82rem', marginBottom: 12 }}>No TWC records for this date.</p>}

      <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>
        ⚖️ Bags Weighed ({dayStock.length}) — {fmt.kg(sumField(dayStock, 'stationWeight'))}
      </div>
    </div>
  );
}

function MonthlyReport({ cprs, twcs }) {
  const monthMap = {};
  [...cprs].forEach(c => {
    const m = (c.date || '').slice(0, 7);
    if (!m) return;
    if (!monthMap[m]) monthMap[m] = { cprCount: 0, cprKg: 0, twcCount: 0, twcKg: 0, sacks: 0 };
    monthMap[m].cprCount++;
    monthMap[m].cprKg += parseFloat(c.total_weight_cpr) || 0;
  });
  [...twcs].forEach(t => {
    const m = (t.date || '').slice(0, 7);
    if (!m) return;
    if (!monthMap[m]) monthMap[m] = { cprCount: 0, cprKg: 0, twcCount: 0, twcKg: 0, sacks: 0 };
    monthMap[m].twcCount++;
    monthMap[m].twcKg += parseFloat(t.total_weight_twc) || 0;
    monthMap[m].sacks += parseInt(t.number_of_sacks) || 0;
  });

  const months = Object.keys(monthMap).sort().reverse();

  return (
    <div>
      <div className="report-section-title">Monthly Production Summary</div>
      <table className="report-table">
        <thead>
          <tr>
            <th>Month</th>
            <th style={{ textAlign: 'right' }}>CPR Sessions</th>
            <th style={{ textAlign: 'right' }}>CPR Weight (kg)</th>
            <th style={{ textAlign: 'right' }}>TWC Sessions</th>
            <th style={{ textAlign: 'right' }}>Sacks</th>
            <th style={{ textAlign: 'right' }}>TWC Weight (kg)</th>
          </tr>
        </thead>
        <tbody>
          {months.map(m => {
            const d = monthMap[m];
            const [yr, mo] = m.split('-');
            const label = new Date(+yr, +mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
            return (
              <tr key={m}>
                <td style={{ fontWeight: 700 }}>{label}</td>
                <td style={{ textAlign: 'right' }}>{d.cprCount}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{d.cprKg.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                <td style={{ textAlign: 'right' }}>{d.twcCount}</td>
                <td style={{ textAlign: 'right' }}>{d.sacks}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{d.twcKg.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ fontWeight: 700 }}>GRAND TOTAL</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{cprs.length}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(cprs, 'total_weight_cpr').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{twcs.length}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{twcs.reduce((s, t) => s + (parseInt(t.number_of_sacks) || 0), 0)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(twcs, 'total_weight_twc').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CooperativeReport({ cprs, from, to }) {
  const filtered = cprs.filter(c => (!from || c.date >= from) && (!to || c.date <= to));
  const byCoop   = groupBy(filtered, 'cooperative_name');
  const rows     = Object.entries(byCoop)
    .map(([coop, items]) => ({ coop, count: items.length, weight: sumField(items, 'total_weight_cpr') }))
    .sort((a, b) => b.weight - a.weight);
  const total = rows.reduce((s, r) => s + r.weight, 0);

  return (
    <div>
      <div className="report-section-title">Cooperative Production Report</div>
      <table className="report-table">
        <thead>
          <tr>
            <th>#</th><th>Cooperative</th>
            <th style={{ textAlign: 'right' }}>CPR Sessions</th>
            <th style={{ textAlign: 'right' }}>Total Weight (kg)</th>
            <th style={{ textAlign: 'right' }}>% Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.coop}>
              <td style={{ color: '#aaa' }}>{i + 1}</td>
              <td style={{ fontWeight: 700 }}>{r.coop || 'Unknown'}</td>
              <td style={{ textAlign: 'right' }}>{r.count}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.weight.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
              <td style={{ textAlign: 'right' }}>
                {total > 0 ? ((r.weight / total) * 100).toFixed(1) + '%' : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>TOTAL</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{filtered.length}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{total.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StockReport({ stock }) {
  const byStation = groupBy(stock, 'stationId');
  return (
    <div>
      <div className="report-section-title">Current Stock Status by Warehouse</div>
      {Object.entries(byStation).map(([stn, bags]) => {
        const statuses = { recently_weighed: [], in_shed: [], in_warehouse: [], ready_to_ship: [], shipped: [] };
        bags.forEach(b => { if (statuses[b.status]) statuses[b.status].push(b); });
        return (
          <div key={stn} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#007c91', background: '#f0f8fa', padding: '6px 10px', borderRadius: 4, marginBottom: 8 }}>
              Warehouse: {stn} — {bags.length} total bags
            </div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Bags</th>
                  <th style={{ textAlign: 'right' }}>Total Weight (kg)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(statuses).map(([status, items]) => (
                  <tr key={status}>
                    <td>{status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                    <td style={{ textAlign: 'right' }}>{items.length}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(items, 'stationWeight').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 700 }}>TOTAL</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{bags.length}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(bags, 'stationWeight').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Reports Centre component
═══════════════════════════════════════════════════════════════ */
export default function ReportsCentre({ initialReport, reportsBackRef }) {
  const { cprEntries: cprs, twcEntries: twcs, stock, farmers, loading } = useAppData();

  const [view,       setView]       = useState(() => initialReport ? 'detail' : 'list');
  const [selected,   setSelected]   = useState(() => initialReport || null);
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [singleDate, setSingleDate] = useState(new Date().toISOString().slice(0, 10));
  const [islandFilter, setIslandFilter] = useState(''); // '' = All Islands

  const printRef = useRef(null);

  // When initialReport changes (navigated from Dashboard dropdown), open it
  useEffect(() => {
    if (initialReport) {
      setSelected(initialReport);
      setView('detail');
    }
  }, [initialReport]);

  // Register back-callback for App-level hardware back button
  useEffect(() => {
    if (reportsBackRef) {
      reportsBackRef.current = view === 'detail' ? () => setView('list') : null;
    }
  }, [view, reportsBackRef]);

  // Hardware / browser back button: detail → list
  useEffect(() => {
    if (view !== 'detail') return;
    window.history.pushState({ rcDetail: true }, '');
    function onPop() { setView('list'); }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [view]);



  // Derive all known islands from data
  const allIslands = useMemo(() => {
    const set = new Set([
      ...cprs.map(c => c.island),
      ...twcs.map(t => t.island),
      ...stock.map(s => s.island),
      ...farmers.map(f => f.island),
    ].filter(Boolean));
    return [...set].sort();
  }, [cprs, twcs, stock, farmers]);

  function openReport(id) {
    setSelected(id);
    setView('detail');
  }

  function goBack() {
    setView('list');
  }

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html><html><head>
      <title>KCDL Report</title>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'DM Sans', sans-serif; margin: 0; padding: 20px; color: #111; font-size: 13px; }
        h2 { font-family: 'Sora', sans-serif; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
        th { background: #f0f8fa; color: #007c91; padding: 7px 10px; text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #007c91; }
        td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
        tfoot td { font-weight: 700; background: #f9f9f9; border-top: 2px solid #ccc; }
        @media print { body { padding: 0; } }
      </style>
      </head><body>${content}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  const reportEl = useMemo(() => {
    if (!selected) return null;
    // Apply island filter to source data
    const filtCprs    = islandFilter ? cprs.filter(c => c.island === islandFilter)    : cprs;
    const filtTwcs    = islandFilter ? twcs.filter(t => t.island === islandFilter)    : twcs;
    const filtStock   = islandFilter ? stock.filter(s => s.island === islandFilter)   : stock;
    const filtFarmers = islandFilter ? farmers.filter(f => f.island === islandFilter) : farmers;
    switch (selected) {
      case 'cpr_summary':    return <CPRSummaryReport cprs={filtCprs} from={dateFrom} to={dateTo} />;
      case 'twc_summary':    return <div><div className="report-section-title">TWC Summary</div></div>;
      case 'island_summary': return <IslandSummaryReport cprs={filtCprs} twcs={filtTwcs} from={dateFrom} to={dateTo} />;
      case 'daily_report':   return <DailyReport cprs={filtCprs} twcs={filtTwcs} stock={filtStock} date={singleDate} />;
      case 'monthly_report': return <MonthlyReport cprs={filtCprs} twcs={filtTwcs} />;
      case 'cooperative_report': return <CooperativeReport cprs={filtCprs} from={dateFrom} to={dateTo} />;
      case 'stock_report':   return <StockReport stock={filtStock} />;
      case 'farmer_report':
        return (
          <div>
            <div className="report-section-title">Farmer Registry — {filtFarmers.length} registered farmers</div>
            <table className="report-table">
              <thead><tr><th>Farmer ID</th><th>Name</th><th>ID Card</th><th>Village</th><th>Gender</th><th>Phone</th><th>Warehouse</th></tr></thead>
              <tbody>
                {[...filtFarmers].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 700 }}>{f.farmerId || '—'}</td>
                    <td>{f.name || '—'}</td><td>{f.idCard || '—'}</td>
                    <td>{f.village || '—'}</td><td>{f.gender || '—'}</td>
                    <td>{f.phone || '—'}</td><td style={{ fontSize: '0.75rem' }}>{f.stationId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'village_report': {
        const byStn = groupBy(filtCprs, 'stationId');
        return (
          <div>
            <div className="report-section-title">Village Activity Report</div>
            <table className="report-table">
              <thead><tr><th>Warehouse</th><th style={{ textAlign: 'right' }}>CPR Sessions</th><th style={{ textAlign: 'right' }}>Total Weight (kg)</th></tr></thead>
              <tbody>
                {Object.entries(byStn).map(([stn, items]) => (
                  <tr key={stn}>
                    <td style={{ fontWeight: 700 }}>{stn}</td>
                    <td style={{ textAlign: 'right' }}>{items.length}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(items, 'total_weight_cpr').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 700 }}>TOTAL</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{filtCprs.length}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(filtCprs, 'total_weight_cpr').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      }
      case 'shipment_report': {
        const ready = filtStock.filter(s => {
          if (s.status !== 'ready_to_ship' && s.status !== 'shipped') return false;
          const d = s.date || s.updatedAt || '';
          if (dateFrom && d < dateFrom) return false;
          if (dateTo   && d > dateTo)   return false;
          return true;
        });
        return (
          <div>
            <div className="report-section-title">Shipment Manifest — {ready.length} bags · {fmt.kg(sumField(ready, 'stationWeight'))}</div>
            <table className="report-table">
              <thead><tr><th>Bag Serial</th><th>Farmer</th><th>Farmer ID</th><th>Warehouse</th><th style={{ textAlign: 'right' }}>Weight (kg)</th><th>Status</th></tr></thead>
              <tbody>
                {ready.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 700 }}>{b.bagSerial || '—'}</td>
                    <td>{b.farmerName || '—'}</td><td>{b.farmerId || '—'}</td>
                    <td style={{ fontSize: '0.75rem' }}>{b.stationId || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{b.stationWeight ? (+b.stationWeight).toFixed(2) : '—'}</td>
                    <td>{b.status?.replace(/_/g, ' ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700 }}>TOTAL</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{sumField(ready, 'stationWeight').toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        );
      }
      default: return <div style={{ color: '#888', padding: 30, textAlign: 'center' }}>Report coming soon.</div>;
    }
  }, [selected, cprs, twcs, stock, farmers, dateFrom, dateTo, singleDate, islandFilter]);

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  const selInfo = REPORT_TYPES.find(r => r.id === selected);

  /* ── LIST VIEW ─────────────────────────────────────────────────── */
  if (view === 'list') {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">📑 Reports Centre</div>
            <div className="page-subtitle">Select a report type to generate, preview and print</div>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="card-title" style={{ marginBottom: 16, padding: '0 4px' }}>Select Report</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {REPORT_TYPES.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => openReport(r.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px', borderRadius: 10,
                  border: '1.5px solid var(--border)',
                  cursor: 'pointer', background: 'var(--navy-card)',
                  textAlign: 'left', transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--teal)';
                  e.currentTarget.style.background = 'var(--teal-dim)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--navy-card)';
                }}
              >
                <span style={{ fontSize: '1.4rem', flexShrink: 0, marginTop: 2 }}>{r.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 3 }}>{r.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.desc}</div>
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.9rem', flexShrink: 0, alignSelf: 'center' }}>›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── DETAIL VIEW ───────────────────────────────────────────────── */
  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={goBack}
          style={{ gap: 6 }}
        >
          ← 📑 Reports Centre
        </button>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-current">{selInfo?.icon} {selInfo?.label}</span>
      </div>

      {/* Controls bar */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginRight: 'auto' }}>
            {selInfo?.icon} {selInfo?.label}
          </div>

          {/* Island filter — always visible */}
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: 140, fontSize: '0.83rem' }}
            value={islandFilter}
            onChange={e => setIslandFilter(e.target.value)}
          >
            <option value="">🏝️ All Islands</option>
            {allIslands.map(isl => (
              <option key={isl} value={isl}>{isl}</option>
            ))}
          </select>

          {selected === 'daily_report' && (
            <>
              <label className="form-label" style={{ margin: 0 }}>Date:</label>
              <input type="date" className="form-input" style={{ width: 112 }} value={singleDate}
                onChange={e => setSingleDate(e.target.value)} />
            </>
          )}
          {!['daily_report', 'monthly_report', 'stock_report', 'farmer_report', 'village_report'].includes(selected) && (
            <>
              <label className="form-label" style={{ margin: 0 }}>From:</label>
              <input type="date" className="form-input" style={{ width: 104 }} value={dateFrom}
                onChange={e => setDateFrom(e.target.value)} />
              <label className="form-label" style={{ margin: 0 }}>To:</label>
              <input type="date" className="form-input" style={{ width: 104 }} value={dateTo}
                onChange={e => setDateTo(e.target.value)} />
            </>
          )}
          <PrintBtn onPrint={handlePrint} />
        </div>
      </div>

      {/* Report paper */}
      <div ref={printRef} className="report-preview">
        <div className="report-header">
          <div className="report-org">
            <strong>Kiribati Copra Development Ltd</strong>
            Head Office, Betio, South Tarawa, Kiribati<br />
            Report generated: {new Date().toLocaleString('en-GB')}
          </div>
          <div className="report-title-block">
            <h2>{selInfo?.label}</h2>
            <p>
              {dateFrom || dateTo
                ? `Period: ${dateFrom ? fmt.date(dateFrom) : 'Beginning'} — ${dateTo ? fmt.date(dateTo) : 'Present'}`
                : selected === 'daily_report' ? `Date: ${fmt.date(singleDate)}` : 'All records'}
            </p>
          </div>
        </div>

        {reportEl}

        <div className="report-footer">
          <span>KCDL Admin · Copra Operations Platform</span>
          <span>Confidential — Internal Use Only</span>
          <span>Page 1</span>
        </div>
      </div>
    </div>
  );
}
