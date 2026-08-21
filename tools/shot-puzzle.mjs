// 拼图验证：打通两关攒够 5 省 → 进拼图 → 自动拖全部拼块归位 → 校验完成
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
const phase = () => page.evaluate(() => window.__game.scene.getScene('game')?.phase);
const waitPhase = async (want, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (want.includes(await phase())) return true;
    await page.waitForTimeout(200);
  }
  return false;
};

// 攒收集：打两关
await click(375, 940, 1500);
for (let lvl = 0; lvl < 2; lvl++) {
  let steps = 0;
  while ((await phase()) !== 'win' && steps < 60) {
    const ph = await phase();
    if (ph === 'quiz') {
      for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
        await click(sx, sy, 250);
        if (await waitPhase(['aim'], 3000)) break;
      }
    } else if (ph === 'aim') {
      await click(375, 400, 200);
      await waitPhase(['quiz', 'aim', 'win'], 15000);
    } else {
      await page.waitForTimeout(400);
    }
    steps++;
  }
  await page.waitForTimeout(1000);
  if (lvl === 0) await click(160, 825, 1500); // 下一关
}
const owned = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('diedie-save-v2') || '{}');
  return d.profiles?.[d.active ?? 0]?.owned?.length ?? 0;
});
console.log(`已收集 ${owned} 省`);
// 回菜单：win 面板「换难度」按钮，单排布局在 y=825，双排在 y=895，先后尝试
await click(590, 825, 1200);
if (!(await page.evaluate(() => window.__game.scene.isActive('menu')))) {
  await click(590, 895, 1200);
}
await click(538, 1225, 1500); // 省份拼图
const inPuzzle = await page.evaluate(() => window.__game.scene.isActive('puzzle'));
console.log(`拼图页: ${inPuzzle ? '✅' : '❌'}`);
await page.screenshot({ path: `${SHOT_DIR}/16-puzzle.png` });

// 自动拖全部拼块归位（从内部锚点抓取）
if (inPuzzle) {
  const pieces = await page.evaluate(() => {
    const s = window.__game.scene.getScene('puzzle');
    return s.pieces.map((pi) => ({
      x: pi.view.x,
      y: pi.view.y,
      gx: pi.grabX,
      gy: pi.grabY,
      tx: pi.tx,
      ty: pi.ty,
    }));
  });
  for (const pi of pieces) {
    const from = px(pi.x + pi.gx, pi.y + pi.gy);
    const to = px(pi.tx + pi.gx, pi.ty + pi.gy);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  const done = await page.evaluate(() => {
    const s = window.__game.scene.getScene('puzzle');
    return { done: s.doneCount, total: s.pieces.length };
  });
  console.log(`拼图完成 ${done.done}/${done.total} ${done.done === done.total ? '✅' : '❌'}`);
  await page.screenshot({ path: `${SHOT_DIR}/17-puzzle-done.png` });
}
console.log(errors.length ? `❌ 错误:\n` + errors.join('\n') : '✅ 无错误');
await browser.close();
