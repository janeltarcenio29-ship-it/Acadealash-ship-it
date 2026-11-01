/* Acadaelash LMS: learning area (courses > modules > lessons, quizzes, progress).
   Data and progress come from Supabase RPCs in learning_setup.sql, which scope every call to the signed-in student.
   Routes (hash, so refresh and Back work): #modules, #modules/c/<subject>, #modules/m/<subject>-<module>, #modules/l/<lesson>. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const cred = () => { try { return JSON.parse(sessionStorage.getItem('cred')); } catch (e) { return null; } };
  async function call(fn, args = {}) {
    const c = cred();
    if (!c) throw new Error('Your session expired. Please log out and log in again.');
    const {data, error} = await sb.rpc(fn, {p_email: c.email, p_hash: c.hash, ...args});
    if (error) throw new Error(error.code === 'PGRST202' ? 'The learning system is not set up yet. Run learning_setup.sql in Supabase.' : error.message);
    return data;
  }
  let L = null, f = {q: '', course: '', prog: 'all', sort: 'order'}, pending = location.hash, busy = false;
  const root = () => $('mod-root');
  const pr = id => L.progress.find(p => p.lesson_id === id);
  const done = id => !!(pr(id) && pr(id).completed_at);
  const best = id => L.attempts.filter(a => a.lesson_id === id).sort((a, b) => b.score / b.total - a.score / a.total)[0];
  const NF = 'That item was not found, or you are not enrolled in that course.';
  const H = {home: '#modules', c: sid => '#modules/c/' + sid, m: k => '#modules/m/' + k, l: id => '#modules/l/' + id};

  function mods() {
    const ids = new Set(active().map(x => x.c.subject_id)), g = {};
    L.lessons.filter(l => ids.has(l.subject_id)).forEach(l => {
      const k = l.subject_id + '-' + l.module_no;
      (g[k] = g[k] || {k, sid: l.subject_id, no: l.module_no, title: l.module_title, ls: []}).ls.push(l);
    });
    return Object.values(g).map(m => {
      m.ls.sort((a, b) => a.lesson_no - b.lesson_no);
      m.done = m.ls.filter(l => done(l.lesson_id)).length;
      m.pct = Math.round(m.done / m.ls.length * 100);
      m.st = m.done === m.ls.length ? 'Completed' : (m.done || m.ls.some(l => pr(l.lesson_id))) ? 'In Progress' : 'Not Started';
      m.min = m.ls.reduce((a, l) => a + l.minutes, 0);
      m.quizzes = m.ls.filter(l => l.quiz_n).length;
      m.last = m.ls.map(l => pr(l.lesson_id) && pr(l.lesson_id).last_opened).filter(Boolean).sort().pop();
      m.updated = m.ls.map(l => l.updated_at).sort().pop();
      m.unreviewed = m.ls.some(l => !l.reviewed);
      const dm = db.modules.find(x => x.subject_id === m.sid && x.module_no === m.no);
      m.desc = (dm && dm.description) || m.ls[0].summary;
      m.next = m.ls.find(l => !done(l.lesson_id)) || m.ls[0];
      return m;
    }).sort((a, b) => a.sid - b.sid || a.no - b.no);
  }
  const cname = sid => { const c = db.courses.find(x => x.subject_id === sid); return c ? c.course_name : ''; };
  const courseMods = sid => mods().filter(m => m.sid === sid);
  const courseLessons = sid => courseMods(sid).flatMap(m => m.ls);
  const cstat = sid => { const ls = courseLessons(sid), d = ls.filter(l => done(l.lesson_id)).length; return {n: ls.length, d, pct: ls.length ? Math.round(d / ls.length * 100) : 0}; };
  const crumbs = parts => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#dashboard">Dashboard</a>${parts.map(([t, h]) => h ? ` <span aria-hidden="true">/</span> <a href="${h}">${esc(t)}</a>` : ` <span aria-hidden="true">/</span> <span aria-current="page">${esc(t)}</span>`).join('')}</nav>`;
  const meter = p => `<div class="meter" aria-hidden="true"><i style="width:${p}%"></i></div>`;

  /* ---- Course selection ---- */
  function home(note) {
    const cs = active().map(x => x.c), tl = cs.reduce((a, c) => a + cstat(c.subject_id).n, 0), dl = cs.reduce((a, c) => a + cstat(c.subject_id).d, 0);
    const lastP = L.progress.filter(p => p.last_opened && L.lessons.some(l => l.lesson_id === p.lesson_id && cs.some(c => c.subject_id === l.subject_id))).sort((a, b) => String(b.last_opened).localeCompare(a.last_opened))[0];
    const lastL = lastP && L.lessons.find(l => l.lesson_id === lastP.lesson_id);
    root().innerHTML = crumbs([['Modules']]) + (note ? `<p class="note" role="alert">${esc(note)}</p>` : '') + `
      <div class="card mod-stats"><div><small>Overall progress</small><b>${tl ? Math.round(dl / tl * 100) : 0}%</b></div>
      <div><small>Enrolled courses</small><b>${cs.length}</b></div><div><small>Lessons completed</small><b>${dl}/${tl}</b></div>
      ${lastL ? `<a class="btn" href="${H.l(lastL.lesson_id)}">Continue: ${esc(lastL.title)}</a>` : ''}</div>
      <div class="mod-grid">${cs.length ? cs.map(c => {
        const s = cstat(c.subject_id), nm = courseMods(c.subject_id).length;
        return `<article class="card modcard"><div class="mc-top"><span class="cc-code">${esc(code(c.subject_id))}</span><span class="badge ${s.n && s.d === s.n ? 'ok' : ''}">${s.n && s.d === s.n ? 'Completed' : s.d ? 'In Progress' : 'Not Started'}</span></div>
        <h3>${esc(c.course_name)}</h3><p class="mc-sub">${esc(c.instructor || '')}</p>${c.description ? `<p>${esc(c.description)}</p>` : ''}
        <p class="mc-meta">${nm} module${nm === 1 ? '' : 's'} · ${s.n} lesson${s.n === 1 ? '' : 's'}</p>
        <div class="cc-row"><span>Progress</span><b>${s.pct}%</b></div>${meter(s.pct)}
        <div class="mc-act"><a class="btn" href="${H.c(c.subject_id)}">Open Course</a></div></article>`;
      }).join('') : '<div class="card">You are not enrolled in any course. Open Enrollments to add one.</div>'}</div>`;
  }

  /* ---- Module cards and course page ---- */
  function cardHtml(m) {
    const cls = m.st === 'Completed' ? 'ok' : m.st === 'In Progress' ? 'warn' : '';
    const obj = [...new Set(m.ls.flatMap(l => l.objectives || []))].slice(0, 3);
    return `<article class="card modcard">
      <div class="mc-top"><span class="cc-code">${esc(code(m.sid))} · Module ${m.no}</span><span class="badge ${cls}">${m.st}</span></div>
      <h3>${esc(m.title)}</h3><p>${esc(m.desc)}</p>${obj.length ? `<ul class="mc-obj">${obj.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      <p class="mc-meta">${m.min} min · ${m.ls.length} lesson${m.ls.length > 1 ? 's' : ''} · ${m.quizzes} quiz${m.quizzes === 1 ? '' : 'zes'}${m.last ? ' · Last opened ' + fmtDate(m.last) : ''}</p>
      <div class="cc-row"><span>Progress</span><b>${m.pct}%</b></div>${meter(m.pct)}
      <div class="mc-act"><a class="btn ghost" href="${H.m(m.k)}">Open Module</a>${dlBtn('dlmod', `data-k="${m.k}" aria-label="Download ${esc(code(m.sid))} Module ${m.no}"`, 'Download Module')}
      <a class="btn" href="${H.l(m.next.lesson_id)}">${m.st === 'Not Started' ? 'Start Learning' : m.st === 'Completed' ? 'Review' : 'Continue Learning'}</a></div></article>`;
  }
  function cards() {
    const all = mods().filter(m => String(m.sid) === f.course);
    const list = all.filter(m => (f.prog === 'all' || m.st === f.prog) && (!f.q || (m.title + ' ' + m.desc + ' ' + m.ls.map(l => l.title).join(' ')).toLowerCase().includes(f.q.toLowerCase())));
    list.sort((a, b) => f.sort === 'progress' ? b.pct - a.pct : f.sort === 'recent' ? String(b.updated).localeCompare(a.updated) : a.no - b.no);
    $('mod-cards').innerHTML = list.length ? list.map(cardHtml).join('') : `<div class="card">${all.length ? 'No modules match your search or filters.' : 'No modules have been published for this course yet.'}</div>`;
  }
  function course(sid) {
    f = {q: '', course: String(sid), prog: 'all', sort: 'order'};
    const s = cstat(sid), nx = courseLessons(sid).find(l => !done(l.lesson_id));
    root().innerHTML = crumbs([['Modules', H.home], [code(sid)]]) + `<div class="card"><span class="cc-code">${esc(code(sid))}</span><h2>${esc(cname(sid))}</h2>
      <p>${esc((db.courses.find(c => c.subject_id === sid) || {}).instructor || '')}</p>
      <div class="cc-row"><span>Course progress · ${s.d} of ${s.n} lessons</span><b>${s.pct}%</b></div>${meter(s.pct)}
      <div class="mc-act">${nx ? `<a class="btn" href="${H.l(nx.lesson_id)}">${s.d ? 'Continue Learning' : 'Start Learning'}</a>` : ''}${dlBtn('dlall', `data-sid="${sid}"`, 'Download All Materials')}</div><p class="dl-status" id="dl-status" role="status"></p></div>
      <div class="mod-filters"><input id="mf-q" type="search" placeholder="Search modules and lessons" aria-label="Search modules and lessons">
      <select id="mf-p" aria-label="Progress">${['all', 'Not Started', 'In Progress', 'Completed'].map(v => `<option value="${v}">${v === 'all' ? 'All progress' : v}</option>`).join('')}</select>
      <select id="mf-s" aria-label="Sort">${[['order', 'Module order'], ['recent', 'Recently updated'], ['progress', 'Progress']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
      <div class="mod-grid" id="mod-cards"></div>`;
    cards();
  }

  /* ---- Module page ---- */
  function moduleView(k) {
    const m = mods().find(x => x.k === k);
    if (!m) return home(NF);
    const obj = [...new Set(m.ls.flatMap(l => l.objectives || []))], res = m.ls.flatMap(l => l.resources || []);
    root().innerHTML = crumbs([['Modules', H.home], [code(m.sid), H.c(m.sid)], ['Module ' + m.no]]) + `
      <div class="card"><span class="cc-code">${esc(code(m.sid))} · Module ${m.no}</span><h2>${esc(m.title)}</h2><p>${esc(cname(m.sid))}</p><p>${esc(m.desc)}</p>
      <p class="mc-meta">${m.min} min · ${m.ls.length} lessons · ${m.quizzes} quizzes · ${m.res || res.length} resources · ${m.pct}% complete</p>${meter(m.pct)}
      ${m.unreviewed ? '<p class="note">Suggested content: not yet reviewed by your instructor and not the official syllabus.</p>' : ''}
      ${obj.length ? `<h4>Learning objectives</h4><ul>${obj.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      <div class="mc-act"><a class="btn ghost" href="${H.c(m.sid)}">Back to course</a>${dlBtn('dlmod', `data-k="${m.k}"`, 'Download Module')}<a class="btn" href="${H.l(m.next.lesson_id)}">${m.st === 'Not Started' ? 'Start Learning' : m.st === 'Completed' ? 'Review' : 'Continue Learning'}</a></div><p class="dl-status" id="dl-status" role="status"></p></div>
      <div class="card"><h4>Lessons</h4><ol class="lesson-list">${m.ls.map(l => `<li><div><b>${esc(l.title)}</b><p>${esc(l.summary)}</p>
      <small>${esc(l.kind)} · ${l.minutes} min${l.quiz_n ? ' · Knowledge check' : ''} · ${done(l.lesson_id) ? 'Completed' : pr(l.lesson_id) ? 'In progress' : 'Not started'}</small></div>
      <a class="btn" href="${H.l(l.lesson_id)}">${done(l.lesson_id) ? 'Review' : 'Open lesson'}</a></li>`).join('')}</ol></div>`;
  }

  /* ---- Lesson viewer ---- */
  function resHtml(r) {
    const u = String(r.url || ''), ok = /^(https?:\/\/|\.{0,2}\/)/i.test(u);
    if (!ok) return '';
    const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/i);
    let embed = '';
    if (yt) embed = `<iframe class="res-embed" src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="${esc(r.title)}" allowfullscreen loading="lazy"></iframe>`;
    else if (/\.(mp4|webm)(\?|#|$)/i.test(u)) embed = `<video class="res-embed" controls preload="none" src="${esc(u)}"></video>`;
    else if (/\.pdf(\?|#|$)/i.test(u)) embed = `<details><summary>Preview PDF</summary><iframe class="res-embed tall" src="${esc(u)}" title="${esc(r.title)}" loading="lazy"></iframe></details>`;
    const dl = isLocal(u) && EXT.includes(extOf(u)) ? ` <a class="dl" href="${esc(norm(u))}" download="${esc(safe(baseOf(u)))}">${dlIc}Download ${esc(baseOf(u))}</a>` : '';
    return `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a> <small>${esc(r.source || '')}</small>${dl}${embed}</li>`;
  }
  async function lessonView(id) {
    const l = L.lessons.find(x => x.lesson_id === id), m = l && mods().find(x => x.sid === l.subject_id && x.no === l.module_no);
    if (!m) return home(NF);
    try { await call('open_lesson', {p_lesson: id}); const p = pr(id); if (p) p.last_opened = new Date().toISOString(); else L.progress.push({lesson_id: id, last_opened: new Date().toISOString()}); }
    catch (e) { alert(e.message); }
    const seq = courseLessons(l.subject_id), i = seq.findIndex(x => x.lesson_id === id), prev = seq[i - 1], next = seq[i + 1];
    const mm = mods().find(x => x.k === m.k), rem = mm.ls.filter(x => !done(x.lesson_id)).reduce((a, x) => a + x.minutes, 0), cs = cstat(l.subject_id);
    const res = (l.resources || []).map(resHtml).join('');
    root().innerHTML = crumbs([['Modules', H.home], [code(m.sid), H.c(m.sid)], ['Module ' + m.no, H.m(m.k)], [l.title]]) + `
      <div class="lesson-top card"><div><b>${esc(cname(m.sid))}</b><small>Course progress ${cs.pct}% · ${cs.d} of ${cs.n} lessons</small></div>${meter(cs.pct)}</div>
      <div class="lesson-wrap"><nav class="card lesson-nav" aria-label="Lessons"><b>${esc(code(m.sid))}</b>${courseMods(m.sid).map(md => `<small>Module ${md.no}: ${esc(md.title)}</small>${md.ls.map(x => `<a class="${x.lesson_id === id ? 'on' : ''}${done(x.lesson_id) ? ' ok' : ''}" href="${H.l(x.lesson_id)}" ${x.lesson_id === id ? 'aria-current="page"' : ''}>${done(x.lesson_id) ? '✓ ' : ''}${esc(x.title)}</a>`).join('')}`).join('')}</nav>
      <article class="card lesson-main"><h2>${esc(l.title)}</h2>${l.reviewed ? '' : '<p class="note">Suggested content pending instructor review.</p>'}
        <h4>Learning objectives</h4><ul>${(l.objectives || []).map(o => `<li>${esc(o)}</li>`).join('')}</ul>
        <div class="lesson-body">${l.body_html || '<p>This lesson has no written content yet.</p>'}</div>
        <div id="quiz"></div>
        <h4>Additional resources</h4><ul class="res">${res || '<li>None listed.</li>'}</ul>
        <div class="mc-act lesson-ctl">${prev ? `<a class="btn ghost" href="${H.l(prev.lesson_id)}">Previous lesson</a>` : '<span class="btn ghost is-off" aria-disabled="true">Previous lesson</span>'}
        <button class="btn" id="complete" data-mod="complete" data-id="${id}" ${done(id) ? 'disabled' : ''}>${done(id) ? 'Completed ✓' : 'Mark lesson complete'}</button>
        ${next ? `<a class="btn ghost" href="${H.l(next.lesson_id)}">Next lesson</a>` : '<span class="btn ghost is-off" aria-disabled="true">Next lesson</span>'}</div>
        <div class="mc-act">${dlBtn('dllesson', `data-id="${id}"`, 'Download Lesson')}${dlBtn('dlmod', `data-k="${m.k}"`, 'Download Module')}</div><p class="dl-status" id="dl-status" role="status"></p>
        <div class="mc-act"><a class="linkbtn" href="${H.m(m.k)}">&larr; Back to module</a><a class="linkbtn" href="${H.c(m.sid)}">Back to course</a><a class="linkbtn" href="#dashboard">Return to dashboard</a></div></article>
      <aside class="card lesson-side"><b>Module progress</b>${meter(mm.pct)}<p>${mm.done} of ${mm.ls.length} lessons · ${rem} min left</p></aside></div>`;
    if (l.quiz_n) quizView(l);
  }

  async function quizView(l) {
    const box = $('quiz'), b = best(l.lesson_id), n = L.attempts.filter(a => a.lesson_id === l.lesson_id).length;
    box.innerHTML = '<p>Loading knowledge check...</p>';
    try {
      const qs = await call('get_quiz', {p_lesson: l.lesson_id});
      if (!$('quiz')) return;
      box.innerHTML = `<h4>Knowledge check</h4><p>Pass mark 70%. Attempts used: ${n}/3${b ? ` · Best: ${b.score}/${b.total}` : ''}</p>
        <form id="quizform">${qs.map((q, i) => `<fieldset><legend>${i + 1}. ${esc(q.prompt)}</legend>${q.options.map((o, j) => `<label><input type="radio" name="q${q.question_id}" value="${j}"> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}
        <button class="btn" ${n >= 3 ? 'disabled' : ''}>Submit answers</button></form><div id="qres" role="status"></div>`;
      $('quizform').onsubmit = async ev => {
        ev.preventDefault();
        const ans = {};
        qs.forEach(q => { const c = ev.target.querySelector(`input[name="q${q.question_id}"]:checked`); if (c) ans[q.question_id] = +c.value; });
        if (Object.keys(ans).length < qs.length && !confirm('Some questions are unanswered. Submit anyway?')) return;
        const btn = ev.target.querySelector('button'); btn.disabled = true;
        try {
          const r = await call('submit_quiz', {p_lesson: l.lesson_id, p_answers: ans});
          L.attempts.unshift({lesson_id: l.lesson_id, score: r.score, total: r.total, passed: r.passed, taken_at: new Date().toISOString()});
          $('qres').innerHTML = `<p><b>${r.score}/${r.total}</b> · ${r.passed ? 'Passed. You can now mark the lesson complete.' : `Not passed. Attempts left: ${r.attempts_left}.`}</p><ul>${r.review.map((x, i) => `<li>Q${i + 1}: ${esc(x.explanation || '')}</li>`).join('')}</ul>`;
        } catch (e) { $('qres').textContent = e.message; btn.disabled = false; }
      };
    } catch (e) { box.innerHTML = `<p class="formerr">${esc(e.message)}</p>`; }
  }

  async function complete(id, btn) {
    if (busy) return; busy = true; btn.disabled = true;
    try { await call('complete_lesson', {p_lesson: id}); const p = pr(id); if (p) p.completed_at = new Date().toISOString(); else L.progress.push({lesson_id: id, completed_at: new Date().toISOString()}); await lessonView(id); }
    catch (e) { alert(e.message); btn.disabled = false; }
    finally { busy = false; }
  }

  /* ---- Downloads: real browser saves; ZIPs are built in the browser (store-only, no dependencies) ---- */
  //ZIP-START
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = -1; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  function makeZip(files) {
    const enc = new TextEncoder(), parts = [], cd = [], d = new Date();
    const dt = ((d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate()) & 0xffff, tm = (d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1) & 0xffff;
    let off = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), c = crc32(f.data), n = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true);
      lh.setUint32(14, c, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true); lh.setUint16(26, nm.length, true);
      parts.push(lh.buffer, nm, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true);
      ch.setUint32(16, c, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      cd.push(ch.buffer, nm);
      off += 30 + nm.length + n;
    }
    const size = cd.reduce((a, b) => a + b.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cd, end.buffer], {type: 'application/zip'});
  }
  //ZIP-END
  const EXT = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'csv', 'txt', 'md', 'png', 'jpg', 'jpeg', 'zip', 'mp4', 'webm'];
  const safe = s => { let t = String(s == null ? '' : s).normalize('NFC').replace(/[<>:"\/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, '_').replace(/^[._]+|[. ]+$/g, '').slice(0, 80) || 'file'; return /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(t) ? '_' + t : t; };
  const pad = n => String(n).padStart(2, '0');
  const extOf = u => ((String(u).split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  const baseOf = u => { try { return decodeURIComponent(String(u).split(/[?#]/)[0].split('/').pop()); } catch (e) { return String(u).split('/').pop(); } };
  const norm = u => /^\/(?!\/)/.test(u) ? '.' + u : u; // project-relative paths such as /materials/x.pdf
  const isLocal = u => { try { const x = new URL(norm(u), location.href); return location.protocol === 'file:' ? x.protocol === 'file:' : x.origin === location.origin; } catch (e) { return false; } };
  const htmlEsc = esc;
  function lessonDoc(l, m) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEsc(l.title)}</title>
<style>body{font:16px/1.65 Segoe UI,system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1b2b3a}h1{color:#365F83}small{color:#5a6b7b}pre{background:#E8F0F7;padding:12px;overflow:auto}img{max-width:100%}.note{background:#fff6e0;padding:8px 12px;border-radius:6px}</style></head><body>
<small>${htmlEsc(code(m.sid))} · ${htmlEsc(cname(m.sid))} · Module ${m.no}: ${htmlEsc(m.title)}</small><h1>${htmlEsc(l.title)}</h1>${l.reviewed ? '' : '<p class="note">Suggested content pending instructor review. It is not the official syllabus.</p>'}
${(l.objectives || []).length ? `<h2>Learning objectives</h2><ul>${l.objectives.map(o => `<li>${htmlEsc(o)}</li>`).join('')}</ul>` : ''}
${l.body_html || '<p>This lesson has no written content.</p>'}
${(l.resources || []).length ? `<h2>Additional resources</h2><ul>${l.resources.map(r => `<li>${htmlEsc(r.title)}${r.url ? ` &ndash; ${htmlEsc(r.url)}` : ''}</li>`).join('')}</ul>` : ''}</body></html>`;
  }
  function overviewDoc(m) {
    const obj = [...new Set(m.ls.flatMap(l => l.objectives || []))];
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${htmlEsc(m.title)}</title><style>body{font:16px/1.65 Segoe UI,system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}h1{color:#365F83}</style></head><body>
<small>${htmlEsc(code(m.sid))} · ${htmlEsc(cname(m.sid))}</small><h1>Module ${m.no}: ${htmlEsc(m.title)}</h1><p>${htmlEsc(m.desc)}</p>
${obj.length ? `<h2>Learning objectives</h2><ul>${obj.map(o => `<li>${htmlEsc(o)}</li>`).join('')}</ul>` : ''}
<h2>Lessons</h2><ol>${m.ls.map(l => `<li>${htmlEsc(l.title)} (${l.minutes} min)</li>`).join('')}</ol></body></html>`;
  }
  async function getBytes(url) {
    const r = await fetch(norm(url));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }
  // Collects only files that exist and may be saved; everything else is listed in README.txt with the reason.
  async function buildZip(list, rootName, say) {
    const enc = new TextEncoder(), files = [], skipped = [], links = [], used = new Set(), multi = list.length > 1;
    const put = (path, data) => { let p = path, n = 2; while (used.has(p.toLowerCase())) p = path.replace(/(\.[^./]*)?$/, `_${n++}$1`); used.add(p.toLowerCase()); files.push({name: rootName + '/' + p, data}); return p; };
    const jobs = [];
    list.forEach(m => {
      const dir = multi ? `${safe(code(m.sid))}_Module_${pad(m.no)}/` : '';
      put(dir + 'Module_Overview.html', enc.encode(overviewDoc(m)));
      m.ls.forEach(l => put(`${dir}Lessons/Lesson_${pad(l.lesson_no)}_${safe(l.title)}.html`, enc.encode(lessonDoc(l, m))));
      db.modules.filter(x => x.subject_id === m.sid && x.module_no === m.no && x.file_path).forEach(x => {
        const e = extOf(x.file_path);
        if (!EXT.includes(e)) skipped.push(`${baseOf(x.file_path)} (file type .${e || '?'} is not supported)`);
        else jobs.push({path: dir + 'Materials/' + safe(baseOf(x.file_path)), url: x.file_path, label: baseOf(x.file_path)});
      });
      m.ls.forEach(l => (l.resources || []).forEach(r => {
        if (!r.url) return;
        const e = extOf(r.url);
        if (!isLocal(r.url)) links.push(`${r.title}: ${r.url}`);
        else if (!EXT.includes(e)) skipped.push(`${r.title} (file type .${e || '?'} is not supported)`);
        else jobs.push({path: `${dir}Resources/${safe(baseOf(r.url))}`, url: r.url, label: r.title});
      }));
    });
    let failed = 0;
    for (let i = 0; i < jobs.length; i++) {
      say(`Preparing file ${i + 1} of ${jobs.length}...`);
      try { put(jobs[i].path, await getBytes(jobs[i].url)); }
      catch (e) { failed++; skipped.push(`${jobs[i].label} (could not be read: ${e.message})`); }
    }
    say('Creating ZIP...');
    const title = multi ? `${code(list[0].sid)} all modules` : `${code(list[0].sid)} Module ${list[0].no}: ${list[0].title}`;
    const readme = [`${title}`, `Course: ${cname(list[0].sid)}`, `Saved from Acadaelash on ${new Date().toLocaleString('en-PH')}`, '',
      'CONTENTS', ...files.map(f => '  ' + f.name.slice(rootName.length + 1)), '',
      'OFFLINE STUDY', '  Open the .html lesson files in any web browser; they do not need an internet connection.',
      '  Files in Materials and Resources keep their original format.', '  Content marked as suggested has not been reviewed by your instructor.',
      ...(links.length ? ['', 'EXTERNAL LINKS (not downloaded, they need an internet connection)', ...links.map(x => '  ' + x)] : []),
      ...(skipped.length ? ['', 'NOT INCLUDED', ...skipped.map(x => '  ' + x)] : [])].join('\r\n');
    put('README.txt', enc.encode(readme));
    let note = skipped.length ? `${skipped.length} item${skipped.length > 1 ? 's were' : ' was'} not included; see README.txt.` : '';
    if (failed && location.protocol === 'file:') note += ' Browsers block reading files from a file:// address. Open the portal through a local web server (for example run "npx serve" in the project folder) to include them.';
    return {blob: makeZip(files), note};
  }
  function save(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }
  let dlBusy = false;
  const say = (t, bad) => { const el = $('dl-status'); if (el) { el.textContent = t; el.classList.toggle('bad', !!bad); } };
  async function runDl(btn, job) {
    if (dlBusy) return;
    dlBusy = true; btn.disabled = true; btn.classList.add('is-busy'); say('Preparing your download...');
    try { const r = await job(say); save(r.blob, r.name); say(`Saved ${r.name} through your browser's downloads. ${r.note || ''}`.trim()); }
    catch (e) { say('Download failed: ' + e.message, true); }
    finally { dlBusy = false; btn.disabled = false; btn.classList.remove('is-busy'); }
  }
  const dlIc = '<svg class="ic" aria-hidden="true"><use href="#i-download"/></svg>';
  const dlBtn = (mod, attr, label, cls = 'ghost') => `<button type="button" class="btn ${cls}" data-mod="${mod}" ${attr}>${dlIc}${label}</button>`;
  const modZip = m => async say => ({...(await buildZip([m], `${safe(code(m.sid))}_Module_${pad(m.no)}`, say)), name: `${safe(code(m.sid))}_Module_${pad(m.no)}.zip`});
  const allZip = sid => async say => {
    const list = courseMods(sid);
    if (!list.length) throw new Error('This course has no downloadable materials yet.');
    return {...(await buildZip(list, `${safe(code(sid))}_All_Modules`, say)), name: `${safe(code(sid))}_All_Modules.zip`};
  };
  const lessonDl = (l, m) => async () => ({blob: new Blob([lessonDoc(l, m)], {type: 'text/html;charset=utf-8'}), name: `${safe(code(m.sid))}_Module_${pad(m.no)}_Lesson_${pad(l.lesson_no)}_${safe(l.title)}.html`});

  /* ---- Routing ---- */
  function route(h) {
    if (!L) return;
    const p = String(h || '').replace(/^#/, '').split('/');
    if (p[1] === 'c') return active().some(x => x.c.subject_id === +p[2]) ? course(+p[2]) : home(NF);
    if (p[1] === 'm') return moduleView(p[2]);
    if (p[1] === 'l') return Number.isInteger(+p[2]) && p[2] ? lessonView(+p[2]) : home(NF);
    home();
  }

  const original = renderers.modules; // keeps the existing downloadable-materials list working
  renderers.modules = async function () {
    original();
    const want = pending || '#modules'; pending = null;
    root().innerHTML = '<div class="card">Loading modules...</div>';
    try { L = await call('get_learning'); pending = ''; if (want.startsWith('#modules/') && location.hash !== want) history.replaceState(null, '', want); route(want); window.scrollTo(0, 0); }
    catch (e) { root().innerHTML = `<div class="card"><p class="formerr">${esc(e.message)}</p><button class="btn" data-mod="retry">Try again</button></div>`; }
  };

  // Back/Forward, typed URLs and every anchor in the learning area arrive here
  window.addEventListener('hashchange', () => {
    if (document.body.classList.contains('locked') || typeof me === 'undefined' || me == null) return;
    const v = location.hash.slice(1).split('/')[0];
    if (!renderers[v]) return;
    if (v === 'modules' && cur === 'modules' && L) { route(location.hash); window.scrollTo(0, 0); }
    else if (v !== cur || v === 'modules') { pending = location.hash; window.keepHash = true; show(v); window.keepHash = false; }
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('#mod-root [data-mod]');
    if (!b || b.disabled) return;
    const a = b.dataset.mod, mod = b.dataset.k && mods().find(x => x.k === b.dataset.k);
    if (a === 'complete') complete(+b.dataset.id, b); else if (a === 'retry') renderers.modules();
    else if (a === 'dlmod' && mod) runDl(b, modZip(mod));
    else if (a === 'dlall') runDl(b, allZip(+b.dataset.sid));
    else if (a === 'dllesson') { const l = L.lessons.find(x => x.lesson_id === +b.dataset.id), m = l && mods().find(x => x.sid === l.subject_id && x.no === l.module_no); if (m) runDl(b, lessonDl(l, m)); }
  });
  document.addEventListener('input', e => {
    if (!e.target.closest('.mod-filters')) return;
    f.q = $('mf-q').value; f.prog = $('mf-p').value; f.sort = $('mf-s').value; cards();
  });
})();
