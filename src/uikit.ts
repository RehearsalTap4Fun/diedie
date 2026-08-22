import Phaser from 'phaser';
import { FONT } from './draw';

/**
 * 统一 UI 组件库：糖果感按钮（底唇+顶部高光+柔影）、奶油卡片面板、
 * 云朵天空背景、草地平台。只改视觉，不改变任何交互尺寸与坐标。
 */

export const INK = '#5b4a3f'; // 正文暖棕
export const INK_SOFT = '#8a7a6b'; // 次要文字
const SHADOW = 0x2b3a4a;

/** 竖直渐变天空 + 云朵 +（可选）太阳。所有场景背景统一入口。 */
export function drawSceneBg(
  scene: Phaser.Scene,
  top: number,
  bottom: number,
  opts?: { sun?: boolean; clouds?: [number, number, number][] }
) {
  const W = 750;
  const H = 1334;
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(0, 0, W, H);
  if (opts?.sun) {
    g.fillStyle(0xffe9a8, 0.55);
    g.fillCircle(640, 130, 92);
    g.fillStyle(0xffdf86, 0.85);
    g.fillCircle(640, 130, 62);
  }
  const clouds = opts?.clouds ?? [
    [140, 170, 0.9],
    [560, 330, 0.7],
    [230, 520, 0.55],
  ];
  for (const [x, y, s] of clouds) cloud(g, x, y, s, 0.6);
  return g;
}

function cloud(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, alpha: number) {
  g.fillStyle(0xffffff, alpha);
  g.fillEllipse(x, y, 170 * s, 62 * s);
  g.fillEllipse(x - 58 * s, y + 12 * s, 104 * s, 46 * s);
  g.fillEllipse(x + 64 * s, y + 14 * s, 116 * s, 50 * s);
  g.fillEllipse(x + 8 * s, y - 24 * s, 96 * s, 52 * s);
}

/** 糖果按钮体：柔影 + 深色底唇 + 主体 + 顶部高光。(x,y) 为中心。 */
export function candyRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: number
) {
  const dark = Phaser.Display.Color.IntegerToColor(color).darken(16).color;
  g.fillStyle(SHADOW, 0.16);
  g.fillRoundedRect(x - w / 2, y - h / 2 + 8, w, h, r);
  g.fillStyle(dark, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h - 7, r);
  g.fillStyle(0xffffff, 0.22);
  g.fillRoundedRect(x - w / 2 + 9, y - h / 2 + 7, w - 18, Math.max(14, (h - 7) * 0.4), {
    tl: Math.max(6, r - 6),
    tr: Math.max(6, r - 6),
    bl: 10,
    br: 10,
  });
}

/** 糖果圆钮（旋转/退出等圆形按钮的底座） */
export function candyCircle(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  ringColor?: number
) {
  const dark = Phaser.Display.Color.IntegerToColor(color).darken(14).color;
  g.fillStyle(SHADOW, 0.16);
  g.fillCircle(x, y + 6, radius);
  g.fillStyle(dark, 1);
  g.fillCircle(x, y + 3, radius);
  g.fillStyle(color, 1);
  g.fillCircle(x, y, radius);
  if (ringColor !== undefined) {
    g.lineStyle(5, ringColor, 1);
    g.strokeCircle(x, y, radius - 3);
  }
  g.fillStyle(0xffffff, 0.35);
  g.fillEllipse(x, y - radius * 0.45, radius * 1.2, radius * 0.55);
}

/** 奶油卡片面板：柔影 + 彩色描边层 + 内容层（底部略厚形成底唇）。(x,y) 为左上角。 */
export function panelRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  border = 0xf6c453,
  fill = 0xfffdf4
) {
  g.fillStyle(SHADOW, 0.18);
  g.fillRoundedRect(x, y + 10, w, h, r);
  g.fillStyle(border, 1);
  g.fillRoundedRect(x, y, w, h, r);
  g.fillStyle(Phaser.Display.Color.IntegerToColor(border).darken(12).color, 1);
  g.fillRoundedRect(x + 6, y + h - 18, w - 12, 12, 6);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x + 9, y + 9, w - 18, h - 24, Math.max(8, r - 9));
}

