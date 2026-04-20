// src/sections/SettingsSection.jsx
import { useState } from 'react';

const LANGUAGES = [
  { value: 'en', label: '🇬🇧 English' },
  { value: 'ki', label: '🇰🇮 Kiribati (te Kiribati)' },
  { value: 'zh', label: '🇨🇳 中文 (Chinese)' },
];

function ProfileRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 14,
      borderBottom: '1px solid #f0f0f0', marginBottom: 14 }}>
      <div style={{ fontSize: '1.2rem', width: 26, flexShrink: 0, marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.71rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.5px', color: '#888', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '0.97rem', fontWeight: 600, color: '#1a1a1a' }}>
          {value || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Not set</span>}
        </div>
      </div>
    </div>
  );
}

export default function SettingsSection({ settings, onUpdateSettings, userProfile, user }) {
  const [msg, setMsg]               = useState('');
  const [showLangModal, setShowLangModal] = useState(false);

  const fontSize = settings.fontSize || 16;
  const darkMode = !!settings.darkMode;
  const language = settings.language || 'en';

  function apply(patch) {
    onUpdateSettings(patch);
    setMsg('✅ Settings saved.');
    setTimeout(() => setMsg(''), 2500);
  }

  function handleLanguageChange(value) {
    if (value === 'ki' || value === 'zh') { setShowLangModal(true); return; }
    apply({ language: value });
  }

  return (
    <section>
      <h2 className="section-title">⚙️ Settings</h2>

      {msg && <p className="section-msg">{msg}</p>}

      {/* ── MY PROFILE (read-only) ─────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.6px', color: '#888', marginBottom: 12 }}>My Profile</div>

        <div style={{ background: '#fff', borderRadius: 14,
          boxShadow: '0 2px 8px rgba(0,0,0,0.09)', overflow: 'hidden' }}>

          {/* Teal header strip */}
          <div style={{ background: 'linear-gradient(135deg,#007c91,#339bbf)',
            padding: '18px 18px 16px', color: '#fff' }}>
            <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
              {userProfile?.stationName || '—'}
            </div>
            <div style={{ fontSize: '0.82rem', opacity: 0.85, marginTop: 3 }}>
              {user?.email}
            </div>
          </div>

          {/* Info rows */}
          <div style={{ padding: '18px 18px 4px' }}>
            <ProfileRow icon="🏝️" label="Island"      value={userProfile?.island} />
            <ProfileRow icon="🤝" label="Cooperative" value={userProfile?.cooperative} />
            <ProfileRow icon="📍" label="Village"     value={userProfile?.village} />
            <ProfileRow icon="🪪" label="Role"        value={
              userProfile?.role
                ? userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)
                : undefined
            } />
            <ProfileRow icon="🆔" label="Station ID"  value={userProfile?.stationId} />
          </div>

          {/* HQ notice */}
          <div style={{ margin: '0 18px 18px', background: '#f0f8fa',
            borderRadius: 10, padding: '10px 14px',
            borderLeft: '3px solid #007c91' }}>
            <div style={{ fontSize: '0.78rem', color: '#007c91', fontWeight: 700, marginBottom: 3 }}>
              🔒 Managed by HQ Tarawa
            </div>
            <div style={{ fontSize: '0.76rem', color: '#555', lineHeight: 1.5 }}>
              Profile and station details can only be created or edited by the
              HQ Admin. Contact HQ Tarawa to update any of the above information.
            </div>
          </div>
        </div>
      </div>

      {/* ── DISPLAY PREFERENCES ───────────────────────────── */}
      <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.6px', color: '#888', marginBottom: 12 }}>Display Preferences</div>

      <div style={{ background: '#fff', borderRadius: 14, padding: '18px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.09)', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Language */}
        <div>
          <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#333',
            display: 'block', marginBottom: 8 }}>🌐 Language</label>
          <select value={language} onChange={e => handleLanguageChange(e.target.value)}
            style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 8,
              border: '1.5px solid #ddd', fontSize: '0.95rem', background: '#fafafa' }}>
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Font size */}
        <div>
          <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#333',
            display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>🔡 Font Size</span>
            <span style={{ color: '#007c91', fontWeight: 700 }}>{fontSize}px</span>
          </label>
          <input type="range" min={12} max={22} step={1} value={fontSize}
            onChange={e => apply({ fontSize: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#007c91' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: '0.72rem', color: '#aaa', marginTop: 4 }}>
            <span>Small</span><span>Large</span>
          </div>
        </div>

        {/* Dark mode */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#333' }}>🌙 Dark Mode</span>
          <div onClick={() => apply({ darkMode: !darkMode })}
            style={{
              width: 48, height: 26, borderRadius: 13, cursor: 'pointer', transition: 'background 0.2s',
              background: darkMode ? '#007c91' : '#ddd', position: 'relative', flexShrink: 0
            }}>
            <div style={{
              position: 'absolute', top: 3, left: darkMode ? 25 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
            }} />
          </div>
        </label>
      </div>

      {/* ── APP INFO ──────────────────────────────────────── */}
      <div style={{ marginTop: 28, textAlign: 'center', color: '#bbb', fontSize: '0.75rem' }}>
        <div style={{ fontWeight: 700, color: '#aaa', marginBottom: 4 }}>KCDL Inspector</div>
        <div>Kiribati Copra Development Ltd</div>
        <div style={{ marginTop: 4 }}>© {new Date().getFullYear()} · All rights reserved</div>
      </div>

      {/* Language unavailable modal */}
      {showLangModal && (
        <div className="overlay" onClick={() => { setShowLangModal(false); onUpdateSettings({ language: 'en' }); }}>
          <div className="overlay-card" onClick={e => e.stopPropagation()}
            style={{ textAlign: 'center', maxWidth: 300 }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🌐</div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 10px' }}>Coming Soon</h3>
            <p style={{ color: 'var(--text)', lineHeight: 1.6, marginBottom: 20 }}>
              This language is not yet available. The app will continue to use
              <strong> English</strong> until this translation is released.
            </p>
            <button className="btn-primary" style={{ width: '100%' }} type="button"
              onClick={() => { setShowLangModal(false); onUpdateSettings({ language: 'en' }); }}>
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
