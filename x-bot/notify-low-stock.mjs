// 承認ストック不足メール通知（nodemailer版）
// Usage: node notify-low-stock.mjs <remaining>
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
  from: `X投稿bot <${GMAIL_USERNAME}>`,
  to: GMAIL_USERNAME,
  subject: `【X投稿bot】承認ストックが残り${remaining}件です`,
  text: [
    `承認済み・未投稿の投稿案が残り ${remaining} 件です。`,
    'このままだと近くXへの投稿が止まります。',
    '',
    'Issue を開いてチェックを入れてください:',
    `https://github.com/${REPO}/issues/1`,
  ].join('\n'),
});

console.log('通知メール送信完了');
