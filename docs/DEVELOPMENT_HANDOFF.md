# ドコデミレル？ 開発引き継ぎ書（継続更新）

更新日：2026-11-06
保存先：GitHub `mogwaimog-creator/doko-de-mireru` / `seo/initial-html-metadata-pilot`
状態：作業記録。**この文書だけでは実装完了・本番反映を意味しない。**

## 最初に読むこと
1. この文書と `docs/WORK_LEDGER_TEST_PLAN.md`、`docs/WORK_ANOMALY_REVIEW.md` を読む。
2. GitHubの**本番ブランチ**と作業ブランチの実コード、PR、デプロイ状況を確認する。
3. 「実装済み」「検証済み」「未確認」「本番反映済み」を混同しない。過去の作業を新発見として説明しない。
4. 既存方針を変える場合のみユーザーに事前相談。通常の「はい」は続行の意味。
5. Redisの破壊的操作・大量API呼び出し・追加課金・本番デプロイは勝手に行わない。

## 全体構成（概念図）
```text
TMDB（初回取得・必要時のみ）
    ↓
作品台帳：固定情報（movie/tv + TMDB ID）
    ├── 詳細ページ表示用固定情報
    ├── SEO用の初期HTML生成
    └── 見る順番・特集ページで参照
配信台帳：日本の配信情報（固定情報と分離）
    └── 朝6時・夕18時の更新運用、失敗時は最終成功データ維持
人物台帳：人物プロフィールと出演作品（配信情報は表示しない）
```
※これは目標構成を含む。全導線が本番で統合済みという意味ではない。

## 既存コードで確認した事実
- 本番ブランチ `api/_work-ledger.js`：`doko:work:v1:<type>:<id>` をRedisに保存。 `getWork` はGET、`putWork` はSET。
- 本番ブランチ `api/work-detail.js`：`WORK_LEDGER_ENABLED=1` のとき公開用固定メタデータを返す。**キャッシュがない場合TMDBを呼び、Redisに初回登録するため、検証目的で無計画に呼ばない。**
- 本番ブランチ `api/_redis.js`：Upstash REST環境変数を利用。
- Vercelプロジェクト `doko-de-mireru` に `KV_REST_API_URL`、`KV_REST_API_READ_ONLY_TOKEN`、`KV_REST_API_TOKEN` の登録を2026-11-06に確認（**値は取得・記載しない**）。
- 作品台帳の実レコードをSEO生成に利用できるかは**未検証**。

## SEO初期HTML改修（進行中）
- 作業ブランチ：`seo/initial-html-metadata-pilot`
- Draft PR #13。**本番には未マージ。**
- 静的SEO HTML生成、オフラインfixture、構造検証、プレビュー用workflowなどの試作あり。
- プレビューdeployment `dpl_GTKnvysf1aWbNZNUvuZAtsvebiWM` はREADYと確認されたが、外部HTTP検証はVercel保護による429で未完了。
- サンプルfixtureは仮データ（例：movie:50014「SEO表示検証用映画」）。**実データとして本番公開不可。**
- 実際の作品台帳レコードからSEO初期HTMLを生成し、初期HTTP応答のtitle/description/h1/canonical/OGPを検証する必要がある。
- 以前示した「約75%」は主観的な概算。実測の進捗率ではない。

## 直近の調査・詰まり
- PCには専用のGitリポジトリや `.env.local` が存在するとは限らない。ユーザーはその都度受け取ったPowerShell用ファイルを実行する運用。
- `export-seo-sample-readonly.cjs` を一時フォルダで実行すると「Missing local Upstash credentials」。PC側に環境変数がないだけで、サイトのRedis障害ではない。
- **2026-11-06再確認：作業ブランチには既に `api/seo-html-pilot.js` がある。** `kind=diagnostic&type=movie|tv&id=...` は `getWork()` のGETのみで `found` / `missing_or_invalid` を返し、TMDB呼び出し・Redis書き込みはしない。`kind=work` は既存レコードを読み、SEO初期HTMLを返す。`SEO_HTML_PILOT_ENABLED=1` が必要。**本番ブランチの公開 `api/work-detail.js` とは別物。**
- ただしプレビューのHTTP応答はVercel Security Checkpointの429で確認できず、台帳の実データ存在確認はまだできていない。保護解除はしない。
- テスト用 `movie:50014` は実在作品の確認に使わない。

## 次の作業（順番を守る）
1. **読み取り専用の既存経路 `api/seo-html-pilot.js` を再利用する。新しいAPIを作らない。** プレビュー保護を維持したまま認証済みでHTTP 200を取得する方法を確認。秘密情報はチャットやGitHubに貼らない。
2. 実在する作品を1〜3件だけ対象に、作品ID・固定表示項目・`extensions.tmdbDetail` の有無を確認する。
3. 欠けているフィールドへの対応を決め、実データでSEO生成をオフライン検証する。
4. 保護されたプレビューのHTTP検証を適切な認証経路で行う。セキュリティ保護を解除しない。
5. テスト結果とコスト影響を整理してから本番反映を相談する。


