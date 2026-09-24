import Phaser from 'phaser';
import { FONT } from './draw';
import { speakId } from './speak';

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
  fontSize?: number,
  icon?: IconKind
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
  if (icon) {
    // 图标在文字左侧，二者整体居中：不识字的孩子靠图标认按钮
    const is = Math.round(fs * 1.25);
    const gap = fs * 0.35;
    const total = is + gap + t.width;
    const ig = scene.add.graphics();
    drawIcon(ig, icon, -total / 2 + is / 2, t.y + 1, is, 0xffffff, color);
    t.x = -total / 2 + is + gap + t.width / 2;
    c.add(ig);
  }
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

// ---------- 图标（统一线宽、圆头，替代 emoji 充当图标） ----------

export type IconKind =
  | 'home'
  | 'speaker'
  | 'map'
  | 'dex'
  | 'back'
  | 'next'
  | 'undo'
  | 'close'
  | 'gear';

/** 圆头粗线段（Phaser 描边没有圆头，用多边形 + 两端圆补出来） */
function capsule(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  g.fillPoints(
    [
      new Phaser.Geom.Point(x1 + nx, y1 + ny),
      new Phaser.Geom.Point(x2 + nx, y2 + ny),
      new Phaser.Geom.Point(x2 - nx, y2 - ny),
      new Phaser.Geom.Point(x1 - nx, y1 - ny),
    ],
    true
  );
  g.fillCircle(x1, y1, w / 2);
  g.fillCircle(x2, y2, w / 2);
}

/** 圆头弧线：a0→a1（弧度，屏幕坐标系，顺时针为正） */
function arcStroke(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  w: number
) {
  const steps = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 0.2));
  let px = cx + Math.cos(a0) * r;
  let py = cy + Math.sin(a0) * r;
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    capsule(g, px, py, x, y, w);
    px = x;
    py = y;
  }
}

/**
 * 画一个图标到 g 上：(x,y) 为中心，s 为图标边长，color 为图标色，
 * cut 为镂空色（门、齿轮孔等，一般传按钮底色）。
 */
