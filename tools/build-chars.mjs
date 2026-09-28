// 叠汉字数据管线：字体字形 → 无头 Chrome 光栅化 → 每个笔画块（连通域）外轮廓 + 洞 →
// 简化/平滑 → 缩放/质心归一 → 填充用「锁孔」多边形 + 描边环 + 每块物理轮廓 → src/data/chars.json
// 字体：tools/fonts/DiedieCharsBrush-Regular.ttf（马善政毛笔楷书子集，SIL OFL，见 tools/fonts/README.md）
// schema 与省份/动物兼容：verts 为全部笔画的凸包（只用于包围盒/占位），真正的画法在 parts，碰撞在 physParts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import {
  simplify,
  chaikin,
  centroid,
  bounds,
  convexHull,
  untangle,
  labelComponents,
  traceLabel,
} from './shape-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// FONT/OUT 可用环境变量覆盖（试字体用）
const OUT = process.env.CHARS_OUT || path.join(ROOT, 'src/data/chars.json');
const FONT = process.env.CHARS_FONT || path.join(ROOT, 'tools/fonts/DiedieCharsBrush-Regular.ttf');

const RASTER = 640;
const SIMPLIFY_RAW = 1.4;
const PHYS_TOLERANCE_PX = 3;
/** 物理底部压平带（占字高比例），同 build-animals */
const FLAT_ZONE = 0.04;
/** 小于整幅面积该比例的碎块忽略（字体抗锯齿噪点） */
const MIN_PART = 0.0008;

// px: 目标最大边长（与动物 185-250 同量级）；face/er 缺省自动（笔画最宽处并排放两只眼）
const LIST = [
  // 自然
  { id: 'ri', ch: '日', color: '#FF7043', px: 200 },
  { id: 'yue', ch: '月', color: '#FFCA28', px: 210 },
  { id: 'shan', ch: '山', color: '#66BB6A', px: 220 },
  { id: 'shui', ch: '水', color: '#29B6F6', px: 220 },
  { id: 'huo', ch: '火', color: '#EF5350', px: 220 },
  { id: 'mu', ch: '木', color: '#8D6E63', px: 220 },
  { id: 'shi', ch: '石', color: '#90A4AE', px: 215 },
  { id: 'yu', ch: '雨', color: '#5C6BC0', px: 220 },
  { id: 'tian', ch: '田', color: '#9CCC65', px: 210 },
  // 人
  { id: 'ren', ch: '人', color: '#FFA726', px: 225 },
  { id: 'kou', ch: '口', color: '#EC407A', px: 195 },
  { id: 'mu4', ch: '目', color: '#7E57C2', px: 210 },
  { id: 'er', ch: '耳', color: '#F48FB1', px: 215 },
  { id: 'shou', ch: '手', color: '#FFB74D', px: 220 },
  { id: 'zu', ch: '足', color: '#4DB6AC', px: 220 },
  { id: 'da', ch: '大', color: '#26A69A', px: 225 },
  { id: 'zi', ch: '子', color: '#42A5F5', px: 215 },
  // 动植物与器物
  { id: 'niu', ch: '牛', color: '#A1887F', px: 220 },
  { id: 'yang', ch: '羊', color: '#AED581', px: 220 },
  { id: 'ma', ch: '马', color: '#8D6E63', px: 215 },
  { id: 'niao', ch: '鸟', color: '#4FC3F7', px: 215 },
  { id: 'yu2', ch: '鱼', color: '#FF8A65', px: 220 },
  { id: 'zhu', ch: '竹', color: '#81C784', px: 220 },
  { id: 'men', ch: '门', color: '#BA68C8', px: 215 },
];

// ---------- 几何 ----------

/** 把洞用零宽「锁孔」缝接进外圈，得到可直接 fillPoints 的单环（洞方向须与外圈相反） */
function keyhole(outer, holes) {
  let ring = outer.slice();
  // 洞按最靠左的点排序依次接入，缝尽量短
  const hs = holes
    .map((h) => (Math.sign(area(h)) === Math.sign(area(ring)) ? h.slice().reverse() : h.slice()))
    .sort((a, b) => Math.min(...a.map((p) => p.x)) - Math.min(...b.map((p) => p.x)));
  for (const h of hs) {
    let best = { d: Infinity, i: 0, j: 0 };
    for (let i = 0; i < ring.length; i++)
      for (let j = 0; j < h.length; j++) {
        const d = (ring[i].x - h[j].x) ** 2 + (ring[i].y - h[j].y) ** 2;
        if (d < best.d) best = { d, i, j };
      }
    const hole = [...h.slice(best.j), ...h.slice(0, best.j + 1)];
    ring = [...ring.slice(0, best.i + 1), ...hole, ...ring.slice(best.i)];
  }
  return ring;
}

