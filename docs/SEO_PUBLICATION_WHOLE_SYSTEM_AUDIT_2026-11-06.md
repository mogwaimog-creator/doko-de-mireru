# SEO公開前・全体照合（2026-11-06）
対象: main と seo/initial-html-metadata-pilot。コードと既存設計資料の読み取り専用監査。実Redis・ブラウザ・本番動作は未検証。公開承認ではない。

## 確認した構成と重複実装
- main と作業ブランチは diverged（ahead 250 / behind 3）。単純な全ブランチマージを禁止。main 側3コミットの影響を差分確認。
- 既存: scripts/export-work-ledger-readonly.js (SCAN/GET), audit-work-ledger-export.js, select-seo-verified-works.js, build-seo-from-ledger-export.js, build-seo-static.js, prepare-seo-fixed-display.js, audit-seo-display-parity.js, stage-seo-full-preview.js, api/detail-providers-only.js, api/seo-html-pilot.js。これらを先に統合検証し、類似コードを増やさない。
- 後発の scripts/export-seo-ledger-readonly.js は公開用フィールドのみで extensions.tmdbDetail を出力せず、既存の「確認済みレコード選別→HTML生成」の完全な代替ではない。
- 後発の scripts/work-ledger-to-detail-fixed.js は既存APIと未互換。映画 director を文字列にするが既存 api/search.js は {id,name}、detail.html は director.name を参照する。映画 cast に character/profile_path を付加するが既存映画 getCast は {id,name}。movie の media_type/original_language/series/recommendations、TV の content_type/creators/number_of_seasons/number_of_episodes/status 等が不足。**この変換器を公開経路に接続しない。**
- api/_detail-metadata-cache.js の extensions.tmdbDetail は生TMDBに近いデータであり、既存 detail.html が期待する正規化済みAPI応答ではない。既存の正規化済み固定データ生成・照合経路を優先。

## 公開前ゲート（全体）
1. **ブランチ統合**: main側3コミットの差分と衝突、PR #13の大量変更、vercel.json / api/search.js を照合。必要な変更のみ採用。
2. **台帳実態**: 実Redisでレコード件数、verification.identity/metadata、extensions.tmdbDetail、欠損・重複・不一致・容量を安全な読み取り専用方法で確認。過去の movie:940139 と tv:202879 は missing と記録。実在全件の状態は不明。無断書込・全件再取得禁止。
3. **固定データ互換**: 映画・TV・アニメの既存API出力を基準に、タイトル補正、監督構造、出演者、TV区分・制作者・話数・シーズン、映画シリーズ、言語、評価、FAQ・構造化データを照合。固定と動的を分離し、実レスポンスとの一致を検証。
4. **配信と負荷**: 既存 detail-providers 24時間オンデマンドキャッシュと、シリーズ用6時/18時Cronは別。見放題/レンタル/購入/サービス別URL/失敗時の旧データ維持を検証。静的HTMLができてもブラウザの /api/search が残るなら初回Function削減なし。初回/再訪/更新境界の呼出回数を測る。
5. **静的SEO生成**: 確認済み実作品のみ生成。初期HTTPの title, description, h1, canonical, OGP, JSON-LD, ポスター、ID/type一致、HTMLエスケープ、未登録IDフォールバック、重複URL/noindexを検証。fixtureと手入力は実台帳の代用にしない。
6. **ルーティング**: 既存URL /detail.html?id=... と type=tv、person.html、/movie/:id、検索・シリーズ・特集、静的アセット/APIの維持。物理 detail.html/person.html とrewrite優先順位を確認。SEO用実体URLの重複インデックス防止。
7. **全サイト検証**: 映画・TV・アニメ・人物、検索→詳細→シリーズ、ポスター・リンク・スマホ表示、配信エラー・キャッシュ、未登録・誤ID・異常時の旧表示を確認。既知の series-streaming.html リンク欠損も公開前に判断。
8. **安全・コスト**: Vercel Previewの保護維持。CDN/Function/TMDB/Redis/Build CPUの実測比較、費用上限・レート制限・Bot対策・Cron影響を確認。追加デプロイ/従量課金/Redis書込は事前相談。
9. **公開判定**: CI全テスト合格、実作品のHTTP View Source・ブラウザ表示一致、実台帳の確認済み件数、配信と負荷の合格、main差分解決、ロールバック手順、ユーザーの明示的公開承認。
10. **公開後**: 初期HTMLとGSC/Bingのcanonical/重複状況、404/5xx、配信更新、Function/Redis/TMDB負荷と請求、未確認作品を日次監視。順位回復は保証しない。

## 現在の判定
- 完了証拠あり: fixture/手入力映画のオフラインHTML生成、限定的な隔離プレビューHTTP振分、既存の選別・監査プログラムの存在。
- 未完了: 実Redis全体の確認済み件数、実台帳からの完全表示生成、映画/TV/アニメのAPI表示一致、全サイト実HTTP・ブラウザ、負荷・費用実測、main差分解消、本番公開。
- **公開判定: 不可（未検証ゲートが残る）。** 次は新機能を足す前に、既存の実装とテストを1つの受入表に照合し、実台帳アクセス・表示互換のブロッカーを解消する。
