/* Motion is an enhancement. HTML remains complete without JavaScript. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hero = document.querySelector('.hero');
  const flow = document.querySelector('.ai-flow');
  const toggle = document.querySelector('.motion-toggle');
  const observers = [];
  const typeFields = [...document.querySelectorAll('[data-type]')];
  const originalText = new Map(typeFields.map(el => [el, el.textContent]));
  let sceneStarted = false;
  let sceneFinished = false;
  let sceneEpoch = 0;
  let manualPause = false;

  function finishScene() {
    sceneEpoch++;
    sceneFinished = true;
    flow?.classList.add('scene-complete');
    flow?.querySelectorAll('.scene-step').forEach(el => {
      el.classList.add('scene-visible');
      el.style.animation = 'none';
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    typeFields.forEach(el => {
      const live = el.querySelector('.type-live');
      if (live) { live.textContent = originalText.get(el); live.classList.remove('is-typing'); }
    });
  }

  function showAll() {
    observers.forEach(observer => observer.disconnect());
    root.classList.remove('motion-ready');
    hero?.classList.add('is-active');
    root.classList.add('motion-paused');
    document.querySelectorAll('[data-enter]').forEach(el => el.classList.add('is-revealed'));
    finishScene();
  }

  function prepareType() {
    typeFields.forEach(el => {
      const text = originalText.get(el);
      el.setAttribute('aria-label', text);
      el.classList.add('type-wrap');
      const reserve = document.createElement('span');
      reserve.className = 'type-reserve';
      reserve.setAttribute('aria-hidden', 'true');
      reserve.textContent = text;
      const live = document.createElement('span');
      live.className = 'type-live';
      live.setAttribute('aria-hidden', 'true');
      el.replaceChildren(reserve, live);
    });
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const show = el => el?.classList.add('scene-visible');
  async function type(el, epoch) {
    if (!el) return;
    const live = el.querySelector('.type-live');
    live.classList.add('is-typing');
    let text = '';
    for (const char of [...originalText.get(el)]) {
      if (epoch !== sceneEpoch) return;
      text += char;
      live.textContent = text;
      await sleep(/[，。]/.test(char) ? 110 : 55);
    }
    live.classList.remove('is-typing');
  }

  async function playScene() {
    if (sceneStarted || sceneFinished) return;
    sceneStarted = true;
    flow.dataset.playCount = '1';
    const epoch = sceneEpoch;
    const current = () => epoch === sceneEpoch;
    show(flow.querySelector('.prompt'));
    await sleep(720); if (!current()) return;
    for (const reply of flow.querySelectorAll('.reply')) {
      show(reply);
      await sleep(240); if (!current()) return;
    }
    await sleep(260); if (!current()) return;
    show(flow.querySelector('.assist h4'));
    for (const icon of flow.querySelectorAll('.assist li')) {
      show(icon);
      await sleep(100); if (!current()) return;
    }
    await sleep(240); if (!current()) return;
    show(flow.querySelector('.ai-wire'));
    await sleep(450); if (!current()) return;
    show(flow.querySelector('.receipt'));
    await sleep(550); if (!current()) return;
    for (const row of flow.querySelectorAll('.receipt-row')) {
      row.classList.add('is-writing');
      await type(row.querySelector('dt [data-type]'), epoch); if (!current()) return;
      await sleep(90); if (!current()) return;
      await Promise.all([...row.querySelectorAll('dd [data-type]')].map(el => type(el, epoch)));
      if (!current()) return;
      await sleep(190); if (!current()) return;
    }
    sceneFinished = true;
    flow.classList.add('scene-complete');
  }

  async function prepareClock() {
    const image = document.querySelector('.dial>img');
    if (!image) return;
    try {
      const response = await fetch(image.src);
      if (!response.ok) return;
      const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      if (doc.querySelector('parsererror')) return;
      const svg = document.importNode(doc.documentElement, true);
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const source = svg.querySelector('path');
      const parts = source.getAttribute('d').match(/M[^M]+/g) || [];
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      let index = 0;
      for (const d of parts) {
        const path = source.cloneNode(false);
        path.setAttribute('d', d);
        if ((d.match(/L/g) || []).length > 10) {
          path.classList.add('clock-arc');
          path.style.setProperty('--spin-duration', `${17 + (index * 7 % 23) + index * .11}s`);
          path.style.setProperty('--spin-direction', index % 3 === 0 ? 'reverse' : 'normal');
          index++;
        }
        group.append(path);
      }
      source.replaceWith(group);
      image.replaceWith(svg);
      svg.dataset.rotatingArcs = String(index);
      if (toggle) toggle.hidden = false;
    } catch { /* The original, complete clock image is the fallback. */ }
  }

  function prepareEntrances() {
    const mark = (el, delay = 0) => {
      if (!el) return;
      el.setAttribute('data-enter', '');
      el.style.setProperty('--enter-delay', `${delay}ms`);
    };
    document.querySelectorAll('.headline-line').forEach((el, i) => mark(el, i * 140));
    mark(document.querySelector('.hero-copy>p'), 260);
    mark(document.querySelector('.actions'), 360);
    document.querySelectorAll('.section-head').forEach(header => {
      [...header.children].forEach((el, i) => mark(el, i * 110));
    });
    document.querySelectorAll('.reasons article').forEach((article, i) => {
      [...article.children].forEach((el, j) => mark(el, i * 100 + j * 130));
    });
    document.querySelectorAll('.group-label').forEach(el => mark(el));
    document.querySelectorAll('.tile-slot').forEach((el, i) => mark(el, i % 4 * 100));
    document.querySelectorAll('.book,.dashboard,.mcp-title,.final-grid>div,.foot').forEach(el => mark(el));
    updateTagOrigins();
  }

  function updateTagOrigins() {
    const dial = document.querySelector('.dial');
    if (!dial) return;
    document.querySelectorAll('.tag').forEach((el, i) => {
      // offset values describe the final layout, unaffected by running transforms.
      el.style.setProperty('--from-x', `${(dial.offsetLeft - el.offsetLeft - el.offsetWidth / 2) * .43}px`);
      el.style.setProperty('--from-y', `${(dial.offsetTop - el.offsetTop - el.offsetHeight / 2) * .43}px`);
      el.style.setProperty('--tag-delay', `${120 + i * 80}ms`);
    });
  }

  function setup() {
    if (reduced.matches || !('IntersectionObserver' in window)) { showAll(); return; }
    prepareEntrances();
    prepareType();
    flow?.classList.add('scene-ready');
    root.classList.add('motion-ready');
    const pages = [...document.querySelectorAll('[data-snap]')];
    const visible = new Set();
    let activePage = null;
    let flowVisible = false;
    let settleTimer = null;
    let lastCandidate = null;
    let lastTop = null;
    let stableSamples = 0;
    const owner = el => el.closest('[data-snap]');
    const reveal = el => {
      if (visible.has(el) && owner(el) === activePage) el.classList.add('is-revealed');
    };
    const maybePlay = () => {
      const page = flow.closest('[data-snap]');
      const r = page.getBoundingClientRect();
      const coverage = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.min(r.height, innerHeight);
      if (activePage === page && coverage >= .72 && flowVisible) void playScene().catch(showAll);
    };
    function activate(page) {
      if (activePage !== page) {
        if (activePage && !activePage.classList.contains('ai')) {
          activePage.querySelectorAll('[data-enter]').forEach(el => el.classList.remove('is-revealed'));
        }
        activePage?.classList.remove('page-ready');
        if (activePage?.classList.contains('ai') && sceneStarted && !sceneFinished) finishScene();
        activePage = page;
      }
      page.classList.add('page-ready');
      hero.classList.toggle('is-active', page === hero);
      page.querySelectorAll('[data-enter]').forEach(reveal);
      maybePlay();
    }
    function checkSettled(force = false) {
      clearTimeout(settleTimer);
      const height = innerHeight;
      const candidates = pages.map(page => {
        const rect = page.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(rect.bottom, height) - Math.max(rect.top, 0));
        return { page, top: rect.top, ratio: overlap / Math.min(rect.height, height) };
      }).sort((a, b) => b.ratio - a.ratio);
      const best = candidates[0];
      if (!best || best.ratio < .45) { stableSamples = 0; return; }
      if (best.page === lastCandidate && Math.abs(best.top - lastTop) < 1) stableSamples++;
      else stableSamples = 0;
      lastCandidate = best.page;
      lastTop = best.top;
      if (force || stableSamples >= 2) activate(best.page);
      else settleTimer = setTimeout(checkSettled, 100);
    }
    const requestSettle = () => {
      clearTimeout(settleTimer);
      stableSamples = 0;
      settleTimer = setTimeout(checkSettled, 120);
    };
    const entrances = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { visible.add(entry.target); reveal(entry.target); }
        else {
          visible.delete(entry.target);
          if (!entry.target.closest('.ai')) entry.target.classList.remove('is-revealed');
        }
      });
    }, { threshold: .2, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('[data-enter]').forEach(el => entrances.observe(el));
    observers.push(entrances);
    const pageObserver = new IntersectionObserver(requestSettle, { threshold: [0, .15, .3, .45, .6, .75, .9, 1] });
    pages.forEach(page => pageObserver.observe(page));
    observers.push(pageObserver);
    const heroObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) hero.classList.remove('is-active');
      else if (activePage === hero) hero.classList.add('is-active');
    }, { threshold: .12 });
    heroObserver.observe(hero);
    observers.push(heroObserver);
    const sceneObserver = new IntersectionObserver(([entry]) => {
      flowVisible = entry.intersectionRatio >= .65;
      maybePlay();
      if (!entry.isIntersecting && sceneStarted && !sceneFinished) finishScene();
    }, { threshold: [0, .38, .65, 1] });
    sceneObserver.observe(flow);
    observers.push(sceneObserver);
    document.addEventListener('scrollend', () => { if (root.classList.contains('motion-ready')) checkSettled(true); });
    addEventListener('resize', requestSettle, { passive: true });
    if ('ResizeObserver' in window) {
      const resize = new ResizeObserver(updateTagOrigins);
      resize.observe(document.querySelector('.orbit'));
    }
    requestSettle();
    void prepareClock();
  }

  toggle?.addEventListener('click', () => {
    manualPause = !manualPause;
    root.classList.toggle('motion-paused', manualPause);
    toggle.setAttribute('aria-pressed', String(manualPause));
    const label = manualPause ? '继续时钟转动' : '暂停时钟转动';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  });
  document.addEventListener('visibilitychange', () => {
    root.classList.toggle('page-hidden', document.hidden);
    if (document.hidden && sceneStarted && !sceneFinished) finishScene();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') { root.classList.add('keyboard-nav'); showAll(); }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) showAll(); });
  addEventListener('pageshow', event => { if (event.persisted) showAll(); });
  try { setup(); } catch { showAll(); }
})();
