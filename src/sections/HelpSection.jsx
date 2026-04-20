// src/sections/HelpSection.jsx

const FAQS = [
  // ── Getting started ──────────────────────────────────────────────────────
  {
    q: 'How do I set up the app for the first time?',
    a: 'Sign in with your KCDL email and password. If it is your first login, the app will ask for your station name and island — enter these and tap Save & Continue. Your station profile is created and all future data is tied to it automatically.',
  },
  {
    q: 'Does the app work without internet?',
    a: 'Yes. All data is stored on your device and the app works fully offline. Any changes you make while offline are queued and sync to the cloud automatically as soon as a connection is available. The coloured dot in the top bar shows your current connection status — green means online and synced, red means offline.',
  },

  // ── Farmers ──────────────────────────────────────────────────────────────
  {
    q: 'How do I register a new farmer?',
    a: 'Go to Farmers Registry and tap the + Add Farmer button. Fill in the farmer\'s name, ID card number, village, gender, and optionally their email and phone. The app generates a unique KI-### farmer ID automatically. Tap Save. The farmer will immediately appear in bag issuance and weighing dropdowns.',
  },
  {
    q: 'Can I edit or delete a farmer record?',
    a: 'Yes. In the Farmers Registry, tap Edit on any farmer to update their details. To delete a farmer, tap Delete. Note that deleting a farmer does not delete their associated bag issuance or weighing records.',
  },

  // ── Bags & Stock ─────────────────────────────────────────────────────────
  {
    q: 'How do I issue a bag to a farmer?',
    a: 'Go to Bags & Stock → Issue Bags tab. Tap Issue Bag, enter the bag serial number, and select the farmer from the dropdown. Add notes if needed, then tap Issue. The app checks that the serial is not already out with another farmer before saving.',
  },
  {
    q: 'How do I record that a farmer has returned a bag?',
    a: 'In Bags & Stock → Issue Bags, find the bag in the list and tap Return. This marks the bag as returned in the record. Returned bags can be re-issued to another farmer.',
  },
  {
    q: 'How do I track the station\'s supply of empty bags?',
    a: 'Go to Bags & Stock → Bag Stock tab. Tap Receive Bags to record a delivery from Tarawa HQ, or Distribute Bags to record bags given out to a farmer. The current balance is always shown at the top, and a full transaction history is listed below.',
  },

  // ── Weigh Copra ──────────────────────────────────────────────────────────
  {
    q: 'How do I record a weighing session?',
    a: 'Go to Weigh Copra. Select a farmer from the dropdown to start a session. Then use Add Bag to record an individual bag by serial number and weight, or Add Batch to record a bulk weight without individual bag serials. You can add as many bags or batches as needed. All records are saved to the warehouse immediately.',
  },
  {
    q: 'What is the difference between Add Bag and Add Batch?',
    a: 'Add Bag records a single identifiable bag with its serial number and weight — this links the weight to a specific traceable bag. Add Batch records a combined weight for a group of bags that are not individually serialised. Both types appear in the warehouse records.',
  },
  {
    q: 'Can I weigh bags for more than one farmer in the same session?',
    a: 'Each session is tied to one selected farmer. To weigh bags for a different farmer, change the farmer selection at the top of the Weigh Copra screen — this switches the active session to the new farmer.',
  },

  // ── Warehouse ────────────────────────────────────────────────────────────
  {
    q: 'How do I view all bags currently in the warehouse?',
    a: 'Go to Warehouse → Records tab. By default it shows bags with status In Warehouse. You can change the filter to Shipped or All, sort by date, weight, serial number, or farmer name, and search by serial or farmer name.',
  },
  {
    q: 'How do I find the complete history of a specific bag?',
    a: 'Go to Warehouse → Bag Search tab. Enter the bag serial number and tap Search. The app looks up the bag across issuance records, weighing records, and shipment records and shows you the full lifecycle — who it was issued to, when it was weighed and at what weight, and which vessel it was shipped on if applicable.',
  },
  {
    q: 'What are Unstacked bags?',
    a: 'Unstacked bags are batch-weighed records — groups of bags recorded with a combined weight but without individual serial numbers. They appear in the Warehouse → Unstacked tab separately from individually-serialised bags.',
  },

  // ── Shipments ────────────────────────────────────────────────────────────
  {
    q: 'How do I create a shipment?',
    a: 'Go to Shipments and tap New Shipment. Enter the vessel name and shipment date, then tick the bags from the warehouse that are going on this vessel. Tap Ship Selected Bags. All selected bags are updated to Shipped status and grouped under a single shipment record. You can view the bag manifest from the shipment history list.',
  },
  {
    q: 'Can I ship a bag directly from the Weigh Copra or Warehouse screens?',
    a: 'Yes. In both Weigh Copra and Warehouse → Records, individual bags have a Mark as Shipped option. This updates the bag status but does not create a formal shipment record. For a proper shipment record with vessel details, use the Shipments section.',
  },

  // ── CPR & TWC ────────────────────────────────────────────────────────────
  {
    q: 'How do I enter a CPR (Copra Purchase Record)?',
    a: 'Open the navigation menu (☰) and tap CPR Data Entry. Fill in the island, cooperative name, inspector name, date, start time, end time, CPR number, total weight, and any comments. Capture a photo of the physical CPR document — this is required for new entries. Tap Save.',
  },
  {
    q: 'How do I enter a TWC (Total Weight Certificate)?',
    a: 'TWC Data Entry is accessible from the navigation menu. It works the same as CPR but includes additional fields for vessel name, number of sacks, and total weight. A photo is also required. Tap Save when complete.',
  },
  {
    q: 'Can I edit a saved CPR or TWC entry?',
    a: 'Yes, but only within 20 minutes of the recorded end time. Open the Journal tab in the CPR or TWC section, find the entry, and tap Edit. After the 20-minute window the entry is locked and cannot be changed.',
  },

  // ── Daily Summary ────────────────────────────────────────────────────────
  {
    q: 'What does Daily Summary show?',
    a: 'Daily Summary shows all activity for a selected date. At the top are four stat cards: total bags issued, total bags weighed, total weight in kg, and total bags shipped. Below are detailed breakdowns — a list of every bag issued with the farmer name, every bag weighed with its individual weight, and every shipment with its vessel name and bag list.',
  },
  {
    q: 'Can I view a summary for a past date?',
    a: 'Yes. Tap the date field at the top of the Daily Summary screen and pick any date. The stats and breakdowns will update automatically for that date.',
  },

  // ── Settings & Export ────────────────────────────────────────────────────
  {
    q: 'How do I change the language, font size, or turn on dark mode?',
    a: 'Go to Settings. The Settings tab lets you choose a language (English, te Kiribati, or 中文), adjust the font size with a slider, and toggle dark mode on or off. Changes apply immediately across the whole app.',
  },
  {
    q: 'How do I export or back up my data?',
    a: 'Go to Settings → Tools tab. Tap Export Today\'s Report to export all activity for today (bag issuances, weighed bags, shipments, CPR and TWC entries) as a JSON file. Tap Export All Data to export a full backup of everything stored for your station. On Android the file is shared via the system share sheet; on a desktop computer a Save dialog opens.',
  },
];

