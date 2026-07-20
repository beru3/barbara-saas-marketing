import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const repo = 'beru3/barbara-saas-marketing';
const gh = (cmd) => execSync('gh ' + cmd, { encoding: 'utf8' });

const anchor = '- [ ] `gen-20260719-3` 月次レポートを始める目的は分析ではありません。「先月と今月を比べる」——それだけです。来院数・再来院率・患者単価の3つを月1回眺めると、院の動きが見えてきます。今月の記録が、来年の夏に比べる基準になります。→ https://note.com/furuie_akihiro/n/n3b277f371e97';

const newPosts = '\n- [ ] `gen-20260720-1` 今日は海の日です。三連休で来院が途切れた患者さんに、先生の院はいつ気づきますか。気づくのが1週間後か、1ヶ月後か、気づかないままかで、できることが変わります。早く気づいた院だけが、声をかけられます。\n- [ ] `gen-20260720-2` 来なくなった患者さんを5人呼び戻せたとします。半年間、月1回来院すれば25万円の診療になります。新患5人を集めるには集患コストが別にかかる。来なくなった患者さんへのフォローは、集患より費用対効果がいい選択肢です。→ https://note.com/furuie_akihiro/n/nba0c87821607\n- [ ] `gen-20260720-3` 先生の院を友人に紹介してくれる患者さんは、ほぼ間違いなく「長く通っている方」です。新患紹介を期待するなら、今いる患者さんに長く通ってもらうことが先になります。口コミを生む院は、まず再来院率を上げた院です。';

const body = gh(`issue view 1 --repo ${repo} --json body -q .body`);
if (!body.includes(anchor)) {
  console.log('Anchor not found - posts may already be applied. Exiting.');
  process.exit(0);
}
const newBody = body.replace(anchor, anchor + newPosts);
writeFileSync('/tmp/issue_new.md', newBody);
gh(`issue edit 1 --repo ${repo} --body-file /tmp/issue_new.md`);
console.log('Done: gen-20260720-1/2/3 added to Issue #1 承認待ち');