export function drawIcon(
  g: Phaser.GameObjects.Graphics,
  kind: IconKind,
  x: number,
  y: number,
  s: number,
  color: number,
  cut = 0xffffff
) {
  const P = (u: number, v: number) => new Phaser.Geom.Point(x + u * s, y + v * s);
  const w = s * 0.13;
  g.fillStyle(color, 1);
  switch (kind) {
    case 'home': {
      capsule(g, x - 0.42 * s, y - 0.02 * s, x, y - 0.4 * s, w);
      capsule(g, x, y - 0.4 * s, x + 0.42 * s, y - 0.02 * s, w);
      g.fillRoundedRect(x - 0.3 * s, y - 0.12 * s, 0.6 * s, 0.5 * s, 0.06 * s);
      g.fillStyle(cut, 1);
      g.fillRoundedRect(x - 0.085 * s, y + 0.1 * s, 0.17 * s, 0.28 * s, { tl: 0.08 * s, tr: 0.08 * s, bl: 0, br: 0 });
      break;
    }
    case 'speaker': {
      g.fillRoundedRect(x - 0.42 * s, y - 0.14 * s, 0.2 * s, 0.28 * s, 0.04 * s);
      g.fillPoints([P(-0.26, -0.14), P(0.0, -0.36), P(0.0, 0.36), P(-0.26, 0.14)], true);
      arcStroke(g, x + 0.02 * s, y, 0.17 * s, -0.8, 0.8, w * 0.85);
      arcStroke(g, x + 0.02 * s, y, 0.33 * s, -0.85, 0.85, w * 0.85);
      break;
    }
    case 'map': {
      g.fillPoints([P(-0.44, -0.3), P(-0.15, -0.4), P(-0.15, 0.3), P(-0.44, 0.4)], true);
      g.fillPoints([P(0.15, -0.3), P(0.44, -0.4), P(0.44, 0.3), P(0.15, 0.4)], true);
      g.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(18).color, 1);
      g.fillPoints([P(-0.15, -0.4), P(0.15, -0.3), P(0.15, 0.4), P(-0.15, 0.3)], true);
      break;
    }
    case 'dex': {
      const q = 0.3 * s;
      for (const [u, v] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        g.fillRoundedRect(x + u * 0.19 * s - q / 2, y + v * 0.19 * s - q / 2, q, q, 0.07 * s);
      break;
    }
    case 'back': {
      capsule(g, x + 0.34 * s, y, x - 0.3 * s, y, w);
      capsule(g, x - 0.32 * s, y, x - 0.05 * s, y - 0.27 * s, w);
      capsule(g, x - 0.32 * s, y, x - 0.05 * s, y + 0.27 * s, w);
      break;
    }
    case 'next': {
      const a = P(-0.2, -0.32);
      const b = P(0.34, 0);
      const c = P(-0.2, 0.32);
      g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
      capsule(g, a.x, a.y, b.x, b.y, w);
      capsule(g, b.x, b.y, c.x, c.y, w);
      capsule(g, c.x, c.y, a.x, a.y, w);
      break;
    }
    case 'undo': {
      // 从右下绕过顶部回到左侧，左端箭头朝下
      arcStroke(g, x + 0.04 * s, y + 0.06 * s, 0.28 * s, 0.9, -Math.PI, w);
      const tx = x + 0.04 * s - 0.28 * s;
      const ty = y + 0.06 * s + 0.05 * s;
      capsule(g, tx, ty, tx - 0.15 * s, ty - 0.15 * s, w);
      capsule(g, tx, ty, tx + 0.15 * s, ty - 0.15 * s, w);
      break;
    }
    case 'close': {
      capsule(g, x - 0.27 * s, y - 0.27 * s, x + 0.27 * s, y + 0.27 * s, w * 1.1);
      capsule(g, x + 0.27 * s, y - 0.27 * s, x - 0.27 * s, y + 0.27 * s, w * 1.1);
      break;
    }
    case 'gear': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        capsule(g, x + Math.cos(a) * 0.24 * s, y + Math.sin(a) * 0.24 * s, x + Math.cos(a) * 0.38 * s, y + Math.sin(a) * 0.38 * s, w * 1.25);
      }
      g.fillCircle(x, y, 0.29 * s);
      g.fillStyle(cut, 1);
      g.fillCircle(x, y, 0.12 * s);
      break;
    }
  }
}

/**
 * 圆形图标按钮：糖果圆底 + 图标。命中区不小于 hit（设计坐标，默认 120 ≈ 手机上 62pt），
 * 视觉半径与命中区分开，小按钮也好按。
 */
export function makeIconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  kind: IconKind,
  cb: () => void,
  opts?: { fill?: number; ring?: number; icon?: number; hit?: number }
) {
  const fill = opts?.fill ?? 0xffffff;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  candyCircle(g, 0, 0, radius, fill, opts?.ring);
  drawIcon(g, kind, 0, 0, radius * 1.05, opts?.icon ?? 0x7a6a5c, fill);
  c.add(g);
  const hit = Math.max(radius * 2, opts?.hit ?? 120);
  c.setSize(hit, hit);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    scene.tweens.add({ targets: c, scale: 0.9, duration: 70, yoyo: true, onComplete: cb });
  });
  return c;
}

/**
 * 底部撤销条：误操作的兜底（优先于二次确认）。ms 内点「撤销」执行 onUndo，
 * 超时淡出。进度条从满到空提示剩余时间。
 */
