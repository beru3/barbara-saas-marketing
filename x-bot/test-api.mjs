// X API Free tier の各エンドポイントをテスト
import { TwitterApi } from 'twitter-api-v2';

for (const k of ['X_API_KEY', 'X_API_KEY_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET']) {
  if (!process.env[k]) { console.error('未設定: ' + k); process.exit(1); }
}
const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_KEY_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

const me = await client.v2.me();
console.log('✓ me:', me.data.id, '@' + me.data.username);

// 1. ツイート検索
try {
  const res = await client.v2.search('クリニック経営', { max_results: 10, 'tweet.fields': 'author_id,public_metrics' });
  const tweets = res.data?.data || res.data || [];
  console.log('✓ search: ' + (Array.isArray(tweets) ? tweets.length : 0) + ' tweets');
  if (Array.isArray(tweets) && tweets[0]) console.log('  sample:', tweets[0].text?.slice(0, 60));
} catch (e) {
  console.log('✗ search:', e.code, e?.data?.detail || e?.data?.title || e.message);
}

// 2. ユーザー検索（by username）
try {
  const res = await client.v2.usersByUsernames(['m3com_news', 'CareNeTV', 'Nikkei_MEDICAL']);
  const users = res.data || [];
  console.log('✓ usersByUsernames: ' + users.length + ' users');
  for (const u of users) console.log('  ', u.id, '@' + u.username);
} catch (e) {
  console.log('✗ usersByUsernames:', e.code, e?.data?.detail || e?.data?.title || e.message);
}

// 3. フォロワー一覧（自分の）
try {
  const res = await client.v2.followers(me.data.id, { max_results: 10 });
  console.log('✓ followers:', (res.data?.data || []).length, 'followers');
} catch (e) {
  console.log('✗ followers:', e.code, e?.data?.detail || e?.data?.title || e.message);
}

// 4. フォロー（テスト: m3com_newsをフォロー）
try {
  // まずm3com_newsのIDを取得
  const target = await client.v2.userByUsername('m3com_news');
  if (target.data) {
    console.log('  target:', target.data.id, '@' + target.data.username);
    const res = await client.v2.follow(me.data.id, target.data.id);
    console.log('✓ follow:', JSON.stringify(res.data));
  }
} catch (e) {
  console.log('✗ follow:', e.code, e?.data?.detail || e?.data?.title || e.message);
}

// 5. いいね（テスト: 自分の最新ツイートにいいね）
try {
  const timeline = await client.v2.userTimeline(me.data.id, { max_results: 5 });
  const myTweet = timeline.data?.data?.[0];
  if (myTweet) {
    const res = await client.v2.like(me.data.id, myTweet.id);
    console.log('✓ like:', JSON.stringify(res.data));
  } else {
    console.log('  like: no tweets to like');
  }
} catch (e) {
  console.log('✗ like:', e.code, e?.data?.detail || e?.data?.title || e.message);
}

// 6. リプライ投稿（dry run — 実際には投稿しない、権限確認のみログ出力）
console.log('  reply: skipped (would use client.v2.tweet with reply parameter)');

console.log('\n=== テスト完了 ===');
