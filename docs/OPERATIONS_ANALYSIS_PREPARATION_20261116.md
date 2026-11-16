# 運用分析・Aiven台帳調査ツール準備報告（2026-11-16 JST）

## 今回の状態

既存の調査報告と CODEX_MIGRATION_PROGRESS.md / ORIGINAL_KEY_MIGRATION_BASELINE_REVIEW_20261114.md を引き継いだ。
既存テストブランチ `test/temporary-redis-migration-20261114`、開始SHA `cb8610812fb190eba5992b4b835bcffbcb07454d` 上のローカル追加だけ。
実Aiven/旧Upstash/TMDB/本番サイトへのアクセス0。main統合、push、PR、Vercel設定変更、deploy、有料契約、Actions実行/定期登録なし。
アプリ・api・prototype・package/lockfile・既存workflowは変更していない。
今回の数値は合成検証結果。実際の台帳件数・移管後増加・300件制限の稼働実績は未確認。

## 追加ファイル

- scripts/lib/operations-analysis.js: 注入transportだけを使う集計本体。
- scripts/operations-analysis.js: オフラインfixture再生、将来の別承認後にだけ使う対話TLS CLI。
- scripts/operations-daily.js: 保存済みスナップショットのJST日次JSON化と前日比較。ネットワークなし。
- tests/operations-analysis.test.js / tests/operations-daily.test.js: 合成検証。

### 既定モード

SELECT/TIME、INFO server/memory/clients/stats/commandstats/keyspace、検索registryのZCARD×2、control GET、当日attempts GET。
アプリコードを読み込まず、既存の環境変数・HTTP secret・Upstash fallback・fetchを利用しない。
読み取り以外のアプリDBコマンド、EVAL、更新API呼び出し、TMDB取得、統計リセットは禁止。未知のコマンドも拒否。
SELECTはこの接続の対象DBを選ぶだけでDBデータを変更しない。
INFOは選択した数値のみ保存し、接続先・run_id・生のINFO・エラー本文・controlの他項目を出力しない。
attemptsキー欠落は0と断定せず「未取得」。300というデフォルトを実設定に補わない。

### 任意の限定列挙

明示した場合のみSCAN MATCHで稼働release prefixを対象に、COUNT 128・最大8回・最大4096ユニークキー。
COUNTは返却件数/サーバー内部走査量の厳密な上限ではない。DB全体が大きければMATCHでも負荷があり、実行前に別途確認する。
カーソル0まで完了しなければ全台帳の総件数・増加数は未取得。上限を自動拡大しない。
control.status=readyを確認できない対象では列挙を行わず未取得にする。誤prefix/制御キー欠落を空台帳0件と誤認しない。
正本キーの完全一致パターンで分類し、:meta/lease/index/旧namespaceは除外する。
配信の既知キー最大16件だけをGETして、成功日時保有・未解決エラー保有の標本件数を返す。全体へ外挿しない。
シーズン件数はTV台帳のキー件数で、内包シーズン/エピソード数ではない。
検索registryは実装上extra候補を持ち得るため、ZCARDを正本総件数と断定しない。

### 増加の厳密な意味

基準はkind=completed-aiven-restore、complete=true、同じprefix/DB、過去の日時、evidence参照、重複しない完全なキー一覧を持つ秘匿済みJSON。
これは人が実復元結果との対応をレビューしたことを前提とする入力契約であり、暗号署名や実復元の自動認証ではない。
模擬復元/rehearsal、対象不一致、将来日時、重複キーは増加根拠に採用しない。
基準自体がなければbaseline/netIncrease/newSurvivingはvalue:null、理由「未確認」。
完全に列挙できた場合のみ、現在正本件数−基準正本件数をnetIncreaseとして計算する。
newSurvivingは現在に存在して基準一覧にないキー数。登録後削除済みは含まない。同じキーの削除・再登録も分からない。
移管後の新規登録総回数、更新成功/失敗回数、失敗した未保存作品数は現在値から推計しない。
SCAN中の更新/自然失効は止めないため、採取区間の観測であり、同一瞬間の原子的snapshotや完全な変更履歴ではない。
削除/失効が疑われる場合や厳密な増加数が必要な場合、今回の結果を確定実績にせず履歴/整合snapshotの確認まで「未確認」とする。
3,020キーという過去のユーザー報告は模擬照合の記録であり、実移管完了基準には自動採用しない。

## 安全上限・接続方法（今回は未実行）

