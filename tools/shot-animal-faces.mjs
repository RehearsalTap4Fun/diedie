// 表情锚点审阅图：大格子 + 0.1 比例网格 + 按游戏画法绘制眼睛和嘴，
// 用来精确标定每个动物 face 的比例坐标与 er（眼睛半径，最终像素）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';
const animals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/animals.json'), 'utf8'));

const CELL = 280;
const COLS = 6;
const rows = Math.ceil(animals.length / COLS);
let cells = '';
animals.forEach((a, i) => {
  const cx = (i % COLS) * CELL + CELL / 2;
  const cy = Math.floor(i / COLS) * CELL + CELL / 2 - 12;
  const s = Math.min((CELL - 50) / a.size[0], (CELL - 70) / a.size[1]);
  const xs = a.verts.map((v) => v[0]);
  const ys = a.verts.map((v) => v[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const ox = cx - ((minX + maxX) / 2) * s;
  const oy = cy - ((minY + maxY) / 2) * s;
  const pts = a.verts.map(([x, y]) => `${(ox + x * s).toFixed(1)},${(oy + y * s).toFixed(1)}`).join(' ');
  cells += `<polygon points="${pts}" fill="${a.color}" stroke="#555" stroke-width="1.5"/>`;
  // 0.1 比例网格（包围盒内）
  for (let k = 1; k < 10; k++) {
    const gx = ox + (minX + ((maxX - minX) * k) / 10) * s;
    const gy = oy + (minY + ((maxY - minY) * k) / 10) * s;
    const strong = k === 5 ? 0.5 : 0.22;
    cells += `<line x1="${gx}" y1="${oy + minY * s}" x2="${gx}" y2="${oy + maxY * s}" stroke="rgba(0,0,0,${strong})" stroke-width="0.6"/>`;
    cells += `<line x1="${ox + minX * s}" y1="${gy}" x2="${ox + maxX * s}" y2="${gy}" stroke="rgba(0,0,0,${strong})" stroke-width="0.6"/>`;
  }
  // 按游戏 drawFace 的几何画眼睛+嘴（gap=eyeR*1.15，嘴弧在 fy+eyeR*1.2）
  const fx = ox + a.face[0] * s;
  const fy = oy + a.face[1] * s;
  const er = a.eyeR * s;
  for (const side of [-1, 1]) {
    const ex = fx + side * er * 1.15;
    cells += `<circle cx="${ex}" cy="${fy}" r="${er}" fill="#fff" stroke="#333" stroke-width="1.5"/>`;
    cells += `<circle cx="${ex + er * 0.15}" cy="${fy + er * 0.25}" r="${er * 0.45}" fill="#333"/>`;
  }
  cells += `<path d="M ${fx - er * 0.7} ${fy + er * 1.1} Q ${fx} ${fy + er * 2.1} ${fx + er * 0.7} ${fy + er * 1.1}" fill="none" stroke="#333" stroke-width="2"/>`;
  const fracX = ((a.face[0] - minX) / (maxX - minX)).toFixed(2);
  const fracY = ((a.face[1] - minY) / (maxY - minY)).toFixed(2);
  cells += `<text x="${cx}" y="${cy + CELL / 2 - 22}" text-anchor="middle" font-size="17" fill="#333">${a.name} face=[${fracX},${fracY}] eyeR=${a.eyeR}</text>`;
});
const html = `<!doctype html><body style="margin:0;background:#eef6fb">
<svg width="${COLS * CELL}" height="${rows * CELL}" xmlns="http://www.w3.org/2000/svg">${cells}</svg></body>`;
const htmlPath = path.join(SHOT_DIR, 'animal-faces.html');
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: COLS * CELL, height: rows * CELL } });
await page.goto('file://' + htmlPath);
await page.screenshot({ path: `${SHOT_DIR}/animal-faces.png` });
await browser.close();
console.log(`✅ ${SHOT_DIR}/animal-faces.png`);
