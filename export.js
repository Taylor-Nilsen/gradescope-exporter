const GS = 'https://www.gradescope.com';
const start = new URL(location.href).searchParams.get('u') || '';
const m = start.match(/gradescope\.com\/courses\/(\d+)(?:\/assignments\/\d+\/submissions\/(\d+))?/);
const openCourse = m?.[1], openSub = m?.[2];
const $ = id => document.getElementById(id);
const log = s => { $('log').textContent += s + '\n'; };
const get = (path, opts = {}) => fetch(GS + path, { credentials: 'include', ...opts });
const parse = html => new DOMParser().parseFromString(html, 'text/html');

// User edits: { term|name|prof: {courseId: v}, sub: {path: v} }, kept across sessions.
// Older builds stored terms alone in localStorage.termOverrides; fold those in.
const edits = (() => { try {
  const e = JSON.parse(localStorage.edits || '{}');
  e.term = { ...JSON.parse(localStorage.termOverrides || '{}'), ...e.term };
  return e;
} catch { return {}; } })();
const val = (kind, key, orig) => edits[kind]?.[key] || orig || '';
const termOf = c => val('term', c.id, c.term), nameOf = c => val('name', c.id, c.name), profOf = c => val('prof', c.id, c.prof), subOf = s => val('sub', s.path, s.name);
let editing = false;

// courses: id -> { id, name, term, subs: null | [{name, path}], picked: Set(path), all: bool }
const gsCourses = new Map();
let courses = gsCourses, mode = 'gs';
const ctx = { gs: 'Reading page…', cv: '' };
const setCtx = (m, t) => { ctx[m] = t; if (mode === m) $('ctx').textContent = t; };

(async function init() {
  const doc = parse(await (await get('/')).text());
  for (const a of doc.querySelectorAll('a.courseBox')) {
    const id = a.getAttribute('href').match(/\d+/)[0];
    gsCourses.set(id, {
      id, name: a.querySelector('.courseBox--shortname')?.textContent.trim() || id,
      term: a.closest('.courseList--coursesForTerm')?.previousElementSibling?.textContent.trim() || '',
      subs: null, picked: new Set(), all: false,
    });
  }
  if (!gsCourses.size) { setCtx('gs', 'No courses found. Are you logged in to Gradescope?'); return; }
  setCtx('gs', `${gsCourses.size} courses`);
  render();
  if (openCourse && gsCourses.has(openCourse)) {
    const c = gsCourses.get(openCourse);
    if (openSub) { await load(c); const s = c.subs.find(s => s.path.endsWith('/submissions/' + openSub)); if (s) c.picked.add(s.path); c.open = true; }
    else c.all = true;
    render();
  }
  // Load every course in the background so profs show up.
  await Promise.all([...gsCourses.values()].map(c => load(c).catch(() => {})));
  render();
})().catch(e => { setCtx('gs', 'Error: ' + e.message); });

const load = c => c.loading ??= (c.cv ? cvList : gsList)(c).then(() => {
  if (c.all) { c.subs.forEach(s => c.picked.add(s.path)); c.all = false; }
}).catch(e => { c.loading = null; throw e; });

async function gsList(c) {
  const doc = parse(await (await get('/courses/' + c.id)).text());
  c.term = doc.querySelector('.courseHeader--term')?.textContent.trim() || c.term;
  c.prof = lastName(doc.querySelector('li[id^=sidebar-instructor-] .sidebar--menuItemLabel')?.textContent || '');
  c.subs = [...doc.querySelectorAll('#assignments-student-table tbody tr')].map(tr => {
    const a = tr.querySelector('th a');
    return a && { name: tr.querySelector('th').textContent.trim(), path: a.getAttribute('href') };
  }).filter(Boolean);
}


const isPicked = c => ['all', 'some'].includes(state(c));
const state = c => c.all ? 'all' : !c.subs ? 'none' : !c.subs.length ? 'empty' : c.picked.size === 0 ? 'none' : c.picked.size === c.subs.length ? 'all' : 'some';

