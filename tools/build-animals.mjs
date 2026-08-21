// 动物轮廓数据管线（叠动物模式）：手工控制点 → Chaikin 平滑 → 缩放 →
// 质心归一 → 物理轮廓（重简化+凸包收拢，与省份管线同参数）→ src/data/animals.json
// 产出 schema 与 provinces.json 完全一致，游戏代码按 Province 接口通用处理。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANIMAL_SHAPES } from './animal-shapes.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/animals.json');

const SIMPLIFY_TOLERANCE_PX = 2.5;
const PHYS_TOLERANCE_PX = 10;
const HULL_BLEND = 0.25;

// ---------- 几何工具（与 build-provinces.mjs 同实现，工具脚本各自独立） ----------

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

function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Chaikin 切角平滑：闭环，第三元素为 1 的点保留尖角不切 */
function chaikin(pts, iterations) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next = [];
    const n = cur.length;
    for (let i = 0; i < n; i++) {
      const p = cur[i];
      const q = cur[(i + 1) % n];
      if (p[2]) next.push([p[0], p[1], 1]);
      if (!p[2] && !q[2]) {
        next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
        next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
      } else if (p[2] && !q[2]) {
        next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
      } else if (!p[2] && q[2]) {
        next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      }
    }
    cur = next;
  }
  return cur;
}

// ---------- 生成 ----------

const problems = [];
const out = ANIMAL_SHAPES.map((a) => {
  const smooth = chaikin(a.pts, 2).map(([x, y]) => ({ x, y }));
  const b0 = bounds(smooth);
  const maxDim = Math.max(b0.maxX - b0.minX, b0.maxY - b0.minY);
  const s = a.px / maxDim;
  const scaled = smooth.map((p) => ({ x: p.x * s, y: p.y * s }));

  let ring = simplify(scaled, SIMPLIFY_TOLERANCE_PX);
  if (ring.length < 8) ring = scaled;
  const c = centroid(ring);
  ring = ring.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const b = bounds(ring);

  let phys = simplify(scaled, PHYS_TOLERANCE_PX).map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const hull = convexHull(phys);
  phys = phys.map((p) => {
    const q = closestOnHull(p, hull);
    return { x: p.x + (q.x - p.x) * HULL_BLEND, y: p.y + (q.y - p.y) * HULL_BLEND };
  });
  phys = simplify(phys, 1.5);

  // 表情锚点：设计空间 → 缩放 → 质心系；必须落在轮廓内部
  const face = { x: a.face[0] * s - c.x, y: a.face[1] * s - c.y };
  if (!pointInPolygon(face, ring)) problems.push(`${a.name}: 表情锚点不在轮廓内`);
  const eyeR = Math.min(20, Math.max(6, (a.er ?? 7) * s));

  console.log(
    `${a.name}: 视觉 ${ring.length} 顶点 / 物理 ${phys.length} 顶点, ${Math.round(
      b.maxX - b.minX
    )}x${Math.round(b.maxY - b.minY)}px`
  );
  return {
    adcode: `a-${a.id}`,
    name: a.name,
    display: a.name,
    short: a.name[a.name.length - 1],
    color: a.color,
    verts: ring.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    phys: phys.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    face: [Math.round(face.x * 10) / 10, Math.round(face.y * 10) / 10],
    eyeR: Math.round(eyeR * 10) / 10,
    size: [Math.round(b.maxX - b.minX), Math.round(b.maxY - b.minY)],
  };
});

if (problems.length) {
  console.error('\n❌ 数据问题：\n' + problems.join('\n'));
  process.exit(1);
}
const big = out.filter((p) => Math.max(p.size[0], p.size[1]) >= 170).length;
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\n✅ 写入 ${OUT}（${out.length} 个动物，大块 ${big} 个 / 小块 ${out.length - big} 个）`);
