// Canvas: list courses and their content via the REST API (session cookie), export everything to a zip.
let CV = '';
const cvCourses = new Map();

// ponytail: global limit of 6 in-flight requests keeps Canvas' rate limiter happy; raise if exports feel slow
let slots = 6; const waiting = [];
const slot = () => slots > 0 ? (slots--, Promise.resolve()) : new Promise(r => waiting.push(r));
const free = () => waiting.length ? waiting.shift()() : slots++;
async function cget(p) {
  for (let i = 0; ; i++) {
    await slot();
    let r; try { r = await fetch(p.startsWith('http') ? p : CV + p, { credentials: 'include', headers: { Accept: 'application/json' } }); } finally { free(); }
    if (r.status === 403 && i < 4 && /rate limit/i.test(await r.clone().text())) { await new Promise(res => setTimeout(res, 2000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`${r.status} ${p}`);
    return r;
  }
}
// Session-authenticated Canvas JSON starts with `while(1);`
const cjson = async p => JSON.parse((await (await cget(p)).text()).replace(/^while\(1\);/, ''));
async function call(p) {
  const out = [];
  for (let u = p + (p.includes('?') ? '&' : '?') + 'per_page=100'; u;) {
    const r = await cget(u);
    out.push(...JSON.parse((await r.text()).replace(/^while\(1\);/, '')));
    u = r.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  return out;
}
const bytes = async url => new Uint8Array(await (await cget(url)).arrayBuffer());
const clean = s => (s || 'file').replace(/[\/\\:*?"<>|\x00-\x1f]+/g, '_').trim();

async function cvConnect(origin) {
  CV = origin;
  const me = await cjson('/api/v1/users/self');
  try { localStorage.canvas = origin; } catch {}
  cvCourses.clear();
  for (const x of await call('/api/v1/courses?include[]=term&include[]=teachers&state[]=available&state[]=completed')) {
    if (!x.name) continue; // date-restricted courses come back without details
    cvCourses.set('cv' + x.id, { id: 'cv' + x.id, cid: x.id, cv: true, name: x.course_code || x.name, term: x.term?.name || '',
      prof: lastName(x.teachers?.[0]?.display_name || ''), subs: null, picked: new Set(), all: false });
  }
  return me.name || '';
}

// Every exportable thing in a course, grouped by category (category = folder name).
async function cvList(c) {
  const b = `/api/v1/courses/${c.cid}`, L = p => call(b + p).catch(() => []);
  const [syl, mods, as, quizzes, pages, discs, anns, files, folders] = await Promise.all([
    cjson(b + '?include[]=syllabus_body').catch(() => null), L('/modules?include[]=items'), L('/assignments?order_by=position'),
    L('/quizzes'), L('/pages?sort=title'), L('/discussion_topics'), L('/discussion_topics?only_announcements=true'),
    L('/files?sort=name'), L('/folders')]);
  const dirs = new Map(folders.map(f => [f.id, f.full_name.split('/').slice(1).map(clean).join('/')]));
  const it = (cat, name, x, key = x.id) => ({ cat, name, path: `${c.id}:${cat}:${key}`, x });
  c.subs = [
    ...(syl?.syllabus_body ? [it('Syllabus', 'Syllabus', { body: syl.syllabus_body }, 0)] : []),
    ...mods.map(x => it('Modules', x.name, x)),
    ...as.map(x => it('Assignments', x.name, x)),
    ...quizzes.map(x => it('Quizzes', x.title, x)),
    ...pages.map(x => it('Pages', x.title, x, x.page_id)),
    ...discs.map(x => it('Discussions', x.title, x)),
    ...anns.map(x => it('Announcements', x.title, x)),
    ...files.map(x => it('Files', x.display_name, { ...x, dir: dirs.get(x.folder_id) || '' })),
  ];
}

// An item's export is { html, files: [[relpath, data]], links: [url] }.
// One output -> flat file; more -> folder named after the item.
function place(dir, base, { html, files = [], links = [] }, folder) {
  const all = [...(html ? [[base + '.html', html]] : []), ...files, ...(links.length ? [['links.txt', [...new Set(links)].join('\n') + '\n']] : [])];
  const j = (...p) => p.filter(Boolean).join('/');
  return all.length === 1 && !folder ? [[j(dir, all[0][0]), all[0][1]]] : all.map(([n, d]) => [j(dir, base, n), d]);
}

async function cvFile(c, id) {
  const f = await cjson(`/api/v1/courses/${c.cid}/files/${id}`).catch(() => cjson(`/api/v1/files/${id}`));
  if (!f.url) throw new Error('locked');
  return [clean(f.display_name), await bytes(f.url)];
}

// Wrap Canvas HTML as a page; download linked/embedded Canvas files next to it, collect other links.
async function page(c, title, meta, body) {
  const doc = parse(body || '');
  const out = { files: [], links: [] }, got = new Map();
  await Promise.all([...doc.querySelectorAll('[href],[src]')].map(async el => {
    const attr = el.hasAttribute('href') ? 'href' : 'src';
    let u; try { u = new URL(el.getAttribute(attr), CV); } catch { return; }
    el.setAttribute(attr, u.href);
    const id = u.origin === CV && u.pathname.match(/\/files\/(\d+)/)?.[1];
    if (id) {
      if (!got.has(id)) got.set(id, cvFile(c, id).then(f => (out.files.push(f), f[0])).catch(e => { log(`✗ file ${id} in ${title}: ${e.message}`); out.links.push(u.href); }));
      const name = await got.get(id);
      if (name) el.setAttribute(attr, encodeURIComponent(name));
    } else if (el.tagName === 'A' && /^https?:$/.test(u.protocol)) out.links.push(u.href);
  }));
  const esc = s => String(s).replace(/[&<>"]/g, ch => `&#${ch.charCodeAt(0)};`);
  out.html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><h1>${esc(title)}</h1>` +
    (meta.length ? `<p>${meta.map(esc).join(' · ')}</p>` : '') + doc.body.innerHTML;
  return out;
}

const when = d => d ? new Date(d).toLocaleString() : '';
const ex = {
  async Syllabus(c, x) { return page(c, 'Syllabus', [], x.body); },
  async Pages(c, x) {
    const p = await cjson(`/api/v1/courses/${c.cid}/pages/${encodeURIComponent(x.url)}`);
    return page(c, p.title, [], p.body);
  },
  async Quizzes(c, x) {
    return page(c, x.title, [x.due_at && 'Due ' + when(x.due_at), x.points_possible != null && x.points_possible + ' pts', x.html_url].filter(Boolean), x.description);
  },
  async Assignments(c, x) {
    const out = await page(c, x.name, [x.due_at && 'Due ' + when(x.due_at), x.points_possible != null && x.points_possible + ' pts', x.html_url].filter(Boolean), x.description);
    const s = await cjson(`/api/v1/courses/${c.cid}/assignments/${x.id}/submissions/self`).catch(() => null);
    for (const a of s?.attachments || []) {
      try { out.files.push(['submission/' + clean(a.display_name), await bytes(a.url)]); }
      catch (e) { log(`✗ submission file ${a.display_name}: ${e.message}`); out.links.push(a.url); }
    }
    if (s?.body) out.files.push(['submission/submission.html', `<!doctype html><meta charset="utf-8">${s.body}`]);
    if (s?.url) out.links.push(s.url);
    return out;
  },
  async Discussions(c, x) {
    const v = await cjson(`/api/v1/courses/${c.cid}/discussion_topics/${x.id}/view`).catch(() => null);
    const who = new Map((v?.participants || []).map(p => [p.id, p.display_name]));
    const thread = es => es.map(e => `<div style="margin:12px 0 0 20px"><b>${who.get(e.user_id) || ''}</b> ${when(e.created_at)}${e.deleted ? ' (deleted)' : e.message || ''}${thread(e.replies || [])}</div>`).join('');
    const out = await page(c, x.title, [x.author?.display_name, when(x.posted_at), x.html_url].filter(Boolean),
      (x.message || '') + (v?.view?.length ? '<h2>Replies</h2>' + thread(v.view) : ''));
    for (const a of x.attachments || []) {
      try { out.files.push([clean(a.display_name), await bytes(a.url)]); }
      catch (e) { log(`✗ attachment ${a.display_name}: ${e.message}`); out.links.push(a.url); }
    }
    return out;
  },
  async Files(c, x) {
    if (!x.url) throw new Error('locked');
    return { files: [[clean(x.display_name), await bytes(x.url)]] };
  },
  async Modules(c, m) {
    const items = m.items ?? await call(m.items_url);
    const files = (await Promise.all(items.map(async (it, i) => {
      const n = `${String(i + 1).padStart(2, '0')}_${slug(it.title) || it.type.toLowerCase()}`, b = `/api/v1/courses/${c.cid}`;
      try {
        switch (it.type) {
          case 'File': { const [name, d] = await cvFile(c, it.content_id); return [[`${n.slice(0, 3)}${name}`, d]]; }
          case 'ExternalUrl': case 'ExternalTool': return [[n + '.txt', (it.external_url || it.html_url) + '\n']];
          case 'Page': return place('', n, await ex.Pages(c, { url: it.page_url }));
          case 'Assignment': return place('', n, await ex.Assignments(c, await cjson(`${b}/assignments/${it.content_id}`)));
          case 'Quiz': return place('', n, await ex.Quizzes(c, await cjson(`${b}/quizzes/${it.content_id}`)));
          case 'Discussion': return place('', n, await ex.Discussions(c, await cjson(`${b}/discussion_topics/${it.content_id}`)));
          default: return []; // SubHeader
        }
      } catch (e) { log(`✗ ${m.name} / ${it.title}: ${e.message}`); return [[n + '.txt', it.html_url + '\n']]; }
    }))).flat();
    return { files };
  },
};

ex.Announcements = ex.Discussions;

async function cvRun() {
  const picked = [...cvCourses.values()].filter(isPicked);
  const [user] = await Promise.all([cjson('/api/v1/users/self').then(u => u.name).catch(() => ''), ...picked.map(load)]);
  const jobs = picked.flatMap(c => c.subs.filter(s => c.picked.has(s.path)).map(s => ({ c, s })));
  if (!jobs.length) throw new Error('Nothing selected');
  log(`${jobs.length} item(s) across ${picked.length} course(s)`);
  const files = [];
  let done = 0;
  progress(0, jobs.length);
  await Promise.all(jobs.map(async ({ c, s }) => {
    const dir = [fileBase(c), slug(s.cat), s.cat === 'Files' ? s.x.dir : ''].filter(Boolean).join('/');
    try {
      const out = place(dir, fileBase(c, subOf(s)), await ex[s.cat](c, s.x), s.cat === 'Modules');
      files.push(...out); log(`✓ ${s.cat}: ${subOf(s)}`);
    } catch (e) { log(`✗ ${s.cat}: ${subOf(s)}: ${e.message}`); }
    progress(++done, jobs.length);
  }));
  if (!files.length) throw new Error('Nothing downloaded');
  progress(0, 0, 'Zipping…');
  const top = ['canvas_export', slug(user), stamp(new Date())].filter(Boolean).join('_');
  const enc = new TextEncoder(), seen = new Set();
  const named = files.map(([n, d]) => {
    let name = `${top}/${n}`;
    for (let i = 2; seen.has(name); i++) name = `${top}/${n}`.replace(/(\.[^./]*)?$/, ` (${i})$1`);
    seen.add(name);
    return [name, typeof d === 'string' ? enc.encode(d) : d];
  });
  const blob = new Blob([zip(named)], { type: 'application/zip' });
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: top + '.zip' }).click();
  log(`Done: ${named.length} file(s), ${(blob.size / 1e6).toFixed(1)} MB`);
}
