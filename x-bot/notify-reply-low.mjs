// リプライストック不足メール通知（nodemailer版）
// Usage: node notify-reply-low.mjs <remaining>
import { createTransport } from 'nodemailer';

const remaining = process.argv[2];
if (!remaining) {
  console.log('remaining が未指定のためスキップ');
  process.exit(0);
}

for (const k of ['GMAIL_USERNAME', 'GMAIL_APP_PASSWORD', 'REPO']) {
  if (!process.env[k]) { console.error('環境変数が未設定: ' + k); process.exit(1); }
}

const { GMAIL_USERNAME, GMAIL_APP_PASSWORD, REPO } = process.env;

const transporter = createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USERNAME, pass: GMAIL_APP_PASSWORD },
});

await transporter.sendMail({
  from: `X engage bot <${GMAIL_USERNAME}>`,
  to: GMAIL_USERNAME,
  subject: `【X engage bot】承認済みリプライが残り${remaining}件です`,
  text: [
    `承認済みリプライのストックが残り ${remaining} 件です。`,
    '0件になるとリプライ投稿が止まります。',
    '',
    'Issue #3 を開いてリプライ候補にチェックを入れてください:',
    `https://github.com/${REPO}/issues/3`,
  ].join('\n'),
});

console.log('通知メール送信完了');
