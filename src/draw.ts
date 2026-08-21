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
  const dark = base.clone().darken(22).color;
  const pts = p.verts.map(([x, y]) => new Phaser.Geom.Point(x * scale, y * scale));

  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  g.lineStyle(Math.max(2, 5 * scale), dark, 1);
  g.strokePoints(pts, true, true);

  if (!withFace) return;
  drawFace(g, p, scale, 'normal');
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
    g.lineStyle(lw, ink, 1);
    for (const side of [-1, 1]) {
      const ex = fx + side * gap;
      g.beginPath();
      g.arc(ex, fy - r * 0.25, r * 0.8, Math.PI * 0.2, Math.PI * 0.8);
      g.strokePath();
    }
  } else {
    // squint：落地瞬间的 > < 眯眼（尖角朝向中间）
    g.lineStyle(lw, ink, 1);
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