## SEO進捗フローチャート（2026-11-06時点・継続更新）

**運用ルール：作業の一区切りごとにこの図と直下の検証記録を更新する。既存成果を「新発見」として報告しない。緑相当の完了は実際の証拠がある場合のみ。**

```text
[① SEO初期HTML生成コード・オフラインテスト]  完了（CI success）
                         ↓
[② 映画/TVの固定情報変換・分離テスト] 完了（CI success）
                         ↓
[③ 実在作品の共通台帳データ接続]     作業中・未完了
     ├─ movie:940139 → missing（プレビューのRedis読み取り診断）
     └─ tv:202879    → missing（同上）
                         ↓
[④ 実作品HTMLの初回応答とURL振分検証] 未完了
                         ↓
[⑤ 費用・安全性の最終確認／本番公開]   未実施・ユーザー事前承認必須
```

### 進捗の証拠と未解決点
- 作業ブランチのコミット `c32a10f17fc4d37492b6f6950c8eb5173f907d24` に対するGitHub Actions `SEO static pilot tests`、run `42099769345` は `completed/success`。オフラインのSEOテスト・HTML生成・構造確認などのジョブステップが成功。
- 認証済みVercel CLI `vercel.cmd curl` により保護付きプレビュー `doko-de-mireru-qnjqaprl9-mogwaimog-1706.vercel.app` の診断APIからHTTP 200を確認。映画 `940139` とTV `202879` はいずれも `ledgerStatus:missing`。**Redisのこの2キーが存在しないという意味であり、全作品が未登録という意味ではない。**
- 既存の `scripts/prepare-seo-fixed-display.js` は、既存詳細API形式から固定表示データをオフラインで変換する。**共通作品台帳への書き込み機能ではない。**
- `api/work-detail.js` は未登録作品でTMDB取得・Redis初回書き込みがあり得るため、診断目的で呼び出さない。
- `scripts/audit-seo-publish-readiness.js` は本番URL振分を `routingVerified:false` と扱う。**実作品SEO HTMLの生成と公開URLへの配信はまだ未検証。**
- 次の実装目標：既存の固定メタデータの安全な入力経路を特定し、実在映画1件の初期HTMLをプレビューで検証する。その後TV・ルーティングを検証。再取得・書き込み・本番反映は事前承認なしに実施しない。
- **本番は未変更。SEO検索順位や表示回数の回復は未保証。**

## 運用・コストの確定方針
- 作品名、年、ポスター、監督、キャスト、概要などは固定情報として使い回す。
- 日本の配信情報のみ別管理・更新。通常は朝6時・夕18時（日本時間）。
- Redis容量・Vercelリクエスト・TMDB APIの負荷削減を優先。追加課金を発生させない。
- 変更はまとめてテスト・デプロイ。現行サイトの表示とシリーズページを壊さない。

## 更新ルール（毎回）
作業終了時にこの文書の「更新日」「確認した事実」「実装済み／未検証／本番反映済み」「次の作業」「ブロッカー」を更新する。GitHubへの書き込みができない場合は更新できなかったことを明示し、会話内に差分を残す。新しい会話ではまずこの文書を読んでから作業する。

## 2026-11-06 追加検証
- Vercel deployment `dpl_GTKnvysf1aWbNZNUvuZAtsvebiWM` は `READY`、`target:null`、CLI由来、production aliasなしと再確認。
- Vercel deployment file treeを直接確認し、`src/api/seo-html-pilot.js`、`src/api/_work-ledger.js`、`src/api/_seo-initial-html.js` が配置されていることを確認。**GitHubにあるだけでなくプレビュー成果物にも存在する。**
- ただしプレビューURLへのHTTP GETはVercel Security Checkpointの429で遮断される。**HTTPで動作したとは未確認。**
- PR #13はopen/draft/unmerged、変更ファイル62、コミット169。過去の試作が大量にあり、再実装より既存実装の検証が先。
- 次はプレビュー保護を解除・共有リンクを公開せずに、既存の認証済み検証手段を探す。これができない場合はオフライン検証を先に進める。

## 2026-11-06 CI証拠の追加
- GitHub `fetch_commit_workflow_runs` でコミット `bfe7e6b0e13c03d7222d807dc6f783e1452c04fb` のPRトリガー `SEO static pilot tests` が `completed / success` と確認できた。**このコミットに対するオフラインCI成功の証拠。**
- workflow定義 `.github/workflows/seo-static-pilot.yml` にはNodeテスト、サンプルHTML生成、ルートmanifest、プレビュー構成・依存関係検査が含まれる。これはライブHTTP、実Redisレコード、後続コミットのテスト成功を保証しない。
- `.github/workflows/seo-preview-http-check.yml` も既存。専用プレビューURLに対する読み取り専用HTTP検証だが、現状は429保護がブロッカー。**既存の検証コードを再利用し、新設しない。**

