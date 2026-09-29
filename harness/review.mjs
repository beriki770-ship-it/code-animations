// node harness/review.mjs <work/index.html> [--format 16x9] [--out out/review]
// node harness/review.mjs --check out/review/REVIEW.md
// The review gate. Writes one contact sheet per shot (first frame, 6 evenly spaced frames, last frame, timecode
// burned in), the lint JSON, and REVIEW.md: fixed questions per shot that the reviewer must answer in writing.
// --check exits 1 while any answer is empty or still the placeholder, any score is under 4, lint has a FAIL,
// a shot section is missing, or the film changed after the review was generated. A review can't be skipped silently.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openWork, parseArgs, ensureDir } from './lib.mjs';

const INNER = 6;            // evenly spaced frames inside each shot, plus its first and last frame
const COLS = 4;             // tiles per row on a sheet
const TILE_W = 480;         // tile width in px: 4 tiles make a 1920 px wide sheet in any format
const TODO = 'TODO';        // the placeholder --check rejects
const MIN_SCORE = 4;
const QUESTIONS = [
  'What is being said here, and does the picture show exactly that?',
  'Is every real-world object accurate against a reference? Name the reference (file or URL) and what you compared.',
  'Is any text unreadable at phone size?',
  'Does anything collide, get cut off, or sit static too long?',
  'Is there a cut or empty frame?',
  'Does the sound land on the pops? (see audio-sync in the lint summary below)',
];
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// ====================================================================================================
// --check: parse a filled REVIEW.md and fail on anything unanswered, low-scored or stale
// ====================================================================================================
function check(reviewPath) {
  const dir = path.dirname(path.resolve(reviewPath)), md = fs.readFileSync(reviewPath, 'utf8'), errs = [];
  const meta = k => (md.match(new RegExp(`<!-- ${k}: (.+?) -->`)) || [])[1];
  const film = meta('film'), hash = meta('film-sha256'), nShots = Number(meta('shots'));
  if (!film || !hash || !nShots) errs.push('header comments (film, film-sha256, shots) are missing: regenerate with review.mjs');
  else {
    const fp = path.resolve(dir, film);
    if (!fs.existsSync(fp)) errs.push(`film not found: ${fp}`);
    else if (sha256(fp) !== hash) errs.push('the film changed after this review was generated: run review.mjs again and re-answer');
  }
  const sections = md.split(/^## Shot /m).slice(1);
  if (nShots && sections.length !== nShots) errs.push(`${sections.length} shot sections, expected ${nShots}`);
  for (const s of sections) {
    const name = s.split('\n')[0].trim();
    const answers = [...s.matchAll(/^\*\*(A|Score|Fixes made):\*\*[ \t]*(.*)$/gm)];
    if (answers.length !== QUESTIONS.length + 2) errs.push(`${name}: ${answers.length} answer lines, expected ${QUESTIONS.length + 2}`);
    answers.forEach(([, k, v], i) => { if (!v.trim() || v.includes(TODO)) errs.push(`${name}: ${k === 'A' ? 'answer ' + (i + 1) : k} is empty or ${TODO}`); });
    const score = answers.find(([, k]) => k === 'Score');
    const n = score && Number((score[2].match(/^\s*([1-5])\b/) || [])[1]);
    if (score && !score[2].includes(TODO)) { if (!n) errs.push(`${name}: score must start with a number 1-5`); else if (n < MIN_SCORE) errs.push(`${name}: score ${n} < ${MIN_SCORE}`); }
  }
  const lintPath = path.join(dir, 'lint.json');
  if (!fs.existsSync(lintPath)) errs.push(`lint JSON not found: ${lintPath}`);
  else for (const r of JSON.parse(fs.readFileSync(lintPath, 'utf8')).results)
    for (const c of r.checks) if (c.status === 'FAIL') errs.push(`lint ${r.format} ${c.id}: FAIL`);
  for (const e of errs) console.log('FAIL ' + e);
  console.log(errs.length ? `review check: ${errs.length} FAIL` : `review check: OK (${sections.length} shots answered, all >= ${MIN_SCORE}/5, 0 lint FAIL)`);
  process.exit(errs.length ? 1 : 0);
}

// ====================================================================================================
// Contact sheet for one shot, composed in the page (no image library needed): tiles of the film's own canvas
// ====================================================================================================
async function sheet(page, times, label) {
  const b64 = await page.evaluate((times, label, COLS, TILE_W) => {
    const src = __anim.canvas, th = Math.round(TILE_W * src.height / src.width), rows = Math.ceil(times.length / COLS);
    const cv = document.createElement('canvas'); cv.width = COLS * TILE_W; cv.height = rows * th;
    const x = cv.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
    times.forEach((t, i) => {
      __anim.seek(t);
      const tx = (i % COLS) * TILE_W, ty = Math.floor(i / COLS) * th;
      x.drawImage(src, tx, ty, TILE_W, th);
      const tc = `${label}  t=${t.toFixed(2)}s`;           // timecode burned into each tile
      x.font = '600 18px Consolas, "DejaVu Sans Mono", monospace';
      x.fillStyle = 'rgba(0,0,0,0.75)'; x.fillRect(tx, ty, x.measureText(tc).width + 16, 28);
      x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(tc, tx + 8, ty + 14);
      x.strokeStyle = '#000'; x.lineWidth = 2; x.strokeRect(tx + 1, ty + 1, TILE_W - 2, th - 2);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, times, label, COLS, TILE_W);
  return Buffer.from(b64, 'base64');
}

// ====================================================================================================
// Main
// ====================================================================================================
const a = parseArgs(process.argv.slice(2));
if (a.check) check(a.check === true ? a._[0] : a.check);
else {
  const html = a._[0];
  if (!html) { console.log('usage: node harness/review.mjs <work/index.html> [--format 16x9] [--out out/review]\n       node harness/review.mjs --check <out/review/REVIEW.md>'); process.exit(2); }
  const format = a.format || '16x9', out = ensureDir(path.resolve(a.out || 'out/review')), sheets = ensureDir(path.join(out, 'sheets'));

  // lint first, so its JSON sits next to REVIEW.md; a lint FAIL doesn't stop the sheets, --check catches it
  const lintJs = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lint.mjs');
  const lint = spawnSync(process.execPath, [lintJs, html, '--all-formats', '--json', path.join(out, 'lint.json')], { encoding: 'utf8' });
  if (!fs.existsSync(path.join(out, 'lint.json'))) { console.log(lint.stdout + lint.stderr + '\nreview: lint did not write its JSON'); process.exit(2); }
  const lintRes = JSON.parse(fs.readFileSync(path.join(out, 'lint.json'), 'utf8')).results;

  const { browser, page, meta, errors } = await openWork(html, format);
  const fps = await page.evaluate(() => __anim.fps || 30);
  if (!meta.shots.length) { await browser.close(); console.log('review: __anim.shots is empty, nothing to review'); process.exit(2); }
  const shots = [];
  for (const [i, s] of meta.shots.entries()) {
    const last = Math.max(s.start, Math.min(s.end, meta.duration) - 1 / fps);
    const times = [s.start, ...Array.from({ length: INNER }, (_, k) => s.start + (last - s.start) * (k + 1) / (INNER + 1)), last];
    const file = path.join(sheets, `${format}-${String(i + 1).padStart(2, '0')}-${String(s.id).replace(/[^\w-]/g, '_')}.png`);
    fs.writeFileSync(file, await sheet(page, times, s.id));
    shots.push({ ...s, file, times });
    console.log(file);
  }
  await browser.close();

  // REVIEW.md from a fixed template. An existing one is kept as REVIEW.prev.md, never silently overwritten.
  const reviewPath = path.join(out, 'REVIEW.md');
  if (fs.existsSync(reviewPath)) fs.copyFileSync(reviewPath, path.join(out, 'REVIEW.prev.md'));
  const rel = p => path.relative(out, p).split(path.sep).join('/');
  const L = [
    `# Review: ${path.basename(path.dirname(path.resolve(html)))} (${format})`, '',
    `<!-- film: ${rel(path.resolve(html))} -->`, `<!-- film-sha256: ${sha256(html)} -->`, `<!-- shots: ${shots.length} -->`, '',
    'Open every sheet and answer every question in writing, on the line after its label, replacing TODO.',
    'Answers must describe what you SEE, with timecodes. For real-world objects (animals, logos, UI, real systems),',
    'compare against a reference image and name it. Fix what you find, re-run review.mjs, answer again.',
    `Gate: \`node harness/review.mjs --check ${rel(reviewPath)}\` must print "review check: OK".`, '',
  ];
  for (const s of shots) {
    L.push(`## Shot ${s.id} (${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s)`, '', `![${s.id}](${rel(s.file)})`, '',
      `Tiles at: ${s.times.map(t => t.toFixed(2) + 's').join(', ')}`, '');
    QUESTIONS.forEach((q, i) => L.push(`${i + 1}. ${q}`, `**A:** ${TODO}`, ''));
    L.push(`${QUESTIONS.length + 1}. Score 1-5 (5 = nothing to fix) and the fixes made.`, `**Score:** ${TODO}`, `**Fixes made:** ${TODO}`, '');
  }
  L.push('## Lint summary', '', '| format | check | status | evidence |', '|---|---|---|---|');
  for (const r of lintRes) for (const c of r.checks) L.push(`| ${r.format} | ${c.id} | ${c.status} | ${c.summary} |`);
  const nFail = lintRes.reduce((n, r) => n + r.checks.filter(c => c.status === 'FAIL').length, 0);
  L.push('', `Lint FAIL count: ${nFail}`, '', '## Checklist', '', `- [ ] all shots >= ${MIN_SCORE}/5, 0 lint FAIL`, '');
  fs.writeFileSync(reviewPath, L.join('\n'));
  console.log(`${reviewPath}\nreview: ${shots.length} sheets, lint ${nFail} FAIL${errors.length ? ', PAGE ERRORS:\n' + errors.join('\n') : ''}`);
  process.exit(errors.length ? 1 : 0);
}
