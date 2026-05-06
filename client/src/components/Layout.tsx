import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSettings } from '../hooks/useApi';
import { usesFluidShell } from './layoutShell';

const ADMIN_TOKEN_STORAGE_KEY = 'admin_token';

export function Layout() {
  const { fontSize, cycleFontSize, theme, toggleTheme, fontFamily, fontOptions, setFontFamily } = useSettings();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isSources = location.pathname.startsWith('/sources');
  const shellClassName = usesFluidShell(location.pathname) ? 'container-fluid' : 'container';
  const [hasAdminToken, setHasAdminToken] = useState(false);
  const [showTextMenu, setShowTextMenu] = useState(false);

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
        <div className={`${shellClassName} header-inner`}>
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
            <div className="text-settings-control">
              <button
                className="font-size-btn"
                onClick={() => setShowTextMenu((value) => !value)}
                title={`Cỡ chữ: ${fontSize}px · Font chữ`}
                aria-expanded={showTextMenu}
                aria-haspopup="menu"
              >
                <span className="font-size-btn-label">Aa</span>
                <span className="font-size-btn-value">{fontSize}</span>
              </button>
              {showTextMenu && (
                <div className="text-settings-menu" role="menu">
                  <button className="text-settings-size" onClick={cycleFontSize} type="button">
                    <span>Cỡ chữ</span>
                    <strong>{fontSize}px</strong>
                  </button>
                  <div className="text-settings-label">Font chữ</div>
                  {fontOptions.map((option) => (
                    <button
                      key={option.key}
                      className={`text-settings-option ${fontFamily === option.key ? 'active' : ''}`}
                      onClick={() => {
                        setFontFamily(option.key);
                        setShowTextMenu(false);
                      }}
                      type="button"
                      role="menuitem"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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

      <main className={shellClassName}>
        <Outlet />
      </main>
    </>
  );
}
