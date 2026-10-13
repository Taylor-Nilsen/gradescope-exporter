const GS = 'https://www.gradescope.com';
const start = new URL(location.href).searchParams.get('u') || '';
const m = start.match(/gradescope\.com\/courses\/(\d+)(?:\/assignments\/(\d+)(?:\/submissions\/(\d+))?)?/);
const log = s => { document.getElementById('log').textContent += s + '\n'; };
const ctx = document.getElementById('ctx');

if (!m) {
  ctx.textContent = 'Open a Gradescope course or assignment page first, then click the extension icon.';
  document.getElementById('go').disabled = true;
} else {
  const [, courseId, assignmentId, submissionId] = m;
  ctx.textContent = `Course ${courseId}` + (assignmentId ? `, assignment ${assignmentId}` : '');
  if (!submissionId) document.getElementById('scopeA').disabled = true;
  else document.getElementById('scopeA').checked = true;

  document.getElementById('go').onclick = async () => {
    document.getElementById('go').disabled = true;
    try { await run(courseId, submissionId); } catch (e) { log('ERROR: ' + e.message); }
    document.getElementById('go').disabled = false;
  };
}

async function run(courseId, submissionId) {
  const wantOrig = document.getElementById('orig').checked;
  const wantGraded = document.getElementById('graded').checked;
  const scope = document.querySelector('input[name=scope]:checked').value;

  // 1. list submissions
  let subs;
  const html = await (await fetch(`${GS}/courses/${courseId}`, { credentials: 'include' })).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const courseName = (doc.querySelector('.courseHeader--title')?.textContent || `course-${courseId}`).trim();
  subs = [...doc.querySelectorAll('#assignments-student-table tbody tr')].map(tr => {
    const a = tr.querySelector('th a');
    return a && { name: tr.querySelector('th').textContent.trim(), path: a.getAttribute('href') };
  }).filter(Boolean);
  if (scope === 'assignment') subs = subs.filter(s => s.path.endsWith('/submissions/' + submissionId));
  if (!subs.length) throw new Error('No submissions found (are you logged in?)');
  log(`${courseName}: ${subs.length} submission(s)`);

  // 2. fetch files (all submissions in parallel)
  const files = [];
  await Promise.all(subs.map(async s => {
    const folder = safe(s.name);
    const j = await (await fetch(`${GS}${s.path}.json?content=react`, { credentials: 'include', headers: { Accept: 'application/json' } })).json();
    const orig = wantOrig && j.paths.original_file_path && fetch(j.paths.original_file_path);
    const graded = wantGraded && j.paths.graded_pdf_path && gradedPdf(j.paths);
    if (orig) {
      const name = j.pdf_attachment?.filename || 'original';
      const r = await orig;
      if (r.ok) { files.push([`${folder}/${name}`, new Uint8Array(await r.arrayBuffer())]); log(`✓ ${folder}/${name}`); }
      else log(`✗ ${folder}: original ${r.status}`);
    }
    if (graded) {
      const buf = await graded;
      if (buf) { files.push([`${folder}/${folder}-graded.pdf`, buf]); log(`✓ ${folder}/${folder}-graded.pdf`); }
      else log(`– ${folder}: no graded copy`);
    }
  }));
  if (!files.length) throw new Error('Nothing downloaded');

  // 3. zip + download
  const blob = new Blob([zip(files)], { type: 'application/zip' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${safe(courseName)}.zip` });
  a.click();
  log(`Done: ${files.length} file(s), ${(blob.size / 1e6).toFixed(1)} MB`);
}

// Graded PDF is generated on demand; poll status until complete.
async function gradedPdf(paths) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${GS}${paths.graded_pdf_path}`, { credentials: 'include', redirect: 'manual' });
    if (r.ok && (r.headers.get('content-type') || '').includes('pdf')) return new Uint8Array(await r.arrayBuffer());
    const st = await fetch(`${GS}${paths.pdf_attachment_status_path}`, { credentials: 'include' }).then(x => x.ok ? x.json() : null).catch(() => null);
    if (!st || st.status_string === 'failed' || r.type === 'opaqueredirect') return null;
    await new Promise(res => setTimeout(res, 1500));
  }
  return null;
}

const safe = s => s.replace(/[\\/:*?"<>|]+/g, '-').trim();

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
