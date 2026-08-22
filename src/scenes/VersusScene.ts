import Phaser from 'phaser';
import { Province, activeShapes } from '../types';
import { drawProvince, FONT } from '../draw';
import { speakId } from '../speak';
import { Block, PhysProfile } from '../block';
import { Face } from '../face';
import { sfx } from '../sfx';
import {
  drawPlatform,
  panelRect,
  candyRect,
  candyCircle,
  makeCandyButton,
} from '../uikit';

const W = 750;
const H = 1334;
const PLATFORM_Y = 1150;
const PLATFORM_W = 600; // 竞技模式平台恒定宽度，公平起见不随进程变化
const AIM_Y = 250;
const AIM_SCREEN_Y = 250; // 悬浮块在屏幕上的固定高度（镜头拉远时保持不变）
const AIM_CLEARANCE = 340; // 悬浮块中心与塔顶的最小间距（留出落块行程）
const MIN_ZOOM = 0.33;
const DRAG_MAX_Y = 1140;

const TEAMS = [
  { emoji: '🐼', name: '熊猫队', color: 0x48bb78 },
  { emoji: '🐯', name: '老虎队', color: 0xf6ad55 },
];

type Phase = 'banner' | 'aim' | 'drop' | 'over';

/**
 * 双人竞技（同屏热座）：两队轮流放省份块往上叠，
 * 谁放的块导致塔上任何块掉出屏幕，谁就输。34 块全叠完没倒则双赢。
 * 不出题、不影响单人收集进度；块数越多物理越「活」，对局自然收敛。
 */
export default class VersusScene extends Phaser.Scene {
  private phase: Phase = 'banner';
  /** 当前回合队伍（0/1） */
  private cur = 0;
  /** 最后一个放块的队伍：塔倒时由它承担败局；-1 = 还没人放过 */
  private lastDropper = -1;
  /** 结束状态（自动化测试断言用）：{winner,loser} 或 {bothWin:true}（34 块全叠完） */
  private outcome: { winner: number; loser: number } | { bothWin: true } | null = null;
  private placedCount = [0, 0];
  private pool: Province[] = [];
  private blocks: Block[] = [];
  private aimView?: Phaser.GameObjects.Container;
  private aimFace?: Face;
  private aimProvince?: Province;
  private aimX = W / 2;
  private aimAngle = 0;
  private grabbing = false;
  private settleMs = 0;
  private rotateBtns: Phaser.GameObjects.Container[] = [];
  private banner?: Phaser.GameObjects.Container;
  private chips: Phaser.GameObjects.Container[] = [];
  private chipCounts: Phaser.GameObjects.Text[] = [];
  /** UI 相机：计分牌/按钮/面板固定屏幕位置，不随主相机缩放 */
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private camZ = 1;
  /** 悬浮块的目标世界高度：塔逼近出块区时随塔顶抬升 */
  private aimTargetY = AIM_Y;

  constructor() {
    super('versus');
  }

  init() {
    this.phase = 'banner';
    this.cur = 0;
    this.lastDropper = -1;
    this.outcome = null;
    this.placedCount = [0, 0];
    this.pool = [];
    this.blocks = [];
    this.aimView = undefined;
    this.aimFace = undefined;
    this.aimProvince = undefined;
    this.aimX = W / 2;
    this.aimAngle = 0;
    this.grabbing = false;
    this.settleMs = 0;
    this.rotateBtns = [];
    this.banner = undefined;
    this.chips = [];
    this.chipCounts = [];
    this.camZ = 1;
    this.aimTargetY = AIM_Y;
  }

