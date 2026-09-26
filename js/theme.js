// Apply before styles load to avoid flashing the light theme on startup.
(() => {
  let theme = 'dark';
  try { if (localStorage.getItem('pdf-studio-theme') === 'light') theme = 'light'; } catch {}
  document.documentElement.dataset.theme = theme;
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    const update = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      button.textContent = dark ? '☀ ライトモード' : '☾ ダークモード';
      button.setAttribute('aria-label', dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え');
    };
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('pdf-studio-theme', next); } catch {}
      update();
    });
    update();
  });
})();
