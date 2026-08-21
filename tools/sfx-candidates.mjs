// 音效候选批量生成：每个音效 3 个方向，输出到 tts-previews/sfx-候选/ 供试听
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getTtsToken } from './tts-auth.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'tts-previews/sfx-候选');
const BASE = 'https://voiceclone.tap4fun.com';

const CANDIDATES = {
  '下落A-滑笛下降': {
    text: 'classic cartoon slide whistle going down, descending pitch, toy whistle falling effect',
    duration: 0.7,
  },
  '下落B-风声嗖': {
    text: 'quick air whoosh of a small object falling fast, wind swoosh, clean and short',
    duration: 0.5,
  },
  '下落C-木琴下行': {
    text: 'quick descending xylophone glissando, playful falling music cue for kids game',
    duration: 0.7,
  },
  '落地A-软噗嗵': {
    text: 'cute soft plop of a plush toy landing on the floor with a tiny bounce, gentle thump',
    duration: 0.6,
  },
  '落地B-弹簧boing': {
    text: 'classic cartoon spring boing, single bounce, cute and short',
    duration: 0.7,
  },
  '落地C-果冻软糯': {
    text: 'soft squishy jelly wobble landing, cartoon squash sound, cute',
    duration: 0.7,
  },
  '磕碰A-木积木叩叩': {
    text: 'two small wooden toy blocks knocking together once, dry short knock, no reverb',
    duration: 0.5,
  },
  '磕碰B-软垫闷碰': {
    text: 'soft muffled bump on a cushion, single gentle hit, subtle and short',
    duration: 0.5,
  },
  '磕碰C-塑料咔嗒': {
    text: 'plastic toy bricks clacking together lightly, single short clack',
    duration: 0.5,
  },
};

const token = await getTtsToken();
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [name, cfg] of Object.entries(CANDIDATES)) {
  const out = path.join(OUT_DIR, `${name}.m4a`);
  if (fs.existsSync(out)) continue;
  const res = await fetch(`${BASE}/api/sound`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: cfg.text, duration_seconds: cfg.duration, prompt_influence: 0.6 }),
  });
  if (!res.ok) {
    console.error(`✗ ${name}: http ${res.status}`);
    continue;
  }
  const j = await res.json();
  const aurl = j.audio_url.startsWith('http') ? j.audio_url : BASE + j.audio_url;
  const ares = await fetch(aurl, { headers: { authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await ares.arrayBuffer());
  const tmp = `${out}.tmp.mp3`;
  fs.writeFileSync(tmp, buf);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', tmp, out]);
  fs.rmSync(tmp);
  console.log(`✓ ${name}`);
}
console.log('✅ 候选生成完毕');
