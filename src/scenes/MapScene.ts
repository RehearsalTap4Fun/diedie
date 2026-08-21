import Phaser from 'phaser';
import { PROVINCES, Province } from '../types';
import { FONT } from '../draw';
import { speakId } from '../speak';
import { getOwned } from '../save';
import { makeFactCard } from '../ui';
import MAP_RAW from '../data/chinamap.json';

interface MapData {
  w: number;
  h: number;
  provinces: Record<string, { pts: [number, number][]; c: [number, number] }>;
  inset: { w: number; h: number; lines: [number, number][][] };
}
const MAP = MAP_RAW as unknown as MapData;

const W = 750;
const MAP_Y = 250;

export default class MapScene extends Phaser.Scene {
  private card?: Phaser.GameObjects.Container;
  private owned = new Set<string>();

  constructor() {
    super('map');
  }

  create() {
    this.card = undefined;
    this.owned = new Set(getOwned('province'));
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xa5dff9, 0xa5dff9, 0xe8f7fd, 0xe8f7fd, 1);
    bg.fillRect(0, 0, W, 1334);

    this.add
      .text(W / 2, 110, '我的中国地图', {
        fontFamily: FONT,
        fontSize: '60px',
        fontStyle: 'bold',
        color: '#2b6cb0',
        stroke: '#ffffff',
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 180, `已收集 ${this.owned.size} / ${PROVINCES.length} · 点一点亮起来的省份`, {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#4a5568',
      })
      .setOrigin(0.5);

    // 全国地图：已收集上色，未收集置灰
    const ox = (W - MAP.w) / 2;
    const g = this.add.graphics();
    for (const p of PROVINCES) {
      const m = MAP.provinces[p.adcode];
      if (!m) continue;
      const pts = m.pts.map(([x, y]) => new Phaser.Geom.Point(x + ox, y + MAP_Y));
      if (this.owned.has(p.adcode)) {
        const col = Phaser.Display.Color.HexStringToColor(p.color);
        g.fillStyle(col.color, 1);
        g.fillPoints(pts, true);
        g.lineStyle(2, col.clone().darken(25).color, 1);
      } else {
        g.fillStyle(0xd7dee3, 1);
        g.fillPoints(pts, true);
        g.lineStyle(2, 0xaebbc4, 1);
      }
      g.strokePoints(pts, true, true);
    }

    // 南海诸岛附框（九段线，标准地图必备要素）
    const ix = ox + MAP.w - MAP.inset.w - 6;
    const iy = MAP_Y + MAP.h + 16;
    const ib = this.add.graphics();
    ib.fillStyle(0xffffff, 0.5);
    ib.fillRoundedRect(ix, iy, MAP.inset.w, MAP.inset.h, 12);
    ib.lineStyle(3, 0x90a4ae, 1);
    ib.strokeRoundedRect(ix, iy, MAP.inset.w, MAP.inset.h, 12);
    ib.lineStyle(3, 0x78909c, 1);
    for (const line of MAP.inset.lines) {
      ib.beginPath();
      line.forEach(([x, y], i) => (i ? ib.lineTo(ix + x, iy + y) : ib.moveTo(ix + x, iy + y)));
      ib.strokePath();
    }
    this.add
      .text(ix + MAP.inset.w / 2, iy + MAP.inset.h - 18, '南海诸岛', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#546e7a',
      })
      .setOrigin(0.5);

    // 点击省份：已收集听介绍，未收集提示继续闯关
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.y > 1150) return;
      let best: Province | undefined;
      let bd = 80 * 80;
      for (const p of PROVINCES) {
        const m = MAP.provinces[p.adcode];
        if (!m) continue;
        const dx = ptr.x - (m.c[0] + ox);
        const dy = ptr.y - (m.c[1] + MAP_Y);
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (!best) return;
      this.card?.destroy();
      const has = this.owned.has(best.adcode);
      const color = Phaser.Display.Color.HexStringToColor(best.color).color;
      this.card = makeFactCard(
        this,
        best,
        has ? '⭐' : '🔒',
        has ? color : 0xaebbc4,
        has ? undefined : '继续闯关就能收集到啦！'
      );
      this.card.setPosition(W / 2, 1010).setDepth(60).setScale(0.85);
      this.tweens.add({ targets: this.card, scale: 1, duration: 160, ease: 'Back.easeOut' });
      speakId(has ? `intro-${best.adcode}` : 'sys-locked');
    });

    // 返回按钮
    const back = this.add.container(W / 2, 1230);
    const bgBtn = this.add.graphics();
    bgBtn.fillStyle(0x4299e1, 1);
    bgBtn.fillRoundedRect(-160, -52, 320, 104, 34);
    bgBtn.lineStyle(5, 0xffffff, 0.9);
    bgBtn.strokeRoundedRect(-160, -52, 320, 104, 34);
    const bt = this.add
      .text(0, 0, '返回', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    back.add([bgBtn, bt]);
    back.setSize(320, 104);
    back.setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      this.tweens.add({
        targets: back,
        scale: 0.92,
        duration: 80,
        yoyo: true,
        onComplete: () => this.scene.start('menu'),
      });
    });

    this.add
      .text(W / 2, 1315, '地图基于标准地图改绘 · 仅供学习示意', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#718096',
      })
      .setOrigin(0.5);

    speakId('sys-map');
  }
}
