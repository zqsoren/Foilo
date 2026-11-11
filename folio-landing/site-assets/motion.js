/* Progressive enhancement: static content is the fallback on every failure. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const elements = [...document.querySelectorAll('[data-reveal]')];
  const orbit = document.querySelector('.orbit');
  let observer;
  let orbitObserver;
  const showAll = () => {
    observer?.disconnect();
    orbitObserver?.disconnect();
    elements.forEach(el => { el.classList.remove('reveal-wait'); el.classList.add('reveal-in'); });
    orbit?.classList.remove('is-playing');
  };
  const setup = () => {
    showAll();
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    root.classList.add('motion-ready');
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('reveal-wait');
      entry.target.classList.add('reveal-in');
      observer.unobserve(entry.target);
    }), { threshold: 0.08 });
    elements.forEach(el => {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.remove('reveal-in');
        el.classList.add('reveal-wait');
      }
      observer.observe(el);
    });
    if (orbit) {
      orbitObserver = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        orbit.classList.add('is-playing');
        orbitObserver.disconnect();
      }, { threshold: .35 });
      orbitObserver.observe(orbit);
    }
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      root.classList.add('keyboard-nav');
      showAll();
    }
  });
  document.addEventListener('pointerdown', () => root.classList.remove('keyboard-nav'), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) orbit?.classList.remove('is-playing');
  });
  window.addEventListener('pageshow', e => { if (e.persisted) showAll(); });
  reduced.addEventListener('change', setup);
  try { setup(); } catch { showAll(); }
})();
