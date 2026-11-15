# Aiven移管計画・公式条件の確認（2026-11-14 JST）

## 現状と範囲

mainをfetchし、先端 `a05897e6cba18d271ec5fec6ce4dffbf37080303`（PR #50）を確認した。緊急表示修正のapplication/source/testは移管ブランチと同一。二重適用していない。ユーザーから本番昇格済み `dpl_5G4PAYgd2ojFt4EmpyAFEWf6Yu7S` と報告を受領した。本番への再アクセス・再デプロイはしていない。

この計画は既存アダプターとバックアップ/復元処理を引き継ぐ。今回実施したのは公開公式文書の調査、ローカル実装・検証、GitHubへの保存だけ。旧Upstash、新Aiven、実TMDB、本番Vercelへの接続・操作はゼロ。実データ移管・停止解除は別途承認が必要。

## Aivenの公式確認結果と未確認事項

確認日: 2026-11-14 JST。契約/作成画面で相違があれば画面の条件を再確認し、課金操作を止める。

|項目|公式資料で確認したこと|実先で確認すること|
|---|---|---|
|無料枠|Free $0/月、カードなし登録、期限なし、単一ノード/1CPU/RAM1GB。無料専用文書ではmaxmemory50%|実maxmemoryと使用量。RAM1GB全てを台帳に使えるとは扱わない|
|リージョン等|無料では特定cloud/regionを選べない。組織あたり各サービスタイプ1個、VPC/固定IP/連携/forkなし|VercelとのRTT、実接続上限|
|可用性/backup|SLAなし、未使用時の停止や構成変更の可能性。無料backupは災害復旧用の単一世代|永続化有効、最終backup時刻と復旧経路。独立バックアップを保持|
|料金|Freeと有料Developer/Hobbyistは別プラン|Free表示と$0を確定。30日trial/クレジット残高をFreeの証拠にしない。カード・支払方法・upgrade・有料連携を追加しない|
|コマンド|メモリ管理文書はValkey通信のrate limitを課していないと記載|月間上限なしを契約上の無制限保証にしない。CPU/容量/接続数/規約の制約は残る|
|TLS|新サービスは通常公開CA、旧サービスはproject CAの場合あり。公式URIはvalkeys://|ホスト名/証明書を検証。CAが必要ならPEMを安全に渡す。TLS無効化しない|
|Lua|新規インスタンスでEVAL/EVALSHA/SCRIPT LOAD既定有効|アプリの監査済みLua、cjson、複数KEYS、ACLを隔離キーで検証|
|制限command|MIGRATE/REPLICAOF/CONFIG/COMMAND/SAVE/BGSAVE/ACL等が制限|DUMP/RESTORE/PEXPIRETIME/TIMEと必要データ型を実先で少量確認。制限解除は要求しない|
|eviction|一般資料ではnoeviction既定|実際にもnoevictionであること。容量超過時に台帳を追い出すallkeys-*へ変更しない|

無料専用資料のmaxmemory50%と、一般メモリ資料の70%は適用範囲が違う。無料の容量を一般資料から70%と見積もらない。管理オーバーヘッド・fragmentation・バックアップ時の増分を別に見る。接続数も資料の概算では確定せず、作成後のINFO/Consoleで実値を確認する。

公式出典:

- https://aiven.io/docs/products/valkey/concepts/valkey-free-tier
- https://aiven.io/pricing/valkey
- https://aiven.io/docs/products/valkey/concepts/memory-usage
- https://aiven.io/docs/products/valkey/howto/manage-ssl-connectivity
- https://aiven.io/docs/products/valkey/howto/estimate-max-number-of-connections
- https://aiven.io/docs/products/valkey/concepts/lua-scripts
- https://aiven.io/docs/products/valkey/reference/restricted-commands

## 移管方式の決定と停止条件

**第一候補: Upstashのprovider RDB export → 隔離ローカルへロード → 完全棚卸し/検証 → 承認後に空のAivenへ原キーで復元。**

Upstashの公式手順はConsoleの対象DB → Backups → Backup & Export → Export → 完了後Download。旧RedisへアプリからSCANやDUMPを送る必要を避けられる。ただし当該アカウントの無料プランでの利用可否、export/backupの料金とコマンド計上、実ファイルの型/バージョン互換性は公式ページだけでは確定できていない。画面表示/サポートで確認するまでexportを実行しない。アプリ発行Redisコマンドが0でもprovider側の料金・計上が0とは断定しない。

