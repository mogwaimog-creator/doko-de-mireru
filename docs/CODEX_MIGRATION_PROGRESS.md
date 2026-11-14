# Codex作業進捗ログ（Redis移管・緊急表示復旧）

このファイルは**実際のCodex作業が行われるたびに更新**する。引き継ぎの合意事項は [REDIS_MIGRATION_HANDOFF_20261114.md](./REDIS_MIGRATION_HANDOFF_20261114.md) を参照。

## 2026-11-14 初期状態（ChatGPT記録）
- 作業ブランチ: `test/temporary-redis-migration-20261114`
- 第一優先: 旧Upstashへの新規保存を行わず、未登録作品をTMDBから直接表示できるようにする暫定修正。
- 第二段階: Aiven for Valkeyを第一候補としてRedisを移管し、未登録作品の新規取得と新台帳への保存を再開。
- GitHubに移管合意書を作成・更新済み。
- **Codexが実際に修正・テストしたかは未確認。** 完了とみなさない。
- **本番変更・デプロイ・Redisデータ移行は未実施。**

## Codexが各作業の節目で更新する項目
以下のテンプレートを追記し、古い記録を消さない。

### YYYY-MM-DD HH:MM JST / 作業名
- 現在のブランチとHEADコミット:
- 状態: 完了 / 進行中 / 保留
- 目的・対象範囲:
- 実施した作業（事実のみ）:
- 変更ファイル・コミットSHA:
- 実行したテストと結果（PASS/FAIL/未実施）:
- 旧Upstash・新Redis・Vercelへの実アクセスの有無:
- 未完了の作業・障害・リスク:
- **次に行う具体的な一手**:
- **本番反映状況**: 未反映 / 反映済み（デプロイIDと日時）

## 継続時の手順
1. `git status`, `git branch --show-current`, `git log -1 --oneline` とこのファイル、移管合意書を読む。
2. 前回ログにある「次に行う具体的な一手」から再開する。
3. 重要な節目ごとに本ファイルを更新し、必要なら作業ブランチにコミット・pushする。コミットできない場合は、未保存であることと現在の差分を明示する。
4. 上限・時間切れ・中断が予想される場合は、**終了前に**最新の作業状態を本ファイルへ記録し、作業ブランチへ保存する。突然の終了時には最後の保存時点から再確認する。
5. 旧Upstashの削除/初期化、大量コマンド、mainへの統合、本番デプロイ、本番環境変数変更は承認なしに行わない。


