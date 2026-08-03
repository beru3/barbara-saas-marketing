// One-shot script: append gen-20260803-1/2/3 to Issue #1
// Run via GitHub Actions with GH_TOKEN set
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const REPO = 'beru3/barbara-saas-marketing';
const ISSUE = 1;

const NEW_LINES = [
  "- [ ] `gen-20260803-1` 8月から高額療養費の自己負担上限が引き上げられました。制度変更は収入面で語られますが、患者さんの側では「窓口負担が増えた」と感じた瞬間に、症状のない通院を最初に後回しにします。今月の来院傾向に変化がないか——先生の院に確かめる数字がありますか。",
  "- [ ] `gen-20260803-2` 「盆が終わったら行こう」と思った患者さんは、お盆が明けても自分から連絡しません。院側がそれを知るのは、盆明けの来院数が減ってから——でも、そこでは声をかけるタイミングが一歩遅い。先生の院は、今週動けますか。",
  "- [ ] `gen-20260803-3` 患者フォローをExcelで管理している院があります。夏休みや退職でその担当スタッフがいなくなったとき、ファイルを更新できる人は残っていますか。誰かの記憶に頼った管理は、その人が席を外した瞬間から止まります。→ https://note.com/furuie_akihiro/n/nbb75b474b3f0",
];

const MARKER_ID = 'gen-20260803-1';
const INSERT_AFTER_ID = 'gen-20260802-3';

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

writeFileSync('/tmp/issue-body-2026-08-03.md', newBody);
execSync(`gh issue edit ${ISSUE} --repo ${REPO} --body-file /tmp/issue-body-2026-08-03.md`);
console.log(`Done: appended ${NEW_LINES.length} posts after ${INSERT_AFTER_ID}.`);
