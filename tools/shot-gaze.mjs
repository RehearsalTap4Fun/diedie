// 视线跟随验证：叠 2 块后，悬浮块拖到左/右两侧各截一张，对比塔上瞳孔方向
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const canvas = await page.locator('canvas').boundingBox();
const pt = (dx, dy) => ({ x: canvas.x + (dx / 750) * canvas.width, y: canvas.y + (dy / 1334) * canvas.height });
const click = async (dx, dy, wait = 300) => {
  const p = pt(dx, dy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};
const phase = () => page.evaluate(() => window.__game.scene.getScene('game')?.phase);
const waitPhase = async (want, ms = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (want.includes(await phase())) return true;
    await page.waitForTimeout(200);
  }
  return false;
};

await click(375, 940, 1500); // 大大班

// 叠 2 块
for (let n = 0; n < 2; n++) {
  for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
    await click(sx, sy, 250);
    if (await waitPhase(['aim'], 3200)) break;
  }
  await click(375, 400, 200);
  await waitPhase(['quiz', 'aim'], 15000);
}

// 第 3 题答完进入放置，拖住悬浮块分别到左右两侧
for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
  await click(sx, sy, 250);
  if (await waitPhase(['aim'], 3200)) break;
}
const left = pt(140, 400);
const right = pt(610, 400);
await page.mouse.move(pt(375, 400).x, pt(375, 400).y);
await page.mouse.down();
await page.mouse.move(left.x, left.y, { steps: 10 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOT_DIR}/14-gaze-left.png` });
await page.mouse.move(right.x, right.y, { steps: 10 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOT_DIR}/14-gaze-right.png` });
await page.mouse.up();
console.log('✅ 视线跟随左右对比截图完成');
await browser.close();
