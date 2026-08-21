// 音效管线：AI 音效生成（voiceclone /api/sound，ElevenLabs SFX）→ AAC → src/assets/sfx/*.m4a
// 缓存按「提示词」判断增量，改提示词重新生成对应音效。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getTtsToken } from './tts-auth.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src/assets/sfx');
const CACHE = path.join(ROOT, 'tools/sfx-cache.json');
const BASE = 'https://voiceclone.tap4fun.com';

// 叠叠玩法音效：统一卡通玩具质感
// 注意：whoosh/boing/thud 当前采用 2026-08-05 用户试听选定的候选文件
// （tts-previews/sfx-候选/ 下落C-木琴下行 / 落地B-弹簧boing / 磕碰A-木积木叩叩），
// AI 生成不可复现，重跑本脚本会生成"同提示词的另一个版本"，慎重覆盖。
const SFX = {
  rotate: {
    text: 'single short cartoon UI click, toy ratchet tick, clean and cute, no reverb',
    duration: 0.5,
  },
  whoosh: {
    text: 'quick descending xylophone glissando, playful falling music cue for kids game',
    duration: 0.7,
  },
  boing: {
    text: 'classic cartoon spring boing, single bounce, cute and short',
    duration: 0.7,
  },
  thud: {
    text: 'two small wooden toy blocks knocking together once, dry short knock, no reverb',
    duration: 0.5,
  },
};

const token = await getTtsToken();
fs.mkdirSync(OUT_DIR, { recursive: true });
let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
} catch {
  /* 首次 */
}

let made = 0;
for (const [id, cfg] of Object.entries(SFX)) {
  const out = path.join(OUT_DIR, `${id}.m4a`);
  const tag = `${cfg.text}|${cfg.duration}`;
  if (cache[id] === tag && fs.existsSync(out)) continue;
  const res = await fetch(`${BASE}/api/sound`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: cfg.text, duration_seconds: cfg.duration, prompt_influence: 0.5 }),
  });
  if (!res.ok) throw new Error(`${id}: sound http ${res.status} ${(await res.text()).slice(0, 120)}`);
  const j = await res.json();
  const aurl = j.audio_url.startsWith('http') ? j.audio_url : BASE + j.audio_url;
  const ares = await fetch(aurl, { headers: { authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await ares.arrayBuffer());
  const tmp = `${out}.tmp.mp3`;
  fs.writeFileSync(tmp, buf);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', tmp, out]);
  fs.rmSync(tmp);
  cache[id] = tag;
  made++;
  console.log(`✓ ${id} (${Math.round(buf.length / 1024)}KB)`);
}
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
console.log(`✅ 音效 ${Object.keys(SFX).length} 个（本次生成 ${made}）`);
