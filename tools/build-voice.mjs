// 语音管线：文案清单 → TTS 合成 → AAC → src/assets/voice/*.m4a
// 主路径：公司 voiceclone 平台云端童声（voice_id 886，K1-diedie-china-narrator）
// 兜底：macOS say（无网/无凭证时），缓存按「音色标签|文案」判断增量。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getTtsToken } from './tts-auth.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src/assets/voice');
const MANIFEST = path.join(ROOT, 'src/data/voice.json');
const CACHE = path.join(ROOT, 'tools/voice-cache.json');

const CLOUD_BASE = 'https://voiceclone.tap4fun.com';
const CLOUD_VOICE_ID = 886; // K1-diedie-china-narrator（卡通娃娃音）
const SAY_VOICE = 'Tingting';
const SAY_RATE = 150;
const CONCURRENCY = 3;

const provinces = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/provinces.json'), 'utf8'));
const animals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/animals.json'), 'utf8'));
const chars = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/chars.json'), 'utf8'));
const clues = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/clues.json'), 'utf8'));
const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/facts.json'), 'utf8'));

// ---------- 文案清单 ----------
const lines = {
  'sys-correct': '答对啦！',
  'sys-wrong': '再试试哦',
  'sys-fall': '哎呀，掉下去了，再来一次',
  'sys-win': '太棒了！过关啦！',
  'sys-higher': '要叠得更高哦！',
  'sys-shaky': '要叠得更高哦！小心，塔越来越晃啦！',
  'sys-reset': '进度清零啦',
  'sys-map': '看看我的中国地图！',
  'sys-locked': '还没收集到，继续闯关吧！',
  'sys-puzzle': '把省份拼回它的家吧！',
  'sys-puzzle-done': '拼好啦！你真棒！',
  'sys-puzzle-locked': '集满5个省份，就能玩拼图啦！',
  'sys-prof-0': '熊猫宝宝，该你玩啦！',
  'sys-prof-1': '老虎宝宝，该你玩啦！',
  'sys-prof-2': '孔雀宝宝，该你玩啦！',
  'sys-vs-start': '轮流叠积木，谁把塔弄倒就输啦！',
  'sys-vs-p0': '轮到熊猫队啦！',
  'sys-vs-p1': '轮到老虎队啦！',
  'sys-vs-win-p0': '熊猫队赢啦！',
  'sys-vs-win-p1': '老虎队赢啦！',
  'sys-vs-bothwin': '哇！全部都叠完了！熊猫队和老虎队都赢啦！',
  'sys-mode-province': '来叠我们的省份啦！',
  'sys-mode-animal': '来叠动物朋友啦！',
  'sys-dex': '看看我的动物图鉴！',
  'sys-mode-char': '来叠汉字啦！',
  'sys-cards': '看看我的汉字卡！',
  // 图标按钮念名（孩子不识字，靠听认按钮）
  'sys-btn-next': '下一关，出发！',
  'sys-btn-home': '回菜单啦',
  'sys-leave': '要回菜单啦！还想玩，就点绿色的按钮',
  'sys-undo': '好的，恢复啦！',
};
for (const p of provinces) {
  lines[`q-name-${p.adcode}`] = `找一找，${p.display}在哪里？`;
  lines[`aim-${p.adcode}`] = `把${p.display}叠上去吧`;
  lines[`home-${p.adcode}`] = `${p.display}回家啦！`;
  const desc = facts[p.adcode];
  if (desc) {
    lines[`fact-ok-${p.adcode}`] = `答对啦！这是${p.display}，${desc}！`;
    lines[`fact-no-${p.adcode}`] = `这是${p.display}，${desc}。再找找哦！`;
    lines[`intro-${p.adcode}`] = `这是${p.display}，${desc}`;
  }
}
for (const [adcode, arr] of Object.entries(clues)) {
  arr.forEach((c, i) => {
    lines[`clue-${adcode}-${i}`] = c.q;
  });
}
// 叠动物模式：无线索题、无拼图（home-），其余与省份同一套
for (const a of animals) {
  lines[`q-name-${a.adcode}`] = `找一找，${a.display}在哪里？`;
  lines[`aim-${a.adcode}`] = `把${a.display}叠上去吧`;
  const desc = facts[a.adcode];
  if (desc) {
    lines[`fact-ok-${a.adcode}`] = `答对啦！这是${a.display}，${desc}！`;
    lines[`fact-no-${a.adcode}`] = `这是${a.display}，${desc}。再找找哦！`;
    lines[`intro-${a.adcode}`] = `这是${a.display}，${desc}`;
  }
}

