# 移管前の作品詳細表示復旧（2026-11-14 JST）

## 状態

`test/emergency-work-detail-20261114`。開始点はmainと移管ブランチのリモート先端 `89cd807038a44defdf246ea87ae5af4645202571`。
本番には未反映。main統合、push、デプロイ、環境変数変更、実Upstash/TMDB接続、実Cron実行はしていない。
移管途中のValkeyアダプター・依存追加はこのブランチに含めない。

## 動作

- 登録済み作品は保存情報を優先。手動情報・ロック・更新ルールを変更しない。
- 既存の `NON_STREAMING_ACQUISITION_PAUSED=1` の間、未登録作品はTMDBから取得し、その要求のメモリ上だけで表示する。新しい環境変数は不要。
- 作品・SEO・シーズン・人物・検索index・配信情報は保存しない。新規作品予約、Redis取得枠、writer ticket、ロック、失敗履歴も書き込まない。
- TMDB基本詳細に `credits,watch/providers` をappendして、人物表示と配信情報も返す。既存の正規化処理を使用し、TVシーズン一覧は応答内だけで扱う。人物・エピソードの新規取得停止は維持。
- display-only指定は停止中の `/3/movie/{id}` と `/3/tv/{id}` だけに限定。保存を伴う他の処理に適用しない。
- 共通controlの停止・欠落、非稼働releaseモードは引き続き拒否する。元Upstashの読み取り自体が上限で失敗する場合、保存済み情報との判別ができず503になる。この修正だけでRedisの読み取り不能は解消できない。
- 登録済み作品の配信24時間更新・朝6時JSTのシリーズCronは従来どおり。未登録作品の配信情報はTMDB応答内だけに置き、既存台帳を変更しない。
- 移管後、新Redis・バックアップ・復元・停止制御の検証を終えてから、既存の取得停止フラグを解除すれば従来のingest（作品/SEO/検索index/TV manifest保存）に戻る。今回停止設定は解除しない。

## ローカル検証

Redis 7.2.7、127.0.0.1:16379、ランダムなrelease namespaceとモックTMDBのみ使用。実ネットワークのfetchを拒否するテストを追加。

12ファイル51テスト成功、失敗0・skip0。緊急修正テスト5件を含む。

対象: emergency-work-detail / paused-ledger-reads / lazy-request-guard / search-index-v2 / streaming-ledger-service / seo-detail-renderer / acquisition-recovery / acquisition-source-integration / release-production-connection / person-season-work-integration / release-season-refresh / release-person-ledger。

- 未登録映画・TVの詳細JSON、work-detail、SEO HTMLを繰り返し取得し200を確認。タイトル・概要・cast・配信・シーズン・canonical・JSON-LDを検証。
- 台帳未作成、既存固定情報保持、TMDB失敗・404・不正ID・タイトル欠落・1MiB超過・共通停止時の拒否を検証。
- 取得停止解除後に従来の作品/SEO保存が戻ることを合成データで検証。
- 登録済み検索、SEO、24時間直前/境界、失敗時の既存配信保持、13シリーズ266作品の6時更新、人物・シーズンの既存テストを実行。
- 既存のpaused-ledger-readsは `transientDetails:false` を明示し、従来の保存済み限定モードの比較を維持。通常のデフォルト動作は新しいemergencyテストで検証。

## 負荷

未登録作品1要求あたりの送信数（ローカル観測、Upstash課金実測ではない）:

|経路|映画 Redis|TV Redis|Redis書き込み|TMDB HTTP|
|---|---:|---:|---:|---:|
|検索詳細API|3|4|0|1|
|work-detail|2|2|0|1|
|詳細HTML|4|5|0|1|

control GET、作品GET、必要に応じてシーズン/配信GETを使う。HTMLには従来のSEO読み取りEVALが含まれる（内部GET1）。SEO二重取得改善はしていない。HTMLと検索詳細を各1回取得する通常の未登録映画ページでは合計Redis7送信、TMDB2 HTTP。TVならRedis9送信。Vercel Functionは各経路1 invocation、計2 invocation（CDNヒットを除く）。1,000ページなら映画7,000/TV9,000送信、TMDB2,000 HTTP、Function2,000回の単純上限見積もり。

従来の失敗経路に対する追加は検索詳細の配信GET1回、TVではシーズンGETも1回。work-detail追加0回。HTML追加は配信GET1回、TVシーズンGET1回。新規作品の永続保存による増加は0。

この経路は共有Redis取得quota/失敗cooldownへ書き込まないため、直接取得の全インスタンス合計上限は保証しない。6500msの期限、1MiBの応答上限、ID/応答の検証、既存CDN設定は維持。TMDB通信は未登録作品を表示するたび発生し得る。公開負荷・Vercelの時間/転送量は未測定。

## 変更ファイル

- api/_release-application.js: 停止中の保存しない詳細経路、配信表示、TV manifestの応答利用。
- api/_release-source.js: 限定した直接取得でRedisのquota/失敗保存を省略。
- tests/emergency-work-detail.test.js: 正常/失敗/復帰とRedis操作数。
- tests/paused-ledger-reads.test.js: 旧保存済み限定モードを明示。
- 本書。
