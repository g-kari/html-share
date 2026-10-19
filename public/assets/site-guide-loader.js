// Progressive enhancement: no React/Motion download until a guide is used.
export function installGuide(fallback, host, load = () => import('./site-guide-v1.js')) {
  if (!fallback || !host) return;
  let pending = false;
  async function enhance() {
    if (pending || fallback.dataset.enhanced) return;
    pending = true;
    try { const module = await load(); module.mountGuide(fallback, host); }
    catch { /* Native details remain usable. A later interaction can retry. */ }
    finally { pending = false; }
  }
  fallback.addEventListener('toggle', enhance, true);
}
if (typeof document !== 'undefined') installGuide(document.getElementById('site-guide-fallback'), document.getElementById('site-guide-enhanced'));
