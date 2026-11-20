const { chromium } = require('playwright');
const ROOT = require('path').join(__dirname, '..');
const ORIGIN = 'http://localhost:8765';
const terms = { 'Fall 2026': [['MAE 102', 'Thermodynamics', 'Rivera'], ['MAE 107', 'Computational Methods', 'Okafor'], ['PHYS 2C', 'Physics: Fluids, Waves, Thermo, Optics', 'Lindqvist']],
                'Spring 2026': [['MAE 30A', 'Statics and Introduction to Dynamics', 'Hartmann'], ['MATH 20D', 'Differential Equations', 'Nakamura']] };
const asg = ['Homework 1', 'Homework 2', 'Homework 3', 'Midterm 1', 'Homework 4', 'Midterm 2', 'Final Exam'];
let id = 100, courses = {};
const home = '<div>' + Object.entries(terms).map(([t, cs]) => `<div class="courseList--term">${t}</div><div class="courseList--coursesForTerm">` +
  cs.map(([s, n, p]) => { const i = ++id; courses[i] = { s, n, p, t }; return `<a class="courseBox" href="/courses/${i}"><h3 class="courseBox--shortname">${s}</h3><div class="courseBox--name">${n}</div></a>`; }).join('') + '</div>').join('') + '</div>';
const coursePage = i => { const c = courses[i]; return `<div class="courseHeader--term">${c.t}</div><h1 class="courseHeader--title">${c.s}</h1><ul><li id="sidebar-instructor-1"><span class="sidebar--menuItemLabel">Prof. Sam ${c.p}</span></li></ul>
  <table id="assignments-student-table"><tbody>${asg.map((a, k) => `<tr><th><a href="/courses/${i}/assignments/${k + 1}/submissions/${i}${k}">${a}</a></th></tr>`).join('')}</tbody></table>`; };
