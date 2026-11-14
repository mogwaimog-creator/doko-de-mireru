# 原キー移管：元データの参照警告とrelease識別値の調査

対象ブランチ: `test/temporary-redis-migration-20261114`。調査基点: `8e94490ffd0e23afd5078c6a9568b1748e4decf1`。実Upstash/Aiven接続・実データ取得/復元/削除・main/本番設定変更・deploy・有料サービス利用は行わない。

## 判定と変更

`scripts/lib/original-key-migration.js` の `ledgerSummary()` は、各DBの物理キー集合について、`seo:v1:(movie|tv):ID` / `season:v1:tv:ID` / `shared-stream:v1:record:(movie|tv):ID` と同じprefix・同じDBの `work:v2:TYPE:ID` が存在しなければ、`canonical-work-absent-in-source` を記録する。値のJSON解析、全参照関係の検査、移管先の欠損検出ではない。件数は参照側キー数であり、作品の重複排除件数ではない。旧namespaceも対象で、別DB・別prefixのworkは対応キーとみなさない。

ユーザー報告の316件（映画200・TV116）は元データの警告として扱う。今回は実データで再集計していない。既存のcapture/verifyは警告があっても全件照合を実施できるが、restoreだけが警告を一律拒否していた。原キー保存では参照欠落をそのまま保持できるため、この警告自体を物理復元の禁止条件にする必要はない。ただし台帳の機能的整合性が回復したことにはならない。

安全性に関わる停止条件変更として事前に提案し、ユーザーの明示承認を受領してから修正した。

- restoreの警告件数による停止のみ解除。active namespace不在は従来の `SOURCE_LEDGER_REFERENCE_REVIEW` で停止する。
- 全警告（DB・キーSHA256・issue）は、最初のRESTOREより前に `source-baseline-warnings` journalへ保存する。journal記録失敗は書込前に停止する。成功時のprivate結果では従来どおり `verification.baselineWarnings` に全件を保存する。
- CLIの成功表示へ `baselineWarningCount` を追加する。captureのprivate bundleは元キー全件とrelease識別値を保持し、警告はそこから再算出する。captureのbundle構造は変更しない。
- 警告は削除・work生成・JSON再生成・index再構築の理由にしない。移管先の欠損は警告ではなく既存の全件照合で拒否する。PASSは元データとの保存一致であり、参照関係正常の保証ではない。
- checksum/proof、全DBの空target確認、noeviction、maxmemory/70%停止線/予測/逐次監視、書込前intentとackのfsync、REPLACE/削除禁止、timeout時停止・再送/自動再開禁止、全件DUMP/文字列byte列/TYPE/絶対期限照合は維持する。

期限は相対TTLを固定するのではなく絶対失効時刻を保持する。自然失効は別計上して復活させない。この既存仕様は変更しない。

## LEDGER_RELEASE_SHA256の正式な生成元と確認方法

今回の登録済み領域について、`docs/FINAL_CUTOVER_RUNBOOK_20261110.md` は私有状態ファイル `/workspace/work/staged-five-ledgers-20261110/ledger-upstash.json` を識別値の保存元として指定している。

`scripts/lib/staged-ledger-store.js` の `openState()` は状態ファイルが存在しない初回に **`crypto.randomBytes(32).toString('hex')`** で64桁を生成して `sha` に保存する。`storage()` は `state.sha` をrelease transportへ渡す。`api/_release-transport-candidate.js` は先頭16文字から物理prefixを作る。`api/_release-connection.js` は環境設定のSHAが小文字hex64桁でREADY値と完全一致することを検査する。

したがって、この経路の既存識別値はSHA-256の再計算対象ではなく、保存済みランダム識別値である。既知prefix `52898b9ae978a165` から残り48文字は復元できない。現環境には上記私有状態ファイルがなく、正式な64文字全文は確認できていない。推測値・ゼロ埋め・新規生成値は使用しない。

別のoffline package経路 `scripts/lib/cutover/package.js` には、トップレベル `sha256` を除くbodyの `JSON.stringify(body)` をUTF-8としてSHA-256化する処理がある。`install-local.js` のcandidate経路はその `plan.sha256` とrelease識別値の一致を要求する。しかし登録済みstaged領域のランダム識別値と混同しない。RDBファイルの生bytesに対するSHA-256も別物である。古い `prototype/deployment-candidate/ISSUE19_RELEASE_CONNECTION.md` の「実投入ファイルのSHA256」という説明だけで現在の識別値を置換しない。

今後、所有者が保管済み私有状態ファイルの `sha` または現在稼働するdeploymentに適用された `LEDGER_RELEASE_SHA256` を安全に確認し、64桁の形式・READY完全一致・先頭16桁一致を検査する必要がある。先頭16桁の一致だけでは全文の正当性を証明できない。今回環境変数の取得/変更、provider読取、新規 `openState()` 実行は行っていない（状態欠落時に別識別値を生成するため、復旧確認に使わない）。

## テストと制約

合成データのみ。公式Valkey 9.1.3 tag（commit `29173b67508b2de4c0f0ed551f3b47cf19fc3ca8`）を `work/tools/valkey` に取得し、`make -j2 MALLOC=libc BUILD_TLS=no OPTIMIZATION=-O2` でビルド。依存は既存lockfileから `npm ci --ignore-scripts --no-audit --no-fund`（workspace内cache）で導入し、依存定義/lockfileは変更していない。

新規テストは判定範囲を固定し、316警告の合成データを6型・複数DBの既存fixtureに追加する。rehearsal→別の空targetへreport付きrestore→独立verifyで全331キーを照合し、全警告の一致・書込前journal・bundle非変更・work非生成・警告対象の移管後欠損拒否・journal障害時無書込・namespace不在時無書込を確認する。

最終実行: `VALKEY_TEST_SERVER=/workspace/doko-de-mireru/work/tools/valkey/src/valkey-server REDIS_TEST_SERVER=/workspace/doko-de-mireru/work/tools/valkey/src/valkey-server node --test --test-concurrency=1 tests/original-key-migration.test.js tests/migration-rdb-rehearsal.test.js tests/migration-capacity-rehearsal.test.js tests/aiven-connection-check.test.js`。**16 PASS / 0 FAIL / 0 skip**。容量/OOM/eviction、欠損/余剰/型/bytes/絶対期限、複数DB、自然失効、非空target、未確定replyの無再送、abort/journal障害、ローカルTLSの認証/CA/hostname拒否も既存テストで確認。`node --check scripts/original-key-migration.js` と `git diff --check` も成功。アプリ全回帰・実サービス試験ではない。

実最新RDB・実Aiven容量/allocator/権限・Windows実機・export完全性・本番動作はこの試験の証明範囲外。元からの316警告は残り、元データで既に失われた情報は復元できない。最新バックアップでは件数/容量/警告が変わり得るため、そのbundle専用のcapture・rehearsal・verifyが必要。11月14日の3,020キーの照合結果はユーザー報告であり、今回再検証していない。本番移管は未実施。
