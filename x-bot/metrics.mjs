// X投稿メトリクス日次レポート
//   node metrics.mjs          … メトリクス取得＋Issue更新＋Gmailレポート送信
//   node metrics.mjs --dry    … メトリクス取得のみ（Issue/メール送信なし）
//
// 必要な環境変数:
//   X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
//   GH_TOKEN（Issue更新用）
//   GMAIL_USERNAME, GMAIL_APP_PASSWORD（メール送信用）
import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createTransport } from 'nodemailer';

const dir = fileURLToPath(new URL('./', import.meta.url));
const dryRun = process.argv.includes('--dry');

// --- 1. X API認証 ---
for (const k of ['X_API_KEY', 'X_API_KEY_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET']) {
  if (!process.env[k]) { console.error('環境変数が未設定: ' + k); process.exit(1); }
}
const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_KEY_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

// --- 2. 投稿台帳からツイートIDを取得 ---
const posted = JSON.parse(readFileSync(dir + 'posted.json', 'utf8'));
const tweetIds = posted.map(p => p.tweetId);

if (tweetIds.length === 0) {
  console.log('投稿台帳が空です。');
  process.exit(0);
}

// --- 3. X API v2でメトリクス取得（100件ずつ） ---
const allMetrics = [];
for (let i = 0; i < tweetIds.length; i += 100) {
  const batch = tweetIds.slice(i, i + 100);
  const res = await client.v2.tweets(batch, {
    'tweet.fields': 'public_metrics,created_at',
  });
  for (const tweet of (res.data || [])) {
    const entry = posted.find(p => p.tweetId === tweet.id);
    allMetrics.push({
      id: entry?.id || '?',
      tweetId: tweet.id,
      text: (entry?.text || '').slice(0, 40),
      impressions: tweet.public_metrics.impression_count,
      likes: tweet.public_metrics.like_count,
      retweets: tweet.public_metrics.retweet_count,
      replies: tweet.public_metrics.reply_count,
      quotes: tweet.public_metrics.quote_count,
    });
  }
}

// 投稿順にソート
const idOrder = new Map(posted.map((p, i) => [p.tweetId, i]));
allMetrics.sort((a, b) => (idOrder.get(a.tweetId) ?? 999) - (idOrder.get(b.tweetId) ?? 999));

// --- 4. レポート生成 ---
const today = new Date().toISOString().slice(0, 10);
const totalImpressions = allMetrics.reduce((s, m) => s + m.impressions, 0);
const totalLikes = allMetrics.reduce((s, m) => s + m.likes, 0);
const totalRetweets = allMetrics.reduce((s, m) => s + m.retweets, 0);

const tableHeader = '| ID | テキスト（先頭40字） | imp | ♥ | RT | 返信 | 引用 |';
const tableSep    = '|---|---|---:|---:|---:|---:|---:|';
const tableRows = allMetrics.map(m =>
  `| ${m.id} | ${m.text}… | ${m.impressions} | ${m.likes} | ${m.retweets} | ${m.replies} | ${m.quotes} |`
);

const reportMd = [
  `### ${today} メトリクスレポート`,
  '',
  `**合計:** imp ${totalImpressions} / ♥ ${totalLikes} / RT ${totalRetweets} / 投稿数 ${allMetrics.length}`,
  '',
  tableHeader,
  tableSep,
  ...tableRows,
].join('\n');

console.log(reportMd);

if (dryRun) {
  console.log('\n(dry run: Issue更新・メール送信をスキップ)');
  process.exit(0);
}

// --- 5. メトリクス履歴をJSONに保存 ---
const HISTORY_PATH = dir + 'metrics_history.json';
let history = [];
try { history = JSON.parse(readFileSync(HISTORY_PATH, 'utf8')); } catch { history = []; }
history.push({ date: today, metrics: allMetrics });
// 直近90日分だけ保持
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 90);
const cutoffStr = cutoff.toISOString().slice(0, 10);
const trimmed = history.filter(h => h.date >= cutoffStr);
writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2) + '\n');

// --- 6. GitHub Issue にレポート追記 ---
const CONFIG = JSON.parse(readFileSync(dir + 'config.json', 'utf8'));
const gh = (args) => execSync('gh ' + args, { encoding: 'utf8' });

// Issue #2 をメトリクスレポート用に使う
const metricsIssueNumber = CONFIG.metricsIssueNumber || 2;
try {
  gh(`issue comment ${metricsIssueNumber} --repo ${CONFIG.repo} --body "${reportMd.replace(/"/g, '\\"')}"`);
  console.log(`\nIssue #${metricsIssueNumber} にレポートを追記しました。`);
} catch (e) {
  console.error('Issue更新に失敗:', e.message);
}

// --- 7. Gmailレポート送信 ---
if (process.env.GMAIL_USERNAME && process.env.GMAIL_APP_PASSWORD) {
  const transporter = createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USERNAME,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  // テキスト版（メール本文）
  const textBody = [
    `X投稿メトリクス日次レポート（${today}）`,
    '',
    `合計: imp ${totalImpressions} / ♥ ${totalLikes} / RT ${totalRetweets} / 投稿数 ${allMetrics.length}`,
    '',
    '--- 個別 ---',
    ...allMetrics.map(m =>
      `[${m.id}] ${m.text}…\n  imp: ${m.impressions} / ♥: ${m.likes} / RT: ${m.retweets} / 返信: ${m.replies}`
    ),
    '',
    `Issue: https://github.com/${CONFIG.repo}/issues/${metricsIssueNumber}`,
  ].join('\n');

  await transporter.sendMail({
    from: `X指標bot <${process.env.GMAIL_USERNAME}>`,
    to: process.env.GMAIL_USERNAME,
    subject: `【X指標】${today} imp:${totalImpressions} ♥:${totalLikes} RT:${totalRetweets}`,
    text: textBody,
  });

  console.log('Gmailにレポートを送信しました。');
} else {
  console.log('GMAIL環境変数が未設定のためメール送信をスキップ。');
}

process.exit(0);
