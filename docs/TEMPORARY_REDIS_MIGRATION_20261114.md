# Redis一時移管・復旧手順（2026-11-14 JST）

## 作業状態

mainと作業ブランチのリモート開始点はともに `89cd807038a44defdf246ea87ae5af4645202571`。ローカル作業ブランチは `test/temporary-redis-migration-20261114`。緊急表示修正は別ブランチ `test/emergency-work-detail-20261114` の `c852599` として分離し、本ブランチにも取り込んだ。

実Upstash、実TMDB、新Redis、本番APIには接続していない。元Redisの削除・初期化・SCAN・大量読書き、サービス作成、本番環境変数変更、Cron実行、デプロイ、main統合、pushは実施していない。Git自動デプロイ停止falseとCron設定は変更なし。

## 接続調査とアダプター

- 現行release系: `_release-dispatch` → `_release-connection` → `_release-transport-candidate` → Upstash REST。namespaceは `doko:ledger:release:{LEDGER_RELEASE_SHA256先頭16文字}:`。同じSHAを維持しないと既存台帳を参照できない。
- legacy系: `_redis` がKV_REST_API_*を優先し、次にUPSTASH_REDIS_REST_*。release query context内のlegacy接続拒否を維持。
- Redis REST endpoint/tokenはValkeyのRESP/TLSへそのまま使えない。`REDIS_PROVIDER` 未指定/`upstash` は従来経路。`valkey` は新規 `REDIS_URL` を使用し、Upstashへ自動fallbackしない。不明providerは拒否。
- Aiven候補には `rediss://` を使用。必要なCAは `REDIS_CA_CERT` のPEMで渡す。TLS証明書検証を無効化しない。非TLSは非本番のloopbackだけ許可。
- `redis@5.11.0` を固定。接続は初回command時にだけ開始し、worker内で共有。offline queue・再接続・コマンド再送を無効化。接続/コマンドに8秒期限。接続設定がworker稼働中に変われば拒否し、再起動が必要。
- release系は既存のコマンド/Lua監査、namespace変換、paused時の書き込み拒否、予算上限の後ろにRESPアダプターを置く。既存Luaを変更しない。transportに渡す内部HTTPS URLはRESTアクセス先ではなく、既存JSON境界を保つための識別子。
- GET/SET NX PX/MGET/MSET/EXISTS/INCR/INCRBY/TTL系、HSET/HDEL/HGETALL/HLEN、ZADD/ZREM/ZRANGE/ZRANGEBYLEX/ZCARD/ZLEXCOUNT、TIME、監査済みEVALに依存。Luaはロック所有確認・revision CAS・配信fencing・quota・検索index・atomic commitを実施。ValkeyでEVAL/cjson/複数KEYSと必要コマンドが利用可能であることが切替条件。
- releaseはSCAN/任意Lua/任意namespaceを拒否する。legacy adapterは従来同様の汎用commandなので、本番releaseモードの経路制限を維持する。
- 台帳JSON、固定情報・手動項目・ロック、TTL、revision、24時間/6時判定、人物/シーズン更新規則は変更していない。

## 維持する環境変数と停止条件

`LEDGER_RELEASE_MODE`, `LEDGER_RELEASE_SHA256`, `LEDGER_RELEASE_READY_SHA256`, `LEDGER_RELEASE_REDIS_URL/TOKEN`（旧接続を復旧用に保持）、`TMDB_API_KEY`, `LEDGER_ADMIN_TOKEN`, `CRON_SECRET`, `LEDGER_UPSTREAM_DAILY_LIMIT` を維持。新Redis選択時のみURL/TOKENを新しい `REDIS_PROVIDER=valkey`, `REDIS_URL`, 必要なら `REDIS_CA_CERT` に代替する。旧Upstash用変数を削除しない。

`NON_STREAMING_ACQUISITION_PAUSED=1` は今回の緊急修正で未登録詳細の一時表示だけ許す。人物/シーズン/検索等の新規取得停止は維持。`PERSON_LEDGER_WRITES_PAUSED`、`LEDGER_WRITES_RESUME`、`SEASON_LEDGER_REFRESH_ENABLED` 等の既存opt-inも勝手に変更しない。control.status、control.newWorkAcquisitionPaused、dailyLimit、release modeは独立した停止条件。

現行Cronは `/api/update-streaming`、UTC `0 21 * * *` = 毎朝6時JST、認証はCRON_SECRET、Function maxDuration300秒。13シリーズ266作品の日次journal/idempotency、ロック・quota・失敗時の既存配信保持を維持。

## 実施前の必須入力（現時点では未提供・未確認）

