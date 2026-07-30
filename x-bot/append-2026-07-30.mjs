// One-shot script: append gen-20260730-1/2/3 to Issue #1
// Run via GitHub Actions with GH_TOKEN set
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const REPO = 'beru3/barbara-saas-marketing';
const ISSUE = 1;

const NEW_LINES = [
  "- [ ] `gen-20260730-1` 「猛暑だから患者さんが来ない」と思うと、今年の夏は待つしかありません。でも同じ暑さのなかでも、来院が続いている院はあります。違いは気温でも立地でもなく、来なくなり始めた患者さんに院が気づけるかどうかです。先生の院に、その仕組みがありますか。",
  "- [ ] `gen-20260730-2` 今年7月の猛暑で通院を後回しにした患者さんが、お盆をはさんで2ヶ月続けて来なければ、そのまま戻らない方も出てきます。\u6んで性疾患の方が10人来なくなると、年間でおよそ84万円。夏を「仕方ない季節」にしない院には、理由があります。→ https://note.com/furuie_akihiro/n/n74dfb606526a",
  "- [ ] `gen-20260730-3` 明日かり8月。お盆前後でリズムが崩れた患者さんが、そのまま「また今度」になるケースが毎年あります。その方々が1人でも来なくなった場合、年間の差はいくらでしょうか。先生の院の再来院率を一度計算してみると、見え方が変わります。→ https://note.com/furuie_akihiro/n/nba0c87821607",
];

const MARKER_ID = 'gen-20260730-1';
const INSERT_AFTER_ID = 'gen-20260728-3';

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

writeFileSync('/tmp/issue-body-2026-07-30.md', newBody);
execSync(`gh issue edit ${ISSUE} --repo ${REPO} --body-file /tmp/issue-body-2026-07-30.md`);
console.log(`Done: appended ${NEW_LINES.length} posts after ${INSERT_AFTER_ID}.`);
