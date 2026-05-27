// X投稿文の自動生成スクリプト
//   node generate.mjs        … 投稿文を3件生成し、Issue #1 のキューに追加
//
// 必要な環境変数:
//   DEEPSEEK_API_KEY
//   GH_TOKEN（Issue更新用）
import OpenAI from 'openai';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const dir = fileURLToPath(new URL('./', import.meta.url));
const CONFIG = JSON.parse(readFileSync(dir + 'config.json', 'utf8'));

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('環境変数が未設定: DEEPSEEK_API_KEY');
  process.exit(1);
}

const ai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const gh = (args) => execSync('gh ' + args, { encoding: 'utf8' });

// --- 1. 過去の投稿を取得（重複防止＋トーン参考） ---
const posted = JSON.parse(readFileSync(dir + 'posted.json', 'utf8'));
const recentTexts = posted.slice(-10).map(p => p.text);

// Issue #1 のキューにある未投稿分も取得
const issueBody = gh(`issue view ${CONFIG.issueNumber} --repo ${CONFIG.repo} --json body -q .body`);
const queueTexts = [];
let sec = '';
for (const ln of issueBody.split('\n')) {
  if (/^##\s*(投稿キュー|承認待ち)\s*$/.test(ln)) { sec = 'q'; continue; }
  if (/^##\s/.test(ln)) { sec = ''; continue; }
  if (sec === 'q') {
    const m = ln.match(/^- \[[ xX]\]\s+`([^`]+)`\s+(.+)$/);
    if (m) queueTexts.push(m[2].trim());
  }
}

const existingTexts = [...recentTexts, ...queueTexts].map(t => `- ${t}`).join('\n');

// --- 2. note記事一覧（リンク先として使う） ---
const publishedMd = readFileSync(dir + '../articles/PUBLISHED.md', 'utf8');
const noteUrls = [];
for (const m of publishedMd.matchAll(/\| (\d+) \| (.+?) \|.+?\| (https:\/\/note\.com\/.+?) \|/g)) {
  noteUrls.push({ num: m[1], title: m[2].trim(), url: m[3].trim() });
}
const noteList = noteUrls.map(n => `#${n.num} ${n.title} ${n.url}`).join('\n');

// --- 3. DeepSeekで投稿文を生成 ---
const GENERATE_COUNT = CONFIG.generateCount || 3;
const today = new Date().toISOString().slice(0, 10);

const systemPrompt = `あなたはクリニック経営に詳しいXアカウント「古家聡大（ふるいえあきひろ）」の投稿文を作成するライターです。

【ペルソナ】
- 読者：内科・生活習慣病クリニックの院長。50代。IT苦手。経営数字を見ていない。
- 口調：「先生」と呼ぶ。押し売りしない。データで説得。

【投稿ルール】
- 1投稿は140文字以内（日本語）。Xの文字数制限に収まること。
- 「ミルカルテ」というサービス名は絶対に出さない。
- 技術用語（API、WebORCA等）を使わない。
- マーケター語彙をそのまま使わない（LTV→「リピート患者」等）。
- 問いかけ・データ・季節ネタ・時事ネタを活用する。
- 3投稿のうち1〜2投稿にnote記事へのリンクを含める（「→ URL」の形式）。
- リンク付き投稿は、リンクなしでも単独で意味が通じる文章にすること（リンクは自動的にリプライに分離されるため）。
- リンクなしの投稿は単独で完結する気づき・問いかけにする。

【使えるnote記事一覧】
${noteList}

【過去の投稿・キュー内の投稿（重複しないこと）】
${existingTexts}`;

const userPrompt = `今日は${today}です。新しい投稿文を${GENERATE_COUNT}件作成してください。

以下のJSON形式で出力してください。他の文章は不要です。
[
  { "text": "投稿文1" },
  { "text": "投稿文2" },
  { "text": "投稿文3" }
]`;

console.log(`DeepSeek APIで${GENERATE_COUNT}件の投稿文を生成中…`);

const response = await ai.chat.completions.create({
  model: 'deepseek-chat',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  temperature: 0.8,
  max_tokens: 1000,
});

const content = response.choices[0].message.content.trim();
console.log('API応答:', content);

// --- 4. JSONパース ---
let generated;
try {
  // コードブロックで囲まれている場合に対応
  const jsonStr = content.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  generated = JSON.parse(jsonStr);
} catch (e) {
  console.error('JSONパースに失敗:', e.message);
  console.error('raw:', content);
  process.exit(1);
}

if (!Array.isArray(generated) || generated.length === 0) {
  console.error('生成結果が空です');
  process.exit(1);
}

// --- 5. ID採番＋Issue #1 のキューに追加 ---
const dateTag = today.replace(/-/g, '');
const newLines = [];
for (let i = 0; i < generated.length; i++) {
  const text = generated[i].text.trim();
  if (!text) continue;
  const id = `auto-${dateTag}-${i + 1}`;
  newLines.push(`- [ ] \`${id}\` ${text}`);
  console.log(`  生成: [${id}] ${text.slice(0, 60)}…`);
}

if (newLines.length === 0) {
  console.log('有効な投稿文がありませんでした。');
  process.exit(0);
}

// Issue本文を更新：「## 投稿キュー」または「## 承認待ち」セクションの末尾に追加
const lines = issueBody.replace(/\r\n/g, '\n').split('\n');
const updatedLines = [];
let inserted = false;
let inQueue = false;

for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];

  if (/^##\s*(投稿キュー|承認待ち)\s*$/.test(ln)) {
    inQueue = true;
    updatedLines.push(ln);
    continue;
  }

  if (inQueue && /^##\s/.test(ln)) {
    // キューセクションの終わり → ここに新規投稿を挿入
    for (const nl of newLines) updatedLines.push(nl);
    updatedLines.push('');
    inserted = true;
    inQueue = false;
  }

  updatedLines.push(ln);
}

// セクションが最後だった場合
if (inQueue && !inserted) {
  for (const nl of newLines) updatedLines.push(nl);
  inserted = true;
}

if (!inserted) {
  console.error('Issue本文に「投稿キュー」または「承認待ち」セクションが見つかりません');
  process.exit(1);
}

writeFileSync('/tmp/x_issue_gen.md', updatedLines.join('\n'));
gh(`issue edit ${CONFIG.issueNumber} --repo ${CONFIG.repo} --body-file /tmp/x_issue_gen.md`);

console.log(`\nIssue #${CONFIG.issueNumber} に${newLines.length}件追加しました。`);
