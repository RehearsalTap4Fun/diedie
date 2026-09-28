// 形状几何工具：轮廓简化/平滑/凸包/自交修复/连通域/轮廓追踪/开运算（动物与汉字管线共用）

export function simplify(pts, tolerance) {
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

export function convexHull(pts) {
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

export function closestOnHull(p, hull) {
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

/** 线段 ab 与 cd 严格相交（不含共端点） */
export function segCross(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

export function firstCrossing(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return [i, j];
    }
  // 「碰触」：某个顶点落在不相邻的边上（不严格相交，但多边形已不简单，poly-decomp 会切坏——
  // 「门」的钩被找平裁短后折回点正好落在底边上，凸分解只剩 28% 面积）
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++) {
      if (j === k || (j + 1) % n === k) continue;
      if (distToSeg(pts[k], pts[j], pts[(j + 1) % n]) < 0.5) return [(k - 1 + n) % n, j];
    }
  return null;
}

function distToSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 去掉自交：每次删掉交叉边上的一个端点（优先删掉后面积变化最小的），直到是简单多边形 */
export function untangle(pts, name) {
  let cur = pts.slice();
  for (let guard = 0; guard < 20; guard++) {
    const hit = firstCrossing(cur);
    if (!hit) return cur;
    const n = cur.length;
    const cands = [hit[0], (hit[0] + 1) % n, hit[1], (hit[1] + 1) % n];
    let best = null;
    for (const k of cands) {
      const next = cur.filter((_, i) => i !== k);
      const score = (firstCrossing(next) ? 1e9 : 0) + Math.abs(Math.abs(area(next)) - Math.abs(area(cur)));
      if (!best || score < best.score) best = { next, score };
    }
    cur = best.next;
  }
  throw new Error(`${name}: 物理轮廓自交无法修复`);
}

export function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function bounds(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function centroid(pts) {
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
export function chaikin(pts) {
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
export function chordAt(pts, y, nearX) {
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
export function nearestSegmentAt(pts, y, x) {
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
export function faceAnchorAuto(pts) {
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

/** 最大连通域（4 邻接）的 Moore 边界追踪，返回像素坐标闭环 */
/** 4 邻域连通域标记：返回 label（0 = 背景）与各连通域像素数 sizes[id] */
export function labelComponents(mask, w, h) {
  const label = new Int32Array(w * h);
  const sizes = [0];
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
    sizes.push(size);
  }
  return { label, sizes };
}

export function traceLargestContour(mask, w, h) {
  const { label, sizes } = labelComponents(mask, w, h);
  let bestLabel = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > (sizes[bestLabel] ?? 0)) bestLabel = k;
  return traceLabel(label, w, h, bestLabel);
}

/** Moore 邻域追踪指定连通域的外轮廓 */
export function traceLabel(label, w, h, bestLabel) {
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

/** 二值开运算：先腐蚀 r 次再膨胀 r 次（3x3），去掉宽度 < 2r 的细线（原图描边），保留大块花纹 */
export function openMask(mask, w, h, r) {
  const step = (src, keep) => {
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let all = true;
        let any = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const v = nx >= 0 && ny >= 0 && nx < w && ny < h ? src[ny * w + nx] : 0;
            all &&= !!v;
            any ||= !!v;
          }
        dst[y * w + x] = (keep ? all : any) ? 1 : 0;
      }
    return dst;
  };
  let m = mask;
  for (let i = 0; i < r; i++) m = step(m, true);
  for (let i = 0; i < r; i++) m = step(m, false);
  return m;
}

/**
 * 清理多边形：去掉几乎重合的相邻点、共线点和「折返」尖刺（前后两条边反向共线）。
 * 底部压平会把几个点压到同一水平线上，可能造出零面积的折返边——poly-decomp 遇到会
 * 「quickDecomp: max level reached」然后 Matter 返回空刚体（曾导致「竹」一落下就消失）。
 */
export function cleanRing(pts, eps = 1) {
  let r = pts.slice();
  let changed = true;
  while (changed && r.length > 3) {
    changed = false;
    for (let i = 0; i < r.length && r.length > 3; i++) {
      const a = r[(i - 1 + r.length) % r.length];
      const b = r[i];
      const c = r[(i + 1) % r.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const bcx = c.x - b.x;
      const bcy = c.y - b.y;
      const cross = abx * bcy - aby * bcx;
      const tooClose = Math.hypot(abx, aby) < eps;
      // 与 a→c 的距离很小即视为共线（含折返：a→b→c 反向）
      const lenAC = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      const collinear = Math.abs(cross) / lenAC < eps * 0.5;
      if (tooClose || collinear) {
        r.splice(i, 1);
        changed = true;
        i--;
      }
    }
  }
  return r;
}