### 2026-11-14 08:14 JST / 実装・ローカル検証の確定とGitHub保存準備
- 現在のブランチ: `test/temporary-redis-migration-20261114`。実装コミット: `93c2b04`。この追記のコミットSHAはGit履歴を参照（自己SHAを本文に埋め込まない）。
- 状態: 実装・ローカル検証完了 / 本番反映・実データ移管は未完了。
- 対象範囲: 緊急修正を取り込んだ移管準備。実移管は未実施。
- ユーザー指示: 両テストブランチへのpushだけを実施。main統合・本番デプロイ・環境変数変更・実Redisへのデータ操作は禁止。
- 既存記録の保全: 保存直前にリモート移管ブランチ `a03bb014149041de25df337435e4289df82ff13a` の両引継ぎ文書を確認。既存リモート履歴をmergeで取り込み、初期記録・テンプレート・合意文を残して本項を追記。force pushしない。
- 緊急修正: `c852599`（緊急ブランチ）、`11a1fec`（移管ブランチへ同じ修正を取り込み）。保存済み作品を優先し、取得停止中の未登録作品はTMDBから詳細・配信情報を要求内だけで表示。作品/SEO/シーズン/人物/検索index/配信情報をUpstashへ新規保存しない。
- 緊急修正の主な変更: `api/_release-application.js`, `api/_release-source.js`, `tests/emergency-work-detail.test.js`, `tests/paused-ledger-reads.test.js`, `docs/EMERGENCY_WORK_DETAIL_20261114.md`。
- 移管準備: 移管ブランチの `93c2b04` に遅延接続のTLS/RESP Valkeyアダプター、既存release監査を保った接続切替、固定依存、隔離Redis用CI・テスト、移行/復元/切り戻し手順を記録。
- 移管準備の主な変更: `api/_valkey.js`, `api/_redis.js`, `api/_release-connection.js`, `tests/helpers/local-redis.js`, `tests/valkey-transport.test.js`, `package.json`, `package-lock.json`, `.gitignore`, `.github/workflows/temporary-redis-migration.yml`, `docs/TEMPORARY_REDIS_MIGRATION_20261114.md`（移管ブランチのみ）。
- 実施済みテスト: 緊急修正は12ファイル51件PASS。移管側の最終 `npm run test:migration` は20ファイル87件PASS（いずれもFAIL 0・skip 0）。Redis 7.2.7 / 127.0.0.1:16379、合成データ・モックTMDB。作品詳細JSON/HTML、検索/SEO、24時間境界、13シリーズ266作品の朝6時更新、人物/シーズン、Lua所有権/CAS、TLS設定/並列初回接続、バックアップ/復元を検証。
- テストの時点: 上記は前回実装時の結果。今回はリモート引継ぎdocsの取り込みと追記だけで、アプリ/テストコードは変更していないため再実行しない。GitHub CIは今回確認前のため成功とは記録しない。
- Upstash負荷: 未登録の検索詳細APIは映画3/TV4送信、詳細HTMLは映画4/TV5送信、Redis書込0、各経路TMDB HTTP1回。ローカル観測であり課金実測ではない。HTML+JSON二重取得最適化は対象外。
- 実アクセス: 本番Upstash・新Redis・実TMDB・Vercel本番APIへのアクセスなし。今回はGitHubの読取・ブランチpushだけを実施対象とする。ローカルRedis以外のデータ操作なし。
- 維持事項: `vercel.json` の `git.deploymentEnabled=false`、Cron、routes/functionsを維持。mainへのmerge/push、本番deploy、環境変数変更、停止解除、実Cron実行なし。
- 未完了・リスク: 公開サイトはまだ修正前。実Aivenの無料条件/接続/TLS/ACL/Lua互換性、整合した最新バックアップ・完全キーmanifest・コマンド予算、実復元・切替・通常運行復旧・本番負荷観測は未完了。Upstash読取自体がquotaで失敗すると暫定詳細も503となり得る。直接取得はRedis共有quotaを書かないため全worker合計のTMDB取得上限は保証しない。
- 次の具体的な一手: 両ブランチを通常pushし、リモート先端SHAとの一致を確認してURLを報告。その後は緊急修正のレビュー。main統合・公開は別途承認後。移管はAiven無料条件・安全な接続情報・最新バックアップ方法と予算を確定してから進める。
- **本番反映状況: 未反映。実データ移管: 未実施。**


### 2026-11-14 08:32 JST / Aiven移管調査の再開・main照合
- ブランチ: test/temporary-redis-migration-20261114、開始HEAD 2095110e7e8b48f3ca52e468ea7e590db9f249c9。指定3文書を読了。
- GitHub mainは a05897e6cba18d271ec5fec6ce4dffbf37080303（PR #50）。緊急修正のapplication/source/testは本ブランチと差分なし。二重適用・作り直しなし。
- ユーザーから緊急修正の本番昇格済み（dpl_5G4PAYgd2ojFt4EmpyAFEWf6Yu7S）と報告を受領。本番APIによる再検証はしていない。過去の「緊急修正未反映」は当時の記録であり、現状はこの追記を参照。
- 既存Valkeyアダプター・バックアップ復元処理・87件のテストを引継ぐ。今回の調査は公式公開文書とローカルコードだけ。旧Upstash/新Redis/本番Vercelにアクセスなし。
- 公式文書でAiven無料1GB RAM・maxmemory50%、Lua既定有効、MIGRATE等の制限を確認し、詳細調査中。契約・実先の確認は未完了。
- 変更ファイル: 本進捗ログのみ。テスト: この節目は記録のみ、再実行未実施。
- 次の一手: 最新無料条件/TLS/移行方法を資料化し、全キー型・期限・更新履歴を保持する計画とローカル検証を進める。実サービス作成・実移管・本番変更は承認前に行わない。