Upstash RDB exportはRedis Functionsを含まないという制限がある。本アプリの監査対象はリポジトリ内Luaを毎回EVALする方式で、Functionを必要とするコードは見つからなかった。実DBの外部Function/モジュール/別用途データの有無は別に確認し、未確認のまま完全バックアップと断言しない。

- https://upstash.com/docs/redis/howto/importexport
- https://upstash.com/docs/redis/features/backup
- https://upstash.com/docs/redis/overall/compatibility

**Aiven標準のsource直結migration wizard/CLIは使わない。** 公式CLI資料はreplication失敗時にSCANへfallbackすると記載。今回の旧Upstash大量SCAN禁止と合わず、実行前に止める。またsource<=Redis7.2という条件があり、Upstashの最新プロトコル対応番号はRDB互換バージョンの証明にはならない。

- https://aiven.io/docs/products/valkey/howto/migrate-redis-aiven-cli

**代替: 承認された完全な正確キーmanifestから、上限付きの読取専用snapshot。** 既存の `redis-low-command-backup.snapshot` にmanifest指定を追加した。completeというレビュー記録、証拠SHA、キー一覧SHA、重複/件数/バイナリ検査を送信前に必須とする。SCAN/KEYSは一切送らずDUMP+PEXPIRETIME+EXISTSとTIMEだけ。manifest外のキーが存在しないことを、この処理自身は証明できない。ソース全体のprovider export/棚卸し等の独立した完全性証拠がなければ代替経路を実行しない。266作品の固定一覧、検索registry、gitの既知IDだけから完全manifestを推定しない。

元Upstashへの実snapshot実行クライアントは接続していない。汎用関数の注入先を実環境に変えることは別承認の作業で、今回のローカルCLIは外部へ接続しない。

## 欠落させないキー/DB範囲

原則は**完全export内の全DB・全キーを保全**。有効なrelease namespaceのキーだけを選んで他を捨てない。期限切れだけは元の絶対期限に従い自然に失効させる。

`LEDGER_RELEASE_SHA256` はアプリのGitコミットSHAではない。現在稼働中のrelease識別値とREADY値を維持し、物理prefix `doko:ledger:release:{先頭16桁}:` を変更しない。今回のGit SHAをrelease識別値に代入しない。

|範囲（物理prefixの後ろ）|保全するもの・照合|
|---|---|
|work:v2:{movie,tv}:{id} と :meta|固定情報、confirmed/locked/lockedFields、手動pageExtras、全JSONバイト、revision/エラー/確認履歴|
|seo:v1:* と :meta|既存SEO台帳。今回再生成しない|
|person:v2:* と :meta|コンパクト人物、出演作/関連情報、更新期限/履歴|
|season:v1:tv:* と :meta|manifest、episode、特番/シーズン番号、更新期限/履歴|
|shared-stream:v1:record:*|日本の見放題/rent/buy、最終成功/試行、エラー・revision・lastSeriesRunDay|
|search:v2:doc:* / ids:* / grams:* / ready / unused|検索文書、registry・gram zsetのmember/score、ready状態。作品だけから再構成して済ませない|
|shared-stream:v1:batch-job:* / stream-jobs:* / ops:v1:*|日次journal、途中再開/重複防止、最終成功、通知marker/outbox/sequence、履歴のTTL|
|content-control:* / acquisition* / source:*|全体停止、quota、日次/分次枠、失敗cooldown、newWork停止設定|
|*:lease / *:lock、shared-stream:v1:lock:* / series-batch-lease、cutover:v1:active|所有token、lease期限、writer ticketを含め保全。削除や期限リセットをしない|
|recovery:v1:* / legacy-*、他release/probe/dev namespace|キャッシュ・関連counter、旧コピーも保持して用途を棚卸し|
|namespace外の旧キー/不明キー|doko:work:v1:*、doko:person:v1/v2:*、doko:season:v1:*、doko:detail-providers:v1:*、配信旧キーその他。型/バイナリを保全し、勝手に削除・除外しない|