CLIは引数なしでは失敗し、オフライン以外は `--live-readonly` と対話確認 APPROVED-READONLY が必要。
この文字列はユーザー承認の代わりではなく誤操作防止。今回の作業ではlive実行は禁止。
将来実行前に、接続先、DB、物理release prefix、時間帯、SCANの有無、読取予算を承認する。
ホストは.aivencloud.comのTLS限定、証明書/ホスト検証必須、必要ならCA指定。再接続・再送・offline queue・client infoを無効化。
接続/各コマンド2秒、集計開始から90秒の送信予算、最大38コマンドの防御上限。通常経路は最大36。
サーバー時計とローカル時計が60秒超ずれたら停止。失敗は秘密を含まない固定文言。
パスワードは本人のローカルTTYで非表示入力。URI/argv/環境変数/.env/ログに書かない。アプリの資格情報を復号・抽出しない。
AUTHなどSDK handshakeは別途発生し、「DB総送信数が12/36」とは言わない。接続終了はdestroyでQUITを送らない。
単一応答256KiB、全応答1MiBを解析後に検査する。これは転送前の上限ではない。
特に配信GETは大きい値を転送してから拒否する可能性があるので、既知のrecordサイズと予算を事前確認する。
node-redisによる実TLS/実ACL/実データでの本ツール確認は未実施。合成transport検証と区別する。

将来、承認されたローカル端末で既存lockどおりのredis依存が導入済みであることを確認してから実行する例:

```sh
node scripts/operations-analysis.js --live-readonly
```

依存の導入・資格情報の設定・実接続は今回実施していない。
control.newWorkDailyLimitとJST当日acquisition:v1:attemptsを読むだけで、上限到達を発生させる実験はしない。
上限値300を読めても、全経路の拒否動作が正常である証明にはならない。取得成功イベント/上限拒否記録の別照合が必要。

## 1回のDBコマンド見積もり

|処理|回数|
|---|---:|
|SELECT + TIME|2|
|INFO 6セクション|6|
|検索registry ZCARD|2|
|control・当日attempts GET|2|
|任意SCAN|0〜8|
|任意配信標本GET|0〜16|
|既定合計|12|
|限定列挙込み合計|最大36|

基本モードのGETは2回、配信標本込み最大18回。大量全件GET/MGETはない。
SCANの返却キーはローカルで分類し、全作品JSONを取得しない。
RTT 100〜300msならDB待ちの目安は基本1.2〜3.6秒、最大3.6〜10.8秒＋接続/処理時間。実測ではない。
全コマンド2秒近くかかる場合は最大約72秒＋接続。失敗/ACL拒否で取得できない項目もある。

## 日次設計と現在の実装境界

本番から独立した非公開GitHubリポジトリに、YYYY/MM/YYYY-MM-DD.jsonを日次保存する。
本番Vercelと接続せず、build/deploy/Deploy Hookを含めない。今回リポジトリ作成・workflow追加はしていない。
スナップショットのdayはobservedAtをJST変換した採取日。前日比は同じ対象の連続日だけで計算する。
日次欠損・scope不一致は補間しない。絶対純増100超を要確認として表示する暫定ルール（自動停止/外部通知なし）。
保存は排他的な新規作成、既存日次を無断上書きしない。訂正版は承認後にrevision付き別記録を設計する。
正本は軽量JSON。xlsxは必要時だけ保存済みデータから生成し、Artifactの短期保存で配布する設計。Excel生成は未実装。
今回作成した日次formatterは既に秘匿化されたcollector出力だけを入力する。外部の生ログ/請求明細/秘密入りJSONを渡さない。

|指標|現在の実装/取得可能範囲|
|---|---|
|Aiven現在値|キー数（INFO全DB/DB別）、メモリ、接続、累積commandstats等|
|台帳総件数|限定列挙完了時の観測件数。それ以外は未取得|
|移管後増加|レビュー済み完全基準がある場合の純増・現存新規。厳密な登録総回数は未確認|
|前日差|連続日の同対象・両日取得済み項目だけ|
|新規作品取得|実dailyLimit、pause、当日試行数。成功・失敗は未取得|
|配信更新|最大16件の成功日時/エラー保有状況。更新イベント回数は未取得|
|人物pause環境変数|DBcontrolとは別。現ツールでVercel設定を読み出さない|
|Vercelアクセス/Functions|独立collectorは未実装。現出力は未取得|
|Vercel料金|独立collectorは未実装。請求タイムゾーン不一致の既知課題を解決してから追加|
|TMDB取得成功/失敗|既存履歴で取れる範囲だけを将来接続。現出力は未取得。再取得しない|

