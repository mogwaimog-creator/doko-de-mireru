# Issue #19 本番接続手順（未実行）

2026-11-10追記：既存13シリーズの固定情報はHTMLを維持し、共通作品台帳から表示・上書きしない。13シリーズAPIは共通配信情報だけを返す。以下の266作品の固定情報投入は13ページ維持の必須条件ではなく、一般詳細・SEO等で必要な場合の準備手段。配信266作品の朝6時日次更新は維持する。今後新規制作するページは原則として共通作品台帳・共通配信台帳の両方を利用する。旧全件走査・全件書換え・個別整理削除・全件復元は必須条件にしない。

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

## 2026-11-10 実行記録（1ead98bから続行、既存手順は変更しない）

- Vercel連携で実プロジェクト `doko-de-mireru` と現在の公開先を読み取り確認した。公開中は `dpl_8LQ7HUHX1WXzg8Uaa8d3YAyoSY4b`、公開コミットは `332843235960714d38abcc1c0590ed1f834ed6ca`。`latestDeployment` のCANCELED表示は別のデプロイなので、公開中の対象と混同しない。
- 接続済みUpstash `upstash-kv-rose-saddle` はFree、Auto Upgrade=false、usageQuotaExceeded=false。追加契約・自動アップグレード・設定変更はしていない。残量は利用者の今回の確認値を採用し、スクリーンショットの再提出は求めない。
- 既存 `KV_REST_API_URL`、`KV_REST_API_TOKEN`、`TMDB_API_KEY`、`CRON_SECRET` の本番登録を確認した。ただし非公開Secretのため連携APIから値は取得できず、作業環境にも値はない。登録済みと実行可能は区別する。Secretを公開Configへ変更したり、再発行したりしない。
- 既存スクリプトで、通信しない最小試験計画と現行入力要件ファイルを実際に生成した。作業環境内の非公開ディレクトリーに予算確認ファイル・次の実行コマンド・試験専用の名前空間識別子・新管理者用の秘密文字列を用意した（0700/0600、Git対象外）。この識別子は本番投入パッケージのSHAには使わない。人工データの本番投入ファイルは作っていない。
- 次の準備の上限は、最小互換性試験14 Commands＋対象作品キーの限定保全68 Commands＝82 Commands。利用者確認の残り約170,000から82を予約しても約169,918残る。実Redis消費は現在0。既存の20%安全余裕・運用予算を別に確保し、初期投入の本数・実容量は実データ取得後に算定する。
- Vercel料金APIは期間全体の応答がサイズ上限を超えた。1日窓の読取には成功したが月間残額と同義ではないため、合算・残額の断定はしていない。利用者確認の$13.87／残り$6.13を採用し、ビルド・デプロイは0回。
- 実Upstash試験・本番手動情報の保全・実TMDB取得は、接続値がないため未実行。完了済みのローカル検証・13シリーズ修正は再実行していない。

**次の1行動**：この作業の実行環境のSecretsへ、既存UpstashのREST URLを `LEDGER_RELEASE_REDIS_URL`、REST Tokenを `LEDGER_RELEASE_REDIS_TOKEN`、既存TMDBキーを `TMDB_API_KEY` として登録する。チャット・GitHubへ値を貼らない。本番Vercelの設定変更はこの段階では不要。

接続後は保存済み手順の最小試験→限定保全→必要データだけの実投入準備を続行する。予算ファイルの1時間期限が切れたら、利用者の確認値と利用可能な機械的情報を出典付きで更新する。値が取得できないのに本番消費を実測したことにはしない。

### 承認を求める予定の最初のサービス影響操作（今は実行しない）

対象は上記プロジェクトの旧Cronと旧公開デプロイ。旧Cronを無効化し、訪問者経由の旧書込みを止める必要がある場合はVercelのProject pauseを併用する。後者はサイトを一時利用できなくするため、接続・保全・投入準備が揃ってから、対象と停止時間見込みを示して承認を得る。これらの制御操作自体のRedis Commandsは0、ビルド0。停止直前の終了確認・保全読取68 Commandsは別に必要。旧実行中リクエストの終了を確認できなければデータ入れ替えへ進まない。

旧データをまだ削除していない段階の中止は、旧公開デプロイのunpauseと旧Cron再有効化で戻す。削除・初期化後は旧デプロイへ戻すだけでは復旧しないため、別途承認する入れ替え操作には、PCで保全した固有情報と新投入ファイルを使う新台帳への再投入・再開手順を付ける。旧全件復元は条件にしない。main変更・本番公開・本番データ削除／初期化・環境変数変更も、その実行前に別途承認を求める。

機密値を含まない実行記録：`docs/ISSUE_19_RELEASE_EXECUTION_20261110.json`。