  create() {
    this.uiCam = this.cameras.add(0, 0, W, H);

    // 背景铺到远超屏幕的世界范围：镜头拉远时上方/两侧不露底
    const bg = this.add.graphics();
    bg.fillStyle(0xffdde4, 1);
    bg.fillRect(-1200, -3200, 3150, 3200);
    bg.fillGradientStyle(0xffdde4, 0xffdde4, 0xfff4e0, 0xfff4e0, 1);
    bg.fillRect(-1200, 0, 3150, H + 400);
    // 云朵点缀（世界空间，随镜头缩放有远景感）
    bg.fillStyle(0xffffff, 0.55);
    for (const [cx, cy, s] of [
      [150, 320, 0.8],
      [600, 480, 0.65],
      [300, -400, 1.4],
      [680, -900, 1.2],
      [80, -1500, 1.5],
    ]) {
      bg.fillEllipse(cx, cy, 170 * s, 62 * s);
      bg.fillEllipse(cx - 58 * s, cy + 12 * s, 104 * s, 46 * s);
      bg.fillEllipse(cx + 64 * s, cy + 14 * s, 116 * s, 50 * s);
    }
    this.asWorld(bg);

    this.matter.add.rectangle(W / 2, PLATFORM_Y + 45, PLATFORM_W, 90, {
      isStatic: true,
      friction: 1,
    });
    this.asWorld(drawPlatform(this, PLATFORM_Y, PLATFORM_W));

    // 顶部双队计分（当前回合队伍放大高亮）+ 中间退出按钮
    TEAMS.forEach((_, i) => this.chips.push(this.makeChip(i)));
    this.chips.forEach((c) => this.asUI(c));
    this.asUI(this.makeExitBtn());
    this.updateChips();

    this.rotateBtns = [this.makeRotateBtn(W / 2, 1282, '↻', Math.PI / 6)];
    this.rotateBtns.forEach((b) => this.asUI(b));

    if (!this.textures.exists('confetti')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false } as any);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 14, 14);
      g.generateTexture('confetti', 14, 14);
      g.destroy();
    }

    // 与单人一致：首次触地减震防二次弹跳，已落稳块间磕碰播闷响
    this.matter.world.on('collisionstart', (ev: any) => {
      for (const pair of ev.pairs) {
        const pa = pair.bodyA.parent;
        const pb = pair.bodyB.parent;
        let firstContact = false;
        for (const b of this.blocks) {
          if (!b.landed && (pa === b.body || pb === b.body)) {
            b.onFirstContact();
            firstContact = true;
          }
        }
        if (!firstContact && (pa.speed > 1.6 || pb.speed > 1.6)) sfx('thud', 180);
      }
    });

    // 拖拽用主相机世界坐标（镜头拉远后屏幕坐标≠世界坐标）；底部按钮区判定仍用屏幕坐标
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'aim' || p.y > DRAG_MAX_Y) return;
      this.grabbing = true;
      this.moveAim(this.cameras.main.getWorldPoint(p.x, p.y).x);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.phase === 'aim' && this.grabbing)
        this.moveAim(this.cameras.main.getWorldPoint(p.x, p.y).x);
    });
    this.input.on('pointerup', () => {
      if (this.phase === 'aim' && this.grabbing) {
        this.grabbing = false;
        this.drop();
      }
    });

    // 大块先上场（好落稳），小块留给白热化阶段（省份/动物同规则）
    const shapes = activeShapes();
    const big = Phaser.Utils.Array.Shuffle(
      shapes.filter((p) => Math.max(p.size[0], p.size[1]) >= 170)
    );
    const small = Phaser.Utils.Array.Shuffle(
      shapes.filter((p) => Math.max(p.size[0], p.size[1]) < 170)
    );
    this.pool = [...big, ...small];

    speakId('sys-vs-start');
    this.time.delayedCall(1600, () => this.nextTurn());
  }

  update(_t: number, dt: number) {
    // 掉出平台正在坠落的块：惊慌脸 + 成为全塔视线焦点
    let escaping: Block | undefined;
    for (const b of this.blocks) {
      b.capFallSpeed();
      b.sync();
      if (b.body.position.y > PLATFORM_Y + 60) {
        b.panic();
        if (!escaping || b.body.position.y > escaping.body.position.y) escaping = b;
      }
    }

    const falling = this.phase === 'drop' ? this.blocks.find((b) => !b.landed) : undefined;
    const gazeTarget =
      escaping?.view ??
      (this.phase === 'aim' && this.aimView ? this.aimView : falling ? falling.view : undefined);
    for (const b of this.blocks) {
      if (gazeTarget && gazeTarget !== b.view) b.lookAt(gazeTarget.x, gazeTarget.y);
      else if (!gazeTarget) b.clearGaze();
    }

    // 塔逼近出块区时抬高悬浮块并拉远镜头：悬浮块屏幕高度恒定，世界底边锚定屏幕底
    const landedTops = this.blocks.filter((b) => b.landed).map((b) => b.body.bounds.min.y);
    const towerTop = landedTops.length ? Math.min(...landedTops) : PLATFORM_Y;
    this.aimTargetY = Math.min(AIM_Y, towerTop - AIM_CLEARANCE);
    const zTarget = Phaser.Math.Clamp((H - AIM_SCREEN_Y) / (H - this.aimTargetY), MIN_ZOOM, 1);
    this.camZ = Phaser.Math.Linear(this.camZ, zTarget, 0.06);
    const cam = this.cameras.main;
    cam.setZoom(this.camZ);
    cam.centerOn(W / 2, H - H / 2 / this.camZ);

    if (this.aimView) {
      this.aimView.x = Phaser.Math.Linear(this.aimView.x, this.aimX, 0.35);
      this.aimView.y = Phaser.Math.Linear(this.aimView.y, this.aimTargetY, 0.2);
      this.aimView.rotation = Phaser.Math.Angle.RotateTo(this.aimView.rotation, this.aimAngle, 0.12);
    }

    // 掉出屏幕即分胜负：最后放块的队伍判负（竞技模式不回收、不宽恕）
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (b.body.position.y > H + 350) {
        b.destroy(this);
        this.blocks.splice(i, 1);
        if (this.phase !== 'over' && this.lastDropper >= 0) {
          this.gameOver(this.lastDropper);
          return;
        }
      }
    }

    if (this.phase !== 'drop') return;

    const moving = this.blocks.some(
      (b) => !b.body.isSleeping && (b.body.speed > 0.18 || b.body.angularSpeed > 0.03)
    );
    this.settleMs = moving ? 0 : this.settleMs + dt;
    if (this.settleMs < 650) return;

    // 落稳换人
    this.cur = 1 - this.cur;
    this.nextTurn();
  }

  // ---------- 回合流转 ----------

  private nextTurn() {
    if (this.pool.length === 0) {
      this.gameBothWin();
      return;
    }
    this.phase = 'banner';
    this.updateChips();
    this.showBanner();
    speakId(`sys-vs-p${this.cur}`, { queue: true });
    this.time.delayedCall(1000, () => {
      if (this.phase !== 'banner') return; // 已被结束流程打断
      this.banner?.destroy();
      this.banner = undefined;
      this.beginAim(this.pool.shift()!);
    });
  }

  private showBanner() {
    this.banner?.destroy();
    const team = TEAMS[this.cur];
    const c = this.add.container(W / 2, 560).setDepth(70);
    const g = this.add.graphics();
    candyRect(g, 0, 0, 500, 140, 70, team.color);
    const t = this.add
      .text(0, -4, `${team.emoji} 轮到${team.name}`, {
        fontFamily: FONT,
        fontSize: '54px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    t.setShadow(0, 3, 'rgba(43,58,74,0.35)', 3, false, true);
    c.add([g, t]);
    c.setScale(0.6);
    this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.asUI(c);
    this.banner = c;
  }

  private beginAim(p: Province) {
    this.phase = 'aim';
    this.aimProvince = p;
    this.aimX = W / 2;
    this.aimAngle = 0;
    const bodyG = this.add.graphics();
    drawProvince(bodyG, p, 1, false);
    this.aimFace = new Face(this, p, 1);
    this.aimView = this.add.container(this.aimX, this.aimTargetY, [bodyG, this.aimFace.g]);
    this.asWorld(this.aimView);
    this.rotateBtns.forEach((b) => b.setVisible(true));
    speakId(`aim-${p.adcode}`, { queue: true });
  }

  private moveAim(x: number) {
    this.aimX = Phaser.Math.Clamp(x, 95, W - 95);
  }

  private drop() {
    if (!this.aimProvince || !this.aimView) return;
    this.phase = 'drop';
    const p = this.aimProvince;
    const x = this.aimView.x;
    const y = this.aimView.y;
    const angle = this.aimAngle;
    this.aimFace?.destroy();
    this.aimView.destroy();
    this.aimView = undefined;
    this.aimFace = undefined;
    this.aimProvince = undefined;
    this.rotateBtns.forEach((b) => b.setVisible(false));
    sfx('whoosh');
    this.lastDropper = this.cur;
    this.placedCount[this.cur]++;
    const b = new Block(this, p, x, y, angle, this.prof());
    this.asWorld(b.view);
    this.blocks.push(b);
    this.settleMs = 0;
    this.updateChips();
  }

  /** 块数越多塔越「活」：每 4 块升一档，与单人第 1-6 关的难度曲线同参数 */
  private prof(): PhysProfile {
    const t = Math.min(Math.floor(this.blocks.length / 4), 5);
    return {
      inertiaScale: Math.max(1.0, 2.2 - 0.25 * t),
      friction: Math.max(0.6, 1.0 - 0.08 * t),
      frictionStatic: Math.max(0.7, 1.2 - 0.1 * t),
      sleepThreshold: 30 + 12 * t,
      landDampX: Math.min(0.8, 0.25 + 0.12 * t),
      landDampAngular: Math.min(0.85, 0.3 + 0.12 * t),
    };
  }

  // ---------- 结算 ----------

  private gameOver(loser: number) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    const winner = 1 - loser;
    this.outcome = { winner, loser };
    this.cleanupTurnUI();
    this.blocks.forEach((b) => b.gasp());
    speakId(`sys-vs-win-p${winner}`);
    this.celebrate(TEAMS[winner].color);
    // 留时间看块坠落再弹结果
    this.time.delayedCall(1100, () =>
      this.showResult(
        TEAMS[winner].emoji,
        `${TEAMS[winner].name}赢啦！`,
        `${TEAMS[loser].emoji} ${TEAMS[loser].name}把塔弄倒了`,
        TEAMS[winner].color
      )
    );
  }

  /** 34 块全叠完没倒：两队都是赢家 */
  private gameBothWin() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.outcome = { bothWin: true };
    this.cleanupTurnUI();
    speakId('sys-vs-bothwin');
    this.celebrate(0xf6c453);
    this.time.delayedCall(600, () =>
      this.showResult(
        '🐼🏆🐯',
        '两队都赢啦！',
        '把全中国 34 块都叠上去了，太厉害啦！',
        0xf6c453
      )
    );
  }

  private cleanupTurnUI() {
    this.banner?.destroy();
    this.banner = undefined;
    this.aimFace?.destroy();
    this.aimView?.destroy();
    this.aimView = undefined;
    this.aimFace = undefined;
    this.aimProvince = undefined;
    this.grabbing = false;
    this.rotateBtns.forEach((b) => b.setVisible(false));
    this.updateChips(); // 结束后双方 chip 都不再高亮
  }

  private celebrate(tint: number) {
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
        tint: [tint, 0xffd93d, 0xffffff],
      })
      .setDepth(80);
    this.asUI(emitter);
    this.time.delayedCall(2600, () => emitter.stop());
  }

  private showResult(emoji: string, title: string, sub: string, color: number) {
    const c = this.add.container(0, 0).setDepth(90);
    this.asUI(c);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x2d3748, 0.3).setInteractive();
    const panel = this.add.graphics();
    panelRect(panel, 40, 430, W - 80, 480, 48, color);
    const e = this.add.text(W / 2, 560, emoji, { fontSize: '110px' }).setOrigin(0.5);
    const t1 = this.add
      .text(W / 2, 680, title, {
        fontFamily: FONT,
        fontSize: '68px',
        fontStyle: 'bold',
        color: '#e8a23d',
        stroke: '#ffffff',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    t1.setShadow(0, 3, 'rgba(122,91,46,0.25)', 4, false, true);
    const t2 = this.add
      .text(W / 2, 760, sub, {
        fontFamily: FONT,
        fontSize: '32px',
        color: '#744210',
        align: 'center',
        wordWrap: { width: 580 },
      })
      .setOrigin(0.5);
    c.add([dim, panel, e, t1, t2]);
    c.add(
      this.makeSmallButton(230, 850, '再来一局', 0x48bb78, () => this.scene.restart(), 260)
    );
    c.add(
      this.makeSmallButton(520, 850, '回菜单', 0x4299e1, () => this.scene.start('menu'), 260)
    );
    e.setScale(0);
    this.tweens.add({ targets: e, scale: 1, duration: 350, ease: 'Back.easeOut' });
  }

  // ---------- UI 部件 ----------

  /** 世界物（随主相机缩放）：UI 相机不画 */
  private asWorld(o: Phaser.GameObjects.GameObject) {
    this.uiCam.ignore(o);
  }

  /** UI（固定屏幕位置）：主相机不画 */
  private asUI(o: Phaser.GameObjects.GameObject) {
    this.cameras.main.ignore(o);
  }

  private makeChip(i: number) {
    const team = TEAMS[i];
    const c = this.add.container(i === 0 ? 170 : W - 170, 64).setDepth(40);
    const g = this.add.graphics();
    g.fillStyle(0x2b3a4a, 0.14);
    g.fillRoundedRect(-140, -37, 280, 88, 30);
    g.fillStyle(0xffffff, 0.96);
    g.fillRoundedRect(-140, -44, 280, 88, 30);
    g.lineStyle(6, team.color, 1);
    g.strokeRoundedRect(-140, -44, 280, 88, 30);
    const e = this.add.text(-100, 0, team.emoji, { fontSize: '46px' }).setOrigin(0.5);
    const n = this.add
      .text(-8, -16, team.name, {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#4a5568',
      })
      .setOrigin(0.5);
    const cnt = this.add
      .text(-8, 20, '已叠 0 块', { fontFamily: FONT, fontSize: '22px', color: '#718096' })
      .setOrigin(0.5);
    c.add([g, e, n, cnt]);
    this.chipCounts.push(cnt);
    return c;
  }

  private updateChips() {
    this.chips.forEach((c, i) => {
      const bothWin = !!this.outcome && 'bothWin' in this.outcome;
      const active = bothWin || (this.phase !== 'over' && i === this.cur);
      c.setScale(active ? 1.08 : 0.92);
      c.setAlpha(active ? 1 : 0.6);
    });
    this.chipCounts.forEach((t, i) => t.setText(`已叠 ${this.placedCount[i]} 块`));
  }

  private makeExitBtn() {
    const c = this.add.container(W / 2, 64).setDepth(40);
    const g = this.add.graphics();
    candyCircle(g, 0, 0, 34, 0xffffff, 0xe4dccb);
    const t = this.add
      .text(0, -2, '✕', { fontFamily: FONT, fontSize: '34px', color: '#9a8b7c' })
      .setOrigin(0.5);
    c.add([g, t]);
    c.setSize(68, 68);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this.scene.start('menu'));
    return c;
  }

  private makeRotateBtn(x: number, y: number, glyph: string, delta: number) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    candyCircle(g, 0, 0, 50, 0xffffff, 0x4aa3ec);
    const t = this.add
      .text(0, -3, glyph, { fontFamily: FONT, fontSize: '54px', color: '#2b6cb0' })
      .setOrigin(0.5);
    c.add([g, t]);
    c.setSize(100, 100);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      if (this.phase !== 'aim') return;
      this.aimAngle += delta;
      sfx('rotate');
      this.tweens.add({ targets: c, scale: 0.9, duration: 70, yoyo: true });
    });
    c.setVisible(false);
    return c;
  }

  private makeSmallButton(
    x: number,
    y: number,
    label: string,
    color: number,
    cb: () => void,
    w = 210
  ) {
    return makeCandyButton(this, x, y, w, 110, label, undefined, color, cb, 36);
  }
}
