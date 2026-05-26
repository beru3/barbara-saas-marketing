// Xエンゲージメントbot
//   node engage.mjs           … フォロー・いいね・リプライ候補生成
//   node engage.mjs replies   … 承認済みリプライを投稿
//
// 必要な環境変数:
//   X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
//   GH_TOKEN（Issue更新用）
import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const dir = fileURLToPath(new URL('./', import.meta.url));
const mode = process.argv[2] || 'engage';
const CONFIG = JSON.parse(readFileSync(dir + 'config.json', 'utf8'));

for (const k of ['X_API_KEY', 'X_API_KEY_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET']) {
  if (!process.env[k]) { console.error('未設定: ' + k); process.exit(1); }
}
const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_KEY_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});
const gh = (args) => execSync('gh ' + args, { encoding: 'utf8' });

const me = await client.v2.me();
const myId = me.data.id;

// --- 台帳ファイル ---
const ENGAGE_PATH = dir + 'engage_history.json';
let history = {};
try { history = JSON.parse(readFileSync(ENGAGE_PATH, 'utf8')); } catch { history = {}; }
if (!history.followed) history.followed = [];
if (!history.liked) history.liked = [];
if (!history.replyCandidateIds) history.replyCandidateIds = [];

const followedSet = new Set(history.followed.map(f => f.userId));
const likedSet = new Set(history.liked.map(l => l.tweetId));

// --- 承認済みリプライの投稿モード ---
if (mode === 'replies') {
  await postApprovedReplies();
  process.exit(0);
}

// --- engage モード ---
const KEYWORDS = CONFIG.engageKeywords || [
  'クリニック経営', '開業医', '診療報酬改定', '患者離脱',
  '医院経営', 'クリニック開業', 'レセコン',
];
const FOLLOW_LIMIT = CONFIG.followLimit || 5;
const LIKE_LIMIT = CONFIG.likeLimit || 10;

// 自分のアカウントを除外
const EXCLUDE_IDS = new Set([myId]);

// 1. キーワード検索でツイートを収集
console.log('=== ツイート検索 ===');
const allTweets = [];
for (const kw of KEYWORDS) {
  try {
    const res = await client.v2.search(kw + ' -is:retweet lang:ja', {
      max_results: 10,
      'tweet.fields': 'author_id,public_metrics,created_at,conversation_id',
      expansions: 'author_id',
      'user.fields': 'name,username,description,public_metrics',
    });
    const tweets = res.data?.data || [];
    const users = new Map((res.data?.includes?.users || []).map(u => [u.id, u]));
    for (const t of tweets) {
      allTweets.push({ ...t, _user: users.get(t.author_id), _keyword: kw });
    }
    console.log(`  "${kw}": ${tweets.length}件`);
  } catch (e) {
    console.log(`  "${kw}": エラー — ${e?.data?.detail || e.message}`);
  }
}

// 重複排除
const uniqueTweets = [];
const seenTweetIds = new Set();
for (const t of allTweets) {
  if (!seenTweetIds.has(t.id) && !EXCLUDE_IDS.has(t.author_id)) {
    seenTweetIds.add(t.id);
    uniqueTweets.push(t);
  }
}
console.log(`合計: ${uniqueTweets.length}件（重複除去後）\n`);

// 2. 自動フォロー（未フォローのアカウント、1日上限あり）
console.log('=== 自動フォロー ===');
const uniqueAuthors = new Map();
for (const t of uniqueTweets) {
  if (t._user && !uniqueAuthors.has(t.author_id)) {
    uniqueAuthors.set(t.author_id, t._user);
  }
}

let followCount = 0;
const todayFollowed = [];
for (const [userId, user] of uniqueAuthors) {
  if (followCount >= FOLLOW_LIMIT) break;
  if (followedSet.has(userId)) continue;

  try {
    await client.v2.follow(myId, userId);
    console.log(`  ✓ フォロー: @${user.username}（${user.name}）`);
    const entry = {
      userId,
      username: user.username,
      name: user.name,
      followedAt: new Date().toISOString(),
    };
    history.followed.push(entry);
    todayFollowed.push(entry);
    followedSet.add(userId);
    followCount++;
  } catch (e) {
    console.log(`  ✗ @${user.username}: ${e?.data?.detail || e.message}`);
  }
}
console.log(`フォロー: ${followCount}件\n`);

// 3. 自動いいね（エンゲージメントが高いツイート優先）
console.log('=== 自動いいね ===');
const likeable = uniqueTweets
  .filter(t => !likedSet.has(t.id))
  .sort((a, b) => {
    const scoreA = (a.public_metrics?.like_count || 0) + (a.public_metrics?.retweet_count || 0) * 2;
    const scoreB = (b.public_metrics?.like_count || 0) + (b.public_metrics?.retweet_count || 0) * 2;
    return scoreB - scoreA;
  });

