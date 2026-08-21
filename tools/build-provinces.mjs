// 省份轮廓数据管线（M0：10 个省）
// 数据源：阿里 DataV·GeoAtlas（基于标准地图改绘），拉取 → 投影 → 简化 → 归一化 → 表情锚点 → JSON
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Douglas-Peucker 简化（highQuality 等价实现，零依赖）
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

const SRC = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/provinces.json');

// M1：全部 34 个省级行政区（23 省 + 5 自治区 + 4 直辖市 + 2 特别行政区）
const PICKS = {
  110000: { short: '京', color: '#EF5350' },
  120000: { short: '津', color: '#F06292' },
  130000: { short: '冀', color: '#BA68C8' },
  140000: { short: '晋', color: '#FF8A65' },
  150000: { short: '蒙', color: '#4DB6AC' },
  210000: { short: '辽', color: '#7986CB' },
  220000: { short: '吉', color: '#4FC3F7' },
  230000: { short: '黑', color: '#AB47BC' },
  310000: { short: '沪', color: '#FF80AB' },
  320000: { short: '苏', color: '#81C784' },
  330000: { short: '浙', color: '#4DD0E1' },
  340000: { short: '皖', color: '#AED581' },
  350000: { short: '闽', color: '#FFB74D' },
  360000: { short: '赣', color: '#9CCC65' },
  370000: { short: '鲁', color: '#42A5F5' },
  410000: { short: '豫', color: '#FFA726' },
  420000: { short: '鄂', color: '#5C6BC0' },
  430000: { short: '湘', color: '#E57373' },
  440000: { short: '粤', color: '#FF7043' },
  450000: { short: '桂', color: '#26A69A' },
  460000: { short: '琼', color: '#009688' },
  500000: { short: '渝', color: '#FF6E40' },
  510000: { short: '川', color: '#66BB6A' },
  520000: { short: '黔', color: '#7CB342' },
  530000: { short: '滇', color: '#26C6DA' },
  540000: { short: '藏', color: '#7E57C2' },
  610000: { short: '陕', color: '#FFCA28' },
  620000: { short: '甘', color: '#EC407A' },
  630000: { short: '青', color: '#29B6F6' },
  640000: { short: '宁', color: '#9575CD' },
  650000: { short: '新', color: '#C0CA33' },
  710000: { short: '台', color: '#039BE5' },
  810000: { short: '港', color: '#FFB300' },
  820000: { short: '澳', color: '#A1887F' },
};

const SIMPLIFY_TOLERANCE_PX = 4;
const PHYS_TOLERANCE_PX = 10; // 物理轮廓重度简化，磨掉锯齿
const HULL_BLEND = 0.25; // 物理轮廓向凸包收拢的比例，削平深凹陷
const BASE_PX = 200; // 中位尺寸省份的目标最大边长
const MIN_PX = 160; // 小省放大下限（澳门/香港/台湾等，太小落不稳也够不到高度）
const MAX_PX = 300;

// Andrew 单调链凸包
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

function shoelace(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

// 取面积最大的外环（去掉飞地和岛屿，物理块用主体轮廓）
function mainRing(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let best = null;
  let bestArea = -1;
  for (const poly of polys) {
    const outer = poly[0];
    const a = Math.abs(shoelace(outer));
    if (a > bestArea) {
      bestArea = a;
      best = outer;
    }
  }
  return best;
}

// 局部等距圆柱投影，输出以 km 为单位的平面坐标（y 向下）
function project(ring) {
  const cLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const k = Math.cos((cLat * Math.PI) / 180) * 111;
  return ring.map(([lon, lat]) => ({ x: lon * k, y: -lat * 111 }));
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

// 表情锚点：扫描横向弦，选靠中上部且最宽的一段的中点，保证眼睛落在轮廓内部
function faceAnchor(pts) {
  const b = bounds(pts);
  let best = { score: -1, x: 0, y: 0, w: 0 };
  const STEPS = 15;
  for (let i = 1; i < STEPS; i++) {
    const y = b.minY + ((b.maxY - b.minY) * i) / STEPS;
    const xs = [];
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j];
      const q = pts[(j + 1) % pts.length];
      if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) {
        xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
      }
    }
    xs.sort((m, n) => m - n);
    for (let j = 0; j + 1 < xs.length; j += 2) {
      const w = xs[j + 1] - xs[j];
      const t = i / STEPS;
      const score = w * (1 - Math.abs(t - 0.42) * 0.9);
      if (score > best.score) {
        best = { score, x: (xs[j] + xs[j + 1]) / 2, y, w };
      }
    }
  }
  return { x: best.x, y: best.y, eyeR: Math.min(20, Math.max(9, best.w * 0.085)) };
}

console.log('拉取 DataV GeoAtlas 全国省级边界...');
const res = await fetch(SRC);
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const geo = await res.json();

const picked = geo.features.filter((f) => PICKS[String(f.properties.adcode)]);
if (picked.length !== Object.keys(PICKS).length) {
  throw new Error(`期望 ${Object.keys(PICKS).length} 个省，实际匹配 ${picked.length} 个`);
}

// 第一遍：算出各省真实尺寸，用中位数做基准，开方压缩省份间的大小差距
const prepared = picked.map((f) => {
  const pts = project(mainRing(f.geometry));
  const b = bounds(pts);
  return { f, pts, maxDim: Math.max(b.maxX - b.minX, b.maxY - b.minY) };
});
const dims = prepared.map((p) => p.maxDim).sort((a, b) => a - b);
const median = dims[Math.floor(dims.length / 2)];

