/* Acadaelash LMS: interaction and motion layer.
   Additive only. Loaded after every other script. The motion layer below never calls Supabase, never writes data,
   never changes routing, auth, enrollment or grading logic. It only decorates what the portal
   already renders (CSS classes, small decorative elements) and respects prefers-reduced-motion.
   Matching styles live in style.css, section "23. Interaction and motion layer".
   The Admin panel section at the end of this file is separate: it does call Supabase (admin SQL functions only);
   its styles are in style.css section "24. Admin panel". */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const raf = requestAnimationFrame;
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => mq.matches;                       // checked at event time, so a live OS change is honoured
  const body = document.body;
  const locked = () => body.classList.contains('locked');
  const safe = fn => { try { return fn(); } catch (e) { return undefined; } };
  const watch = (el, opts, fn) => { if (el) new MutationObserver(fn).observe(el, opts); };

  /* 1. Landing page: drifting gold particles behind the hero ------------------------------ */
  (function particles() {
    const hero = $('lp-home');
    const cv = document.createElement('canvas');
    if (!hero || !cv.getContext) return;
    cv.className = 'fx-particles';
    cv.setAttribute('aria-hidden', 'true');
    hero.insertBefore(cv, hero.firstChild);
    const ctx = cv.getContext('2d');
    const COLORS = ['214,173,69', '232,203,120', '121,102,168'];
    let W = 0, H = 0, ps = [], timer = 0, t0 = 0;

    const make = () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2.1 + .8,
      vy: -(Math.random() * .22 + .06), vx: (Math.random() - .5) * .12,
      a: Math.random() * .45 + .15, ph: Math.random() * 6.28, c: COLORS[(Math.random() * COLORS.length) | 0]
    });
    function size() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = hero.clientWidth; H = hero.clientHeight;
      if (!W || !H) return false;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(34, Math.max(12, W / 40)));
      while (ps.length < n) ps.push(make());
      ps.length = n;
      return true;
    }
    function frame(now) {
      timer = 0;
      if (!running()) return;
      ctx.clearRect(0, 0, W, H);
      const t = (now - t0) / 1000;
      for (const p of ps) {
        p.y += p.vy; p.x += p.vx + Math.sin(t * .6 + p.ph) * .08;
        if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
        if (p.x < -6) p.x = W + 6; else if (p.x > W + 6) p.x = -6;
        const a = p.a * (.65 + .35 * Math.sin(t * 1.4 + p.ph));
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.c},${a.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      }
      timer = raf(frame);
    }
    const running = () => locked() && !document.hidden && !still() && hero.clientWidth > 0;
    function sync() {
      if (running()) { if (!timer && size()) { t0 = performance.now(); timer = raf(frame); } }
      else if (timer) { cancelAnimationFrame(timer); timer = 0; }
      if (!running()) ctx.clearRect(0, 0, cv.width, cv.height);
    }
    watch(body, {attributes: true, attributeFilter: ['class']}, sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', () => { if (timer && !size()) sync(); });
    if (mq.addEventListener) mq.addEventListener('change', sync);
    sync();
  })();

  /* 2. Landing page: remember which way the form switched, so CSS can slide it ------------- */
  (function authSwitch() {
    const panel = $('lp-panel'), up = $('signupForm');
    watch(up, {attributes: true, attributeFilter: ['hidden']}, () => { if (panel) panel.dataset.dir = up.hidden ? 'back' : 'fwd'; });
  })();

  /* 3. Pointer tilt and glare on stat cards and course cards (mouse only) ------------------ */
  (function tilt() {
    const SEL = '.stat, .course-card';
    let el = null, frame = 0, px = 0, py = 0;
    function paint() {
      frame = 0;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.min(1, Math.max(0, (px - r.left) / r.width)), y = Math.min(1, Math.max(0, (py - r.top) / r.height));
      el.style.setProperty('--fx-ry', ((x - .5) * 9).toFixed(2) + 'deg');
      el.style.setProperty('--fx-rx', ((.5 - y) * 9).toFixed(2) + 'deg');
      el.style.setProperty('--fx-gx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--fx-gy', (y * 100).toFixed(1) + '%');
    }
    function engage(c) {
      el = c;
      c.classList.add('fx-tilt');
      if (!c.querySelector(':scope > .fx-glare')) {
        const g = document.createElement('span');
        g.className = 'fx-glare';
        g.setAttribute('aria-hidden', 'true');
        c.appendChild(g);
      }
    }
    function release() {
      if (!el) return;
      el.classList.remove('fx-tilt');
      ['--fx-rx', '--fx-ry', '--fx-gx', '--fx-gy'].forEach(v => el.style.removeProperty(v));
      el = null;
    }
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || still() || locked()) { release(); return; }
      const c = e.target.closest ? e.target.closest(SEL) : null;
      if (c !== el) { release(); if (c) engage(c); }
      if (el) { px = e.clientX; py = e.clientY; if (!frame) frame = raf(paint); }
    }, {passive: true});
    document.addEventListener('pointerout', e => { if (!e.relatedTarget) release(); });
    document.addEventListener('scroll', release, {passive: true, capture: true});
  })();

  /* 4. Scroll reveal for sections, and a one-time sheen on progress bars and rings -------- */
  (function scrollFx() {
    if (!('IntersectionObserver' in window) || !$('view')) return;
    // Only elements that have no entrance animation of their own (direct children of .page already rise in).
    const REVEAL = '.tile, .panel-card, .kv > div, .dash-main > .sec-head, .dash-main > .tablewrap';
    const rv = new IntersectionObserver(es => {
      let k = 0;
      es.forEach(en => {
        if (!en.isIntersecting) return;
        const t = en.target;
        rv.unobserve(t);
        t.style.transitionDelay = Math.min(k++, 5) * 70 + 'ms';
        raf(() => t.classList.add('fx-in'));
        setTimeout(() => { t.classList.remove('fx-reveal', 'fx-in'); t.style.transitionDelay = ''; }, 1200);
      });
    }, {threshold: .1, rootMargin: '0px 0px -5% 0px'});
    const mt = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('fx-inview'); mt.unobserve(en.target); }
    }), {threshold: .4});
    let queued = false;
    function scan() {
      queued = false;
      document.querySelectorAll('#view .meter:not([data-fx-m]), #view .ring:not([data-fx-m])').forEach(el => { el.dataset.fxM = '1'; mt.observe(el); });
      if (still()) return;
      document.querySelectorAll(REVEAL).forEach(el => {
        if (el.dataset.fxSeen || !el.offsetParent) return;      // not visible yet: look again when its page is shown
        el.dataset.fxSeen = '1';
        if (el.getBoundingClientRect().top > window.innerHeight * .92) { el.classList.add('fx-reveal'); rv.observe(el); }
      });
    }
    const queue = () => { if (!queued) { queued = true; raf(scan); } };
    watch($('view'), {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']}, queue);
    queue();
  })();

  /* 5. Navigation: staggered drawer items, quick-access pending dot ------------------------ */
  (function navigation() {
    document.querySelectorAll('#nav button').forEach((b, i) => b.style.setProperty('--n', i));
    const fab = $('qfab');
    if (!fab) return;
    const upd = () => {
      let n = 0;
      safe(() => { n = pendingList().length; });                // read-only helper from the portal script
      fab.classList.toggle('fx-has-pending', n > 0);
    };
    watch($('title'), {childList: true}, upd);
    if ($('view')) $('view').addEventListener('click', () => setTimeout(upd, 80));
    upd();
  })();

  /* 6. Views, theme switch, toasts, loading skeletons ------------------------------------- */
  (function globalFx() {
    // Page transition: replay a soft fade on every view change (the title is rewritten by show()).
    watch($('title'), {childList: true}, () => {
      const v = $('view');
      if (!v || still() || locked()) return;
      v.classList.remove('fx-view-in'); void v.offsetWidth; v.classList.add('fx-view-in');
    });
    // Smooth light/dark switch: colours cross-fade for a moment (capture, so it runs before the theme is applied).
    let tt = 0;
    document.addEventListener('click', e => {
      if (!e.target.closest('[data-theme-opt]') || still()) return;
      const r = document.documentElement;
      r.classList.add('fx-theme-anim');
      clearTimeout(tt);
      tt = setTimeout(() => r.classList.remove('fx-theme-anim'), 650);
    }, true);
    // Toast countdown bar.
    const boxes = $('toasts');
    watch(boxes, {childList: true}, recs => recs.forEach(r => r.addedNodes.forEach(n => {
      if (n.nodeType !== 1 || !n.classList.contains('toast') || still()) return;
      const bar = document.createElement('i');
      bar.className = 'fx-toast-bar';
      bar.setAttribute('aria-hidden', 'true');
      n.appendChild(bar);
    })));
  })();

  /* 7. Modules and lessons ----------------------------------------------------------------- */
  const SPARK = ['#D6AD45', '#E8CB78', '#F4F0E6', '#7966A8', '#FFC93C'];
  function burst(el) {
    if (still() || !el || !el.animate) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 40);
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('span');
      const ang = Math.random() * 6.2832, dist = 70 + Math.random() * 120, size = 5 + Math.random() * 6;
      s.className = 'fx-spark';
      s.setAttribute('aria-hidden', 'true');
      s.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${(size * (Math.random() < .5 ? 1 : .45)).toFixed(1)}px;background:${SPARK[i % SPARK.length]}`;
      document.body.appendChild(s);
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 30;
      const a = s.animate([
        {transform: 'translate(-50%,-50%) rotate(0deg) scale(1)', opacity: 1},
        {transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${(dy + 90).toFixed(0)}px)) rotate(${(Math.random() * 540 - 270).toFixed(0)}deg) scale(.4)`, opacity: 0}
      ], {duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards'});
      a.onfinish = () => s.remove();
    }
  }

  (function learning() {
    const root = $('mod-root');
    if (!root) return;
    let burstUntil = 0, prevKey = '', prevIdx = -1, queued = false;

    // Remember a real click on "Mark lesson complete" (capture: modules.js disables the button synchronously).
    document.addEventListener('click', e => {
      const b = e.target.closest('#complete');
      if (b && !b.disabled) burstUntil = Date.now() + 8000;
    }, true);

    function process() {
      queued = false;
      if (still()) return;

      // Progress bars grow from zero when a view is drawn (e.g. after completing a lesson).
      root.querySelectorAll('.meter i[style*="width"]:not([data-fx-bar])').forEach(i => {
        i.dataset.fxBar = '1';
        const w = i.style.width;
        i.style.transition = 'none'; i.style.width = '0%'; void i.offsetWidth; i.style.transition = '';
        raf(() => raf(() => { i.style.width = w; }));
      });

      // Cards and lessons pop in with a stagger (initial render and every filter or sort change).
      let k = 0;
      root.querySelectorAll('.modcard:not([data-fx-pop]), .lesson-list > li:not([data-fx-pop])').forEach(el => {
        el.dataset.fxPop = '1';
        el.style.setProperty('--fx-d', Math.min(k++, 10) * 45 + 'ms');
        el.classList.add('fx-pop');
      });

      // Skeleton shimmer while the learning data loads.
      root.querySelectorAll('.card:not([data-fx-sk]), #quiz > p:not([data-fx-sk])').forEach(c => {
        if (c.children.length || !/^Loading/i.test(c.textContent.trim())) return;
        c.dataset.fxSk = '1';
        c.classList.add('fx-loading');
        c.insertAdjacentHTML('beforeend', '<span class="fx-sk" aria-hidden="true"></span><span class="fx-sk s" aria-hidden="true"></span>');
      });

      // Slide between lessons: forward or back in the lesson list, a fade when entering a course.
      const nav = root.querySelector('.lesson-nav'), main = root.querySelector('.lesson-main');
      if (!main) { prevKey = ''; prevIdx = -1; }
      else if (nav && !main.dataset.fxSlide) {
        main.dataset.fxSlide = '1';
        const idx = [...nav.querySelectorAll('a')].findIndex(a => a.classList.contains('on'));
        const key = (nav.querySelector('b') || {}).textContent || '';
        if (key !== prevKey) main.classList.add('fx-slide-fade');
        else if (prevIdx >= 0 && idx !== prevIdx) main.classList.add(idx > prevIdx ? 'fx-slide-fwd' : 'fx-slide-back');
        prevKey = key; prevIdx = idx;
      }

      // Gold burst once the lesson is really completed.
      const c = $('complete');
      if (c && c.disabled && /Completed/.test(c.textContent) && !c.dataset.fxDone) {
        c.dataset.fxDone = '1';
        if (Date.now() < burstUntil) { burstUntil = 0; c.classList.add('fx-done'); burst(c); }
      }

      // Quiz result: animated pass / not-passed feedback, burst on a pass.
      const q = $('qres');
      if (q) {
        const txt = q.textContent.trim();
        if (txt && q.dataset.fxSeen !== txt) {
          q.dataset.fxSeen = txt;
          const pass = /Passed\./.test(txt), fail = /Not passed/i.test(txt);
          q.classList.remove('fx-pass', 'fx-fail', 'fx-result');
          if (pass || fail) { void q.offsetWidth; q.classList.add('fx-result', pass ? 'fx-pass' : 'fx-fail'); }
          if (pass) burst(q);
        }
      }
    }
    watch(root, {childList: true, subtree: true}, () => { if (!queued) { queued = true; raf(process); } });
  })();

  /* 8. Assignment dialog: success checkmark after a submission --------------------------- */
  (function submitOk() {
    const go = $('sub-go');
    if (!go) return;
    go.addEventListener('click', () => {            // a disabled button never fires click, so this is a real submit
      if (still()) return;
      const o = document.createElement('div');
      o.className = 'fx-ok';
      o.setAttribute('role', 'status');
      o.innerHTML = '<div class="fx-ok-card"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28"/><path d="M19 33l9 9 17-19"/></svg><span>Assignment submitted</span></div>';
      document.body.appendChild(o);
      setTimeout(() => o.classList.add('out'), 1500);
      setTimeout(() => o.remove(), 1850);
    });
  })();
})();

/* ==== AX THEME START ==== */
/* Acadaelash theme layer v3: visual and interactive polish only.
   One shared animation loop (eased with delta time, so it stays smooth on slow and
   fast screens), canvas effects instead of many DOM nodes, and an automatic
   contrast guard so text stays readable in light and dark mode.
   Never touches Supabase, db, sessions or any existing handler. */
