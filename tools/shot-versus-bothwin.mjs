// 双赢结局验证：清空题池伪造「只剩最后一块」→ 放稳后应触发双赢（而非平局/胜负）
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
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const canvas = await page.locator('canvas').boundingBox();
const px = (dx, dy) => ({ x: canvas.x + (dx / 750) * canvas.width, y: canvas.y + (dy / 1334) * canvas.height });
const click = async (dx, dy, wait = 300) => {
  const p = px(dx, dy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};
const state = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('versus');
    return s && window.__game.scene.isActive('versus')
      ? { phase: s.phase, blocks: s.blocks.length, outcome: s.outcome }
      : null;
  });
const waitFor = async (pred, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const st = await state();
    if (st && pred(st)) return st;
    await page.waitForTimeout(200);
  }
  return null;
};

await click(375, 1090, 1200);
await waitFor((s) => s.phase === 'aim');
// 伪造终局：当前悬浮块就是「第 34 块」
await page.evaluate(() => {
  window.__game.scene.getScene('versus').pool = [];
});
// 放到平台正中，落稳后 nextTurn 发现题池已空 → 双赢
const p = px(375, 400);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
await page.waitForTimeout(500);
await page.mouse.up();

const over = await waitFor((s) => s.phase === 'over', 15000);
const bothWin = over && over.outcome && over.outcome.bothWin === true;
console.log(`最后一块放稳后结局: ${bothWin ? '✅ 双赢' : '❌ ' + JSON.stringify(over?.outcome)}`);
await page.waitForTimeout(1200); // 等结果面板
await page.screenshot({ path: `${SHOT_DIR}/26-versus-bothwin.png` });

// 再来一局应完整重置
await click(230, 850, 1800);
const re = await state();
console.log(`再来一局: ${re && re.phase !== 'over' && !re.outcome ? '✅' : '❌ ' + JSON.stringify(re)}`);

console.log(errors.length ? `❌ 错误:\n` + errors.join('\n') : '✅ 无 console 错误');
await browser.close();
