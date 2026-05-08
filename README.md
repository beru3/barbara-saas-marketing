# barbara-saas-marketing

合同会社バーバラ企画 SaaSマーケティング戦略リポジトリ

## 概要

患者離脱防止SaaS「ミルカルテ（mirukarte）」のマーケティング施策を管理するリポジトリです。

## ディレクトリ構成

| パス | 内容 |
|------|------|
| `CLAUDE.md` | Claude Code向け行動指示（ペルソナ・トーン・禁止パターン・docs参照リンク） |
| `docs/target_and_channel.md` | ターゲット・チャネル・サイト構成・料金Tier |
| `docs/content_calendar.md` | 24本カレンダー・URLスラッグ・SEO・KWマッピング |
| `docs/cta_strategy.md` | CTA詳細・PDFレポート構成・ステップメール・初期参画院募集 |
| `docs/content_guidelines.md` | 記事テンプレ・投稿ルール・ネタ切れ防止4軸 |
| `docs/kpi_and_todos.md` | KPI・残課題・次のアクション |
| `articles/` | 完成記事のMarkdown |
| `research/` | 競合分析・KW調査 |
| `assets/` | 画像指示書・ヘッダーデザイン等 |

## 関連リポジトリ

| リポジトリ | 内容 |
|-----------|------|
| [barbara-saas](https://github.com/beru3/barbara-saas) | プロダクト開発（API・分析・レポート生成） |
| [mirukarte-deck](https://github.com/beru3/mirukarte-deck) | サービス説明資料（営業向けHTMLデッキ） |

## 運用ルール

- マーケ戦略の変更は本リポの `docs/` 配下を更新する（barbara-saas側にはリンクのみ）
- プロダクト仕様の変更は `barbara-saas` 側で行い、マーケに影響する場合は本リポも更新する
- 記事制作の成果物は `articles/` に格納し、投稿済みフラグを管理する