### 2026-11-14T08:41:44+09:00 / Aiven公式条件・欠落防止計画・ローカル検証完了
- ブランチ: test/temporary-redis-migration-20261114。開始main a05897e / 開始実装93c2b04。緊急修正はmainと同一のまま。
- 完了: 公式無料条件、TLS、Lua、制限command、eviction、料金の確認範囲を AIVEN_MIGRATION_PLAN_20261114.md に出典URLつきで記録。Aiven標準migrationのSCAN fallbackを理由に旧source直結経路を不採用とした。
- 計画: provider RDB exportを第一候補。全DB・全物理キー/型/絶対TTL、作品/配信/人物/シーズン、metadata、ロック/手動項目/index/履歴を保持。不明キーも捨てない。無料Exportの利用可否/料金/command計上は未確認なのでまだ実行しない。
- 実装: 既存Valkeyアダプターにvalkeys://→rediss://のTLS URI互換を追加。既存snapshotに完全manifest証拠・キーchecksumを必須とするno-SCAN経路を追加（3K+1読取/DB、書込0）。完成済みの復元処理は再利用し、隔離prefix制限を維持。
- 追加: migration-inventoryのoffline棚卸し/CLI（private0600・上書き拒否・外部接続なし）、ローカルUnix socket対応、RDB全6型/DB0とDB2のreload検証、信頼CA成功/未信頼CA拒否の実TLSテスト。
- 変更: api/_valkey.js、scripts/lib/local-binary-redis.js、scripts/lib/redis-low-command-backup.js、scripts/lib/migration-inventory.js、scripts/migration-inventory.js、tests/valkey-transport.test.js、tests/migration-inventory.test.js、tests/migration-rdb-rehearsal.test.js、package.json、.github/workflows/temporary-redis-migration.yml、公式確認計画/検証JSON/進捗文書。
- テスト: 既存87件+追加6件、22ファイル93 PASS / 0 FAIL / 0 skip。Redis7.2.7、native RESP、合成TMDB/合成RDBのみ。最終コマンドと対象ファイルhashを AIVEN_LOCAL_VALIDATION_20261114.json に保存。git diff --check成功。GitHub CI実績は未確認。
- 本番/実データ: 旧Upstash、新Aiven、実TMDB、本番Vercelへの接続・データ操作なし。実Cron/移管/停止解除/環境変数変更/main統合/デプロイなし。Git自動デプロイfalse維持。
- 未完了: 実Aiven Freeサービス作成・安全なsecret提供、実先のversion/容量/RTT/接続数/ACL/Lua/restore互換、Upstash Exportの無料可否・command計上、全writer停止の承認と最新backup、原キーでの実target書込runnerの有効化/実移管/通常運行復旧。RDB版差でhashが異なれば検証を緩めず停止する。
- 次の一手: ユーザーにFree $0サービス作成（wizard/importなし）と作業環境secret設定、本番変更なしの手順を案内。Upstash ConsoleでExport利用可否/料金/残量/既存backupを閲覧確認。情報が揃ったら限定接続テストとbackup方式/予算を具体化して承認を得る。
- 本番反映: 緊急修正のみユーザー報告で昇格済み。今回の移管変更は未反映。実移管未実施。


