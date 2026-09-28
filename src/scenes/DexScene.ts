import Phaser from 'phaser';
import { ANIMALS, Province } from '../types';
import { drawProvince, FONT } from '../draw';
import { speakId } from '../speak';
import { getOwned } from '../save';
import { makeFactCard } from '../ui';
import { drawSceneBg, fancyTitle, makeCandyButton, cardRect } from '../uikit';

const W = 750;
const COLS = 5;
const CELL = 134; // 写实剪影细节多，格子给大一点才认得清
const GRID_X = (W - COLS * CELL) / 2;
const GRID_Y = 222;

/**
 * 动物图鉴（叠动物模式的「我的地图」）：34 格网格，
 * 已收集的亮彩色带表情，未收集的置灰剪影；点击听介绍/提示继续闯关。
 */
export default class DexScene extends Phaser.Scene {
  private card?: Phaser.GameObjects.Container;

  constructor() {
    super('dex');
  }

  create() {
    this.card = undefined;
    const owned = new Set(getOwned('animal'));
    drawSceneBg(this, 0xc4ecd6, 0xfdf9ec, {
      clouds: [
        [140, 165, 0.7],
        [610, 130, 0.55],
      ],
    });

    fancyTitle(this, W / 2, 110, '我的动物图鉴', 60, '#379a63');
    this.add
      .text(W / 2, 180, `已收集 ${owned.size} / ${ANIMALS.length} · 点一点认识的动物`, {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#5b4a3f',
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    ANIMALS.forEach((p, i) => {
      const row = Math.floor(i / COLS);
      const rowCount = Math.min(COLS, ANIMALS.length - row * COLS);
      const rowOffset = ((COLS - rowCount) * CELL) / 2; // 末行不满时居中
      const cx = GRID_X + rowOffset + (i % COLS) * CELL + CELL / 2;
      const cy = GRID_Y + row * CELL + CELL / 2;
      this.makeCell(p, cx, cy, owned.has(p.adcode));
    });

    // 返回按钮（与地图页同款）
    makeCandyButton(this, W / 2, 1230, 320, 104, '返回', undefined, 0x4aa3ec, () =>
      this.scene.start('menu')
    );

    this.add
      .text(W / 2, 1315, '动物剪影来自 PhyloPic 与 FreeSVG（CC0/CC-BY，作者见项目 ATTRIBUTION）', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#718096',
      })
      .setOrigin(0.5);

    speakId('sys-dex');
  }

  private makeCell(p: Province, cx: number, cy: number, has: boolean) {
    const c = this.add.container(cx, cy);
    const box = this.add.graphics();
    cardRect(box, 0, 0, CELL - 10, CELL - 10, 22, has ? 0.95 : 0.5, has ? 0xe4dccb : 0xffffff);
    const s = Math.min((CELL - 32) / p.size[0], (CELL - 32) / p.size[1]);
    const g = this.add.graphics();
    if (has) {
      drawProvince(g, p, s, true);
    } else {
      // 置灰剪影（不描表情，保留猜猜看的神秘感）
      const pts = p.verts.map(([x, y]) => new Phaser.Geom.Point(x * s, y * s));
      g.fillStyle(0xc3ccd3, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2, 0xa4b0b9, 1);
      g.strokePoints(pts, true, true);
    }
    const xs = p.verts.map((v) => v[0]);
    const ys = p.verts.map((v) => v[1]);
    const inner = this.add.container(
      (-(Math.min(...xs) + Math.max(...xs)) / 2) * s,
      (-(Math.min(...ys) + Math.max(...ys)) / 2) * s,
      [g]
    );
    c.add([box, inner]);
    c.setSize(CELL - 8, CELL - 8);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      this.tweens.add({ targets: c, scale: 1.1, duration: 100, yoyo: true });
      this.card?.destroy();
      const color = Phaser.Display.Color.HexStringToColor(p.color).color;
      this.card = makeFactCard(
        this,
        p,
        has ? '⭐' : '🔒',
        has ? color : 0xaebbc4,
        has ? undefined : '继续闯关就能收集到啦！'
      );
      this.card.setPosition(W / 2, 1080).setDepth(60).setScale(0.85);
      this.tweens.add({ targets: this.card, scale: 1, duration: 160, ease: 'Back.easeOut' });
      speakId(has ? `intro-${p.adcode}` : 'sys-locked');
    });
  }
}
