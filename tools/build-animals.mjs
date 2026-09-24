// 动物轮廓数据管线 v3（叠动物模式）：
// PhyloPic 物种剪影（tools/phylopic-svg/，CC0 为主 + 6 张 CC-BY，署名见同目录
// ATTRIBUTION.md）→ 无头 Chrome 光栅化取 alpha 蒙版 → 最大连通域 → Moore 边界
// 追踪 → 简化+平滑 → 缩放/质心归一 → 物理轮廓（重简化+凸包收拢，与省份管线同
// 参数）→ src/data/animals.json。剪影原样使用、仅叠加表情，不做外形加工。
// v1 手工控制点、v2 Twemoji 轮廓均已废弃（git 历史可查）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/animals.json');

const RASTER = 640; // 光栅化分辨率（写实剪影细节多，高一些保真）
const SIMPLIFY_RAW = 1.4; // 追踪结果先简化（640 空间像素，容差小保细节）
const PHYS_TOLERANCE_PX = 10;
const HULL_BLEND = 0.25;

// face: 表情锚点在包围盒内的比例坐标 [fx, fy]（0-1，缺省用弦扫描启发式，
// 对照表确认眼睛落在头部后逐个覆盖）；px: 目标最大边长（对标省份 130-300 分布）
const LIST = [
  { id: 'cat', name: '小猫', color: '#FF8A65', px: 200, file: 'cat-81e1f778.svg', face: [0.84, 0.38], er: 12 },
  { id: 'dog', name: '小狗', color: '#BCAAA4', px: 210, file: 'dog-d3e8133c.svg', face: [0.42, 0.12], er: 12 },
  { id: 'rabbit', name: '兔子', color: '#F48FB1', px: 200, file: 'rabbit-d71fcd12.svg', face: [0.3, 0.4], er: 12 },
  { id: 'panda', name: '大熊猫', color: '#FFF8EC', px: 245, file: 'panda-4b1f7a58.svg', face: [0.3, 0.18], er: 13, patch: true },
  { id: 'tiger', name: '老虎', color: '#FFA726', px: 250, file: 'tiger-a02b9a9a.svg', face: [0.13, 0.3], er: 12 },
  { id: 'lion', name: '狮子', color: '#FFCA28', px: 250, file: 'lion-78dbe564.svg', face: [0.14, 0.22], er: 11 },
  { id: 'elephant', name: '大象', color: '#9FA8DA', px: 265, file: 'elephant-910d853a.svg', face: [0.25, 0.3], er: 14 },
  { id: 'giraffe', name: '长颈鹿', color: '#FFB74D', px: 285, file: 'giraffe-b35f867d.svg', face: [0.15, 0.06], er: 8 },
  { id: 'monkey', name: '小猴子', color: '#A1887F', px: 215, file: 'monkey-4e9c5666.svg', face: [0.1, 0.47], er: 6 },
  { id: 'chick', name: '公鸡', color: '#FFEE58', px: 185, file: 'chick-2de1c95c.svg', face: [0.2, 0.15], er: 10 },
  { id: 'duck', name: '鸭子', color: '#FFD54F', px: 190, file: 'duck-97f833ff.svg', face: [0.2, 0.25], er: 10 },
  { id: 'goose', name: '大白鹅', color: '#81D4FA', px: 230, file: 'goose-9e1e3fd7.svg', face: [0.2, 0.1], er: 8 },
  { id: 'cow', name: '奶牛', color: '#CE93D8', px: 250, file: 'cow-dc5c561e.svg', face: [0.1, 0.25], er: 10 },
  { id: 'horse', name: '小马', color: '#8D6E63', px: 255, file: 'horse-85d95128.svg', face: [0.15, 0.15], er: 10 },
  { id: 'sheep', name: '绵羊', color: '#DCE775', px: 215, file: 'sheep-d9c0cddb.svg', face: [0.12, 0.3], er: 10 },
  { id: 'pig', name: '小猪', color: '#F8BBD0', px: 210, file: 'pig-2e857d0f.svg', face: [0.15, 0.35], er: 12 },
  { id: 'fish', name: '小鱼', color: '#4FC3F7', px: 180, file: 'fish-de187ba5.svg', face: [0.2, 0.4], er: 12 },
  { id: 'whale', name: '鲸鱼', color: '#5C6BC0', px: 280, file: 'whale-ce70490a.svg', face: [0.75, 0.45], er: 12 },
  { id: 'dolphin', name: '海豚', color: '#4DD0E1', px: 235, file: 'dolphin-388e792c.svg', face: [0.75, 0.25], er: 11 },
  { id: 'turtle', name: '乌龟', color: '#81C784', px: 220, file: 'turtle-6cebfd77.svg', face: [0.5, 0.12], er: 9 },
  { id: 'frog', name: '青蛙', color: '#9CCC65', px: 200, file: 'frog-43f6f587.svg', face: [0.72, 0.2], er: 10 },
  { id: 'butterfly', name: '蝴蝶', color: '#BA68C8', px: 225, file: 'butterfly-f21829d7.svg', face: [0.5, 0.45], er: 10 },
  { id: 'bird', name: '小鸟', color: '#4DB6AC', px: 170, file: 'bird-3a4cdd72.svg', face: [0.25, 0.15], er: 10 },
  { id: 'owl', name: '猫头鹰', color: '#9575CD', px: 220, file: 'owl-d7d457c1.svg', face: [0.4, 0.15], er: 12 },
  { id: 'penguin', name: '企鹅', color: '#78909C', px: 210, file: 'penguin-f2e02022.svg', face: [0.45, 0.1], er: 10 },
  { id: 'kangaroo', name: '袋鼠', color: '#FF7043', px: 240, file: 'kangaroo-0760b69c.svg', face: [0.85, 0.1], er: 9 },
  { id: 'camel', name: '骆驼', color: '#D9B380', px: 260, file: 'camel-b41ebd3e.svg', face: [0.12, 0.15], er: 9 },
  { id: 'hedgehog', name: '刺猬', color: '#A9927B', px: 190, file: 'hedgehog-baa41c61.svg', face: [0.78, 0.6], er: 8 },
  { id: 'squirrel', name: '小松鼠', color: '#E59866', px: 205, file: 'squirrel-23c700c9.svg', face: [0.72, 0.3], er: 10 },
  { id: 'snail', name: '蜗牛', color: '#AED581', px: 185, file: 'snail-d8f236a7.svg', face: [0.75, 0.45], er: 8 },
  { id: 'crab', name: '螃蟹', color: '#EF5350', px: 225, file: 'crab-7197c71a.svg', face: [0.5, 0.5], er: 13 },
  { id: 'dino', name: '小恐龙', color: '#66BB6A', px: 280, file: 'dino-2003b4f6.svg', face: [0.14, 0.05], er: 6 },
  { id: 'croc', name: '鳄鱼', color: '#26A69A', px: 260, file: 'croc-2fa0c118.svg', face: [0.5, 0.12], er: 7 },
  { id: 'mouse', name: '小老鼠', color: '#F9A825', px: 160, file: 'mouse-36dc0476.svg', face: [0.62, 0.28], er: 9 },
];

