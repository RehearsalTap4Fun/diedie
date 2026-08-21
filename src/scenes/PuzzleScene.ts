import Phaser from 'phaser';
import { PROVINCES, Province } from '../types';
import { FONT } from '../draw';
import { speakId } from '../speak';
import { getOwned } from '../save';
import MAP_RAW from '../data/chinamap.json';

interface MapData {
  w: number;
  h: number;
  provinces: Record<string, { pts: [number, number][]; c: [number, number] }>;
  inset: { w: number; h: number; lines: [number, number][][] };
}
const MAP = MAP_RAW as unknown as MapData;

const W = 750;
const H = 1334;
const BOARD_X = 55;
const BOARD_Y = 240;
const BOARD_W = 640;
const BOARD_H = 460;
const SNAP_R = 70;

interface PieceInfo {
  view: Phaser.GameObjects.Container;
  province: Province;
  tx: number;
  ty: number;
  homeX: number;
  homeY: number;
  grabX: number;
  grabY: number;
  done: boolean;
}

/** 省份拼图：从已收集省份选 5 个地理相邻的，拖回地图剪影里 */
export default class PuzzleScene extends Phaser.Scene {
  pieces: PieceInfo[] = [];
  doneCount = 0;
  private backBtn?: Phaser.GameObjects.Container;

  constructor() {
    super('puzzle');
  }

  create() {
    this.pieces = [];
    this.doneCount = 0;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0xf3ecfb, 0xf3ecfb, 0xe8f7fd, 0xe8f7fd, 1);
    bg.fillRect(0, 0, W, H);

    this.add
      .text(W / 2, 90, '省份拼图', {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: 'bold',
        color: '#6b46c1',
        stroke: '#ffffff',
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 152, '把下面的省份拖回它的家', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#4a5568',
      })
      .setOrigin(0.5);

    // 从已收集省份里选一个种子，取地图距离最近的 5 个组成相邻组
    const ownedAd = getOwned('province').filter((a) => MAP.provinces[a]);
    const seed = MAP.provinces[ownedAd[Math.floor(Math.random() * ownedAd.length)]].c;
    const chosen = ownedAd
      .map((a) => {
        const c = MAP.provinces[a].c;
        return { a, d: (c[0] - seed[0]) ** 2 + (c[1] - seed[1]) ** 2 };
      })
      .sort((x, y) => x.d - y.d)
      .slice(0, 5)
      .map((o) => o.a);

