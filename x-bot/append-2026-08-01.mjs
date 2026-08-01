// One-shot script: append gen-20260801-1/2/3 to Issue #1
// Run via GitHub Actions with GH_TOKEN set
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const REPO = 'beru3/barbara-saas-marketing';
const ISSUE = 1;

const NEW_LINES = [
  "- [ ] `gen-20260801-1` 今日から8月、お盆まで2週間です。患者さんが「盆が終わったら行こう」と受診を先延ばしにしやすい時期に入ります。帰省先でたまたま別の院を受診した方が、そのまま戻らないこともある。「夏は仕方ない」と待つ院と、今週声をかける院では、秋の患者数が変わります。",
  "- [ ] `gen-20260801-2` 4月に来院を始めた患者さんが今月も通っているか——8月は、その定着率がわかる節目です。新年度や健診をきっかけに来た方は、症状が落ち着くと来なくなりやすい。この夏を超えてもまだ通っているかどうか、先生の院で今週確かめてみてください。→ https://note.com/furuie_akihiro/n/n7eefe51b33a6",
  "- [ ] `gen-20260801-3` 生活習慣病で通っている患者さんが月1回来院すると、年間12回の診療になります。でも実際に毎月来ている方が何割いるか——先生の院で即答できますか。この数字を把握すると、「どの患者さんに声をかけるべきか」が自然と見えてきます。まず知ることが、手の打ちどころを生みます。",
];

const MARKER_ID = 'gen-20260801-1';
const INSERT_AFTER_ID = 'gen-20260731-3';

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

writeFileSync('/tmp/issue-body-2026-08-01.md', newBody);
execSync(`gh issue edit ${ISSUE} --repo ${REPO} --body-file /tmp/issue-body-2026-08-01.md`);
console.log(`Done: appended ${NEW_LINES.length} posts after ${INSERT_AFTER_ID}.`);
