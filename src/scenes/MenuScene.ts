import Phaser from 'phaser';
import { PROVINCES, ANIMALS, activeShapes } from '../types';
import { drawProvince, FONT } from '../draw';
import {
  savedLevel,
  hasProgress,
  resetProgress,
  getOwned,
  getActiveProfile,
  setActiveProfile,
  profileSummary,
  PROFILE_AVATARS,
  getMode,
  setMode,
  getSoundSettings,
  setSoundOption,
  SoundSettings,
  getChoices,
  setChoices,
  restoreProfile,
  ProfileSnapshot,
  PROFILE_NAMES,
} from '../save';
import { speakId } from '../speak';
import { installArtTextures } from '../art';
import { Face } from '../face';
import {
  drawSceneBg,
  fancyTitle,
  makeCandyButton,
  candyRect,
  panelRect,
  makeIconButton,
  showUndoBar,
} from '../uikit';

const W = 750;
const H = 1334;

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(data?: { undo?: ProfileSnapshot }) {
    installArtTextures(this);
    drawSceneBg(this, 0xa9ddf7, 0xfff4e0, { sun: true });

    // 档案头像行：点头像换小朋友，各自独立进度
    const active = getActiveProfile();
    PROFILE_AVATARS.forEach((emoji, i) => {
      const isOn = i === active;
      const x = W / 2 + (i - 1) * 130;
      const c = this.add.container(x, 158);
      const g = this.add.graphics();
      g.fillStyle(0x2b3a4a, 0.14);
      g.fillCircle(0, 7, 46);
      g.fillStyle(0xffffff, isOn ? 1 : 0.7);
      g.fillCircle(0, 0, 46);
      g.lineStyle(6, isOn ? 0x5ec97e : 0xdfd8ca, 1);
      g.strokeCircle(0, 0, 43);
      const t = this.add.text(0, -2, emoji, { fontSize: '46px' }).setOrigin(0.5);
      c.add([g, t]);
      if (isOn) c.setScale(1.12);
      else {
        c.setAlpha(0.75);
        const sum = profileSummary(i);
        if (sum.hasAny) {
          const badge = this.add
            .text(0, 36, `${sum.ownedCount}`, {
              fontFamily: FONT,
              fontSize: '20px',
              color: '#718096',
            })
            .setOrigin(0.5);
          c.add(badge);
        }
      }
      c.setSize(100, 100);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => {
        if (i === active) return;
        setActiveProfile(i);
        speakId(`sys-prof-${i}`);
        this.scene.restart();
      });
    });

    // 声音设置入口（家长用，左上角避开头像行）
    this.makeSettingsBtn();

    fancyTitle(this, W / 2, 290, '叠叠中国', 116, '#3a7bc8');
    const animalMode = getMode() === 'animal';
    this.add
      .text(W / 2, 396, animalMode ? '认一认 · 叠一叠 · 动物朋友' : '认一认 · 叠一叠 · 我们的省份', {
        fontFamily: FONT,
        fontSize: '36px',
        color: '#5b4a3f',
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // 全局模式切换：叠省份 / 叠动物
    this.makeModeToggle(animalMode);

    // 漂浮的装饰块（会眨眼，跟随当前模式）
    const deco = Phaser.Utils.Array.Shuffle([...activeShapes()]).slice(0, 3);
    deco.forEach((p, i) => {
      const s = 150 / Math.max(p.size[0], p.size[1]);
      const bodyG = this.add.graphics();
      drawProvince(bodyG, p, s, false);
      const face = new Face(this, p, s, true);
      const c = this.add.container(170 + i * 205, 655, [bodyG, face.g]);
      this.tweens.add({
        targets: c,
        y: '+=16',
        angle: i % 2 ? 5 : -5,
        duration: 1500 + i * 280,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // 单一闯关入口（固定四选一），主 CTA 更大更醒目
    const l4 = savedLevel(4);
    makeCandyButton(
      this,
      W / 2,
      930,
      520,
      150,
      '开始闯关',
      l4 > 1 ? `继续第 ${l4} 关` : '认一认 · 叠一叠',
      0x4aa3ec,
      () => this.scene.start('game', { choices: getChoices(), level: l4 }),
      52
    );
    this.makeButton(
      W / 2,
      1090,
      '双人竞技 · 轮流叠',
      '🐼 和 🐯 谁把塔弄倒谁就输',
      0xef5350,
      () => this.scene.start('versus')
    );

    if (animalMode) {
      // 动物模式：底部一个宽按钮进图鉴（拼图是地图专属玩法，切回省份模式可玩）
      const ownedA = getOwned('animal').length;
      this.makeButton(
        W / 2,
        1225,
        '动物图鉴',
        `已收集 ${ownedA} / ${ANIMALS.length}`,
        0xf6ad55,
        () => this.scene.start('dex')
      );
    } else {
      const ownedCount = getOwned('province').length;
      this.makeButton(
        212,
        1225,
        '我的地图',
        `已收集 ${ownedCount} / ${PROVINCES.length}`,
        0xf6ad55,
        () => this.scene.start('map'),
        300
      );
      const puzzleUnlocked = ownedCount >= 5;
      this.makeButton(
        538,
        1225,
        '省份拼图',
        puzzleUnlocked ? '拖一拖拼地图' : `集满 5 省解锁（${ownedCount}/5）`,
        puzzleUnlocked ? 0x9575cd : 0xb0bec5,
        () => {
          if (puzzleUnlocked) this.scene.start('puzzle');
          else speakId('sys-puzzle-locked');
        },
        300
      );
    }

    // 底部只留版权脚注（重置进度移进家长设置，避免孩子误触）
    this.add
      .text(
        W / 2,
        1318,
        animalMode
          ? '原型版 · 动物剪影来自 PhyloPic（CC0/CC-BY）'
          : '原型版 · 轮廓改绘自标准地图（DataV·GeoAtlas）',
        {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#718096',
        }
      )
      .setOrigin(0.5);

    // 刚重置过：给撤销机会（误操作靠撤销兜底，不做二次确认）
    if (data?.undo) {
      const snap = data.undo;
      showUndoBar(this, `${PROFILE_NAMES[snap.index]}的进度已清空`, () => {
        restoreProfile(snap);
        speakId('sys-undo');
        this.scene.restart();
      });
    }
  }

  private makeSettingsBtn() {
    makeIconButton(this, 64, 64, 38, 'gear', () => this.openSettings(), { ring: 0xe4dccb, hit: 116 });
  }

  /** 家长设置面板：四个声音频道开关 + 当前档案的题目难度 + 清空当前档案进度，即时保存 */
  private openSettings() {
    const c = this.add.container(0, 0).setDepth(120);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x2d3748, 0.4).setInteractive();
    const panel = this.add.graphics();
    panelRect(panel, 60, 200, 630, 1000, 44);
    const title = this.add
      .text(W / 2, 290, '家长设置', {
        fontFamily: FONT,
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#7a5b2e',
      })
      .setOrigin(0.5);
    c.add([dim, panel, title]);

    const ROWS: { key: keyof SoundSettings; label: string; sub: string }[] = [
      { key: 'quiz', label: '答题语音', sub: '题目播报、答对答错反馈' },
      { key: 'hint', label: '提示语音', sub: '过关庆祝、关卡提示、竞技拼图' },
      { key: 'tap', label: '点击播报', sub: '图鉴、地图、菜单的点按介绍' },
      { key: 'sfx', label: '叠叠音效', sub: '旋转、下落、弹跳、磕碰' },
    ];
    ROWS.forEach((row, i) => {
      const y = 390 + i * 96;
      const label = this.add.text(125, y - 26, row.label, {
        fontFamily: FONT,
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#5b4a3f',
      });
      const sub = this.add.text(125, y + 12, row.sub, {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#8a7a6b',
      });
      c.add([label, sub]);
      c.add(this.makeToggle(560, y, row.key));
    });

    // 分隔线以下是「当前档案」的设置
    const who = PROFILE_NAMES[getActiveProfile()];
    const sep = this.add.graphics();
    sep.fillStyle(0xe4dccb, 1);
    sep.fillRoundedRect(110, 772, 530, 4, 2);
    const whoT = this.add
      .text(W / 2, 812, `以下只对「${PROFILE_AVATARS[getActiveProfile()]} ${who}」生效`, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#8a7a6b',
      })
      .setOrigin(0.5);
    const diffT = this.add.text(125, 858, '题目难度', {
      fontFamily: FONT,
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#5b4a3f',
    });
    const diffSub = this.add.text(125, 896, '小一点的孩子选二选一', {
      fontFamily: FONT,
      fontSize: '20px',
      color: '#8a7a6b',
    });
    c.add([sep, whoT, diffT, diffSub, this.makeChoiceSeg(528, 884)]);

    if (hasProgress()) {
      c.add(
        makeCandyButton(this, W / 2, 1000, 420, 88, `清空${who}的进度`, undefined, 0xe07a6a, () => {
          const snap = resetProgress();
          speakId('sys-reset');
          this.scene.restart({ undo: snap });
        }, 30)
      );
    }

    c.add(
      makeCandyButton(this, W / 2, 1116, 260, 96, '好 的', undefined, 0x4aa3ec, () => c.destroy(), 36)
    );
  }

  /** 二选一 / 四选一 分段选择，即点即存 */
  private makeChoiceSeg(cx: number, cy: number) {
    const c = this.add.container(cx, cy);
    const segW = 110;
    const h = 72;
    const g = this.add.graphics();
    const labels: Phaser.GameObjects.Text[] = [];
    const opts: (2 | 4)[] = [2, 4];
    const draw = () => {
      const cur = getChoices();
      g.clear();
      g.fillStyle(0x2b3a4a, 0.12);
      g.fillRoundedRect(-segW, -h / 2 + 5, segW * 2, h, h / 2);
      g.fillStyle(0xf1ece0, 1);
      g.fillRoundedRect(-segW, -h / 2, segW * 2, h, h / 2);
      const i = opts.indexOf(cur);
      candyRect(g, -segW / 2 + i * segW, 0, segW - 8, h - 10, (h - 10) / 2, 0x5ec97e);
      labels.forEach((t, k) => t.setColor(k === i ? '#ffffff' : '#8a7a6b'));
    };
    opts.forEach((n, k) => {
      const t = this.add
        .text(-segW / 2 + k * segW, -2, n === 2 ? '二选一' : '四选一', {
          fontFamily: FONT,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#8a7a6b',
        })
        .setOrigin(0.5);
      labels.push(t);
      const z = this.add.zone(-segW / 2 + k * segW, 0, segW, 100).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        setChoices(n);
        draw();
      });
      c.add(z);
    });
    c.add([g, ...labels]);
    draw();
    return c;
  }

  /** 迷你开关：即点即存，重绘状态 */
  private makeToggle(x: number, y: number, key: keyof SoundSettings) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const draw = () => {
      const on = getSoundSettings()[key];
      g.clear();
      g.fillStyle(0x2b3a4a, 0.14);
      g.fillRoundedRect(-48, -21, 96, 52, 26);
      g.fillStyle(on ? 0x5ec97e : 0xd8d2c6, 1);
      g.fillRoundedRect(-48, -26, 96, 52, 26);
      g.fillStyle(0x2b3a4a, 0.12);
      g.fillCircle(on ? 22 : -22, 3, 20);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(on ? 22 : -22, 0, 20);
    };
    draw();
    c.add(g);
    c.setSize(150, 96);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      setSoundOption(key, !getSoundSettings()[key]);
      draw();
      this.tweens.add({ targets: c, scale: 0.9, duration: 60, yoyo: true });
    });
    return c;
  }

  /** 模式切换胶囊：叠省份 | 叠动物，点未选中的一侧切换并重进菜单 */
  private makeModeToggle(animalMode: boolean) {
    const y = 460;
    const w = 420;
    const h = 72;
    const seg = w / 2;
    const track = this.add.graphics();
    track.fillStyle(0x2b3a4a, 0.14);
    track.fillRoundedRect(W / 2 - w / 2, y - h / 2 + 6, w, h, h / 2);
    track.fillStyle(0xffffff, 0.9);
    track.fillRoundedRect(W / 2 - w / 2, y - h / 2, w, h, h / 2);
    track.lineStyle(4, 0xe4dccb, 1);
    track.strokeRoundedRect(W / 2 - w / 2, y - h / 2, w, h, h / 2);
    const knob = this.add.graphics();
    candyRect(
      knob,
      W / 2 - w / 2 + (animalMode ? seg : 0) + seg / 2,
      y,
      seg - 8,
      h - 10,
      (h - 10) / 2,
      animalMode ? 0x5ec97e : 0x4aa3ec
    );
    const mk = (x: number, label: string, on: boolean, target: 'province' | 'animal') => {
      this.add
        .text(x, y, label, {
          fontFamily: FONT,
          fontSize: '30px',
          fontStyle: 'bold',
          color: on ? '#ffffff' : '#718096',
        })
        .setOrigin(0.5);
      // 命中区比胶囊高：手机上胶囊只有约 37pt 高
      const zone = this.add.zone(x, y, seg, 110).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (on) return;
        setMode(target);
        speakId(target === 'animal' ? 'sys-mode-animal' : 'sys-mode-province');
        this.scene.restart();
      });
    };
    mk(W / 2 - seg / 2, '🗺️ 叠省份', !animalMode, 'province');
    mk(W / 2 + seg / 2, '🐾 叠动物', animalMode, 'animal');
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    sub: string | undefined,
    color: number,
    cb: () => void,
    w = 520
  ) {
    const narrow = w < 400;
    makeCandyButton(this, x, y, w, 128, label, sub, color, cb, narrow ? 38 : sub ? 42 : 46);
  }
}
