# barbara-saas-marketing

合同会社バーバラ企画 SaaSマーケティング戦略リポジトリ

## 概要

WebORCA API活用の患者離脱防止SaaS「バーバラSaaS」のマーケティング施策を管理するリポジトリです。

**`CLAUDE.md` がマーケティング戦略の正本（Single Source of Truth）です。**

## ディレクトリ構成

| ディレクトリ | 内容 |
|------------|------|
| `CLAUDE.md` | マーケティング戦略統合版（ターゲット・チャネル・SEO・コンテンツカレンダー・CTA・KPI） |
| `articles/` | 完成記事のMarkdown |
| `calendar/` | 投稿カレンダー・URLスラッグ設計 |
| `research/` | 競合分析・KW調査 |
| `assets/` | 画像指示書・ヘッダーデザイン等 |

## 関連リポジトリ

| リポジトリ | 内容 | 連携ポイント |
|-----------|------|------------|
| [barbara-saas](https://github.com/beru3/barbara-saas) | プロダクト開発（API・分析・レポート生成） | プロダクト仕様・価格設計・技術基盤 |

## 運用ルール

- マーケ戦略の変更は本リポの `CLAUDE.md` を更新する（barbara-saas側には概要リンクのみ残置）
- プロダクト仕様の変更は `barbara-saas` 側で行い、マーケに影響する場合は本リポも更新する
- 記事制作の成果物は `articles/` に格納し、投稿済みフラグを管理する
