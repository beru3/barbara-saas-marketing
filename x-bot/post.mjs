// X自動投稿スクリプト
//   node post.mjs check  … 認証確認のみ（投稿しない）
//   node post.mjs post   … 承認Issueの☑済み・未投稿の案を1件投稿する
//
// 重複防止：投稿済みIDは posted.json（台帳）に記録。Issueでも承認待ち→投稿済みへ移動。
// この二重管理に加え、X APIの同一本文拒否で、重複投稿は構造的に起きない。
import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'check';
const dir = fileURLToPath(new URL('./', import.meta.url));
const CONFIG = JSON.parse(readFileSync(dir + 'config.json', 'utf8'));
const POSTED_PATH = dir + 'posted.json';

for (const k of ['X_API_KEY', 'X_API_KEY_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET']) {
  if (!process.env[k]) { console.error('環境変数が未設定: ' + k); process.exit(1); }
}
const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_KEY_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

if (mode === 'check') {
  const me = await client.v2.me();
  console.log(`OK: 認証成功 — @${me.data.username}（${me.data.name}）`);
  process.exit(0);
}

if (mode !== 'post') {
  console.error('不明なモード: ' + mode + '（check / post のいずれか）');
  process.exit(1);
}

// --- post モード ---
const { repo, issueNumber, account } = CONFIG;
const gh = (args, opts = {}) => execSync('gh ' + args, { encoding: 'utf8', ...opts });

// 1. 承認Issueの本文を取得
const body = gh(`issue view ${issueNumber} --repo ${repo} --json body -q .body`);
const lines = body.replace(/\r\n/g, '\n').split('\n');

// 2. 「## 承認待ち」内のチェック項目を抽出
let sec = '';
const candidates = []; // { lineIndex, checked, id, text }
lines.forEach((ln, i) => {
  if (/^##\s*承認待ち\s*$/.test(ln)) { sec = 'pending'; return; }
  if (/^##\s/.test(ln)) { sec = ''; return; }
  if (sec === 'pending') {
    const m = ln.match(/^- \[([ xX])\]\s+`([^`]+)`\s+(.+)$/);
    if (m) candidates.push({ lineIndex: i, checked: m[1].toLowerCase() === 'x', id: m[2], text: m[3].trim() });
  }
});

// 3. 投稿済み台帳
let posted = [];
try { posted = JSON.parse(readFileSync(POSTED_PATH, 'utf8')); } catch { posted = []; }
const postedIds = new Set(posted.map(p => p.id));

// 4. 「☑ かつ 台帳に未記録」の案。残数がしきい値以上のときだけ投稿する（動的本数制御）
const threshold = parseInt(process.argv[3] || '1', 10);
const pending = candidates.filter(c => c.checked && !postedIds.has(c.id));
if (pending.length < threshold) {
  console.log(`承認待ち（☑・未投稿）は ${pending.length} 件。しきい値 ${threshold} 未満のため、このスロットは投稿しません。`);
  process.exit(0);
}
const target = pending[0];

// 5. 投稿
const res = await client.v2.tweet(target.text);
const tweetId = res.data.id;
const url = `https://x.com/${account}/status/${tweetId}`;

// 6. 台帳へ即記録（重複防止の要）
posted.push({ id: target.id, text: target.text, tweetId, postedAt: new Date().toISOString() });
writeFileSync(POSTED_PATH, JSON.stringify(posted, null, 2) + '\n');

// 7. Issue本文を更新：承認待ちから削除し、投稿済みへ追記
const today = new Date().toISOString().slice(0, 10);
const postedLine = `- \`${target.id}\` ${target.text} → ${url} (${today})`;
const newLines = [];
lines.forEach((ln, i) => {
  if (i === target.lineIndex) return; // 承認待ちの該当行を削除
  newLines.push(ln);
  if (/^##\s*投稿済み\s*$/.test(ln)) { newLines.push(''); newLines.push(postedLine); }
});
writeFileSync('/tmp/x_issue_new.md', newLines.join('\n'));
gh(`issue edit ${issueNumber} --repo ${repo} --body-file /tmp/x_issue_new.md`);

console.log(`投稿しました: ${target.id} → ${url}`);
process.exit(0);
