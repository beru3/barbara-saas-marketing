// Xエンゲージメントbot
//   node engage.mjs           … フォロー・いいね・引用RT・リプライ候補生成
//   node engage.mjs replies   … 承認済みリプライを投稿
//
// 必要な環境変数:
//   X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
//   DEEPSEEK_API_KEY（引用RTコメント生成用）
//   GH_TOKEN（Issue更新用）
import { TwitterApi } from 'twitter-api-v2';
import OpenAI from 'openai';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
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

// 4. 引用RT（DeepSeekでコメント生成→自動投稿、1日2件上限）
console.log('=== 引用RT ===');
const QUOTE_LIMIT = CONFIG.quoteLimit || 2;
const quotedSet = new Set(history.quotedTweetIds);

if (process.env.DEEPSEEK_API_KEY) {
  const ai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

  // 引用RT候補: エンゲージメントが高く、クリニック経営に関連するツイート
  const quoteCandidates = uniqueTweets
    .filter(t => {
      const score = (t.public_metrics?.like_count || 0) + (t.public_metrics?.retweet_count || 0) * 3;
      return score >= 3 && !quotedSet.has(t.id) && !likedSet.has(t.id);
    })
    .sort((a, b) => {
      const scoreA = (a.public_metrics?.like_count || 0) + (a.public_metrics?.retweet_count || 0) * 3;
      const scoreB = (b.public_metrics?.like_count || 0) + (b.public_metrics?.retweet_count || 0) * 3;
      return scoreB - scoreA;
    })
    .slice(0, QUOTE_LIMIT);

  let quoteCount = 0;
  for (const t of quoteCandidates) {
    const user = t._user;
    const tweetUrl = `https://x.com/${user?.username || 'i'}/status/${t.id}`;

    try {
      const res = await ai.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `あなたはクリニック経営に詳しい「古家聡大」としてXの引用RTコメントを書きます。
ルール:
- 50〜100文字程度の短いコメント
- 「先生」と呼ぶ口調
- 押し売りしない。共感・補足・問いかけのいずれか
- 「ミルカルテ」というサービス名は絶対に出さない
- コメント本文のみ出力（引用元URLは含めない）`,
          },
          {
            role: 'user',
            content: `以下のツイートに引用RTコメントを1つだけ書いてください。\n\n@${user?.username}: ${t.text}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 200,
      });

      let comment = res.choices[0].message.content.trim();
      // 先頭・末尾の引用符を除去
      comment = comment.replace(/^["「『]|["」』]$/g, '');

      // 引用RTとして投稿（quote_tweet_id を使用）
      const posted = await client.v2.tweet(comment, {
        quote_tweet_id: t.id,
      });
      const postedUrl = `https://x.com/${CONFIG.account}/status/${posted.data.id}`;
      console.log(`  ✓ 引用RT: @${user?.username} → ${comment.slice(0, 50)}…`);
      console.log(`    ${postedUrl}`);

      history.quotedTweetIds.push(t.id);
      quotedSet.add(t.id);
      quoteCount++;
    } catch (e) {
      console.log(`  ✗ 引用RT失敗 (@${user?.username}): ${e?.data?.detail || e.message}`);
    }
  }
  console.log(`引用RT: ${quoteCount}件\n`);
} else {
  console.log('DEEPSEEK_API_KEY未設定のためスキップ\n');
}

// 5. リプライ候補をIssueに追記
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
  const commentBody = lines.join('\n');
  try {
    writeFileSync('/tmp/engage_comment.md', commentBody);
    gh(`issue comment ${engageIssueNumber} --repo ${CONFIG.repo} --body-file /tmp/engage_comment.md`);
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

  // 残りの承認済み（未投稿）リプライ数をカウント
  let remainingApproved = 0;
  for (const c of comments) {
    for (const ln of c.body.split('\n')) {
      const m2 = ln.match(/^- \[[xX]\]\s+`(\d+)`/);
      if (m2 && !history.repliedTweets?.includes(m2[1])) {
        remainingApproved++;
      }
    }
  }
  remainingApproved -= posted; // 今回投稿した分を引く

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `reply_remaining=${remainingApproved}\n`);
  }

  writeFileSync(ENGAGE_PATH, JSON.stringify(history, null, 2) + '\n');
  console.log(`リプライ投稿: ${posted}件（残ストック: ${remainingApproved}件）`);
}

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