### 2026-11-14 08:42 JST / GitHub保存・継続地点の確定
- 作業ブランチへ調査再開ログ5fef9bd、実装/公式計画/検証結果9160d30をpush済み。今回の追記で既存handoff/temporary手順にも最新の継続地点を記録。
- 変更ファイル: 本ログ、REDIS_MIGRATION_HANDOFF_20261114.md、TEMPORARY_REDIS_MIGRATION_20261114.md（履歴を削除しない追記だけ）。テストは9160d30対象の93 PASS/0 FAIL/0 skipを引継ぎ、docsのみのため再実行なし。
- 本番緊急修正の昇格はユーザー報告。今回の移管準備は未反映。実Redisデータ操作/環境変数変更/main統合/デプロイ/Cron実行なし。
- 次の一手: AIVEN_MIGRATION_PLAN_20261114.md末尾のFreeサービスと安全なsecret提供、旧Upstash Export利用可否/料金・command計上・残量の閲覧確認。実先接続/backup/移管はその情報に基づく別承認前に実行しない。


### 2026-11-14T09:48:13+09:00 / Redis Search影響確認・Aiven Secret手順
- ブランチ: test/temporary-redis-migration-20261114。再開HEAD/リモート先端0d79393fe437db58d54eae276bbbc5475f84cdf6の一致を確認。mainはa05897e、既存の緊急修正は再適用しない。
- ユーザー報告: Aiven Free doko-de-mireru-valkey、Valkey9.1.3、Running。サービス作成は完了報告を受領。実先への照合は未実施。Upstash RDB Export料金/command計上は問い合わせ回答待ち。
- コード調査完了: 現行検索はSEARCH.*/FT.*/VECTOR.*や@upstash/search/RediSearchを使わない。停止中の検索は_search-index-v2/_indexed-search/_paused-ledger-searchの通常zset/stringとwork/person JSON。通常検索は_recovery-search等のTMDB+cache。Redis Search固有indexのRDB除外による直接依存はない。実DBの別用途index有無は未確認。
- 欠落条件: search:v2:doc/ids/gramsの全string/zset、canonical work/person、meta/配信等を同時点で移す必要あり。固有Search moduleと独自の通常キーを混同しない。index再生成で欠落を隠さない。
- 追加検証: 既存COMMITで合成作品/人物と独自indexを作成し、日本語作品検索・人物検索・ジャンルbrowseをRDB保存→別ローカルserverへreload後に完全一致確認。再構築なし、work JSONバイト維持、検索中は読み取りだけ。
- 結果: 22ファイル94 PASS / 0 FAIL / 0 skip（既存93件+今回1件）。Redis7.2.7/モックTMDB/合成RDBのみ。証拠はSEARCH_RDB_VALIDATION_20261114.json。実Aiven9.1.3/実Upstash exportの互換証明ではない。git diff --check成功。
- Secret手順: このCloud実行環境のSecretsにREDIS_URL（完全TLS URI）、必要時だけREDIS_CA_CERT（PEM）。実host/portに限定した接続許可。既存Secret維持、Vercel/GitHub secrets/本番切替フラグは変更しない。現在のenvironment_statusにはAiven Secret/許可がない。HTTP proxy用placeholderとnative TCPで利用可能なSecretを区別し、安全な受渡し方式を確認する。
- 確認待ちの実接続範囲: 1TLS接続、PING/TIME/INFO server/memory/clients各1回（アプリ5commands、認証/SDK handshake別）、timeout/再送なし。SET/EVAL/RESTORE/SCAN/KEYS/既存データGETなし。Secret準備だけで実行承認と解釈しない。
- 変更ファイル: tests/migration-rdb-rehearsal.test.js、docs/SEARCH_RDB_AND_AIVEN_TEST_20261114.md、docs/SEARCH_RDB_VALIDATION_20261114.json、本ログ。アプリ実装変更なし。
- 旧Upstash/実Aiven/実TMDB/本番Vercelへのアクセスなし。実移管、本番環境変数変更、main統合、deploy、Cron実行なし。Git自動デプロイfalse維持。GitHub読取/pushとローカルテストのみ。
- 未完了: Secret準備/安全なTCP Secret受渡しと許可/範囲確認、実Aiven接続・Lua/restore版差検証、Upstash回答、実backup/移管/切替/通常運行。既存記録は削除せず保存。
- 次の一手: ユーザーがCloud環境Secretと実host/port許可を準備し、読取5commandsの範囲を確認。準備後の設定適用状況をチェックしてから実Aivenテスト。Upstashは回答待ちでExport/旧データ読取を行わない。