ローカルでINFO keyspace等から全論理DBを列挙し、DBごとに別manifest/archive/proofを作る。DB0だけと決めつけない。原キーのバイナリ、string/hash/list/set/zset/stream、絶対ミリ秒有効期限を保持する。順序/score/stream IDを変えない。

`migration-inventory` は既存archive/proofのhashを検証してから全レコードを分類する。不明キーも件数に含め、キーそのものはbase64のままprivate成果物へ保持する。分類結果は移管可否を自動承認しない。archive内の完全性と実DB全体の完全性を区別する。

## 時点整合性・実行順（すべて実運用は別途承認）

1. Aiven無料表示/実バージョン/region/接続情報を確保。接続先だけを用意し、本番環境変数は変更しない。sourceとtargetを取り違えないようDB識別情報とrelease namespaceを記録する。
2. exportの無料利用可否・コマンド計上・バックアップ範囲を確認。全writer一覧を確定。閲覧に伴う配信更新、6時Cron、管理API、旧route、外部script/CIもwriterに含む。
3. 停止操作の承認後、全writerを停止・drain。controlのpauseだけではCronが監視履歴を書く場合があるため、呼出経路も含め停止を確認。Cron設定を勝手に変更・手動実行しない。新旧両方のwriterが動く時間を作らない。
4. 整合した最新export/backupを取得。元Upstashはそのまま残す。成果物をprivate保存、SHA-256/時刻/DB/件数/TTL/型/サイズ/source識別を記録。backup前の台帳操作はしない。停止制御操作とデータ書換えは区別して承認する。
5. 使い捨てのローカルUnix socket server（TCP port 0）へRDBをロード。CRC/loader拒否なら停止する。旧実RedisへのSCANなしで、ローカルの全DBを走査してarchive/proof/manifestを作る。MODULE等の未知型があれば現ツールの6型対応を越えるので中断する。
6. 同じarchiveを隔離prefixへ復元し、全件バイト/型/絶対TTL照合を行う。固定情報/ロック/手動項目/人物/シーズン/配信の比較、検索registry/doc/gramsの対応、履歴/日次journal、全DB件数の証拠を揃える。内容の修正・index再構成はしない。不整合なら既存不整合も含め報告して止める。
7. source/targetと無料条件の承認後、空のAivenへ同じDB番号・**原物理キー**でコピー。全対象EXISTSの事前確認、no REPLACE、byte/rate/command上限、期限切れ非復活。source snapshot後に書込みが再開していたら古いsnapshotを採用せず、再停止と再backupが必要。
8. 実先で原キー/型/値/TTL、ACLとLua/cjson/CAS、ロック競合/配信失敗保持を少量検証。Aiven version差でDUMP encoding/hashが違う場合も無断に検証を緩めず停止し、型別の同値証明方式をレビューする。ロード成功だけで完全互換としない。
9. 本番接続切替の承認後、REDIS_PROVIDER=valkey等を別作業で設定・反映。停止フラグを維持して読み取りを確認し、旧Upstashへ通常route/Cron/legacyの全経路がアクセスしなくなったことを確認する。
10. 容量/RTT/接続数・backup・固定/ロック・24時間・6時・人物/シーズン検証後に個別に停止解除を承認。NON_STREAMING_ACQUISITION_PAUSEDだけでなくcontrol、PERSON_LEDGER_WRITES_PAUSED、SEASON_LEDGER_REFRESH_ENABLEDとLEDGER_WRITES_RESUME等を確認。未登録作品は従来ingestで新Redisへ保存する。

既存 `restoreVerified` は隔離prefix専用の安全ガードを維持している。**原キーでの実Aivenへの書込runnerはまだ接続・有効化していない**。実先識別・空DB・原キーmappingを確定してから必要最小限を追加/審査する。既存関数へ空prefixを渡してガードを外す方法は使わない。今回の計画完了は「実移管が実行可能・承認済み」という意味ではない。

## コマンド消費・容量・時間

|方式|元Upstashへアプリから送るRedis command|未算定|
|---|---:|---|
|provider RDB export|0（アプリSCAN/DUMPなし）|provider操作の料金/計上、export時間、転送量は確認待ち|
|完全manifestからのsnapshot|3K+1 / DB|manifest取得費用、事前確認、停止/drain、接続handshake等は別|
|ローカル棚卸し/復元検証|0|PC/Cloud上のローカルCPU/RAM/ディスク|

