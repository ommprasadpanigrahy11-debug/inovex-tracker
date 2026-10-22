/**
 * Inovex Theme Controller (Light, Dark, System)
 */
export function getSavedTheme() {
  try {
    return localStorage.getItem('inovex_theme') || 'system';
  } catch (e) {
    return 'system';
  }
}

export function applyTheme(theme) {
  const chosen = theme || getSavedTheme();
  const root = document.documentElement;

  if (chosen === 'system') {
    const isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', chosen);
  }

  try {
    localStorage.setItem('inovex_theme', chosen);
  } catch (e) {}

  return chosen;
}

export function initThemeListener(onThemeChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e) => {
    const currentSaved = getSavedTheme();
    if (currentSaved === 'system') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      if (onThemeChange) onThemeChange('system');
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handler);
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(handler);
  }

  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', handler);
    } else if (mediaQuery.removeListener) {
      mediaQuery.removeListener(handler);
    }
  };
}
