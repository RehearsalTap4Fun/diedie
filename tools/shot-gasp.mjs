// 失误坠落验证：叠 2 块后把最后一块传送到平台下方，验证 panic + 集体 gasp + 回收
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5173/';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
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
for (let n = 0; n < 3; n++) {
  for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
    await click(sx, sy, 250);
    if (await waitPhase(['aim'], 3200)) break;
  }
  await click(375, 400, 200);
  await waitPhase(['quiz', 'aim'], 15000);
}

// 进入第 4 块的放置阶段（塔完全可见），再触发坠落
for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
  await click(sx, sy, 250);
  if (await waitPhase(['aim'], 3200)) break;
}
const before = await page.evaluate(() => window.__game.scene.getScene('game').blocks.length);
// 把最后一块直接传送到回收线以下（睡眠中的刚体不再积分位置，传送到中途会悬停）
await page.evaluate(() => {
  const s = window.__game.scene.getScene('game');
  const b = s.blocks[s.blocks.length - 1].body;
  b.position.y = 1700;
  b.positionPrev.y = 1682;
});
await page.waitForTimeout(350);
await page.screenshot({ path: `${SHOT_DIR}/15-gasp.png` });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => window.__game.scene.getScene('game').blocks.length);
console.log(`块数 ${before} -> ${after}（预期减 1）${after === before - 1 ? '✅' : '❌'}`);
console.log(errors.length ? '❌ ' + errors.join('\n') : '✅ 无页面错误');
await browser.close();
process.exit(after === before - 1 && errors.length === 0 ? 0 : 1);