let likeCount = 0;
const todayLiked = [];
for (const t of likeable) {
  if (likeCount >= LIKE_LIMIT) break;

  try {
    await client.v2.like(myId, t.id);
    const user = t._user;
    console.log(`  ✓ いいね: @${user?.username || '?'} — ${t.text?.slice(0, 50)}…`);
    const entry = {
      tweetId: t.id,
      authorUsername: user?.username || '?',
      text: t.text?.slice(0, 80),
      likedAt: new Date().toISOString(),
    };
    history.liked.push(entry);
    todayLiked.push(entry);
    likedSet.add(t.id);
    likeCount++;
  } catch (e) {
    // already liked等のエラーは無視
    if (e?.data?.detail?.includes('already')) {
      likedSet.add(t.id);
    } else {
      console.log(`  ✗ ${t.id}: ${e?.data?.detail || e.message}`);
    }
  }
}
console.log(`いいね: ${likeCount}件\n`);

// 4. リプライ候補をIssueに追記
// エンゲージメントが高く、かつまだ候補に挙げていないツイートを選ぶ
console.log('=== リプライ候補 ===');
const replyCandidates = uniqueTweets
  .filter(t => {
    const score = (t.public_metrics?.like_count || 0) + (t.public_metrics?.reply_count || 0) * 3;
    return score >= 2 && !history.replyCandidateIds.includes(t.id);
  })
  .sort((a, b) => {
    const scoreA = (a.public_metrics?.like_count || 0) + (a.public_metrics?.reply_count || 0) * 3;
    const scoreB = (b.public_metrics?.like_count || 0) + (b.public_metrics?.reply_count || 0) * 3;
    return scoreB - scoreA;
  })
  .slice(0, 3);

if (replyCandidates.length > 0) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`\n### ${today} のリプライ候補\n`];

  for (const t of replyCandidates) {
    const user = t._user;
    const url = `https://x.com/${user?.username || 'i'}/status/${t.id}`;
    lines.push(`- [ ] \`${t.id}\` @${user?.username || '?'}: ${t.text?.slice(0, 80)}…`);
    lines.push(`  - 元ツイート: ${url}`);
    lines.push(`  - リプライ案: <!-- ここにリプライ文を記入して☑ -->`);
    lines.push('');
    history.replyCandidateIds.push(t.id);
  }

  // Issue #3 にコメント追記
  const engageIssueNumber = CONFIG.engageIssueNumber || 3;
  const commentBody = lines.join('\n').replace(/"/g, '\\"');
  try {
    gh(`issue comment ${engageIssueNumber} --repo ${CONFIG.repo} --body "${commentBody}"`);
    console.log(`Issue #${engageIssueNumber} にリプライ候補 ${replyCandidates.length}件を追記`);
  } catch (e) {
    console.log('Issue更新エラー:', e.message);
  }
} else {
  console.log('新しいリプライ候補なし');
}

// 5. 履歴を保存（直近90日分に刈り込み）
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 90);
const cutoffStr = cutoff.toISOString();
history.followed = history.followed.filter(f => f.followedAt >= cutoffStr);
history.liked = history.liked.filter(l => l.likedAt >= cutoffStr);
// replyCandidateIds は直近500件だけ保持
if (history.replyCandidateIds.length > 500) {
  history.replyCandidateIds = history.replyCandidateIds.slice(-500);
}
writeFileSync(ENGAGE_PATH, JSON.stringify(history, null, 2) + '\n');

// 6. サマリー
console.log('\n=== サマリー ===');
console.log(`フォロー: +${followCount}（累計${history.followed.length}）`);
console.log(`いいね: +${likeCount}`);
console.log(`リプライ候補: ${replyCandidates.length}件`);

// --- 承認済みリプライ投稿 ---
async function postApprovedReplies() {
  const engageIssueNumber = CONFIG.engageIssueNumber || 3;
  const comments = JSON.parse(
    gh(`issue view ${engageIssueNumber} --repo ${CONFIG.repo} --json comments -q .comments`)
  );

  let posted = 0;
  for (const comment of comments) {
    const lines = comment.body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      // チェック済みの候補を探す: - [x] `tweetId` @user: text
      const m = ln.match(/^- \[[xX]\]\s+`(\d+)`\s+@(\S+):/);
      if (!m) continue;

      const tweetId = m[1];
      const targetUser = m[2];

      // 次の行からリプライ案を探す
      for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
        const replyMatch = lines[j].match(/リプライ案:\s*(.+)/);
        if (replyMatch && replyMatch[1] && !replyMatch[1].includes('<!-- ')) {
          const replyText = replyMatch[1].trim();
          if (replyText.length < 2) continue;

          // 投稿済みチェック
          if (history.repliedTweets?.includes(tweetId)) {
            console.log(`  skip: ${tweetId} (投稿済み)`);
            continue;
          }

          try {
            await client.v2.tweet(replyText, {
              reply: { in_reply_to_tweet_id: tweetId },
            });
            console.log(`  ✓ リプライ投稿: @${targetUser} → ${replyText.slice(0, 50)}…`);
            if (!history.repliedTweets) history.repliedTweets = [];
            history.repliedTweets.push(tweetId);
            posted++;
          } catch (e) {
            console.log(`  ✗ リプライ失敗 (${tweetId}): ${e?.data?.detail || e.message}`);
          }
        }
      }
    }
  }

  writeFileSync(ENGAGE_PATH, JSON.stringify(history, null, 2) + '\n');
  console.log(`リプライ投稿: ${posted}件`);
}