### 2026-11-14 10:06 JST / HTTPシークレットとAiven TCP/TLSの適合性調査
- ブランチ: `test/temporary-redis-migration-20261114`。開始HEADは `6820232ea911d83b11b6b544c9fdb0e7a600c2fb`。状態: 調査完了 / 実接続は未実施。今回のコミットSHAはGit履歴を参照。
- ユーザー指示: 実Aiven接続、旧Upstashアクセス、本番変更を行わない。調査結果と次手を追記してテストブランチだけへ通常pushする。
- 結論: 現在のCloud HTTPシークレットは、node-redisのnative TCP/TLS認証へ直接利用できない。HTTPシークレットは許可されたHTTPS要求のproxy経路でplaceholderを置換する仕組みであり、汎用の生パスワードをローカルプロセスへ渡す仕組みではない。node-redisはRedis socketのAUTH（RESP設定によってHELLOの認証）に資格情報を載せる。HTTPSヘッダー/本文ではなくTLS内のRESPなので、許可ドメイン登録やHTTPS CONNECTトンネルだけでは認証値の置換は成立しない。プレースホルダーをREDIS_URLへ入れる方法、TLS検証無効化、HTTP secretの抽出・通常環境変数への転記は採用しない。
- 根拠: このタスクで提供されたCloud onboarding仕様 `references/onboarding.md` の「Existing credentials and environment variables」「Draft tool contract」、runtime仕様 `references/networking.md` の「Use a configured identity」。HTTPS宛先限定の置換とTCP資格情報の非提供を確認。node-redis固定版の公式ソース https://github.com/redis/node-redis/blob/redis%405.11.0/packages/client/lib/client/index.ts のparseURL/認証ハンドシェイク、および本ブランチ `api/_valkey.js` のcreateClient/socket.tls設定を照合した。HTTP secretによる実接続試行はしていない。
- 現在の設定確認: environment_statusはobservations_current=true、network policy enforced、secrets/runtime_variables/outbound_identitiesはいずれも空。Aiven用のraw TCP Secret提供機能が使える根拠はない。これはHTTPシークレット方式についての判断であり、将来の別のSecretファイル/credential provider機能まで利用不可と断定するものではない。
- 以前の案内の訂正: 09:48の「Cloud環境Secretに完全REDIS_URLを設定して実接続へ進む」と、AIVEN_MIGRATION_PLAN_20261114.mdの安全なsecret提供待ちという案内は、このHTTPシークレットUIでは実現できない。通常環境変数の共有範囲「環境/個人」は秘密値の保護方式を意味しない。HTTPシークレットへのAivenパスワード登録も今回は不要。過去記録は履歴として残し、次手は本項を優先する。
- 推奨する別経路（提案のみ、まだ実行しない）: ユーザー所有のローカルPCで、レビュー済みの小さなNode検証runnerを実行する。パスワードは端末の非表示対話入力、またはOSキーチェーンのAPIからプロセス内メモリだけへ渡し、node-redisのpasswordオプションで使う。通常環境変数、argv、接続URIを含むコマンド、シェル履歴、.env、平文ファイル、チャット、Git、CIログへ保存しない。秘密値を入力するのはユーザー自身のローカル端末で、Cloudの共有ターミナル/エージェント入力欄ではない。端末録画やdebug出力を無効にし、ログは成功可否と許可された非秘密メトリクスだけ、例外もURI/passwordを出さず固定メッセージへ整形する。メモリ上の秘密値の完全消去をJavaScriptで保証するものではない。
- runnerの設計範囲: host/port/username/CAは秘密値と分離、TLSのCA/ホスト名検証を有効、再接続/再送なし、短い期限とfinallyでclose。既存createValkeyはenv引数を受け取れるが、秘密をprocess.envへ入れる必要はなく、runner内で構成を渡せる。node-redis自体を直接使う場合はpasswordオプションで渡し、パスワード入りURI生成も避ける。実先へのアプリ全体起動やtest:migration実行はせず、旧Upstashへfallbackする経路も読み込まない。
- 接続確認の次段階（別途実行指示後のみ）: レビュー済みrunnerで新Aivenだけへ1接続、PING/TIME/INFO server/memory/clients各1回の計5commands。AUTH/SDK handshakeは別途発生するため総送信数5とは呼ばない。既存データGET、SCAN/KEYS、SET/EVAL/RESTORE、Cron、移管を含めない。共有結果はPASS/FAIL、TLS検証成否、必要なversion/容量/接続数の数値のみ。INFOの全文、endpoint、認証情報は共有しない。これは疎通確認でありLua/復元/データ移行の互換性証明ではない。
- Cloud側で今できる代替: 合成パスワードとローカルCAのTLS Redisを用いた既存テストを継続できる。実Aivenへの到達性/ACL/9.1.3互換性を証明したとは扱わない。Cloudで実接続が必要なら、プラットフォーム提供のTCP対応Secretファイル/credential providerの有無を別途確認し、提供とアクセス保護が確認できるまで接続を保留する。HTTPゲートウェイ新設やSecret抽出による回避は行わない。
- 今回の検証: 公式ソース/Cloud仕様/既存adapterの読取、文書差分検査。コード/テスト変更なしのためアプリテストは再実行せず、前回94 PASSを今回の実績と読み替えない。ローカル検証runnerも今回は未作成・未実行。
- 次に行う具体的な一手: ローカルPCで非表示入力するrunnerを別作業として準備・レビューし、合成資格情報でログ秘匿/TLS拒否/timeout/closeを検証する。その後、ユーザーが明示した接続範囲でだけ実Aiven疎通を行う。旧Upstash Export回答待ちは独立して維持し、回答確認のためのUpstashアクセスも今回は行わない。
- 変更ファイル: 本進捗ログのみ。Git自動デプロイ `false`、Cron、アプリ、依存/lockfileは変更なし。実Aiven/旧Upstash/実TMDB/本番Vercelへのアクセス、本番環境変数変更、main統合、deploy、実backup/移管/停止解除は全て未実施。

