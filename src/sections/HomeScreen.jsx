// src/sections/HomeScreen.jsx
import { useEffect } from 'react';

// Clean 8-card dashboard — no stats strip
const CARDS = [
  { id: 'shed',      icon: '⚖️',  label: 'Weigh Copra',      desc: 'Record copra bags by weight' },
  { id: 'warehouse', icon: '🏚️', label: 'Warehouse',         desc: 'Records, bag search & unstacked' },
  { id: 'bags_hub',  icon: '📦', label: 'Bags & Stock',      desc: 'Issue bags & manage bag inventory' },
  { id: 'farmers',   icon: '👩‍🌾', label: 'Farmers Registry', desc: 'Manage registered farmers' },
  { id: 'summary',   icon: '📊', label: 'Daily Summary',     desc: "Today's report & stats" },
  { id: 'shipment',  icon: '🚢', label: 'Shipments',         desc: 'Dispatch bags to vessel' },
  { id: 'help',      icon: '❓', label: 'Help',              desc: 'User guide' },
  { id: 'settings',  icon: '⚙️',  label: 'Settings',         desc: 'Preferences & display options' },
];

export default function HomeScreen({ onNavigate, userProfile }) {
  // Lock body scroll so only the home content area scrolls internally when needed
  useEffect(() => {
    document.body.classList.add('home-active');
    return () => document.body.classList.remove('home-active');
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  return (
    <section id="homeScreen" className="home-screen-v2">
      <div className="home-v2-header">
        <div className="home-v2-greeting">{greeting}</div>
        <div className="home-v2-station">{userProfile?.stationName || 'Copra Inspector'}</div>
        <div className="home-v2-date">
          {new Date().toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </div>
      </div>

      <div className="dashboard-grid">
        {CARDS.map(card => (
          <button
            key={card.id}
            className="dashboard-card"
            onClick={() => onNavigate(card.id)}
            type="button"
          >
            <div className="dc-icon">{card.icon}</div>
            <div className="dc-label">{card.label}</div>
            <div className="dc-desc">{card.desc}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