// ---------- 几何工具（与 build-provinces.mjs 同实现） ----------

function simplify(pts, tolerance) {
  const sqTol = tolerance * tolerance;
  const sqSegDist = (p, a, b) => {
    let x = a.x;
    let y = a.y;
    let dx = b.x - x;
    let dy = b.y - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b.x;
        y = b.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0;
    let idx = 0;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(pts[i], pts[first], pts[last]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sqTol) {
      keep[idx] = true;
      stack.push([first, idx], [idx, last]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function convexHull(pts) {
  const P = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of P) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function closestOnHull(p, hull) {
  let best = p;
  let bestD = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function bounds(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function centroid(pts) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  a /= 2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Chaikin 切角平滑（闭环，1 轮足以去掉像素锯齿感） */
function chaikin(pts) {
  const next = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    next.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
    next.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
  }
  return next;
}

/** 水平弦扫描：y 处包含 x（可选）的最宽实心段，返回段中点与宽度 */
function chordAt(pts, y, nearX) {
  const xs = [];
  for (let j = 0; j < pts.length; j++) {
    const p = pts[j];
    const q = pts[(j + 1) % pts.length];
    if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) {
      xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
  }
  xs.sort((m, n) => m - n);
  let best = null;
  for (let j = 0; j + 1 < xs.length; j += 2) {
    const w = xs[j + 1] - xs[j];
    const mid = (xs[j] + xs[j + 1]) / 2;
    const contains = nearX === undefined || (nearX >= xs[j] && nearX <= xs[j + 1]);
    if (contains && (!best || w > best.w)) best = { x: mid, w };
  }
  return best;
}

/** y 处距 x 最近的实心段（锚点吸附用） */
function nearestSegmentAt(pts, y, x) {
  const xs = [];
  for (let j = 0; j < pts.length; j++) {
    const p = pts[j];
    const q = pts[(j + 1) % pts.length];
    if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) {
      xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
  }
  xs.sort((m, n) => m - n);
  let best = null;
  for (let j = 0; j + 1 < xs.length; j += 2) {
    const lo = xs[j];
    const hi = xs[j + 1];
    const d = x < lo ? lo - x : x > hi ? x - hi : 0;
    if (!best || d < best.d) best = { lo, hi, w: hi - lo, d };
  }
  return best;
}

/** 无人工锚点时的兜底：靠中上部最宽弦的中点（与省份管线同启发式） */
function faceAnchorAuto(pts) {
  const b = bounds(pts);
  let best = { score: -1, x: 0, y: 0, w: 0 };
  const STEPS = 15;
  for (let i = 1; i < STEPS; i++) {
    const y = b.minY + ((b.maxY - b.minY) * i) / STEPS;
    const c = chordAt(pts, y);
    if (!c) continue;
    const t = i / STEPS;
    const score = c.w * (1 - Math.abs(t - 0.42) * 0.9);
    if (score > best.score) best = { score, x: c.x, y, w: c.w };
  }
  return best;
}

// ---------- 蒙版轮廓追踪 ----------

/** 最大连通域（4 邻接）的 Moore 边界追踪，返回像素坐标闭环 */
function traceLargestContour(mask, w, h) {
  // 连通域标记，取最大
  const label = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let cur = 0;
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i]) continue;
    cur++;
    let size = 0;
    stack.push(i);
    label[i] = cur;
    while (stack.length) {
      const j = stack.pop();
      size++;
      const x = j % w;
      const y = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (mask[n] && !label[n]) {
          label[n] = cur;
          stack.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = cur;
    }
  }
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === bestLabel;

  // 起点：最上一行的最左实心像素
  let sx = -1;
  let sy = -1;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) {
        sx = x;
        sy = y;
        break outer;
      }
    }
  }
  if (sx < 0) throw new Error('空蒙版');

  // Moore 邻域顺时针（从左邻开始查找）
  const DIRS = [
    [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1],
  ];
  const contour = [];
  let px = sx;
  let py = sy;
  let backtrack = 0; // 起点来自左方
  const maxSteps = w * h;
  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x: px, y: py });
    let found = -1;
    for (let k = 0; k < 8; k++) {
      const d = (backtrack + k) % 8;
      const nx = px + DIRS[d][0];
      const ny = py + DIRS[d][1];
      if (solid(nx, ny)) {
        found = d;
        px = nx;
        py = ny;
        break;
      }
    }
    if (found < 0) break; // 孤立像素
    backtrack = (found + 5) % 8; // 新的回溯方向：来向的后一位
    if (px === sx && py === sy && contour.length > 2) break;
  }
  return contour;
}