// 叠汉字：display 为「山字」；线索题（看图认字）已在 clues.json 循环里生成
for (const c of chars) {
  lines[`q-name-${c.adcode}`] = `找一找，${c.display}在哪里？`;
  lines[`aim-${c.adcode}`] = `把${c.display}叠上去吧`;
  const desc = facts[c.adcode];
  if (desc) {
    lines[`fact-ok-${c.adcode}`] = `答对啦！这是${c.display}，${desc}！`;
    lines[`fact-no-${c.adcode}`] = `这是${c.display}，${desc}。再找找哦！`;
    lines[`intro-${c.adcode}`] = `这是${c.display}，${desc}`;
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(lines, null, 2));

// ---------- 合成实现 ----------
let token = null;
try {
  token = await getTtsToken();
  console.log(`✓ 云端童声就绪（voice_id=${CLOUD_VOICE_ID}）`);
} catch (e) {
  console.warn(`⚠ 云 TTS 不可用，回退 macOS say：${String(e).slice(0, 120)}`);
}
const VOICE_TAG = token ? `vc${CLOUD_VOICE_ID}` : `say-${SAY_VOICE}`;

async function synthCloud(text, outFile) {
  const res = await fetch(`${CLOUD_BASE}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ voice_id: CLOUD_VOICE_ID, text, params: {} }),
  });
  if (!res.ok) throw new Error(`tts http ${res.status}: ${(await res.text()).slice(0, 100)}`);
  const j = await res.json();
  if (!j.audio_url) throw new Error(`no audio_url: ${JSON.stringify(j).slice(0, 100)}`);
  const aurl = j.audio_url.startsWith('http') ? j.audio_url : CLOUD_BASE + j.audio_url;
  const ares = await fetch(aurl, { headers: { authorization: `Bearer ${token}` } });
  if (!ares.ok) throw new Error(`audio http ${ares.status}`);
  const buf = Buffer.from(await ares.arrayBuffer());
  if (buf.length < 1000) throw new Error(`audio too small: ${buf.length}B`);
  // 源 mp3 留档（tools/voice-src/），未来换码率可无损重转
  const srcDir = path.join(ROOT, 'tools/voice-src');
  fs.mkdirSync(srcDir, { recursive: true });
  const src = path.join(srcDir, path.basename(outFile).replace(/\.m4a$/, '.mp3'));
  fs.writeFileSync(src, buf);
  // 人声单声道用 HE-AAC 24k，体积比 AAC-LC 48k 小约 40% 且语音清晰度几乎无差
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aach', '-b', '24000', src, outFile]);
}

function synthSay(text, outFile) {
  const tmp = `${outFile}.tmp.aiff`;
  execFileSync('say', ['-v', SAY_VOICE, '-r', String(SAY_RATE), '-o', tmp, text]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', tmp, outFile]);
  fs.rmSync(tmp);
}

// ---------- 增量合成（并发 + 重试） ----------
let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
} catch {
  /* 首次运行 */
}

const outPath = (id) => path.join(OUT_DIR, `${id}.m4a`);
const todo = Object.entries(lines).filter(
  ([id, text]) => !(cache[id] === `${VOICE_TAG}|${text}` && fs.existsSync(outPath(id)))
);
const total = Object.keys(lines).length;
let made = 0;
const failed = [];

async function worker() {
  while (todo.length) {
    const [id, text] = todo.shift();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (token) await synthCloud(text, outPath(id));
        else synthSay(text, outPath(id));
        cache[id] = `${VOICE_TAG}|${text}`;
        made++;
        if (made % 10 === 0) console.log(`  ${made} 条完成...`);
        break;
      } catch (e) {
        if (attempt === 2) {
          failed.push(id);
          console.error(`✗ ${id}: ${String(e).slice(0, 100)}`);
        } else {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

// 清理清单中已不存在的旧音频
for (const f of fs.readdirSync(OUT_DIR)) {
  const id = f.replace(/\.m4a$/, '');
  if (f.endsWith('.m4a') && !(id in lines)) {
    fs.rmSync(path.join(OUT_DIR, f));
    delete cache[id];
    console.log(`清理过期音频: ${f}`);
  }
}
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));

const totalSize = fs
  .readdirSync(OUT_DIR)
  .filter((f) => f.endsWith('.m4a'))
  .reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0);
console.log(
  `${failed.length ? '⚠' : '✅'} 语音 ${total} 条（本次合成 ${made}，音色 ${VOICE_TAG}），共 ${(totalSize / 1024 / 1024).toFixed(2)} MB${failed.length ? `，失败 ${failed.length} 条: ${failed.join(',')}` : ''}`
);
if (failed.length) process.exit(1);
