/* Use the product's existing same-origin, HttpOnly-cookie session. */
(() => {
  'use strict';
  const account = document.querySelector('.account');
  if (!account) return;
  const guestLink = account.querySelector('.login').cloneNode(true);
  let trigger = null;
  let panel = null;
  let pending = null;
  let revision = 0;
  let loggingOut = false;

  function closeMenu(returnFocus = false) {
    if (panel) panel.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger?.focus();
  }
  function guest(focus = false) {
    closeMenu();
    trigger = null;
    panel = null;
    account.replaceChildren(guestLink.cloneNode(true));
    if (focus) account.querySelector('a').focus();
  }
  function signedIn(name) {
    if (trigger?.dataset.username === name) return;
    closeMenu();
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'login';
    trigger.dataset.username = name;
    trigger.title = name;
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'account-menu');
    const label = document.createElement('span');
    label.className = 'username-text';
    label.textContent = name;
    const caret = document.createElement('span');
    caret.className = 'account-caret';
    caret.setAttribute('aria-hidden', 'true');
    trigger.append(label, caret);
    panel = document.createElement('div');
    panel.id = 'account-menu';
    panel.className = 'account-menu';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', '账号选项');
    panel.hidden = true;
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.setAttribute('role', 'menuitem');
    logout.textContent = '登出';
    const error = document.createElement('p');
    error.className = 'account-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    panel.append(logout, error);
    account.replaceChildren(trigger, panel);
    trigger.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      trigger.setAttribute('aria-expanded', String(!panel.hidden));
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        logout.focus();
      }
    });
    logout.addEventListener('click', async () => {
      if (loggingOut) return;
      loggingOut = true;
      revision++;
      pending?.abort();
      logout.disabled = true;
      logout.textContent = '正在登出…';
      error.hidden = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/api/auth/session', {
          method: 'DELETE', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('logout failed');
        guest(true);
        try { localStorage.setItem('folio-auth-change', String(Date.now())); } catch { /* Optional cross-tab refresh. */ }
      } catch {
        error.textContent = '登出失败，请重试。';
        error.hidden = false;
        logout.disabled = false;
        logout.textContent = '登出';
        if (!panel.hidden) logout.focus();
      } finally {
        clearTimeout(timer);
        loggingOut = false;
      }
    });
  }
  async function refresh() {
    if (loggingOut) return;
    const current = ++revision;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      if (current !== revision) return;
      if (response.status === 401) { guest(); return; }
      if (!response.ok) return;
      const data = await response.json();
      if (current !== revision) return;
      if (typeof data.name === 'string' && data.name.trim()) signedIn(data.name.trim());
    } catch { /* Keep the current state when the network is unavailable. */ }
    finally { clearTimeout(timer); if (pending === controller) pending = null; }
  }
  document.addEventListener('pointerdown', event => {
    if (!account.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel && !panel.hidden) closeMenu(true);
  });
  account.addEventListener('focusout', event => {
    if (!loggingOut && !account.contains(event.relatedTarget)) closeMenu();
  });
  addEventListener('focus', refresh);
  addEventListener('pageshow', event => { if (event.persisted) refresh(); });
  addEventListener('storage', event => { if (event.key === 'folio-auth-change') refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  void refresh();
})();
