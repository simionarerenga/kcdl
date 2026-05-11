// src/App.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { requestNotificationPermission, scheduleWarehouseReminders, notifyBagDelivery } from './utils/notifications';
import { storageGet, storageSet } from './utils/storage';
import { startSyncManager } from './utils/syncManager';
import TopBar from './components/TopBar';
import LoginScreen from './sections/LoginScreen';
import HomeScreen from './sections/HomeScreen';
import CPRSection from './sections/CPRSection';
import TWCSection from './sections/TWCSection';
import FarmersSection from './sections/FarmersSection';
import BagsHubSection from './sections/BagsHubSection';
import ShedStockSection from './sections/ShedStockSection';
import WarehouseSection from './sections/WarehouseSection';
import ShipmentSection from './sections/ShipmentSection';
import DailySummarySection from './sections/DailySummarySection';
import SettingsSection from './sections/SettingsSection';
import HelpSection from './sections/HelpSection';

const SECTIONS = {
  home:      HomeScreen,
  cpr:       CPRSection,
  twc:       TWCSection,
  farmers:   FarmersSection,
  bags_hub:  BagsHubSection,
  shed:      ShedStockSection,
  warehouse: WarehouseSection,
  shipment:  ShipmentSection,
  summary:   DailySummarySection,
  settings:  SettingsSection,
  help:      HelpSection,
};

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('appSettings')) || {}; }
  catch { return {}; }
}

/* ── Not-provisioned screen ─────────────────────────────────────────────── */
function NotProvisionedScreen({ email, onSignOut }) {
  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <img src="./img/icon_bg.png" alt="KCDL" className="login-logo" />

        <div style={{ fontSize: '2.5rem', margin: '8px 0' }}>🔒</div>

        <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem', color: '#1a1a1a' }}>
          Account Not Provisioned
        </h2>

        <p style={{ fontSize: '0.88rem', color: '#555', lineHeight: 1.6, margin: '0 0 20px' }}>
          Your account (<strong>{email}</strong>) has not been set up yet.
          Station profiles, islands, cooperatives and villages are managed
          exclusively by <strong>HQ Tarawa</strong>.
        </p>

        <div style={{
          background: '#f0f8fa', borderRadius: 10, padding: '14px 16px',
          borderLeft: '3px solid #007c91', textAlign: 'left', marginBottom: 24
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#007c91', marginBottom: 6 }}>
            What to do
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.83rem',
            color: '#444', lineHeight: 1.8 }}>
            <li>Contact HQ Tarawa Admin</li>
            <li>Provide your registered email address</li>
            <li>HQ will provision your station account</li>
            <li>Sign out and sign back in once notified</li>
          </ol>
        </div>

        <button className="btn-primary" style={{ width: '100%' }}
          onClick={onSignOut} type="button">
          Sign Out
        </button>
      </div>
    </div>
  );
}

