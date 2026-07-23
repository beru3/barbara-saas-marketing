// 一時スクリプト：2026-07-23の投稿案3件をIssue #1 承認待ちに追加
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const dir = fileURLToPath(new URL('./', import.meta.url));
const CONFIG = JSON.parse(readFileSync(dir + 'config.json', 'utf8'));
const gh = (args) => execSync('gh ' + args, { encoding: 'utf8' });

const newEntries = [
  '- [ ] `gen-20260723-1` 「都市部でのクリニック新規開業に届出が必要になった」というニュースを聞いて安心した先生へ。近所に競合が増えにくくなっても、今いる患者さんが来なくなれば院の収入は変わりません。外からの脅威より、内側で起きている離脱の方が影響は大きいことがあります。',
  '- [ ] `gen-20260723-2` 患者フォローを「気になった人が動く」方式でやっていると、繁忙期に最初に省かれます。でも仕組みに変えると、忙しい日でも動きが止まらない。その差が、残業やスタッフへの負荷にも影響する——という話を、記事にまとめました。 → https://note.com/furuie_akihiro/n/n1327b5ec4e27',
  '- [ ] `gen-20260723-3` 夏に確かめておきたい3つのことがあります。・来院が空いてきた患者さんを誰かが把握しているか・来なくなった方に院から連絡できるか・お盆休みの間もその動きが止まらないか。いくつ「ある」と言えますか。先生の院の秋は、今週の確認で変わります。',
];

const body = gh(`issue view ${CONFIG.issueNumber} --repo ${CONFIG.repo} --json body -q .body`);
const lines = body.replace(/\r\n/g, '\n').split('\n');
const updatedLines = [];
let inQueue = false;
let inserted = false;

for (const ln of lines) {
  if (/^##\s*(投稿キュー|承認待ち)\s*$/.test(ln)) { inQueue = true; updatedLines.push(ln); continue; }
  if (inQueue && /^##\s/.test(ln)) {
    for (const ne of newEntries) updatedLines.push(ne);
    updatedLines.push('');
    inserted = true;
    inQueue = false;
  }
  updatedLines.push(ln);
}
if (inQueue && !inserted) {
  for (const ne of newEntries) updatedLines.push(ne);
}

writeFileSync('/tmp/inject.md', updatedLines.join('\n'));
gh(`issue edit ${CONFIG.issueNumber} --repo ${CONFIG.repo} --body-file /tmp/inject.md`);
console.log('Issue #1 に3件追加: gen-20260723-1, gen-20260723-2, gen-20260723-3');