## 2026-11-06 CIジョブ詳細確認
- GitHub Actions run `42096326759` の `node-tests` は success。各ステップを確認し、**Nodeオフラインテスト、サンプルHTML生成、ルートmanifest確認、隔離プレビュー組み立て、フルサイトプレビュー構造検証、既存ページ依存関係調査、ブラウザAPI fetch箇所監査** がすべて success。
- これらはfixtureを使うオフライン検証であり、実作品のRedisデータ・プレビューHTTP・本番は未確認。成功済みのオフライン工程を繰り返して実装しない。
- 次の実務的ブロッカーは実データへの安全なアクセスと保護付きHTTP検証。Vercelの共有リンク生成はアクセス権を拡大するため、無断では行わない。

## 2026-11-06 一時共有リンクによるHTTP検証
- ユーザーの明示許可を得て、既存のVercel共有リンクを再利用（新規生成ではなく `shareLinkAction: reused`）。リンク自体・トークンは文書に保存しない。
- Vercelの認証対応fetchを使い、プレビューの `/detail.html?id=50014` と `/api/seo-html-pilot?kind=fixture&type=movie` をGET。**どちらもHTTP 429、title `Vercel Security Checkpoint`**。SEO HTMLの内容は確認できていない。
- したがって共有リンクだけでは今回のSecurity Checkpointを通過できない。保護解除・Firewall変更・本番変更は未実施。次はプレビューの保護設定と既存のオフライン成果物の検証を分けて対応する。

## 2026-11-06 429の安全な解決経路（公式資料確認）
- Vercel公式ガイド `https://vercel.com/docs/cli/curl` および保護プレビュー用Vercel skillにより、**HTTP確認は認証済みの `vercel curl <preview-url>` が第一候補**と確認。必要なら同一プロジェクトの短命OIDC tokenによるTrusted Sources経路を利用する。保護を解除しない。
- Shareable Linkは閲覧共有向けであり、今回のVercel Security Checkpoint 429は解消しなかった。繰り返し同じ匿名GETを実施しない。
- この実行環境では `vercel` / `vc` CLIが見つからず、認証済みCLIリクエストはまだ実行できていない。ユーザーのWindows PCで実行を依頼する場合は、**既存のVercel CLI認証の有無を先に確認**し、秘密情報の表示・貼付は求めない。
- VercelのAutomation Bypass secretの新規生成、Firewall設定変更、Deployment Protection Exceptionsはアクセス制御を変えるため実施しない。

### 2026-11-06 手動入力1作品のオフライン試験準備
- `data/seo-manual-pilot-one-work.json` を作業ブランチに追加（commit `e5e6b29ca345083c2b84f4a253f1e2bcde4307d8`）。映画 `movie:157336`『インターステラー』のID・タイトル・短い紹介文を手入力した**SEO生成検証用**の1件。実在作品だが正式な作品台帳レコードではなく、ポスター・監督・出演・配信などは未登録。
- このJSONは `scripts/build-seo-static.js` のオフライン入力形式に対応。**生成・HTTP表示・本番ルーティングの成功はまだ未確認。** RedisやTMDBへの書き込み・アクセスは行っていない。
- 次はこの入力を用いたCI生成・SEO初期HTMLの検証を行い、合格してから共通台帳との接続を検討する。手入力を本番台帳への登録済みと誤認しない。

### 2026-11-06 手動入力1作品のSEO生成テスト成功
- `data/seo-manual-pilot-one-work.json` に実在映画 `movie:157336`『インターステラー』の最小限の手入力SEOデータを追加。
- `.github/workflows/seo-static-pilot.yml` に、当該JSONからHTML生成後、title・h1・description・OGP・canonical・URL対応表を検証するオフラインステップを追加（commit `f66d8bf38b44c4adcdeaf46a3459fda9d8c996b5`）。
- GitHub Actions run `42104034385` は `completed/success`。`node-tests` ジョブの **Generate and verify manually entered real-film SEO HTML (offline only)** ステップも `completed/success` と確認。**手動入力→静的SEO HTML生成は実証済み。**
- 進捗フローチャート③の内訳：**手入力の実在映画→SEO HTML生成は完了**。一方、Redis共通作品台帳への登録・連携は未完了。④の公開URLへの配信検証も未完了。これは本番サイトに反映されていない。

### 2026-11-06 手動映画1件のURL振分テスト
- コミット `a8fcb8dc838a1b3ecbb9e366d4d80e05abc436dd` に対する GitHub Actions run `42104555601` は success。手動入力した『インターステラー』の生成HTMLについて、隔離プレビューの映画ID・type条件付きURL振分と従来ページへのフォールバックをオフラインで検証し、該当ステップも success。
- さらにコミット `93e31b35698a95c57f2cf5d3c8b32d92a64b4e47` で、**サイト全体を含む隔離プレビュー**のオフライン検証ステップを追加。従来詳細ページ、検索API、既存の `/movie/:id` 経路、未該当作品のフォールバック維持を確認する。run `42104785286` は確認時 `in_progress` で、成功は未確定。
- **公開URLの実HTTP検証と本番反映は未実施。** フローチャート④は「隔離プレビューのURL振分テスト成功／全サイト構造テスト実行中／実HTTP未検証」に更新して扱う。
