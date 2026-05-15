import { NavLink } from 'react-router-dom';
import { useSettings } from '../hooks/useApi';

export function MobileTopNav() {
  const { fontSize, cycleFontSize, theme, toggleTheme } = useSettings();

  return (
    <header className="mobile-top-nav">
      <NavLink to="/" className="mobile-top-logo">
        SynthNews
      </NavLink>
      <div className="mobile-top-actions">
        <button className="mobile-top-btn" onClick={cycleFontSize} aria-label={`Cỡ chữ: ${fontSize}px`} title={`Cỡ chữ: ${fontSize}px`}>
          <span className="mobile-top-btn-text">Aa</span>
        </button>
        <button className="mobile-top-btn" onClick={toggleTheme} aria-label={theme === 'light' ? 'Chế độ tối' : 'Chế độ sáng'}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </header>
  );
}
