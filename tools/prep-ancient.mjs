// 古文字素材整理：tools/ancient-src/<字>-<oracle|bronze>.svg（Wikimedia Commons「Ancient Chinese
// characters」项目，公有领域）→ 去元数据、统一着色 → src/assets/ancient/<adcode>.svg（叠汉字演变动画中间一环）
// 用法：node tools/prep-ancient.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools/ancient-src');
const OUT = path.join(ROOT, 'src/assets/ancient');
const INK = '#5B4636'; // 刻在骨片上的深棕

// adcode ← 字（Commons 按繁体命名）；优先甲骨文，没有则金文
const MAP = {
  ri: '日', yue: '月', shan: '山', shui: '水', huo: '火', mu: '木', shi: '石', yu: '雨', tian: '田',
  ren: '人', kou: '口', mu4: '目', er: '耳', shou: '手', zu: '足', da: '大', zi: '子',
  niu: '牛', yang: '羊', ma: '馬', niao: '鳥', yu2: '魚', zhu: '竹', men: '門',
};

fs.mkdirSync(OUT, { recursive: true });
const missing = [];
for (const [id, ch] of Object.entries(MAP)) {
  const file = ['oracle', 'bronze'].map((k) => path.join(SRC, `${ch}-${k}.svg`)).find((f) => fs.existsSync(f));
  if (!file) {
    missing.push(ch);
    continue;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 300 300';
  const paths = [...raw.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => `<path d="${m[1]}"/>`);
  if (!paths.length) throw new Error(`${file}: 没有 path`);
  fs.writeFileSync(
    path.join(OUT, `c-${id}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g fill="${INK}">${paths.join('')}</g></svg>\n`
  );
}
console.log(`✅ ${Object.keys(MAP).length - missing.length} 个古文字 → ${OUT}${missing.length ? `；缺：${missing.join('')}` : ''}`);
