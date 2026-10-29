// Builds index.html (the HyperFrames composition) from chapters.mjs.
//   node build.mjs
// Layout: 1920 x 1080. Each chapter puts the lesson on the left (who it is
// for, a headline, a one-line purpose and numbered steps) and the real screen
// on the right; as each step becomes active, a numbered ring lights up the
// part of the screen it talks about. A progress bar runs along the bottom.
//
// Narration: drop the recordings into voiceover/ (intro, c01 ... c13, outro;
// .wav, .flac, .m4a or .mp3) and rebuild. Each scene stretches to fit its
// recording, and each step starts as the narrator reaches its line (timed by
// its share of the words in voiceover/script.mjs). Without recordings the
// film keeps its silent timings. ffprobe must be installed.
import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chapters, INTRO as INTRO_MIN, OUTRO as OUTRO_MIN, outro } from './chapters.mjs';
import * as vo from './voiceover/script.mjs';

const W = 1440; // capture width in CSS px
const SCALE = 1120 / W; // desktop window image width in the film
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pad2 = (n) => String(n).padStart(2, '0');
const r2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- narration
const VO_LEAD = 0.9; // seconds into a scene before the voice starts
const VO_TAIL = 1.4; // seconds of picture after the voice ends
const words = (s) => s.split(/\s+/).filter(Boolean).length;

if (vo.chapters.length !== chapters.length) throw new Error('voiceover/script.mjs needs one entry per chapter');
vo.chapters.forEach((v, i) => {
  if (v.steps.length !== chapters[i].steps.length) {
    throw new Error(`voiceover/script.mjs ${v.file}: ${v.steps.length} lines for ${chapters[i].steps.length} steps`);
  }
});

/** The recording for one scene, if it has been delivered: { src, duration }. */
function recording(name) {
  for (const ext of ['wav', 'flac', 'm4a', 'mp3']) {
    const src = `voiceover/${name}.${ext}`;
    const path = fileURLToPath(new URL(`./${src}`, import.meta.url));
    if (!existsSync(path)) continue;
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]);
    return { src, duration: r2(Number(String(out).trim())) };
  }
  return null;
}
const fit = (min, rec) => (rec ? Math.max(min, r2(VO_LEAD + rec.duration + VO_TAIL)) : min);

// ---------------------------------------------------------------- timing
const introVo = recording(vo.intro.file);
const outroVo = recording(vo.outro.file);
const INTRO = fit(INTRO_MIN, introVo);
const OUTRO = fit(OUTRO_MIN, outroVo);

let t = INTRO;
const timed = chapters.map((c, i) => {
  const rec = recording(vo.chapters[i].file);
  const duration = fit(c.duration, rec);
  const start = t;
  t = r2(t + duration);
  let stepAt;
  if (rec) {
    // Step k lights up just before the narrator reaches its line.
    const lines = [vo.chapters[i].opening, ...vo.chapters[i].steps];
    const total = lines.reduce((n, l) => n + words(l), 0);
    let before = words(lines[0]);
    let last = start + 1.4;
    stepAt = c.steps.map((_, k) => {
      const at = Math.max(last + 1, start + VO_LEAD + (before / total) * rec.duration - 0.15);
      before += words(lines[k + 1]);
      last = at;
      return r2(at);
    });
  } else {
    const first = start + 1.9;
    const gap = (duration - 2.6) / c.steps.length;
    stepAt = c.steps.map((_, k) => r2(first + k * gap));
  }
  return { ...c, i, n: i + 1, duration, start, end: t, stepAt, rec };
});
const OUTRO_START = t;
const TOTAL = r2(OUTRO_START + OUTRO);

const voiceClips = [
  introVo && { id: 'vo-intro', rec: introVo, at: VO_LEAD },
  ...timed.map((c) => c.rec && { id: `vo-c${pad2(c.n)}`, rec: c.rec, at: r2(c.start + VO_LEAD) }),
  outroVo && { id: 'vo-outro', rec: outroVo, at: r2(OUTRO_START + VO_LEAD) },
].filter(Boolean);

