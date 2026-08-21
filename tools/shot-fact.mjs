// 抓点选反馈卡片的截图（点第一个选项，无论对错都会弹卡片）
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

let p = pt(375, 940); // 大大班
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(1500);
p = pt(210, 560); // 点第一个选项
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOT_DIR}/10-fact.png` });
console.log('✅ 特征卡片截图完成');
await browser.close();
