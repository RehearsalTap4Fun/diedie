import Phaser from 'phaser';
import { PROVINCES, Province, activeShapes } from '../types';
import { getMode } from '../save';
import { drawProvince, FONT } from '../draw';
import { speakId } from '../speak';
import { Block, PhysProfile } from '../block';
import { saveLevel } from '../save';
import { CLUES } from '../data/clues';
import { getOwned, addOwned } from '../save';
import { makeFactCard } from '../ui';
import { Face } from '../face';
import { sfx } from '../sfx';
import {
  drawSceneBg,
  drawPlatform,
  panelRect,
  cardRect,
  candyCircle,
  makeCandyButton,
} from '../uikit';

const W = 750;
const H = 1334;
const LINE_BASE = 780; // 第 1 关目标线（约 3-5 块可达）
const LINE_STEP = 110; // 每关升高约一层块
const LINE_MIN = 450; // 封顶：再高会顶到出块悬浮区
const PLATFORM_Y = 1150;
const PLATFORM_W_BASE = 600; // 第 1 关平台宽度，逐关变窄（真人试玩反馈：省份形状不规则，底座要宽容）
const AIM_Y = 250; // 待放置块的悬浮高度
const DRAG_MAX_Y = 1140; // 底部旋转按钮区之上才响应拖动

type Phase = 'quiz' | 'aim' | 'drop' | 'win';

export default class GameScene extends Phaser.Scene {
  private choices = 4;
  private level = 1;
  private lineY = LINE_BASE;
  private platformW = PLATFORM_W_BASE;
  private prof!: PhysProfile;
  private phase: Phase = 'quiz';
  private pool: Province[] = [];
  private target!: Province;
  private blocks: Block[] = [];
  private quizUI?: Phaser.GameObjects.Container;
  private optionFaces: Face[] = [];
  private factUI?: Phaser.GameObjects.Container;
  private correctBox?: Phaser.GameObjects.Container;
  private answered = false;
  private wrongOnce = false;
  private aimView?: Phaser.GameObjects.Container;
  private aimFace?: Face;
  private aimProvince?: Province;
  private aimX = W / 2;
  private aimAngle = 0;
  private grabbing = false;
  private settleMs = 0;
  private rotateBtns: Phaser.GameObjects.Container[] = [];
  private header!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  init(data: { choices?: number; level?: number }) {
    this.choices = data.choices ?? 4;
    this.level = data.level ?? 1;
    this.lineY = Math.max(LINE_MIN, LINE_BASE - (this.level - 1) * LINE_STEP);
    // 难度曲线：关卡越高塔越「活」——惯量/摩擦/落地阻尼回落、更难休眠、平台变窄（第 6 关封顶）
    const t = Math.min(this.level - 1, 5);
    this.prof = {
      inertiaScale: Math.max(1.0, 2.2 - 0.25 * t),
      friction: Math.max(0.6, 1.0 - 0.08 * t),
      frictionStatic: Math.max(0.7, 1.2 - 0.1 * t),
      sleepThreshold: 30 + 12 * t,
      landDampX: Math.min(0.8, 0.25 + 0.12 * t),
      landDampAngular: Math.min(0.85, 0.3 + 0.12 * t),
    };
    this.platformW = Math.max(450, PLATFORM_W_BASE - 30 * t);
    this.phase = 'quiz';
    this.pool = [];
    this.blocks = [];
    this.quizUI = undefined;
    this.optionFaces = [];
    this.correctBox = undefined;
    this.answered = false;
    this.wrongOnce = false;
    this.aimView = undefined;
    this.aimFace = undefined;
    this.aimProvince = undefined;
    this.aimX = W / 2;
    this.aimAngle = 0;
    this.grabbing = false;
    this.settleMs = 0;
    this.rotateBtns = [];
  }