// ---------------------------------------------------------------- markup
const P = 10; // ring padding around the highlighted box
const ring = (id, [x, y, w, h], num) =>
  `<div id="${id}" class="ring" style="left:${x - P}px;top:${y - P}px;width:${w + 2 * P}px;height:${h + 2 * P}px">${
    num ? `<span class="badge">${num}</span>` : ''
  }</div>`;

// Dims the screen around every box of one step (even-odd holes, so two
// highlighted areas never darken each other).
const roundRect = ([x, y, w, h], r = 18) => {
  x -= P; y -= P; w += 2 * P; h += 2 * P;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
};
const dimmer = (id, boxes) =>
  `<svg id="${id}" class="dimmer" viewBox="0 0 ${W} 900" width="${W}" height="900"><path fill-rule="evenodd" d="M0 0H${W}V900H0Z ${boxes.map((b) => roundRect(b)).join(' ')}" /></svg>`;

function windowMedia(c) {
  // Every distinct screen this chapter shows, in order of first use.
  const imgs = [];
  c.steps.forEach((s) => { if (s.img && !imgs.includes(s.img)) imgs.push(s.img); });
  const rings = c.steps.flatMap((s, k) => [
    ...(s.hl ? [dimmer(`c${c.n}-d${k}`, s.hl)] : []),
    ...(s.hl ?? []).map((box, j) => ring(`c${c.n}-r${k}-${j}`, box, j === 0 ? k + 1 : null)),
  ]);
  const phones = c.steps.map((s, k) => (s.phone ? `<div id="c${c.n}-ph${k}" class="phone phone-float"><img src="assets/${s.phone}.webp" alt="" /></div>` : '')).join('');
  return `
        <div id="c${c.n}-win" class="window">
          <div class="bar"><span></span><span></span><span></span></div>
          <div class="viewport">
            <div id="c${c.n}-cam" class="cam">
              <div class="stage">
                ${imgs.map((img, j) => `<img id="c${c.n}-img${j}" class="shot" src="assets/${img}.webp" alt="" />`).join('\n                ')}
                ${rings.join('\n                ')}
              </div>
            </div>
          </div>
        </div>
        ${phones}`;
}

function phonesMedia(c) {
  return `<div class="phones">${c.phones.map((p, j) => `<div id="c${c.n}-ph${j}" class="phone phone-lg"><div class="screen"><img src="assets/${p}.webp" alt="" /></div></div>`).join('')}</div>`;
}

function gridMedia(c) {
  return `<div class="tiles">${c.tiles
    .map((img, j) =>
      img.startsWith('mobile')
        ? `<div id="c${c.n}-tile${j}" class="tile tile-phone"><div class="phone phone-sm"><img src="assets/${img}.webp" alt="" /></div></div>`
        : `<div id="c${c.n}-tile${j}" class="tile"><div class="window window-sm"><div class="bar"><span></span><span></span><span></span></div><img src="assets/${img}.webp" alt="" /></div></div>`,
    )
    .join('')}</div>`;
}

const chapterHtml = (c) => `
      <!-- Chapter ${c.n}: ${c.title} -->
      <section id="c${c.n}" class="scene clip" data-start="${c.start}" data-duration="${c.duration}" data-track-index="0">
        <div id="c${c.n}-lesson" class="lesson">
          <p id="c${c.n}-tag" class="tag"><span class="num">Chapter ${c.n}</span>${c.who.map((w) => `<span class="who">${esc(w)}</span>`).join('')}</p>
          <h2 id="c${c.n}-h" class="headline">${esc(c.headline)}</h2>
          <p id="c${c.n}-lede" class="lede">${esc(c.lede)}</p>
          <ol class="steps">
            ${c.steps
              .map(
                (s, k) =>
                  `<li id="c${c.n}-s${k}" class="step"><span class="dot"><span id="c${c.n}-s${k}-n" class="n">${k + 1}</span><span id="c${c.n}-s${k}-ok" class="ok">✓</span></span><span class="txt">${esc(s.text)}</span></li>`,
              )
              .join('\n            ')}
          </ol>
        </div>
        <div class="media">${c.layout === 'phones' ? phonesMedia(c) : c.layout === 'grid' ? gridMedia(c) : windowMedia(c)}
        </div>
      </section>`;

