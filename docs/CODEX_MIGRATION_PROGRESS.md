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
