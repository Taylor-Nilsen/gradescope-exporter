const GS = 'https://www.gradescope.com';
const start = new URL(location.href).searchParams.get('u') || '';
const m = start.match(/gradescope\.com\/courses\/(\d+)(?:\/assignments\/\d+\/submissions\/(\d+))?/);
const openCourse = m?.[1], openSub = m?.[2];
const $ = id => document.getElementById(id);
const log = s => { $('log').textContent += s + '\n'; };
const get = (path, opts = {}) => fetch(GS + path, { credentials: 'include', ...opts });
const parse = html => new DOMParser().parseFromString(html, 'text/html');

// courses: id -> { id, name, term, subs: null | [{name, path}], picked: Set(path), all: bool }
const courses = new Map();

(async function init() {
  const doc = parse(await (await get('/')).text());
  for (const a of doc.querySelectorAll('a.courseBox')) {
    const id = a.getAttribute('href').match(/\d+/)[0];
    courses.set(id, {
      id, name: a.querySelector('.courseBox--shortname')?.textContent.trim() || id,
      term: a.closest('.courseList--coursesForTerm')?.previousElementSibling?.textContent.trim() || '',
      subs: null, picked: new Set(), all: false,
    });
  }
  if (!courses.size) { $('ctx').textContent = 'No courses found. Are you logged in to Gradescope?'; return; }
  $('ctx').textContent = `${courses.size} courses`;
  render();
  if (openCourse && courses.has(openCourse)) {
    const c = courses.get(openCourse);
    if (openSub) { await load(c); const s = c.subs.find(s => s.path.endsWith('/submissions/' + openSub)); if (s) c.picked.add(s.path); c.open = true; }
    else c.all = true;
    render();
  }
})().catch(e => { $('ctx').textContent = 'Error: ' + e.message; });

async function load(c) {
  if (c.subs) return;
  const doc = parse(await (await get('/courses/' + c.id)).text());
  c.term = doc.querySelector('.courseHeader--term')?.textContent.trim() || c.term;
  c.prof = lastName(doc.querySelector('li[id^=sidebar-instructor-] .sidebar--menuItemLabel')?.textContent || '');
  c.subs = [...doc.querySelectorAll('#assignments-student-table tbody tr')].map(tr => {
    const a = tr.querySelector('th a');
    return a && { name: tr.querySelector('th').textContent.trim(), path: a.getAttribute('href') };
  }).filter(Boolean);
  if (c.all) { c.subs.forEach(s => c.picked.add(s.path)); c.all = false; }
}

const state = c => c.all ? 'all' : !c.subs ? 'none' : c.picked.size === 0 ? 'none' : c.picked.size === c.subs.length ? 'all' : 'some';

function render() {
  const root = $('courses'); root.innerHTML = '';
  for (const c of courses.values()) {
    const st = state(c);
    const row = document.createElement('div'); row.className = 'course';
    row.innerHTML = `<label><input type="checkbox"> <span class="name"></span> <span class="term"></span></label>
      <button class="toggle" aria-label="Show assignments">${c.open ? '▾' : '▸'}</button><div class="subs"></div>`;
    row.querySelector('.name').textContent = c.name;
    row.querySelector('.term').textContent = c.term;
    const cb = row.querySelector('input');
    cb.checked = st === 'all'; cb.indeterminate = st === 'some';
    cb.onchange = async () => {
      if (c.subs) { c.picked = new Set(cb.checked ? c.subs.map(s => s.path) : []); }
      else c.all = cb.checked;
      render();
    };
    row.querySelector('.toggle').onclick = async () => { c.open = !c.open; if (c.open) await load(c); render(); };
    if (c.open && c.subs) {
      const box = row.querySelector('.subs');
      if (!c.subs.length) box.textContent = 'No submissions';
      for (const s of c.subs) {
        const l = document.createElement('label');
        l.innerHTML = '<input type="checkbox"> <span></span>';
        l.querySelector('span').textContent = s.name;
        const scb = l.querySelector('input'); scb.checked = c.picked.has(s.path);
        scb.onchange = () => { scb.checked ? c.picked.add(s.path) : c.picked.delete(s.path); render(); };
        box.appendChild(l);
      }
    }
    root.appendChild(row);
  }
  const n = [...courses.values()].reduce((t, c) => t + (c.all ? (c.subs?.length ?? 1) : c.picked.size), 0);
  $('go').disabled = n === 0;
  $('go').textContent = n ? `Export ${[...courses.values()].filter(c => state(c) !== 'none').length} course(s) to ZIP` : 'Select something to export';
}

$('go').onclick = async () => {
  $('go').disabled = true; $('log').textContent = '';
  try { await run(); } catch (e) { log('ERROR: ' + e.message); }
  render();
};

async function run() {
  const wantOrig = $('orig').checked, wantGraded = $('graded').checked;
  const picked = [...courses.values()].filter(c => state(c) !== 'none');
  await Promise.all(picked.map(load));
  const jobs = picked.flatMap(c => c.subs.filter(s => c.picked.has(s.path)).map(s => ({ c, s })));
  if (!jobs.length) throw new Error('Nothing selected');
  log(`${jobs.length} submission(s) across ${picked.length} course(s)`);

  const files = [];
  await Promise.all(jobs.map(async ({ c, s }) => {
    const dir = safe(c.name), prefix = [c.name, c.term.replace(/\s+/g, ''), c.prof].filter(Boolean).map(safe).join('_');
    const folder = safe(s.name);
    const j = await (await get(s.path + '.json?content=react', { headers: { Accept: 'application/json' } })).json();
    const orig = wantOrig && j.paths.original_file_path && fetch(j.paths.original_file_path);
    const graded = wantGraded && j.paths.graded_pdf_path && gradedPdf(j.paths);
    if (orig) {
      const name = `${dir}/${prefix}_${folder}_${j.pdf_attachment?.filename || 'original'}`;
      const r = await orig;
      if (r.ok) { files.push([name, new Uint8Array(await r.arrayBuffer())]); log('✓ ' + name); }
      else log(`✗ ${name}: ${r.status}`);
    }
    if (graded) {
      const name = `${dir}/${prefix}_${folder}_graded.pdf`;
      const buf = await graded;
      if (buf) { files.push([name, buf]); log('✓ ' + name); }
      else log(`– ${folder}: no graded copy`);
    }
  }));
  if (!files.length) throw new Error('Nothing downloaded');

  const blob = new Blob([zip(files)], { type: 'application/zip' });
  const zipName = picked.length === 1 ? safe(picked[0].name) : 'gradescope-export';
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: zipName + '.zip' }).click();
  log(`Done: ${files.length} file(s), ${(blob.size / 1e6).toFixed(1)} MB`);
}

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

const safe = s => s.replace(/[\\/:*?"<>|]+/g, '-').trim();
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