const tocHtml = timed
  .map((c) => `<li id="toc${c.n}" class="toc-item"><span class="toc-n">${pad2(c.n)}</span>${esc(c.title)}</li>`)
  .join('\n          ');

const progressHtml = timed
  .map((c) => `<div class="seg"><div id="seg${c.n}" class="seg-fill"></div></div>`)
  .join('');

// ---------------------------------------------------------------- timeline
const js = [];
const at = (n) => r2(n);
for (const c of timed) {
  const { n, start: T, end: E } = c;
  js.push(`// Chapter ${n}`);
  js.push(`enter('#c${n}-tag', ${at(T + 0.15)}, 24); enter('#c${n}-h', ${at(T + 0.3)}, 36); enter('#c${n}-lede', ${at(T + 0.5)}, 24);`);
  js.push(`tl.fromTo('#c${n} .step', { opacity: 0, x: -16 }, { opacity: 0.38, x: 0, duration: 0.6, stagger: 0.08, ease }, ${at(T + 0.75)});`);
  js.push(`tl.fromTo('#seg${n}', { scaleX: 0 }, { scaleX: 1, duration: ${c.duration}, ease: 'none' }, ${T});`);
  js.push(`tl.set('#chapter-count', { textContent: '${pad2(n)} / ${pad2(timed.length)}' }, ${T});`);

  if (c.layout === 'window') {
    js.push(`tl.fromTo('#c${n}-win', { opacity: 0, y: 70, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 1.1, ease }, ${at(T + 0.35)});`);
    js.push(`tl.fromTo('#c${n}-cam', { scale: 1 }, { scale: 1.025, duration: ${c.duration}, ease: 'sine.inOut' }, ${T});`);
    // screens: the first is visible from the start, later ones cross-fade in
    const imgs = [];
    c.steps.forEach((s, k) => {
      if (s.img && !imgs.includes(s.img)) {
        imgs.push(s.img);
        const j = imgs.length - 1;
        if (j === 0) js.push(`tl.set('#c${n}-img0', { opacity: 1 }, ${T});`);
        else {
          js.push(`tl.fromTo('#c${n}-img${j}', { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.inOut' }, ${at(c.stepAt[k] - 0.35)});`);
          js.push(`tl.to('#c${n}-img${j - 1}', { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, ${at(c.stepAt[k] - 0.35)});`);
        }
      }
    });
    c.steps.forEach((s, k) => {
      const on = c.stepAt[k];
      const off = k + 1 < c.steps.length ? c.stepAt[k + 1] - 0.25 : E - 0.7;
      if (s.hl) {
        js.push(`tl.fromTo('#c${n}-d${k}', { opacity: 0 }, { opacity: 1, duration: 0.5, ease }, ${at(on + 0.1)});`);
        js.push(`tl.to('#c${n}-d${k}', { opacity: 0, duration: 0.35, ease: 'power2.in' }, ${at(off)});`);
      }
      (s.hl ?? []).forEach((_, j) => {
        js.push(`tl.fromTo('#c${n}-r${k}-${j}', { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.5, ease }, ${at(on + 0.1 + j * 0.15)});`);
        js.push(`tl.to('#c${n}-r${k}-${j}', { opacity: 0, duration: 0.35, ease: 'power2.in' }, ${at(off)});`);
      });
      if (s.phone) {
        js.push(`tl.fromTo('#c${n}-ph${k}', { opacity: 0, y: 120 }, { opacity: 1, y: 0, duration: 1, ease }, ${at(on)});`);
      }
    });
  } else if (c.layout === 'phones') {
    c.phones.forEach((_, j) => js.push(`tl.fromTo('#c${n}-ph${j}', { opacity: 0, y: 120 }, { opacity: 1, y: 0, duration: 1.1, ease }, ${at(T + 0.4 + j * 0.15)});`));
    if (c.phoneScroll) js.push(`tl.fromTo('#c${n}-ph0 img', { y: 0 }, { y: -${c.phoneScroll}, duration: 2.4, ease: 'sine.inOut' }, ${at(c.stepAt[1] - 0.3)});`);
  } else if (c.layout === 'grid') {
    c.tiles.forEach((_, j) => {
      js.push(`tl.fromTo('#c${n}-tile${j}', { opacity: 0, y: 60 }, { opacity: 0.45, y: 0, duration: 0.9, ease }, ${at(T + 0.4 + j * 0.1)});`);
      const on = c.stepAt[j];
      js.push(`tl.to('#c${n}-tile${j}', { opacity: 1, scale: 1.03, duration: 0.5, ease }, ${at(on)});`);
      if (j + 1 < c.tiles.length) js.push(`tl.to('#c${n}-tile${j}', { opacity: 0.7, scale: 1, duration: 0.4, ease: 'power2.inOut' }, ${at(c.stepAt[j + 1] - 0.2)});`);
    });
  }

  // steps: active (blue number), then done (green check)
  c.steps.forEach((_, k) => {
    const on = c.stepAt[k];
    js.push(`tl.to('#c${n}-s${k}', { opacity: 1, duration: 0.35, ease }, ${at(on)}); tl.to('#c${n}-s${k} .dot', { backgroundColor: '#0071e3', color: '#ffffff', duration: 0.35 }, ${at(on)});`);
    if (k + 1 < c.steps.length) {
      const next = c.stepAt[k + 1];
      js.push(
        `tl.to('#c${n}-s${k} .txt', { opacity: 0.6, duration: 0.35 }, ${at(next - 0.1)}); tl.to('#c${n}-s${k} .dot', { backgroundColor: '#248a3d', duration: 0.35 }, ${at(next - 0.1)}); tl.to('#c${n}-s${k}-n', { opacity: 0, duration: 0.2 }, ${at(next - 0.1)}); tl.to('#c${n}-s${k}-ok', { opacity: 1, duration: 0.25 }, ${at(next)});`,
      );
    }
  });
  js.push(`leave('#c${n} .lesson, #c${n} .media', ${at(E - 0.45)});`);
}

