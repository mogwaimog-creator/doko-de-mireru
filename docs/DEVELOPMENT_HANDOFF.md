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
[① SEO初期HTML生成・オフラインテスト] 完了
                 ↓
[② 固定情報変換・分離テスト] 完了
                 ↓
[③ 実作品の共通台帳接続] 未完了
                 ↓
[④ 実HTTP・URL振分] 隔離プレビュー成功／全サイト動作未検証
                 ↓
[⑤ 全作品の照合と「確認済み」チェック] 未完了
  ├─ type＋TMDB ID、作品名、年、ポスター、監督、出演者を照合
  ├─ verification.identity／metadata／items／notes に記録
  ├─ 「確認済み」と「エラーなし」は別管理
  ├─ 不一致・欠落・取得失敗はエラー一覧へ、正常作品は続行
  └─ 確認済みの固定情報は自動上書きしない
                 ↓
[⑥ 最終確認・本番公開] 未実施／事前承認必須
                 ↓
[⑦ 公開後の毎日点検] 未開始／新規・未確認・異常を優先
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

- **後続確認：** run `42104785286` は `completed/success`。`Generate and verify manually entered real-film SEO HTML`、`Verify real-film URL routing in isolated preview`、`Verify real-film routing in full-site preview` の3ステップとも success。したがって手動映画1件のHTML生成・隔離ルーティング・全サイト構成の**オフライン検証は完了**。実HTTP検証・本番公開は未完了。

### 2026-11-06 隔離静的プレビューを実際にデプロイ
- ユーザーの許可後、Vercelの同一プロジェクトに**非本番・静的3ファイルだけ**の隔離プレビュー `dpl_C9Fm6HY79G5NcxAxVoP1uRRvCRxW` を作成。URL `https://doko-de-mireru-lnepaulan-mogwaimog-1706.vercel.app/`。状態 `READY`、`target:null`、production aliasなし。
- デプロイファイル一覧で `seo-pages/movie-157336.html`、`detail-fallback.html`、`vercel.json` の配置を確認。これは**全サイトプレビューではなく、SEO URL振分専用の隔離試験**。JSが参照する通常のAPI等は含まないため、サイト全機能の表示テストとは区別する。
- 匿名の外部HTTP検証はアクセス不可。**認証済みの実HTTPレスポンス検証は未完了**。共有リンク作成などアクセス権変更は行わない。次は既存の認証済みCLI `vercel.cmd curl` などで `detail.html?id=157336` の初期HTMLと、未登録IDのフォールバックを検証。
- 本番設定・Redis・TMDB・本番URLの書き換えはしていない。進捗図④：隔離プレビュー配置済み／実HTTP未検証。

- **実HTTP確認結果（2026-11-06）：** Vercel認証付きURL取得を使い `detail.html?id=157336` と `detail.html?id=999999` を確認したが、どちらも **HTTP 429 / Vercel Security Checkpoint**。そのためSEO HTMLの実配信・fallbackは**未検証**であり、成功とは扱わない。Vercelデプロイソースの `vercel.json` 取得は成功し、アップロードしたURL振分ルールが配置されていることは確認。保護設定は変更していない。次の候補はユーザーの既存の認証済み `vercel.cmd curl --%` による2URL確認（追加のデプロイ不要）。

### 2026-11-06 隔離プレビュー実HTTPのユーザー確認
- 認証済み `vercel.cmd curl` でユーザーが2つのURLを実行。`detail.html?id=157336` は作品固有のSEO初期HTML（タイトル・説明・canonical・OGP・H1）を確認したと前回報告済み。`detail.html?id=999999` は共通テンプレートを返すことを今回の貼付結果で確認（OGP `作品情報 | ドコデミレル？`、空H1）。
- したがって隔離プレビューの**対象作品と未登録IDの振分を実HTTPで確認済み**。ただし全サイト/APIを含まない3ファイル構成のため、ブラウザ機能、配信、画像、JSの完全動作は未検証。これを本番公開可能の根拠にしない。
- 次の作業は、既存のCIで生成・オフラインテスト済みの**全サイトプレビュー**にて既存APIやブラウザ表示を確認する段階。追加デプロイは別途費用・公開範囲を確認してから実施。本番未変更。

