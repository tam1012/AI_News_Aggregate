import { NavLink, useLocation } from 'react-router-dom';

export function MobileBottomNav() {
  const location = useLocation();
  const path = location.pathname;

  const tabs = [
    { label: 'Tin mới', href: '/' },
    { label: 'VOZ', href: '/voz' },
    { label: 'Reddit', href: '/reddit' },
    { label: 'Bản tin', href: '/digest' },
    { label: 'Admin', href: '/admin' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return path === '/' || path.startsWith('/article');
    return path === href;
  };

  return (
    <nav className="mobile-bottom-nav">
      {tabs.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={`mobile-bottom-item ${isActive(item.href) ? 'active' : ''}`}
        >
          <span className="mobile-bottom-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