// ---------------------------------------------------------------- page
const html = `<!doctype html>
<!-- Generated by build.mjs from chapters.mjs. Edit those, then run: node build.mjs -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>SCCS Student OS guided tour</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      @font-face { font-family: 'Geist'; src: url('assets/Geist-Variable.woff2') format('woff2'); font-weight: 100 900; font-display: block; }
      html, body { margin: 0; background: #f5f5f7; }
      body { font-family: 'Geist', sans-serif; color: #1d1d1f; -webkit-font-smoothing: antialiased; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: radial-gradient(1200px 700px at 78% 40%, #ffffff 0%, #f5f5f7 60%); }
      .scene { position: absolute; inset: 0; }

      /* persistent chrome */
      .brand { position: absolute; left: 96px; top: 48px; display: flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
      .brand img { width: 40px; height: 40px; border-radius: 11px; }
      .brand .muted { color: #6e6e73; font-weight: 500; }
      .count { position: absolute; right: 96px; top: 56px; font-size: 20px; font-weight: 600; color: #6e6e73; font-variant-numeric: tabular-nums; }
      .progress { position: absolute; left: 96px; right: 96px; bottom: 54px; display: flex; gap: 8px; }
      .seg { flex: 1; height: 6px; border-radius: 3px; background: rgba(0, 0, 0, 0.08); overflow: hidden; }
      .seg-fill { height: 100%; background: #0071e3; transform-origin: 0 50%; transform: scaleX(0); }

      /* lesson column */
      .lesson { position: absolute; left: 96px; top: 150px; width: 580px; }
      .tag { margin: 0 0 22px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .tag .num { font-size: 22px; font-weight: 700; color: #0071e3; margin-right: 6px; }
      .tag .who { font-size: 17px; font-weight: 600; padding: 7px 14px; border-radius: 999px; background: rgba(0, 113, 227, 0.09); color: #0058b0; }
      .headline { font-size: 60px; line-height: 1.04; font-weight: 700; letter-spacing: -0.045em; margin: 0; }
      .lede { font-size: 25px; line-height: 1.38; color: #6e6e73; margin: 22px 0 0; letter-spacing: -0.012em; }
      .steps { list-style: none; margin: 40px 0 0; padding: 0; display: flex; flex-direction: column; gap: 22px; }
      .step { display: flex; gap: 18px; align-items: flex-start; opacity: 0; }
      .dot { position: relative; flex: none; width: 44px; height: 44px; border-radius: 50%; background: #e8e8ed; color: #1d1d1f; font-size: 21px; font-weight: 700; }
      .dot .n, .dot .ok { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      .dot .ok { opacity: 0; color: #fff; }
      .txt { font-size: 24px; line-height: 1.36; font-weight: 500; letter-spacing: -0.01em; padding-top: 6px; }

      /* media column */
      .media { position: absolute; left: 728px; top: 150px; width: 1096px; height: 780px; }
      .window { position: absolute; left: 0; top: 0; width: 1120px; border-radius: 22px; overflow: hidden; background: #fff; border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 50px 110px -50px rgba(15, 23, 42, 0.45); }
      .bar { height: 38px; background: #f5f5f7; border-bottom: 1px solid rgba(0, 0, 0, 0.07); display: flex; align-items: center; gap: 9px; padding: 0 18px; }
      .bar span { width: 12px; height: 12px; border-radius: 50%; background: #d2d2d7; }
      .viewport { position: relative; width: 1120px; height: 700px; overflow: hidden; }
      .cam { position: absolute; inset: 0; transform-origin: 50% 40%; }
      .stage { position: absolute; left: 0; top: 0; width: ${W}px; height: 900px; transform-origin: 0 0; transform: scale(${SCALE}); }
      .shot { position: absolute; inset: 0; width: ${W}px; height: 900px; display: block; opacity: 0; }
      .ring { position: absolute; border: 5px solid #0071e3; border-radius: 18px; opacity: 0; box-sizing: border-box; }
      .dimmer { position: absolute; left: 0; top: 0; opacity: 0; }
      .dimmer path { fill: rgba(15, 23, 42, 0.30); }
      .badge { position: absolute; left: -24px; top: -24px; width: 48px; height: 48px; border-radius: 50%; background: #0071e3; color: #fff; font-size: 26px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px -6px rgba(0, 113, 227, 0.6); }

      .phone { border-radius: 46px; border: 10px solid #1d1d1f; background: #1d1d1f; overflow: hidden; box-shadow: 0 50px 100px -40px rgba(0, 0, 0, 0.55); }
      .phone img { display: block; width: 100%; height: auto; border-radius: 36px; }
      .phone-float { position: absolute; right: -30px; top: 150px; width: 300px; opacity: 0; }
      .phones { position: absolute; inset: 0; display: flex; justify-content: center; align-items: flex-start; gap: 60px; }
      .phone-lg { width: 340px; opacity: 0; }
      .phone-lg .screen img { border-radius: 0; }
      .phone-lg .screen { height: ${Math.round((320 * 852) / 393)}px; overflow: hidden; border-radius: 36px; }

      .tiles { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 34px 34px; }
      .tile { opacity: 0; transform-origin: 50% 50%; display: flex; align-items: flex-start; justify-content: center; }
      .window-sm { position: relative; width: 531px; border-radius: 16px; overflow: hidden; background: #fff; border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 30px 70px -36px rgba(15, 23, 42, 0.5); }
      .window-sm .bar { height: 26px; padding: 0 12px; gap: 7px; }
      .window-sm .bar span { width: 9px; height: 9px; }
      .window-sm img { display: block; width: 100%; height: auto; }
      .tile-phone { align-items: flex-start; }
      .phone-sm { width: 172px; border-radius: 30px; border-width: 7px; }
      .phone-sm img { border-radius: 23px; }

      /* intro and outro */
      .center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      .logo { width: 132px; height: 132px; border-radius: 32px; box-shadow: 0 30px 60px -25px rgba(0, 0, 0, 0.35); }
      .title { font-size: 92px; line-height: 1.02; font-weight: 700; letter-spacing: -0.05em; margin: 38px 0 0; max-width: 1500px; }
      .sub { font-size: 34px; color: #6e6e73; margin: 20px 0 0; letter-spacing: -0.02em; }
      .toc { list-style: none; padding: 0; margin: 56px 0 0; width: 1400px; display: flex; flex-wrap: wrap; justify-content: center; gap: 14px 18px; text-align: left; }
      .toc-item { width: 330px; box-sizing: border-box; display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 16px; background: #fff; border: 1px solid rgba(0, 0, 0, 0.06); font-size: 22px; font-weight: 600; letter-spacing: -0.01em; opacity: 0; }
      .toc-n { font-size: 18px; font-weight: 700; color: #0071e3; font-variant-numeric: tabular-nums; }
      .takeaways { list-style: none; padding: 0; margin: 44px 0 0; display: flex; flex-direction: column; gap: 16px; }
      .takeaways li { font-size: 32px; font-weight: 500; letter-spacing: -0.02em; opacity: 0; }
      .takeaways li::before { content: '✓'; color: #248a3d; font-weight: 700; margin-right: 16px; }
      .pill { display: inline-block; margin-top: 48px; padding: 20px 44px; border-radius: 999px; background: #0071e3; color: #fff; font-size: 32px; font-weight: 600; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${TOTAL}" data-fps="30">

      <!-- Intro: what the tour covers -->
      <section id="intro" class="scene center clip" data-start="0" data-duration="${INTRO}" data-track-index="0">
        <img id="intro-logo" class="logo" src="assets/sccs.png" alt="" />
        <h1 id="intro-title" class="title">Everything you can do with SCCS Student OS</h1>
        <p id="intro-sub" class="sub">A guided tour in ${timed.length} short chapters</p>
        <ol class="toc">
          ${tocHtml}
        </ol>
      </section>

      <!-- Chapter chrome: brand, chapter count, progress -->
      <div id="chrome" class="clip" data-start="${INTRO}" data-duration="${OUTRO_START - INTRO}" data-track-index="1">
        <div id="brand" class="brand"><img src="assets/sccs.png" alt="" />SCCS Student OS <span class="muted">Guided tour</span></div>
        <div id="chapter-count" class="count">01 / ${pad2(timed.length)}</div>
        <div id="progress" class="progress">${progressHtml}</div>
      </div>
${timed.map(chapterHtml).join('\n')}

      <!-- Narration -->
${voiceClips.map((v) => `      <audio id="${v.id}" class="clip" src="${v.rec.src}" data-start="${v.at}" data-duration="${v.rec.duration}" data-track-index="2" data-volume="1"></audio>`).join('\n')}

      <!-- Outro -->
      <section id="outro" class="scene center clip" data-start="${OUTRO_START}" data-duration="${OUTRO}" data-track-index="0">
        <img id="outro-logo" class="logo" src="assets/sccs.png" alt="" />
        <h2 id="outro-title" class="title">${esc(outro.headline)}</h2>
        <ul class="takeaways">
          ${outro.takeaways.map((x, j) => `<li id="tk${j}">${esc(x)}</li>`).join('\n          ')}
        </ul>
        <span id="outro-pill" class="pill">${esc(outro.cta)}</span>
      </section>
    </div>

    <script>
      const tl = gsap.timeline({ paused: true });
      const ease = 'power3.out';
      const enter = (sel, at, y = 40, d = 0.9) => tl.fromTo(sel, { opacity: 0, y }, { opacity: 1, y: 0, duration: d, ease }, at);
      const leave = (sel, at, d = 0.45) => tl.to(sel, { opacity: 0, duration: d, ease: 'power2.in' }, at);

      // Intro
      tl.fromTo('#intro-logo', { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.9, ease }, 0.2);
      enter('#intro-title', 0.5, 50, 1.1);
      enter('#intro-sub', 1.0, 24);
      tl.fromTo('.toc-item', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease }, 1.8);
      leave('#intro-logo, #intro-title, #intro-sub, .toc', ${INTRO - 0.5});

      // Chrome
      enter('#brand', ${INTRO + 0.1}, 16, 0.7);
      enter('#chapter-count', ${INTRO + 0.1}, 16, 0.7);
      enter('#progress', ${INTRO + 0.1}, 16, 0.7);

      ${js.join('\n      ')}

      // Outro
      tl.fromTo('#outro-logo', { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.9, ease }, ${OUTRO_START + 0.2});
      enter('#outro-title', ${OUTRO_START + 0.45}, 50, 1);
      tl.fromTo('.takeaways li', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.35, ease }, ${OUTRO_START + 1.2});
      tl.fromTo('#outro-pill', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease }, ${OUTRO_START + 2.6});

      window.__timelines['main'] = tl;
    </script>
  </body>
</html>
`;