### 2026-11-06 全サイトプレビューの費用確認と判断
- Vercel請求データを読み取り専用確認（2026-11-01〜11-06取得範囲）：`totalBilledCost` 約 USD 3.0944、うち Build CPU Minutes `billedCost` 約 USD 2.954。`effectiveCost` は割引・クレジット前等の別指標であり、請求額と混同しない。
- **追加ビルド／全サイトプレビューのデプロイは実行しない**。追加課金を避けるユーザー方針を優先。既存の全サイトオフライン候補はCIで構造テスト成功、ただし実HTTPとブラウザ動作は未検証。
- `scripts/stage-seo-full-preview.js` を再点検：Git追跡ファイルのみを隔離出力へコピー、既存の `detail.html`/`person.html` は fallback に退避、既存rewrite保持、cron無効化、function includeFiles書換。`deployable:false` のまま。本番は未変更。
- 次の段階は予算面の明示的な再承認を得るまで、既存CI成果物のオフライン監査と既存本番の読み取り専用点検に限定する。

### 2026-11-06 再確認：作品ごとの確認済みチェックは以前からの必須合意
- 全作品を対象に、type＋TMDB ID、作品名、公開年、ポスター、監督、出演者等を照合。内容が正しいと確認できたものだけ「確認済み」にして確認日を保存する。単なる「エラーなし」は「確認済み」ではない。
- 現行作品台帳コードには verification.identity／verification.metadata／verification.items／verification.notes がある。ただし確認日フィールド・全件照合と確認済み更新処理の完成は未検証。完成済みと報告しない。
- ID不一致・別作品混入疑い・情報欠落・取得失敗は管理用エラー一覧へ。正常作品は先に処理し、問題作品は従来表示を維持しSEO生成を保留して後日修正する。
- 既存の確認済み固定情報は通常の自動処理で上書きしない方針。putWorkIfAbsent のほか putWork もあるため全書込経路の確認が必要。配信情報は別管理で従来の6時・18時更新を維持。
- 公開後しばらく毎日1回、全作品の確認状態・エラー一覧を点検し、新規・未確認・異常を優先して台帳整備。既存の毎朝点検への組み込みは未実装。
- この合意を今後のフローチャートから省略しない。今回の変更は引継ぎ文書のみ。本番変更なし。


### 2026-11-06 SEO実台帳エクスポート連携のオフラインCI
- Redis読み取り専用 `scripts/export-work-ledger-readonly.js`（SCAN/GETのみ、実Redis未実行）の出力 `{records,problems,...}` を `scripts/audit-work-ledger-export.js` が受け取れるよう修正。読み取り異常を監査報告へ引き継ぐ。
- `scripts/select-seo-verified-works.js` は `verification.identity === 'verified'` と `verification.metadata === 'verified'`、必要固定項目、埋め込み詳細ID一致、エラーなしを満たすレコードだけ選択。重複IDは両方除外。エクスポート異常時は全件生成を止める。確認済み状態は自動で付与しない。
- `scripts/build-seo-from-ledger-export.js` は監査→選別→既存の静的SEO生成を接続。サンプルのインターステラー1件と未確認レコード除外のテストを追加。
- GitHub Actions `42176368757` の `node-tests` ジョブが success。**テスト用データでのオフライン成功であり、実Redisからの読み取り・実台帳の確認済み件数・実サイトでのHTTP・全サイトブラウザ動作は未検証。**
- **次のブロッカー：** 実Redisの確認済み作品が何件あるか不明。従来の初期値 `not_recorded/not_checked` のままならSEO候補は0件になる。確認済みフラグを無条件に書き換えて解消してはいけない。
- 実データ検証は秘密情報をGitHub/チャットに貼らず、認証済みの読み取り専用経路から既存作品1〜3件を確認する。ユーザーの追加課金禁止方針により、新規全サイトデプロイは引き続き保留。本番は未変更。