/* ── Main App ───────────────────────────────────────────────────────────── */
export default function App() {
  const [user, setUser]               = useState(undefined);
  const [userProfile, setUserProfile] = useState(null);
  const [authError, setAuthError]     = useState('');
  const [notProvisioned, setNotProvisioned] = useState(false);
  const [currentSection, setCurrentSection] = useState('home');
  const [menuOpen, setMenuOpen]       = useState(false);
  const [settings, setSettings]       = useState(loadSettings);

  // On native Android, also hydrate from Capacitor Preferences (storageGet is async)
  useEffect(() => {
    storageGet('appSettings').then(v => {
      if (v) try { setSettings(JSON.parse(v)); } catch {}
    });
  }, []);

  // Start offline write queue — flushes queued Firebase writes whenever online
  useEffect(() => startSyncManager(db), []);
  const [showExitModal, setShowExitModal] = useState(false);

  const navHistoryRef    = useRef([]);
  const showExitModalRef = useRef(false);

  useEffect(() => { showExitModalRef.current = showExitModal; }, [showExitModal]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthError('');
      setNotProvisioned(false);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const profile = snap.data();
            setUserProfile(profile);
            setUser({ ...firebaseUser, stationId: profile.stationId });
            // Request notification permission on login
            requestNotificationPermission().catch(() => {});
          } else {
            // Account exists in Firebase Auth but has no profile in Firestore —
            // it has not been provisioned by HQ Admin yet.
            setUser(firebaseUser);
            setNotProvisioned(true);
          }
        } catch (e) {
          console.error('[App] Firestore getDoc failed after auth:', e.code, e.message);
          setAuthError(`Signed in but could not load your profile (${e.code || e.message}).`);
          setUser(firebaseUser);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setNotProvisioned(false);
      }
    });
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark-mode', !!settings.darkMode);
    document.documentElement.style.setProperty('--font-size', `${settings.fontSize || 16}px`);
  }, [settings]);

  // Android hardware back button
  useEffect(() => {
    window.history.pushState({ kcdl: true }, '');
    const handlePop = () => {
      window.history.pushState({ kcdl: true }, '');
      if (showExitModalRef.current) { setShowExitModal(false); return; }
      const history = navHistoryRef.current;
      if (history.length > 0) {
        const prev = history[history.length - 1];
        navHistoryRef.current = history.slice(0, -1);
        setCurrentSection(prev);
      } else {
        setShowExitModal(true);
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    let cleanup = null;
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('backButton', () => {
        if (showExitModalRef.current) { setShowExitModal(false); return; }
        const history = navHistoryRef.current;
        if (history.length > 0) {
          const prev = history[history.length - 1];
          navHistoryRef.current = history.slice(0, -1);
          setCurrentSection(prev);
        } else {
          setShowExitModal(true);
        }
      }).then(handle => { cleanup = () => handle.remove(); });
    }).catch(() => {});
    return () => { if (cleanup) cleanup(); };
  }, []);

  // ── Schedule warehouse reminder notifications ─────────────────────────────
  useEffect(() => {
    if (!userProfile) return;
    const stId = userProfile.stationId;
    if (!stId) return;

    // Two separate top-level subscriptions — avoids nested onSnapshot leak
    let _recentCount = 0;
    let _unstakedKg  = 0;

    const u1 = onSnapshot(
      query(collection(db,'shedStock'), where('stationId','==',stId), where('status','==','recently_weighed')),
      snap => {
        _recentCount = snap.size;
        scheduleWarehouseReminders({ recentlyWeighedCount: _recentCount, unstakedKg: _unstakedKg }).catch(()=>{});
      }
    );

    const u3 = onSnapshot(
      query(collection(db,'shedStock'), where('stationId','==',stId), where('status','==','in_shed')),
      snap => {
        _unstakedKg = snap.docs
          .filter(d => d.data().type==='unstacked_batch' || d.data().notes==='Unstacked batch')
          .reduce((s,d) => s + (d.data().stationWeight||0), 0);
        scheduleWarehouseReminders({ recentlyWeighedCount: _recentCount, unstakedKg: _unstakedKg }).catch(()=>{});
      }
    );

    // Listen for new bag deliveries from HQ and notify
    const u2 = onSnapshot(
      query(collection(db,'bagDeliveries'), where('stationId','==',stId), where('confirmed','==',false)),
      snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d = change.doc.data();
            notifyBagDelivery({ count:(d.bags||[]).length, stationName:userProfile.stationName }).catch(()=>{});
          }
        });
      }
    );

    return () => { u1(); u2(); u3(); };
  }, [userProfile]);

  const navigate = useCallback((section) => {
    setCurrentSection(prev => {
      if (section === 'home') { navHistoryRef.current = []; }
      else if (section !== prev) { navHistoryRef.current = [...navHistoryRef.current, prev]; }
      return section;
    });
    setMenuOpen(false);
  }, []);

  const updateSettings = useCallback((newSettings) => {
    setSettings(prev => {
      const merged = { ...prev, ...newSettings };
      localStorage.setItem('appSettings', JSON.stringify(merged)); // web/Electron
      storageSet('appSettings', JSON.stringify(merged));            // native (Capacitor Preferences)
      return merged;
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    setCurrentSection('home');
    navHistoryRef.current = [];
    setMenuOpen(false);
    setUserProfile(null);
    setAuthError('');
    setNotProvisioned(false);
  }, []);

  /* ── Render gates ── */
  if (user === undefined) {
    return (
      <div className="splash-screen">
        <img src="./img/icon_bg.png" alt="KCDL" className="splash-logo" />
        <p className="splash-text">Loading…</p>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (notProvisioned) {
    return <NotProvisionedScreen email={user.email} onSignOut={handleSignOut} />;
  }

  const SectionComponent = SECTIONS[currentSection] || HomeScreen;

  return (
    <div>
      {authError && (
        <div className="auth-notice">
          ⚠️ Profile could not be loaded — some features may be limited.
        </div>
      )}
      <TopBar
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen(o => !o)}
        onNavigate={navigate}
        onClose={() => setMenuOpen(false)}
        onSignOut={handleSignOut}
        userEmail={user.email}
        stationName={userProfile?.stationName}
      />
      <div className="container">
        <SectionComponent
          onNavigate={navigate}
          settings={settings}
          onUpdateSettings={updateSettings}
          user={{ ...user, stationId: userProfile?.stationId || user.uid }}
          userProfile={userProfile}
        />
      </div>

      {showExitModal && (
        <div className="overlay" onClick={() => setShowExitModal(false)}>
          <div className="overlay-card exit-modal" onClick={e => e.stopPropagation()}>
            <div className="exit-modal-icon">🚪</div>
            <p className="exit-modal-text">
              Do you want to exit <strong>KCDL Inspector</strong>?
            </p>
            <div className="overlay-actions" style={{ flexDirection: 'row', gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} type="button"
                onClick={() => setShowExitModal(false)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 1 }} type="button"
                onClick={() => {
                  setShowExitModal(false);
                  import('@capacitor/app')
                    .then(({ App: CapApp }) => CapApp.exitApp())
                    .catch(() => window.close());
                }}>Exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