1. Aiven for Valkeyの実接続URL・TLS CA・利用可能リージョン/接続数/容量。無料枠、クレジット失効後の扱い、追加課金なしを所有者が確認する。無料で満たせなければ作成しない。プラン条件・金額は今回実確認していない。
2. 実容量、全writerの一覧、整合したバックアップ、元キーの完全manifest、コマンド残量と移行読取予算。過去資料の件数は現在値として使わない。
3. 実際の停止変数・control状態・Cron稼働状況。今回の環境変数一覧を本番設定の証明とは扱わない。
4. backup/RESTORE/DUMPの移行先対応、バイナリとTTLの互換性。ローカルRedis合格だけではAiven互換性の証明にはならない。

## 移管・復元（手順のみ。今は実行しない）

1. 上記入力と無料条件を確認し、正確な切替・復旧対象をレビューする。元Upstashを保持。空の移行先を別に用意するのは別途承認された範囲でだけ行う。
2. 利用者要求・Cron・外部scriptを含む全writerの停止とdrainを確認する。停止/環境変更の操作も今回の範囲外。停止後の状態をバックアップする。台帳を最新に保つため、移管前に旧台帳を大量更新する方法は採らない。
3. 元Redisでは全件SCANしない。既存の整合したprovider export/backupがあればその成果物を検証する。なければ完全な正確キーmanifestが必要であり、件数/読取予算を審査した別作業のバックアップを先に完了する。作品台帳だけでは人物・シーズン・検索index・control・journal等が欠落するため不十分。完全manifestがなければ移管を中断する。バックアップ前の実データ操作は禁止。
4. 成果物にはキーのバイナリ表現、型、DUMP、絶対有効期限、件数、SHA-256を含め、秘密として安全に保存する。JSON文字列だけを読み直して台帳を再生成しない。手動項目/ロック/順序/revisionを変えない。
5. バックアップを隔離ローカルへ復元し、型・値・TTL・hashと件数を検証する。期限切れを復活させない。欠損/破損なら先へ進まない。
6. 新Redisへ元と同じ物理キー/namespaceで復元する。衝突時は停止し、REPLACE/FLUSHで強制上書きしない。古いロック/journalの削除やcontrol変更は台帳書換えとは別の審査が必要。
7. 新Redisで保存済み詳細・検索・SEO、Lua所有権/CAS、TTLを少量検証。新Redisにだけ向くことを確認。バックアップのSHA/件数と復元先の一致を証拠化。
8. 接続先変更と反映は別途承認後に行う。初めは取得停止を維持し、緊急の保存しない表示を使う。原Upstashへfallback/二重書き込みをしない。
9. 通常運行再開は容量・接続数・予算・バックアップ・固定情報/競合保護・24時間/6時・人物/シーズンの実先検証が全て合格した後。NON_STREAMING_ACQUISITION_PAUSEDだけでなくcontrol.newWorkAcquisitionPaused等も個別レビュー。停止解除で既存ingestに戻る。Cron手動実行で確認しない。

既存 `scripts/redis-backup-local.js` と `redis-full-backup`/`redis-low-command-backup` はローカルの復元リハーサル用。SCANを使う実装なので、そのまま元Upstashに向けて実行しない。今回アプリ用ValkeyアダプターはDUMP/RESTOREのバイナリ移行ツールではない。

## 切り戻し

- 新Redisへの書き込み再開前: writerを止め、元Upstashの停止後バックアップと一致を確認した上で旧接続へ戻す。旧Upstash側quota不足は別問題で、URLを戻しても通常運行が直る保証はない。
- 書き込み再開後: 旧Upstashは古い。新Redisの全writerを停止/drainし、新Redisを先にバックアップする。最新の作品/配信/人物/シーズン・manual/lock/control/journalを含む整合した成果物を検証し、旧側容量/コマンド予算・衝突・復旧計画を別途レビューする。新データを同期せず接続だけ戻すことは禁止。
- 逆移行が安全にできなければ、停止を維持し新Redisの復元を優先する。両側同時更新、原Upstash初期化、期限切れロックの無断解除は禁止。

## 負荷の見積もり

REST→RESPで論理Redisコマンド数やLua内の操作数は減らない。releaseごとの最大500送信/10,000予約コマンドは維持。過去main比較fixtureの保存済み詳細3送信、HTML4送信、検索5送信、実更新8送信、日次266作品291送信が目安。Lua内部まで含む課金数とは別。新規作品は既存のbounded ingestで保存されるため、通常運行復帰後は表示だけの負荷より増える。

