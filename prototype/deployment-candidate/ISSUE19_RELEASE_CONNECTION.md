# Issue #19 本番接続手順（未実行）

最終承認前に削除・初期化・main反映・公開を実行しない。対象は `work/four-ledgers-20261107`。全件旧復旧は不要。

## 接続の条件

新デプロイに設定する値（今回設定していない）：

|名前|内容|
|---|---|
|`LEDGER_RELEASE_MODE`|`new`：新台帳。`paused`：公開経路を停止し、管理者の確認・停止だけを許す。未設定／`legacy`は旧動作|
|`LEDGER_RELEASE_SHA256`|確認済み実投入ファイルのSHA256。人工データの値は使わない|
|`LEDGER_RELEASE_READY_SHA256`|実照合済みで公開するファイルと同じSHA256。これだけで公開承認にはならない|
|`LEDGER_RELEASE_REDIS_URL`／`LEDGER_RELEASE_REDIS_TOKEN`|確認した既存UpstashのHTTPS接続先とトークン。旧KV設定への自動フォールバックなし|
|`TMDB_API_KEY`|既存の無料利用を確認したキー|
|`LEDGER_ADMIN_TOKEN`／`CRON_SECRET`|各32文字以上の別々の十分ランダムな秘密文字列|
|`LEDGER_UPSTREAM_DAILY_LIMIT`|シリーズ日次266件以外のTMDB取得試行の1日上限。1〜10,000。利用量確認で決める。失敗も計上|

各Function実行ごとに上限付き接続を作り、論理キーを `doko:ledger:release:<SHA先頭16字>:` に変換する。Luaも登録済みのものだけを許す。旧キー、全件走査、初期化命令は許可しない。起動時に制御情報がない場合は公開APIから保存を開始しない。

`vercel.json` の開発変更は `/detail.html` → `/api/detail-page` の初期HTML接続と、日次処理の実行時間上限。Cronは従来の日本時間6時の1本だけ。開発ブランチの自動公開無効設定を維持。未設定時の詳細HTMLは従来テンプレートを返す。

## 承認前に可能なPC作業

実接続する前に最新のFree表示・課金停止動作・容量／通信／Commands残量を確認する。秘密値はPCまたは実行環境の秘密設定へ入れ、GitHub／チャットへ貼らない。

非公開の予算確認JSONの例（実際に画面で確認した日時と値を使う。下記値のまま実行しない）：

```json
{"confirmedAt":"確認した日時","freePlanConfirmed":true,"additionalChargesDisabledConfirmed":true,"remainingCommands":0,"remainingBytes":0,"storageHeadroomBytes":0}
```

確認から1時間以内、残Commands200以上・通信／容量各1MB以上を要求する。これは小さな試験用の最低条件であり、移行予算の承認条件ではない。

```bash
# 通信しない実行計画だけを表示
node scripts/probe-issue19-upstash-minimal.js

# 接続・無料枠確認後だけ：1通信、最大14 Commands、専用キー5個は60秒で失効
node scripts/probe-issue19-upstash-minimal.js --execute --budget /PRIVATE/budget.json

# 既存266作品キーだけを2回読む。68 Commands、旧書き込み0
node scripts/capture-issue19-protected-manual.js --inspection-only --budget /PRIVATE/budget.json --out /PRIVATE/first

# 出力された非公開JSONからPC確認画面を作る
node scripts/prepare-issue19-cutover.js review-page /PRIVATE/first/protected-manual-TIMESTAMP.json /PRIVATE/review

# 確認画面から保存した判断結果を照合
node scripts/prepare-issue19-cutover.js review /PRIVATE/first/protected-manual-TIMESTAMP.json /PRIVATE/manual-decisions.json /PRIVATE/reviewed

# 実TMDBの266作品データ＋判断済み手動情報からファイルを作る
node scripts/prepare-issue19-cutover.js build /PRIVATE/real-packets.json /PRIVATE/reviewed/reviewed-manual.json /PRIVATE/seed
node scripts/plan-issue19-cutover.js /PRIVATE/seed/seed-package.json
```

入力の実データ形式・対象IDは `node scripts/prepare-issue19-cutover.js requirements` で取得。`tmdb-source-candidate.js` は明示的に無料利用を確認した既存キー・取得関数を渡した場合だけ動く。必要な固定情報266回＋日本配信情報266回が初回の上限目安。一般／人物の過去全データや旧配信キャッシュは移さない。

確認画面は通信不要。管理されたChromeでローカルファイルが開けない場合はPCのブラウザーで開く。試験では生成HTMLをネット通信なしでブラウザー実行し、判断結果のダウンロードと元の照合番号との一致を確認した。

## 最終承認後だけの切替順

1. 最新利用量・月間リセット・実容量・実通信とビルド費用を再確認。未知／予算超過なら停止。
2. 既存Cronと旧訪問者の保存処理を停止。旧デプロイのリクエストも終了するまで待つ。無期限の待機ではなく、停止できなければ実施を中断する。
3. `--writers-stopped` で手動保全を再取得。初回と変わればパッケージを作り直し、再確認する。
4. ここで初めて、別途承認された入れ替え操作を実施。本資料は削除コマンドを自動実行しない。空き容量が実際に戻ったことを確認し、新領域の制御情報を停止状態で作る。
5. `installCandidate` に実パッケージ、停止後照合、明示的実行条件を渡す。同じファイルの部分再開を許し、別内容／既存差分があれば停止。全件照合完了前は公開しない。
6. PC側の管理者経路で確認付き再開を行い、新領域を準備済み状態にする（公開はまだしない）。新方式の初回配信取得・13シリーズ・手動情報・初期SEOを照合。初回取得が未完なら未確認のまま公開完了扱いにしない。
7. 確認済みの同じSHA・接続情報で本番公開を1回行う。旧データを書き戻す旧デプロイへの単純ロールバックを行わない。
8. `/api/ledger-control` を管理画面 `ledger-operations.html` から認証して確認。新領域の稼働状態を確認し、13ページ・比較表・一般詳細・JavaScriptなしの初期HTML・検索を確認する。Cronを明示的に再開し、翌朝6時の結果を確認する。

## 停止・監視・再開

- 新規取得だけ止める：管理画面で上限0／取得停止。保存済み表示は維持。
- 保存障害や不整合：管理画面で共有停止。状態・未終了処理・ロック・最終成功を確認。失敗データを自動削除しない。
- 再開：原因と対象作品／SEOを確認し `prepare-resume` → 内容照合 → `resume`。内容が変わった／未終了処理が残ると拒否する。クラッシュした処理の記録は自動失効させず、実際に終了した確認が必要。
- 日次処理が途中停止：原因を除き、同じ認証済み `/api/update-streaming` を再実行。同日完了作品は再取得しない。未確認のまま毎分再試行するCronを追加しない。
- 管理画面の最終成功・停止状態、`/api/streaming-status`、既存Vercel Cron履歴で監視する。外部通知先への接続・実配信は未確認。14日の一時記録保持は本番確定値にしない。

現在の公開障害と予算は [最新報告](../../docs/ISSUE_19_RELEASE_READINESS_20261109.md) を参照。