export function showUndoBar(
  scene: Phaser.Scene,
  label: string,
  onUndo: () => void,
  ms = 7000,
  onExpire?: () => void
) {
  const W = 750;
  const c = scene.add.container(W / 2, 1200).setDepth(200);
  const g = scene.add.graphics();
  candyRect(g, 0, 0, 560, 124, 40, 0x4a5568);
  const pill = scene.add.graphics();
  candyRect(pill, 150, -2, 210, 88, 30, 0xffffff);
  drawIcon(pill, 'undo', 88, -4, 46, 0x2b6cb0);
  const ut = scene.add
    .text(172, -6, '撤销', { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#2b6cb0' })
    .setOrigin(0.5);
  const t = scene.add
    .text(-120, -4, label, { fontFamily: FONT, fontSize: '30px', color: '#ffffff' })
    .setOrigin(0.5);
  const bar = scene.add.rectangle(-240, 44, 480, 6, 0xffffff, 0.55).setOrigin(0, 0.5);
  c.add([g, pill, ut, t, bar]);
  c.setSize(560, 124);
  c.setInteractive({ useHandCursor: true });
  c.setAlpha(0);
  c.y += 40;
  scene.tweens.add({ targets: c, alpha: 1, y: 1200, duration: 220, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: bar, scaleX: 0, duration: ms, ease: 'Linear' });
  let done = false;
  const close = () => {
    scene.tweens.add({ targets: c, alpha: 0, y: 1240, duration: 200, onComplete: () => c.destroy() });
  };
  const timer = scene.time.delayedCall(ms, () => {
    if (done) return;
    done = true;
    close();
    onExpire?.();
  });
  c.on('pointerdown', () => {
    if (done) return;
    done = true;
    timer.remove(false);
    onUndo();
    close();
  });
  return c;
}

/**
 * 「要回菜单啦」撤回窗口：点退出后不立刻离开，ms（默认 5 秒）内可点大按钮继续玩，
 * 再点一次小房子立即离开，超时自动离开。孩子误碰有机会撤回，家长也不用多点一步确认。
 * register 用于把浮层交给指定相机（竞技场景有双相机）。
 */
export function showLeaveWindow(
  scene: Phaser.Scene,
  onLeave: () => void,
  onStay: () => void,
  opts?: { ms?: number; register?: (o: Phaser.GameObjects.GameObject) => void }
) {
  const W = 750;
  const H = 1334;
  const ms = opts?.ms ?? 5000; // 比 sys-leave 语音（约 4 秒）略长
  const c = scene.add.container(0, 0).setDepth(300);
  opts?.register?.(c);
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x2d3748, 0.45).setInteractive();
  const panel = scene.add.graphics();
  panelRect(panel, 95, 440, W - 190, 470, 48);
  const t = scene.add
    .text(W / 2, 530, '要回菜单啦', { fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#7a5b2e' })
    .setOrigin(0.5);
  // 倒计时圆环：包住「马上走」小房子
  const ring = scene.add.graphics();
  const stay = makeCandyButton(scene, W / 2 - 70, 700, 300, 130, '继续玩', undefined, 0x48bb78, () => finish(false), 44, 'next');
  const go = makeIconButton(scene, W / 2 + 175, 700, 56, 'home', () => finish(true), { ring: 0xe4dccb });
  c.add([dim, panel, t, ring, stay, go]);
  speakId('sys-leave');
  const t0 = scene.time.now;
  let done = false;
  const tick = scene.time.addEvent({
    delay: 30,
    loop: true,
    callback: () => {
      const k = Math.min(1, (scene.time.now - t0) / ms);
      ring.clear();
      ring.lineStyle(8, 0x4299e1, 1);
      ring.beginPath();
      ring.arc(W / 2 + 175, 700, 70, -Math.PI / 2, -Math.PI / 2 + (1 - k) * Math.PI * 2, false);
      ring.strokePath();
      if (k >= 1) finish(true);
    },
  });
  function finish(leave: boolean) {
    if (done) return;
    done = true;
    tick.remove(false);
    c.destroy();
    if (leave) onLeave();
    else onStay();
  }
  return c;
}