function render() {
  if (editing) return; // blur re-renders when the edit closes
  const root = $('courses'); root.innerHTML = '';
  for (const c of courses.values()) {
    const st = state(c);
    const row = document.createElement('div'); row.className = 'course';
    row.innerHTML = `<label><input type="checkbox"> <span class="name"></span> <span class="prof"></span> <span class="term"></span></label>
      <button class="toggle" aria-label="Show assignments">${c.open ? '▾' : '▸'}</button><div class="subs"></div>`;
    editable(row.querySelector('.name'), 'name', c.id, c.name);
    if ('prof' in c) editable(row.querySelector('.prof'), 'prof', c.id, c.prof, 'profs');
    else row.querySelector('.prof').remove();
    editable(row.querySelector('.term'), 'term', c.id, c.term, 'terms');
    const cb = row.querySelector('input');
    cb.checked = st === 'all'; cb.indeterminate = st === 'some'; cb.disabled = st === 'empty';
    cb.onchange = async () => {
      if (c.subs) { c.picked = new Set(cb.checked ? c.subs.map(s => s.path) : []); }
      else c.all = cb.checked;
      render();
    };
    row.querySelector('.toggle').onclick = async () => { c.open = !c.open; if (c.open) await load(c); render(); };
    if (c.open && c.subs) {
      const box = row.querySelector('.subs');
      if (!c.subs.length) box.textContent = c.cv ? 'Nothing found' : 'No submissions';
      let cat;
      for (const s of c.subs) {
        if (s.cat && s.cat !== cat) {
          cat = s.cat;
          const inCat = c.subs.filter(x => x.cat === s.cat), n = inCat.filter(x => c.picked.has(x.path)).length;
          const h = document.createElement('label'); h.className = 'cat';
          h.innerHTML = `<input type="checkbox"> ${cat}`;
          const hcb = h.querySelector('input'); hcb.checked = n === inCat.length; hcb.indeterminate = n > 0 && n < inCat.length;
          hcb.onchange = () => { inCat.forEach(x => hcb.checked ? c.picked.add(x.path) : c.picked.delete(x.path)); render(); };
          box.appendChild(h);
        }
        const l = document.createElement('label'); if (s.cat) l.className = 'item';
        l.innerHTML = '<input type="checkbox"> <span></span>';
        editable(l.querySelector('span'), 'sub', s.path, s.name);
        const scb = l.querySelector('input'); scb.checked = c.picked.has(s.path);
        scb.onchange = () => { scb.checked ? c.picked.add(s.path) : c.picked.delete(s.path); render(); };
        box.appendChild(l);
      }
    }
    root.appendChild(row);
  }
  const sts = [...courses.values()].map(state).filter(x => x !== 'empty');
  $('all').checked = sts.length > 0 && sts.every(x => x === 'all');
  $('all').indeterminate = !$('all').checked && sts.some(x => x !== 'none');
  const years = new Set([...courses.values()].map(c => termOf(c).match(/\d{4}/)?.[0]).filter(Boolean));
  const known = new Set([...courses.values()].map(termOf).filter(Boolean));
  for (const y of years) for (const q of ['Winter', 'Spring', 'Summer', 'Fall']) known.add(`${q} ${y}`);
  const opts = vals => [...new Set(vals)].filter(Boolean).map(v => Object.assign(document.createElement('option'), { value: v }));
  $('profs').replaceChildren(...opts([...courses.values()].map(profOf)));
  $('terms').replaceChildren(...[...known].map(t => Object.assign(document.createElement('option'), { value: t })));
  const n = [...courses.values()].reduce((t, c) => t + (c.all ? (c.subs?.length ?? 1) : c.picked.size), 0);
  $('go').disabled = n === 0;
  $('go').textContent = n ? `Export ${[...courses.values()].filter(c => isPicked(c)).length} course(s) to ZIP` : 'Select something to export';
}

const busy = on => { $('go').hidden = on; $('bar').hidden = $('pct').hidden = !on; };
const progress = (done, total, text) => {
  if (total) { $('bar').max = total; $('bar').value = done; } else $('bar').removeAttribute('value');
  $('pct').textContent = text ?? `${done} / ${total}`;
};

$('all').onchange = () => {
  const on = $('all').checked;
  for (const c of courses.values()) { if (c.subs) c.picked = new Set(on ? c.subs.map(s => s.path) : []); else c.all = on; }
  render();
};