const cvc = [[1, 'MAE 150', 'Computer-Aided Design', 'Dana Whitfield'], [2, 'MAE 170', 'Experimental Techniques', 'Priya Raman'], [3, 'ECE 35', 'Introduction to Analog Design', 'Marco Bellini'], [4, 'CHEM 6A', 'General Chemistry I', 'Grace Oyelaran']];
const J = o => 'while(1);' + JSON.stringify(o);
const canvas = p => {
  if (p === '/api/v1/users/self') return J({ name: 'Alex Student' });
  if (p.startsWith('/api/v1/courses?')) return J(cvc.map(([id, code, name, t]) => ({ id, course_code: code, name: `${code} - ${name}`, term: { name: 'Fall 2026' }, teachers: [{ display_name: t }] })));
  const m = p.match(/^\/api\/v1\/courses\/(\d+)(\/[a-z_]+)?/); if (!m) return J({});
  const r = m[2] || '';
  if (!r) return J({ syllabus_body: '<p>Syllabus</p>' });
  if (r === '/modules') return J([{ id: 1, name: 'Week 1: Sketching and Constraints', items: [] }, { id: 2, name: 'Week 2: Assemblies', items: [] }, { id: 3, name: 'Week 3: Drawings and GD&T', items: [] }]);
  if (r === '/assignments') return J(['Lab 1: Bracket', 'Lab 2: Gear Train', 'Lab 3: Drawing Package', 'Project Proposal'].map((name, id) => ({ id, name })));
  if (r === '/quizzes') return J(['Quiz 1', 'Quiz 2', 'Quiz 3'].map((title, id) => ({ id, title })));
  if (r === '/pages') return J([{ page_id: 1, title: 'Course Policies', url: 'p' }, { page_id: 2, title: 'Software Setup', url: 's' }]);
  if (r === '/discussion_topics') return J(p.includes('announcements') ? [{ id: 9, title: 'Lab section moved to Thursday' }, { id: 8, title: 'Welcome to the course' }] : [{ id: 5, title: 'Introduce yourself' }]);
  if (r === '/files') return J([{ id: 1, display_name: 'lecture_01.pdf', folder_id: 1 }, { id: 2, display_name: 'lecture_02.pdf', folder_id: 1 }, { id: 3, display_name: 'gdt_reference.pdf', folder_id: 1 }]);
  if (r === '/folders') return J([{ id: 1, full_name: 'course files/Lectures' }]);
  return J([]);
};
const pdf = Buffer.from('%PDF-1.4\n%mock\n' + 'x'.repeat(400000));
(async () => {
  const http = require('http'), fs = require('fs'), path = require('path');
  http.createServer((q, s) => { const f = path.join(ROOT, q.url.split('?')[0]); fs.existsSync(f) && fs.statSync(f).isFile() ? (s.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'image/png'), s.end(fs.readFileSync(f))) : (s.statusCode = 404, s.end()); }).listen(8765);
  const b = await chromium.launch();
  const mode = process.argv[2], scheme = process.argv[3] || 'light';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme, acceptDownloads: true });
  const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true', 'access-control-expose-headers': 'link' };
  await ctx.route('https://www.gradescope.com/**', async r => {
    const u = new URL(r.request().url()), p = u.pathname;
    await new Promise(res => setTimeout(res, 50));
    if (p === '/') return r.fulfill({ body: home, headers: cors });
    if (p === '/account/edit') return r.fulfill({ body: '<input name="user[name]" value="Alex Student">', headers: cors });
    let m;
    if (m = p.match(/^\/courses\/(\d+)$/)) return r.fulfill({ body: coursePage(m[1]), headers: cors });
    if (p.endsWith('.json')) return r.fulfill({ body: JSON.stringify({ paths: { original_file_path: 'https://s3.amazonaws.com/x.pdf' }, pdf_attachment: { filename: 'x.pdf' } }), headers: { ...cors, 'content-type': 'application/json' } });
    r.fulfill({ status: 404, headers: cors });
  });
  await ctx.route('https://s3.amazonaws.com/**', r => r.fulfill({ body: pdf, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://canvas.school.edu/**', r => { const u = new URL(r.request().url()); r.fulfill({ body: canvas(u.pathname + u.search), headers: cors }); });
  await ctx.addInitScript(() => { window.chrome = { permissions: { contains: async () => true, request: async () => true } }; });
  const pg = await ctx.newPage();
  const out = process.argv[4];
  if (mode === 'gs') {
    await pg.goto(ORIGIN + '/export.html?u=' + encodeURIComponent('https://www.gradescope.com/courses/101'));
    await pg.waitForTimeout(1200);
    await pg.locator('.course').nth(0).locator('.toggle').click(); await pg.waitForTimeout(300);
    await pg.locator('.course').nth(1).locator('input').first().check(); await pg.waitForTimeout(300);
  } else if (mode === 'cv') {
    await pg.addInitScript(() => { localStorage.canvas = 'https://canvas.school.edu'; });
    await pg.goto(ORIGIN + '/export.html?u=' + encodeURIComponent('https://canvas.school.edu/courses/1'));
    await pg.waitForTimeout(1200);
    await pg.locator('.course').nth(0).locator('.toggle').click(); await pg.waitForTimeout(800);
    await pg.locator('.course').nth(0).locator('input').first().check(); await pg.waitForTimeout(300);
  } else if (mode === 'done') {
    await pg.goto(ORIGIN + '/export.html?u=' + encodeURIComponent('https://www.gradescope.com/courses/101'));
    await pg.waitForTimeout(1200);
    await pg.locator('.course').nth(0).locator('input').first().check();
    await pg.locator('.course').nth(1).locator('input').first().check();
    await pg.locator('#graded').uncheck();
    const dl = pg.waitForEvent('download'); await pg.click('#go'); await dl; await pg.waitForTimeout(500);
  }
  await pg.addStyleTag({ content: 'main{margin:28px auto} pre{max-height:none}' }); await pg.locator('main').screenshot({ path: out });
  await b.close(); process.exit(0);
})();
