import { useState, useEffect, useCallback } from 'react';

export function useFetch<T>(fetcher: () => Promise<{ data: T }>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

export function useFetchRaw<T>(fetcher: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

const FONT_OPTIONS = [
  {
    key: 'noto-sans',
    label: 'Noto Sans',
    stack: "'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    key: 'inter',
    label: 'Inter',
    stack: "'Inter', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    key: 'open-sans',
    label: 'Open Sans',
    stack: "'Open Sans', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    key: 'roboto',
    label: 'Roboto',
    stack: "'Roboto', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    key: 'source-sans-3',
    label: 'Source Sans 3',
    stack: "'Source Sans 3', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    key: 'google-sans',
    label: 'Google Sans',
    stack: "'Google Sans', 'Product Sans', 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    key: 'system',
    label: 'System',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', sans-serif",
  },
] as const;

type FontFamilyKey = typeof FONT_OPTIONS[number]['key'];

function getFontOption(key: string | null) {
  return FONT_OPTIONS.find((option) => option.key === key) || FONT_OPTIONS[0];
}

export function useSettings() {
  const FONT_SIZES = [12, 14, 16, 18, 20] as const;
  const DEFAULT_FONT_SIZE = 16;

  const [fontSize, setFontSize] = useState(() =>
    parseInt(localStorage.getItem('font_size') || String(DEFAULT_FONT_SIZE))
  );
  const [fontDir, setFontDir] = useState<1 | -1>(() => {
    const saved = localStorage.getItem('font_dir');
    return saved === '-1' ? -1 : 1;
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [fontFamily, setFontFamilyState] = useState<FontFamilyKey>(() =>
    getFontOption(localStorage.getItem('font_family')).key
  );

  const updateFontFamily = (key: FontFamilyKey) => {
    const option = getFontOption(key);
    setFontFamilyState(option.key);
    localStorage.setItem('font_family', option.key);
    document.documentElement.style.setProperty('--font-body', option.stack);
    document.documentElement.style.setProperty('--font-heading', option.stack);
  };

  const updateFontSize = (size: number) => {
    setFontSize(size);
    localStorage.setItem('font_size', String(size));
    document.documentElement.style.setProperty('--font-size', `${size}px`);
  };

  /** Ping-pong cycle: 16→18→20→18→16→14→12→14→16… */
  const cycleFontSize = () => {
    const idx = FONT_SIZES.indexOf(fontSize as typeof FONT_SIZES[number]);
    const currentIdx = idx >= 0 ? idx : FONT_SIZES.indexOf(DEFAULT_FONT_SIZE);
    let nextDir = fontDir;

    // Reverse direction at boundaries
    if (currentIdx >= FONT_SIZES.length - 1 && fontDir === 1) nextDir = -1;
    if (currentIdx <= 0 && fontDir === -1) nextDir = 1;

    const nextIdx = currentIdx + nextDir;
    const nextSize = FONT_SIZES[Math.max(0, Math.min(nextIdx, FONT_SIZES.length - 1))];

    setFontDir(nextDir);
    localStorage.setItem('font_dir', String(nextDir));
    updateFontSize(nextSize);
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
    document.documentElement.setAttribute('data-theme', theme);
    updateFontFamily(fontFamily);
  }, []);

  return {
    fontSize,
    setFontSize: updateFontSize,
    cycleFontSize,
    theme,
    toggleTheme,
    fontFamily,
    fontOptions: FONT_OPTIONS,
    setFontFamily: updateFontFamily,
  };
}
