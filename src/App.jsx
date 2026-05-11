// src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { AppDataProvider } from './context/AppDataContext';

import TopBar               from './components/TopBar';
import LoginScreen          from './sections/LoginScreen';
import Dashboard            from './sections/Dashboard';
import LiveActivity         from './sections/LiveActivity';
import CPRMonitor           from './sections/CPRMonitor';
import TWCMonitor           from './sections/TWCMonitor';
import ShedWarehouseMonitor from './sections/ShedWarehouseMonitor';
import ShipmentsMonitor     from './sections/ShipmentsMonitor';
import FarmersMonitor       from './sections/FarmersMonitor';
import ReportsCentre        from './sections/ReportsCentre';
import Analytics            from './sections/Analytics';
import IslandsManager       from './sections/IslandsManager';
import VillagesManager      from './sections/VillagesManager';
import CooperativesManager  from './sections/CooperativesManager';
import UserManagement       from './sections/UserManagement';
import AuditLog             from './sections/AuditLog';
import SettingsSection      from './sections/SettingsSection';

export const SECTIONS = [
  {
    group: 'Overview',
    items: [
      { id: 'dashboard', icon: '📊', label: 'Dashboard',     desc: 'Live KPIs, island weights & recent activity' },
      { id: 'activity',  icon: '⚡', label: 'Live Activity', desc: 'Real-time feed of all operations' },
    ],
  },
  {
    group: 'Field Data',
    items: [
      { id: 'cpr',       icon: '📋', label: 'CPR Records',       desc: 'Copra Purchase Records — search & export' },
      { id: 'twc',       icon: '🚢', label: 'TWC Records',       desc: 'Transport Weighing Certificates' },
      { id: 'shedstock', icon: '🛍️', label: 'Shed & Warehouse',  desc: 'Bag inventory by stage and station' },
      { id: 'shipments', icon: '🛳️', label: 'Shipments',         desc: 'Ready-to-ship & shipped bag manifests' },
      { id: 'farmers',   icon: '👩‍🌾', label: 'Farmers Registry', desc: 'Registered farmer profiles & search' },
    ],
  },
  {
    group: 'Reports',
    items: [
      { id: 'reports',   icon: '📑', label: 'Reports Centre', desc: 'Generate, preview & print all reports' },
      { id: 'analytics', icon: '📈', label: 'Analytics',      desc: 'Charts & production trend breakdowns' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { id: 'islands',       icon: '🏝️', label: 'Islands',        desc: 'Outer island registry & details' },
      { id: 'villages',      icon: '🏭', label: 'Warehouses',     desc: 'Warehouse registry per island' },
      { id: 'cooperatives',  icon: '🤝', label: 'Cooperatives',   desc: 'Cooperative registry per island' },
      { id: 'users',       icon: '👤', label: 'User Management', desc: 'Inspector accounts & access roles' },
      { id: 'audit_log',   icon: '📋', label: 'Audit Log',        desc: 'History of all admin actions' },
      { id: 'settings',    icon: '⚙️', label: 'Settings',         desc: 'System info, pricing & account details' },
    ],
  },
];

const SECTION_MAP = {
  dashboard: Dashboard,
  activity:  LiveActivity,
  cpr:       CPRMonitor,
  twc:       TWCMonitor,
  shedstock: ShedWarehouseMonitor,
  shipments: ShipmentsMonitor,
  farmers:   FarmersMonitor,
  reports:   ReportsCentre,
  analytics: Analytics,
  islands:       IslandsManager,
  villages:      VillagesManager,
  cooperatives:  CooperativesManager,
  users:         UserManagement,
  audit_log:     AuditLog,
  settings:      SettingsSection,
};

export const SECTION_LABEL = {};
SECTIONS.forEach(g => g.items.forEach(i => {
  SECTION_LABEL[i.id] = { label: i.label, icon: i.icon };
}));

/* ── Exit Confirm Modal ── */
function ExitModal({ onStay, onExit }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 999 }}>
      <div className="modal-box" style={{ maxWidth: 320, textAlign: 'center' }}>
        <div className="modal-body" style={{ padding: '32px 24px 24px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👋</div>
          <div className="modal-title" style={{ marginBottom: 10, fontSize: '1.1rem' }}>
            Exit KCDL Admin?
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            Are you sure you want to close the app?
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }} onClick={onStay}>
              Stay
            </button>
            <button type="button" className="btn btn-danger"
              style={{ flex: 1, justifyContent: 'center' }} onClick={onExit}>
              Exit App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sign Out Confirm Modal ── */