// Show a value; clicking swaps in a text box (Enter/blur saves, Esc cancels, empty resets to Gradescope's value).
function editable(span, kind, key, orig, list) {
  span.textContent = val(kind, key, orig);
  span.classList.add('editable');
  span.onclick = e => {
    e.preventDefault();
    let cancel = false;
    const inp = Object.assign(document.createElement('input'), { className: 'edit', value: span.textContent });
    const fit = () => inp.size = Math.max(inp.value.length + 2, 12);
    fit(); inp.oninput = fit;
    inp.style.fontSize = getComputedStyle(span).fontSize;
    if (list) inp.setAttribute('list', list);
    inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { cancel = true; inp.blur(); } };
    inp.onblur = () => {
      editing = false;
      const v = inp.value.trim();
      if (!cancel) {
        edits[kind] ??= {};
        if (v && v !== orig) edits[kind][key] = v; else delete edits[kind][key];
        try { localStorage.edits = JSON.stringify(edits); localStorage.removeItem('termOverrides'); } catch {}
      }
      render();
    };
    editing = true;
    span.replaceWith(inp); inp.focus(); inp.select();
  };
}

$('go').onclick = async () => {
  $('log').textContent = ''; busy(true); progress(0, 0, 'Loading…');
  try { await (mode === 'cv' ? cvRun : run)(); } catch (e) { log('ERROR: ' + e.message); }
  busy(false); render();
};

async function run() {
  const wantOrig = $('orig').checked, wantGraded = $('graded').checked;
  const picked = [...courses.values()].filter(c => isPicked(c));
  const [user] = await Promise.all([userName(), ...picked.map(load)]);
  const jobs = picked.flatMap(c => c.subs.filter(s => c.picked.has(s.path)).map(s => ({ c, s })));
  if (!jobs.length) throw new Error('Nothing selected');
  log(`${jobs.length} submission(s) across ${picked.length} course(s)`);

  const files = [];
  let done = 0;
  progress(0, jobs.length);
  await Promise.all(jobs.map(async ({ c, s }) => { try {
    const dir = fileBase(c), base = fileBase(c, subOf(s));
    const j = await (await get(s.path + '.json?content=react', { headers: { Accept: 'application/json' } })).json();
    const orig = wantOrig && j.paths.original_file_path && fetch(j.paths.original_file_path);
    const graded = wantGraded && j.paths.graded_pdf_path && gradedPdf(j.paths);
    if (orig) {
      const name = `${dir}/${base}${(j.pdf_attachment?.filename || '').match(/\.[^.]+$/)?.[0] || ''}`;
      const r = await orig;
      if (r.ok) { files.push([name, new Uint8Array(await r.arrayBuffer())]); log('✓ ' + name); }
      else log(`✗ ${name}: ${r.status}`);
    }
    if (graded) {
      const name = `${dir}/${base}_graded.pdf`;
      const buf = await graded;
      if (buf) { files.push([name, buf]); log('✓ ' + name); }
      else log(`– ${subOf(s)}: no graded copy`);
    }
  } finally { progress(++done, jobs.length); } }));
  if (!files.length) throw new Error('Nothing downloaded');

  progress(0, 0, 'Zipping…');
  if (!user) log('Note: couldn\'t read your name from gradescope.com/account/edit, so it\'s left out of the folder name');
  const top = ['gradescope_export', slug(user), stamp(new Date())].filter(Boolean).join('_');
  const blob = new Blob([zip(files.map(([n, d]) => [`${top}/${n}`, d]))], { type: 'application/zip' });
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: top + '.zip' }).click();
  log(`Done: ${files.length} file(s), ${(blob.size / 1e6).toFixed(1)} MB`);
}

// Name from the account settings form; '' if it can't be read.
async function userName() {
  try {
    const doc = parse(await (await get('/account/edit')).text());
    const v = n => doc.querySelector(`[name="user[${n}]"]`)?.value?.trim() || '';
    return v('name') || [v('first_name'), v('last_name')].filter(Boolean).join(' ');
  } catch { return ''; }
}

// Local time -> 2026-11-05_16-42-07 (no colons: not allowed in Windows/macOS filenames)
const stamp = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };

