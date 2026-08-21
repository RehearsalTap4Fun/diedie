// 竞技镜头缩放验证：塔逼近出块区时主相机拉远、悬浮块抬升、UI 固定且可点。
// 真实叠到临界高度慢且随机，改为把已睡眠的块传送到高处伪造高塔（睡眠刚体不积分位置）。
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
const dropAt = async (dx) => {
  const p = px(dx, 400);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
};
const state = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('versus');
    return s && window.__game.scene.isActive('versus')
      ? {
          phase: s.phase,
          blocks: s.blocks.length,
          zoom: s.cameras.main.zoom,
          aimY: s.aimView ? s.aimView.y : null,
          aimAngle: s.aimAngle,
          placed: s.placedCount[0] + s.placedCount[1],
        }
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

// 进竞技，中间放两块（塔矮，此时应无缩放）
await click(375, 1090, 1200);
await waitFor((s) => s.phase === 'aim');
await dropAt(375);
await waitFor((s) => s.phase === 'aim' && s.blocks === 1);
const flat = await state();
console.log(`塔矮时 zoom=${flat.zoom.toFixed(3)}: ${Math.abs(flat.zoom - 1) < 0.02 ? '✅ 不缩放' : '❌'}`);
await dropAt(330);
await waitFor((s) => s.phase === 'aim' && s.blocks === 2);

// 等两块都睡眠后，把上面那块传送到 y=430（塔顶伪装进临界区）
const slept = await waitFor(
  () => page.evaluate(() => window.__game.scene.getScene('versus').blocks.every((b) => b.body.isSleeping)),
  10000
);
await page.evaluate(() => {
  const s = window.__game.scene.getScene('versus');
  const top = s.blocks.reduce((a, b) => (b.body.position.y < a.body.position.y ? b : a));
  s.matter.body.setPosition(top.body, { x: 375, y: 430 });
  top.sync();
});
await page.waitForTimeout(2500); // 等镜头 lerp 到位

const zoomed = await state();
const zoomOk = zoomed.zoom < 0.9;
const aimOk = zoomed.aimY !== null && zoomed.aimY < 150;
console.log(`伪造高塔后 zoom=${zoomed.zoom.toFixed(3)}: ${zoomOk ? '✅ 已拉远' : '❌'}`);
console.log(`悬浮块抬升 aimY=${zoomed.aimY?.toFixed(0)}: ${aimOk ? '✅' : '❌'}`);
await page.screenshot({ path: `${SHOT_DIR}/24-versus-zoomout.png` });

// 缩放状态下 UI 相机的按钮仍可点：旋转按钮（屏幕坐标 375,1282）
await click(375, 1282, 400);
const rotated = await state();
console.log(`缩放下点旋转按钮 aimAngle=${rotated.aimAngle.toFixed(2)}: ${rotated.aimAngle > 0 ? '✅' : '❌'}`);

// 缩放状态下仍能正常放块（拖拽坐标已换算世界系）
const before = rotated.placed;
await dropAt(375);
const dropped = await waitFor((s) => s.placed === before + 1, 8000);
console.log(`缩放下放块: ${dropped ? '✅' : '❌'}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOT_DIR}/25-versus-zoom-drop.png` });
const end = await state();
console.log(`后续阶段流转: ${end && ['banner', 'aim', 'drop', 'over'].includes(end.phase) ? `✅ (${end.phase})` : '❌'}`);
if (!slept) console.log('⚠️ 块未全部睡眠即传送（结果可能不稳定）');

console.log(errors.length ? `❌ 错误:\n` + errors.join('\n') : '✅ 无 console 错误');
await browser.close();