const out = prepared.map(({ f, pts, maxDim }) => {
  const adcode = String(f.properties.adcode);
  const name = f.properties.name;
  const targetPx = Math.min(MAX_PX, Math.max(MIN_PX, BASE_PX * Math.sqrt(maxDim / median)));
  const s = targetPx / maxDim;
  let scaled = pts.map((p) => ({ x: p.x * s, y: p.y * s }));
  // GeoJSON 环首尾重复，去掉尾点再简化
  const first = scaled[0];
  const last = scaled[scaled.length - 1];
  if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) scaled.pop();
  let ring = simplify(scaled, SIMPLIFY_TOLERANCE_PX);
  if (ring.length < 8) ring = simplify(scaled, SIMPLIFY_TOLERANCE_PX / 2);

  const c = centroid(ring);
  ring = ring.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const b = bounds(ring);
  const face = faceAnchor(ring);

  // 物理轮廓：与视觉轮廓同一坐标系，重度简化 + 向凸包收拢，堆叠时不被锯齿卡住
  let phys = simplify(scaled, PHYS_TOLERANCE_PX).map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const hull = convexHull(phys);
  phys = phys.map((p) => {
    const q = closestOnHull(p, hull);
    return { x: p.x + (q.x - p.x) * HULL_BLEND, y: p.y + (q.y - p.y) * HULL_BLEND };
  });
  phys = simplify(phys, 1.5);

  console.log(
    `${name}: 视觉 ${ring.length} 顶点 / 物理 ${phys.length} 顶点, ${Math.round(
      b.maxX - b.minX
    )}x${Math.round(b.maxY - b.minY)}px`
  );
  return {
    adcode,
    name,
    display: name.replace(/(省|市|维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区)$/u, ''),
    short: PICKS[adcode].short,
    color: PICKS[adcode].color,
    verts: ring.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    phys: phys.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    face: [Math.round(face.x * 10) / 10, Math.round(face.y * 10) / 10],
    eyeR: Math.round(face.eyeR * 10) / 10,
    size: [Math.round(b.maxX - b.minX), Math.round(b.maxY - b.minY)],
  };
});

fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\n✅ 写入 ${OUT}（${out.length} 个省份）`);

// ---------- 全国地图数据（点亮地图页用，统一投影拼合） ----------
const MAP_W = 640;
const MAP_OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/chinamap.json');
const K = Math.cos((35 * Math.PI) / 180) * 111;
const proj = ([lon, lat]) => ({ x: lon * K, y: -lat * 111 });

const rawRings = {};
let allPts = [];
for (const f of picked) {
  const ring = mainRing(f.geometry).map(proj);
  rawRings[String(f.properties.adcode)] = ring;
  allPts = allPts.concat(ring);
}
const gb = bounds(allPts);
const ms = MAP_W / (gb.maxX - gb.minX);
const mapH = Math.round((gb.maxY - gb.minY) * ms);

const mapProvinces = {};
for (const [adcode, ring] of Object.entries(rawRings)) {
  let pts = ring.map((p) => ({ x: (p.x - gb.minX) * ms, y: (p.y - gb.minY) * ms }));
  if (
    Math.abs(pts[0].x - pts[pts.length - 1].x) < 1e-6 &&
    Math.abs(pts[0].y - pts[pts.length - 1].y) < 1e-6
  )
    pts.pop();
  let simplified = simplify(pts, 1.2);
  if (simplified.length < 6) simplified = pts;
  const c = centroid(simplified);
  mapProvinces[adcode] = {
    pts: simplified.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    c: [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10],
  };
}

// 南海诸岛/九段线附框：取 GeoJSON 中非行政区的线要素（DataV 的 100000_JD）
function extractLines(geom) {
  if (!geom) return [];
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
}
const extraFeatures = geo.features.filter((f) => !PICKS[String(f.properties.adcode)]);
const REGION = { lonMin: 104, lonMax: 126, latMin: -2, latMax: 27 };
let insetLines = [];
for (const f of extraFeatures) {
  for (const line of extractLines(f.geometry)) {
    const inRegion = line.filter(
      ([lon, lat]) =>
        lon >= REGION.lonMin && lon <= REGION.lonMax && lat >= REGION.latMin && lat <= REGION.latMax
    );
    if (inRegion.length >= 2) insetLines.push(inRegion.map(proj));
  }
}
const INSET_W = 160;
const INSET_H = 200;
let inset = { w: INSET_W, h: INSET_H, lines: [] };
if (insetLines.length) {
  const ib = bounds(insetLines.flat());
  const is = Math.min(INSET_W / (ib.maxX - ib.minX), INSET_H / (ib.maxY - ib.minY)) * 0.88;
  const offX = (INSET_W - (ib.maxX - ib.minX) * is) / 2;
  const offY = (INSET_H - (ib.maxY - ib.minY) * is) / 2;
  inset.lines = insetLines.map((line) =>
    line.map((p) => [
      Math.round((offX + (p.x - ib.minX) * is) * 10) / 10,
      Math.round((offY + (p.y - ib.minY) * is) * 10) / 10,
    ])
  );
  console.log(`南海诸岛附框：${inset.lines.length} 条线要素`);
} else {
  console.warn('⚠️ 未找到九段线要素，附框将为空——公开发布前必须补齐');
}

fs.writeFileSync(MAP_OUT, JSON.stringify({ w: MAP_W, h: mapH, provinces: mapProvinces, inset }));
console.log(`✅ 写入 ${MAP_OUT}（${MAP_W}x${mapH}）`);
