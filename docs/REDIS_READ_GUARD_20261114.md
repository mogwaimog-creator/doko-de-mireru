# 保存済み表示のRedisガード削減（2026-11-14）

本書は初回ローカル検証時点の記録です。その後の承認・main統合・本番反映の実績と未完了の確認事項は [CODEX_HANDOFF.md](CODEX_HANDOFF.md) を参照してください。

ブランチ: `test/redis-read-guard-20261114`
開始点: 最新mainをfetchした `de03bd5775328b09de8ff796c3425513e00f8b4c`。
ローカルのみ。push、PR作成、main統合、Vercelデプロイは未実施。

## 実装

- `_cutover-runtime-dev.js`: 読み取り時はcontrolのGETで停止状態を確認。最初の書き込み直前に従来のenterを実行し、実際に取得したticketだけをfinallyでfinishする。並列の書き込み要求は同じPromiseで登録を共有する。読み取り後に停止されてもenterで再確認される。
- `_release-application.js`: 通常のRedis読み取りと監査済みの検索・SEO読み取りLuaはticket登録を省略。それ以外のコマンドと外部取得には登録を必須とする。`fixed` / `detail`を直接呼ぶ既存の作業スクリプトにも同じ境界を適用。
- `_release-connection.js`: preflightを挟んでも元の認証済みtransportの所属と監視を維持するラッパーを追加。
- `tests/lazy-request-guard.test.js`: 停止競合、並列登録、エラー時解放、制御情報欠落・破損、登録と保存済み読み取りを検証。
- `tests/paused-ledger-reads.test.js`: 操作数の期待値更新、最新mainとの比較、満杯のwriter枠での保存済み表示を追加。
- `.github/workflows/paused-ledger-reads.yml`: 追加テストと変更ファイルを既存の隔離Redis検証対象へ追加。デプロイ処理は追加していない。

作品・配信台帳のスキーマ、TTL、24時間更新判定、朝6時のシリーズ更新、SEO内容は変更していない。

## 最新mainとの比較

同一の合成データ・同一リクエストを変更前後のapplicationへ渡し、HTTPステータス・レスポンスの一致も確認した。

|処理|送信コマンド 前→後|Lua内を含むローカル実行数 前→後|
|---|---:|---:|
|保存済み作品のwork-detail|3→2|7→2|
|新鮮な配信情報つき詳細|4→3|8→3|
|保存済みSEO HTML|5→4|10→5|
|保存済み作品検索|6→5|17→12|
|取得停止中の未登録作品|3→2|7→2|
|取得停止中の未登録SEO|4→3|9→4|
|シリーズ配信情報|3→2|7→2|

純粋な読み取りでは `EVAL(enter)` と `HDEL(finish)` を取り除き、controlのGETを1件残す。送信コマンドは1件削減、空のactive台帳でLua内部も数えると5件削減。activeに古いticketがある場合は従来の掃除処理回数も異なるため固定値ではない。

実際に配信更新する要求は事前GET分が1件増える（今回のfixtureでは成功7→8、失敗8→9）。毎朝6時の266作品更新も290→291件。更新時のロック、quota、ticket、fencing、失敗cooldownは残す。

計測はローカルRedis 7.2.7のcommandstatsを用い、計測用INFOとredis-cliのHELLO/CLIENTを除外した。Upstashの課金COMMANDSの実測値ではない。旧履歴との既存比較は別に維持し、今回の効果判定は最新mainとの比較を使う。

## 検証

主要な回帰テスト19ファイル、75件成功・失敗0・skip 0。保存済み表示、新規登録、人物・シーズン更新、24時間の直前/境界、取得失敗時の既存データ保持、停止競合、writer容量、13シリーズ266作品の6時更新、SEO、検索indexを検証した。追加の操作数計測8件も成功。

実行例（REDIS_TEST_CLIはローカルのredis-cliを指定）:

```sh
LOCAL_COMMAND_STATS=1 REDIS_TEST_CLI=/path/to/redis-cli node --test tests/paused-ledger-reads.test.js
REDIS_TEST_CLI=/path/to/redis-cli node --test tests/lazy-request-guard.test.js
```

Upstash実データへの接続、削除、初期化は実施していない。TMDB応答はモック/合成データ。テスト用Redisは127.0.0.1:16379のみ。実Redisを使う追加テストもランダムな隔離namespaceで動作する。

既存の `acquisition-guard.test.js` 9件と `new-work-ingest.test.js` 6件は、変更前mainでも同じ失敗を確認した。前者は現行にない `guardModule.initial` を要求し、後者は旧予約方式・初期controlの前提が現行実装と一致しない。今回この旧仕様テストは書き換えず、成功件数にも含めていない。現在の仕様はacquisition-recovery、acquisition-source-integrationと実transport経由の登録テストで確認した。

## 残るリスクと反映条件

- 本番Upstashの請求数・実トラフィックでの削減率は未測定。
- 書き込みを伴う要求にはcontrol GETが1件増える。
- 監査済み読み取りLuaの内容が将来変わる場合は、読み取り専用であることを再確認する必要がある。未確認の新規コマンド/スクリプトはガード対象となる。
- 取得停止中の未登録作品は繰り返してもGETだけだが、取得を許可した未登録作品は既存のロック・quota・失敗制御の対象となる。新たなnegative cacheは導入していない。
- 読み取り要求はactive台帳へ載らない。backup/drainは書き込み処理の終了を待つ。純粋な読み取りの完了は待たない。
- 旧仕様テスト15件の整理は未実施。

mainへの統合および本番反映は、ユーザー確認後に別途実施する。本作業では本番デプロイしない。