### 2026-11-14 10:10 JST / ローカルPC用Aiven接続診断ツール作成・ローカル検証
- ブランチ: `test/temporary-redis-migration-20261114`。開始HEAD `7796f73bb482d37352648cbe39aba5e5306da28f` とリモートの一致、開始時の変更なしを確認。状態: ツール作成/ローカル検証完了。実Aiven接続は保留。
- 追加: `scripts/aiven-connection-check.js`。アプリ/接続アダプターを読み込まない単独Node.js CLI。環境変数やURIで資格情報を取得せず、host/port/username/公開CAファイルパスと、非表示パスワードをTTYで対話入力する。パスワードを通常環境変数、argv、ファイル、ログへ保存しない。非TTY/コマンド引数は拒否し、debug/TLS検証無効化設定も拒否。Ctrl+C/入力エラー時にraw modeを復旧しlistenerを除去する。秘密値はプロセスメモリには存在し、JavaScriptの完全消去は保証しない。
- TLS/通信: node-redis固定依存5.11.0を再利用。CAチェーンと入力hostの証明書照合を明示し、TLS検証無効化のオプションは提供しない。再接続/retry/offline queue無効、各接続/commandに8秒期限。PING/TIME/INFO server/memory/clientsだけを順次実行する固定リストで、任意command入力なし。AUTH等のSDK handshakeは別途発生し、CLIENT SETINFOは無効。成功/失敗/timeout後にsocketをdestroyし、QUITも送らない。旧Upstash接続/fallback、アプリ起動、Cron、GET/SCAN/KEYS/書込/EVAL/RESTORE経路なし。
- 出力: PASS、TLS検証成否、5commands、versionと選択したメモリ/接続数の数値のみ。接続先、username、password、INFO全文やserver errorを出さない。失敗は固定メッセージ/終了コード1。Windows初心者向けのZIP取得、Node22、npm.cmd ci、対話入力、CA、結果の読み方、停止/共有範囲を `docs/AIVEN_CONNECTION_CHECK_WINDOWS.md` に作成。実接続操作は別途明示指示後と記載。
- 今回のテスト: `REDIS_TEST_SERVER=/workspace/.onboarding-tools/redis-7.2.7/src/redis-server /workspace/.onboarding-tools/node_modules/node/bin/node --test tests/aiven-connection-check.test.js`。3 tests PASS / 0 FAIL / 0 skip。Node22.23.5、Redis7.2.7、合成パスワード、一時自己署名CAのTLSブリッジ、loopbackのみ。実Redisで認証成功/誤password拒否/未信頼CA拒否/hostname不一致拒否とsocket残存0を確認。一時Redisプロセス/証明書を後片付け。モックで固定5commands、TLS設定、単一connect、接続/command timeout、command/auth/不正応答の秘匿、destroyを確認。非表示入力、backspace、Ctrl+C/stream error/end、非TTY拒否、raw mode復旧も確認。
- 追加検証: Linuxの実PTYでCLIを起動し、合成passwordを入力してCtrl+C。password非表示と固定FAIL/終了コード1を確認（接続前の中止）。node --check、git diff --check成功。既存アプリ/lockfileを変更していないためmigration全94件は今回再実行せず、今回の3件と混同しない。
- 変更ファイル: 本進捗ログ、上記CLIとWindows手順、`tests/aiven-connection-check.test.js` の4ファイルだけ。npm ci --ignore-scriptsで既存lockどおり依存を導入。パッケージ宣言/lockfile、本番設定/環境変数は変更なし。vercel.jsonのgit.deploymentEnabled=false維持を確認。
- アクセス範囲: GitHubの読取/pushとnpm registryの固定依存取得、ローカル合成Redis試験のみ。実Aiven、旧Upstash、実TMDB、本番Vercelへの接続なし。main統合、本番deploy、環境変数変更、実backup/移管/停止解除なし。
- 引継ぎ/次の一手: Windows実機のTTY操作と実AivenのTLS/ACL/INFO権限/疎通は未検証。ユーザーPCで準備手順を行い、実接続の別指示後に固定5commandテストを1回行う。共有するのは秘匿済み結果だけ。失敗時は自動再試行せず原因を確認する。疎通成功もLua/RESTORE/移行データ互換の証明ではない。旧Upstash Export回答待ち/実移管承認待ちは維持する。
- GitHub保存: この追記を含むコミットを本テストブランチへ通常pushし、リモートSHAとの一致を確認する。コミットSHAはGit履歴参照。本番反映なし。

