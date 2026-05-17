// X自動投稿スクリプト
//   node post.mjs check  … 認証確認のみ（投稿しない）
//   node post.mjs post   … queue.json の「approved」を1件投稿する
import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'check';
const QUEUE = fileURLToPath(new URL('./queue.json', import.meta.url));

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

if (mode === 'post') {
  const queue = JSON.parse(readFileSync(QUEUE, 'utf8'));
  const item = queue.find(q => q.status === 'approved');
  if (!item) {
    console.log('承認済み（approved）の投稿はありません。何もせず終了します。');
    process.exit(0);
  }
  const res = await client.v2.tweet(item.text);
  item.status = 'posted';
  item.tweetId = res.data.id;
  item.postedAt = new Date().toISOString();
  writeFileSync(QUEUE, JSON.stringify(queue, null, 2) + '\n');
  console.log(`投稿しました: id=${item.id} tweetId=${res.data.id}`);
  process.exit(0);
}

console.error('不明なモード: ' + mode + '（check / post のいずれか）');
process.exit(1);
