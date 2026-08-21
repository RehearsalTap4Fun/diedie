// M0 冒烟测试：系统 Chrome 无头打开游戏，走通 菜单→答题→堆叠 并截图
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } }); // 手机竖屏比例

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOT_DIR}/1-menu.png` });

// 画布中心坐标换算：设计分辨率 750x1334，Phaser FIT 缩放
const canvas = await page.locator('canvas').boundingBox();
if (!canvas) throw new Error('canvas 未渲染');
const pt = (dx, dy) => ({
  x: canvas.x + (dx / 750) * canvas.width,
  y: canvas.y + (dy / 1334) * canvas.height,
});

// 点「大大班 · 四选一」按钮（设计坐标 375,940）
let p = pt(375, 940);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOT_DIR}/2-quiz.png` });

// 依次点四个选项（总有一个是对的），点完等待进入放置阶段
const slots = [
  [210, 560],
  [540, 560],
  [210, 880],
  [540, 880],
];
for (const [sx, sy] of slots) {
  p = pt(sx, sy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(700);
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOT_DIR}/3-aim.png` });

// 拖动到偏左位置并松手放下
const from = pt(375, 400);
const to = pt(300, 400);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT_DIR}/4-dropped.png` });

console.log(errors.length ? `❌ 控制台错误 ${errors.length} 条:\n` + errors.join('\n') : '✅ 无控制台错误');
await browser.close();
