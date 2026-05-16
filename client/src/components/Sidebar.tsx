import { NavLink, useLocation } from 'react-router-dom';
import { useSettings } from '../hooks/useApi';
import { useState } from 'react';

export function Sidebar() {
  const location = useLocation();
  const { fontSize, cycleFontSize, theme, toggleTheme } = useSettings();
  const path = location.pathname;
  const [showSettings, setShowSettings] = useState(false);

  const navItems = [
    { name: 'All News', href: '/', icon: '📰' },
    { name: 'VOZ', href: '/voz', icon: '📡' },
    { name: 'Reddit', href: '/reddit', icon: '💬' },
    { name: 'Bản tin', href: '/digest', icon: '📋' },
  ];

  const isNavActive = (href: string) => {
    if (href === '/') return path === '/' || path.startsWith('/article');
    if (href === '/voz') return path === '/voz';
    if (href === '/reddit') return path === '/reddit';
    if (href === '/digest') return path === '/digest';
    return path.startsWith(href);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <NavLink to="/" className="sidebar-logo">SynthNews</NavLink>
        <span className="sidebar-subtitle">Curated for you</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={`sidebar-nav-item ${isNavActive(item.href) ? 'active' : ''}`}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span className="sidebar-nav-label">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/sources" className={`sidebar-nav-item ${path.startsWith('/sources') ? 'active' : ''}`}>
          <span className="sidebar-nav-icon">📂</span>
          <span className="sidebar-nav-label">Nguồn tin</span>
        </NavLink>
        <NavLink to="/admin" className={`sidebar-nav-item ${path.startsWith('/admin') ? 'active' : ''}`}>
          <span className="sidebar-nav-icon">🛠️</span>
          <span className="sidebar-nav-label">Admin</span>
        </NavLink>
        <button className="sidebar-search-btn">
          <span>🔍</span>
          <span>Search</span>
        </button>
        <div className="sidebar-settings-group">
          <button
            className="sidebar-settings-btn"
            onClick={() => setShowSettings(!showSettings)}
          >
            <span>⚙️</span>
            <span>Settings</span>
          </button>
          {showSettings && (
            <div className="sidebar-settings-panel">
              <div className="sidebar-settings-row">
                <span>Cỡ chữ</span>
                <button className="sidebar-settings-cycle" onClick={cycleFontSize}>
                  {fontSize}px
                </button>
              </div>
              <div className="sidebar-settings-row">
                <span>Giao diện</span>
                <button className="sidebar-settings-cycle" onClick={toggleTheme}>
                  {theme === 'light' ? '🌙 Tối' : '☀️ Sáng'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