### 2026-11-14 13:38 JST / Windows実Aiven疎通の報告受領・RDB容量/全件照合計画
- ブランチ: `test/temporary-redis-migration-20261114`、開始HEAD `50bccbd939ca51832ac8446bbc76a526fedb5f83`。リモート一致/開始時変更なしを確認。状態: 実接続結果の記録と復元計画準備完了、実RDB容量判定/実復元は未実施。
- ユーザー実測報告: Windows PCからAiven Freeへstatus PASS / tlsVerified true / commands 5 / version 9.1.3 / usedMemoryBytes 5174912 / maxmemoryBytes 312475648 / connectedClients 4。旧Upstashアクセス、Aiven書込、本番変更なしとの報告。エージェントが実接続で再確認した値ではなく、ユーザー報告として記録する。接続日時そのものは未提示、当項時刻は記録時刻。
- 容量判断: maxmemoryは298MiB（約312.48MB）、疎通時使用量は約4.94MiB。以前の約193MBのRDBは正確なサイズ/単位/hash/内容/時点が未確認。圧縮RDBサイズとresident memoryは異なり、現時点で「収まる」「欠落しない」とは言えない。実RDB未提供のため容量ゲートは保留。以前のRAM1GBからの推定より今回のmaxmemory実測を優先。
- 追加文書: `docs/AIVEN_RDB_RESTORE_WINDOWS_PLAN.md`。Windowsの秘密データ保管/hash、WSL2/Dockerによる通信遮断ローカルValkey9.1.3検証、全DB/binaryキー/型/絶対期限/値hash/未知キー保持、版差/loader/OOM判定、target容量監視、全台帳/index/lock/control/journalの照合、自然失効の別計上、部分復元後の停止を記載。Windows/Valkey9.1.3環境のセットアップ自体は今回未実行。実データを扱うコマンドや実target runnerの実行は承認待ち。
- 復元前の必須条件: 最新で整合したexport、provider除外範囲/全DB件数の独立証拠、全writer停止/drain、正しいrelease namespace、実データのローカルロード/全件復元リハーサル、余裕を含む容量、空target/noeviction/互換性と実書込の別承認。上限70%（218732953 bytes）を仮の保守的停止線とするが、provider保証ではなく最大キー/batch/fragmentation/接続/persistenceのpeakも別途判断する。条件不足なら復元しない。
- 既存ツールの制約: restoreVerifiedはlocal/隔離prefix専用、inventory CLIはarchive/proof入力専用で生RDB importerではない。Windows接続診断も5読取専用。原キーをAivenへ復元する専用runnerと全件verifierはまだ未完成で、既存安全制限の解除による流用はしない。設計要件を新文書に記録し、実書込前に別作業で実装/テスト/レビューする。
- 今回の検証: `REDIS_TEST_SERVER=/workspace/.onboarding-tools/redis-7.2.7/src/redis-server /workspace/.onboarding-tools/node_modules/node/bin/node --test tests/migration-rdb-rehearsal.test.js tests/migration-capacity-rehearsal.test.js`。3 PASS / 0 FAIL / 0 skip。既存2件（全6型/複数DBと日本語作品/人物/ジャンル検索のRDB reload一致）に容量試験1件を追加。
- 容量試験の実測: 合成RDB 25876 bytes、dataset 2232696 bytes、used_memory 3193216 bytes（最終run）。圧縮倍率は実データへ外挿しない。別の小容量noeviction targetへの合成RESTOREは64キー中10キーでOOMとなり停止、evicted_keys 0、元sentinelと成功済みキー保持、DBSIZEは11。これは「OOMでも原子的rollbackはなく不完全な復元が残る」ことを確認する期待どおりの試験結果。実AivenのOOM/eviction設定を確認したものではない。
- 変更: 本ログ、新手順書、`tests/migration-capacity-rehearsal.test.js` の3ファイルのみ。アプリ/依存/lockfile/本番設定は変更なし。合成一時Redis・RDBは後片付け。過去94件を今回の実績と読み替えない。
- 未完了/次の一手: Upstash Exportの回答/承認と最新RDBの安全な受領後、実ファイルhash/形式/全DB棚卸しとValkey9.1.3での容量測定を先行する。実データが余裕込みで収まらなければ停止し、削除/省略や無断課金で回避しない。原キーrunner/全件verifierの準備・実書込承認より先にAivenへ復元しない。
- 今回の実アクセス: GitHub読取/pushとローカル合成試験だけ。実Aiven/旧Upstash/実TMDB/本番Vercelへの接続、実データ復元/削除/backup、main統合、本番deploy、環境変数変更、Cron/停止解除なし。Git自動デプロイfalse維持。テストブランチへ通常pushしSHA一致を確認する（コミットSHAはGit履歴）。
