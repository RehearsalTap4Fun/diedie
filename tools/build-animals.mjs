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
import {
  simplify,
  convexHull,
  closestOnHull,
  segCross,
  firstCrossing,
  untangle,
  area,
  bounds,
  centroid,
  chaikin,
  chordAt,
  nearestSegmentAt,
  faceAnchorAuto,
  labelComponents,
  traceLargestContour,
  traceLabel,
  openMask,
} from './shape-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/animals.json');

const RASTER = 640; // 光栅化分辨率（写实剪影细节多，高一些保真）
const SIMPLIFY_RAW = 1.4; // 追踪结果先简化（640 空间像素，容差小保细节）
// 物理轮廓贴合视觉（2026-09-26 用户反馈企鹅等「碰撞边缘和视觉边缘差很多」）：
// 原 10px 粗简化 + 凸包收拢 25% 会给写实剪影造出 10%-28% 面积的隐形空气墙，已取消收拢、容差收到 3px
const PHYS_TOLERANCE_PX = 3;
const HULL_BLEND = 0;
/** 底部压平带（占物理轮廓高度比例）：只把脚底/肚底垫平防跷跷板，不再大面积填腿间空隙 */
const FLAT_ZONE = 0.04;

// face: 表情锚点在包围盒内的比例坐标 [fx, fy]（0-1，缺省用弦扫描启发式，
// 对照表确认眼睛落在头部后逐个覆盖）；px: 目标最大边长（对标省份 130-300 分布）
const LIST = [
  { id: 'cat', name: '小猫', color: '#FF8A65', px: 200, file: 'cat-81e1f778.svg', face: [0.84, 0.38], er: 12 },
  { id: 'dog', name: '小狗', color: '#BCAAA4', px: 210, file: 'dog-d3e8133c.svg', face: [0.68, 0.14], er: 12 },
  { id: 'rabbit', name: '兔子', color: '#F48FB1', px: 200, file: 'rabbit-d71fcd12.svg', face: [0.3, 0.4], er: 12 },
  // 大熊猫：PhyloPic 仅 4 张且都难认，改用 FreeSVG 正面坐姿卡通（CC0），黑白花纹由 pattern 提取
  { id: 'panda', name: '大熊猫', color: '#FFF8EC', px: 245, file: 'panda-freesvg-pnda.svg', face: [0.5, 0.25], er: 12, patch: true, pattern: {} },
  { id: 'tiger', name: '老虎', color: '#FFA726', px: 250, file: 'tiger-a02b9a9a.svg', face: [0.13, 0.3], er: 12 },
  { id: 'lion', name: '狮子', color: '#FFCA28', px: 250, file: 'lion-78dbe564.svg', face: [0.14, 0.22], er: 11 },
  { id: 'elephant', name: '大象', color: '#9FA8DA', px: 265, file: 'elephant-910d853a.svg', face: [0.25, 0.3], er: 14 },
  { id: 'giraffe', name: '长颈鹿', color: '#FFB74D', px: 285, file: 'giraffe-b35f867d.svg', face: [0.15, 0.06], er: 8 },
  { id: 'monkey', name: '小猴子', color: '#A1887F', px: 215, file: 'monkey-4e9c5666.svg', face: [0.93, 0.25], er: 6 },
  { id: 'chick', name: '公鸡', color: '#FFEE58', px: 185, file: 'chick-2de1c95c.svg', face: [0.2, 0.15], er: 10 },
  { id: 'duck', name: '鸭子', color: '#FFD54F', px: 190, file: 'duck-97f833ff.svg', face: [0.2, 0.25], er: 10 },
  { id: 'goose', name: '大白鹅', color: '#81D4FA', px: 230, file: 'goose-9e1e3fd7.svg', face: [0.2, 0.1], er: 8 },
  { id: 'cow', name: '奶牛', color: '#CE93D8', px: 250, file: 'cow-dc5c561e.svg', face: [0.1, 0.25], er: 10 },
  { id: 'horse', name: '小马', color: '#8D6E63', px: 255, file: 'horse-85d95128.svg', face: [0.15, 0.15], er: 10 },
  { id: 'sheep', name: '绵羊', color: '#DCE775', px: 215, file: 'sheep-d9c0cddb.svg', face: [0.86, 0.22], er: 10 },
  { id: 'pig', name: '小猪', color: '#F8BBD0', px: 210, file: 'pig-2e857d0f.svg', face: [0.8, 0.3], er: 11 },
  { id: 'fish', name: '小鱼', color: '#4FC3F7', px: 180, file: 'fish-de187ba5.svg', face: [0.2, 0.4], er: 12 },
  { id: 'whale', name: '鲸鱼', color: '#5C6BC0', px: 280, file: 'whale-ce70490a.svg', face: [0.75, 0.45], er: 12 },
  { id: 'dolphin', name: '海豚', color: '#4DD0E1', px: 235, file: 'dolphin-388e792c.svg', face: [0.2, 0.3], er: 11 },
  { id: 'turtle', name: '乌龟', color: '#81C784', px: 220, file: 'turtle-6cebfd77.svg', face: [0.5, 0.12], er: 9 },
  { id: 'frog', name: '青蛙', color: '#9CCC65', px: 200, file: 'frog-43f6f587.svg', face: [0.72, 0.2], er: 10 },
  { id: 'butterfly', name: '蝴蝶', color: '#BA68C8', px: 225, file: 'butterfly-f21829d7.svg', face: [0.5, 0.45], er: 10 },
  { id: 'bird', name: '小鸟', color: '#4DB6AC', px: 170, file: 'bird-3a4cdd72.svg', face: [0.25, 0.15], er: 10 },
  { id: 'owl', name: '猫头鹰', color: '#9575CD', px: 220, file: 'owl-d7d457c1.svg', face: [0.4, 0.15], er: 12 },
  { id: 'penguin', name: '企鹅', color: '#78909C', px: 210, file: 'penguin-f2e02022.svg', face: [0.45, 0.1], er: 10 },
  { id: 'kangaroo', name: '袋鼠', color: '#FF7043', px: 240, file: 'kangaroo-0760b69c.svg', face: [0.85, 0.1], er: 9 },
  { id: 'camel', name: '骆驼', color: '#D9B380', px: 260, file: 'camel-b41ebd3e.svg', face: [0.12, 0.15], er: 9 },
  { id: 'hedgehog', name: '刺猬', color: '#A9927B', px: 190, file: 'hedgehog-baa41c61.svg', face: [0.13, 0.6], er: 8 },
  { id: 'squirrel', name: '小松鼠', color: '#E59866', px: 205, file: 'squirrel-23c700c9.svg', face: [0.72, 0.3], er: 10 },
  { id: 'snail', name: '蜗牛', color: '#AED581', px: 185, file: 'snail-d8f236a7.svg', face: [0.88, 0.66], er: 8 },
  { id: 'crab', name: '螃蟹', color: '#EF5350', px: 225, file: 'crab-422060a1.svg', face: [0.5, 0.55], er: 13 },
  { id: 'dino', name: '小恐龙', color: '#66BB6A', px: 280, file: 'dino-2003b4f6.svg', face: [0.14, 0.05], er: 6 },
  { id: 'croc', name: '鳄鱼', color: '#26A69A', px: 260, file: 'croc-2fa0c118.svg', face: [0.5, 0.12], er: 7 },
  { id: 'mouse', name: '小老鼠', color: '#F9A825', px: 160, file: 'mouse-36dc0476.svg', face: [0.77, 0.33], er: 9 },
];

