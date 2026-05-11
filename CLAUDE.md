# CLAUDE.md - ミルカルテ（mirukarte）マーケティング

> 法人：合同会社バーバラ企画 / 代表：古家聡大（GitHub: beru3）
> プロダクト設計・技術仕様は [barbara-saas](https://github.com/beru3/barbara-saas) を参照。

## サービス概要

- **ミルカルテ** — 外来クリニック向け患者離脱防止SaaS（「見る＋カルテ」の造語）
- 競合は分析止まり。ミルカルテは「発見→実行（DM代行・LINE運用）→効果測定」を一貫提供
- 在宅向けSaaSは凍結中

## note記事ルール

**ペルソナ：** 内科・生活習慣病クリニック院長。50代。IT苦手。経営数字は見ていない。

**トーン：** 「先生」と呼ぶ。専門用語はかみ砕く。データで説得。押し売りしない。

**構成：** タイトル → リード文(100〜150字) → 問題提起 → 原因分析 → 解決策 → まとめ → CTA

**4エッセンス（全記事に最低1つ）：** マーケティング / IT / 経営 / 組織マネジメント

**制作フロー：** 古家が方向性決定 → Claudeが構成・文章化 → 古家が確認・修正 → note投稿

## 禁止パターン（NEVER）

- NEVER 記事内で「ミルカルテ」のサービス名を出す（Month 1〜4は厳守。Month 5以降はOK）
- NEVER 技術用語（API、WebORCA、UKE等）を記事内で使う
- NEVER 院長を上から教える口調で書く
- NEVER マーケター語彙をそのまま使う（LTV→「リピート患者」、チャーン→「離脱率」）

## CTA方針（2026年5月更新）

- **メインCTA：初期参画院への応募**（全記事共通で初期参画院募集LPへ誘導）
- PDFレポート＋ステップメール（Brevo）は後回し（オーガニック流入が増えた段階で導入）
- LP技術：**静的HTML**（barbara.co.jp）＋ **Googleフォーム**
- 主戦場は直接営業。note記事は信頼の裏付け
- 共創型マーケ：顧客を「共創者」として迎える。詳細は [docs/cta_strategy.md](docs/cta_strategy.md) を参照

## 関連ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [docs/strategic_decisions.md](docs/strategic_decisions.md) | 事業仮説検証・身元開示方針・並列開発方針・未決定事項 |
| [docs/target_and_channel.md](docs/target_and_channel.md) | ターゲット・チャネル・X戦略・サイト構成・料金Tier |
| [docs/content_calendar.md](docs/content_calendar.md) | 24本カレンダー・URLスラッグ・SEO・KWマッピング |
| [docs/cta_strategy.md](docs/cta_strategy.md) | CTA詳細・PDFレポート構成・ステップメール・初期参画院募集 |
| [docs/content_guidelines.md](docs/content_guidelines.md) | 記事テンプレ・投稿ルール・ネタ切れ防止4軸 |
| [docs/profiles.md](docs/profiles.md) | X・noteプロフィール文（確定版） |
| [docs/site_plan.md](docs/site_plan.md) | barbara.co.jpサイト設計・作業進捗 |
| [docs/kpi_and_todos.md](docs/kpi_and_todos.md) | KPI・残課題・次のアクション |
| [articles/](articles/) | 完成記事のMarkdown |
| [barbara-saas](https://github.com/beru3/barbara-saas) | プロダクト開発（API・分析・レポート生成） |