/** 白色小卡片（选项/图鉴格）：柔影 + 白底 + 暖灰描边。(x,y) 为中心。 */
export function cardRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillAlpha = 1,
  border = 0xe4dccb
) {
  g.fillStyle(SHADOW, 0.13);
  g.fillRoundedRect(x - w / 2, y - h / 2 + 7, w, h, r);
  g.fillStyle(0xffffff, fillAlpha);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
  g.lineStyle(5, border, 1);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
}

/** 草地平台：泥土层 + 圆齿草皮 + 高光（游戏/竞技共用）。 */
export function drawPlatform(scene: Phaser.Scene, topY: number, width: number) {
  const W = 750;
  const g = scene.add.graphics();
  const x = W / 2 - width / 2;
  g.fillStyle(SHADOW, 0.14);
  g.fillRoundedRect(x - 4, topY + 10, width + 8, 70, 20);
  g.fillStyle(0xa9754d, 1);
  g.fillRoundedRect(x, topY, width, 70, 18);
  g.fillStyle(0x8d5f3d, 0.55);
  for (let i = 0; i < Math.floor(width / 90); i++) {
    g.fillEllipse(x + 55 + i * 92, topY + 48, 34, 9);
  }
  g.fillStyle(0x74c96a, 1);
  g.fillRoundedRect(x, topY, width, 26, { tl: 18, tr: 18, bl: 0, br: 0 });
  for (let gx = x + 14; gx < x + width - 8; gx += 24) {
    g.fillCircle(gx, topY + 26, 9);
  }
  g.fillStyle(0xffffff, 0.28);
  g.fillRoundedRect(x + 8, topY + 4, width - 16, 8, 4);
  return g;
}

/** 标题文字：白描边 + 柔和投影 */
export function fancyTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size: number,
  color: string
) {
  const t = scene.add
    .text(x, y, str, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#ffffff',
      strokeThickness: Math.max(6, size * 0.12),
    })
    .setOrigin(0.5);
  t.setShadow(0, Math.max(3, size * 0.05), 'rgba(43,58,74,0.25)', 6, false, true);
  return t;
}

/** 糖果按钮（主按钮/小按钮通用工厂）：尺寸与坐标语义同旧 makeButton。 */
export function makeCandyButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  sub: string | undefined,
  color: number,
  cb: () => void,
  fontSize?: number
) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  candyRect(g, 0, 0, w, h, Math.min(34, h * 0.34), color);
  const fs = fontSize ?? (sub ? h * 0.33 : h * 0.36);
  const t = scene.add
    .text(0, sub ? -h * 0.15 : -3, label, {
      fontFamily: FONT,
      fontSize: `${Math.round(fs)}px`,
      fontStyle: 'bold',
      color: '#ffffff',
    })
    .setOrigin(0.5);
  t.setShadow(0, 3, 'rgba(43,58,74,0.35)', 3, false, true);
  c.add([g, t]);
  if (sub) {
    // 副标题按宽度自适应缩小，防溢出（CJK 字宽≈字号）
    const subFs = Math.min(h * 0.2, ((w - 44) / Math.max(1, sub.length)) * 1.05);
    const st = scene.add
      .text(0, h * 0.24, sub, {
        fontFamily: FONT,
        fontSize: `${Math.round(subFs)}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setAlpha(0.95);
    st.setShadow(0, 2, 'rgba(43,58,74,0.3)', 2, false, true);
    c.add(st);
  }
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    scene.tweens.add({ targets: c, scale: 0.93, duration: 80, yoyo: true, onComplete: cb });
  });
  return c;
}
