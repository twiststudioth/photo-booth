// Light/dark theme toggle
// The saved theme is applied by an inline script in <head> (before first paint) to avoid a flash

document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
  const root = document.documentElement;
  btn.setAttribute('aria-pressed', root.dataset.theme === 'dark');

  btn.addEventListener('click', () => {
    const dark = root.dataset.theme !== 'dark';
    if (dark) {
      root.dataset.theme = 'dark';
    } else {
      delete root.dataset.theme;
    }
    btn.setAttribute('aria-pressed', dark);

    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch (error) {
      // Storage unavailable - theme applies to this page only
    }

    // Keep keyboard shortcuts (Enter/Space) from re-toggling the focused button
    btn.blur();
  });
});