writeFileSync(new URL('./index.html', import.meta.url), html);
// Chapter start times and the film length, for the landing page.
writeFileSync(
  new URL('./chapters.json', import.meta.url),
  JSON.stringify(
    { duration: TOTAL, narrated: voiceClips.length > 0, chapters: timed.map((c) => ({ n: c.n, title: c.title, start: c.start })) },
    null,
    2,
  ) + '\n',
);

// The script for the voice artist, generated from voiceover/script.mjs.
const est = (lines) => Math.round(lines.reduce((n, l) => n + words(l), 0) / 2.5);
const block = (file, title, lines) =>
  `### ${file}: ${title}\n\nAbout ${est(lines)} seconds.\n\n${lines.map((l) => `> ${l}`).join('\n>\n')}\n`;
const scenes = [
  block(vo.intro.file, 'Introduction', vo.intro.lines),
  ...vo.chapters.map((v, i) => block(v.file, `Chapter ${i + 1}, ${chapters[i].title}`, [v.opening, ...v.steps])),
  block(vo.outro.file, 'Closing', vo.outro.lines),
];
writeFileSync(
  new URL('./voiceover/SCRIPT.md', import.meta.url),
  `<!-- Generated by build.mjs from voiceover/script.mjs. Edit that file, then run: node build.mjs -->
# SCCS Student OS guided tour: narration script

A friendly, clear walkthrough of a school app for teachers, counsellors and school leaders. ${scenes.length} short recordings, about ${Math.round(
    [vo.intro.lines, ...vo.chapters.map((v) => [v.opening, ...v.steps]), vo.outro.lines].reduce((n, ls) => n + est(ls), 0) / 60,
  )} minutes in total.

## Direction

- **Voice:** a natural London accent, warm and conversational, like a colleague showing you round. Not announcer-style, not rushed.
- **Pace:** about 150 words a minute. Leave a short breath between sentences; the picture moves on each sentence.
- **Pronunciation:** read letters one by one where they are spaced out (S C C S, I E P, P D F, M T S S). "Five-oh-four" is a US special-education plan. "PlusPortals" is one word. "PROFAN" is said as a word ("pro-fan").
- **Delivery:** one file per section below, named exactly as the heading (for example \`c01.wav\`). WAV or FLAC, 48 kHz, 24-bit, mono. Half a second of silence at the start and end. No music, no processing beyond light noise removal.
- **Retakes:** one clean take per file is plenty. If a line changes, only that file needs re-recording.

## Script

${scenes.join('\n')}`,
);

console.log(`index.html: ${timed.length} chapters, ${TOTAL}s, narration ${voiceClips.length}/${timed.length + 2} scenes`);
