import Phaser from 'phaser';
import type { Province } from './types';
import { drawProvince, FONT } from './draw';
import { cardRect } from './uikit';
import FACTS_RAW from './data/facts.json';

export const FACTS = FACTS_RAW as Record<string, string>;

/**
 * 特征卡片：省份小轮廓 + 「这是XX」 + 一句话特征。
 * 半透明白底，边框颜色由调用方指定；返回以 (0,0) 为中心的容器，位置由调用方摆放。
 */
export function makeFactCard(
  scene: Phaser.Scene,
  p: Province,
  icon: string,
  borderColor: number,
  descOverride?: string
): Phaser.GameObjects.Container {
  const bw = 640;
  const bh = 180;
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  cardRect(g, 0, 0, bw, bh, 32, 0.94, borderColor);
  const shape = scene.add.graphics();
  const s = Math.min(120 / p.size[0], 120 / p.size[1]);
  drawProvince(shape, p, s, true);
  const xs = p.verts.map((v) => v[0]);
  const ys = p.verts.map((v) => v[1]);
  shape.setPosition(
    -bw / 2 + 95 - ((Math.min(...xs) + Math.max(...xs)) / 2) * s,
    -((Math.min(...ys) + Math.max(...ys)) / 2) * s
  );
  const name = scene.add
    .text(-bw / 2 + 180, -34, `${icon} 这是${p.display}`, {
      fontFamily: FONT,
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#2d3748',
    })
    .setOrigin(0, 0.5);
  const desc = scene.add
    .text(-bw / 2 + 180, 26, descOverride ?? FACTS[p.adcode] ?? '', {
      fontFamily: FONT,
      fontSize: '30px',
      color: '#4a5568',
      wordWrap: { width: bw - 220 },
    })
    .setOrigin(0, 0.5);
  c.add([g, shape, name, desc]);
  return c;
}
