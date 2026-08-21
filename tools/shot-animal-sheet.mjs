// 动物轮廓对照表：animals.json → SVG 网格 → 截图（人工检查轮廓辨识度用）
// 蓝点 = 表情锚点两眼位置；红线 = 物理轮廓
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';
const animals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/animals.json'), 'utf8'));

const CELL = 180;
const COLS = 6;
const rows = Math.ceil(animals.length / COLS);
let cells = '';
animals.forEach((a, i) => {
  const cx = (i % COLS) * CELL + CELL / 2;
  const cy = Math.floor(i / COLS) * CELL + CELL / 2 - 10;
  const s = Math.min((CELL - 40) / a.size[0], (CELL - 56) / a.size[1]);
  const xs = a.verts.map((v) => v[0]);
  const ys = a.verts.map((v) => v[1]);
  const ox = cx - ((Math.min(...xs) + Math.max(...xs)) / 2) * s;
  const oy = cy - ((Math.min(...ys) + Math.max(...ys)) / 2) * s;
  const pts = a.verts.map(([x, y]) => `${(ox + x * s).toFixed(1)},${(oy + y * s).toFixed(1)}`).join(' ');
  const phys = a.phys.map(([x, y]) => `${(ox + x * s).toFixed(1)},${(oy + y * s).toFixed(1)}`).join(' ');
  const fx = ox + a.face[0] * s;
  const fy = oy + a.face[1] * s;
  const er = a.eyeR * s;
  cells += `<polygon points="${pts}" fill="${a.color}" stroke="#555" stroke-width="1.5"/>`;
  cells += `<polygon points="${phys}" fill="none" stroke="rgba(220,40,40,0.55)" stroke-width="1.2"/>`;
  cells += `<circle cx="${fx - er * 1.15}" cy="${fy}" r="${Math.max(2, er * 0.9)}" fill="#fff" stroke="#333"/>`;
  cells += `<circle cx="${fx + er * 1.15}" cy="${fy}" r="${Math.max(2, er * 0.9)}" fill="#fff" stroke="#333"/>`;
  cells += `<circle cx="${fx - er * 1.15}" cy="${fy}" r="${Math.max(1, er * 0.4)}" fill="#333"/>`;
  cells += `<circle cx="${fx + er * 1.15}" cy="${fy}" r="${Math.max(1, er * 0.4)}" fill="#333"/>`;
  cells += `<text x="${cx}" y="${cy + CELL / 2 - 8}" text-anchor="middle" font-size="16" fill="#333">${a.name}</text>`;
});
const html = `<!doctype html><body style="margin:0;background:#eef6fb">
<svg width="${COLS * CELL}" height="${rows * CELL}" xmlns="http://www.w3.org/2000/svg">${cells}</svg></body>`;
const htmlPath = path.join(SHOT_DIR, 'animal-sheet.html');
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: COLS * CELL, height: rows * CELL } });
await page.goto('file://' + htmlPath);
await page.screenshot({ path: `${SHOT_DIR}/animal-sheet.png` });
await browser.close();
console.log(`✅ ${SHOT_DIR}/animal-sheet.png`);
