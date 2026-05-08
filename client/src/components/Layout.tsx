import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
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
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncToken = () => setHasAdminToken(Boolean(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)));
    syncToken();
    window.addEventListener('focus', syncToken);
    return () => window.removeEventListener('focus', syncToken);
  }, []);

  // Close bottom sheet on click outside
  useEffect(() => {
    if (!showSettingsSheet) return;
    const handleClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setShowSettingsSheet(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSettingsSheet]);

  // Lock body scroll when settings sheet is open (mobile-safe)
  useEffect(() => {
    if (showSettingsSheet) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [showSettingsSheet]);

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

            {/* Desktop: inline controls */}
            <div className="text-settings-control desktop-only">
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
              className="icon-btn desktop-only"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Chế độ tối' : 'Chế độ sáng'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            {/* Mobile: single settings icon → bottom sheet */}
            <button
              className="icon-btn mobile-only"
              onClick={() => setShowSettingsSheet(true)}
              title="Cài đặt"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Settings Bottom Sheet (mobile) */}
      {showSettingsSheet && (
        <div className="settings-sheet-overlay" onClick={() => setShowSettingsSheet(false)}>
          <div
            className="settings-sheet"
            ref={sheetRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-sheet-handle" />
            <h3 className="settings-sheet-title">Cài đặt</h3>

            <div className="settings-sheet-row">
              <span>Giao diện</span>
              <div className="settings-sheet-toggle">
                <button
                  className={`settings-toggle-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => { if (theme !== 'light') toggleTheme(); }}
                >☀️</button>
                <button
                  className={`settings-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => { if (theme !== 'dark') toggleTheme(); }}
                >🌙</button>
              </div>
            </div>

            <div className="settings-sheet-row">
              <span>Cỡ chữ</span>
              <button className="settings-sheet-cycle" onClick={cycleFontSize}>
                {fontSize}px
              </button>
            </div>

            <div className="settings-sheet-section">
              <div className="settings-sheet-label">Font chữ</div>
              <div className="settings-sheet-fonts">
                {fontOptions.map((option) => (
                  <button
                    key={option.key}
                    className={`settings-sheet-font ${fontFamily === option.key ? 'active' : ''}`}
                    onClick={() => {
                      setFontFamily(option.key);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="settings-sheet-close"
              onClick={() => setShowSettingsSheet(false)}
            >
              Xong
            </button>
          </div>
        </div>
      )}

      <main className={shellClassName}>
        <Outlet />
      </main>
    </>
  );
}
