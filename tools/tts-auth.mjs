// voiceclone TTS 鉴权：用本机 loginpass 主凭证走 OAuth 静默授权，
// 换取 voiceclone 会话 JWT，缓存到 tools/.tts-token（过期自动重取）。
// 用法：import { getTtsToken } from './tts-auth.mjs'
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tts-token');
const AUTH_URL =
  'https://ms-open-gateway.tap4fun.com/loginpass/oauth/authorize' +
  '?client_id=160&redirect_uri=https%3A%2F%2Fvoiceclone.tap4fun.com%2Fcallback' +
  '&response_type=code&scope=all&state=web';

function jwtExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.exp ?? 0;
  } catch {
    return 0;
  }
}

export async function getTtsToken() {
  try {
    const cached = fs.readFileSync(CACHE, 'utf8').trim();
    if (cached && jwtExp(cached) * 1000 > Date.now() + 3600_000) return cached;
  } catch {
    // 无缓存
  }

  const master = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.loginpass-auth.json'), 'utf8'))
    .prod.token;
  if (!master) throw new Error('缺少 loginpass 主凭证（~/.loginpass-auth.json），请先跑 sso-login-skill');

  // 手动跟随重定向链，在 voiceclone 回调的 Location 里截获 token
  let url = `${AUTH_URL}&token=${master}`;
  let cookies = '';
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: cookies ? { cookie: cookies } : {},
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookies = setCookie.split(';')[0];
    const loc = res.headers.get('location');
    if (!loc) break;
    const m = loc.match(/[?&]token=([^&]+)/);
    if (m && loc.startsWith('https://voiceclone.tap4fun.com')) {
      const token = decodeURIComponent(m[1]);
      fs.writeFileSync(CACHE, token, { mode: 0o600 });
      return token;
    }
    url = loc.startsWith('http') ? loc : new URL(loc, url).href;
  }
  throw new Error('OAuth 链路未返回 voiceclone token（主凭证可能过期，请重跑 sso-login-skill）');
}

// 直接运行时打印 token 供 shell 使用
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  getTtsToken().then(
    (t) => process.stdout.write(t),
    (e) => {
      console.error(String(e));
      process.exit(1);
    }
  );
}