function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** 双遍 3-4 倒角距离变换：每个实心像素到最近背景像素的近似距离（像素） */
function distanceTransform(mask, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

// 先对原始像素轮廓做 Chaikin（只磨掉 1px 锯齿），再简化——反过来会把洞的直角切成大斜角
const smooth = (ring) => simplify(chaikin(ring), SIMPLIFY_RAW * 0.7);

/**
 * 底部找平：毛笔楷书的竖钩常比另一侧的腿长（「雨」约 12%），平放时只有钩尖着地、字总是歪着，
 * 叠上去的块会慢慢滑倒（用户反馈「雨」反复抖动停不稳，选择「把过长的竖钩修短」）。
 * 取全字最低点，再取重心另一侧的最低点，把两者之间高出的部分从字形上裁掉——画面与碰撞同时修，保持一致。
 * 高差 <1% 字高不动；需裁 >15% 字高则跳过（结构不适合，保留原字形）。
 */
function levelFeet(mask, w, h, ch) {
  let minY = h;
  let maxY = -1;
  let sx = 0;
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sx += x;
        n++;
      }
  const cx = sx / n;
  const H = maxY - minY;
  // 每列最低实心像素
  const bottom = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++)
    for (let y = h - 1; y >= 0; y--)
      if (mask[y * w + x]) {
        bottom[x] = y;
        break;
      }
  let lowX = 0;
  for (let x = 0; x < w; x++) if (bottom[x] > bottom[lowX]) lowX = x;
  // 重心另一侧的最低点
  let opp = -1;
  for (let x = 0; x < w; x++) if ((x - cx) * (lowX - cx) < 0 && bottom[x] > opp) opp = bottom[x];
  if (opp < 0) return mask;
  const cut = maxY - opp;
  if (cut <= H * 0.01) return mask;
  if (cut > H * 0.15) {
    console.log(`  ⚠ ${ch}: 两侧着地高差 ${((cut / H) * 100).toFixed(1)}% 过大，不找平`);
    return mask;
  }
  const out = mask.slice();
  for (let y = opp + 1; y < h; y++) out.fill(0, y * w, (y + 1) * w);
  console.log(`  ${ch}: 底部找平，裁掉 ${((cut / H) * 100).toFixed(1)}% 字高`);
  return out;
}

// ---------- 主流程 ----------

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage();
await page.setContent(`<canvas id="c" width="${RASTER}" height="${RASTER}"></canvas>`);
await page.evaluate(async (b64) => {
  const f = new FontFace('DC', `url(data:font/ttf;base64,${b64})`);
  await f.load();
  document.fonts.add(f);
}, fs.readFileSync(FONT).toString('base64'));