前日利用量カウンタ差はサーバー再起動/統計リセット/対象変更を検出する設計が別途必要。現在は累積原値を保存するのみ。
時刻境界のあるイベントはJST日付の[00:00,翌00:00)へ集計し、現在値の採取日と混ぜない。
Vercelメトリクスのschema取得済み・時系列クエリ400、請求期間の不一致は前回調査の未解決事項として引継ぐ。
権限/プラン不足なら未取得のままとし、Plus・Drains・有料監視を追加有効化しない。
短い保持期間の情報を日次1回で完全保存できるとは保証しない。頻度追加は別予算/承認で検討する。

保存CLI（オフライン、実DB接続なし）:

```sh
node scripts/operations-analysis.js --offline work/operations-analysis/input.json > work/operations-analysis/snapshot.json
node scripts/operations-daily.js work/operations-analysis/snapshot.json - work/operations-analysis/daily
```

2番目の引数 `-` は前日なし。前日JSONパスも指定可能。fixtureの例はローカルwork/内に合成データだけで生成済み。
将来Actionsからの無人接続には、対話CLIを回避して秘密をログへ置くのでなく、read-only IAM/Secret管理/ACLをレビューした専用adapterが必要。
対話live CLIがそのまま定期運用できるとは報告しない。

## 無料枠・API制限と予算

公式確認: https://docs.github.com/en/billing/reference/product-usage-included
非公開リポジトリの計算資源枠は契約・他利用と共有。現行文書は金額換算のincluded computeとして説明するため、古い「無料2000分」だけで判定しない。
Artifact容量はGitHub Freeで500MB等のプラン差。本人アカウントの残枠・請求禁止設定は今回は取得していない。開始前の必須条件。
公式API: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
GITHUB_TOKENは通常1リポジトリ1時間1000要求。二次制限もあるため、日次1commitに集約し429/残量を尊重する。
Vercel: https://vercel.com/docs/cli/metrics と https://vercel.com/docs/cli/usage
細かいmetricsにはPlus等の条件あり。API利用権限/保持期間/照会上限は実契約で事前確認し、未契約機能へ課金して進めない。

想定: 日次1回、1job 1〜2分なら月30〜60ランナー分＋手動Excel生成分（計画値）。料金は実プランの単価・残枠で換算する。
基本DB月360commands、任意列挙付き最大1080commands（30日、AUTH等別）。毎時化は今回は計画しない。
JSON 10〜50KiB/日なら年間約3.6〜18MiBの作業ツリー増分。Git履歴/修訂分は別。生データ・xlsxを毎日コミットしない。
既存Aivenの範囲で読み取りを行い、新サービスなし。CPU/ネットワーク/接続の負荷は0ではない。
Vercelへの追加アプリrequest・TMDB再取得0。Vercel管理API collector実装後の照会は日次5〜10件程度を上限案とし、pagination時は再見積もり。
契約残量が不足なら停止/未取得を選び、追加購入/自動課金へ移行しない。現時点で実運用の追加0円を保証するものではない。

## ローカル検証

```sh
node --test tests/operations-analysis.test.js tests/operations-daily.test.js
```

14 tests / 14 pass / 0 fail / 0 skip。JST境界、欠損と0の区別、限定列挙8回停止、meta除外、16標本、36command上限、基準不一致/模擬/将来/重複拒否、ACLエラー秘匿、誤DB即停止、制御キー欠落時の列挙禁止、timeout無再送、日次gap/対象不一致、排他的保存を検証。
オフラインCLI→日次JSON保存→読戻しも成功。node --check、git diff --check成功。
実Redis/実Aiven/TLS/Windows実機/本番データ/Actions/Excelは未検証。既存アプリの回帰結果を今回のテスト結果として加算しない。

## 次に承認が必要な項目

1. 実Aivenの接続先・DB・prefix・読取アカウントと実行時間帯、基本12commandsの実行。
2. 必要なら最大8SCAN＋16標本GETの追加予算（完了しない場合は上限拡大せず報告）。
3. 実移管完了result/manifestから秘匿済み基準を作り、実サービス/時点との対応を所有者が確認。
4. 非公開運用repoの作成・Secrets/ACL・Actions残枠・課金禁止方針・手動実行による導入確認。
5. Vercel/TMDBの既存情報を読むcollectorとExcel出力の追加実装・ローカル検証。アプリ計測追加は今回対象外。
6. 日次scheduleの開始、頻度、保存期間。今回scheduleは一切登録していない。

設計とローカル検証で停止。実接続/本番反映/定期運用は次の指示まで行わない。
