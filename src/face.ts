import Phaser from 'phaser';
import type { Province } from './types';
import { drawFace, FaceMood, Gaze } from './draw';

/**
 * 动态表情组件：独立 Graphics（与省块身体同一质心坐标系，放进同一个 Container）。
 * - 自带随机眨眼；playful 模式下 30% 概率闪现「哇」瞪眼（答题选项用）
 * - setGaze 控制瞳孔视线方向（视线跟随），量化到 0.2 步长避免每帧重绘
 */
export class Face {
  readonly g: Phaser.GameObjects.Graphics;
  private mood: FaceMood = 'normal';
  private gaze: Gaze | null = null;
  private dead = false;
  private timer?: Phaser.Time.TimerEvent;

  constructor(
    private scene: Phaser.Scene,
    private p: Province,
    private scale = 1,
    private playful = false
  ) {
    this.g = scene.add.graphics();
    this.redraw(this.mood);
    this.scheduleBlink();
  }

  setMood(m: FaceMood) {
    if (this.dead) return;
    this.mood = m;
    this.redraw(m);
  }

  /** 视线方向（-1..1），传 null 恢复默认视线；仅微笑表情下生效 */
  setGaze(x: number | null, y = 0) {
    if (this.dead) return;
    if (x === null) {
      if (this.gaze) {
        this.gaze = null;
        if (this.mood === 'normal') this.redraw('normal');
      }
      return;
    }
    const qx = Phaser.Math.Clamp(Math.round(x * 5) / 5, -1, 1);
    const qy = Phaser.Math.Clamp(Math.round(y * 5) / 5, -1, 1);
    if (this.gaze && this.gaze.x === qx && this.gaze.y === qy) return;
    this.gaze = { x: qx, y: qy };
    if (this.mood === 'normal') this.redraw('normal');
  }

  private redraw(m: FaceMood) {
    if (this.dead || !this.g.active) return;
    this.g.clear();
    drawFace(this.g, this.p, this.scale, m, this.gaze);
  }

  private scheduleBlink() {
    this.timer = this.scene.time.addEvent({
      delay: 1600 + Math.random() * 2800,
      callback: () => {
        if (this.dead) return;
        if (this.mood === 'normal') {
          const wow = this.playful && Math.random() < 0.3;
          this.redraw(wow ? 'wow' : 'blink');
          this.scene.time.delayedCall(wow ? 300 : 130, () => {
            if (!this.dead && this.mood === 'normal') this.redraw('normal');
          });
        }
        this.scheduleBlink();
      },
    });
  }

  destroy() {
    this.dead = true;
    this.timer?.remove();
    this.g.destroy();
  }
}
