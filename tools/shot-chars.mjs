// 汉字块审阅图：按游戏画法（锁孔填充 + 外圈/洞描边）绘制每个字，叠物理轮廓（红虚线）与眼睛，
// 用来检查洞、断笔、碰撞贴合与表情位置。用法：SHOT_DIR=/tmp node tools/shot-chars.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';
const chars = JSON.parse(fs.readFileSync(process.env.CHARS_JSON || path.join(ROOT, 'src/data/chars.json'), 'utf8'));
const PHYS = !process.env.NO_PHYS;

const C = 250;
let cells = '';
for (const a of chars) {
  const xs = a.verts.map((v) => v[0]);
  const ys = a.verts.map((v) => v[1]);
  const s = Math.min((C - 40) / (Math.max(...xs) - Math.min(...xs)), (C - 50) / (Math.max(...ys) - Math.min(...ys)));
  const ox = C / 2 - ((Math.min(...xs) + Math.max(...xs)) / 2) * s;
  const oy = C / 2 - 8 - ((Math.min(...ys) + Math.max(...ys)) / 2) * s;
  const P = (r) => r.map(([x, y]) => `${(ox + x * s).toFixed(1)},${(oy + y * s).toFixed(1)}`).join(' ');
  const dark = '#00000055';
  let svg = '';
  for (const part of a.parts) svg += `<polygon points="${P(part.fill)}" fill="${a.color}"/>`;
  for (const part of a.parts) for (const r of part.rings) svg += `<polygon points="${P(r)}" fill="none" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/>`;
  if (PHYS) for (const r of a.physParts) svg += `<polygon points="${P(r)}" fill="none" stroke="#e00" stroke-width="1.5" stroke-dasharray="5 3"/>`;
  const fx = ox + a.face[0] * s;
  const fy = oy + a.face[1] * s;
  const r = a.eyeR * s;
  const gap = r * 1.15;
  for (const d of [-1, 1])
    svg += `<circle cx="${fx + d * gap}" cy="${fy}" r="${r}" fill="#fff" stroke="#333" stroke-width="2"/><circle cx="${fx + d * gap}" cy="${fy}" r="${r * 0.5}" fill="#222"/>`;
  svg += `<path d="M ${fx - r * 0.9} ${fy + r * 1.5} Q ${fx} ${fy + r * 2.4} ${fx + r * 0.9} ${fy + r * 1.5}" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>`;
  cells += `<div style="width:${C}px;height:${C}px;position:relative;border:1px solid #eee;box-sizing:border-box"><svg width="${C}" height="${C}">${svg}</svg><div style="position:absolute;bottom:4px;left:8px;font:13px sans-serif">${a.display} ${a.adcode} · ${a.parts.length} 块 · 洞 ${a.parts.reduce((n, p) => n + p.rings.length - 1, 0)} · r=${a.eyeR}</div></div>`;
}
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: C * 6, height: 400 } });
await page.setContent(`<body style="margin:0;background:#fff"><div style="display:flex;flex-wrap:wrap;width:${C * 6}px">${cells}</div></body>`);
const out = path.join(SHOT_DIR, process.env.SHOT_NAME || 'chars.png');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('✅', out);
