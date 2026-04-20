// src/components/TopBar.jsx
import { useEffect, useRef, useState } from 'react';

const NAV_ITEMS = [
  { id: 'home',      label: '🏠 Home' },
  { id: 'shed',      label: '⚖️ Weigh Copra' },
  { id: 'warehouse', label: '🏚️ Warehouse' },
  { id: 'bags_hub',  label: '📦 Bags & Stock' },
  { id: 'farmers',   label: '👩‍🌾 Farmers Registry' },
  { id: 'summary',   label: '📊 Daily Summary' },
  { id: 'shipment',  label: '🚢 Shipments' },
  { id: 'help',      label: '❓ Help' },
  { id: 'settings',  label: '⚙️ Settings' },
];

export default function TopBar({ menuOpen, onToggleMenu, onNavigate, onClose, onSignOut, userEmail, stationName }) {
  const menuRef = useRef(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen, onClose]);

  return (
    <div className="topbar" ref={menuRef}>
      <button
        className={`hamburger${menuOpen ? ' active' : ''}`}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <span /><span /><span />
      </button>

      <div className="topbar-center">
        <div className="topbar-title">COPRA INSPECTOR</div>
        {stationName && <div className="topbar-station">{stationName}</div>}
      </div>

      <div className={`sync-dot ${online ? 'sync-online' : 'sync-offline'}`}
        title={online ? 'Online — synced' : 'Offline — will sync when connected'} />

      <nav className={`dropdown-menu${menuOpen ? ' show' : ''}`} aria-hidden={!menuOpen}>
        {NAV_ITEMS.map(item => (
          <a key={item.id} href="#"
            onClick={e => { e.preventDefault(); onNavigate(item.id); }}>
            {item.label}
          </a>
        ))}
        {userEmail && (
          <>
            <div className="dropdown-user">{userEmail}</div>
            <a href="#" className="dropdown-signout"
              onClick={e => { e.preventDefault(); onSignOut(); }}>
              🚪 Sign Out
            </a>
          </>
        )}
      </nav>
    </div>
  );
}
