// Xエンゲージメントbot
//   node engage.mjs              … フォロー・いいね・引用RT・リプライ（すべて自動）
//   node engage.mjs auto-reply   … 自分の投稿への返信に自動で返す
//
// 必要な環境変数:
//   X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
//   DEEPSEEK_API_KEY（引用RT・リプライのコメント生成用）
import { TwitterApi } from 'twitter-api-v2';
import OpenAI from 'openai';
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
if (!history.quotedTweetIds) history.quotedTweetIds = [];
if (!history.autoRepliedTweetIds) history.autoRepliedTweetIds = [];

const followedSet = new Set(history.followed.map(f => f.userId));
const likedSet = new Set(history.liked.map(l => l.tweetId));

// --- 自動リプライモード（自分の投稿への返信に自動で返す） ---
if (mode === 'auto-reply') {
  await autoReplyToMentions();
  process.exit(0);
}

// --- (replies モードは廃止: リプライは engage 時に自動投稿) ---

// --- engage モード ---
const KEYWORDS = CONFIG.engageKeywords || [
  'クリニック経営', '開業医', '診療報酬改定', '患者離脱',
  '医院経営', 'クリニック開業', 'レセコン',
];
const FOLLOW_LIMIT = CONFIG.followLimit || 5;
const LIKE_LIMIT = CONFIG.likeLimit || 10;

// 自分のアカウントを除外
const EXCLUDE_IDS = new Set([myId]);

// フォロー対象のプロフィールフィルター
const FOLLOW_PROFILE_KEYWORDS = CONFIG.followProfileKeywords || [
  '院長', '内科', 'クリニック', '開業', '整形外科',
  '診療所', '医師', '医院', 'ドクター',
];

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
let skippedCount = 0;
const todayFollowed = [];
for (const [userId, user] of uniqueAuthors) {
  if (followCount >= FOLLOW_LIMIT) break;
  if (followedSet.has(userId)) continue;

  // プロフィールフィルター: descriptionに対象キーワードを含むかチェック
  const desc = (user.description || '').toLowerCase() + (user.name || '').toLowerCase();
  const matchesProfile = FOLLOW_PROFILE_KEYWORDS.some(kw => desc.includes(kw.toLowerCase()));
  if (!matchesProfile) {
    skippedCount++;
    continue;
  }

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
console.log(`フォロー: ${followCount}件（プロフィール不一致でスキップ: ${skippedCount}件）\n`);

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

// 4. コメントリプライ（エンゲージメント高のツイートにDeepSeekでコメント生成→リプライ）
// ※ 引用RTはX APIの制限（メンション外の投稿は引用不可）で使えないため、リプライで代替
console.log('=== コメントリプライ ===');
const COMMENT_LIMIT = CONFIG.commentReplyLimit || 2;
const commentedSet = new Set(history.quotedTweetIds); // 既存の履歴キーを流用

if (process.env.DEEPSEEK_API_KEY) {
  const ai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

  // 候補: エンゲージメントが高いツイート
  const commentCandidates = uniqueTweets
    .filter(t => {
      const score = (t.public_metrics?.like_count || 0) + (t.public_metrics?.retweet_count || 0) * 3;
      return score >= 3 && !commentedSet.has(t.id) && !likedSet.has(t.id);
    })
    .sort((a, b) => {
      const scoreA = (a.public_metrics?.like_count || 0) + (a.public_metrics?.retweet_count || 0) * 3;
      const scoreB = (b.public_metrics?.like_count || 0) + (b.public_metrics?.retweet_count || 0) * 3;
      return scoreB - scoreA;
    })
    .slice(0, COMMENT_LIMIT);

  let commentCount = 0;
  for (const t of commentCandidates) {
    const user = t._user;

    try {
      const res = await ai.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `あなたはクリニック経営に詳しい「古家聡大」としてXのリプライを書きます。
ルール:
- 50〜100文字程度の短いコメント
- 共感・補足・問いかけのいずれか。押し売りしない
- 「ミルカルテ」というサービス名は絶対に出さない
- 返信本文のみ出力（@メンションは含めない）`,
          },
          {
            role: 'user',
            content: `以下のツイートにリプライを1つだけ書いてください。\n\n@${user?.username}: ${t.text}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 200,
      });

      let comment = res.choices[0].message.content.trim();
      comment = comment.replace(/^["「『]|["」』]$/g, '');

      await client.v2.tweet(comment, {
        reply: { in_reply_to_tweet_id: t.id },
      });
      console.log(`  ✓ コメントリプライ: @${user?.username} → ${comment.slice(0, 50)}…`);

      history.quotedTweetIds.push(t.id);
      commentedSet.add(t.id);
      commentCount++;
    } catch (e) {
      console.log(`  ✗ コメントリプライ失敗 (@${user?.username}): ${e?.data?.detail || e.message}`);
    }
  }
  console.log(`コメントリプライ: ${commentCount}件\n`);
} else {
  console.log('DEEPSEEK_API_KEY未設定のためスキップ\n');
}

// 5. 自動リプライ（DeepSeekで生成→即投稿）
console.log('=== 自動リプライ（他アカウント） ===');
const REPLY_LIMIT = CONFIG.replyLimit || 3;
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
  .slice(0, REPLY_LIMIT);

if (replyCandidates.length > 0 && process.env.DEEPSEEK_API_KEY) {
  const replyAi = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

  let replyCount = 0;
  for (const t of replyCandidates) {
    const user = t._user;
    history.replyCandidateIds.push(t.id);

    try {
      const res = await replyAi.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `あなたは古家聡大（ふるいえあきひろ）としてXのリプライを書きます。
ルール:
- 50〜100文字の短い返信
- 共感・補足・問いかけのいずれか。押し売りしない
- 「ミルカルテ」というサービス名は絶対に出さない
- 返信本文のみ出力（@メンションは含めない）`,
          },
          {
            role: 'user',
            content: `以下のツイートにリプライを1つだけ書いてください。\n\n@${user?.username}: ${t.text}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 200,
      });

      let comment = res.choices[0].message.content.trim();
      comment = comment.replace(/^["「『]|["」』]$/g, '');

      await client.v2.tweet(comment, {
        reply: { in_reply_to_tweet_id: t.id },
      });
      console.log(`  ✓ リプライ: @${user?.username} → ${comment.slice(0, 60)}…`);
      replyCount++;
    } catch (e) {
      console.log(`  ✗ リプライ失敗 (@${user?.username}): ${e?.data?.detail || e.message}`);
    }
  }
  console.log(`リプライ: ${replyCount}件\n`);
} else if (!process.env.DEEPSEEK_API_KEY) {
  console.log('DEEPSEEK_API_KEY未設定のためスキップ\n');
} else {
  console.log('新しいリプライ候補なし\n');
}