;(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const body = document.body, root = document.documentElement;
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = () => reduceMQ.matches;
  const canHover = matchMedia('(hover: hover)').matches;
  const safe = fn => { try { return fn(); } catch (e) { /* decoration must never break the portal */ } };
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const locked = () => body.classList.contains('locked');
  const dark = () => root.getAttribute('data-theme') === 'dark' && !locked();
  const DPR = () => Math.min(window.devicePixelRatio || 1, 1.5);
  const ptr = {x: innerWidth / 2, y: innerHeight / 3, moved: false, touch: false};
  const layers = []; // everything that draws each frame registers here

  /* ---------------------------------------------------------------------
     1. Landing page: constellation sky, glyphs, bubbles, seal
     --------------------------------------------------------------------- */
  const GLYPHS = {
    pencil: '<path d="M4 20l1.2-4.6L16.6 4a2.1 2.1 0 013 3L8.2 18.4 4 20z"/><path d="M14.5 6.1l3.4 3.4"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5z"/><path d="M8 7h8M8 11h6"/>',
    atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>',
    sigma: '<path d="M18 5H6l7 7-7 7h12"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
    ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.5" transform="rotate(-20 12 12)"/><path d="M7 9.4v2.2M10.5 8.1v3M14 6.9v2.2M17.5 5.6v3"/>',
    cap: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    pi: '<path d="M5 7h14M9 7v11M15 7v8c0 2 1 3 3 3"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.6 1.6 0 001.4 2.4h12.2a1.6 1.6 0 001.4-2.4L14 9V3"/><path d="M7.5 15h9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
  };
  const PLACE = [ // glyph, x%, y%, size, rotation, depth, bob seconds, tone
    ['pencil', 6, 16, 64, -18, 1.4, 9, ''], ['atom', 44, 8, 58, 0, 1.0, 11, 'v'], ['book', 90, 14, 62, 12, 1.6, 10, ''],
    ['sigma', 12, 70, 50, 8, .8, 8, 's'], ['bulb', 49, 82, 58, -8, 1.2, 12, ''], ['cap', 92, 74, 66, 14, 1.5, 9, 'v'],
    ['ruler', 30, 40, 56, 25, .7, 13, 's'], ['pi', 70, 6, 46, -6, 1.1, 10, 's'], ['flask', 3, 44, 52, 10, 1.3, 11, 'v'],
    ['globe', 66, 90, 52, 0, .9, 12, 's']
  ];

  function makeConstellation(cv, host) {
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1, stars = [], shoot = null, nextShoot = 3500;
    const m = {x: -9999, y: -9999, on: false};
    const GOLD = '214,173,69';
    function size() {
      dpr = DPR(); w = host.clientWidth; h = host.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(120, Math.max(40, w * h / 15000)));
      stars = Array.from({length: n}, () => ({x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5 + .4,
        vx: (Math.random() - .5) * .16, vy: (Math.random() - .5) * .16, p: Math.random() * 6.28, gold: Math.random() < .28}));
    }
    function draw(dt, t) {
      if (!w) return;
      const k = reduce() ? 0 : dt / 16.7;
      ctx.clearRect(0, 0, w, h);
      const LINK = 118, MR = 170;
      for (const s of stars) {
        s.x += s.vx * k; s.y += s.vy * k;
        if (s.x < -10) s.x = w + 10; else if (s.x > w + 10) s.x = -10;
        if (s.y < -10) s.y = h + 10; else if (s.y > h + 10) s.y = -10;
        const tw = .55 + .45 * Math.sin(t / 700 + s.p);
        ctx.beginPath();
        ctx.fillStyle = s.gold ? `rgba(${GOLD},${.6 * tw + .3})` : `rgba(83,101,125,${.4 * tw + .15})`;
        ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
      ctx.lineWidth = .7;
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i];
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy;
          if (d < LINK * LINK) {
            ctx.strokeStyle = `rgba(${GOLD},${(1 - Math.sqrt(d) / LINK) * .38})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        if (m.on) {
          const dx = a.x - m.x, dy = a.y - m.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < MR) {
            ctx.strokeStyle = `rgba(199,158,54,${(1 - d / MR) * .8})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.x, m.y); ctx.stroke(); ctx.lineWidth = .7;
            a.x -= dx * .0035 * k; a.y -= dy * .0035 * k;
          }
        }
      }
      if (m.on) {
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 36);
        g.addColorStop(0, 'rgba(214,173,69,.45)'); g.addColorStop(1, 'rgba(214,173,69,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, 36, 0, 6.283); ctx.fill();
      }
      if (k) {
        if (!shoot && t > nextShoot) shoot = {x: Math.random() * w * .8, y: Math.random() * h * .35, l: 0};
        if (shoot) {
          shoot.l += 14 * k; shoot.x += 11 * k; shoot.y += 6 * k;
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - 110, shoot.y - 60);
          g.addColorStop(0, 'rgba(199,158,54,.9)'); g.addColorStop(1, 'rgba(199,158,54,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - 110, shoot.y - 60); ctx.stroke();
          if (shoot.l > 900 || shoot.x > w + 150) { shoot = null; nextShoot = t + 4000 + Math.random() * 6000; }
        }
      }
    }
    host.addEventListener('pointermove', e => {
      const r = host.getBoundingClientRect(); m.x = e.clientX - r.left; m.y = e.clientY - r.top; m.on = e.pointerType !== 'touch';
    }, {passive: true});
    host.addEventListener('pointerleave', () => { m.on = false; });
    size();
    return {size, draw, host, enabled: () => locked()};
  }

  function buildSky() {
    const hero = document.querySelector('.lp-hero');
    if (!hero || hero.querySelector('.ax-sky')) return;
    const sky = el('div', 'ax-sky'); sky.setAttribute('aria-hidden', 'true');
    const cv = el('canvas', 'ax-stars'); sky.appendChild(cv);
    const seal = el('img', 'ax-seal'); seal.src = 'seal.svg'; seal.alt = ''; seal.setAttribute('aria-hidden', 'true');
    seal.addEventListener('error', () => seal.remove()); sky.appendChild(seal);
    const gl = el('div', 'ax-glyphs'); gl.setAttribute('aria-hidden', 'true');
    PLACE.forEach(([n, x, y, s, r, d, t, tone], i) => {
      const g = el('span', 'ax-glyph' + (tone ? ' ' + tone : ''), `<svg viewBox="0 0 24 24">${GLYPHS[n]}</svg>`);
      g.style.cssText = `--x:${x}%;--y:${y}%;--s:${s}px;--r:${r}deg;--d:${d * 18};--t:${t}s;--dl:${-i * 1.1}s`;
      gl.appendChild(g);
    });
    for (let i = 0; i < 16; i++) {
      const b = el('i', 'ax-bokeh' + (i % 3 === 0 ? ' v' : ''));
      b.style.cssText = `--x:${(Math.random() * 96).toFixed(1)}%;--s:${(14 + Math.random() * 38).toFixed(0)}px;--t:${(14 + Math.random() * 14).toFixed(1)}s;--dl:${(-Math.random() * 20).toFixed(1)}s;--sx:${(Math.random() * 80 - 40).toFixed(0)}px`;
      gl.appendChild(b);
    }
    hero.insertBefore(gl, hero.firstChild);
    hero.insertBefore(sky, hero.firstChild);
    const con = makeConstellation(cv, hero);
    layers.push({draw: (dt, t) => con.draw(dt, t), enabled: con.enabled, resize: con.size});
    // smoothed parallax for the glyphs + gentle 3D tilt for the login card
    const panel = document.querySelector('.lp-panel');
    const P = {px: 0, py: 0, rx: 0, ry: 0};
    layers.push({
      enabled: () => locked() && !reduce() && canHover,
      draw: dt => {
        const r = hero.getBoundingClientRect();
        const tx = r.width ? (ptr.x - r.left) / r.width - .5 : 0, ty = r.height ? (ptr.y - r.top) / r.height - .5 : 0;
        const e = 1 - Math.pow(.001, dt / 1000 * .9);
        P.px += (tx - P.px) * e; P.py += (ty - P.py) * e;
        gl.style.setProperty('--px', P.px.toFixed(4)); gl.style.setProperty('--py', P.py.toFixed(4));
        if (panel && innerWidth > 640) {
          const busy = panel.matches(':focus-within');
          const wantY = busy ? 0 : (ptr.x / innerWidth - .5) * 7, wantX = busy ? 0 : -(ptr.y / innerHeight - .5) * 5;
          P.ry += (wantY - P.ry) * e; P.rx += (wantX - P.rx) * e;
          panel.style.transform = `perspective(1200px) rotateX(${P.rx.toFixed(3)}deg) rotateY(${P.ry.toFixed(3)}deg)`;
        }
      }
    });
  }

  /* ---------------------------------------------------------------------
     2. Portal: drifting gold motes behind the content + one FX canvas
     --------------------------------------------------------------------- */
  function buildMotes() {
    const cv = el('canvas', 'ax-motes'); cv.setAttribute('aria-hidden', 'true'); body.insertBefore(cv, body.firstChild);
    const ctx = cv.getContext('2d'); let w = 0, h = 0, dpr = 1, motes = [];
    function size() {
      dpr = DPR(); w = innerWidth; h = innerHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      motes = Array.from({length: Math.round(Math.min(34, Math.max(14, w * h / 52000)))}, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.7 + .6, vy: -(Math.random() * .22 + .06), sw: Math.random() * 6.28, sp: Math.random() * .0006 + .0003, a: Math.random() * .35 + .15}));
    }
    layers.push({
      enabled: () => !locked() && !reduce(),
      resize: size,
      draw: (dt, t) => {
        ctx.clearRect(0, 0, w, h);
        const k = dt / 16.7, d = dark();
        for (const m of motes) {
          m.y += m.vy * k; if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w; }
          const x = m.x + Math.sin(t * m.sp + m.sw) * 18, tw = .6 + .4 * Math.sin(t / 900 + m.sw);
          const g = ctx.createRadialGradient(x, m.y, 0, x, m.y, m.r * 5);
          g.addColorStop(0, d ? `rgba(240,215,142,${m.a * tw})` : `rgba(199,158,54,${m.a * tw})`); g.addColorStop(1, 'rgba(214,173,69,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, m.y, m.r * 5, 0, 6.283); ctx.fill();
        }
      }
    });
    size();
  }

  // Sparkles and the cursor dust trail share one canvas (far lighter than DOM nodes)
  const fx = el('canvas', 'ax-fx'); fx.setAttribute('aria-hidden', 'true'); body.appendChild(fx);
  const fctx = fx.getContext('2d'); let fw = 0, fh = 0; const parts = [];
  const fxSize = () => { const d = DPR(); fw = innerWidth; fh = innerHeight; fx.width = Math.round(fw * d); fx.height = Math.round(fh * d); fctx.setTransform(d, 0, 0, d, 0, 0); };
  fxSize();
  function burst(x, y, n) {
    if (reduce()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 1.4 + Math.random() * 3.6;
      parts.push({type: 's', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, r: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, life: 1, decay: .014 + Math.random() * .01});
    }
  }
  function dust(x, y) { parts.push({type: 'd', x, y, vx: (Math.random() - .5) * .6, vy: .25 + Math.random() * .3, r: 1.6 + Math.random() * 1.6, life: 1, decay: .028}); }
  layers.push({
    enabled: () => parts.length > 0,
    draw: dt => {
      const k = dt / 16.7;
      fctx.clearRect(0, 0, fw, fh);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx * k; p.y += p.vy * k; p.life -= p.decay * k;
        if (p.type === 's') { p.vy += .09 * k; p.vx *= .985; p.rot += p.vr * k; }
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        fctx.globalAlpha = Math.max(p.life, 0);
        if (p.type === 's') {
          fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillStyle = '#E8CB78'; fctx.beginPath();
          for (let j = 0; j < 8; j++) { const rr = j % 2 ? p.r * .38 : p.r, a = j * Math.PI / 4; fctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          fctx.closePath(); fctx.fill(); fctx.restore();
        } else {
          const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.4);
          g.addColorStop(0, 'rgba(255,241,194,.95)'); g.addColorStop(1, 'rgba(214,173,69,0)');
          fctx.fillStyle = g; fctx.beginPath(); fctx.arc(p.x, p.y, p.r * 2.4, 0, 6.283); fctx.fill();
        }
      }
      fctx.globalAlpha = 1;
      if (!parts.length) fctx.clearRect(0, 0, fw, fh);
    }
  });

  /* ---------------------------------------------------------------------
     3. The one animation loop (delta-time, so speed is identical on 60 and 144 Hz)
     --------------------------------------------------------------------- */
  const glow = el('div', 'ax-cursor-glow'); glow.setAttribute('aria-hidden', 'true'); body.appendChild(glow);
  const G = {x: ptr.x, y: ptr.y};
  const mags = new Map(); // magnetic buttons: el -> {x, y, tx, ty}
  let last = performance.now(), raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(now - last, 50); last = now;
    if (document.hidden) return;
    if (!reduce() && canHover && !locked()) {
      const e = 1 - Math.pow(.002, dt / 1000);
      G.x += (ptr.x - G.x) * e; G.y += (ptr.y - G.y) * e;
      glow.style.transform = `translate3d(${G.x.toFixed(1)}px,${G.y.toFixed(1)}px,0)`;
    }
    for (const [n, s] of mags) {
      const e = 1 - Math.pow(.0005, dt / 1000);
      s.x += (s.tx - s.x) * e; s.y += (s.ty - s.y) * e;
      if (!s.tx && !s.ty && Math.abs(s.x) < .05 && Math.abs(s.y) < .05) { n.style.translate = ''; mags.delete(n); }
      else n.style.translate = s.x.toFixed(2) + 'px ' + s.y.toFixed(2) + 'px';
    }
    for (const l of layers) if (l.enabled()) l.draw(dt, now);
  }
  const startLoop = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { fxSize(); layers.forEach(l => l.resize && l.resize()); if (reduce()) layers.forEach(l => l.enabled() && l.draw(0, 0)); }, 150); });

  const MAG = '.lp-btn, .btn:not(:disabled), .pf-chip, .q-fab, .ai-fab, .dz-btn';
  let lastDust = 0, dx0 = 0, dy0 = 0;
  document.addEventListener('pointermove', e => {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.touch = e.pointerType === 'touch';
    if (ptr.touch || reduce()) return;
    const tile = e.target.closest && e.target.closest('.tile');
    if (tile) { const r = tile.getBoundingClientRect(); tile.style.setProperty('--mx', (e.clientX - r.left) + 'px'); tile.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
    const t = canHover && e.target.closest && e.target.closest(MAG);
    for (const [n, s] of mags) if (n !== t) { s.tx = 0; s.ty = 0; }
    if (t) {
      const r = t.getBoundingClientRect(), s = mags.get(t) || {x: 0, y: 0, tx: 0, ty: 0};
      s.tx = (e.clientX - r.left - r.width / 2) * .16; s.ty = (e.clientY - r.top - r.height / 2) * .24; mags.set(t, s);
    }
    const now = performance.now();
    if (canHover && now - lastDust > 40 && Math.hypot(e.clientX - dx0, e.clientY - dy0) > 12) { lastDust = now; dx0 = e.clientX; dy0 = e.clientY; dust(e.clientX, e.clientY); }
  }, {passive: true});
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('.tile, .stat, .course-card, .pf-chip, .lp-btn.solid, .btn:not(:disabled), .q-fab, .ai-fab, .pf-copy');
    if (t) burst(e.clientX, e.clientY, 9);
  });

  /* ---------------------------------------------------------------------
     4. Dashboard hero: night sky, tip, focus timer, study level
     --------------------------------------------------------------------- */
  const TIPS = [
    'Study for 25 minutes, rest for 5. Short bursts beat one long marathon.',
    'Explain a lesson out loud in your own words. If you get stuck, that is the part to review.',
    'Start with the assignment that is due first, not the one that looks easiest.',
    'Sleep before an exam helps more than another hour of cramming.',
    'Stuck on something? Ask the AI Tutor in the corner, then check it with your instructor.',
    'Write down one question after every lesson. Answers stick better when you went looking for them.',
    'Put your phone in another room for one focus session. Notice how much faster you finish.'
  ];
  const TITLES = ['Newcomer', 'Learner', 'Explorer', 'Scholar', 'Achiever', 'Honor seeker', 'Dean\u2019s lister'];
  const DOC_TITLE = 'Acadaelash LMS | Learning Portal';

  function buildHero() {
    const hero = document.querySelector('.hero');
    if (!hero || hero.querySelector('.ax-herosky')) return;
    const sky = el('div', 'ax-herosky'); sky.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 26; i++) {
      const s = el('i');
      s.style.cssText = `--x:${(Math.random() * 100).toFixed(1)}%;--y:${(Math.random() * 100).toFixed(1)}%;--z:${(Math.random() * 2.6 + 1.4).toFixed(1)}px;--t:${(Math.random() * 3 + 2).toFixed(1)}s;--dl:${(-Math.random() * 4).toFixed(1)}s`;
      sky.appendChild(s);
    }
    sky.insertAdjacentHTML('beforeend',
      '<svg viewBox="0 0 320 200"><path d="M10 160 L70 110 L130 130 L190 60 L250 90 L310 30"/><path d="M130 130 L160 180 L230 160 L250 90" opacity=".6"/>' +
      '<circle cx="10" cy="160" r="3.5"/><circle cx="70" cy="110" r="2.6"/><circle cx="130" cy="130" r="3.2"/><circle cx="190" cy="60" r="4"/><circle cx="250" cy="90" r="2.8"/><circle cx="310" cy="30" r="3.6"/><circle cx="160" cy="180" r="2.4"/><circle cx="230" cy="160" r="2.6"/></svg>');
    sky.appendChild(el('b', 'ax-shine'));
    hero.insertBefore(sky, hero.firstChild);
    const H = {x: 0, y: 0};
    layers.push({ // smoothed parallax inside the hero
      enabled: () => !locked() && !reduce() && canHover,
      draw: dt => {
        const r = hero.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
        const tx = r.width ? Math.max(-.5, Math.min(.5, (ptr.x - r.left) / r.width - .5)) : 0, ty = r.height ? Math.max(-.5, Math.min(.5, (ptr.y - r.top) / r.height - .5)) : 0;
        const e = 1 - Math.pow(.001, dt / 1000 * .9);
        H.x += (tx - H.x) * e; H.y += (ty - H.y) * e;
        sky.style.setProperty('--hx', H.x.toFixed(4)); sky.style.setProperty('--hy', H.y.toFixed(4));
      }
    });

    const text = hero.querySelector('.hero-text');
    if (!text) return;
    const tools = el('div', 'ax-tools');
    const xp = el('div', 'ax-xp', '<b class="lv">Level 1</b><span class="bar"><i></i></span><small class="pts">0 / 100 XP</small>');
    xp.title = 'Earn XP: +30 per submitted assignment, +20 per graded course, +10 per enrolled course';
    xp.setAttribute('role', 'status');

    const tip = el('button', 'ax-tip', '<svg class="ic" aria-hidden="true"><use href="#i-spark"/></svg><span></span>');
    tip.type = 'button'; tip.title = 'Click for another tip';
    let ti = Math.floor(Math.random() * TIPS.length);
    const setTip = () => { tip.querySelector('span').textContent = TIPS[ti]; tip.classList.remove('swap'); void tip.offsetWidth; tip.classList.add('swap'); };
    tip.addEventListener('click', () => { ti = (ti + 1) % TIPS.length; setTip(); });
    setTip();

    const timer = el('div', 'ax-timer', '<span class="ax-time" role="timer" aria-live="off">25:00</span><button type="button" data-go>Start focus</button><button type="button" data-reset aria-label="Reset focus timer">Reset</button>');
    const out = timer.querySelector('.ax-time'), go = timer.querySelector('[data-go]');
    const LEN = 25 * 60; let left = LEN, id = 0;
    const paint = () => { out.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'); };
    const halt = () => { clearInterval(id); id = 0; timer.dataset.run = '0'; go.textContent = left === LEN ? 'Start focus' : 'Resume'; };
    go.addEventListener('click', () => {
      if (id) { halt(); return; }
      timer.dataset.run = '1'; go.textContent = 'Pause';
      id = setInterval(() => {
        left--; paint();
        if (document.hidden) document.title = out.textContent + ' | Focus';
        if (left <= 0) {
          halt(); left = LEN; paint(); go.textContent = 'Start focus'; document.title = DOC_TITLE;
          window.alert('Focus session done. Take a 5-minute break.');
          const r = timer.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 22);
        }
      }, 1000);
    });
    timer.querySelector('[data-reset]').addEventListener('click', () => { halt(); left = LEN; paint(); document.title = DOC_TITLE; });
    tools.append(xp, timer, tip);
    text.appendChild(tools);
  }

  function refreshXP() {
    const xp = document.querySelector('.ax-xp');
    if (!xp || typeof myWork !== 'function') return;
    safe(() => {
      const submitted = myWork().filter(w => w.sub).length;
      const list = active();
      const graded = list.filter(({e}) => gradeOf(e)).length;
      const pts = submitted * 30 + graded * 20 + list.length * 10;
      const lvl = Math.floor(pts / 100) + 1, into = pts % 100;
      xp.querySelector('.lv').textContent = 'Level ' + lvl + ' \u00b7 ' + TITLES[Math.min(lvl - 1, TITLES.length - 1)];
      xp.querySelector('.pts').textContent = into + ' / 100 XP';
      xp.querySelector('.bar i').style.width = into + '%';
      const key = 'ax-level-' + (typeof me !== 'undefined' && me ? (me.id || me.email || 'u') : 'u');
      let prev = 0; try { prev = +sessionStorage.getItem(key) || 0; sessionStorage.setItem(key, lvl); } catch (e) { /* storage blocked */ }
      if (prev && lvl > prev) {
        xp.classList.remove('up'); void xp.offsetWidth; xp.classList.add('up');
        const r = xp.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 26);
        window.alert('Level up! You reached level ' + lvl + '.');
      }
    });
  }

  /* ---------------------------------------------------------------------
     5. Scroll bar, page entrances, theme cross-fade
     --------------------------------------------------------------------- */
  const bar = el('div', 'ax-progress'); bar.setAttribute('aria-hidden', 'true'); body.appendChild(bar);
  let sp = 0;
  const onScroll = () => { if (sp) return; sp = requestAnimationFrame(() => { sp = 0; const max = root.scrollHeight - innerHeight; bar.style.setProperty('--ax-scroll', max > 0 ? Math.min(1, scrollY / max).toFixed(3) : 0); }); };
  addEventListener('scroll', onScroll, {passive: true}); addEventListener('resize', onScroll);

  const titleEl = $('title');
  if (titleEl) new MutationObserver(() => setTimeout(() => {
    if (reduce()) return;
    const page = document.querySelector('#view .page:not([hidden])');
    if (!page) return;
    page.querySelectorAll('.stat, .card, .course-card, .tile, .tablewrap, .item, .pf-stat, .pf-panel, .hero').forEach((n, i) => {
      n.style.setProperty('--ax-i', Math.min(i, 12));
      n.classList.remove('ax-in'); void n.offsetWidth; n.classList.add('ax-in');
      n.addEventListener('animationend', function f(ev) { if (ev.animationName === 'axIn') { n.classList.remove('ax-in'); n.removeEventListener('animationend', f); } });
    });
  }, 40)).observe(titleEl, {childList: true});

  let themeT = 0;
  new MutationObserver(() => {
    root.classList.add('ax-theming'); clearTimeout(themeT);
    themeT = setTimeout(() => root.classList.remove('ax-theming'), 700);
    scheduleGuard(760);
  }).observe(root, {attributes: true, attributeFilter: ['data-theme']});

  /* ---------------------------------------------------------------------
     6. Contrast guard: if any text ends up hard to read on its background
        (in either theme), switch just that text to ivory or midnight.
     --------------------------------------------------------------------- */
  const parse = c => {
    const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return p.length < 3 || p.some(isNaN) ? null : {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1};
  };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const IVORY = {r: 244, g: 240, b: 230}, MIDNIGHT = {r: 21, g: 28, b: 44};
  const fixed = new Map(); // element -> original inline colour + priority
  let guardT = 0;

  function backdrop(node, cache) {
    const stack = [];
    let base = null;
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      if (cache.has(n)) { base = cache.get(n); if (base === null) { cache.set(node, null); return null; } break; }
      const cs = getComputedStyle(n), bg = parse(cs.backgroundColor);
      if (bg && bg.a >= .5) { stack.push(bg); if (bg.a >= .9) break; }
      else if (cs.backgroundImage && cs.backgroundImage !== 'none') { cache.set(node, null); cache.set(n, null); return null; } // gradient or picture: cannot judge safely
      else if (bg && bg.a > 0) stack.push(bg);
    }
    if (!base) {
      base = {r: 255, g: 255, b: 255};
      if (!stack.length) { const b = parse(getComputedStyle(body).backgroundColor); if (b && b.a > .5) base = b; }
    }
    for (let i = stack.length - 1; i >= 0; i--) { const l = stack[i]; base = {r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a)}; }
    cache.set(node, base);
    return base;
  }

  function runGuard() {
    for (const [n, o] of fixed) { if (o.v) n.style.setProperty('color', o.v, o.p); else n.style.removeProperty('color'); n.removeAttribute('data-ax-fix'); }
    fixed.clear();
    const cache = new Map(), seen = new Set();
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {acceptNode: n => n.nodeValue.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
    const targets = [];
    for (let n = walker.nextNode(); n && targets.length < 2500; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || seen.has(p) || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(p.tagName) || p.closest('.ax-fx, .ax-motes, [data-ax-skip]')) continue;
      seen.add(p); targets.push(p);
    }
    document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea').forEach(i => targets.push(i));
    for (const t of targets) {
      if (!t.getClientRects().length) continue;
      const cs = getComputedStyle(t);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const bg = backdrop(t, cache), fg = parse(cs.color);
      if (!bg || !fg) continue;
      const eff = fg.a < 1 ? {r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a)} : fg;
      const r0 = ratio(eff, bg);
      if (r0 >= 3) continue;
      const best = ratio(IVORY, bg) >= ratio(MIDNIGHT, bg) ? IVORY : MIDNIGHT;
      if (ratio(best, bg) < r0 + 1.5) continue;
      fixed.set(t, {v: t.style.getPropertyValue('color'), p: t.style.getPropertyPriority('color')});
      t.style.setProperty('color', `rgb(${best.r}, ${best.g}, ${best.b})`, 'important');
      t.setAttribute('data-ax-fix', '1');
    }
  }
  function scheduleGuard(delay) {
    clearTimeout(guardT);
    guardT = setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(() => safe(runGuard), {timeout: 1500}) : safe(runGuard)), delay == null ? 450 : delay);
  }
  const viewEl = $('view');
  if (viewEl) new MutationObserver(() => scheduleGuard(450)).observe(viewEl, {childList: true, subtree: true});
  new MutationObserver(() => scheduleGuard(500)).observe(body, {attributes: true, attributeFilter: ['class']});

  /* ---------------------------------------------------------------------
     7. Wire up
     --------------------------------------------------------------------- */
  safe(buildSky);
  safe(buildMotes);
  safe(buildHero);
  const heroName = $('hero-name'), dashCourses = $('dash-courses');
  if (heroName) new MutationObserver(refreshXP).observe(heroName, {childList: true});
  if (dashCourses) new MutationObserver(refreshXP).observe(dashCourses, {childList: true});
  safe(refreshXP);
  safe(onScroll);
  if (reduce()) layers.forEach(l => safe(() => l.enabled() && l.draw(0, 0))); else startLoop();
  reduceMQ.addEventListener && reduceMQ.addEventListener('change', () => { if (!reduce()) startLoop(); });
  scheduleGuard(900);
})();
/* ==== AX THEME END ==== */

/* ==========================================================================
   Admin panel (separate from the motion layer above)
   ========================================================================== */