  create() {
    drawSceneBg(this, 0xa9ddf7, 0xfff4e0, {
      clouds: [
        [150, 150, 0.8],
        [590, 240, 0.6],
      ],
    });

    // 平台（物理 + 视觉），宽度随关卡变窄
    const pw = this.platformW;
    this.matter.add.rectangle(W / 2, PLATFORM_Y + 45, pw, 90, {
      isStatic: true,
      friction: 1,
    });
    drawPlatform(this, PLATFORM_Y, pw);

    // 目标虚线（随关卡升高）：圆头虚线更柔和
    const line = this.add.graphics();
    line.fillStyle(0xff8095, 1);
    for (let x = 60; x < W - 60; x += 44) {
      line.fillRoundedRect(x, this.lineY - 3, 26, 6, 3);
    }
    this.add.text(W - 56, this.lineY - 6, '🚩', { fontSize: '46px' }).setOrigin(1, 1);
    this.add
      .text(64, this.lineY - 12, '叠到这里就赢啦', {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#e05572',
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0, 1);
    if (this.level >= 3) speakId('sys-shaky');
    else if (this.level > 1) speakId('sys-higher');

    this.header = this.add
      .text(W / 2, 34, '', {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#5b4a3f',
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);
    this.hint = this.add
      .text(W / 2, AIM_Y + 190, '拖一拖挪位置，松手就放下', {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#8a7a6b',
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setVisible(false);

    // 单个顺时针旋转按钮，底部居中，位于底座下方不重叠
    this.rotateBtns = [this.makeRotateBtn(W / 2, 1282, '↻', Math.PI / 6)];

    if (!this.textures.exists('confetti')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false } as any);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 14, 14);
      g.generateTexture('confetti', 14, 14);
      g.destroy();
    }

    // 首次触地衰减速度（消二次弹跳）；已落稳块之间的明显磕碰播闷响
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

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'aim' || p.y > DRAG_MAX_Y) return;
      this.grabbing = true;
      this.moveAim(p.x);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.phase === 'aim' && this.grabbing) this.moveAim(p.x);
    });
    this.input.on('pointerup', () => {
      if (this.phase === 'aim' && this.grabbing) {
        this.grabbing = false;
        this.drop();
      }
    });

    this.refillPool();
    this.updateHeader();
    this.startQuiz();
  }

  update(_t: number, dt: number) {
    // 掉出平台正在坠落的块：自己换惊慌脸，并成为全塔视线焦点（任何阶段生效）
    let escaping: Block | undefined;
    for (const b of this.blocks) {
      b.capFallSpeed();
      b.sync();
      if (b.body.position.y > PLATFORM_Y + 60) {
        b.panic();
        if (!escaping || b.body.position.y > escaping.body.position.y) escaping = b;
      }
    }

    // 视线跟随优先级：坠落失误块 > 悬浮待放块 > 正常下落块
    const falling = this.phase === 'drop' ? this.blocks.find((b) => !b.landed) : undefined;
    const gazeTarget =
      escaping?.view ??
      (this.phase === 'aim' && this.aimView ? this.aimView : falling ? falling.view : undefined);
    for (const b of this.blocks) {
      if (gazeTarget && gazeTarget !== b.view) b.lookAt(gazeTarget.x, gazeTarget.y);
      else if (!gazeTarget) b.clearGaze();
    }

    if (this.aimView) {
      this.aimView.x = Phaser.Math.Linear(this.aimView.x, this.aimX, 0.35);
      this.aimView.rotation = Phaser.Math.Angle.RotateTo(this.aimView.rotation, this.aimAngle, 0.12);
    }

    // 掉出屏幕：任何阶段都回收（防物理体无限下坠），同伴集体惊讶
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (b.body.position.y > H + 350) {
        const p = b.province;
        b.destroy(this);
        this.blocks.splice(i, 1);
        this.updateHeader();
        this.blocks.forEach((o) => o.gasp());
        speakId('sys-fall');
        if (this.phase === 'drop') {
          // 放置阶段掉落：捞回来重放，不惩罚
          this.beginAim(p);
          return;
        }
        // 其他阶段掉落：塞回题池，稍后再问
        this.pool.unshift(p);
      }
    }

    if (this.phase !== 'drop') return;

    // 静止判定：全部块低速持续一段时间后结算
    const moving = this.blocks.some(
      (b) => !b.body.isSleeping && (b.body.speed > 0.18 || b.body.angularSpeed > 0.03)
    );
    this.settleMs = moving ? 0 : this.settleMs + dt;
    if (this.settleMs < 650) return;

    const topY = Math.min(...this.blocks.map((b) => b.body.bounds.min.y));
    if (topY <= this.lineY) this.win();
    else this.startQuiz();
  }

  // ---------- 答题 ----------

  private refillPool() {
    // 第 1-2 关先用大块（好落稳、涨高度快），第 3 关起全部进池（省份/动物同规则）
    const shapes = activeShapes();
    const candidates =
      this.level >= 3 ? [...shapes] : shapes.filter((p) => Math.max(p.size[0], p.size[1]) >= 170);
    this.pool = Phaser.Utils.Array.Shuffle(candidates);
  }

  private startQuiz() {
    this.phase = 'quiz';
    this.answered = false;
    this.wrongOnce = false;
    this.factUI?.destroy();
    this.factUI = undefined;
    if (this.pool.length === 0) this.refillPool();
    // 调试钩子：?force=510000-0 时强制目标省份到队首
    const forceParam = new URLSearchParams(location.search).get('force');
    if (forceParam) {
      const t = PROVINCES.find((p) => p.adcode === forceParam.split('-')[0]);
      if (t) this.pool = [t, ...this.pool.filter((p) => p !== t)];
    }
    this.target = this.pool[0];
    const others = Phaser.Utils.Array.Shuffle(
      activeShapes().filter((p) => p !== this.target)
    ).slice(0, this.choices - 1);
    const options = Phaser.Utils.Array.Shuffle([this.target, ...others]);

    // 大大班 45% 概率出线索题（动物/美食/地标），小小班只出认轮廓题
    const clues = CLUES[this.target.adcode] ?? [];
    let qtext = `找一找：${this.target.display} 在哪里？`;
    let emoji: string | undefined;
    let artKey: string | undefined;
    let voiceId = `q-name-${this.target.adcode}`;
    const forceIdx =
      forceParam && forceParam.startsWith(`${this.target.adcode}-`)
        ? Number(forceParam.split('-')[1])
        : -1;
    if (
      (this.choices === 4 && clues.length > 0 && Math.random() < 0.45) ||
      (forceIdx >= 0 && clues[forceIdx])
    ) {
      const idx = forceIdx >= 0 && clues[forceIdx] ? forceIdx : Math.floor(Math.random() * clues.length);
      qtext = clues[idx].q;
      emoji = clues[idx].e;
      artKey = `art-${this.target.adcode}-${idx}`;
      voiceId = `clue-${this.target.adcode}-${idx}`;
    }
    this.quizUI = this.buildQuizPanel(options, qtext, emoji, artKey);
    // 排队播放：等关卡提示（要叠得更高哦）或上一条反馈播完，避免互相打断
    speakId(voiceId, { queue: true });
  }

  private buildQuizPanel(options: Province[], qtext: string, emoji?: string, artKey?: string) {
    const c = this.add.container(0, 0).setDepth(50);
    const dim = this.add
      .rectangle(W / 2, H / 2, W, H, 0x2d3748, 0.35)
      .setInteractive(); // 挡住底层输入
    const panel = this.add.graphics();
    panelRect(panel, 35, 120, W - 70, 980, 44);
    const q = this.add
      .text(W / 2, 220, qtext, {
        fontFamily: FONT,
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#7a5b2e',
        align: 'center',
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5);
    q.setShadow(0, 2, 'rgba(122,91,46,0.18)', 2, false, true);
    // 线索题优先显示手绘插画，未覆盖的回退 emoji；认轮廓题显示提示语
    const sub =
      artKey && this.textures.exists(artKey)
        ? this.add.image(W / 2, 342, artKey).setDisplaySize(150, 150)
        : emoji
          ? this.add.text(W / 2, 350, emoji, { fontSize: '96px' }).setOrigin(0.5)
          : this.add
              .text(W / 2, 330, '🔊 答对了就能拿到它哦', {
                fontFamily: FONT,
                fontSize: '30px',
                color: '#a0793d',
              })
              .setOrigin(0.5);
    c.add([dim, panel, q, sub]);

    const slots: [number, number][] =
      this.choices === 2
        ? [
            [W / 2 - 170, 700],
            [W / 2 + 170, 700],
          ]
        : [
            [W / 2 - 165, 560],
            [W / 2 + 165, 560],
            [W / 2 - 165, 880],
            [W / 2 + 165, 880],
          ];
    options.forEach((p, i) => {
      const box = this.buildOption(p, slots[i][0], slots[i][1]);
      if (p === this.target) this.correctBox = box;
      c.add(box);
    });
    return c;
  }

  private buildOption(p: Province, x: number, y: number) {
    const bw = this.choices === 2 ? 320 : 300;
    const bh = this.choices === 2 ? 400 : 290;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    cardRect(g, 0, 0, bw, bh, 28);

    const s = Math.min((bw - 56) / p.size[0], (bh - 56) / p.size[1]);
    const bodyG = this.add.graphics();
    drawProvince(bodyG, p, s, false);
    // 顽皮表情：等待选择时随机眨眼/瞪眼
    const face = new Face(this, p, s, true);
    this.optionFaces.push(face);
    // 顶点以质心为原点，包围盒中心另算，平移使轮廓在框内居中
    const xs = p.verts.map((v) => v[0]);
    const ys = p.verts.map((v) => v[1]);
    const inner = this.add.container(
      (-(Math.min(...xs) + Math.max(...xs)) / 2) * s,
      (-(Math.min(...ys) + Math.max(...ys)) / 2) * s,
      [bodyG, face.g]
    );
    c.add([g, inner]);
    c.setSize(bw, bh);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this.onOption(p, c));
    return c;
  }

  private onOption(p: Province, box: Phaser.GameObjects.Container) {
    if (this.phase !== 'quiz' || this.answered) return;
    const ok = p === this.target;
    // 无论对错，都展示并播报所点省份的名字和一句话特征——每次点击都是认知机会
    this.showFact(p, ok);
    if (ok) {
      this.answered = true;
      this.pool.shift();
      speakId(`fact-ok-${p.adcode}`);
      this.tweens.add({ targets: box, scale: 1.12, duration: 140, yoyo: true });
      // 留足时间读完特征卡片再进入放置
      this.time.delayedCall(2400, () => {
        this.factUI?.destroy();
        this.factUI = undefined;
        this.optionFaces.forEach((f) => f.destroy());
        this.optionFaces = [];
        this.quizUI?.destroy();
        this.quizUI = undefined;
        this.correctBox = undefined;
        this.beginAim(p);
      });
    } else {
      speakId(`fact-no-${p.adcode}`);
      this.tweens.add({ targets: box, x: box.x + 12, duration: 50, yoyo: true, repeat: 3 });
      box.setAlpha(0.4);
      box.disableInteractive();
      // 答错一次后正确项轻轻跳动提示，保证孩子总能过
      if (!this.wrongOnce && this.correctBox) {
        this.wrongOnce = true;
        this.tweens.add({
          targets: this.correctBox,
          scale: { from: 1, to: 1.07 },
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  /** 点选反馈卡片：省份小轮廓 + 名字 + 一句话特征 */
  private showFact(p: Province, ok: boolean) {
    this.factUI?.destroy();
    const color = Phaser.Display.Color.HexStringToColor(p.color).color;
    // 放在面板顶部（题干区上方），半透明，不遮挡选项
    const c = makeFactCard(this, p, ok ? '✅' : '💡', ok ? 0x48bb78 : color);
    c.setPosition(W / 2, 250).setDepth(60);
    c.setScale(0.85);
    this.tweens.add({ targets: c, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.factUI = c;
    if (!ok) {
      // 答错的卡片停留一会儿自动消失，不挡继续作答
      this.time.delayedCall(2100, () => {
        if (this.factUI === c) {
          this.tweens.add({
            targets: c,
            alpha: 0,
            duration: 250,
            onComplete: () => {
              if (this.factUI === c) this.factUI = undefined;
              c.destroy();
            },
          });
        }
      });
    }
  }

  // ---------- 放置与堆叠 ----------

  private beginAim(p: Province) {
    this.phase = 'aim';
    this.aimProvince = p;
    this.aimX = W / 2;
    this.aimAngle = 0;
    const bodyG = this.add.graphics();
    drawProvince(bodyG, p, 1, false);
    this.aimFace = new Face(this, p, 1);
    this.aimView = this.add.container(this.aimX, AIM_Y, [bodyG, this.aimFace.g]);
    this.rotateBtns.forEach((b) => b.setVisible(true));
    // 引导提示只在第 1 关首次放块时出现，减少画面干扰
    this.hint.setVisible(this.level === 1 && this.blocks.length === 0);
    // 放块提示音只在第 1 关首块播（避免打断刚播完的特征语音）
    if (this.level === 1 && this.blocks.length === 0) speakId(`aim-${p.adcode}`);
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
    this.hint.setVisible(false);
    sfx('whoosh');
    this.blocks.push(new Block(this, p, x, y, angle, this.prof));
    this.settleMs = 0;
    this.updateHeader();
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

  // ---------- 结算 ----------

  private updateHeader() {
    this.header.setText(`第 ${this.level} 关 · 已叠 ${this.blocks.length} 块`);
  }

  private win() {
    this.phase = 'win';
    saveLevel(this.choices, this.level + 1);
    // 收集本关叠过的省份，点亮地图
    const stacked = [...new Set(this.blocks.map((b) => b.province.adcode))];
    const ownedBefore = new Set(getOwned());
    const newly = this.blocks
      .map((b) => b.province)
      .filter((p, i, arr) => arr.indexOf(p) === i && !ownedBefore.has(p.adcode));
    addOwned(stacked);
    speakId('sys-win');
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

    // 布局自适应：新收集 ≤5 个单排，>5 个双排缩小并加高面板，保证全部显示
    const n = newly.length;
    const rows = n > 5 ? 2 : 1;
    const perRow = rows === 2 ? Math.ceil(n / 2) : n;
    const size = Math.min(86, perRow > 0 ? (560 - (perRow - 1) * 14) / perRow : 86);
    const spacing = size + 14;
    const panelH = rows === 2 ? 540 : 470;
    const shapeY0 = rows === 2 ? 690 : 710;
    const btnY = rows === 2 ? 895 : 825;

    const c = this.add.container(0, 0).setDepth(90);
    const panel = this.add.graphics();
    panelRect(panel, 40, 430, W - 80, panelH, 48);
    const t1 = this.add
      .text(W / 2, 550, `🎉 第 ${this.level} 关达成！`, {
        fontFamily: FONT,
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#e8a23d',
        stroke: '#ffffff',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    t1.setShadow(0, 3, 'rgba(122,91,46,0.25)', 4, false, true);
    const nextHigher = this.lineY > LINE_MIN;
    const t2 = this.add
      .text(
        W / 2,
        630,
        n
          ? `新收集 ${n} 个${getMode() === 'animal' ? '动物' : '省份'}！`
          : `叠了 ${this.blocks.length} 块${nextHigher ? ' · 下一关线更高哦' : ''}`,
        {
          fontFamily: FONT,
          fontSize: '36px',
          color: '#744210',
        }
      )
      .setOrigin(0.5);
    c.add([panel, t1, t2]);
    // 新收集省份的小轮廓全部展示
    newly.forEach((p, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowCount = Math.min(perRow, n - row * perRow);
      const g = this.add.graphics();
      const s = size / Math.max(p.size[0], p.size[1]);
      drawProvince(g, p, s, true);
      g.setPosition(
        W / 2 + (col - (rowCount - 1) / 2) * spacing,
        shapeY0 + row * (size + 18)
      );
      g.setScale(0);
      this.tweens.add({ targets: g, scale: 1, delay: 200 + i * 110, duration: 260, ease: 'Back.easeOut' });
      c.add(g);
    });
    c.add(
      this.makeSmallButton(160, btnY, '下一关', 0x48bb78, () =>
        this.scene.restart({ choices: this.choices, level: this.level + 1 })
      )
    );
    const animalMode = getMode() === 'animal';
    c.add(
      this.makeSmallButton(W / 2, btnY, animalMode ? '动物图鉴' : '我的地图', 0xf6ad55, () =>
        this.scene.start(animalMode ? 'dex' : 'map')
      )
    );
    c.add(this.makeSmallButton(W - 160, btnY, '回菜单', 0x4299e1, () => this.scene.start('menu')));
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
