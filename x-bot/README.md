# x-bot — X自動投稿

X（@furuie_akihiro）への自動投稿の仕組み。設計は [docs/x_automation_plan.md](../docs/x_automation_plan.md)。

## 構成

- `post.mjs` — 投稿スクリプト（X API v2 / OAuth 1.0a）
- `queue.json` — 投稿キュー
- GitHub Actions（[.github/workflows/x-post.yml](../.github/workflows/x-post.yml)）が実行
- APIキーは GitHub Secrets（`X_API_KEY` `X_API_KEY_SECRET` `X_ACCESS_TOKEN` `X_ACCESS_TOKEN_SECRET`）

## モード

- `node post.mjs check` — 認証確認のみ（投稿しない）
- `node post.mjs post` — `queue.json` で `status: "approved"` の先頭1件を投稿

## queue.json の各項目

| キー | 説明 |
|------|------|
| `id` | 一意のID |
| `text` | 投稿本文 |
| `status` | `pending`（生成済み・未承認）→ `approved`（古家が承認）→ `posted`（投稿済み） |
| `source` | ネタ元 |
| `tweetId` / `postedAt` | 投稿後に自動付与 |

## 承認フロー

生成ルーティンが `pending` で投稿案を追加 → 古家が `approved` に変更（1タップ承認）→
GitHub Actions が `approved` を投稿し `posted` に更新。