function SignOutModal({ onCancel, onConfirm }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 999 }}>
      <div className="modal-box" style={{ maxWidth: 320, textAlign: 'center' }}>
        <div className="modal-body" style={{ padding: '32px 24px 24px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔐</div>
          <div className="modal-title" style={{ marginBottom: 10, fontSize: '1.1rem' }}>
            Sign Out?
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            Are you sure you want to sign out of KCDL Admin?
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger"
              style={{ flex: 1, justifyContent: 'center' }} onClick={onConfirm}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Access Denied ── */
function AccessDenied({ email, onSignOut }) {
  return (
    <div className="login-page">
      <div className="login-bg-circle login-bg-circle-1" />
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔒</div>
        <div className="login-title" style={{ fontSize: '1.3rem' }}>Access Denied</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '12px 0 24px' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> does not have admin access.
          Contact your HQ administrator.
        </p>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
          onClick={onSignOut} type="button">
          Sign Out
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Main App
═══════════════════════════════════════ */
export default function App() {
  const [user,         setUser]         = useState(undefined);
  const [profile,      setProfile]      = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [section,      setSection]      = useState('dashboard'); // always starts at dashboard
  const [authError,    setAuthError]    = useState('');
  const [showExit,     setShowExit]     = useState(false);
  const [showSignOut,  setShowSignOut]  = useState(false);
  const [reportInit,   setReportInit]   = useState(null);

  // Ref so back-button handler always sees latest section
  const sectionRef = useRef(section);
  useEffect(() => { sectionRef.current = section; }, [section]);

  // Dashboard registers a "close detail" callback here
  const dashBackRef = useRef(null);

  // Reports Centre registers a "go back to list" callback here
  const reportsBackRef   = useRef(null);
  // Analytics registers a "go back to list" callback here
  const analyticsBackRef = useRef(null);

  /* ── Auth listener ── */
  useEffect(() => {
    return onAuthStateChanged(auth, async firebaseUser => {
      setAuthError('');
      setAccessDenied(false);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const p = snap.data();
            if (p.role === 'admin' || p.role === 'hq' || !p.role) {
              setProfile(p); setUser(firebaseUser);
              setSection('dashboard');
            } else {
              setUser(firebaseUser); setAccessDenied(true);
            }
          } else {
            setProfile(null); setUser(firebaseUser);
            setSection('dashboard');
          }
        } catch (e) {
          setAuthError(e.message); setUser(firebaseUser);
        }
      } else {
        setUser(null); setProfile(null); setAccessDenied(false);
      }
    });
  }, []);

  /* ── Back button handler ── */
  useEffect(() => {
    let removeListener = null;

    async function setupBackButton() {
      function handleBack() {
        const cur = sectionRef.current;

        if (cur === 'analytics') {
          if (analyticsBackRef.current) {
            analyticsBackRef.current();
            analyticsBackRef.current = null;
          } else {
            setSection('dashboard');
          }
          return;
        }

        if (cur === 'reports') {
          // If detail view is open inside Reports Centre, close it first
          if (reportsBackRef.current) {
            reportsBackRef.current();
            reportsBackRef.current = null;
          } else {
            // Reports Centre list → go to Dashboard
            setSection('dashboard');
          }
          return;
        }

        if (cur === 'dashboard') {
          // If a Dashboard detail card is open, close it first
          if (dashBackRef.current) {
            dashBackRef.current();
            dashBackRef.current = null;
          } else {
            // Dashboard main view → show exit confirm
            setShowExit(true);
          }
          return;
        }

        // Any other section → back to Dashboard
        setSection('dashboard');
      }

      try {
        const { App: CapApp } = await import('@capacitor/app');
        const handle = await CapApp.addListener('backButton', handleBack);
        removeListener = () => handle.remove();
      } catch {
        // Web/dev fallback — popstate
        const onPop = () => handleBack();
        window.history.pushState(null, '', window.location.href);
        window.addEventListener('popstate', onPop);
        removeListener = () => window.removeEventListener('popstate', onPop);
      }
    }

    setupBackButton();
    return () => { if (removeListener) removeListener(); };
  }, []);

  /* ── Push history entry on section change ── */
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
  }, [section]);

  async function handleSignOut() {
    await signOut(auth);
    setSection('dashboard');
    setProfile(null);
    setAccessDenied(false);
    setShowSignOut(false);
  }

  function navigate(id, reportId) {
    if (id === 'dashboard' && dashBackRef.current) {
      dashBackRef.current();
      dashBackRef.current = null;
    }
    if (id === 'reports' && reportId) {
      setReportInit(reportId);
    } else if (id !== 'reports') {
      setReportInit(null);
    }
    setSection(id || 'dashboard');
  }

  function handleExitApp() {
    try {
      import('@capacitor/app').then(({ App: CapApp }) => CapApp.exitApp());
    } catch {
      window.close();
    }
  }

  /* ── Render gates ── */
  if (user === undefined) {
    return (
      <div className="splash-screen">
        <img src="./icon_bg.png" alt="KCDL" className="splash-logo"
          onError={e => { e.target.style.display = 'none'; }} />
        <p className="splash-text">KCDL Admin · Loading…</p>
      </div>
    );
  }

  if (!user)        return <LoginScreen />;
  if (accessDenied) return <AccessDenied email={user.email} onSignOut={handleSignOut} />;

  const SectionComp = SECTION_MAP[section] || Dashboard;
  const sectionMeta = SECTION_LABEL[section] || null;

  return (
    <AppDataProvider>
    <div className="app-shell">
      {showExit && (
        <ExitModal
          onStay={() => setShowExit(false)}
          onExit={handleExitApp}
        />
      )}

      {showSignOut && (
        <SignOutModal
          onCancel={() => setShowSignOut(false)}
          onConfirm={handleSignOut}
        />
      )}

      <TopBar
        sectionMeta={sectionMeta}
        onGoHome={() => navigate('dashboard')}
        onNavigate={navigate}
        onSignOut={() => setShowSignOut(true)}
        email={user.email}
      />

      {authError && (
        <div className="flash-bar flash-warn" style={{ margin: '0 5px', borderRadius: 6 }}>
          ⚠️ Profile load error — some features may be limited: {authError}
        </div>
      )}

      <div className="page-body">
        <SectionComp
          onNavigate={navigate}
          user={user}
          currentUser={user}
          profile={profile}
          dashBackRef={section === 'dashboard' ? dashBackRef : undefined}
          initialReport={section === 'reports' ? reportInit : undefined}
          reportsBackRef={section === 'reports'   ? reportsBackRef   : undefined}
          analyticsBackRef={section === 'analytics' ? analyticsBackRef : undefined}
        />
      </div>
    </div>
    </AppDataProvider>
  );
}
