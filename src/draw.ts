import Phaser from 'phaser';
import type { Province } from './types';

export const FONT = '"PingFang SC", "Microsoft YaHei", -apple-system, sans-serif';

/** 把省份画成拟人化色块：轮廓填色 + 描边 + 大眼睛 + 微笑 */
export function drawProvince(
  g: Phaser.GameObjects.Graphics,
  p: Province,
  scale = 1,
  withFace = true
) {
  const base = Phaser.Display.Color.HexStringToColor(p.color);
  const fill = base.color;
  // 大熊猫：暖白身体 + 近黑描边（身份在黑白对比；浅灰描边会像图鉴里「未收集」的灰剪影）
  const dark = p.patch ? 0x3a3a3a : base.clone().darken(22).color;
  const pts = p.verts.map(([x, y]) => new Phaser.Geom.Point(x * scale, y * scale));

  if (p.parts) {
    // 汉字：逐个笔画块填充（洞已用零宽缝接进外圈），再分别描外圈与洞
    drawParts(g, p, scale, fill, dark, Math.max(2, 5 * scale));
    if (withFace) drawFace(g, p, scale, 'normal');
    return;
  }

  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  if (p.pattern) {
    g.fillStyle(0x2f2f2f, 1);
    for (const ring of p.pattern)
      g.fillPoints(ring.map(([x, y]) => new Phaser.Geom.Point(x * scale, y * scale)), true);
  }
  g.lineStyle(Math.max(2, 5 * scale), dark, 1);
  g.strokePoints(pts, true, true);

  if (!withFace) return;
  drawFace(g, p, scale, 'normal');
}

const toPts = (ring: [number, number][], scale: number) =>
  ring.map(([x, y]) => new Phaser.Geom.Point(x * scale, y * scale));

function drawParts(
  g: Phaser.GameObjects.Graphics,
  p: Province,
  scale: number,
  fill: number,
  stroke: number,
  lw: number
) {
  g.fillStyle(fill, 1);
  for (const part of p.parts!) g.fillPoints(toPts(part.fill, scale), true);
  g.lineStyle(lw, stroke, 1);
  for (const part of p.parts!) for (const r of part.rings) g.strokePoints(toPts(r, scale), true, true);
}

/** 置灰剪影（图鉴未收集格）：与 drawProvince 同形状、单色、无表情 */
export function drawSilhouette(
  g: Phaser.GameObjects.Graphics,
  p: Province,
  scale: number,
  fill = 0xc3ccd3,
  stroke = 0xa4b0b9
) {
  if (p.parts) {
    drawParts(g, p, scale, fill, stroke, 2);
    return;
  }
  const pts = toPts(p.verts, scale);
  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  g.lineStyle(2, stroke, 1);
  g.strokePoints(pts, true, true);
}

export type FaceMood = 'normal' | 'blink' | 'wow' | 'squint';
export interface Gaze {
  x: number;
  y: number;
}

/** 表情绘制（与省块同一质心坐标系），供静态省块和动态表情组件共用。
 *  gaze 为 -1..1 的视线方向，仅 normal 表情生效；不传则用默认的微微右下视线。 */
export function drawFace(
  g: Phaser.GameObjects.Graphics,
  p: Province,
  scale = 1,
  mood: FaceMood = 'normal',
  gaze?: Gaze | null
) {
  const fx = p.face[0] * scale;
  const fy = p.face[1] * scale;
  const r = p.eyeR * scale;
  const gap = r * 1.15;
  const ink = 0x333333;
  const lw = Math.max(2, 3 * scale);

  // 黑眼圈（大熊猫）：先画在眼睛底下，任何表情都保留
  if (p.patch) {
    g.fillStyle(0x2f2f2f, 1);
    for (const side of [-1, 1]) {
      g.fillEllipse(fx + side * gap * 1.05, fy + r * 0.2, r * 2.5, r * 3.1);
    }
  }

  if (mood === 'normal' || mood === 'wow') {
    const er = mood === 'wow' ? r * 1.08 : r;
    for (const side of [-1, 1]) {
      const ex = fx + side * gap;
      g.fillStyle(0xffffff, 1);
      g.fillCircle(ex, fy, er);
      g.lineStyle(Math.max(1.5, 2.5 * scale), ink, 1);
      g.strokeCircle(ex, fy, er);
      g.fillStyle(ink, 1);
      if (mood === 'wow') {
        g.fillCircle(ex, fy, r * 0.5);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(ex - r * 0.15, fy - r * 0.15, r * 0.16);
      } else {
        const px = gaze ? gaze.x * r * 0.45 : r * 0.15;
        const py = gaze ? gaze.y * r * 0.45 : r * 0.25;
        g.fillCircle(ex + px, fy + py, r * 0.45);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(ex + px - r * 0.13, fy + py - r * 0.17, r * 0.16);
      }
    }
  } else if (mood === 'blink') {
    // 黑眼圈上的闭眼线条用浅色，否则看不见
    g.lineStyle(lw, p.patch ? 0xf5f5f5 : ink, 1);
    for (const side of [-1, 1]) {
      const ex = fx + side * gap;
      g.beginPath();
      g.arc(ex, fy - r * 0.25, r * 0.8, Math.PI * 0.2, Math.PI * 0.8);
      g.strokePath();
    }
  } else {
    // squint：落地瞬间的 > < 眯眼（尖角朝向中间）
    g.lineStyle(lw, p.patch ? 0xf5f5f5 : ink, 1);
    for (const side of [-1, 1]) {
      const ex = fx + side * gap;
      g.beginPath();
      g.moveTo(ex + side * r * 0.6, fy - r * 0.5);
      g.lineTo(ex - side * r * 0.5, fy + r * 0.05);
      g.lineTo(ex + side * r * 0.6, fy + r * 0.6);
      g.strokePath();
    }
  }

  // 嘴
  if (mood === 'wow') {
    g.fillStyle(ink, 1);
    g.fillEllipse(fx, fy + r * 1.6, r * 1.1, r * 1.3);
    g.fillStyle(0xe57373, 1);
    g.fillEllipse(fx, fy + r * 1.85, r * 0.6, r * 0.5);
  } else {
    const smileR = mood === 'squint' ? r * 1.05 : r * 0.8;
    g.lineStyle(Math.max(2, 3.5 * scale), ink, 1);
    g.beginPath();
    g.arc(fx, fy + r * 1.2, smileR, Math.PI * 0.2, Math.PI * 0.8);
    g.strokePath();
  }
}