/* Acadaelash admin panel (Phase 1): shell, dashboard, student records, activity log, settings, Ctrl+K command bar.
   Loaded after the portal script. Admin writes go only through SQL functions that verify the admin login
   (admin_change_password, admin_create_admin, admin_list_audit). It never changes student-portal behaviour. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const cred = () => { try { return JSON.parse(sessionStorage.getItem('cred')); } catch (e) { return null; } };
  async function rpc(fn, args) {
    const c = cred();
    if (!c) throw new Error('Please log in again.');
    const {data, error} = await sb.rpc(fn, Object.assign({p_email: c.email, p_hash: c.hash}, args || {}));
    if (error) throw new Error(error.message);
    return data;
  }
  const say = m => { try { alert(m); } catch (e) { /* ignore */ } };
  const VIEWS = [['dashboard', 'Dashboard'], ['students', 'Students'], ['courses', 'Courses'], ['enrollments', 'Enrollments'], ['grades', 'Grades'], ['content', 'Modules & assignments'], ['submissions', 'Submissions'], ['quiz', 'Quiz bank'], ['sections', 'Sections'], ['announcements', 'Announcements'], ['reports', 'Reports'], ['activity', 'Activity log'], ['settings', 'Settings']];
  let acct = null, root = null, cur = 'dashboard', q = '';

  function build() {
    root = document.createElement('div');
    root.id = 'admin-root';
    root.hidden = true;
    root.innerHTML = `<div class="ad-side"><div class="ad-brand"><b>Acad<em>aelash</em></b><span>Admin Panel</span></div>
      <div id="ad-nav">${VIEWS.map(v => `<button data-v="${v[0]}">${v[1]}</button>`).join('')}</div>
      <button class="ad-ghost" id="ad-classic">Classic portal view</button>
      <button class="ad-ghost" id="ad-out">Log out</button></div>
      <div class="ad-main"><header class="ad-top"><h1 id="ad-title"></h1>
        <button class="ad-cmd" id="ad-cmdbtn">Search or run a command <kbd>Ctrl K</kbd></button>
        <span class="ad-who" id="ad-who"></span></header><section id="ad-view"></section></div>
      <div class="ad-pal" id="ad-pal" hidden><div class="ad-pbox"><input id="ad-pin" placeholder="Type a command or a student name or ID" autocomplete="off"><ul id="ad-plist"></ul></div></div>`;
    document.body.appendChild(root);
    const back = document.createElement('button');
    back.id = 'adm-back'; back.type = 'button'; back.textContent = 'Back to Admin Panel';
    back.onclick = () => { document.body.classList.remove('admin-classic'); open(acct); };
    document.body.appendChild(back);
    // New passwords and emails: remove spaces and disallowed characters while typing (the current-password box is left alone).
    root.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'pw0' || (t.type !== 'password' && t.type !== 'email')) return;
      if (cleanInput(t)) say('Not allowed. ' + RULE_TEXT + '. No spaces.');
    }, true);
    root.addEventListener('keydown', e => {
      const t = e.target;
      if (e.key === ' ' && t.id !== 'pw0' && (t.type === 'password' || t.type === 'email')) e.preventDefault();
    });
    $('ad-nav').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) go(b.dataset.v); };
    $('ad-out').onclick = () => $('logout').click();
    $('ad-classic').onclick = () => classic();
    $('ad-cmdbtn').onclick = () => pal(true);
    $('ad-pal').onclick = e => { if (e.target.id === 'ad-pal') pal(false); };
    $('ad-pin').oninput = () => list($('ad-pin').value);
    $('ad-pin').onkeydown = palKey;
    document.addEventListener('keydown', e => {
      if (root.hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal($('ad-pal').hidden); }
      else if (e.key === 'Escape') pal(false);
    });
    new MutationObserver(() => {
      const cl = document.body.classList;   // only act when something needs closing, or this observer would re-trigger itself forever
      if (cl.contains('locked') && (cl.contains('admin-mode') || cl.contains('admin-classic') || !root.hidden)) {
        cl.remove('admin-mode', 'admin-classic'); root.hidden = true; pal(false);
      }
    }).observe(document.body, {attributes: true, attributeFilter: ['class']});
  }

  function open(a) {
    acct = {role: a.role, student_id: a.student_id, full_name: a.full_name};
    sessionStorage.setItem('acct', JSON.stringify(acct));
    if (!root) build();
    document.body.classList.add('admin-mode');
    document.body.classList.remove('admin-classic');
    root.hidden = false;
    $('ad-who').textContent = acct.full_name;
    go(cur);
  }
  function classic(view) {
    document.body.classList.remove('admin-mode');
    document.body.classList.add('admin-classic');
    root.hidden = true;
    enter(Object.assign({}, acct, {classic: true}));
    if (view) { const b = document.querySelector(`#nav [data-view="${view}"]`); if (b) b.click(); }
  }
  function go(v) {
    cur = v;
    $('ad-title').textContent = (VIEWS.find(x => x[0] === v) || [, ''])[1];
    $('ad-nav').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    ({dashboard, students, courses, enrollments, grades, content, submissions, quiz, sections, announcements, reports, activity, settings}[v] || dashboard)();
    window.scrollTo(0, 0);
  }
  const V = html => { $('ad-view').onclick = null; $('ad-view').innerHTML = html; };

  /* Dashboard */
  async function dashboard() {
    const sp = db.student_profiles || [], en = db.enrollment_data || [], co = db.courses || [];
    const enrolled = en.filter(e => e.enrollment_status === 'Enrolled');
    const per = co.map(c => [c.course_name, enrolled.filter(e => e.course_code === c.course_code).length]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...per.map(p => p[1]));
    V(`<div class="ad-stats">${[['Students', sp.length], ['Courses', co.length], ['Active enrollments', enrolled.length], ['Grades recorded', (db.grades_data || []).length]]
      .map(s => `<div class="ad-stat"><b>${s[1]}</b><span>${s[0]}</span></div>`).join('')}</div>
      <div class="ad-grid"><div class="ad-card"><h3>Enrollment by course</h3>${per.map(p => `<div class="ad-bar"><span>${esc(p[0])}</span><i style="--w:${p[1] / max * 100}%"></i><b>${p[1]}</b></div>`).join('') || '<p class="ad-mute">No courses yet.</p>'}</div>
      <div class="ad-card"><h3>Recent activity</h3><div id="ad-recent"><p class="ad-mute">Loading...</p></div></div></div>`);
    try { $('ad-recent').innerHTML = feed(await rpc('admin_list_audit', {p_limit: 8})); }
    catch (e) { $('ad-recent').innerHTML = `<p class="ad-mute">${esc(e.message)}</p>`; }
  }
  const feed = rows => rows && rows.length ? '<ul class="ad-feed">' + rows.map(r => `<li><b>${esc(r.action.replace(/_/g, ' '))}</b> ${esc(r.target || '')}<small>${esc(r.admin_name || '')} &bull; ${new Date(r.at).toLocaleString('en-PH')}</small></li>`).join('') + '</ul>' : '<p class="ad-mute">No activity yet.</p>';

  /* Shared helpers: reload public tables after a write, and a small form dialog */
  async function reload(...ts) { for (const t of ts) { const {data} = await sb.from(t).select('*'); if (data) db[t] = data; } }
  function dlg(title, fields, vals, onSave, label, info) {
    const d = document.createElement('div');
    d.className = 'ad-pal';
    d.innerHTML = `<div class="ad-dbox" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${info || ''}<form class="ad-form">${fields.map(f => `<label>${esc(f.l)}${f.t === 'select'
      ? `<select name="${f.n}">${f.o.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`
      : f.t === 'textarea' ? `<textarea name="${f.n}" rows="5"${f.req ? ' required' : ''}></textarea>`
      : `<input name="${f.n}" type="${f.t || 'text'}"${f.req ? ' required' : ''}${f.step ? ` step="${f.step}"` : ''}${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''} autocomplete="off">`}</label>`).join('')}
      <p class="ad-msg bad" role="alert"></p><div class="ad-row"><button class="ad-btn" type="submit">${esc(label || 'Save')}</button><button class="ad-btn ad-alt" type="button">Cancel</button></div></form></div>`;
    root.appendChild(d);
    const f = d.querySelector('form'), m = d.querySelector('.ad-msg'), close = () => d.remove();
    fields.forEach(x => { if (vals && vals[x.n] != null) f.elements[x.n].value = vals[x.n]; });
    d.onclick = e => { if (e.target === d) close(); };
    f.querySelector('.ad-alt').onclick = close;
    f.onsubmit = async e => {
      e.preventDefault();
      const v = {}; fields.forEach(x => { v[x.n] = f.elements[x.n].value; });
      try { await onSave(v); close(); } catch (ex) { m.textContent = ex.message; }
    };
    const first = f.querySelector('input,select,textarea'); if (first) first.focus();
    return d;
  }
  const btn = (a, id, t, cls) => `<button data-a="${a}" data-id="${esc(id)}"${cls ? ` class="${cls}"` : ''}>${t}</button>`;
  const needPw = p => { const m = pwProblem(p); if (m) throw new Error(m); };   // rules live in index.html

  /* Students: add, edit, delete, suspend or activate, reset password */
  async function students() {
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-sq" class="ad-in" placeholder="Filter by name, ID, program" value="${esc(q)}"><button class="ad-btn" id="ad-add">Add student</button></div>
      <div class="ad-tw"><table><thead><tr><th>ID</th><th>Name</th><th>Program</th><th>Year</th><th>Record</th><th>Login</th><th></th></tr></thead><tbody id="ad-sb"><tr><td colspan="7">Loading...</td></tr></tbody></table></div></div>`);
    q = '';
    const acc = {};
    try { (await rpc('admin_list_accounts') || []).forEach(a => { acc[a.student_id] = a; }); } catch (e) { say(e.message); }
    const draw = () => {
      const t = $('ad-sq').value.toLowerCase();
      $('ad-sb').innerHTML = (db.student_profiles || []).filter(s => !t || [s.student_id, s.first_name, s.last_name, s.program].join(' ').toLowerCase().includes(t)).map(s => {
        const a = acc[s.student_id];
        return `<tr><td>${esc(s.student_id)}</td><td>${esc(s.first_name + ' ' + s.last_name)}</td><td>${esc(s.program)}</td><td>${esc(s.year_level)}</td><td>${esc(s.enrollment_status)}</td>
          <td>${a ? esc(a.status) : '<span class="ad-mute">No login</span>'}</td><td class="ad-act">${btn('edit', s.student_id, 'Edit')}${a ? btn('pw', s.student_id, 'Password') + btn('st', s.student_id, a.status === 'active' ? 'Suspend' : 'Activate') : ''}${btn('del', s.student_id, 'Delete', 'bad')}</td></tr>`;
      }).join('') || '<tr><td colspan="7">No matching students.</td></tr>';
    };
    $('ad-sq').oninput = draw; draw();
    const after = async () => { await reload('student_profiles', 'enrollment_data', 'grades_data'); students(); };
    $('ad-add').onclick = () => dlg('Add student', [
      {n: 'sid', l: 'Student ID', req: 1}, {n: 'first', l: 'First name', req: 1}, {n: 'last', l: 'Last name', req: 1},
      {n: 'mail', l: 'Email', t: 'email', req: 1}, {n: 'program', l: 'Program', req: 1}, {n: 'year', l: 'Year level (for example 1st Year)', req: 1},
      {n: 'pw', l: 'Starting password (optional; 8+ characters, letters, numbers and @ . - _ # only, no spaces; leave empty if the student will register)', t: 'password'}], null, async v => {
      { const m = emailProblem(v.mail); if (m) throw new Error(m); }
      let h = null;
      if (v.pw) { needPw(v.pw); h = await hashPassword(v.mail.trim().toLowerCase(), v.pw); }
      await rpc('admin_add_student', {p_first: v.first, p_last: v.last, p_student_email: v.mail, p_student_id: v.sid, p_program: v.program, p_year: v.year, p_new_hash: h});
      await after(); say('Student added.');
    }, 'Add student');
    $('ad-sb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const sid = b.dataset.id, s = db.student_profiles.find(x => x.student_id === sid), a = acc[sid], name = s.first_name + ' ' + s.last_name;
      if (b.dataset.a === 'edit') dlg('Edit ' + name, [
        {n: 'first', l: 'First name', req: 1}, {n: 'last', l: 'Last name', req: 1}, {n: 'program', l: 'Program', req: 1}, {n: 'year', l: 'Year level', req: 1},
        {n: 'status', l: 'Enrollment status', t: 'select', o: [['Enrolled', 'Enrolled'], ['Not Enrolled', 'Not Enrolled'], ['Dropped', 'Dropped']]}],
        {first: s.first_name, last: s.last_name, program: s.program, year: s.year_level, status: s.enrollment_status}, async v => {
          await rpc('admin_update_student', {p_student_id: sid, p_first: v.first, p_last: v.last, p_program: v.program, p_year: v.year, p_status: v.status});
          await after();
        });
      else if (b.dataset.a === 'pw') dlg('Reset password: ' + name, [{n: 'pw', l: 'New password (8+ characters; letters, numbers and @ . - _ # only, no spaces)', t: 'password', req: 1}], null, async v => {
        needPw(v.pw);
        await rpc('admin_reset_password', {p_student_id: sid, p_new_hash: await hashPassword(String(a.email).toLowerCase(), v.pw)});
        say('Password reset. Tell the student their new password.');
      }, 'Reset password');
      else if (b.dataset.a === 'st') {
        const to = a.status === 'active' ? 'suspended' : 'active';
        if (confirm(`${to === 'suspended' ? 'Suspend' : 'Activate'} the login for ${name}?`)) rpc('admin_set_account_status', {p_student_id: sid, p_status: to}).then(after).catch(x => say(x.message));
      } else if (b.dataset.a === 'del') dlg('Delete ' + name, [{n: 'c', l: `This permanently deletes the record, login, enrollments, grades and progress. Type ${sid} to confirm.`, req: 1}], null, async v => {
        if (v.c.trim().toUpperCase() !== sid.toUpperCase()) throw new Error('The ID does not match.');
        await rpc('admin_delete_student', {p_student_id: sid});
        await after();
      }, 'Delete student');
    };
  }

  /* Grades: enter, edit and return grades to students */
  function grades() {
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-gq" class="ad-in" placeholder="Filter by student or course"><span class="ad-mute">Saving a score returns it to the student's Grades page (0 to 100).</span></div>
      <div class="ad-tw"><table><thead><tr><th>Student</th><th>Course</th><th>Score</th><th>Remarks</th><th></th></tr></thead><tbody id="ad-gb"></tbody></table></div></div>`);
    const rows = () => (db.enrollment_data || []).filter(e => e.enrollment_status === 'Enrolled').map(e => ({e, id: String(e.enrollment_id),
      s: (db.student_profiles || []).find(x => x.student_id === e.student_id), c: (db.courses || []).find(x => x.course_code === e.course_code), g: (db.grades_data || []).find(x => x.enrollment_id === e.enrollment_id)}));
    const nm = r => (r.s ? r.s.first_name + ' ' + r.s.last_name : r.e.student_id);
    const draw = () => {
      const t = $('ad-gq').value.toLowerCase();
      $('ad-gb').innerHTML = rows().filter(r => !t || (nm(r) + ' ' + (r.c ? r.c.course_name : '')).toLowerCase().includes(t)).map(r =>
        `<tr><td>${esc(nm(r))}</td><td>${esc(r.c ? r.c.course_name : r.e.course_code)}</td><td>${r.g ? esc(r.g.score) : '<span class="ad-mute">Not graded</span>'}</td><td>${r.g ? esc(r.g.remarks || '') : ''}</td>
        <td class="ad-act">${btn('g', r.id, r.g ? 'Edit' : 'Return grade')}${r.g ? btn('gc', r.id, 'Clear', 'bad') : ''}</td></tr>`).join('') || '<tr><td colspan="5">No enrollments yet.</td></tr>';
    };
    $('ad-gq').oninput = draw; draw();
    $('ad-gb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const r = rows().find(x => x.id === b.dataset.id);
      const done = async () => { await reload('grades_data'); grades(); };
      if (b.dataset.a === 'g') dlg(`${nm(r)}: ${r.c ? r.c.course_name : ''}`, [{n: 'score', l: 'Score (0 to 100)', t: 'number', step: '0.01', min: 0, max: 100, req: 1}, {n: 'remarks', l: 'Remarks (optional)'}],
        r.g ? {score: r.g.score, remarks: r.g.remarks || ''} : null, async v => { await rpc('admin_save_grade', {p_enrollment_id: r.e.enrollment_id, p_score: Number(v.score), p_remarks: v.remarks}); await done(); }, 'Return grade');
      else if (confirm('Remove this grade from the student\'s record?')) rpc('admin_clear_grade', {p_enrollment_id: r.e.enrollment_id}).then(done).catch(x => say(x.message));
    };
  }

  /* Modules and assignments */
  function content() {
    const subs = (db.subjects || []).map(s => { const c = (db.courses || []).find(x => x.subject_id === s.subject_id); return [s.subject_id, s.subject_code + (c ? ' - ' + c.course_name : '')]; });
    const sn = id => (subs.find(x => x[0] === id) || [, id])[1];
    const when = d => new Date(d).toLocaleString('en-PH', {dateStyle: 'medium', timeStyle: 'short'});
    V(`<div class="ad-grid"><div class="ad-card"><div class="ad-row"><h3>Modules</h3><button class="ad-btn" id="ad-addm">Add module</button></div><div class="ad-tw"><table><thead><tr><th>Subject</th><th>#</th><th>Title</th><th></th></tr></thead><tbody id="ad-mb"></tbody></table></div></div>
      <div class="ad-card"><div class="ad-row"><h3>Assignments</h3><button class="ad-btn" id="ad-adda">Add assignment</button></div><div class="ad-tw"><table><thead><tr><th>Subject</th><th>Title</th><th>Due</th><th></th></tr></thead><tbody id="ad-ab"></tbody></table></div></div></div>`);
    $('ad-mb').innerHTML = (db.modules || []).slice().sort((a, b) => a.subject_id - b.subject_id || a.module_no - b.module_no).map(m =>
      `<tr><td>${esc(sn(m.subject_id))}</td><td>${esc(m.module_no)}</td><td>${esc(m.title)}</td><td class="ad-act">${btn('me', m.module_id, 'Edit')}${btn('md', m.module_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="4">No modules yet.</td></tr>';
    $('ad-ab').innerHTML = (db.assignments || []).slice().sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).map(a =>
      `<tr><td>${esc(sn(a.subject_id))}</td><td>${esc(a.title)}</td><td>${esc(when(a.due_date))}</td><td class="ad-act">${btn('ae', a.assignment_id, 'Edit')}${btn('ad', a.assignment_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="4">No assignments yet.</td></tr>';
    const SUB = {n: 'subject', l: 'Subject', t: 'select', o: subs};
    const mf = [SUB, {n: 'no', l: 'Module number', t: 'number', min: 1, req: 1}, {n: 'title', l: 'Title', req: 1}, {n: 'desc', l: 'Description (optional)'}, {n: 'file', l: 'File path or link (optional)'}];
    const af = [SUB, {n: 'title', l: 'Title', req: 1}, {n: 'due', l: 'Deadline', t: 'datetime-local', req: 1}];
    const saveM = id => async v => { await rpc('admin_save_module', {p_id: id, p_subject: Number(v.subject), p_no: Number(v.no), p_title: v.title, p_desc: v.desc, p_file: v.file}); await reload('modules'); content(); };
    const saveA = id => async v => { await rpc('admin_save_assignment', {p_id: id, p_subject: Number(v.subject), p_title: v.title, p_due: v.due}); await reload('assignments'); content(); };
    $('ad-addm').onclick = () => dlg('Add module', mf, null, saveM(null), 'Add module');
    $('ad-adda').onclick = () => dlg('Add assignment', af, null, saveA(null), 'Add assignment');
    $('ad-view').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const id = Number(b.dataset.id), k = b.dataset.a;
      if (k === 'me') { const m = db.modules.find(x => x.module_id === id); dlg('Edit module', mf, {subject: m.subject_id, no: m.module_no, title: m.title, desc: m.description || '', file: m.file_path || ''}, saveM(id)); }
      else if (k === 'ae') { const a = db.assignments.find(x => x.assignment_id === id); dlg('Edit assignment', af, {subject: a.subject_id, title: a.title, due: String(a.due_date).slice(0, 16)}, saveA(id)); }
      else if (k === 'md' && confirm('Delete this module?')) rpc('admin_delete_module', {p_id: id}).then(() => reload('modules')).then(content).catch(x => say(x.message));
      else if (k === 'ad' && confirm('Delete this assignment?')) rpc('admin_delete_assignment', {p_id: id}).then(() => reload('assignments')).then(content).catch(x => say(x.message));
    };
  }

  /* Courses: create, edit, delete, assign instructor */
  function courses() {
    const subs = (db.subjects || []).map(s => [s.subject_id, s.subject_code]);
    const sc = id => (subs.find(x => x[0] === id) || [, id])[1];
    const n = c => (db.enrollment_data || []).filter(e => e.course_code === c && e.enrollment_status === 'Enrolled').length;
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-cq" class="ad-in" placeholder="Filter courses"><button class="ad-btn" id="ad-addc">Add course</button></div>
      <div class="ad-tw"><table><thead><tr><th>Code</th><th>Course</th><th>Subject</th><th>Instructor</th><th>Units</th><th>School year</th><th>Enrolled</th><th></th></tr></thead><tbody id="ad-cb"></tbody></table></div></div>`);
    const draw = () => {
      const t = $('ad-cq').value.toLowerCase();
      $('ad-cb').innerHTML = (db.courses || []).filter(c => !t || [c.course_name, c.instructor, c.department].join(' ').toLowerCase().includes(t)).map(c =>
        `<tr><td>${esc(c.course_code)}</td><td>${esc(c.course_name)}</td><td>${esc(sc(c.subject_id))}</td><td>${esc(c.instructor)}</td><td>${esc(c.units)}</td><td>${esc(c.school_year)}</td><td>${n(c.course_code)}</td>
        <td class="ad-act">${btn('ce', c.course_code, 'Edit')}${btn('cd', c.course_code, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="8">No courses.</td></tr>';
    };
    $('ad-cq').oninput = draw; draw();
    const fl = [{n: 'subject', l: 'Subject', t: 'select', o: subs}, {n: 'name', l: 'Course name', req: 1}, {n: 'dept', l: 'Department', req: 1},
      {n: 'units', l: 'Units', t: 'number', min: 1, req: 1}, {n: 'inst', l: 'Instructor (assigned teacher)', req: 1}, {n: 'sy', l: 'School year (for example 2026-2027)', req: 1}];
    const save = id => async v => { await rpc('admin_save_course', {p_id: id, p_subject: Number(v.subject), p_name: v.name, p_department: v.dept, p_units: Number(v.units), p_instructor: v.inst, p_school_year: v.sy}); await reload('courses'); courses(); };
    const last = (db.courses || [])[ (db.courses || []).length - 1 ] || {};
    $('ad-addc').onclick = () => dlg('Add course', fl, {sy: last.school_year || '', dept: last.department || ''}, save(null), 'Add course');
    $('ad-cb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const id = Number(b.dataset.id), c = db.courses.find(x => x.course_code === id);
      if (b.dataset.a === 'ce') dlg('Edit course', fl, {subject: c.subject_id, name: c.course_name, dept: c.department, units: c.units, inst: c.instructor, sy: c.school_year}, save(id));
      else if (confirm(`Delete ${c.course_name}? Courses with enrollments cannot be deleted.`)) rpc('admin_delete_course', {p_id: id}).then(() => reload('courses')).then(courses).catch(x => say(x.message));
    };
  }

  /* Enrollments: enroll, remove (drop), transfer between courses */
  function enrollments() {
    const sn = id => { const s = (db.student_profiles || []).find(x => x.student_id === id); return s ? s.first_name + ' ' + s.last_name : id; };
    const cn = id => { const c = (db.courses || []).find(x => x.course_code === id); return c ? c.course_name : id; };
    const copts = (db.courses || []).map(c => [c.course_code, `${c.course_name} (${c.school_year})`]);
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-eq" class="ad-in" placeholder="Filter by student or course"><button class="ad-btn" id="ad-adde">Enroll student</button>
      <span class="ad-mute">Removing marks an enrollment Dropped. Transferring clears the old course's grade.</span></div>
      <div class="ad-tw"><table><thead><tr><th>Student</th><th>Course</th><th>Semester</th><th>Status</th><th></th></tr></thead><tbody id="ad-eb"></tbody></table></div></div>`);
    const draw = () => {
      const t = $('ad-eq').value.toLowerCase();
      $('ad-eb').innerHTML = (db.enrollment_data || []).filter(e => !t || (sn(e.student_id) + ' ' + e.student_id + ' ' + cn(e.course_code)).toLowerCase().includes(t)).map(e =>
        `<tr><td>${esc(sn(e.student_id))}<br><small class="ad-mute">${esc(e.student_id)}</small></td><td>${esc(cn(e.course_code))}</td><td>${esc(e.semester)} ${esc(e.school_year)}</td><td>${esc(e.enrollment_status)}</td>
        <td class="ad-act">${e.enrollment_status === 'Enrolled' ? btn('er', e.enrollment_id, 'Remove', 'bad') + btn('et', e.enrollment_id, 'Transfer') : ''}</td></tr>`).join('') || '<tr><td colspan="5">No enrollments.</td></tr>';
    };
    $('ad-eq').oninput = draw; draw();
    const done = async () => { await reload('enrollment_data', 'grades_data'); enrollments(); };
    $('ad-adde').onclick = () => dlg('Enroll student', [{n: 'sid', l: 'Student', t: 'select', o: (db.student_profiles || []).map(s => [s.student_id, `${s.student_id} - ${s.first_name} ${s.last_name}`])},
      {n: 'course', l: 'Course', t: 'select', o: copts}], null, async v => { await rpc('admin_enroll_student', {p_student_id: v.sid, p_course_code: Number(v.course)}); await done(); }, 'Enroll');
    $('ad-eb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const id = Number(b.dataset.id), en = db.enrollment_data.find(x => x.enrollment_id === id);
      if (b.dataset.a === 'er') { if (confirm(`Remove ${sn(en.student_id)} from ${cn(en.course_code)}?`)) rpc('admin_remove_enrollment', {p_enrollment_id: id}).then(done).catch(x => say(x.message)); }
      else dlg(`Transfer ${sn(en.student_id)}`, [{n: 'course', l: 'Move to course', t: 'select', o: copts.filter(o => o[0] !== en.course_code)}], null,
        async v => { await rpc('admin_transfer_enrollment', {p_enrollment_id: id, p_new_course: Number(v.course)}); await done(); }, 'Transfer');
    };
  }

  /* Submissions: view student work, score it and write feedback */
  async function submissions() {
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-bq" class="ad-in" placeholder="Filter by student, assignment or subject"><span class="ad-mute">Open a submission to read it, score it (0 to 100) and leave feedback.</span></div>
      <div class="ad-tw"><table><thead><tr><th>Student</th><th>Assignment</th><th>Subject</th><th>Submitted</th><th>Score</th><th></th></tr></thead><tbody id="ad-bb"><tr><td colspan="6">Loading...</td></tr></tbody></table></div></div>`);
    let rows = [];
    try { rows = await rpc('admin_list_submissions', {p_limit: 300}) || []; } catch (e) { $('ad-bb').innerHTML = `<tr><td colspan="6">${esc(e.message)}</td></tr>`; return; }
    const draw = () => {
      const t = $('ad-bq').value.toLowerCase();
      $('ad-bb').innerHTML = rows.filter(r => !t || [r.student, r.assignment, r.subject].join(' ').toLowerCase().includes(t)).map(r =>
        `<tr><td>${esc(r.student)}</td><td>${esc(r.assignment)}</td><td>${esc(r.subject)}</td><td>${esc(new Date(r.submitted_at).toLocaleString('en-PH'))}${r.late ? ' <b class="bad-t">Late</b>' : ''}</td>
        <td>${r.score == null ? '<span class="ad-mute">Not reviewed</span>' : esc(r.score)}</td><td class="ad-act">${btn('rv', r.submission_id, r.score == null && !r.feedback ? 'Review' : 'Edit review')}</td></tr>`).join('') || '<tr><td colspan="6">No submissions yet.</td></tr>';
    };
    $('ad-bq').oninput = draw; draw();
    $('ad-bb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const r = rows.find(x => String(x.submission_id) === b.dataset.id);
      dlg(`${r.student}: ${r.assignment}`, [{n: 'score', l: 'Score (0 to 100, optional)', t: 'number', step: '0.01', min: 0, max: 100}, {n: 'fb', l: 'Feedback', t: 'textarea'}],
        {score: r.score == null ? '' : r.score, fb: r.feedback || ''}, async v => {
          await rpc('admin_review_submission', {p_id: Number(r.submission_id), p_score: v.score === '' ? null : Number(v.score), p_feedback: v.fb});
          submissions();
        }, 'Save review', `<div class="ad-sub">${esc(r.content)}</div>`);
    };
  }

  /* Announcements: create, edit, delete, publish or hide (shown on the student dashboard) */
  async function announcements() {
    V(`<div class="ad-card"><div class="ad-row"><h3>Announcements</h3><button class="ad-btn" id="ad-adan">New announcement</button></div>
      <div class="ad-tw"><table><thead><tr><th>Title</th><th>Status</th><th>Posted</th><th>By</th><th></th></tr></thead><tbody id="ad-nb"><tr><td colspan="5">Loading...</td></tr></tbody></table></div></div>`);
    let rows = [];
    try { rows = await rpc('admin_list_announcements') || []; } catch (e) { $('ad-nb').innerHTML = `<tr><td colspan="5">${esc(e.message)}</td></tr>`; return; }
    $('ad-nb').innerHTML = rows.map(r => `<tr><td>${esc(r.title)}</td><td>${r.published ? 'Published' : 'Hidden'}</td><td>${esc(new Date(r.created_at).toLocaleDateString('en-PH'))}</td><td>${esc(r.created_by || '')}</td>
      <td class="ad-act">${btn('ne', r.announcement_id, 'Edit')}${btn('nd', r.announcement_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="5">No announcements yet.</td></tr>';
    const fl = [{n: 'title', l: 'Title', req: 1}, {n: 'body', l: 'Message', t: 'textarea', req: 1}, {n: 'pub', l: 'Visibility', t: 'select', o: [['yes', 'Published (students see it)'], ['no', 'Hidden']]}];
    const save = id => async v => { await rpc('admin_save_announcement', {p_id: id, p_title: v.title, p_body: v.body, p_published: v.pub === 'yes'}); announcements(); };
    $('ad-adan').onclick = () => dlg('New announcement', fl, {pub: 'yes'}, save(null), 'Publish');
    $('ad-nb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const r = rows.find(x => String(x.announcement_id) === b.dataset.id);
      if (b.dataset.a === 'ne') dlg('Edit announcement', fl, {title: r.title, body: r.body, pub: r.published ? 'yes' : 'no'}, save(Number(r.announcement_id)));
      else if (confirm('Delete this announcement?')) rpc('admin_delete_announcement', {p_id: Number(r.announcement_id)}).then(announcements).catch(x => say(x.message));
    };
  }

  /* Quiz bank: add, edit and delete quiz questions per lesson */
  async function quiz() {
    V('<div class="ad-card"><p class="ad-mute">Loading...</p></div>');
    let d;
    try { d = await rpc('admin_list_quiz'); } catch (e) { V(`<div class="ad-card"><p class="ad-mute">${esc(e.message)}</p></div>`); return; }
    const sc = id => ((db.subjects || []).find(s => s.subject_id === id) || {}).subject_code || '';
    const lessons = d.lessons || [], qs = d.questions || [];
    const lopts = lessons.map(l => [l.lesson_id, `${sc(l.subject_id)} M${l.module_no}.${l.lesson_no} ${l.title}`]);
    V(`<div class="ad-card"><div class="ad-row"><select id="ad-ql" class="ad-in">${lopts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('') || '<option value="">No lessons</option>'}</select>
      <button class="ad-btn" id="ad-addq">Add question</button><span class="ad-mute">The correct answer is highlighted.</span></div>
      <div class="ad-tw"><table><thead><tr><th>Question</th><th>Options</th><th></th></tr></thead><tbody id="ad-qb"></tbody></table></div></div>`);
    const cur = () => Number($('ad-ql').value);
    const draw = () => {
      $('ad-qb').innerHTML = qs.filter(q => q.lesson_id === cur()).map(q =>
        `<tr><td>${esc(q.prompt)}</td><td>${q.options.map((o, i) => `<div class="${i === q.answer ? 'ad-ok' : ''}">${i + 1}. ${esc(o)}</div>`).join('')}</td>
        <td class="ad-act">${btn('qe', q.question_id, 'Edit')}${btn('qd', q.question_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="3">No questions for this lesson yet.</td></tr>';
    };
    $('ad-ql').onchange = draw; draw();
    const fl = [{n: 'prompt', l: 'Question', t: 'textarea', req: 1}, {n: 'o1', l: 'Option 1', req: 1}, {n: 'o2', l: 'Option 2', req: 1}, {n: 'o3', l: 'Option 3 (optional)'}, {n: 'o4', l: 'Option 4 (optional)'},
      {n: 'ans', l: 'Correct option', t: 'select', o: [[0, 'Option 1'], [1, 'Option 2'], [2, 'Option 3'], [3, 'Option 4']]}, {n: 'exp', l: 'Explanation shown after answering (optional)'}];
    const save = (id, lesson) => async v => {
      const opts = [v.o1, v.o2, v.o3, v.o4].map(x => x.trim()).filter(Boolean);
      if (Number(v.ans) >= opts.length || ![v.o1, v.o2, v.o3, v.o4].slice(0, Number(v.ans) + 1).every(x => x.trim())) throw new Error('The correct option must be one you filled in, and options must be filled in order.');
      await rpc('admin_save_question', {p_id: id, p_lesson: lesson, p_prompt: v.prompt, p_options: opts, p_answer: Number(v.ans), p_explanation: v.exp});
      const keep = cur(); await quiz(); if ($('ad-ql')) { $('ad-ql').value = keep; $('ad-ql').onchange(); }
    };
    $('ad-addq').onclick = () => { if (cur()) dlg('Add question', fl, {ans: 0}, save(null, cur()), 'Add question'); };
    $('ad-qb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const q = qs.find(x => String(x.question_id) === b.dataset.id);
      if (b.dataset.a === 'qe') dlg('Edit question', fl, {prompt: q.prompt, o1: q.options[0], o2: q.options[1], o3: q.options[2] || '', o4: q.options[3] || '', ans: q.answer, exp: q.explanation || ''}, save(q.question_id, q.lesson_id));
      else if (confirm('Delete this question?')) rpc('admin_delete_question', {p_id: q.question_id}).then(async () => { const keep = cur(); await quiz(); $('ad-ql').value = keep; $('ad-ql').onchange(); }).catch(x => say(x.message));
    };
  }

  /* Sections: class sections, schedules and student lists */
  async function sections() {
    V('<div class="ad-card"><p class="ad-mute">Loading...</p></div>');
    let rows = [];
    try { rows = await rpc('admin_list_sections') || []; } catch (e) { V(`<div class="ad-card"><p class="ad-mute">${esc(e.message)}</p></div>`); return; }
    const copts = (db.courses || []).map(c => [c.course_code, `${c.course_name} (${c.school_year})`]);
    V(`<div class="ad-card"><div class="ad-row"><h3>Class sections</h3><button class="ad-btn" id="ad-adds">Add section</button></div>
      <div class="ad-tw"><table><thead><tr><th>Section</th><th>Course</th><th>Schedule</th><th>Room</th><th>Students</th><th></th></tr></thead><tbody id="ad-xb"></tbody></table></div></div>`);
    $('ad-xb').innerHTML = rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.course_name || r.course_code)}</td><td>${esc([r.days, r.start_time && r.end_time ? r.start_time + ' to ' + r.end_time : ''].filter(Boolean).join(' '))}</td>
      <td>${esc(r.room || '')}</td><td>${r.student_ids.length}</td><td class="ad-act">${btn('xs', r.section_id, 'Students')}${btn('xe', r.section_id, 'Edit')}${btn('xd', r.section_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="6">No sections yet.</td></tr>';
    const DAYS = ['', 'MWF', 'TTh', 'MW', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => [x, x || 'No fixed day']);
    const fl = [{n: 'name', l: 'Section name (for example BSIT 1-A)', req: 1}, {n: 'course', l: 'Course', t: 'select', o: copts}, {n: 'days', l: 'Days', t: 'select', o: DAYS},
      {n: 'start', l: 'Start time', t: 'time'}, {n: 'end', l: 'End time', t: 'time'}, {n: 'room', l: 'Room'}];
    const save = id => async v => { await rpc('admin_save_section', {p_id: id, p_name: v.name, p_course: Number(v.course), p_days: v.days, p_start: v.start, p_end: v.end, p_room: v.room}); sections(); };
    $('ad-adds').onclick = () => dlg('Add section', fl, null, save(null), 'Add section');
    $('ad-xb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const r = rows.find(x => String(x.section_id) === b.dataset.id);
      if (b.dataset.a === 'xe') dlg('Edit section', fl, {name: r.name, course: r.course_code, days: r.days || '', start: r.start_time || '', end: r.end_time || '', room: r.room || ''}, save(Number(r.section_id)));
      else if (b.dataset.a === 'xd') { if (confirm(`Delete section ${r.name}?`)) rpc('admin_delete_section', {p_id: Number(r.section_id)}).then(sections).catch(x => say(x.message)); }
      else {
        const cand = (db.enrollment_data || []).filter(en => en.course_code === r.course_code && en.enrollment_status === 'Enrolled').map(en => en.student_id);
        const list = [...new Set(cand)].map(id => { const s = (db.student_profiles || []).find(x => x.student_id === id); return [id, s ? `${id} - ${s.first_name} ${s.last_name}` : id]; });
        const dd = dlg(`Students in ${r.name}`, [], null, async () => {
          await rpc('admin_set_section_students', {p_id: Number(r.section_id), p_ids: [...dd.querySelectorAll('.ad-chk:checked')].map(i => i.value)});
          sections();
        }, 'Save students', list.length ? `<div class="ad-checks">${list.map(o => `<label><input type="checkbox" class="ad-chk" value="${esc(o[0])}"${r.student_ids.includes(o[0]) ? ' checked' : ''}> ${esc(o[1])}</label>`).join('')}</div>` : '<p class="ad-mute">No students are enrolled in this course yet.</p>');
      }
    };
  }

  /* Reports: course performance, student progress, quiz results, with CSV export */
  function csv(name, head, rows) {
    const cell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + [head].concat(rows).map(r => r.map(cell).join(',')).join('\r\n')], {type: 'text/csv'}));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  const avg = a => a.length ? (a.reduce((x, y) => x + Number(y), 0) / a.length).toFixed(2) : '';
  async function reports() {
    const en = db.enrollment_data || [], gr = db.grades_data || [], today = new Date().toISOString().slice(0, 10);
    const scoreOf = e => { const g = gr.find(x => x.enrollment_id === e.enrollment_id); return g ? Number(g.score) : null; };
    const crsHead = ['Course', 'School year', 'Instructor', 'Enrolled', 'Graded', 'Average score', 'Passed (75+)', 'Assignments'];
    const crs = (db.courses || []).map(c => {
      const es = en.filter(e => e.course_code === c.course_code && e.enrollment_status === 'Enrolled'), sc = es.map(scoreOf).filter(x => x != null);
      return [c.course_name, c.school_year, c.instructor, es.length, sc.length, avg(sc), sc.filter(x => x >= 75).length, (db.assignments || []).filter(a => a.subject_id === c.subject_id).length];
    });
    const stuHead = ['Student ID', 'Name', 'Program', 'Year', 'Courses enrolled', 'Graded', 'Average score', 'Failed (below 75)'];
    const stu = (db.student_profiles || []).map(s => {
      const es = en.filter(e => e.student_id === s.student_id && e.enrollment_status === 'Enrolled'), sc = es.map(scoreOf).filter(x => x != null);
      return [s.student_id, s.first_name + ' ' + s.last_name, s.program, s.year_level, es.length, sc.length, avg(sc), sc.filter(x => x < 75).length];
    });
    const table = (h, r) => `<div class="ad-tw"><table><thead><tr>${h.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${r.map(x => `<tr>${x.map(y => `<td>${esc(y)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${h.length}">Nothing to report yet.</td></tr>`}</tbody></table></div>`;
    V(`<div class="ad-card"><div class="ad-row"><h3>Course performance</h3><button class="ad-btn" data-x="c">Export CSV</button></div>${table(crsHead, crs)}</div>
      <div class="ad-card" style="margin-top:16px"><div class="ad-row"><h3>Student progress</h3><button class="ad-btn" data-x="s">Export CSV</button></div>${table(stuHead, stu)}</div>
      <div class="ad-card" style="margin-top:16px"><div class="ad-row"><h3>Quiz results</h3><button class="ad-btn" data-x="q">Export CSV</button></div><div id="ad-qr"><p class="ad-mute">Loading...</p></div></div>`);
    let qh = ['Student', 'Lesson', 'Score', 'Out of', 'Result', 'Taken'], qr = [];
    try {
      qr = (await rpc('admin_list_quiz_attempts', {p_limit: 300}) || []).map(a => [a.student, a.lesson, a.score, a.total, a.passed ? 'Passed' : 'Not passed', new Date(a.taken_at).toLocaleString('en-PH')]);
      if ($('ad-qr')) $('ad-qr').innerHTML = table(qh, qr);
    } catch (e) { if ($('ad-qr')) $('ad-qr').innerHTML = `<p class="ad-mute">${esc(e.message)}</p>`; }
    $('ad-view').onclick = e => {
      const b = e.target.closest('button[data-x]');
      if (!b) return;
      if (b.dataset.x === 'c') csv(`course-performance-${today}.csv`, crsHead, crs);
      else if (b.dataset.x === 's') csv(`student-progress-${today}.csv`, stuHead, stu);
      else csv(`quiz-results-${today}.csv`, qh, qr);
    };
  }

  /* Activity log */
  async function activity() {
    V('<div class="ad-card"><div id="ad-all"><p class="ad-mute">Loading...</p></div></div>');
    try { $('ad-all').innerHTML = feed(await rpc('admin_list_audit', {p_limit: 100})); }
    catch (e) { $('ad-all').innerHTML = `<p class="ad-mute">${esc(e.message)}</p>`; }
  }

  /* Settings: fixed name, change password, create admin */
  function settings() {
    const c = cred() || {};
    V(`<div class="ad-grid"><div class="ad-card"><h3>Your account</h3>
      <dl class="ad-kv"><dt>Name (fixed)</dt><dd>${esc(acct.full_name)}</dd><dt>Email</dt><dd>${esc(c.email)}</dd><dt>Role</dt><dd>Administrator</dd></dl>
      <p class="ad-mute">This name is used for every record and log entry you make. It cannot be edited here.</p>
      <h3>Change password</h3><form id="ad-pw" class="ad-form">
        <label>Current password<input type="password" id="pw0" autocomplete="current-password" required></label>
        <label>New password (8+ characters; letters, numbers and @ . - _ # only, no spaces)<input type="password" id="pw1" autocomplete="new-password" minlength="8" required></label>
        <label>Confirm new password<input type="password" id="pw2" autocomplete="new-password" minlength="8" required></label>
        <button class="ad-btn" type="submit">Update password</button><p class="ad-msg" id="pwm" role="status"></p></form></div>
      <div class="ad-card"><h3>Create admin account</h3><form id="ad-new" class="ad-form">
        <label>Full name (fixed once created)<input id="na-name" required minlength="3"></label>
        <label>Email<input type="email" id="na-mail" required></label>
        <label>Starting password (8+ characters; letters, numbers and @ . - _ # only, no spaces)<input type="password" id="na-pw" autocomplete="new-password" minlength="8" required></label>
        <button class="ad-btn" type="submit">Create admin</button><p class="ad-msg" id="nam" role="status"></p></form></div></div>`);
    const note = (id, m, bad) => { $(id).textContent = m; $(id).className = 'ad-msg' + (bad ? ' bad' : ''); };
    $('ad-pw').onsubmit = async e => {
      e.preventDefault();
      const cr = cred(), a = $('pw0').value, b = $('pw1').value;
      try {
        if (await hashPassword(cr.email, a) !== cr.hash) throw new Error('Current password is incorrect.');
        { const m = pwProblem(b); if (m) throw new Error(m); }
        if (b !== $('pw2').value) throw new Error('The new passwords do not match.');
        const h = await hashPassword(cr.email, b);
        await rpc('admin_change_password', {p_new_hash: h});
        sessionStorage.setItem('cred', JSON.stringify({email: cr.email, hash: h}));
        $('ad-pw').reset(); note('pwm', 'Password updated.');
      } catch (ex) { note('pwm', ex.message, true); }
    };
    $('ad-new').onsubmit = async e => {
      e.preventDefault();
      try {
        const mail = $('na-mail').value.trim().toLowerCase();
        { const m = emailProblem(mail) || pwProblem($('na-pw').value); if (m) throw new Error(m); }
        await rpc('admin_create_admin', {p_new_email: mail, p_full_name: $('na-name').value, p_new_hash: await hashPassword(mail, $('na-pw').value)});
        $('ad-new').reset(); note('nam', 'Admin account created.');
      } catch (ex) { note('nam', ex.message, true); }
    };
  }

  /* Command bar */
  let items = [], sel = 0;
  const CMDS = [
    ['Open dashboard', () => go('dashboard')], ['Open students', () => go('students')], ['Add student', () => { go('students'); setTimeout(() => $('ad-add') && $('ad-add').click(), 150); }], ['Open grades: return grades', () => go('grades')], ['Open courses', () => go('courses')], ['Add course', () => { go('courses'); setTimeout(() => $('ad-addc') && $('ad-addc').click(), 50); }], ['Enroll a student', () => { go('enrollments'); setTimeout(() => $('ad-adde') && $('ad-adde').click(), 50); }], ['Open reports: export grades', () => go('reports')], ['Review submissions', () => go('submissions')], ['Open quiz bank', () => go('quiz')], ['Open sections and schedules', () => go('sections')], ['New announcement', () => { go('announcements'); setTimeout(() => $('ad-adan') && $('ad-adan').click(), 400); }], ['Open modules and assignments', () => go('content')], ['Create assignment', () => { go('content'); setTimeout(() => $('ad-adda') && $('ad-adda').click(), 50); }], ['Create module', () => { go('content'); setTimeout(() => $('ad-addm') && $('ad-addm').click(), 50); }], ['Open activity log', () => go('activity')],
    ['Open settings: change password', () => go('settings')], ['Create admin account', () => go('settings')],
    ['Enrollment periods (classic view)', () => classic('enrollments')], ['Classic portal view', () => classic()], ['Log out', () => $('logout').click()]
  ];
  function pal(on) {
    $('ad-pal').hidden = !on;
    if (on) { $('ad-pin').value = ''; list(''); setTimeout(() => $('ad-pin').focus(), 0); }
  }
  function list(t) {
    t = t.trim().toLowerCase();
    items = CMDS.filter(c => !t || c[0].toLowerCase().includes(t)).map(c => ({label: c[0], run: c[1]}));
    if (t.length >= 2) (db.student_profiles || []).filter(s => [s.student_id, s.first_name, s.last_name].join(' ').toLowerCase().includes(t)).slice(0, 6)
      .forEach(s => items.push({label: `Student: ${s.first_name} ${s.last_name} (${s.student_id})`, run: () => { q = s.student_id; go('students'); }}));
    sel = 0; paint();
  }
  function paint() {
    $('ad-plist').innerHTML = items.map((i, n) => `<li data-n="${n}" class="${n === sel ? 'on' : ''}">${esc(i.label)}</li>`).join('') || '<li class="ad-mute">No match</li>';
    $('ad-plist').querySelectorAll('li[data-n]').forEach(li => li.onclick = () => runSel(+li.dataset.n));
  }
  function runSel(n) { const i = items[n]; if (i) { pal(false); i.run(); } }
  function palKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); runSel(sel); }
  }

  window.AdminPanel = {open};
})();

/* Acadaelash LMS: interaction and motion layer.
   Additive only. Loaded after every other script. The motion layer below never calls Supabase, never writes data,
   never changes routing, auth, enrollment or grading logic. It only decorates what the portal
   already renders (CSS classes, small decorative elements) and respects prefers-reduced-motion.
   Matching styles live in style.css, section "23. Interaction and motion layer".
   The Admin panel section at the end of this file is separate: it does call Supabase (admin SQL functions only);
   its styles are in style.css section "24. Admin panel". */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const raf = requestAnimationFrame;
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => mq.matches;                       // checked at event time, so a live OS change is honoured
  const body = document.body;
  const locked = () => body.classList.contains('locked');
  const safe = fn => { try { return fn(); } catch (e) { return undefined; } };
  const watch = (el, opts, fn) => { if (el) new MutationObserver(fn).observe(el, opts); };

  /* 1. Landing page: drifting gold particles behind the hero ------------------------------ */
  (function particles() {
    const hero = $('lp-home');
    const cv = document.createElement('canvas');
    if (!hero || !cv.getContext) return;
    cv.className = 'fx-particles';
    cv.setAttribute('aria-hidden', 'true');
    hero.insertBefore(cv, hero.firstChild);
    const ctx = cv.getContext('2d');
    const COLORS = ['214,173,69', '232,203,120', '121,102,168'];
    let W = 0, H = 0, ps = [], timer = 0, t0 = 0;

    const make = () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2.1 + .8,
      vy: -(Math.random() * .22 + .06), vx: (Math.random() - .5) * .12,
      a: Math.random() * .45 + .15, ph: Math.random() * 6.28, c: COLORS[(Math.random() * COLORS.length) | 0]
    });
    function size() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = hero.clientWidth; H = hero.clientHeight;
      if (!W || !H) return false;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(34, Math.max(12, W / 40)));
      while (ps.length < n) ps.push(make());
      ps.length = n;
      return true;
    }
    function frame(now) {
      timer = 0;
      if (!running()) return;
      ctx.clearRect(0, 0, W, H);
      const t = (now - t0) / 1000;
      for (const p of ps) {
        p.y += p.vy; p.x += p.vx + Math.sin(t * .6 + p.ph) * .08;
        if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
        if (p.x < -6) p.x = W + 6; else if (p.x > W + 6) p.x = -6;
        const a = p.a * (.65 + .35 * Math.sin(t * 1.4 + p.ph));
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.c},${a.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      }
      timer = raf(frame);
    }
    const running = () => locked() && !document.hidden && !still() && hero.clientWidth > 0;
    function sync() {
      if (running()) { if (!timer && size()) { t0 = performance.now(); timer = raf(frame); } }
      else if (timer) { cancelAnimationFrame(timer); timer = 0; }
      if (!running()) ctx.clearRect(0, 0, cv.width, cv.height);
    }
    watch(body, {attributes: true, attributeFilter: ['class']}, sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', () => { if (timer && !size()) sync(); });
    if (mq.addEventListener) mq.addEventListener('change', sync);
    sync();
  })();

  /* 2. Landing page: remember which way the form switched, so CSS can slide it ------------- */
  (function authSwitch() {
    const panel = $('lp-panel'), up = $('signupForm');
    watch(up, {attributes: true, attributeFilter: ['hidden']}, () => { if (panel) panel.dataset.dir = up.hidden ? 'back' : 'fwd'; });
  })();

  /* 3. Pointer tilt and glare on stat cards and course cards (mouse only) ------------------ */
  (function tilt() {
    const SEL = '.stat, .course-card';
    let el = null, frame = 0, px = 0, py = 0;
    function paint() {
      frame = 0;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.min(1, Math.max(0, (px - r.left) / r.width)), y = Math.min(1, Math.max(0, (py - r.top) / r.height));
      el.style.setProperty('--fx-ry', ((x - .5) * 9).toFixed(2) + 'deg');
      el.style.setProperty('--fx-rx', ((.5 - y) * 9).toFixed(2) + 'deg');
      el.style.setProperty('--fx-gx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--fx-gy', (y * 100).toFixed(1) + '%');
    }
    function engage(c) {
      el = c;
      c.classList.add('fx-tilt');
      if (!c.querySelector(':scope > .fx-glare')) {
        const g = document.createElement('span');
        g.className = 'fx-glare';
        g.setAttribute('aria-hidden', 'true');
        c.appendChild(g);
      }
    }
    function release() {
      if (!el) return;
      el.classList.remove('fx-tilt');
      ['--fx-rx', '--fx-ry', '--fx-gx', '--fx-gy'].forEach(v => el.style.removeProperty(v));
      el = null;
    }
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || still() || locked()) { release(); return; }
      const c = e.target.closest ? e.target.closest(SEL) : null;
      if (c !== el) { release(); if (c) engage(c); }
      if (el) { px = e.clientX; py = e.clientY; if (!frame) frame = raf(paint); }
    }, {passive: true});
    document.addEventListener('pointerout', e => { if (!e.relatedTarget) release(); });
    document.addEventListener('scroll', release, {passive: true, capture: true});
  })();

  /* 4. Scroll reveal for sections, and a one-time sheen on progress bars and rings -------- */
  (function scrollFx() {
    if (!('IntersectionObserver' in window) || !$('view')) return;
    // Only elements that have no entrance animation of their own (direct children of .page already rise in).
    const REVEAL = '.tile, .panel-card, .kv > div, .dash-main > .sec-head, .dash-main > .tablewrap';
    const rv = new IntersectionObserver(es => {
      let k = 0;
      es.forEach(en => {
        if (!en.isIntersecting) return;
        const t = en.target;
        rv.unobserve(t);
        t.style.transitionDelay = Math.min(k++, 5) * 70 + 'ms';
        raf(() => t.classList.add('fx-in'));
        setTimeout(() => { t.classList.remove('fx-reveal', 'fx-in'); t.style.transitionDelay = ''; }, 1200);
      });
    }, {threshold: .1, rootMargin: '0px 0px -5% 0px'});
    const mt = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('fx-inview'); mt.unobserve(en.target); }
    }), {threshold: .4});
    let queued = false;
    function scan() {
      queued = false;
      document.querySelectorAll('#view .meter:not([data-fx-m]), #view .ring:not([data-fx-m])').forEach(el => { el.dataset.fxM = '1'; mt.observe(el); });
      if (still()) return;
      document.querySelectorAll(REVEAL).forEach(el => {
        if (el.dataset.fxSeen || !el.offsetParent) return;      // not visible yet: look again when its page is shown
        el.dataset.fxSeen = '1';
        if (el.getBoundingClientRect().top > window.innerHeight * .92) { el.classList.add('fx-reveal'); rv.observe(el); }
      });
    }
    const queue = () => { if (!queued) { queued = true; raf(scan); } };
    watch($('view'), {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']}, queue);
    queue();
  })();

  /* 5. Navigation: staggered drawer items, quick-access pending dot ------------------------ */
  (function navigation() {
    document.querySelectorAll('#nav button').forEach((b, i) => b.style.setProperty('--n', i));
    const fab = $('qfab');
    if (!fab) return;
    const upd = () => {
      let n = 0;
      safe(() => { n = pendingList().length; });                // read-only helper from the portal script
      fab.classList.toggle('fx-has-pending', n > 0);
    };
    watch($('title'), {childList: true}, upd);
    if ($('view')) $('view').addEventListener('click', () => setTimeout(upd, 80));
    upd();
  })();

  /* 6. Views, theme switch, toasts, loading skeletons ------------------------------------- */
  (function globalFx() {
    // Page transition: replay a soft fade on every view change (the title is rewritten by show()).
    watch($('title'), {childList: true}, () => {
      const v = $('view');
      if (!v || still() || locked()) return;
      v.classList.remove('fx-view-in'); void v.offsetWidth; v.classList.add('fx-view-in');
    });
    // Smooth light/dark switch: colours cross-fade for a moment (capture, so it runs before the theme is applied).
    let tt = 0;
    document.addEventListener('click', e => {
      if (!e.target.closest('[data-theme-opt]') || still()) return;
      const r = document.documentElement;
      r.classList.add('fx-theme-anim');
      clearTimeout(tt);
      tt = setTimeout(() => r.classList.remove('fx-theme-anim'), 650);
    }, true);
    // Toast countdown bar.
    const boxes = $('toasts');
    watch(boxes, {childList: true}, recs => recs.forEach(r => r.addedNodes.forEach(n => {
      if (n.nodeType !== 1 || !n.classList.contains('toast') || still()) return;
      const bar = document.createElement('i');
      bar.className = 'fx-toast-bar';
      bar.setAttribute('aria-hidden', 'true');
      n.appendChild(bar);
    })));
  })();

  /* 7. Modules and lessons ----------------------------------------------------------------- */
  const SPARK = ['#D6AD45', '#E8CB78', '#F4F0E6', '#7966A8', '#FFC93C'];
  function burst(el) {
    if (still() || !el || !el.animate) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 40);
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('span');
      const ang = Math.random() * 6.2832, dist = 70 + Math.random() * 120, size = 5 + Math.random() * 6;
      s.className = 'fx-spark';
      s.setAttribute('aria-hidden', 'true');
      s.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${(size * (Math.random() < .5 ? 1 : .45)).toFixed(1)}px;background:${SPARK[i % SPARK.length]}`;
      document.body.appendChild(s);
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 30;
      const a = s.animate([
        {transform: 'translate(-50%,-50%) rotate(0deg) scale(1)', opacity: 1},
        {transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${(dy + 90).toFixed(0)}px)) rotate(${(Math.random() * 540 - 270).toFixed(0)}deg) scale(.4)`, opacity: 0}
      ], {duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards'});
      a.onfinish = () => s.remove();
    }
  }

  (function learning() {
    const root = $('mod-root');
    if (!root) return;
    let burstUntil = 0, prevKey = '', prevIdx = -1, queued = false;

    // Remember a real click on "Mark lesson complete" (capture: modules.js disables the button synchronously).
    document.addEventListener('click', e => {
      const b = e.target.closest('#complete');
      if (b && !b.disabled) burstUntil = Date.now() + 8000;
    }, true);

    function process() {
      queued = false;
      if (still()) return;

      // Progress bars grow from zero when a view is drawn (e.g. after completing a lesson).
      root.querySelectorAll('.meter i[style*="width"]:not([data-fx-bar])').forEach(i => {
        i.dataset.fxBar = '1';
        const w = i.style.width;
        i.style.transition = 'none'; i.style.width = '0%'; void i.offsetWidth; i.style.transition = '';
        raf(() => raf(() => { i.style.width = w; }));
      });

      // Cards and lessons pop in with a stagger (initial render and every filter or sort change).
      let k = 0;
      root.querySelectorAll('.modcard:not([data-fx-pop]), .lesson-list > li:not([data-fx-pop])').forEach(el => {
        el.dataset.fxPop = '1';
        el.style.setProperty('--fx-d', Math.min(k++, 10) * 45 + 'ms');
        el.classList.add('fx-pop');
      });

      // Skeleton shimmer while the learning data loads.
      root.querySelectorAll('.card:not([data-fx-sk]), #quiz > p:not([data-fx-sk])').forEach(c => {
        if (c.children.length || !/^Loading/i.test(c.textContent.trim())) return;
        c.dataset.fxSk = '1';
        c.classList.add('fx-loading');
        c.insertAdjacentHTML('beforeend', '<span class="fx-sk" aria-hidden="true"></span><span class="fx-sk s" aria-hidden="true"></span>');
      });

      // Slide between lessons: forward or back in the lesson list, a fade when entering a course.
      const nav = root.querySelector('.lesson-nav'), main = root.querySelector('.lesson-main');
      if (!main) { prevKey = ''; prevIdx = -1; }
      else if (nav && !main.dataset.fxSlide) {
        main.dataset.fxSlide = '1';
        const idx = [...nav.querySelectorAll('a')].findIndex(a => a.classList.contains('on'));
        const key = (nav.querySelector('b') || {}).textContent || '';
        if (key !== prevKey) main.classList.add('fx-slide-fade');
        else if (prevIdx >= 0 && idx !== prevIdx) main.classList.add(idx > prevIdx ? 'fx-slide-fwd' : 'fx-slide-back');
        prevKey = key; prevIdx = idx;
      }

      // Gold burst once the lesson is really completed.
      const c = $('complete');
      if (c && c.disabled && /Completed/.test(c.textContent) && !c.dataset.fxDone) {
        c.dataset.fxDone = '1';
        if (Date.now() < burstUntil) { burstUntil = 0; c.classList.add('fx-done'); burst(c); }
      }

      // Quiz result: animated pass / not-passed feedback, burst on a pass.
      const q = $('qres');
      if (q) {
        const txt = q.textContent.trim();
        if (txt && q.dataset.fxSeen !== txt) {
          q.dataset.fxSeen = txt;
          const pass = /Passed\./.test(txt), fail = /Not passed/i.test(txt);
          q.classList.remove('fx-pass', 'fx-fail', 'fx-result');
          if (pass || fail) { void q.offsetWidth; q.classList.add('fx-result', pass ? 'fx-pass' : 'fx-fail'); }
          if (pass) burst(q);
        }
      }
    }
    watch(root, {childList: true, subtree: true}, () => { if (!queued) { queued = true; raf(process); } });
  })();

  /* 8. Assignment dialog: success checkmark after a submission --------------------------- */
  (function submitOk() {
    const go = $('sub-go');
    if (!go) return;
    go.addEventListener('click', () => {            // a disabled button never fires click, so this is a real submit
      if (still()) return;
      const o = document.createElement('div');
      o.className = 'fx-ok';
      o.setAttribute('role', 'status');
      o.innerHTML = '<div class="fx-ok-card"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28"/><path d="M19 33l9 9 17-19"/></svg><span>Assignment submitted</span></div>';
      document.body.appendChild(o);
      setTimeout(() => o.classList.add('out'), 1500);
      setTimeout(() => o.remove(), 1850);
    });
  })();
})();

/* ==== AX THEME START ==== */
/* Acadaelash theme layer v3: visual and interactive polish only.
   One shared animation loop (eased with delta time, so it stays smooth on slow and
   fast screens), canvas effects instead of many DOM nodes, and an automatic
   contrast guard so text stays readable in light and dark mode.
   Never touches Supabase, db, sessions or any existing handler. */
;(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const body = document.body, root = document.documentElement;
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = () => reduceMQ.matches;
  const canHover = matchMedia('(hover: hover)').matches;
  const safe = fn => { try { return fn(); } catch (e) { /* decoration must never break the portal */ } };
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const locked = () => body.classList.contains('locked');
  const night = () => root.getAttribute('data-theme') === 'dark'; // theme choice, also used by the login page
  const dark = () => root.getAttribute('data-theme') === 'dark' && !locked();
  const DPR = () => Math.min(window.devicePixelRatio || 1, 1.5);
  const ptr = {x: innerWidth / 2, y: innerHeight / 3, moved: false, touch: false};
  const layers = []; // everything that draws each frame registers here

  /* ---------------------------------------------------------------------
     1. Landing page: constellation sky, glyphs, bubbles, seal
     --------------------------------------------------------------------- */
  const GLYPHS = {
    pencil: '<path d="M4 20l1.2-4.6L16.6 4a2.1 2.1 0 013 3L8.2 18.4 4 20z"/><path d="M14.5 6.1l3.4 3.4"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5z"/><path d="M8 7h8M8 11h6"/>',
    atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>',
    sigma: '<path d="M18 5H6l7 7-7 7h12"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
    ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.5" transform="rotate(-20 12 12)"/><path d="M7 9.4v2.2M10.5 8.1v3M14 6.9v2.2M17.5 5.6v3"/>',
    cap: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    pi: '<path d="M5 7h14M9 7v11M15 7v8c0 2 1 3 3 3"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.6 1.6 0 001.4 2.4h12.2a1.6 1.6 0 001.4-2.4L14 9V3"/><path d="M7.5 15h9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
  };
  const PLACE = [ // glyph, x%, y%, size, rotation, depth, bob seconds, tone
    ['pencil', 6, 16, 64, -18, 1.4, 9, ''], ['atom', 44, 8, 58, 0, 1.0, 11, 'v'], ['book', 90, 14, 62, 12, 1.6, 10, ''],
    ['sigma', 12, 70, 50, 8, .8, 8, 's'], ['bulb', 49, 82, 58, -8, 1.2, 12, ''], ['cap', 92, 74, 66, 14, 1.5, 9, 'v'],
    ['ruler', 30, 40, 56, 25, .7, 13, 's'], ['pi', 70, 6, 46, -6, 1.1, 10, 's'], ['flask', 3, 44, 52, 10, 1.3, 11, 'v'],
    ['globe', 66, 90, 52, 0, .9, 12, 's']
  ];

  function makeConstellation(cv, host) {
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1, stars = [], shoot = null, nextShoot = 3500;
    const m = {x: -9999, y: -9999, on: false};
    const GOLD = '214,173,69';
    function size() {
      dpr = DPR(); w = host.clientWidth; h = host.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(120, Math.max(40, w * h / 15000)));
      stars = Array.from({length: n}, () => ({x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5 + .4,
        vx: (Math.random() - .5) * .16, vy: (Math.random() - .5) * .16, p: Math.random() * 6.28, gold: Math.random() < .28}));
    }
    function draw(dt, t) {
      if (!w) return;
      const k = reduce() ? 0 : dt / 16.7;
      ctx.clearRect(0, 0, w, h);
      const LINK = 118, MR = 170;
      for (const s of stars) {
        s.x += s.vx * k; s.y += s.vy * k;
        if (s.x < -10) s.x = w + 10; else if (s.x > w + 10) s.x = -10;
        if (s.y < -10) s.y = h + 10; else if (s.y > h + 10) s.y = -10;
        const tw = .55 + .45 * Math.sin(t / 700 + s.p);
        ctx.beginPath();
        ctx.fillStyle = s.gold ? `rgba(${GOLD},${.6 * tw + .3})` : (night() ? `rgba(244,240,230,${.5 * tw + .2})` : `rgba(83,101,125,${.4 * tw + .15})`);
        ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
      ctx.lineWidth = .7;
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i];
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy;
          if (d < LINK * LINK) {
            ctx.strokeStyle = `rgba(${GOLD},${(1 - Math.sqrt(d) / LINK) * (night() ? .5 : .38)})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        if (m.on) {
          const dx = a.x - m.x, dy = a.y - m.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < MR) {
            ctx.strokeStyle = night() ? `rgba(240,215,142,${(1 - d / MR) * .85})` : `rgba(199,158,54,${(1 - d / MR) * .8})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.x, m.y); ctx.stroke(); ctx.lineWidth = .7;
            a.x -= dx * .0035 * k; a.y -= dy * .0035 * k;
          }
        }
      }
      if (m.on) {
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 36);
        g.addColorStop(0, 'rgba(214,173,69,.45)'); g.addColorStop(1, 'rgba(214,173,69,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, 36, 0, 6.283); ctx.fill();
      }
      if (k) {
        if (!shoot && t > nextShoot) shoot = {x: Math.random() * w * .8, y: Math.random() * h * .35, l: 0};
        if (shoot) {
          shoot.l += 14 * k; shoot.x += 11 * k; shoot.y += 6 * k;
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - 110, shoot.y - 60);
          const sc = night() ? '255,244,214' : '199,158,54'; g.addColorStop(0, `rgba(${sc},.9)`); g.addColorStop(1, `rgba(${sc},0)`);
          ctx.strokeStyle = g; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - 110, shoot.y - 60); ctx.stroke();
          if (shoot.l > 900 || shoot.x > w + 150) { shoot = null; nextShoot = t + 4000 + Math.random() * 6000; }
        }
      }
    }
    host.addEventListener('pointermove', e => {
      const r = host.getBoundingClientRect(); m.x = e.clientX - r.left; m.y = e.clientY - r.top; m.on = e.pointerType !== 'touch';
    }, {passive: true});
    host.addEventListener('pointerleave', () => { m.on = false; });
    size();
    return {size, draw, host, enabled: () => locked()};
  }

  function buildSky() {
    const hero = document.querySelector('.lp-hero');
    if (!hero || hero.querySelector('.ax-sky')) return;
    const sky = el('div', 'ax-sky'); sky.setAttribute('aria-hidden', 'true');
    const cv = el('canvas', 'ax-stars'); sky.appendChild(cv);
    const seal = el('img', 'ax-seal'); seal.src = 'seal.svg'; seal.alt = ''; seal.setAttribute('aria-hidden', 'true');
    seal.addEventListener('error', () => seal.remove()); sky.appendChild(seal);
    const gl = el('div', 'ax-glyphs'); gl.setAttribute('aria-hidden', 'true');
    PLACE.forEach(([n, x, y, s, r, d, t, tone], i) => {
      const g = el('span', 'ax-glyph' + (tone ? ' ' + tone : ''), `<svg viewBox="0 0 24 24">${GLYPHS[n]}</svg>`);
      g.style.cssText = `--x:${x}%;--y:${y}%;--s:${s}px;--r:${r}deg;--d:${d * 18};--t:${t}s;--dl:${-i * 1.1}s`;
      gl.appendChild(g);
    });
    for (let i = 0; i < 16; i++) {
      const b = el('i', 'ax-bokeh' + (i % 3 === 0 ? ' v' : ''));
      b.style.cssText = `--x:${(Math.random() * 96).toFixed(1)}%;--s:${(14 + Math.random() * 38).toFixed(0)}px;--t:${(14 + Math.random() * 14).toFixed(1)}s;--dl:${(-Math.random() * 20).toFixed(1)}s;--sx:${(Math.random() * 80 - 40).toFixed(0)}px`;
      gl.appendChild(b);
    }
    hero.insertBefore(gl, hero.firstChild);
    hero.insertBefore(sky, hero.firstChild);
    const con = makeConstellation(cv, hero);
    layers.push({draw: (dt, t) => con.draw(dt, t), enabled: con.enabled, resize: con.size});
    // smoothed parallax for the glyphs + gentle 3D tilt for the login card
    const panel = document.querySelector('.lp-panel');
    const P = {px: 0, py: 0, rx: 0, ry: 0};
    layers.push({
      enabled: () => locked() && !reduce() && canHover,
      draw: dt => {
        const r = hero.getBoundingClientRect();
        const tx = r.width ? (ptr.x - r.left) / r.width - .5 : 0, ty = r.height ? (ptr.y - r.top) / r.height - .5 : 0;
        const e = 1 - Math.pow(.001, dt / 1000 * .9);
        P.px += (tx - P.px) * e; P.py += (ty - P.py) * e;
        gl.style.setProperty('--px', P.px.toFixed(4)); gl.style.setProperty('--py', P.py.toFixed(4));
        if (panel && innerWidth > 640) {
          const busy = panel.matches(':focus-within');
          const wantY = busy ? 0 : (ptr.x / innerWidth - .5) * 7, wantX = busy ? 0 : -(ptr.y / innerHeight - .5) * 5;
          P.ry += (wantY - P.ry) * e; P.rx += (wantX - P.rx) * e;
          panel.style.transform = `perspective(1200px) rotateX(${P.rx.toFixed(3)}deg) rotateY(${P.ry.toFixed(3)}deg)`;
        }
      }
    });
  }

  /* Sun / moon switch in the login header. It presses the portal's own theme button,
     so the saved choice and the circular reveal behave exactly like the profile menu. */
  const MOON = '<svg class="ax-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/></svg>';
  const SUN = '<svg class="ax-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>';
  function buildThemeToggle() {
    const cta = document.querySelector('.lp-cta');
    if (!cta || cta.querySelector('.ax-theme-toggle')) return;
    const b = el('button', 'ax-theme-toggle', MOON + SUN); b.type = 'button';
    const label = () => { const d = night(); b.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode'); b.title = d ? 'Light mode' : 'Dark mode'; b.setAttribute('aria-pressed', String(d)); };
    b.addEventListener('click', () => {
      const next = night() ? 'light' : 'dark', r = b.getBoundingClientRect();
      window.__vtOrigin = {x: r.left + r.width / 2, y: r.top + r.height / 2};
      const opt = document.querySelector('[data-theme-opt="' + next + '"]');
      if (opt) opt.click();
      else { root.setAttribute('data-theme', next); try { localStorage.setItem('acadaelash-theme', next); } catch (e) { /* storage blocked */ } }
      setTimeout(() => { window.__vtOrigin = null; }, 1000);
    });
    cta.insertBefore(b, cta.firstChild);
    label();
    new MutationObserver(label).observe(root, {attributes: true, attributeFilter: ['data-theme']});
  }
  function buildWatermarks() { // a big faint copy of each stat's icon, for depth
    document.querySelectorAll('.stat').forEach(s => {
      if (s.querySelector('.ax-wm')) return;
      const ic = s.querySelector('.stat-ic svg'); if (!ic) return;
      const w = ic.cloneNode(true); w.classList.add('ax-wm'); w.setAttribute('aria-hidden', 'true'); w.removeAttribute('style'); s.appendChild(w);
    });
  }

  /* ---------------------------------------------------------------------
     2. Portal: drifting gold motes behind the content + one FX canvas
     --------------------------------------------------------------------- */
  function buildMotes() {
    const cv = el('canvas', 'ax-motes'); cv.setAttribute('aria-hidden', 'true'); body.insertBefore(cv, body.firstChild);
    const ctx = cv.getContext('2d'); let w = 0, h = 0, dpr = 1, motes = [];
    function size() {
      dpr = DPR(); w = innerWidth; h = innerHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      motes = Array.from({length: Math.round(Math.min(34, Math.max(14, w * h / 52000)))}, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.7 + .6, vy: -(Math.random() * .22 + .06), sw: Math.random() * 6.28, sp: Math.random() * .0006 + .0003, a: Math.random() * .35 + .15}));
    }
    layers.push({
      enabled: () => !locked() && !reduce(),
      resize: size,
      draw: (dt, t) => {
        ctx.clearRect(0, 0, w, h);
        const k = dt / 16.7, d = dark();
        for (const m of motes) {
          m.y += m.vy * k; if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w; }
          const x = m.x + Math.sin(t * m.sp + m.sw) * 18, tw = .6 + .4 * Math.sin(t / 900 + m.sw);
          const g = ctx.createRadialGradient(x, m.y, 0, x, m.y, m.r * 5);
          g.addColorStop(0, d ? `rgba(240,215,142,${m.a * tw})` : `rgba(199,158,54,${m.a * tw})`); g.addColorStop(1, 'rgba(214,173,69,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, m.y, m.r * 5, 0, 6.283); ctx.fill();
        }
      }
    });
    size();
  }

  // Sparkles and the cursor dust trail share one canvas (far lighter than DOM nodes)
  const fx = el('canvas', 'ax-fx'); fx.setAttribute('aria-hidden', 'true'); body.appendChild(fx);
  const fctx = fx.getContext('2d'); let fw = 0, fh = 0; const parts = [];
  const fxSize = () => { const d = DPR(); fw = innerWidth; fh = innerHeight; fx.width = Math.round(fw * d); fx.height = Math.round(fh * d); fctx.setTransform(d, 0, 0, d, 0, 0); };
  fxSize();
  function burst(x, y, n) {
    if (reduce()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 1.4 + Math.random() * 3.6;
      parts.push({type: 's', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, r: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, life: 1, decay: .014 + Math.random() * .01});
    }
  }
  function dust(x, y) { parts.push({type: 'd', x, y, vx: (Math.random() - .5) * .6, vy: .25 + Math.random() * .3, r: 1.6 + Math.random() * 1.6, life: 1, decay: .028}); }
  layers.push({
    enabled: () => parts.length > 0,
    draw: dt => {
      const k = dt / 16.7;
      fctx.clearRect(0, 0, fw, fh);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx * k; p.y += p.vy * k; p.life -= p.decay * k;
        if (p.type === 's') { p.vy += .09 * k; p.vx *= .985; p.rot += p.vr * k; }
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        fctx.globalAlpha = Math.max(p.life, 0);
        if (p.type === 's') {
          fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillStyle = '#E8CB78'; fctx.beginPath();
          for (let j = 0; j < 8; j++) { const rr = j % 2 ? p.r * .38 : p.r, a = j * Math.PI / 4; fctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          fctx.closePath(); fctx.fill(); fctx.restore();
        } else {
          const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.4);
          g.addColorStop(0, 'rgba(255,241,194,.95)'); g.addColorStop(1, 'rgba(214,173,69,0)');
          fctx.fillStyle = g; fctx.beginPath(); fctx.arc(p.x, p.y, p.r * 2.4, 0, 6.283); fctx.fill();
        }
      }
      fctx.globalAlpha = 1;
      if (!parts.length) fctx.clearRect(0, 0, fw, fh);
    }
  });

  /* ---------------------------------------------------------------------
     3. The one animation loop (delta-time, so speed is identical on 60 and 144 Hz)
     --------------------------------------------------------------------- */
  const glow = el('div', 'ax-cursor-glow'); glow.setAttribute('aria-hidden', 'true'); body.appendChild(glow);
  const G = {x: ptr.x, y: ptr.y};
  const mags = new Map(); // magnetic buttons: el -> {x, y, tx, ty}
  let last = performance.now(), raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(now - last, 50); last = now;
    if (document.hidden) return;
    if (!reduce() && canHover && !locked()) {
      const e = 1 - Math.pow(.002, dt / 1000);
      G.x += (ptr.x - G.x) * e; G.y += (ptr.y - G.y) * e;
      glow.style.transform = `translate3d(${G.x.toFixed(1)}px,${G.y.toFixed(1)}px,0)`;
    }
    for (const [n, s] of mags) {
      const e = 1 - Math.pow(.0005, dt / 1000);
      s.x += (s.tx - s.x) * e; s.y += (s.ty - s.y) * e;
      if (!s.tx && !s.ty && Math.abs(s.x) < .05 && Math.abs(s.y) < .05) { n.style.translate = ''; mags.delete(n); }
      else n.style.translate = s.x.toFixed(2) + 'px ' + s.y.toFixed(2) + 'px';
    }
    for (const l of layers) if (l.enabled()) l.draw(dt, now);
  }
  const startLoop = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { fxSize(); layers.forEach(l => l.resize && l.resize()); if (reduce()) layers.forEach(l => l.enabled() && l.draw(0, 0)); }, 150); });

  const MAG = '.lp-btn, .btn:not(:disabled), .pf-chip, .q-fab, .ai-fab, .dz-btn';
  let lastDust = 0, dx0 = 0, dy0 = 0;
  document.addEventListener('pointermove', e => {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.touch = e.pointerType === 'touch';
    if (ptr.touch || reduce()) return;
    const tile = e.target.closest && e.target.closest('.tile');
    if (tile) { const r = tile.getBoundingClientRect(); tile.style.setProperty('--mx', (e.clientX - r.left) + 'px'); tile.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
    const t = canHover && e.target.closest && e.target.closest(MAG);
    for (const [n, s] of mags) if (n !== t) { s.tx = 0; s.ty = 0; }
    if (t) {
      const r = t.getBoundingClientRect(), s = mags.get(t) || {x: 0, y: 0, tx: 0, ty: 0};
      s.tx = (e.clientX - r.left - r.width / 2) * .16; s.ty = (e.clientY - r.top - r.height / 2) * .24; mags.set(t, s);
    }
    const now = performance.now();
    if (canHover && now - lastDust > 40 && Math.hypot(e.clientX - dx0, e.clientY - dy0) > 12) { lastDust = now; dx0 = e.clientX; dy0 = e.clientY; dust(e.clientX, e.clientY); }
  }, {passive: true});
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('.tile, .stat, .course-card, .pf-chip, .lp-btn.solid, .btn:not(:disabled), .q-fab, .ai-fab, .pf-copy, .ax-theme-toggle');
    if (t) burst(e.clientX, e.clientY, 9);
  });

  /* ---------------------------------------------------------------------
     4. Dashboard hero: night sky, tip, focus timer, study level
     --------------------------------------------------------------------- */
  const TIPS = [
    'Study for 25 minutes, rest for 5. Short bursts beat one long marathon.',
    'Explain a lesson out loud in your own words. If you get stuck, that is the part to review.',
    'Start with the assignment that is due first, not the one that looks easiest.',
    'Sleep before an exam helps more than another hour of cramming.',
    'Stuck on something? Ask the AI Tutor in the corner, then check it with your instructor.',
    'Write down one question after every lesson. Answers stick better when you went looking for them.',
    'Put your phone in another room for one focus session. Notice how much faster you finish.'
  ];
  const TITLES = ['Newcomer', 'Learner', 'Explorer', 'Scholar', 'Achiever', 'Honor seeker', 'Dean\u2019s lister'];
  const DOC_TITLE = 'Acadaelash LMS | Learning Portal';

  function buildHero() {
    const hero = document.querySelector('.hero');
    if (!hero || hero.querySelector('.ax-herosky')) return;
    const sky = el('div', 'ax-herosky'); sky.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 26; i++) {
      const s = el('i');
      s.style.cssText = `--x:${(Math.random() * 100).toFixed(1)}%;--y:${(Math.random() * 100).toFixed(1)}%;--z:${(Math.random() * 2.6 + 1.4).toFixed(1)}px;--t:${(Math.random() * 3 + 2).toFixed(1)}s;--dl:${(-Math.random() * 4).toFixed(1)}s`;
      sky.appendChild(s);
    }
    sky.insertAdjacentHTML('beforeend',
      '<svg viewBox="0 0 320 200"><path d="M10 160 L70 110 L130 130 L190 60 L250 90 L310 30"/><path d="M130 130 L160 180 L230 160 L250 90" opacity=".6"/>' +
      '<circle cx="10" cy="160" r="3.5"/><circle cx="70" cy="110" r="2.6"/><circle cx="130" cy="130" r="3.2"/><circle cx="190" cy="60" r="4"/><circle cx="250" cy="90" r="2.8"/><circle cx="310" cy="30" r="3.6"/><circle cx="160" cy="180" r="2.4"/><circle cx="230" cy="160" r="2.6"/></svg>');
    [['pencil', 58, 12, 40, -14, 14, 9], ['book', 74, 62, 44, 10, 18, 11], ['atom', 88, 14, 46, 0, 10, 10], ['bulb', 46, 66, 38, -8, 12, 12], ['cap', 93, 64, 42, 12, 16, 9]].forEach(([n, x, y, s, r, d, t], i) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      g.setAttribute('viewBox', '0 0 24 24'); g.setAttribute('class', 'ax-hglyph'); g.setAttribute('aria-hidden', 'true'); g.innerHTML = GLYPHS[n];
      g.style.cssText = `--x:${x}%;--y:${y}%;--s:${s}px;--r:${r}deg;--d:${d};--t:${t}s;--dl:${-i * 1.7}s`;
      sky.appendChild(g);
    });
    sky.appendChild(el('b', 'ax-shine'));
    hero.insertBefore(sky, hero.firstChild);
    const H = {x: 0, y: 0};
    layers.push({ // smoothed parallax inside the hero
      enabled: () => !locked() && !reduce() && canHover,
      draw: dt => {
        const r = hero.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
        const tx = r.width ? Math.max(-.5, Math.min(.5, (ptr.x - r.left) / r.width - .5)) : 0, ty = r.height ? Math.max(-.5, Math.min(.5, (ptr.y - r.top) / r.height - .5)) : 0;
        const e = 1 - Math.pow(.001, dt / 1000 * .9);
        H.x += (tx - H.x) * e; H.y += (ty - H.y) * e;
        sky.style.setProperty('--hx', H.x.toFixed(4)); sky.style.setProperty('--hy', H.y.toFixed(4));
      }
    });

    const text = hero.querySelector('.hero-text');
    if (!text) return;
    const tools = el('div', 'ax-tools');
    const xp = el('div', 'ax-xp', '<b class="lv">Level 1</b><span class="bar"><i></i></span><small class="pts">0 / 100 XP</small>');
    xp.title = 'Earn XP: +30 per submitted assignment, +20 per graded course, +10 per enrolled course';
    xp.setAttribute('role', 'status');

    const tip = el('button', 'ax-tip', '<svg class="ic" aria-hidden="true"><use href="#i-spark"/></svg><span></span>');
    tip.type = 'button'; tip.title = 'Click for another tip';
    let ti = Math.floor(Math.random() * TIPS.length);
    const setTip = () => { tip.querySelector('span').textContent = TIPS[ti]; tip.classList.remove('swap'); void tip.offsetWidth; tip.classList.add('swap'); };
    tip.addEventListener('click', () => { ti = (ti + 1) % TIPS.length; setTip(); });
    setTip();

    const timer = el('div', 'ax-timer', '<span class="ax-time" role="timer" aria-live="off">25:00</span><button type="button" data-go>Start focus</button><button type="button" data-reset aria-label="Reset focus timer">Reset</button>');
    const out = timer.querySelector('.ax-time'), go = timer.querySelector('[data-go]');
    const LEN = 25 * 60; let left = LEN, id = 0;
    const paint = () => { out.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'); };
    const halt = () => { clearInterval(id); id = 0; timer.dataset.run = '0'; go.textContent = left === LEN ? 'Start focus' : 'Resume'; };
    go.addEventListener('click', () => {
      if (id) { halt(); return; }
      timer.dataset.run = '1'; go.textContent = 'Pause';
      id = setInterval(() => {
        left--; paint();
        if (document.hidden) document.title = out.textContent + ' | Focus';
        if (left <= 0) {
          halt(); left = LEN; paint(); go.textContent = 'Start focus'; document.title = DOC_TITLE;
          window.alert('Focus session done. Take a 5-minute break.');
          const r = timer.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 22);
        }
      }, 1000);
    });
    timer.querySelector('[data-reset]').addEventListener('click', () => { halt(); left = LEN; paint(); document.title = DOC_TITLE; });
    tools.append(xp, timer, tip);
    text.appendChild(tools);
  }

  function refreshXP() {
    const xp = document.querySelector('.ax-xp');
    if (!xp || typeof myWork !== 'function') return;
    safe(() => {
      const submitted = myWork().filter(w => w.sub).length;
      const list = active();
      const graded = list.filter(({e}) => gradeOf(e)).length;
      const pts = submitted * 30 + graded * 20 + list.length * 10;
      const lvl = Math.floor(pts / 100) + 1, into = pts % 100;
      xp.querySelector('.lv').textContent = 'Level ' + lvl + ' \u00b7 ' + TITLES[Math.min(lvl - 1, TITLES.length - 1)];
      xp.querySelector('.pts').textContent = into + ' / 100 XP';
      xp.querySelector('.bar i').style.width = into + '%';
      const key = 'ax-level-' + (typeof me !== 'undefined' && me ? (me.id || me.email || 'u') : 'u');
      let prev = 0; try { prev = +sessionStorage.getItem(key) || 0; sessionStorage.setItem(key, lvl); } catch (e) { /* storage blocked */ }
      if (prev && lvl > prev) {
        xp.classList.remove('up'); void xp.offsetWidth; xp.classList.add('up');
        const r = xp.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 26);
        window.alert('Level up! You reached level ' + lvl + '.');
      }
    });
  }

  /* ---------------------------------------------------------------------
     5. Scroll bar, page entrances, theme cross-fade
     --------------------------------------------------------------------- */
  const bar = el('div', 'ax-progress'); bar.setAttribute('aria-hidden', 'true'); body.appendChild(bar);
  let sp = 0;
  const onScroll = () => { if (sp) return; sp = requestAnimationFrame(() => { sp = 0; const max = root.scrollHeight - innerHeight; bar.style.setProperty('--ax-scroll', max > 0 ? Math.min(1, scrollY / max).toFixed(3) : 0); }); };
  addEventListener('scroll', onScroll, {passive: true}); addEventListener('resize', onScroll);

  const titleEl = $('title');
  if (titleEl) new MutationObserver(() => setTimeout(() => {
    if (reduce()) return;
    const page = document.querySelector('#view .page:not([hidden])');
    if (!page) return;
    page.querySelectorAll('.stat, .card, .course-card, .tile, .tablewrap, .item, .pf-stat, .pf-panel, .hero').forEach((n, i) => {
      n.style.setProperty('--ax-i', Math.min(i, 12));
      n.classList.remove('ax-in'); void n.offsetWidth; n.classList.add('ax-in');
      n.addEventListener('animationend', function f(ev) { if (ev.animationName === 'axIn') { n.classList.remove('ax-in'); n.removeEventListener('animationend', f); } });
    });
  }, 40)).observe(titleEl, {childList: true});

  let themeT = 0;
  new MutationObserver(() => {
    root.classList.add('ax-theming'); clearTimeout(themeT);
    themeT = setTimeout(() => root.classList.remove('ax-theming'), 700);
    if (reduce()) layers.forEach(l => safe(() => l.enabled() && l.draw(0, 0)));
    scheduleGuard(760);
  }).observe(root, {attributes: true, attributeFilter: ['data-theme']});

  /* ---------------------------------------------------------------------
     6. Contrast guard: if any text ends up hard to read on its background
        (in either theme), switch just that text to ivory or midnight.
     --------------------------------------------------------------------- */
  const parse = c => {
    const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return p.length < 3 || p.some(isNaN) ? null : {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1};
  };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const IVORY = {r: 244, g: 240, b: 230}, MIDNIGHT = {r: 21, g: 28, b: 44};
  const fixed = new Map(); // element -> original inline colour + priority
  let guardT = 0;

  function backdrop(node, cache) {
    const stack = [];
    let base = null;
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      if (cache.has(n)) { base = cache.get(n); if (base === null) { cache.set(node, null); return null; } break; }
      const cs = getComputedStyle(n), bg = parse(cs.backgroundColor);
      if (bg && bg.a >= .5) { stack.push(bg); if (bg.a >= .9) break; }
      else if (cs.backgroundImage && cs.backgroundImage !== 'none') { cache.set(node, null); cache.set(n, null); return null; } // gradient or picture: cannot judge safely
      else if (bg && bg.a > 0) stack.push(bg);
    }
    if (!base) {
      base = {r: 255, g: 255, b: 255};
      if (!stack.length) { const b = parse(getComputedStyle(body).backgroundColor); if (b && b.a > .5) base = b; }
    }
    for (let i = stack.length - 1; i >= 0; i--) { const l = stack[i]; base = {r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a)}; }
    cache.set(node, base);
    return base;
  }

  function runGuard() {
    for (const [n, o] of fixed) { if (o.v) n.style.setProperty('color', o.v, o.p); else n.style.removeProperty('color'); n.removeAttribute('data-ax-fix'); }
    fixed.clear();
    const cache = new Map(), seen = new Set();
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {acceptNode: n => n.nodeValue.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
    const targets = [];
    for (let n = walker.nextNode(); n && targets.length < 2500; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || seen.has(p) || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(p.tagName) || p.closest('.ax-fx, .ax-motes, [data-ax-skip]')) continue;
      seen.add(p); targets.push(p);
    }
    document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea').forEach(i => targets.push(i));
    for (const t of targets) {
      if (!t.getClientRects().length) continue;
      const cs = getComputedStyle(t);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const bg = backdrop(t, cache), fg = parse(cs.color);
      if (!bg || !fg) continue;
      const eff = fg.a < 1 ? {r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a)} : fg;
      const r0 = ratio(eff, bg);
      if (r0 >= 3) continue;
      const best = ratio(IVORY, bg) >= ratio(MIDNIGHT, bg) ? IVORY : MIDNIGHT;
      if (ratio(best, bg) < r0 + 1.5) continue;
      fixed.set(t, {v: t.style.getPropertyValue('color'), p: t.style.getPropertyPriority('color')});
      t.style.setProperty('color', `rgb(${best.r}, ${best.g}, ${best.b})`, 'important');
      t.setAttribute('data-ax-fix', '1');
    }
  }
  function scheduleGuard(delay) {
    clearTimeout(guardT);
    guardT = setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(() => safe(runGuard), {timeout: 1500}) : safe(runGuard)), delay == null ? 450 : delay);
  }
  const viewEl = $('view');
  if (viewEl) new MutationObserver(() => scheduleGuard(450)).observe(viewEl, {childList: true, subtree: true});
  new MutationObserver(() => scheduleGuard(500)).observe(body, {attributes: true, attributeFilter: ['class']});

  /* ---------------------------------------------------------------------
     7. Wire up
     --------------------------------------------------------------------- */
  safe(buildSky);
  safe(buildThemeToggle);
  safe(buildWatermarks);
  safe(buildMotes);
  safe(buildHero);
  const heroName = $('hero-name'), dashCourses = $('dash-courses');
  if (heroName) new MutationObserver(refreshXP).observe(heroName, {childList: true});
  if (dashCourses) new MutationObserver(refreshXP).observe(dashCourses, {childList: true});
  safe(refreshXP);
  safe(onScroll);
  if (reduce()) layers.forEach(l => safe(() => l.enabled() && l.draw(0, 0))); else startLoop();
  reduceMQ.addEventListener && reduceMQ.addEventListener('change', () => { if (!reduce()) startLoop(); });
  scheduleGuard(900);
})();
/* ==== AX THEME END ==== */

/* ==========================================================================
   Admin panel (separate from the motion layer above)
   ========================================================================== */
/* Acadaelash admin panel (Phase 1): shell, dashboard, student records, activity log, settings, Ctrl+K command bar.
   Loaded after the portal script. Admin writes go only through SQL functions that verify the admin login
   (admin_change_password, admin_create_admin, admin_list_audit). It never changes student-portal behaviour. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const cred = () => { try { return JSON.parse(sessionStorage.getItem('cred')); } catch (e) { return null; } };
  async function rpc(fn, args) {
    const c = cred();
    if (!c) throw new Error('Please log in again.');
    const {data, error} = await sb.rpc(fn, Object.assign({p_email: c.email, p_hash: c.hash}, args || {}));
    if (error) throw new Error(error.message);
    return data;
  }
  const say = m => { try { alert(m); } catch (e) { /* ignore */ } };
  const VIEWS = [['dashboard', 'Dashboard'], ['students', 'Students'], ['courses', 'Courses'], ['enrollments', 'Enrollments'], ['grades', 'Grades'], ['content', 'Modules & assignments'], ['submissions', 'Submissions'], ['quiz', 'Quiz bank'], ['sections', 'Sections'], ['announcements', 'Announcements'], ['reports', 'Reports'], ['activity', 'Activity log'], ['settings', 'Settings']];
  let acct = null, root = null, cur = 'dashboard', q = '';

  function build() {
    root = document.createElement('div');
    root.id = 'admin-root';
    root.hidden = true;
    root.innerHTML = `<div class="ad-side"><div class="ad-brand"><b>Acad<em>aelash</em></b><span>Admin Panel</span></div>
      <div id="ad-nav">${VIEWS.map(v => `<button data-v="${v[0]}">${v[1]}</button>`).join('')}</div>
      <button class="ad-ghost" id="ad-classic">Classic portal view</button>
      <button class="ad-ghost" id="ad-out">Log out</button></div>
      <div class="ad-main"><header class="ad-top"><h1 id="ad-title"></h1>
        <button class="ad-cmd" id="ad-cmdbtn">Search or run a command <kbd>Ctrl K</kbd></button>
        <span class="ad-who" id="ad-who"></span></header><section id="ad-view"></section></div>
      <div class="ad-pal" id="ad-pal" hidden><div class="ad-pbox"><input id="ad-pin" placeholder="Type a command or a student name or ID" autocomplete="off"><ul id="ad-plist"></ul></div></div>`;
    document.body.appendChild(root);
    const back = document.createElement('button');
    back.id = 'adm-back'; back.type = 'button'; back.textContent = 'Back to Admin Panel';
    back.onclick = () => { document.body.classList.remove('admin-classic'); open(acct); };
    document.body.appendChild(back);
    // New passwords and emails: remove spaces and disallowed characters while typing (the current-password box is left alone).
    root.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'pw0' || (t.type !== 'password' && t.type !== 'email')) return;
      if (cleanInput(t)) say('Not allowed. ' + RULE_TEXT + '. No spaces.');
    }, true);
    root.addEventListener('keydown', e => {
      const t = e.target;
      if (e.key === ' ' && t.id !== 'pw0' && (t.type === 'password' || t.type === 'email')) e.preventDefault();
    });
    $('ad-nav').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) go(b.dataset.v); };
    $('ad-out').onclick = () => $('logout').click();
    $('ad-classic').onclick = () => classic();
    $('ad-cmdbtn').onclick = () => pal(true);
    $('ad-pal').onclick = e => { if (e.target.id === 'ad-pal') pal(false); };
    $('ad-pin').oninput = () => list($('ad-pin').value);
    $('ad-pin').onkeydown = palKey;
    document.addEventListener('keydown', e => {
      if (root.hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal($('ad-pal').hidden); }
      else if (e.key === 'Escape') pal(false);
    });
    new MutationObserver(() => {
      const cl = document.body.classList;   // only act when something needs closing, or this observer would re-trigger itself forever
      if (cl.contains('locked') && (cl.contains('admin-mode') || cl.contains('admin-classic') || !root.hidden)) {
        cl.remove('admin-mode', 'admin-classic'); root.hidden = true; pal(false);
      }
    }).observe(document.body, {attributes: true, attributeFilter: ['class']});
  }

  function open(a) {
    acct = {role: a.role, student_id: a.student_id, full_name: a.full_name};
    sessionStorage.setItem('acct', JSON.stringify(acct));
    if (!root) build();
    document.body.classList.add('admin-mode');
    document.body.classList.remove('admin-classic');
    root.hidden = false;
    $('ad-who').textContent = acct.full_name;
    go(cur);
  }
  function classic(view) {
    document.body.classList.remove('admin-mode');
    document.body.classList.add('admin-classic');
    root.hidden = true;
    enter(Object.assign({}, acct, {classic: true}));
    if (view) { const b = document.querySelector(`#nav [data-view="${view}"]`); if (b) b.click(); }
  }
  function go(v) {
    cur = v;
    $('ad-title').textContent = (VIEWS.find(x => x[0] === v) || [, ''])[1];
    $('ad-nav').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    ({dashboard, students, courses, enrollments, grades, content, submissions, quiz, sections, announcements, reports, activity, settings}[v] || dashboard)();
    window.scrollTo(0, 0);
  }
  const V = html => { $('ad-view').onclick = null; $('ad-view').innerHTML = html; };

  /* Dashboard */
  async function dashboard() {
    const sp = db.student_profiles || [], en = db.enrollment_data || [], co = db.courses || [];
    const enrolled = en.filter(e => e.enrollment_status === 'Enrolled');
    const per = co.map(c => [c.course_name, enrolled.filter(e => e.course_code === c.course_code).length]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...per.map(p => p[1]));
    V(`<div class="ad-stats">${[['Students', sp.length], ['Courses', co.length], ['Active enrollments', enrolled.length], ['Grades recorded', (db.grades_data || []).length]]
      .map(s => `<div class="ad-stat"><b>${s[1]}</b><span>${s[0]}</span></div>`).join('')}</div>
      <div class="ad-grid"><div class="ad-card"><h3>Enrollment by course</h3>${per.map(p => `<div class="ad-bar"><span>${esc(p[0])}</span><i style="--w:${p[1] / max * 100}%"></i><b>${p[1]}</b></div>`).join('') || '<p class="ad-mute">No courses yet.</p>'}</div>
      <div class="ad-card"><h3>Recent activity</h3><div id="ad-recent"><p class="ad-mute">Loading...</p></div></div></div>`);
    try { $('ad-recent').innerHTML = feed(await rpc('admin_list_audit', {p_limit: 8})); }
    catch (e) { $('ad-recent').innerHTML = `<p class="ad-mute">${esc(e.message)}</p>`; }
  }
  const feed = rows => rows && rows.length ? '<ul class="ad-feed">' + rows.map(r => `<li><b>${esc(r.action.replace(/_/g, ' '))}</b> ${esc(r.target || '')}<small>${esc(r.admin_name || '')} &bull; ${new Date(r.at).toLocaleString('en-PH')}</small></li>`).join('') + '</ul>' : '<p class="ad-mute">No activity yet.</p>';

  /* Shared helpers: reload public tables after a write, and a small form dialog */
  async function reload(...ts) { for (const t of ts) { const {data} = await sb.from(t).select('*'); if (data) db[t] = data; } }
  function dlg(title, fields, vals, onSave, label, info) {
    const d = document.createElement('div');
    d.className = 'ad-pal';
    d.innerHTML = `<div class="ad-dbox" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${info || ''}<form class="ad-form">${fields.map(f => `<label>${esc(f.l)}${f.t === 'select'
      ? `<select name="${f.n}">${f.o.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`
      : f.t === 'textarea' ? `<textarea name="${f.n}" rows="5"${f.req ? ' required' : ''}></textarea>`
      : `<input name="${f.n}" type="${f.t || 'text'}"${f.req ? ' required' : ''}${f.step ? ` step="${f.step}"` : ''}${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''} autocomplete="off">`}</label>`).join('')}
      <p class="ad-msg bad" role="alert"></p><div class="ad-row"><button class="ad-btn" type="submit">${esc(label || 'Save')}</button><button class="ad-btn ad-alt" type="button">Cancel</button></div></form></div>`;
    root.appendChild(d);
    const f = d.querySelector('form'), m = d.querySelector('.ad-msg'), close = () => d.remove();
    fields.forEach(x => { if (vals && vals[x.n] != null) f.elements[x.n].value = vals[x.n]; });
    d.onclick = e => { if (e.target === d) close(); };
    f.querySelector('.ad-alt').onclick = close;
    f.onsubmit = async e => {
      e.preventDefault();
      const v = {}; fields.forEach(x => { v[x.n] = f.elements[x.n].value; });
      try { await onSave(v); close(); } catch (ex) { m.textContent = ex.message; }
    };
    const first = f.querySelector('input,select,textarea'); if (first) first.focus();
    return d;
  }
  const btn = (a, id, t, cls) => `<button data-a="${a}" data-id="${esc(id)}"${cls ? ` class="${cls}"` : ''}>${t}</button>`;
  const needPw = p => { const m = pwProblem(p); if (m) throw new Error(m); };   // rules live in index.html

  /* Students: add, edit, delete, suspend or activate, reset password */
  async function students() {
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-sq" class="ad-in" placeholder="Filter by name, ID, program" value="${esc(q)}"><button class="ad-btn" id="ad-add">Add student</button></div>
      <div class="ad-tw"><table><thead><tr><th>ID</th><th>Name</th><th>Program</th><th>Year</th><th>Record</th><th>Login</th><th></th></tr></thead><tbody id="ad-sb"><tr><td colspan="7">Loading...</td></tr></tbody></table></div></div>`);
    q = '';
    const acc = {};
    try { (await rpc('admin_list_accounts') || []).forEach(a => { acc[a.student_id] = a; }); } catch (e) { say(e.message); }
    const draw = () => {
      const t = $('ad-sq').value.toLowerCase();
      $('ad-sb').innerHTML = (db.student_profiles || []).filter(s => !t || [s.student_id, s.first_name, s.last_name, s.program].join(' ').toLowerCase().includes(t)).map(s => {
        const a = acc[s.student_id];
        return `<tr><td>${esc(s.student_id)}</td><td>${esc(s.first_name + ' ' + s.last_name)}</td><td>${esc(s.program)}</td><td>${esc(s.year_level)}</td><td>${esc(s.enrollment_status)}</td>
          <td>${a ? esc(a.status) : '<span class="ad-mute">No login</span>'}</td><td class="ad-act">${btn('edit', s.student_id, 'Edit')}${a ? btn('pw', s.student_id, 'Password') + btn('st', s.student_id, a.status === 'active' ? 'Suspend' : 'Activate') : ''}${btn('del', s.student_id, 'Delete', 'bad')}</td></tr>`;
      }).join('') || '<tr><td colspan="7">No matching students.</td></tr>';
    };
    $('ad-sq').oninput = draw; draw();
    const after = async () => { await reload('student_profiles', 'enrollment_data', 'grades_data'); students(); };
    $('ad-add').onclick = () => dlg('Add student', [
      {n: 'sid', l: 'Student ID', req: 1}, {n: 'first', l: 'First name', req: 1}, {n: 'last', l: 'Last name', req: 1},
      {n: 'mail', l: 'Email', t: 'email', req: 1}, {n: 'program', l: 'Program', req: 1}, {n: 'year', l: 'Year level (for example 1st Year)', req: 1},
      {n: 'pw', l: 'Starting password (optional; 8+ characters, letters, numbers and @ . - _ # only, no spaces; leave empty if the student will register)', t: 'password'}], null, async v => {
      { const m = emailProblem(v.mail); if (m) throw new Error(m); }
      let h = null;
      if (v.pw) { needPw(v.pw); h = await hashPassword(v.mail.trim().toLowerCase(), v.pw); }
      await rpc('admin_add_student', {p_first: v.first, p_last: v.last, p_student_email: v.mail, p_student_id: v.sid, p_program: v.program, p_year: v.year, p_new_hash: h});
      await after(); say('Student added.');
    }, 'Add student');
    $('ad-sb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const sid = b.dataset.id, s = db.student_profiles.find(x => x.student_id === sid), a = acc[sid], name = s.first_name + ' ' + s.last_name;
      if (b.dataset.a === 'edit') dlg('Edit ' + name, [
        {n: 'first', l: 'First name', req: 1}, {n: 'last', l: 'Last name', req: 1}, {n: 'program', l: 'Program', req: 1}, {n: 'year', l: 'Year level', req: 1},
        {n: 'status', l: 'Enrollment status', t: 'select', o: [['Enrolled', 'Enrolled'], ['Not Enrolled', 'Not Enrolled'], ['Dropped', 'Dropped']]}],
        {first: s.first_name, last: s.last_name, program: s.program, year: s.year_level, status: s.enrollment_status}, async v => {
          await rpc('admin_update_student', {p_student_id: sid, p_first: v.first, p_last: v.last, p_program: v.program, p_year: v.year, p_status: v.status});
          await after();
        });
      else if (b.dataset.a === 'pw') dlg('Reset password: ' + name, [{n: 'pw', l: 'New password (8+ characters; letters, numbers and @ . - _ # only, no spaces)', t: 'password', req: 1}], null, async v => {
        needPw(v.pw);
        await rpc('admin_reset_password', {p_student_id: sid, p_new_hash: await hashPassword(String(a.email).toLowerCase(), v.pw)});
        say('Password reset. Tell the student their new password.');
      }, 'Reset password');
      else if (b.dataset.a === 'st') {
        const to = a.status === 'active' ? 'suspended' : 'active';
        if (confirm(`${to === 'suspended' ? 'Suspend' : 'Activate'} the login for ${name}?`)) rpc('admin_set_account_status', {p_student_id: sid, p_status: to}).then(after).catch(x => say(x.message));
      } else if (b.dataset.a === 'del') dlg('Delete ' + name, [{n: 'c', l: `This permanently deletes the record, login, enrollments, grades and progress. Type ${sid} to confirm.`, req: 1}], null, async v => {
        if (v.c.trim().toUpperCase() !== sid.toUpperCase()) throw new Error('The ID does not match.');
        await rpc('admin_delete_student', {p_student_id: sid});
        await after();
      }, 'Delete student');
    };
  }

  /* Grades: enter, edit and return grades to students */
  function grades() {
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-gq" class="ad-in" placeholder="Filter by student or course"><span class="ad-mute">Saving a score returns it to the student's Grades page (0 to 100).</span></div>
      <div class="ad-tw"><table><thead><tr><th>Student</th><th>Course</th><th>Score</th><th>Remarks</th><th></th></tr></thead><tbody id="ad-gb"></tbody></table></div></div>`);
    const rows = () => (db.enrollment_data || []).filter(e => e.enrollment_status === 'Enrolled').map(e => ({e, id: String(e.enrollment_id),
      s: (db.student_profiles || []).find(x => x.student_id === e.student_id), c: (db.courses || []).find(x => x.course_code === e.course_code), g: (db.grades_data || []).find(x => x.enrollment_id === e.enrollment_id)}));
    const nm = r => (r.s ? r.s.first_name + ' ' + r.s.last_name : r.e.student_id);
    const draw = () => {
      const t = $('ad-gq').value.toLowerCase();
      $('ad-gb').innerHTML = rows().filter(r => !t || (nm(r) + ' ' + (r.c ? r.c.course_name : '')).toLowerCase().includes(t)).map(r =>
        `<tr><td>${esc(nm(r))}</td><td>${esc(r.c ? r.c.course_name : r.e.course_code)}</td><td>${r.g ? esc(r.g.score) : '<span class="ad-mute">Not graded</span>'}</td><td>${r.g ? esc(r.g.remarks || '') : ''}</td>
        <td class="ad-act">${btn('g', r.id, r.g ? 'Edit' : 'Return grade')}${r.g ? btn('gc', r.id, 'Clear', 'bad') : ''}</td></tr>`).join('') || '<tr><td colspan="5">No enrollments yet.</td></tr>';
    };
    $('ad-gq').oninput = draw; draw();
    $('ad-gb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const r = rows().find(x => x.id === b.dataset.id);
      const done = async () => { await reload('grades_data'); grades(); };
      if (b.dataset.a === 'g') dlg(`${nm(r)}: ${r.c ? r.c.course_name : ''}`, [{n: 'score', l: 'Score (0 to 100)', t: 'number', step: '0.01', min: 0, max: 100, req: 1}, {n: 'remarks', l: 'Remarks (optional)'}],
        r.g ? {score: r.g.score, remarks: r.g.remarks || ''} : null, async v => { await rpc('admin_save_grade', {p_enrollment_id: r.e.enrollment_id, p_score: Number(v.score), p_remarks: v.remarks}); await done(); }, 'Return grade');
      else if (confirm('Remove this grade from the student\'s record?')) rpc('admin_clear_grade', {p_enrollment_id: r.e.enrollment_id}).then(done).catch(x => say(x.message));
    };
  }

  /* Modules and assignments */
  function content() {
    const subs = (db.subjects || []).map(s => { const c = (db.courses || []).find(x => x.subject_id === s.subject_id); return [s.subject_id, s.subject_code + (c ? ' - ' + c.course_name : '')]; });
    const sn = id => (subs.find(x => x[0] === id) || [, id])[1];
    const when = d => new Date(d).toLocaleString('en-PH', {dateStyle: 'medium', timeStyle: 'short'});
    V(`<div class="ad-grid"><div class="ad-card"><div class="ad-row"><h3>Modules</h3><button class="ad-btn" id="ad-addm">Add module</button></div><div class="ad-tw"><table><thead><tr><th>Subject</th><th>#</th><th>Title</th><th></th></tr></thead><tbody id="ad-mb"></tbody></table></div></div>
      <div class="ad-card"><div class="ad-row"><h3>Assignments</h3><button class="ad-btn" id="ad-adda">Add assignment</button></div><div class="ad-tw"><table><thead><tr><th>Subject</th><th>Title</th><th>Due</th><th></th></tr></thead><tbody id="ad-ab"></tbody></table></div></div></div>`);
    $('ad-mb').innerHTML = (db.modules || []).slice().sort((a, b) => a.subject_id - b.subject_id || a.module_no - b.module_no).map(m =>
      `<tr><td>${esc(sn(m.subject_id))}</td><td>${esc(m.module_no)}</td><td>${esc(m.title)}</td><td class="ad-act">${btn('me', m.module_id, 'Edit')}${btn('md', m.module_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="4">No modules yet.</td></tr>';
    $('ad-ab').innerHTML = (db.assignments || []).slice().sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).map(a =>
      `<tr><td>${esc(sn(a.subject_id))}</td><td>${esc(a.title)}</td><td>${esc(when(a.due_date))}</td><td class="ad-act">${btn('ae', a.assignment_id, 'Edit')}${btn('ad', a.assignment_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="4">No assignments yet.</td></tr>';
    const SUB = {n: 'subject', l: 'Subject', t: 'select', o: subs};
    const mf = [SUB, {n: 'no', l: 'Module number', t: 'number', min: 1, req: 1}, {n: 'title', l: 'Title', req: 1}, {n: 'desc', l: 'Description (optional)'}, {n: 'file', l: 'File path or link (optional)'}];
    const af = [SUB, {n: 'title', l: 'Title', req: 1}, {n: 'due', l: 'Deadline', t: 'datetime-local', req: 1}];
    const saveM = id => async v => { await rpc('admin_save_module', {p_id: id, p_subject: Number(v.subject), p_no: Number(v.no), p_title: v.title, p_desc: v.desc, p_file: v.file}); await reload('modules'); content(); };
    const saveA = id => async v => { await rpc('admin_save_assignment', {p_id: id, p_subject: Number(v.subject), p_title: v.title, p_due: v.due}); await reload('assignments'); content(); };
    $('ad-addm').onclick = () => dlg('Add module', mf, null, saveM(null), 'Add module');
    $('ad-adda').onclick = () => dlg('Add assignment', af, null, saveA(null), 'Add assignment');
    $('ad-view').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const id = Number(b.dataset.id), k = b.dataset.a;
      if (k === 'me') { const m = db.modules.find(x => x.module_id === id); dlg('Edit module', mf, {subject: m.subject_id, no: m.module_no, title: m.title, desc: m.description || '', file: m.file_path || ''}, saveM(id)); }
      else if (k === 'ae') { const a = db.assignments.find(x => x.assignment_id === id); dlg('Edit assignment', af, {subject: a.subject_id, title: a.title, due: String(a.due_date).slice(0, 16)}, saveA(id)); }
      else if (k === 'md' && confirm('Delete this module?')) rpc('admin_delete_module', {p_id: id}).then(() => reload('modules')).then(content).catch(x => say(x.message));
      else if (k === 'ad' && confirm('Delete this assignment?')) rpc('admin_delete_assignment', {p_id: id}).then(() => reload('assignments')).then(content).catch(x => say(x.message));
    };
  }

  /* Courses: create, edit, delete, assign instructor */
  function courses() {
    const subs = (db.subjects || []).map(s => [s.subject_id, s.subject_code]);
    const sc = id => (subs.find(x => x[0] === id) || [, id])[1];
    const n = c => (db.enrollment_data || []).filter(e => e.course_code === c && e.enrollment_status === 'Enrolled').length;
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-cq" class="ad-in" placeholder="Filter courses"><button class="ad-btn" id="ad-addc">Add course</button></div>
      <div class="ad-tw"><table><thead><tr><th>Code</th><th>Course</th><th>Subject</th><th>Instructor</th><th>Units</th><th>School year</th><th>Enrolled</th><th></th></tr></thead><tbody id="ad-cb"></tbody></table></div></div>`);
    const draw = () => {
      const t = $('ad-cq').value.toLowerCase();
      $('ad-cb').innerHTML = (db.courses || []).filter(c => !t || [c.course_name, c.instructor, c.department].join(' ').toLowerCase().includes(t)).map(c =>
        `<tr><td>${esc(c.course_code)}</td><td>${esc(c.course_name)}</td><td>${esc(sc(c.subject_id))}</td><td>${esc(c.instructor)}</td><td>${esc(c.units)}</td><td>${esc(c.school_year)}</td><td>${n(c.course_code)}</td>
        <td class="ad-act">${btn('ce', c.course_code, 'Edit')}${btn('cd', c.course_code, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="8">No courses.</td></tr>';
    };
    $('ad-cq').oninput = draw; draw();
    const fl = [{n: 'subject', l: 'Subject', t: 'select', o: subs}, {n: 'name', l: 'Course name', req: 1}, {n: 'dept', l: 'Department', req: 1},
      {n: 'units', l: 'Units', t: 'number', min: 1, req: 1}, {n: 'inst', l: 'Instructor (assigned teacher)', req: 1}, {n: 'sy', l: 'School year (for example 2026-2027)', req: 1}];
    const save = id => async v => { await rpc('admin_save_course', {p_id: id, p_subject: Number(v.subject), p_name: v.name, p_department: v.dept, p_units: Number(v.units), p_instructor: v.inst, p_school_year: v.sy}); await reload('courses'); courses(); };
    const last = (db.courses || [])[ (db.courses || []).length - 1 ] || {};
    $('ad-addc').onclick = () => dlg('Add course', fl, {sy: last.school_year || '', dept: last.department || ''}, save(null), 'Add course');
    $('ad-cb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const id = Number(b.dataset.id), c = db.courses.find(x => x.course_code === id);
      if (b.dataset.a === 'ce') dlg('Edit course', fl, {subject: c.subject_id, name: c.course_name, dept: c.department, units: c.units, inst: c.instructor, sy: c.school_year}, save(id));
      else if (confirm(`Delete ${c.course_name}? Courses with enrollments cannot be deleted.`)) rpc('admin_delete_course', {p_id: id}).then(() => reload('courses')).then(courses).catch(x => say(x.message));
    };
  }

  /* Enrollments: enroll, remove (drop), transfer between courses */
  function enrollments() {
    const sn = id => { const s = (db.student_profiles || []).find(x => x.student_id === id); return s ? s.first_name + ' ' + s.last_name : id; };
    const cn = id => { const c = (db.courses || []).find(x => x.course_code === id); return c ? c.course_name : id; };
    const copts = (db.courses || []).map(c => [c.course_code, `${c.course_name} (${c.school_year})`]);
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-eq" class="ad-in" placeholder="Filter by student or course"><button class="ad-btn" id="ad-adde">Enroll student</button>
      <span class="ad-mute">Removing marks an enrollment Dropped. Transferring clears the old course's grade.</span></div>
      <div class="ad-tw"><table><thead><tr><th>Student</th><th>Course</th><th>Semester</th><th>Status</th><th></th></tr></thead><tbody id="ad-eb"></tbody></table></div></div>`);
    const draw = () => {
      const t = $('ad-eq').value.toLowerCase();
      $('ad-eb').innerHTML = (db.enrollment_data || []).filter(e => !t || (sn(e.student_id) + ' ' + e.student_id + ' ' + cn(e.course_code)).toLowerCase().includes(t)).map(e =>
        `<tr><td>${esc(sn(e.student_id))}<br><small class="ad-mute">${esc(e.student_id)}</small></td><td>${esc(cn(e.course_code))}</td><td>${esc(e.semester)} ${esc(e.school_year)}</td><td>${esc(e.enrollment_status)}</td>
        <td class="ad-act">${e.enrollment_status === 'Enrolled' ? btn('er', e.enrollment_id, 'Remove', 'bad') + btn('et', e.enrollment_id, 'Transfer') : ''}</td></tr>`).join('') || '<tr><td colspan="5">No enrollments.</td></tr>';
    };
    $('ad-eq').oninput = draw; draw();
    const done = async () => { await reload('enrollment_data', 'grades_data'); enrollments(); };
    $('ad-adde').onclick = () => dlg('Enroll student', [{n: 'sid', l: 'Student', t: 'select', o: (db.student_profiles || []).map(s => [s.student_id, `${s.student_id} - ${s.first_name} ${s.last_name}`])},
      {n: 'course', l: 'Course', t: 'select', o: copts}], null, async v => { await rpc('admin_enroll_student', {p_student_id: v.sid, p_course_code: Number(v.course)}); await done(); }, 'Enroll');
    $('ad-eb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const id = Number(b.dataset.id), en = db.enrollment_data.find(x => x.enrollment_id === id);
      if (b.dataset.a === 'er') { if (confirm(`Remove ${sn(en.student_id)} from ${cn(en.course_code)}?`)) rpc('admin_remove_enrollment', {p_enrollment_id: id}).then(done).catch(x => say(x.message)); }
      else dlg(`Transfer ${sn(en.student_id)}`, [{n: 'course', l: 'Move to course', t: 'select', o: copts.filter(o => o[0] !== en.course_code)}], null,
        async v => { await rpc('admin_transfer_enrollment', {p_enrollment_id: id, p_new_course: Number(v.course)}); await done(); }, 'Transfer');
    };
  }

  /* Submissions: view student work, score it and write feedback */
  async function submissions() {
    V(`<div class="ad-card"><div class="ad-row"><input id="ad-bq" class="ad-in" placeholder="Filter by student, assignment or subject"><span class="ad-mute">Open a submission to read it, score it (0 to 100) and leave feedback.</span></div>
      <div class="ad-tw"><table><thead><tr><th>Student</th><th>Assignment</th><th>Subject</th><th>Submitted</th><th>Score</th><th></th></tr></thead><tbody id="ad-bb"><tr><td colspan="6">Loading...</td></tr></tbody></table></div></div>`);
    let rows = [];
    try { rows = await rpc('admin_list_submissions', {p_limit: 300}) || []; } catch (e) { $('ad-bb').innerHTML = `<tr><td colspan="6">${esc(e.message)}</td></tr>`; return; }
    const draw = () => {
      const t = $('ad-bq').value.toLowerCase();
      $('ad-bb').innerHTML = rows.filter(r => !t || [r.student, r.assignment, r.subject].join(' ').toLowerCase().includes(t)).map(r =>
        `<tr><td>${esc(r.student)}</td><td>${esc(r.assignment)}</td><td>${esc(r.subject)}</td><td>${esc(new Date(r.submitted_at).toLocaleString('en-PH'))}${r.late ? ' <b class="bad-t">Late</b>' : ''}</td>
        <td>${r.score == null ? '<span class="ad-mute">Not reviewed</span>' : esc(r.score)}</td><td class="ad-act">${btn('rv', r.submission_id, r.score == null && !r.feedback ? 'Review' : 'Edit review')}</td></tr>`).join('') || '<tr><td colspan="6">No submissions yet.</td></tr>';
    };
    $('ad-bq').oninput = draw; draw();
    $('ad-bb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const r = rows.find(x => String(x.submission_id) === b.dataset.id);
      dlg(`${r.student}: ${r.assignment}`, [{n: 'score', l: 'Score (0 to 100, optional)', t: 'number', step: '0.01', min: 0, max: 100}, {n: 'fb', l: 'Feedback', t: 'textarea'}],
        {score: r.score == null ? '' : r.score, fb: r.feedback || ''}, async v => {
          await rpc('admin_review_submission', {p_id: Number(r.submission_id), p_score: v.score === '' ? null : Number(v.score), p_feedback: v.fb});
          submissions();
        }, 'Save review', `<div class="ad-sub">${esc(r.content)}</div>`);
    };
  }

  /* Announcements: create, edit, delete, publish or hide (shown on the student dashboard) */
  async function announcements() {
    V(`<div class="ad-card"><div class="ad-row"><h3>Announcements</h3><button class="ad-btn" id="ad-adan">New announcement</button></div>
      <div class="ad-tw"><table><thead><tr><th>Title</th><th>Status</th><th>Posted</th><th>By</th><th></th></tr></thead><tbody id="ad-nb"><tr><td colspan="5">Loading...</td></tr></tbody></table></div></div>`);
    let rows = [];
    try { rows = await rpc('admin_list_announcements') || []; } catch (e) { $('ad-nb').innerHTML = `<tr><td colspan="5">${esc(e.message)}</td></tr>`; return; }
    $('ad-nb').innerHTML = rows.map(r => `<tr><td>${esc(r.title)}</td><td>${r.published ? 'Published' : 'Hidden'}</td><td>${esc(new Date(r.created_at).toLocaleDateString('en-PH'))}</td><td>${esc(r.created_by || '')}</td>
      <td class="ad-act">${btn('ne', r.announcement_id, 'Edit')}${btn('nd', r.announcement_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="5">No announcements yet.</td></tr>';
    const fl = [{n: 'title', l: 'Title', req: 1}, {n: 'body', l: 'Message', t: 'textarea', req: 1}, {n: 'pub', l: 'Visibility', t: 'select', o: [['yes', 'Published (students see it)'], ['no', 'Hidden']]}];
    const save = id => async v => { await rpc('admin_save_announcement', {p_id: id, p_title: v.title, p_body: v.body, p_published: v.pub === 'yes'}); announcements(); };
    $('ad-adan').onclick = () => dlg('New announcement', fl, {pub: 'yes'}, save(null), 'Publish');
    $('ad-nb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const r = rows.find(x => String(x.announcement_id) === b.dataset.id);
      if (b.dataset.a === 'ne') dlg('Edit announcement', fl, {title: r.title, body: r.body, pub: r.published ? 'yes' : 'no'}, save(Number(r.announcement_id)));
      else if (confirm('Delete this announcement?')) rpc('admin_delete_announcement', {p_id: Number(r.announcement_id)}).then(announcements).catch(x => say(x.message));
    };
  }

  /* Quiz bank: add, edit and delete quiz questions per lesson */
  async function quiz() {
    V('<div class="ad-card"><p class="ad-mute">Loading...</p></div>');
    let d;
    try { d = await rpc('admin_list_quiz'); } catch (e) { V(`<div class="ad-card"><p class="ad-mute">${esc(e.message)}</p></div>`); return; }
    const sc = id => ((db.subjects || []).find(s => s.subject_id === id) || {}).subject_code || '';
    const lessons = d.lessons || [], qs = d.questions || [];
    const lopts = lessons.map(l => [l.lesson_id, `${sc(l.subject_id)} M${l.module_no}.${l.lesson_no} ${l.title}`]);
    V(`<div class="ad-card"><div class="ad-row"><select id="ad-ql" class="ad-in">${lopts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('') || '<option value="">No lessons</option>'}</select>
      <button class="ad-btn" id="ad-addq">Add question</button><span class="ad-mute">The correct answer is highlighted.</span></div>
      <div class="ad-tw"><table><thead><tr><th>Question</th><th>Options</th><th></th></tr></thead><tbody id="ad-qb"></tbody></table></div></div>`);
    const cur = () => Number($('ad-ql').value);
    const draw = () => {
      $('ad-qb').innerHTML = qs.filter(q => q.lesson_id === cur()).map(q =>
        `<tr><td>${esc(q.prompt)}</td><td>${q.options.map((o, i) => `<div class="${i === q.answer ? 'ad-ok' : ''}">${i + 1}. ${esc(o)}</div>`).join('')}</td>
        <td class="ad-act">${btn('qe', q.question_id, 'Edit')}${btn('qd', q.question_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="3">No questions for this lesson yet.</td></tr>';
    };
    $('ad-ql').onchange = draw; draw();
    const fl = [{n: 'prompt', l: 'Question', t: 'textarea', req: 1}, {n: 'o1', l: 'Option 1', req: 1}, {n: 'o2', l: 'Option 2', req: 1}, {n: 'o3', l: 'Option 3 (optional)'}, {n: 'o4', l: 'Option 4 (optional)'},
      {n: 'ans', l: 'Correct option', t: 'select', o: [[0, 'Option 1'], [1, 'Option 2'], [2, 'Option 3'], [3, 'Option 4']]}, {n: 'exp', l: 'Explanation shown after answering (optional)'}];
    const save = (id, lesson) => async v => {
      const opts = [v.o1, v.o2, v.o3, v.o4].map(x => x.trim()).filter(Boolean);
      if (Number(v.ans) >= opts.length || ![v.o1, v.o2, v.o3, v.o4].slice(0, Number(v.ans) + 1).every(x => x.trim())) throw new Error('The correct option must be one you filled in, and options must be filled in order.');
      await rpc('admin_save_question', {p_id: id, p_lesson: lesson, p_prompt: v.prompt, p_options: opts, p_answer: Number(v.ans), p_explanation: v.exp});
      const keep = cur(); await quiz(); if ($('ad-ql')) { $('ad-ql').value = keep; $('ad-ql').onchange(); }
    };
    $('ad-addq').onclick = () => { if (cur()) dlg('Add question', fl, {ans: 0}, save(null, cur()), 'Add question'); };
    $('ad-qb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const q = qs.find(x => String(x.question_id) === b.dataset.id);
      if (b.dataset.a === 'qe') dlg('Edit question', fl, {prompt: q.prompt, o1: q.options[0], o2: q.options[1], o3: q.options[2] || '', o4: q.options[3] || '', ans: q.answer, exp: q.explanation || ''}, save(q.question_id, q.lesson_id));
      else if (confirm('Delete this question?')) rpc('admin_delete_question', {p_id: q.question_id}).then(async () => { const keep = cur(); await quiz(); $('ad-ql').value = keep; $('ad-ql').onchange(); }).catch(x => say(x.message));
    };
  }

  /* Sections: class sections, schedules and student lists */
  async function sections() {
    V('<div class="ad-card"><p class="ad-mute">Loading...</p></div>');
    let rows = [];
    try { rows = await rpc('admin_list_sections') || []; } catch (e) { V(`<div class="ad-card"><p class="ad-mute">${esc(e.message)}</p></div>`); return; }
    const copts = (db.courses || []).map(c => [c.course_code, `${c.course_name} (${c.school_year})`]);
    V(`<div class="ad-card"><div class="ad-row"><h3>Class sections</h3><button class="ad-btn" id="ad-adds">Add section</button></div>
      <div class="ad-tw"><table><thead><tr><th>Section</th><th>Course</th><th>Schedule</th><th>Room</th><th>Students</th><th></th></tr></thead><tbody id="ad-xb"></tbody></table></div></div>`);
    $('ad-xb').innerHTML = rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.course_name || r.course_code)}</td><td>${esc([r.days, r.start_time && r.end_time ? r.start_time + ' to ' + r.end_time : ''].filter(Boolean).join(' '))}</td>
      <td>${esc(r.room || '')}</td><td>${r.student_ids.length}</td><td class="ad-act">${btn('xs', r.section_id, 'Students')}${btn('xe', r.section_id, 'Edit')}${btn('xd', r.section_id, 'Delete', 'bad')}</td></tr>`).join('') || '<tr><td colspan="6">No sections yet.</td></tr>';
    const DAYS = ['', 'MWF', 'TTh', 'MW', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => [x, x || 'No fixed day']);
    const fl = [{n: 'name', l: 'Section name (for example BSIT 1-A)', req: 1}, {n: 'course', l: 'Course', t: 'select', o: copts}, {n: 'days', l: 'Days', t: 'select', o: DAYS},
      {n: 'start', l: 'Start time', t: 'time'}, {n: 'end', l: 'End time', t: 'time'}, {n: 'room', l: 'Room'}];
    const save = id => async v => { await rpc('admin_save_section', {p_id: id, p_name: v.name, p_course: Number(v.course), p_days: v.days, p_start: v.start, p_end: v.end, p_room: v.room}); sections(); };
    $('ad-adds').onclick = () => dlg('Add section', fl, null, save(null), 'Add section');
    $('ad-xb').onclick = e => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const r = rows.find(x => String(x.section_id) === b.dataset.id);
      if (b.dataset.a === 'xe') dlg('Edit section', fl, {name: r.name, course: r.course_code, days: r.days || '', start: r.start_time || '', end: r.end_time || '', room: r.room || ''}, save(Number(r.section_id)));
      else if (b.dataset.a === 'xd') { if (confirm(`Delete section ${r.name}?`)) rpc('admin_delete_section', {p_id: Number(r.section_id)}).then(sections).catch(x => say(x.message)); }
      else {
        const cand = (db.enrollment_data || []).filter(en => en.course_code === r.course_code && en.enrollment_status === 'Enrolled').map(en => en.student_id);
        const list = [...new Set(cand)].map(id => { const s = (db.student_profiles || []).find(x => x.student_id === id); return [id, s ? `${id} - ${s.first_name} ${s.last_name}` : id]; });
        const dd = dlg(`Students in ${r.name}`, [], null, async () => {
          await rpc('admin_set_section_students', {p_id: Number(r.section_id), p_ids: [...dd.querySelectorAll('.ad-chk:checked')].map(i => i.value)});
          sections();
        }, 'Save students', list.length ? `<div class="ad-checks">${list.map(o => `<label><input type="checkbox" class="ad-chk" value="${esc(o[0])}"${r.student_ids.includes(o[0]) ? ' checked' : ''}> ${esc(o[1])}</label>`).join('')}</div>` : '<p class="ad-mute">No students are enrolled in this course yet.</p>');
      }
    };
  }

  /* Reports: course performance, student progress, quiz results, with CSV export */
  function csv(name, head, rows) {
    const cell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + [head].concat(rows).map(r => r.map(cell).join(',')).join('\r\n')], {type: 'text/csv'}));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  const avg = a => a.length ? (a.reduce((x, y) => x + Number(y), 0) / a.length).toFixed(2) : '';
  async function reports() {
    const en = db.enrollment_data || [], gr = db.grades_data || [], today = new Date().toISOString().slice(0, 10);
    const scoreOf = e => { const g = gr.find(x => x.enrollment_id === e.enrollment_id); return g ? Number(g.score) : null; };
    const crsHead = ['Course', 'School year', 'Instructor', 'Enrolled', 'Graded', 'Average score', 'Passed (75+)', 'Assignments'];
    const crs = (db.courses || []).map(c => {
      const es = en.filter(e => e.course_code === c.course_code && e.enrollment_status === 'Enrolled'), sc = es.map(scoreOf).filter(x => x != null);
      return [c.course_name, c.school_year, c.instructor, es.length, sc.length, avg(sc), sc.filter(x => x >= 75).length, (db.assignments || []).filter(a => a.subject_id === c.subject_id).length];
    });
    const stuHead = ['Student ID', 'Name', 'Program', 'Year', 'Courses enrolled', 'Graded', 'Average score', 'Failed (below 75)'];
    const stu = (db.student_profiles || []).map(s => {
      const es = en.filter(e => e.student_id === s.student_id && e.enrollment_status === 'Enrolled'), sc = es.map(scoreOf).filter(x => x != null);
      return [s.student_id, s.first_name + ' ' + s.last_name, s.program, s.year_level, es.length, sc.length, avg(sc), sc.filter(x => x < 75).length];
    });
    const table = (h, r) => `<div class="ad-tw"><table><thead><tr>${h.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${r.map(x => `<tr>${x.map(y => `<td>${esc(y)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${h.length}">Nothing to report yet.</td></tr>`}</tbody></table></div>`;
    V(`<div class="ad-card"><div class="ad-row"><h3>Course performance</h3><button class="ad-btn" data-x="c">Export CSV</button></div>${table(crsHead, crs)}</div>
      <div class="ad-card" style="margin-top:16px"><div class="ad-row"><h3>Student progress</h3><button class="ad-btn" data-x="s">Export CSV</button></div>${table(stuHead, stu)}</div>
      <div class="ad-card" style="margin-top:16px"><div class="ad-row"><h3>Quiz results</h3><button class="ad-btn" data-x="q">Export CSV</button></div><div id="ad-qr"><p class="ad-mute">Loading...</p></div></div>`);
    let qh = ['Student', 'Lesson', 'Score', 'Out of', 'Result', 'Taken'], qr = [];
    try {
      qr = (await rpc('admin_list_quiz_attempts', {p_limit: 300}) || []).map(a => [a.student, a.lesson, a.score, a.total, a.passed ? 'Passed' : 'Not passed', new Date(a.taken_at).toLocaleString('en-PH')]);
      if ($('ad-qr')) $('ad-qr').innerHTML = table(qh, qr);
    } catch (e) { if ($('ad-qr')) $('ad-qr').innerHTML = `<p class="ad-mute">${esc(e.message)}</p>`; }
    $('ad-view').onclick = e => {
      const b = e.target.closest('button[data-x]');
      if (!b) return;
      if (b.dataset.x === 'c') csv(`course-performance-${today}.csv`, crsHead, crs);
      else if (b.dataset.x === 's') csv(`student-progress-${today}.csv`, stuHead, stu);
      else csv(`quiz-results-${today}.csv`, qh, qr);
    };
  }

  /* Activity log */
  async function activity() {
    V('<div class="ad-card"><div id="ad-all"><p class="ad-mute">Loading...</p></div></div>');
    try { $('ad-all').innerHTML = feed(await rpc('admin_list_audit', {p_limit: 100})); }
    catch (e) { $('ad-all').innerHTML = `<p class="ad-mute">${esc(e.message)}</p>`; }
  }

  /* Settings: fixed name, change password, create admin */
  function settings() {
    const c = cred() || {};
    V(`<div class="ad-grid"><div class="ad-card"><h3>Your account</h3>
      <dl class="ad-kv"><dt>Name (fixed)</dt><dd>${esc(acct.full_name)}</dd><dt>Email</dt><dd>${esc(c.email)}</dd><dt>Role</dt><dd>Administrator</dd></dl>
      <p class="ad-mute">This name is used for every record and log entry you make. It cannot be edited here.</p>
      <h3>Change password</h3><form id="ad-pw" class="ad-form">
        <label>Current password<input type="password" id="pw0" autocomplete="current-password" required></label>
        <label>New password (8+ characters; letters, numbers and @ . - _ # only, no spaces)<input type="password" id="pw1" autocomplete="new-password" minlength="8" required></label>
        <label>Confirm new password<input type="password" id="pw2" autocomplete="new-password" minlength="8" required></label>
        <button class="ad-btn" type="submit">Update password</button><p class="ad-msg" id="pwm" role="status"></p></form></div>
      <div class="ad-card"><h3>Create admin account</h3><form id="ad-new" class="ad-form">
        <label>Full name (fixed once created)<input id="na-name" required minlength="3"></label>
        <label>Email<input type="email" id="na-mail" required></label>
        <label>Starting password (8+ characters; letters, numbers and @ . - _ # only, no spaces)<input type="password" id="na-pw" autocomplete="new-password" minlength="8" required></label>
        <button class="ad-btn" type="submit">Create admin</button><p class="ad-msg" id="nam" role="status"></p></form></div></div>`);
    const note = (id, m, bad) => { $(id).textContent = m; $(id).className = 'ad-msg' + (bad ? ' bad' : ''); };
    $('ad-pw').onsubmit = async e => {
      e.preventDefault();
      const cr = cred(), a = $('pw0').value, b = $('pw1').value;
      try {
        if (await hashPassword(cr.email, a) !== cr.hash) throw new Error('Current password is incorrect.');
        { const m = pwProblem(b); if (m) throw new Error(m); }
        if (b !== $('pw2').value) throw new Error('The new passwords do not match.');
        const h = await hashPassword(cr.email, b);
        await rpc('admin_change_password', {p_new_hash: h});
        sessionStorage.setItem('cred', JSON.stringify({email: cr.email, hash: h}));
        $('ad-pw').reset(); note('pwm', 'Password updated.');
      } catch (ex) { note('pwm', ex.message, true); }
    };
    $('ad-new').onsubmit = async e => {
      e.preventDefault();
      try {
        const mail = $('na-mail').value.trim().toLowerCase();
        { const m = emailProblem(mail) || pwProblem($('na-pw').value); if (m) throw new Error(m); }
        await rpc('admin_create_admin', {p_new_email: mail, p_full_name: $('na-name').value, p_new_hash: await hashPassword(mail, $('na-pw').value)});
        $('ad-new').reset(); note('nam', 'Admin account created.');
      } catch (ex) { note('nam', ex.message, true); }
    };
  }

  /* Command bar */
  let items = [], sel = 0;
  const CMDS = [
    ['Open dashboard', () => go('dashboard')], ['Open students', () => go('students')], ['Add student', () => { go('students'); setTimeout(() => $('ad-add') && $('ad-add').click(), 150); }], ['Open grades: return grades', () => go('grades')], ['Open courses', () => go('courses')], ['Add course', () => { go('courses'); setTimeout(() => $('ad-addc') && $('ad-addc').click(), 50); }], ['Enroll a student', () => { go('enrollments'); setTimeout(() => $('ad-adde') && $('ad-adde').click(), 50); }], ['Open reports: export grades', () => go('reports')], ['Review submissions', () => go('submissions')], ['Open quiz bank', () => go('quiz')], ['Open sections and schedules', () => go('sections')], ['New announcement', () => { go('announcements'); setTimeout(() => $('ad-adan') && $('ad-adan').click(), 400); }], ['Open modules and assignments', () => go('content')], ['Create assignment', () => { go('content'); setTimeout(() => $('ad-adda') && $('ad-adda').click(), 50); }], ['Create module', () => { go('content'); setTimeout(() => $('ad-addm') && $('ad-addm').click(), 50); }], ['Open activity log', () => go('activity')],
    ['Open settings: change password', () => go('settings')], ['Create admin account', () => go('settings')],
    ['Enrollment periods (classic view)', () => classic('enrollments')], ['Classic portal view', () => classic()], ['Log out', () => $('logout').click()]
  ];
  function pal(on) {
    $('ad-pal').hidden = !on;
    if (on) { $('ad-pin').value = ''; list(''); setTimeout(() => $('ad-pin').focus(), 0); }
  }
  function list(t) {
    t = t.trim().toLowerCase();
    items = CMDS.filter(c => !t || c[0].toLowerCase().includes(t)).map(c => ({label: c[0], run: c[1]}));
    if (t.length >= 2) (db.student_profiles || []).filter(s => [s.student_id, s.first_name, s.last_name].join(' ').toLowerCase().includes(t)).slice(0, 6)
      .forEach(s => items.push({label: `Student: ${s.first_name} ${s.last_name} (${s.student_id})`, run: () => { q = s.student_id; go('students'); }}));
    sel = 0; paint();
  }
  function paint() {
    $('ad-plist').innerHTML = items.map((i, n) => `<li data-n="${n}" class="${n === sel ? 'on' : ''}">${esc(i.label)}</li>`).join('') || '<li class="ad-mute">No match</li>';
    $('ad-plist').querySelectorAll('li[data-n]').forEach(li => li.onclick = () => runSel(+li.dataset.n));
  }
  function runSel(n) { const i = items[n]; if (i) { pal(false); i.run(); } }
  function palKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); runSel(sel); }
  }

  window.AdminPanel = {open};
})();