import Phaser from 'phaser';
import decomp from 'poly-decomp';
import MenuScene from './scenes/MenuScene';
import GameScene from './scenes/GameScene';
import MapScene from './scenes/MapScene';
import PuzzleScene from './scenes/PuzzleScene';
import VersusScene from './scenes/VersusScene';
import DexScene from './scenes/DexScene';

// 省份轮廓是凹多边形，Matter 需要凸分解库才能生成刚体
(Phaser.Physics.Matter as any).Matter.Common.setDecomp(decomp);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 750,
  height: 1334,
  backgroundColor: '#aee3f5',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0.9 },
      enableSleeping: true,
      // 提高求解器迭代，减少高速落地时穿透修正造成的回弹
      positionIterations: 10,
      velocityIterations: 8,
    },
  },
  scene: [MenuScene, GameScene, MapScene, PuzzleScene, VersusScene, DexScene],
});

// 冒烟测试用：暴露 game 实例供自动化脚本读取场景状态
(window as any).__game = game;