未登録一時表示の内訳は EMERGENCY_WORK_DETAIL_20261114.md を参照。Vercel invocation数は接続切替だけでは変わらない。各workerが最大1本のTCP接続を共有するが、同時worker数だけサーバー接続が増える。Vercel→Aiven間のRTT/リージョン不一致は全ての逐次commandへ加算され、無料枠の接続上限が律速し得る。実RTT、接続上限、bytes・メモリ容量は未測定。応答サイズ上限は既存transportで検査するが、RESPではSDKが応答を受信した後の検査になる点にも留意する。

移行元の確定キー数をK、正確なmanifestからのsnapshotを1キーあたりTYPE+DUMP+PEXPIRETIMEで採る場合、約3K読取＋TIME1回（再検証・manifest照合は別）が一例。書込0でも元Upstashのquotaを消費する。全件SCAN禁止を緩める見積もりではない。Kとquota未確認のため実数・無料枠への収容・復旧時間は未算定。

## ローカル検証

Redis 7.2.7を127.0.0.1:16379で実行、全データは合成/モック、ランダムnamespace。native RESP transport経由の主回帰13ファイル55件成功・失敗0・skip0。未登録の保存しない詳細、登録済み詳細/検索/SEO、配信24時間境界、朝6時13シリーズ266作品、人物/シーズン、取得停止解除後の保存を含む。

追加のバックアップ/復元・凍結・シーズン更新境界・配信schedule回帰7ファイル32件も成功、失敗0・skip0。合計87件。DUMPの6型・バイナリ・期限、衝突拒否・破損拒否をローカルで検証。

追加でValkeyの遅延接続・並列初回接続の共有、TLS拒否、CA、offline/retry無効、REST非使用、GET/MGET/null/数値/日本語/SET NX PX、Lua所有権、任意Lua/SCAN/他namespace拒否を検証。実AivenのTLS接続/ACL/Luaは未検証。

再現: npm ci --ignore-scripts の後、隔離Redisを16379へ起動し、REDIS_TEST_CLIにlocal redis-cli、REDIS_TEST_TRANSPORT=valkeyを指定して npm run test:migration。追加回帰の詳細は作業ログに記録。CI定義にはローカルRedisだけを用い、デプロイや秘密値を含めない。

終了前のリモート再確認で移管ブランチに引継ぎdocsだけの追加2コミット（5d8ee14 / c0eb943）を検出し、内容を確認してローカルへ保持した。main先端は89cd807のまま。最新のチャット指示に従い、緊急修正後の移管側ローカル検証まで行った。公開・実移管の工程は未実施。

最終実行は REDIS_TEST_TRANSPORT=valkey REDIS_TEST_CLI=/workspace/doko-de-mireru/work/redis-7.2.7/src/redis-cli npm run test:migration。20ファイル87件成功、失敗0・skip0。GitHub CIは未実行。


## 2026-11-14 08:42 JST / PR #50反映後の計画更新

上記は各作業時点の履歴。現在はmain a05897e（PR #50）と緊急表示修正コードの一致を確認済み。ユーザーから緊急修正の本番昇格 dpl_5G4PAYgd2ojFt4EmpyAFEWf6Yu7S の報告を受領。二重適用・再デプロイなし。

移管準備の追加実装は9160d30としてGitHub保存済み。公式調査、全DB/全型/原キー/TTLと手動・index・履歴の欠落防止、コマンド予算、ユーザー操作手順の最新版は [AIVEN_MIGRATION_PLAN_20261114.md](AIVEN_MIGRATION_PLAN_20261114.md) を参照。検証証拠は [AIVEN_LOCAL_VALIDATION_20261114.json](AIVEN_LOCAL_VALIDATION_20261114.json)。

既存87件を再利用して追加6件、22ファイル93件PASS・FAIL/skip0。実TLS/CA拒否、合成RDB全6型/DB0とDB2、完全manifestからのno-SCAN snapshot（3K+1）、offline inventoryを追加。既存復元器の隔離prefix制限は解除しない。Aiven新URI valkeys://をTLSのrediss://へ正規化する。

実移管の第一候補はUpstash provider RDB Export→local棚卸し→承認後のAiven原キー復元。Exportの無料利用可否/課金/command計上は未確定。Aiven標準migrationはreplication失敗時SCAN fallbackがあるため実行しない。Aiven Freeのmaxmemoryは無料専用資料の50%を基準に実先で確認する。

未完了: Aiven Free実サービス/安全なsecret提供、実容量/RTT/接続数/ACL/Lua/restore検証、Export無料条件、整合最新backup、原キーtarget runner、実移管・切替・停止解除・通常運行。本番環境変数/main/デプロイ/Cron/旧Upstashデータには変更なし。次の一手は計画末尾のユーザー作業（Free $0だけ作成、Upstash Exportの可否/料金を閲覧確認）。