export default function HelpSection() {
  return (
    <section id="helpContainer">
      <h2 className="section-title">Help &amp; Support</h2>

      <p style={{ color: 'var(--text-primary)', marginBottom: 20 }}>
        Instructions and contact information for the KCDL Copra Inspector App.
      </p>

      {/* Quick-start card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 16,
      }}>
        <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>🚀 Quick Start</h3>
        <p style={{ margin: '4px 0', color: 'var(--text)', lineHeight: 1.6 }}>
          <strong>1.</strong> Register your farmers in <em>Farmers Registry</em>.<br />
          <strong>2.</strong> Issue empty bags to farmers via <em>Bags &amp; Stock &rarr; Issue Bags</em>.<br />
          <strong>3.</strong> Record deliveries in <em>Weigh Copra</em> — select a farmer, add bags by weight.<br />
          <strong>4.</strong> Dispatch to a vessel in <em>Shipments</em>.<br />
          <strong>5.</strong> Review the day in <em>Daily Summary</em>.
        </p>
      </div>

      {/* Contact card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 24,
      }}>
        <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>📞 Contact Information</h3>
        <p style={{ margin: '6px 0' }}>📧 Email: <a href="mailto:support@kcdl.com.ki" style={{ color: 'var(--primary)' }}>support@kcdl.com.ki</a></p>
        <p style={{ margin: '6px 0' }}>📱 Phone: +686 75 000 00</p>
        <p style={{ margin: '6px 0' }}>🕐 Office Hours: Mon–Fri 8:00 am – 5:00 pm (Kiribati time)</p>
      </div>

      <h3 style={{ color: 'var(--text-primary)' }}>❓ Frequently Asked Questions</h3>
      {FAQS.map((faq, i) => (
        <details
          key={i}
          style={{
            marginBottom: 12,
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <summary style={{
            padding: '12px 16px',
            fontWeight: 700,
            cursor: 'pointer',
            color: 'var(--text-primary)',
            background: 'var(--surface)',
            listStyle: 'none',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            {faq.q}
            <span style={{ fontWeight: 400, flexShrink: 0, marginLeft: 8 }}>▾</span>
          </summary>
          <p style={{
            padding: '10px 16px 14px',
            margin: 0,
            background: 'var(--input-bg)',
            color: 'var(--text)',
            lineHeight: 1.6,
          }}>
            {faq.a}
          </p>
        </details>
      ))}

      <div style={{ marginTop: 30, textAlign: 'center' }}>
        <a
          href="mailto:support@kcdl.com.ki"
          style={{
            display: 'inline-block',
            padding: '12px 28px',
            background: 'var(--primary)',
            color: 'white',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Contact Support
        </a>
      </div>
    </section>
  );
}
