const { chromium } = require('playwright');
const dir = __dirname;
const css = `*{box-sizing:border-box;margin:0}body{font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#2b2f33;overflow:hidden}
.s{width:1280px;height:800px;background:#e9f2f9;display:flex;align-items:center;gap:56px;padding:0 0 0 88px;position:relative;overflow:hidden}
.s.dark{background:#15181b;color:#e4e6e8}.s.dark p{color:#9ba2a9}
.t{width:430px;flex:none}h1{font-size:46px;line-height:1.1;font-weight:700;letter-spacing:-.02em;margin-bottom:20px}p{font-size:21px;line-height:1.5;color:#55606a}
.ui{flex:none;width:600px;height:740px;align-self:flex-end;border-radius:14px 14px 0 0;overflow:hidden;box-shadow:0 18px 50px rgba(30,60,90,.18);background:#f7f6f2;-webkit-mask-image:linear-gradient(#000 82%,transparent)}
.dark .ui{background:#1b1d20;box-shadow:0 18px 50px rgba(0,0,0,.5)}
.ui img{width:600px;display:block}
.brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:600;margin-bottom:34px}.brand img{width:40px;height:40px}`;
const shot = (img, h, p, dark = '', off = 0) => `<div class="s ${dark}"><div class="t"><div class="brand"><img src="../icons/icon128.png">Class Exporter</div><h1>${h}</h1><p>${p}</p></div><div class="ui"><img src="${img}" style="margin-top:-${off}px"></div></div>`;
const pages = {
  'screenshot-1-gradescope.png': [1280, 800, shot('ui_gs.png', 'Every Gradescope submission, one ZIP.', 'Pick whole courses or single assignments. Get what you turned in, the graded copy with annotations, or both.')],
  'screenshot-2-canvas.png': [1280, 800, shot('ui_cv.png', 'Your whole Canvas course, saved.', 'Syllabus, modules, assignments, quizzes, pages, discussions, announcements, and files. Pick any of it.')],
  'screenshot-3-export.png': [1280, 800, shot('ui_done.png', 'Clean folders and file names.', 'Files land in one folder per course, named like mae_102_rivera_f26_hw_1.pdf, so they sort and search nicely.', '', 300)],
  'screenshot-4-dark.png': [1280, 800, shot('ui_cvdark.png', 'Works with any school on Canvas.', 'Type your Canvas address once. Runs in your browser with your own login. Nothing goes to any server.', 'dark')],
  'promo-small-440x280.png': [440, 280, `<div style="width:440px;height:280px;background:#bfdcf2;display:flex;flex-direction:column;justify-content:center;padding:0 36px"><img src="../icons/icon128.png" style="width:64px;height:64px;margin-bottom:18px;border-radius:12px;box-shadow:0 0 0 2px #8fc0e4"><div style="font-size:38px;font-weight:700;letter-spacing:-.02em">Class Exporter</div><div style="font-size:18px;color:#3d4a55;margin-top:6px">Save your Gradescope and Canvas classes</div></div>`],
  'promo-marquee-1400x560.png': [1400, 560, `<div style="width:1400px;height:560px;background:#bfdcf2;display:flex;align-items:center;padding:0 110px;gap:70px;overflow:hidden"><div style="flex:none;width:560px"><img src="../icons/icon128.png" style="width:88px;height:88px;border-radius:16px;box-shadow:0 0 0 2px #8fc0e4;margin-bottom:26px"><div style="font-size:64px;font-weight:700;letter-spacing:-.02em;line-height:1.05">Class Exporter</div><div style="font-size:26px;color:#3d4a55;margin-top:14px;line-height:1.4">Save your Gradescope submissions and Canvas courses before you lose access.</div></div><div style="flex:none;width:560px;height:500px;align-self:flex-end;border-radius:14px 14px 0 0;overflow:hidden;box-shadow:0 18px 50px rgba(30,60,90,.25);background:#f7f6f2"><img src="ui_cv.png" style="width:560px;display:block"></div></div>`],
};
(async () => {
  const b = await chromium.launch();
  for (const [name, [w, h, body]] of Object.entries(pages)) {
    const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    require('fs').writeFileSync(dir + '/x.html', `<!doctype html><meta charset="utf-8"><style>${css}</style>${body}`);
    await pg.goto('file://' + dir + '/x.html');
    await pg.screenshot({ path: dir + '/' + name });
    await pg.close();
  }
  await b.close();
})();