manifest経路はK=1,000で3,001、K=10,000で30,001コマンド。pipelineは往復を減らすだけで課金commandを減らさない。32keys/batchなら概ね2×ceil(K/32)+1 RPC。期限切れの件数照合も含む。source書込み0だがquotaを消費する。

既存restoreの移行先側は約 `2K + 非string数 + string検証group数 + preflight group数`、期限切れ判定にTIMEが追加される場合がある。Aiven側もCPU/転送/メモリを消費する。実先の原キーrunnerの操作数は実装確定後に再算定する。

RDB圧縮ファイルやDUMPサイズは実メモリ使用量ではない。ローカルMEMORY USAGE/INFOと実先maxmemory、fragmentation、接続数、将来増加、backup時のheadroomで判断する。無課金のために上限を回避してデータを切り捨てない。

Aivenのregionを選べないのでVercelとの実RTTが重要。逐次N送信なら追加時間は概算N×RTT。1worker1接続の共有でもworker総数で増え、TLS cold connectも加わる。6時batchのmaxDuration300秒/内部予算を満たすか実先で検証する。実データ件数・容量・quota残量未提供のため、移管時間/必要command/無料容量への実収容はまだ確定できない。

## 切り戻し

書込み再開前は、両writer停止後に元snapshotと旧Upstashの一致を確認し、旧接続へ戻す別承認を得る。quota不足なら戻しても通常運行できない。書込み再開後は旧側が古くなるため、最新Aivenを先に停止/drain/backupし、逆移管の整合性・容量・quota・衝突を確認してから原キー/全DBを戻す。旧Upstashへ接続だけ戻すことは禁止。旧DBのFLUSHやConsole Restore（既存targetデータを削除する）も今回実行しない。

## ユーザーにお願いする具体的な次の操作

1. https://console.aiven.io/ でアカウント/組織を用意し、Valkeyの**Free、$0/月**を選ぶ。特定regionが選べないことを確認する。trial/Developer/Hobbyist/支払方法追加/upgradeを選ばない。Freeが表示されなければ作成せず、その表示だけ報告する。
2. Freeを作成する場合は「空サービス作成だけ」で、Import database/migration wizardへ進まない。source Upstashの資格情報をwizardへ入力しない。サービス作成自体は今回代行していない。
3. サービスのplan/費用、version、region、TLS方式、backup/persistence、maxmemory/eviction、接続上限の確認情報を用意する。URI/password/CAはチャットやGitHubへ貼らず、この作業環境の安全なsecret設定で `REDIS_URL`、必要時だけ `REDIS_CA_CERT` として渡す。本番Vercelにはまだ設定しない。接続先host/portのネットワーク許可も必要になる場合がある。
4. Upstash Consoleでは対象DBのBackups画面を**見るだけ**にし、Exportの利用可否・料金表示、現在quota残量、データサイズ/件数、既存backup/export有無を確認する。Export/Backup/Restore/upgrade/カード追加をまだ押さない。不明ならproviderに無料可否とコマンド計上を確認する。
5. 上記が揃ったら、空のAivenの隔離キーへ接続テストする範囲とcommand上限、実backup方法を具体化して承認を得る。取得したexport/backupはprivate成果物として扱いGitへ追加しない。

## ローカル証拠と再現

- 既存87件を保持。追加: valkeys URIと実TLS証明書の検証2件、exact-manifest/棚卸し3件、RDB reload全6型/DB0とDB2の復元1件。
- RDBテストはテスト自身が作った合成exportをUnix socket専用serverへロード。原Upstash export/Aiven Valkeyの実互換性は未検証。
- `scripts/migration-inventory.js` はローカルarchive/proofとactive release識別値を入力にprivate inventoryを新規作成するだけ。ネットワーク・資格情報探索・実移管機能なし。出力は0600、既存ファイル上書き禁止。raw成果物をwork/等のGit対象外へ置く。
- 再現: `REDIS_TEST_SERVER=/path/to/redis-server REDIS_TEST_CLI=/path/to/redis-cli REDIS_TEST_TRANSPORT=valkey npm run test:migration`。Redisは127.0.0.1:16379の隔離用のみ。