// Graded PDF is generated on demand; poll status until complete.
async function gradedPdf(paths) {
  for (let i = 0; i < 20; i++) {
    const r = await get(paths.graded_pdf_path, { redirect: 'manual' });
    if (r.ok && (r.headers.get('content-type') || '').includes('pdf')) return new Uint8Array(await r.arrayBuffer());
    const st = await get(paths.pdf_attachment_status_path).then(x => x.ok ? x.json() : null).catch(() => null);
    if (!st || st.status_string === 'failed' || r.type === 'opaqueredirect') return null;
    await new Promise(res => setTimeout(res, 1500));
  }
  return null;
}

// "MAE 174", "Midterm", "Fall 2016", "Mosleh" -> mae_174_mosleh_f16_mt (no assignment -> mae_174_mosleh_f16)
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const abbr = s => slug(s).replace(/^midterm/, 'mt').replace(/^homework/, 'hw');
const termCode = t => { const m = t.match(/(fall|winter|spring|summer)\s*(\d{4})/i); return m ? ({ fall: 'f', winter: 'w', spring: 's', summer: 'su' })[m[1].toLowerCase()] + m[2].slice(2) : slug(t); };
const fileBase = (c, assignment) => [slug(nameOf(c)), slug(profOf(c)), termCode(termOf(c)), abbr(assignment || '')].filter(Boolean).join('_');
// "Last, First" or "First Last" -> Last
const lastName = s => (s.includes(',') ? s.split(',')[0] : s.trim().split(/\s+/).pop()).trim();

// Minimal STORE-only zip writer (PDFs don't compress anyway).
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = b => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const u16 = n => [n & 255, n >> 8 & 255], u32 = n => [...u16(n & 0xffff), ...u16(n >>> 16)];
  for (const [name, data] of files) {
    const n = enc.encode(name), c = crc32(data);
    const hdr = [...u32(0x04034b50), ...u16(20), ...u16(0x800), ...u16(0), ...u32(0), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0)];
    central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u32(0), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...n]);
    parts.push(new Uint8Array(hdr), n, data);
    off += hdr.length + n.length + data.length;
  }
  const cd = central.flat(), eocd = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cd.length), ...u32(off), ...u16(0)];
  return new Blob([...parts, new Uint8Array(cd), new Uint8Array(eocd)]);
}

// Canvas: use the saved instance, else the tab we were opened from. Connect silently if we already have access.
const cvGuess = (() => { try { return localStorage.canvas; } catch {} })() || (/^https:/.test(start) && !start.includes('gradescope.com') ? new URL(start).origin : '');
$('cvurl').value = cvGuess.replace(/^https:\/\//, '');
const switchTo = m => {
  mode = m; courses = m === 'cv' ? cvCourses : gsCourses;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  $('gsfiles').hidden = m !== 'gs'; $('cvconnect').hidden = m !== 'cv' || cvCourses.size > 0;
  $('ctx').textContent = ctx[m];
  render();
};
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => switchTo(b.dataset.m));
async function cvStart(origin) {
  setCtx('cv', 'Connecting to ' + new URL(origin).host + '…');
  try { await cvConnect(origin); setCtx('cv', `${cvCourses.size} courses on ${new URL(origin).host}`); }
  catch (e) { setCtx('cv', `Couldn't read Canvas at ${new URL(origin).host} (${e.message}). Are you logged in?`); }
  switchTo(mode);
}
$('cvgo').onclick = async () => {
  let origin; try { origin = new URL(/^https?:/.test($('cvurl').value) ? $('cvurl').value : 'https://' + $('cvurl').value.trim()).origin; } catch { return setCtx('cv', 'Enter your Canvas address, like canvas.school.edu'); }
  if (await chrome.permissions.request({ origins: [origin + '/*'] })) cvStart(origin);
  else setCtx('cv', 'Permission denied for ' + origin);
};
setCtx('cv', 'Enter your Canvas address and connect');
switchTo(cvGuess && cvGuess === (/^https:/.test(start) ? new URL(start).origin : '') ? 'cv' : 'gs');
if (cvGuess) chrome.permissions.contains({ origins: [cvGuess + '/*'] }).then(ok => ok && cvStart(cvGuess));
