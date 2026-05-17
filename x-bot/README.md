# x-bot — X自動投稿

X（@furuie_akihiro）への自動投稿の仕組み。設計は [docs/x_automation_plan.md](../docs/x_automation_plan.md)。

## 構成

- `post.mjs` — 投稿スクリプト（X API v2 / OAuth 1.0a）
- `config.json` — リポジトリ名・承認IssueのNo・アカウント名
- `posted.json` — 投稿済み台帳（重複防止の要）
- 承認は **GitHub Issue「X投稿 承認待ち」**（#1）のチェックボックス
- 実行は GitHub Actions（[.github/workflows/x-post.yml](../.github/workflows/x-post.yml)）
- APIキーは GitHub Secrets（`X_API_KEY` `X_API_KEY_SECRET` `X_ACCESS_TOKEN` `X_ACCESS_TOKEN_SECRET`）

## モード

- `node post.mjs check` — 認証確認のみ（投稿しない）
- `node post.mjs post` — 承認Issueの「承認待ち」内で ☑ かつ未投稿の案を1件投稿

## 流れ

1. 生成ルーティンが承認Issueの「## 承認待ち」に投稿案をチェックリストで追加
2. 古家が投稿したい案の ☑ をタップ
3. GitHub Actions が毎日起動し、☑済み・未投稿の案を1件投稿
4. 投稿した案は `posted.json` に記録、Issueの「## 投稿済み」へ移動

## 重複防止

- 投稿案ごとに一意のID
- 投稿済みIDは `posted.json` に記録（gitコミットで永続化）
- 投稿対象は「☑ かつ posted.json に未記録」のIDのみ
- Issue上でも承認待ち→投稿済みへ移動するため二重に防御
- さらに X API 自体が同一本文の連続投稿を拒否
