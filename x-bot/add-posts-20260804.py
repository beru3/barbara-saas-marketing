"""One-shot script: append gen-20260804-{1,2,3} to Issue #1. Run via GH Actions."""
import urllib.request
import json
import os

token = os.environ["GITHUB_TOKEN"]
owner = "beru3"
repo = "barbara-saas-marketing"
issue_number = 1

headers = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
}

url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}"
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
body = data["body"]

new_items = (
    "- [ ] `gen-20260804-1` "
    "「秋になれば来院も戻る」——先生はそう思っていませんか。"
    "今年は8月以降も全国的に高い気温が続く見込みだと発表されています。"
    "「涼しくなったら行こう」を待ち続けた患者さんが、そのまま年末を迎えるかもしれません。"
    "先生の院で今月、来院が途切れた方が何人いるか——今週確かめてみてください。\n"
    "- [ ] `gen-20260804-2` "
    "お盆まで約10日です。"
    "お盆で来院リズムが崩れた患者さんが、そのまま戻らないケースが毎年あります。"
    "「再来院率」を今確かめておくと、盆明けに声をかけるべき患者さんが見えてきます。"
    "先生の院に、今月の記録がありますか。→ https://note.com/furuie_akihiro/n/nba0c87821607\n"
    "- [ ] `gen-20260804-3` "
    "患者さんが来なくなりやすい夏のタイミングは3つあります。"
    "猛暑が続く8月前半、お盆で来院リズムが崩れる8月中旬、そしてお盆後に「また今度」が続く9月。"
    "今は最初の山の中です。"
    "先生の院で、この夏に来院が途切れた患者さんを把握できていますか。\n"
)

marker = "\n## 投稿済み"
if marker not in body:
    print("ERROR: marker '## 投稿済み' not found in body")
    raise SystemExit(1)

if "gen-20260804-1" in body:
    print("gen-20260804-1 already present, skipping.")
    raise SystemExit(0)

updated = body.replace(marker, "\n" + new_items + marker, 1)

payload = json.dumps({"body": updated}).encode("utf-8")
req2 = urllib.request.Request(url, data=payload, headers=headers, method="PATCH")
with urllib.request.urlopen(req2) as resp2:
    result = json.loads(resp2.read())
print(f"Issue updated at: {result['updated_at']}")
print("gen-20260804-1, gen-20260804-2, gen-20260804-3 added to Issue #1")
