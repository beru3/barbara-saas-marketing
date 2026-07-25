// One-shot script: append gen-20260725-1/2/3 to Issue #1
// Run via GitHub Actions with GH_TOKEN set
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const REPO = 'beru3/barbara-saas-marketing';
const ISSUE = 1;

const NEW_LINES = [
  "- [ ] `gen-20260725-1` 今週、熱中症で救急搬送された方が全国で1万人を超えました。「涼しくなったら行こう」と思った患者さんが、そのまま秋まで来なくなる——この夏のピークが、来院間隔を押し広げています。先生の院に、今月の変化を教えてくれる数字がありますか。",
  "- [ ] `gen-20260725-2` 「勘で経営している院」と「データで見ている院」の分かれ目は、使っているソフトでも資格でもありません。月に1回、来院数の変化を記録しているかどうか——ただそれだけです。先生の院は、今月のデータを来年見返せますか。→ https://note.com/furuie_akihiro/n/ne676cda2437f",
  "- [ ] `gen-20260725-3` 来月の最初の一手が、今月の数字で決まります。患者さんを増やしたいとき、新患に動くか再来院率の改善に動くか——それを判断するには、今月のデータが要ります。先生の院に、来月の動き方の根拠がありますか。",
];

const MARKER_ID = 'gen-20260725-1';
const INSERT_AFTER_ID = 'gen-20260723-3';

const body = execSync(
  `gh issue view ${ISSUE} --repo ${REPO} --json body -q .body`,
  { encoding: 'utf8' }
);

if (body.includes(MARKER_ID)) {
  console.log('Already inserted, skipping.');
  process.exit(0);
}

const lines = body.replace(/\r\n/g, '\n').split('\n');
const idx = lines.findIndex(l => l.includes('`' + INSERT_AFTER_ID + '`'));
if (idx === -1) {
  console.error(`Marker line not found: ${INSERT_AFTER_ID}`);
  process.exit(1);
}

lines.splice(idx + 1, 0, ...NEW_LINES);
const newBody = lines.join('\n');

writeFileSync('/tmp/issue-body-2026-07-25.md', newBody);
execSync(`gh issue edit ${ISSUE} --repo ${REPO} --body-file /tmp/issue-body-2026-07-25.md`);
console.log(`Done: appended ${NEW_LINES.length} posts after ${INSERT_AFTER_ID}.`);
