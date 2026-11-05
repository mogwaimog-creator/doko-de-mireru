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