const out = [];
const problems = [];
for (const a of LIST) {
  const maskStr = await page.evaluate(
    ({ ch, size }) => {
      const c = document.getElementById('c');
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      ctx.font = `${Math.round(size * 0.86)}px DC`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, size / 2, size / 2);
      const d = ctx.getImageData(0, 0, size, size).data;
      const arr = new Uint8Array(size * size);
      for (let i = 0; i < size * size; i++) arr[i] = d[i * 4 + 3] > 110 ? 1 : 0;
      let s = '';
      for (let i = 0; i < arr.length; i += 4096) s += String.fromCharCode(...arr.subarray(i, i + 4096));
      return btoa(s);
    },
    { ch: a.ch, size: RASTER }
  );
  const W = RASTER;
  const mask = levelFeet(Uint8Array.from(Buffer.from(maskStr, 'base64')), W, W, a.ch);

  // 笔画块
  const { label, sizes } = labelComponents(mask, W, W);
  const minPx = W * W * MIN_PART;
  const partIds = [];
  for (let k = 1; k < sizes.length; k++) if (sizes[k] >= minPx) partIds.push(k);

  // 洞：不接触画布边缘的背景连通域，归属于邻接的笔画块
  const bg = mask.map((v) => (v ? 0 : 1));
  const bgc = labelComponents(bg, W, W);
  const touchesEdge = new Set();
  for (let i = 0; i < W; i++)
    for (const j of [i, (W - 1) * W + i, i * W, i * W + W - 1]) touchesEdge.add(bgc.label[j]);
  const holesOf = new Map(partIds.map((k) => [k, []]));
  for (let hId = 1; hId < bgc.sizes.length; hId++) {
    if (touchesEdge.has(hId) || bgc.sizes[hId] < minPx * 0.5) continue;
    // 找一个与洞相邻的笔画像素，确定归属
    let owner = 0;
    for (let i = 0; i < W * W && !owner; i++) {
      if (bgc.label[i] !== hId) continue;
      for (const n of [i - 1, i + 1, i - W, i + W]) if (label[n] && holesOf.has(label[n])) owner = label[n];
    }
    if (!owner) continue;
    holesOf.get(owner).push(smooth(traceLabel(bgc.label, W, W, hId)));
  }

  // 全字包围盒 → 缩放系数
  const outersRaw = partIds.map((k) => smooth(traceLabel(label, W, W, k)));
  const b0 = bounds(outersRaw.flat());
  const s = a.px / Math.max(b0.maxX - b0.minX, b0.maxY - b0.minY);
  const sc = (ring) => ring.map((p) => ({ x: p.x * s, y: p.y * s }));
  // 质心：按面积加权（外圈减洞）
  let A = 0;
  let cx = 0;
  let cy = 0;
  partIds.forEach((k, i) => {
    for (const [ring, sign] of [[outersRaw[i], 1], ...holesOf.get(k).map((h) => [h, -1])]) {
      const r = sc(ring);
      const ar = Math.abs(area(r)) * sign;
      const c = centroid(r);
      A += ar;
      cx += c.x * ar;
      cy += c.y * ar;
    }
  });
  const c = { x: cx / A, y: cy / A };
  const tr = (ring) => sc(ring).map((p) => ({ x: p.x - c.x, y: p.y - c.y }));

  const parts = partIds.map((k, i) => {
    const outer = simplify(tr(outersRaw[i]), 1.0);
    const holes = holesOf.get(k).map((h) => simplify(tr(h), 1.0));
    return { outer, holes, fill: keyhole(outer, holes) };
  });
  // 物理底部压平（与动物同法）：全字最低 FLAT_ZONE 高度内的点压到同一水平线——毛笔字的笔画末端
  // 高低不齐，只有两三个点着地会来回晃、被撞到平台边上时久久停不稳（用户反馈「雨」反复抖动）
  const physRaw = partIds.map((k, i) => simplify(tr(outersRaw[i]), PHYS_TOLERANCE_PX));
  const pMaxY = Math.max(...physRaw.flat().map((p) => p.y));
  const pMinY = Math.min(...physRaw.flat().map((p) => p.y));
  const flatY = pMaxY - (pMaxY - pMinY) * FLAT_ZONE;
  const physParts = physRaw.map((ring, i) =>
    untangle(
      simplify(ring.map((p) => (p.y > flatY ? { x: p.x, y: pMaxY } : p)), 1.5),
      `${a.ch}#${i}`
    )
  );
  const allPts = parts.flatMap((p) => p.outer);
  const hull = convexHull(allPts);
  const b = bounds(allPts);

  // 表情：顶部居中——字的「头」在上方正中。在字的上 40% 里找离「包围盒顶边中点」最近、
  // 且落在笔画芯上的点（竖向距离权重更高），再沿笔画爬到笔画中线；眼睛可略超出细笔画
  const dt = distanceTransform(mask, W, W);
  let fx;
  let fy;
  let eyeR;
  if (a.face) {
    fx = b.minX + (b.maxX - b.minX) * a.face[0];
    fy = b.minY + (b.maxY - b.minY) * a.face[1];
    eyeR = a.er ?? 9;
  } else {
    // 笔画芯阈值：全部笔画像素距离值的 60 分位的一半（避开笔画边缘与细笔锋）
    const vals = [];
    for (let i = 0; i < W * W; i++) if (dt[i] > 0) vals.push(dt[i]);
    vals.sort((p, q) => p - q);
    const core = vals[Math.floor(vals.length * 0.6)] * 0.5;
    const cx0 = (b0.minX + b0.maxX) / 2;
    const limit = b0.minY + (b0.maxY - b0.minY) * 0.4;
    let best = { cost: Infinity, x: cx0, y: b0.minY };
    for (let y = Math.floor(b0.minY); y < limit; y++)
      for (let x = Math.floor(b0.minX); x < b0.maxX; x++) {
        if (dt[y * W + x] < core) continue;
        const cost = (y - b0.minY) + 0.7 * Math.abs(x - cx0);
        if (cost < best.cost) best = { cost, x, y };
      }
    // 爬到附近笔画中线（距离值局部最大）
    for (let step = 0; step < 40; step++) {
      let nb = best;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = best.x + dx;
        const y = best.y + dy;
        if (dt[y * W + x] > dt[nb.y * W + nb.x]) nb = { ...best, x, y };
      }
      if (nb === best) break;
      best = nb;
    }
    fx = best.x * s - c.x;
    fy = best.y * s - c.y;
    eyeR = a.er ?? 9;
  }

  const R = (ring) => ring.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
  console.log(
    `${a.ch}: ${parts.length} 块 / 洞 ${parts.reduce((n, p) => n + p.holes.length, 0)} 个 / 物理 ${physParts
      .map((p) => p.length)
      .join('+')} 顶点, ${Math.round(b.maxX - b.minX)}x${Math.round(b.maxY - b.minY)}px, 眼 r=${eyeR.toFixed(1)}`
  );
  out.push({
    adcode: `c-${a.id}`,
    name: a.ch,
    display: `${a.ch}字`,
    short: a.ch,
    color: a.color,
    verts: R(hull),
    phys: R(physParts.reduce((m, p) => (Math.abs(area(p)) > Math.abs(area(m)) ? p : m))),
    physParts: physParts.map(R),
    parts: parts.map((p) => ({ fill: R(p.fill), rings: [R(p.outer), ...p.holes.map(R)] })),
    face: [Math.round(fx * 10) / 10, Math.round(fy * 10) / 10],
    eyeR: Math.round(eyeR * 10) / 10,
    size: [Math.round(b.maxX - b.minX), Math.round(b.maxY - b.minY)],
  });
}
await browser.close();

if (problems.length) {
  console.error('\n❌ 数据问题：\n' + problems.join('\n'));
  process.exit(1);
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\n✅ 写入 ${OUT}（${out.length} 个字）`);