// ---------- 几何工具（与 build-provinces.mjs 同实现） ----------

// ---------- 蒙版轮廓追踪 ----------

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
      // 0 = 透明，1 = 浅色实心，2 = 深色实心（黑白花纹素材用来提取花纹）
      const arr = new Uint8Array(size * size);
      for (let i = 0; i < size * size; i++) {
        if (d[i * 4 + 3] <= 25) continue;
        const lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        arr[i] = lum < 100 ? 2 : 1;
      }
      let s = '';
      for (let i = 0; i < arr.length; i += 4096)
        s += String.fromCharCode(...arr.subarray(i, i + 4096));
      return btoa(s);
    },
    { svg: svgText, size: RASTER }
  );
  const raw = Uint8Array.from(Buffer.from(maskStr, 'base64'));
  const mask = raw.map((v) => (v ? 1 : 0));

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

  // 黑白花纹（大熊猫）：素材里的深色大块（耳朵/眼圈/四肢/肩带）在同一坐标系画成深色层，
  // 外形不变只上色，与表情同属「加工」；原图细描边由开运算去掉
  let pattern;
  if (a.pattern) {
    const dark = openMask(raw.map((v) => (v === 2 ? 1 : 0)), RASTER, RASTER, a.pattern.open ?? 3);
    const { label, sizes } = labelComponents(dark, RASTER, RASTER);
    const minArea = RASTER * RASTER * (a.pattern.minArea ?? 0.0015);
    pattern = [];
    for (let k = 1; k < sizes.length; k++) {
      if (sizes[k] < minArea) continue;
      let pr = traceLabel(label, RASTER, RASTER, k);
      pr = chaikin(simplify(pr, SIMPLIFY_RAW));
      pr = simplify(
        pr.map((p) => ({ x: p.x * s - c.x, y: p.y * s - c.y })),
        1.0
      );
      if (pr.length >= 3) pattern.push(pr);
    }
  }

  let phys = simplify(scaled, PHYS_TOLERANCE_PX).map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const hull = convexHull(phys);
  phys = phys.map((p) => {
    const q = closestOnHull(p, hull);
    return { x: p.x + (q.x - p.x) * HULL_BLEND, y: p.y + (q.y - p.y) * HULL_BLEND };
  });
  // 底部压平：最低点向上 12% 高度内的点全部压到最低水平——写实动物的细腿/圆肚
  // 落地会跷跷板摇晃甚至滚落，给一个隐形平底座（物理轮廓不可见，视觉不变）
  const pb = bounds(phys);
  const flatZone = (pb.maxY - pb.minY) * FLAT_ZONE;
  phys = phys.map((p) => (p.y > pb.maxY - flatZone ? { x: p.x, y: pb.maxY } : p));
  phys = simplify(phys, 1.5);
  // 压平会把相邻点挤到同一水平线上，可能造出自交（奶牛曾因此凸分解失败、刚体退化成小三角形卡死）
  phys = untangle(phys, a.name);

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
  // 素材自带的眼圈与表情系统的眼距对不上：去掉表情附近的花纹块，眼圈交给 drawFace 的 patch 画
  if (pattern) {
    const before = pattern.length;
    pattern = pattern.filter((ring) => {
      const cc = centroid(ring);
      return Math.hypot(cc.x - fx, cc.y - fy) > eyeR * 3.2;
    });
    console.log(`  ${a.name}: 花纹 ${pattern.length} 块（去掉表情处 ${before - pattern.length} 块）`);
  }

  console.log(
    `${a.name}: 视觉 ${verts.length} 顶点 / 物理 ${phys.length} 顶点, ${Math.round(
      b.maxX - b.minX
    )}x${Math.round(b.maxY - b.minY)}px${a.face ? '' : '（表情锚点自动）'}`
  );
  out.push({
    ...(a.patch ? { patch: true } : {}),
    ...(pattern ? { pattern: pattern.map((r) => r.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10])) } : {}),
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
