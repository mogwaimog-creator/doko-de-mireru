# 共通台帳・開発移行契約（2026-11-09）

> 更新注記：この文書の初版は2b3a0c9時点の契約です。鮮度選択・凍結制御・最適化された保存・dev更新/content接続の最新状態は [修正報告](SHARED_LEDGER_REPAIR_REPORT_20261109.md) を参照してください。

本番移行完了を表す文書ではない。対象ブランチは `work/four-ledgers-20261107`。

## 既存経路と隔離経路

| 分野 | 既存キー／契約 | 今回の扱い |
|---|---|---|
| 作品 | `doko:work:v1:<movie|tv>:<id>`。v2スキーマの試作も存在 | 既存キーを変更しない。`commonNotes` / `extensions` の保存欠落を修正。確認ロック・手動欄は既存試作を再利用・試験 |
| 共有配信 | `doko:watch:v3:<movie|tv>:<id>` | 鬼滅・比較表の既存経路。削除・書き込みなし |
| 詳細配信 | `doko:detail-providers:v1:<movie|tv>:<id>` | 旧詳細キャッシュ。新台帳とは区別し、既存コードを変更しない |
| 新共有配信（開発のみ） | `doko:dev:shared-stream:v1:record:<movie|tv>:<id>`、同 `lock:` | 専用のloopback接続、原子的CAS・リースを実装 |
| 人物 | `doko:person:v1:<id>` / `doko:person:v2:<id>` | 既存フラグ・既存API維持。実データ移行未実施 |
| シーズン | `doko:season:v1:tv:<id>:<season>` | 映画キーと混同しない。既存フラグ・既存API維持 |
| SEO | 試作オブジェクトの `movie:ID` / `tv:ID` | 本番Redis名前空間・本番SSR接続は未確定。ローカル初期HTMLで検証 |

`data/watch-order-memberships.json` は既存 `api/series-watch.js` の13シリーズの配列を抽出した開発用の所属情報。ページ固有紹介・順番・ポスター・タブはこの表で上書きしない。API配列との二重管理は今後解消が必要。

## 新配信レコード

- `schemaVersion: 1`、`revision: 1以上`。映画/TV複合IDをキーと本文で照合。
- `japan.flatrate / rent / buy`。日本だけを保存し、各配信区分内でprovider IDを重複排除。
- `lastSuccessAt / nextEligibleAt / lastAttemptAt / lastSeriesRunDay / errors`。
- 最終成功がnullなら未取得・取得失敗。成功済みの空配列と区別する。
- `coverage` のない通常レコードは3区分を正常取得した記録。過去の比較表コピーは `coverage:['flatrate']` と出典・日付精度を明記する。これを詳細ページのrent/buyなしの根拠にはしない。
- 日単位しか分からない過去情報は元の日付を保持する。現在日時で新鮮な取得に見せかけない。
- 未解決エラーや24時間経過はwatch互換値の`stale:true`。関連カードの一括情報からは除外する。未取得もキー省略。正常0件のみ空配列を渡す。

## 更新と保存

- 見る順番所属：visitでは取得しない。JST06:00以降、日次試行日が当日でない場合だけcron対象。
- 一般作品：初回／最終成功24時間経過後のvisit。失敗後30分待機はユーザー承認を得た隔離試験の暫定設定。本番の決定ではない。
- 日次取得失敗でも試行日を保存し、その日の再実行を抑制する。Redisへの失敗記録自体が保存できなかった場合の再実行上限は追加設計が必要。
- SET NX PXで所有トークンを取得。Luaで所有権、残存TTL、期待revisionを確認してから完全なJSONを保存。解除も所有トークンをLua内で比較する。
- Luaのcjsonで空配列がオブジェクトに変換されるため、保存JSONはNode.jsで生成し、Redis側で再エンコードしない。
- 保存失敗／保存前読み取り失敗をTMDB取得失敗と分け、監視結果へ記録する。

## 段階接続と安全境界

- `SHARED_STREAMING_READ_ENABLED=1` のときだけmovie/TV詳細・関連カード・series-watchの新読み取りを使う。
- `VERCEL_ENV=production` または `NODE_ENV=production` なら必ず無効。
- `SHARED_LEDGER_DEV_URL` はHTTPのloopback限定。既定は `http://127.0.0.1:16380`。既存Redis資格情報は参照しない。
- 全件新台帳ヒットならseries-watchは新台帳MGETだけ。未登録・障害なら必要な作品を旧経路から読み取る。旧経路の書き込み・リフレッシュは追加しない。
- フラグを無効化すれば旧API経路へ戻る。既存の本番Cron、main、Vercel設定は変更しない。
- 更新サービスのvisit/cronは隔離Redisで試験済みだが、公開APIの更新トリガーと本番Cronには未接続。公開経路が完成したとの扱いは禁止。

## 再現

ローカルRedisを `127.0.0.1:16379` に、永続化なしで起動する。外部Redisは使わない。

```sh
REDIS_TEST_CLI=/path/to/local/redis-cli node --test tests/shared*.test.js tests/streaming*.test.js tests/work-ledger-foundation.test.js
node scripts/audit-shared-ledgers.js
REDIS_TEST_CLI=/path/to/local/redis-cli node scripts/measure-shared-ledger-capacity.js
REDIS_TEST_CLI=/path/to/local/redis-cli node scripts/shared-ledger-preview.js
# 別端末。PlaywrightとChromiumが必要。外部通信は遮断する。
node scripts/verify-shared-ledger-preview.js
```

プレビューはfixtureである。実作品名・IDと架空の配信情報を使う。`api/_redis.js` はプロセス内で読み取り専用fixtureへ差し替え、TMDB呼び出しもfixture応答にする。本番にこのプレビューサーバーを公開しない。

最新の継続実装・隔離検証は [SHARED_LEDGER_COMPLETION_REPORT.md](SHARED_LEDGER_COMPLETION_REPORT.md) を参照。production無効・旧データ保持・本番承認待ちの条件は継続。
