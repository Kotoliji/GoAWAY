import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import LoginPage from './pages/LoginPage';

// pages load on demand (recharts / leaflet only where they are used)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LiveMapPage = lazy(() => import('./pages/LiveMapPage'));
const RidesPage = lazy(() => import('./pages/RidesPage'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const PayoutsPage = lazy(() => import('./pages/PayoutsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/live', label: 'Live map' },
  { to: '/rides', label: 'Rides' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/payouts', label: 'Payouts' },
  { to: '/reports', label: 'Reports' },
];

export default function App() {
  const { user, loading, signOut } = useAuth();

  if (loading) return null;
  if (!user) return <LoginPage />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">TVDEPT <span>Admin</span></div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>{user.email}</div>
          <button className="btn ghost small" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Suspense fallback={<p className="note">Loading…</p>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/live" element={<LiveMapPage />} />
            <Route path="/rides" element={<RidesPage />} />
            <Route path="/drivers" element={<DriversPage />} />
            <Route path="/payouts" element={<PayoutsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
