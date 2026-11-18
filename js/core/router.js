// Tiny hash router (#/, #/play/:id, #/records). Hash routing works on
// GitHub Pages without any server config.

export function createRouter(routes, outlet) {
  let cleanup = null;
  let token = 0;

  function match(pattern, parts) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) return null;
    const params = {};
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (pp[i] !== parts[i]) return null;
    }
    return params;
  }

  async function resolve() {
    const path = location.hash.replace(/^#\/?/, '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    for (const route of routes) {
      const params = match(route.pattern, parts);
      if (!params) continue;
      const myToken = ++token;
      if (typeof cleanup === 'function') cleanup();
      cleanup = null;
      outlet.innerHTML = '';
      window.scrollTo(0, 0);
      const isCurrent = () => myToken === token;
      const result = await route.render(outlet, params, { isCurrent });
      if (!isCurrent()) {
        if (typeof result === 'function') result();
        return;
      }
      cleanup = result;
      return;
    }
    location.hash = '#/';
  }

  window.addEventListener('hashchange', resolve);
  return { start: resolve };
}
