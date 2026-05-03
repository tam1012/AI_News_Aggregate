import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSettings } from '../hooks/useApi';

const ADMIN_TOKEN_STORAGE_KEY = 'admin_token';

export function Layout() {
  const { theme, toggleTheme } = useSettings();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isSources = location.pathname.startsWith('/sources');
  const [hasAdminToken, setHasAdminToken] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncToken = () => setHasAdminToken(Boolean(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)));
    syncToken();
    window.addEventListener('focus', syncToken);
    return () => window.removeEventListener('focus', syncToken);
  }, []);

  const showAdminLinks = hasAdminToken || isAdmin || isSources;

  const todayStr = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return (
    <>
      <header className="header">
        <div className={(location.pathname === '/' || location.pathname.startsWith('/admin') || location.pathname.startsWith('/sources') ? 'container-fluid' : 'container') + ' header-inner'}>
          <div className="header-left">
            <NavLink to="/" className="header-logo">SynthNews</NavLink>
            <span className="header-date">{todayStr}</span>
          </div>
          <div className="header-actions">
            {showAdminLinks && (
              <NavLink
                to="/sources"
                className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                title="Quản lý nguồn tin"
              >
                🔗
              </NavLink>
            )}
            {showAdminLinks && (isAdmin ? (
              <NavLink to="/" className="icon-btn" title="Trang chủ">📰</NavLink>
            ) : (
              <NavLink
                to="/admin"
                className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                title="Quản trị"
              >
                ⚙️
              </NavLink>
            ))}
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Chế độ tối' : 'Chế độ sáng'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </header>

      <main className={location.pathname === '/' || location.pathname.startsWith('/admin') || location.pathname.startsWith('/sources') ? 'container-fluid' : 'container'}>
        <Outlet />
      </main>
    </>
  );
}
