import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const REPO = 'beru3/barbara-saas-marketing';
const ISSUE = 1;
const NEW_LINES = [
  "- [ ] `gen-20260713-1` 7月は熱中症予防強化月間です。暑さで「涼しくなったら行こう」と通院を先延ばしにした患者さんが、そのまま来なくなるケースが毎年起きています。来年の夏に「なぜ来なくなったんだろう」と気づいても、もう手遅れです。今月、先生の院に気づける仕組みがありますか。",
  "- [ ] `gen-20260713-2` 生活習慣病の患者さんが通院をやめる理由で最も多いのは、「症状がなくなったから」です。治療がうまくいっているほど、来なくなりやすい。先生の腕が良いほど離脱が起きる——この逆説を知ると、診察の最後の一言が変わります。→ https://note.com/furuie_akihiro/n/n78a4b50b49bb",
  "- [ ] `gen-20260713-3` 今月初めて先生の院に来た患者さんは、2ヶ月後も通い続けていますか。夏の暑さや企業健診がきっかけで受診した方は、症状が落ち着くと来なくなりやすい層です。秋になって気づいても、連絡する手段がなければ動けません。先生の院に、今月の来院者を追える仕組みがありますか。",
];

const gh = (args) => execSync(`gh ${args}`, { encoding: 'utf8' });

const body = gh(`issue view ${ISSUE} --repo ${REPO} --json body -q .body`);
const lines = body.replace(/\r\n/g, '\n').split('\n');
const out = [];
let inserted = false;

for (const ln of lines) {
  if (!inserted && /^##\s*投稿済み/.test(ln)) {
    for (const nl of NEW_LINES) out.push(nl);
    out.push('');
    inserted = true;
  }
  out.push(ln);
}

if (!inserted) {
  for (const nl of NEW_LINES) out.push(nl);
}

writeFileSync('/tmp/injected.md', out.join('\n'));
gh(`issue edit ${ISSUE} --repo ${REPO} --body-file /tmp/injected.md`);
console.log('Done. Inserted', NEW_LINES.length, 'posts.');