    // 组团包围盒 → 缩放平移到拼图板
    let minX = 1e9;
    let minY = 1e9;
    let maxX = -1e9;
    let maxY = -1e9;
    for (const a of chosen) {
      for (const [x, y] of MAP.provinces[a].pts) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const sc = Math.min(BOARD_W / (maxX - minX), BOARD_H / (maxY - minY), 3);
    const ox = BOARD_X + (BOARD_W - (maxX - minX) * sc) / 2 - minX * sc;
    const oy = BOARD_Y + (BOARD_H - (maxY - minY) * sc) / 2 - minY * sc;

    // 底板剪影
    const holes = this.add.graphics();
    for (const a of chosen) {
      const pts = MAP.provinces[a].pts.map(
        ([x, y]) => new Phaser.Geom.Point(x * sc + ox, y * sc + oy)
      );
      holes.fillStyle(0xd7dee3, 1);
      holes.fillPoints(pts, true);
      holes.lineStyle(3, 0xaebbc4, 1);
      holes.strokePoints(pts, true, true);
    }

    // 拼图块（打乱放进底部托盘）
    const shuffled = Phaser.Utils.Array.Shuffle([...chosen]);
    shuffled.forEach((a, i) => {
      const prov = PROVINCES.find((p) => p.adcode === a)!;
      const m = MAP.provinces[a];
      const local = m.pts.map(([x, y]) => ({ x: (x - m.c[0]) * sc, y: (y - m.c[1]) * sc }));
      const col = Phaser.Display.Color.HexStringToColor(prov.color);
      const g = this.add.graphics();
      const pts = local.map((p) => new Phaser.Geom.Point(p.x, p.y));
      g.fillStyle(col.color, 1);
      g.fillPoints(pts, true);
      g.lineStyle(3, col.clone().darken(25).color, 1);
      g.strokePoints(pts, true, true);

      // 内部锚点（最宽水平弦中点）：画表情 + 作为自动化拖拽抓取点
      const anchor = this.innerAnchor(local);
      const dim = Math.max(
        ...local.map((p) => Math.abs(p.x)),
        ...local.map((p) => Math.abs(p.y))
      );
      const eyeR = Phaser.Math.Clamp(dim * 0.16, 6, 13);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(anchor.x - eyeR * 1.1, anchor.y, eyeR);
      g.fillCircle(anchor.x + eyeR * 1.1, anchor.y, eyeR);
      g.fillStyle(0x333333, 1);
      g.fillCircle(anchor.x - eyeR * 1.1 + eyeR * 0.2, anchor.y + eyeR * 0.2, eyeR * 0.45);
      g.fillCircle(anchor.x + eyeR * 1.1 + eyeR * 0.2, anchor.y + eyeR * 0.2, eyeR * 0.45);
      g.lineStyle(2.4, 0x333333, 1);
      g.beginPath();
      g.arc(anchor.x, anchor.y + eyeR * 1.2, eyeR * 0.7, Math.PI * 0.2, Math.PI * 0.8);
      g.strokePath();

      const homeX = 115 + i * (520 / Math.max(1, shuffled.length - 1));
      const homeY = i % 2 === 0 ? 980 : 1090;
      const c = this.add.container(homeX, homeY, [g]);
      const poly = new Phaser.Geom.Polygon(pts);
      c.setInteractive(poly, Phaser.Geom.Polygon.Contains);
      this.input.setDraggable(c);
      this.pieces.push({
        view: c,
        province: prov,
        tx: m.c[0] * sc + ox,
        ty: m.c[1] * sc + oy,
        homeX,
        homeY,
        grabX: anchor.x,
        grabY: anchor.y,
        done: false,
      });
    });

    this.input.on(
      'dragstart',
      (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
        this.children.bringToTop(obj as Phaser.GameObjects.Container);
      }
    );
    this.input.on(
      'drag',
      (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container, dx: number, dy: number) => {
        obj.x = dx;
        obj.y = dy;
      }
    );
    this.input.on(
      'dragend',
      (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => this.tryPlace(obj)
    );

    this.backBtn = this.makeButton(W / 2, 1240, '返回', 0x4299e1, () => this.scene.start('menu'));

    if (!this.textures.exists('confetti')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false } as any);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 14, 14);
      g.generateTexture('confetti', 14, 14);
      g.destroy();
    }

    speakId('sys-puzzle');
  }

  /** 多边形内部锚点：取最宽水平弦的中点，保证在轮廓内 */
  private innerAnchor(local: { x: number; y: number }[]) {
    const ys = local.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    let best = { w: -1, x: 0, y: 0 };
    for (let i = 1; i < 12; i++) {
      const y = minY + ((maxY - minY) * i) / 12;
      const xs: number[] = [];
      for (let j = 0; j < local.length; j++) {
        const a = local[j];
        const b = local[(j + 1) % local.length];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
      xs.sort((m, n) => m - n);
      for (let j = 0; j + 1 < xs.length; j += 2) {
        const w = xs[j + 1] - xs[j];
        if (w > best.w) best = { w, x: (xs[j] + xs[j + 1]) / 2, y };
      }
    }
    return best;
  }

  private tryPlace(obj: Phaser.GameObjects.Container) {
    const info = this.pieces.find((pi) => pi.view === obj);
    if (!info || info.done) return;
    const d = Math.hypot(obj.x - info.tx, obj.y - info.ty);
    if (d < SNAP_R) {
      info.done = true;
      this.doneCount++;
      obj.disableInteractive();
      this.tweens.add({ targets: obj, x: info.tx, y: info.ty, duration: 160, ease: 'Back.easeOut' });
      speakId(`home-${info.province.adcode}`);
      if (this.doneCount === this.pieces.length) {
        this.time.delayedCall(700, () => this.finish());
      }
      return;
    }
    // 放到了别的省份的家附近：提示并弹回托盘
    const wrong = this.pieces.some(
      (o) => o !== info && !o.done && Math.hypot(obj.x - o.tx, obj.y - o.ty) < SNAP_R
    );
    if (wrong) {
      speakId('sys-wrong');
      this.tweens.add({
        targets: obj,
        x: info.homeX,
        y: info.homeY,
        duration: 300,
        ease: 'Quad.easeOut',
      });
    }
  }

  private finish() {
    this.backBtn?.setVisible(false);
    speakId('sys-puzzle-done');
    const emitter = this.add
      .particles(0, -20, 'confetti', {
        x: { min: 40, max: W - 40 },
        speedY: { min: 260, max: 480 },
        speedX: { min: -60, max: 60 },
        rotate: { min: 0, max: 360 },
        lifespan: 2600,
        quantity: 3,
        frequency: 36,
        scale: { min: 0.45, max: 1 },
        tint: [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xb980f0],
      })
      .setDepth(80);
    this.time.delayedCall(2600, () => emitter.stop());

    const c = this.add.container(0, 0).setDepth(90);
    const panel = this.add.graphics();
    panel.fillStyle(0xfffbea, 0.98);
    panel.fillRoundedRect(75, 760, W - 150, 300, 44);
    panel.lineStyle(8, 0xf6c453, 1);
    panel.strokeRoundedRect(75, 760, W - 150, 300, 44);
    const t = this.add
      .text(W / 2, 850, '🎉 拼好啦！你真棒！', {
        fontFamily: FONT,
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#d69e2e',
      })
      .setOrigin(0.5);
    c.add([panel, t]);
    c.add(this.makeButton(W / 2 - 150, 970, '再拼一次', 0x48bb78, () => this.scene.restart()));
    c.add(this.makeButton(W / 2 + 150, 970, '返回', 0x4299e1, () => this.scene.start('menu')));
  }

  private makeButton(x: number, y: number, label: string, color: number, cb: () => void) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(-130, -52, 260, 104, 32);
    g.lineStyle(5, 0xffffff, 0.9);
    g.strokeRoundedRect(-130, -52, 260, 104, 32);
    const t = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    c.add([g, t]);
    c.setSize(260, 104);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      this.tweens.add({ targets: c, scale: 0.92, duration: 80, yoyo: true, onComplete: cb });
    });
    return c;
  }
}
