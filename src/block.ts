import Phaser from 'phaser';
import type { Province } from './types';
import { drawProvince } from './draw';
import { Face } from './face';
import { sfx } from './sfx';

const MAX_FALL_SPEED = 15;
const DEBUG_PHYS = new URLSearchParams(location.search).has('debug');

/** 随关卡递进的物理难度参数 */
export interface PhysProfile {
  friction: number;
  frictionStatic: number;
  sleepThreshold: number;
  /** 转动惯量倍率：越小越容易翻滚 */
  inertiaScale: number;
  /** 落地时水平速度保留比例：越大落地越「滑」 */
  landDampX: number;
  /** 落地时角速度保留比例：越大落地越「晃」 */
  landDampAngular: number;
}

/** 已落下的省份块：物理用平滑轮廓（phys），渲染用精细轮廓（verts）+ 动态表情 */
export class Block {
  readonly province: Province;
  readonly body: any;
  readonly view: Phaser.GameObjects.Container;
  /** 是否已首次触地（触地瞬间衰减速度消除二次弹跳） */
  landed = false;
  private panicking = false;
  private face: Face;
  private offX: number;
  private offY: number;

  constructor(
    private scene: Phaser.Scene,
    p: Province,
    x: number,
    y: number,
    angle: number,
    private prof: PhysProfile
  ) {
    this.province = p;
    const Matter = (Phaser.Physics.Matter as any).Matter;
    const verts = p.phys.map(([vx, vy]) => ({ x: vx, y: vy }));
    const body = Matter.Bodies.fromVertices(
      x,
      y,
      [verts],
      {
        friction: prof.friction,
        frictionStatic: prof.frictionStatic,
        restitution: 0,
        frictionAir: 0.02,
        sleepThreshold: prof.sleepThreshold,
      },
      true,
      0.01,
      10
    );
    // 低关卡加大转动惯量帮小朋友稳住，高关卡逐渐回落增加晃动
    Matter.Body.setInertia(body, body.inertia * prof.inertiaScale);
    scene.matter.world.add(body);
    this.body = body;

    // 凸分解后的质心与几何中心存在偏差，在角度为 0 时用物理轮廓的包围盒
    // 中心标定图形偏移（verts 与 phys 同一坐标系，对齐物理即对齐视觉）
    const bcx = (body.bounds.min.x + body.bounds.max.x) / 2;
    const bcy = (body.bounds.min.y + body.bounds.max.y) / 2;
    const xs = p.phys.map((v) => v[0]);
    const ys = p.phys.map((v) => v[1]);
    const rbcx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const rbcy = (Math.min(...ys) + Math.max(...ys)) / 2;
    this.offX = bcx - x - rbcx;
    this.offY = bcy - y - rbcy;
    if (angle !== 0) Matter.Body.setAngle(body, angle);

    const bodyG = scene.add.graphics();
    drawProvince(bodyG, p, 1, false);
    if (DEBUG_PHYS) {
      bodyG.lineStyle(3, 0xff0000, 0.55);
      bodyG.strokePoints(
        p.phys.map(([px, py]) => new Phaser.Geom.Point(px, py)),
        true,
        true
      );
    }
    this.face = new Face(scene, p, 1);
    this.face.setMood('wow'); // 下落中的惊讶脸
    this.view = scene.add.container(0, 0, [bodyG, this.face.g]);
    this.sync();
  }

  /** 首次触地：减震防二次弹跳 + 压扁回弹 + 眯眼再恢复微笑 */
  onFirstContact() {
    if (this.landed) return;
    this.landed = true;
    const Matter = (Phaser.Physics.Matter as any).Matter;
    const v = this.body.velocity;
    Matter.Body.setVelocity(this.body, { x: v.x * this.prof.landDampX, y: v.y * 0.15 });
    Matter.Body.setAngularVelocity(this.body, this.body.angularVelocity * this.prof.landDampAngular);

    sfx('boing');
    this.scene.tweens.add({
      targets: this.view,
      scaleX: 1.1,
      scaleY: 0.86,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.face.setMood('squint');
    this.scene.time.delayedCall(400, () => this.face.setMood('normal'));
  }

  /** 掉出平台正在坠落：换上惊慌脸（一次性，直到被回收） */
  panic() {
    if (this.panicking) return;
    this.panicking = true;
    this.face.setMood('wow');
  }

  get isPanicking() {
    return this.panicking;
  }

  /** 同伴掉出屏幕：集体惊讶一下再恢复 */
  gasp() {
    if (this.panicking) return;
    this.face.setMood('wow');
    this.scene.time.delayedCall(700, () => {
      if (!this.panicking) this.face.setMood('normal');
    });
  }

  /** 看向世界坐标某点（视线跟随）：方向反变换到块的旋转局部系 */
  lookAt(wx: number, wy: number) {
    const dx = wx - this.view.x;
    const dy = wy - this.view.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 30) {
      this.face.setGaze(null);
      return;
    }
    const a = -this.view.rotation;
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.face.setGaze((dx * c - dy * s) / dist, (dx * s + dy * c) / dist);
  }

  clearGaze() {
    this.face.setGaze(null);
  }

  /** 下落限速，降低落地冲击 */
  capFallSpeed() {
    if (this.landed) return;
    const v = this.body.velocity;
    if (v.y > MAX_FALL_SPEED) {
      const Matter = (Phaser.Physics.Matter as any).Matter;
      Matter.Body.setVelocity(this.body, { x: v.x, y: MAX_FALL_SPEED });
    }
  }

  sync() {
    const a = this.body.angle;
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.view.setPosition(
      this.body.position.x + this.offX * c - this.offY * s,
      this.body.position.y + this.offX * s + this.offY * c
    );
    this.view.setRotation(a);
  }

  destroy(scene: Phaser.Scene) {
    scene.matter.world.remove(this.body);
    this.face.destroy();
    this.view.destroy();
  }
}