// 5. 履歴を保存（直近90日分に刈り込み）
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 90);
const cutoffStr = cutoff.toISOString();
history.followed = history.followed.filter(f => f.followedAt >= cutoffStr);
history.liked = history.liked.filter(l => l.likedAt >= cutoffStr);
// replyCandidateIds, quotedTweetIds は直近500件だけ保持
if (history.replyCandidateIds.length > 500) {
  history.replyCandidateIds = history.replyCandidateIds.slice(-500);
}
if (history.quotedTweetIds.length > 500) {
  history.quotedTweetIds = history.quotedTweetIds.slice(-500);
}
writeFileSync(ENGAGE_PATH, JSON.stringify(history, null, 2) + '\n');

// 6. サマリー
console.log('\n=== サマリー ===');
console.log(`フォロー: +${followCount}（累計${history.followed.length}）`);
console.log(`いいね: +${likeCount}`);
console.log(`リプライ: ${replyCandidates.length}件（自動投稿）`);


// --- 自分の投稿への返信を検知して自動で返信 ---
async function autoReplyToMentions() {
  console.log('=== 自動リプライ ===');
  const AUTO_REPLY_LIMIT = CONFIG.autoReplyLimit || 5;
  const autoRepliedSet = new Set(history.autoRepliedTweetIds);

  if (!process.env.DEEPSEEK_API_KEY) {
    console.log('DEEPSEEK_API_KEY未設定のためスキップ');
    return;
  }
  const ai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

  // 自分宛てのメンション（リプライ）を取得
  let mentions;
  try {
    mentions = await client.v2.search(
      `to:${CONFIG.account} -from:${CONFIG.account} -is:retweet`,
      {
        max_results: 20,
        'tweet.fields': 'author_id,in_reply_to_user_id,conversation_id,text,created_at',
        expansions: 'author_id',
        'user.fields': 'username,name',
      },
    );
  } catch (e) {
    console.log('メンション取得エラー:', e?.data?.detail || e.message);
    return;
  }

  const tweets = mentions.data?.data || [];
  const users = new Map((mentions.data?.includes?.users || []).map(u => [u.id, u]));
  console.log(`メンション: ${tweets.length}件`);

  // 自分の投稿へのリプライだけを対象にする
  const targets = tweets.filter(
    t => t.in_reply_to_user_id === myId && !autoRepliedSet.has(t.id),
  );
  console.log(`未返信のリプライ: ${targets.length}件`);

  let replyCount = 0;
  for (const t of targets) {
    if (replyCount >= AUTO_REPLY_LIMIT) break;
    const user = users.get(t.author_id);
    const username = user?.username || '?';

    try {
      const res = await ai.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `あなたは古家聡大（ふるいえあきひろ）としてXのリプライに返信します。
ルール:
- 50〜100文字の短い返信
- 感謝・共感・問いかけのいずれか。押し売りしない
- 「ミルカルテ」というサービス名は絶対に出さない
- 返信本文のみ出力`,
          },
          {
            role: 'user',
            content: `@${username} からのリプライ: ${t.text}\n\n返信を1つだけ書いてください。`,
          },
        ],
        temperature: 0.8,
        max_tokens: 200,
      });

      let comment = res.choices[0].message.content.trim();
      comment = comment.replace(/^["「『]|["」』]$/g, '');

      await client.v2.tweet(comment, {
        reply: { in_reply_to_tweet_id: t.id },
      });
      console.log(`  ✓ @${username} に返信: ${comment.slice(0, 60)}…`);
      history.autoRepliedTweetIds.push(t.id);
      autoRepliedSet.add(t.id);
      replyCount++;
    } catch (e) {
      console.log(`  ✗ @${username} への返信失敗: ${e?.data?.detail || e.message}`);
    }
  }

  // 履歴を500件に刈り込み
  if (history.autoRepliedTweetIds.length > 500) {
    history.autoRepliedTweetIds = history.autoRepliedTweetIds.slice(-500);
  }
  writeFileSync(ENGAGE_PATH, JSON.stringify(history, null, 2) + '\n');
  console.log(`自動リプライ: ${replyCount}件\n`);
}