// ---------- 主流程 ----------


const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage();
await page.setContent(`<canvas id="c" width="${RASTER}" height="${RASTER}"></canvas>`);

const problems = [];
const out = [];
for (const a of LIST) {
  const svgPath = path.join(ROOT, 'tools/phylopic-svg', a.file);
  const svgText = fs.readFileSync(svgPath, 'utf8');
  const maskStr = await page.evaluate(
    async ({ svg, size }) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      await new Promise((ok, err) => {
        img.onload = ok;
        img.onerror = err;
        img.src = url;
      });
      const c = document.getElementById('c');
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, size, size);
      // 保持纵横比（PhyloPic 素材非正方形，拉伸会变形）；剪影原样使用，不做任何外形加工
      const k = size / Math.max(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0, img.naturalWidth * k, img.naturalHeight * k);
      const d = ctx.getImageData(0, 0, size, size).data;
      const arr = new Uint8Array(size * size);
      for (let i = 0; i < size * size; i++) arr[i] = d[i * 4 + 3] > 25 ? 1 : 0;
      let s = '';
      for (let i = 0; i < arr.length; i += 4096)
        s += String.fromCharCode(...arr.subarray(i, i + 4096));
      return btoa(s);
    },
    { svg: svgText, size: RASTER }
  );
  const mask = Uint8Array.from(Buffer.from(maskStr, 'base64'));

  let ring = traceLargestContour(mask, RASTER, RASTER);
  ring = simplify(ring, SIMPLIFY_RAW);
  ring = chaikin(ring);
  ring = simplify(ring, 0.8);

  const b0 = bounds(ring);
  const maxDim = Math.max(b0.maxX - b0.minX, b0.maxY - b0.minY);
  const s = a.px / maxDim;
  const scaled = ring.map((p) => ({ x: p.x * s, y: p.y * s }));
  let verts = simplify(scaled, 1.2);
  if (verts.length < 12) verts = scaled;
  const c = centroid(verts);
  verts = verts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const b = bounds(verts);

  let phys = simplify(scaled, PHYS_TOLERANCE_PX).map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const hull = convexHull(phys);
  phys = phys.map((p) => {
    const q = closestOnHull(p, hull);
    return { x: p.x + (q.x - p.x) * HULL_BLEND, y: p.y + (q.y - p.y) * HULL_BLEND };
  });
  // 底部压平：最低点向上 12% 高度内的点全部压到最低水平——写实动物的细腿/圆肚
  // 落地会跷跷板摇晃甚至滚落，给一个隐形平底座（物理轮廓不可见，视觉不变）
  const pb = bounds(phys);
  const flatZone = (pb.maxY - pb.minY) * 0.12;
  phys = phys.map((p) => (p.y > pb.maxY - flatZone ? { x: p.x, y: pb.maxY } : p));
  phys = simplify(phys, 1.5);

  // 表情锚点：人工比例坐标优先（不在轮廓内时吸附到同高度最近的实心段），弦扫描兜底
  let fx;
  let fy;
  if (a.face) {
    fx = b.minX + (b.maxX - b.minX) * a.face[0];
    fy = b.minY + (b.maxY - b.minY) * a.face[1];
    if (!chordAt(verts, fy, fx)) {
      const seg = nearestSegmentAt(verts, fy, fx);
      if (!seg) {
        problems.push(`${a.name}: 表情锚点高度处没有实心段`);
      } else {
        const inset = Math.min(seg.w * 0.3, 8);
        fx = Math.max(seg.lo + inset, Math.min(seg.hi - inset, fx));
        console.log(`  ⚠ ${a.name}: 锚点吸附到轮廓内 x=${fx.toFixed(1)}`);
      }
    }
  } else {
    const auto = faceAnchorAuto(verts);
    fx = auto.x;
    fy = auto.y;
  }
  // er 指定时为最终像素的眼睛半径（头小的动物手工给小值）；缺省按弦宽自适应
  const chord = chordAt(verts, fy, fx) ?? { w: (b.maxX - b.minX) * 0.4 };
  const eyeR = a.er ?? Math.min(18, Math.max(6.5, chord.w * 0.1));

  console.log(
    `${a.name}: 视觉 ${verts.length} 顶点 / 物理 ${phys.length} 顶点, ${Math.round(
      b.maxX - b.minX
    )}x${Math.round(b.maxY - b.minY)}px${a.face ? '' : '（表情锚点自动）'}`
  );
  out.push({
    ...(a.patch ? { patch: true } : {}),
    adcode: `a-${a.id}`,
    name: a.name,
    display: a.name,
    short: a.name[a.name.length - 1],
    color: a.color,
    verts: verts.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    phys: phys.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
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
const big = out.filter((p) => Math.max(p.size[0], p.size[1]) >= 170).length;
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\n✅ 写入 ${OUT}（${out.length} 个动物，大块 ${big} 个 / 小块 ${out.length - big} 个）`);
