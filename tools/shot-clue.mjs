// 抓一张线索题（emoji 题面）的截图
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
const click = async (dx, dy, wait = 400) => {
  const p = pt(dx, dy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(wait);
};

await click(375, 940, 1200); // 大大班

// 连答几题，遇到线索题（当前题面是 emoji 线索）就截图
for (let round = 0; round < 8; round++) {
  const isClue = await page.evaluate(() => {
    const s = window.__game.scene.getScene('game');
    if (s.phase !== 'quiz' || !s.quizUI) return false;
    // 线索题的题面不以「找一找」开头
    const texts = s.quizUI.list.filter((o) => o.type === 'Text').map((o) => o.text);
    return texts.some((t) => t.includes('？') && !t.startsWith('找一找'));
  });
  if (isClue) {
    await page.screenshot({ path: `${SHOT_DIR}/9-clue.png` });
    console.log(`✅ 第 ${round + 1} 题是线索题，已截图`);
    break;
  }
  // 答对进入放置，随手放下，等下一题
  for (const [sx, sy] of [[210, 560], [540, 560], [210, 880], [540, 880]]) {
    await click(sx, sy, 300);
    const ph = await page.evaluate(() => window.__game.scene.getScene('game').phase);
    if (ph !== 'quiz') break;
  }
  await click(375, 400, 200);
  await page.waitForTimeout(3500);
}
await browser.close();
