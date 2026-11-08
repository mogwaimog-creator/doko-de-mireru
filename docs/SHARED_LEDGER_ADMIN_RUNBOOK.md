# 共通台帳・隔離環境の管理手順

開発専用。実Upstash・本番Vercel・本番Redisで実行する手順ではありません。使用するRedisはヘルパーの `127.0.0.1:16379` 固定です。production環境ではCLIが停止します。

## 起動準備とファイル

リポジトリ直下で実行します。

```sh
export DEV_ISOLATED_ADMIN=1
export REDIS_TEST_CLI=/workspace/work/redis-bin/redis-7.2.6/src/redis-cli
node scripts/ledger-admin-dev.js health
node scripts/ledger-admin-dev.js alerts
```

`health` は当日7時JST以降に正常完了がない、または共有停止中なら終了コード2を返します。7時は隔離用の暫定監視値です。通知はローカル通知箱だけで、外部送信はしません。

要求・確認計画・バックアップのJSONは、リポジトリの親の `ledger-admin-artifacts/` に置きます。この環境では `/workspace/work/ledger-admin-artifacts/`。ディレクトリ0700、CLIが作るファイルは0600、既存ファイルを上書きしません。ファイル名は英小文字・数字・ハイフンと `.json` のみ。認証情報を入れたりGitへ追加したりしないでください。

キー一覧要求の形式（IDは専用の試験データに置換）：

```json
{
  "keys": [
    "doko:dev:work:v2:movie:900000001",
    "doko:dev:seo:v1:movie:900000001",
    "doko:dev:person:v2:900000001",
    "doko:dev:season:v1:tv:900000001",
    "doko:dev:shared-stream:v1:record:movie:900000001"
  ],
  "reason": "隔離試験データと保存結果を確認"
}
```

存在しない本体キーを指定したバックアップは失敗します。未作成の`:meta`は保存対象に加えません。対象一覧は利用者が確認し、未知の台帳全件が網羅されていると推定しないでください。

## 状態確認・停止・再開

```sh
node scripts/ledger-admin-dev.js inspect request.json
node scripts/ledger-admin-dev.js pause '隔離環境の保守確認'
node scripts/ledger-admin-dev.js plan-resume request.json review-001.json
```

`inspect` は本体とメタ情報を読み、版番号、エラー、確認済み状態、項目ロック、保存値のハッシュを表示します。最大256キー（自動追加メタを含む）。

停止後も既に取得中のワーカーは終了処理に入ることがあります。バックアップや再開計画は、leaseが残る場合に強行しないでください。正常終了または期限切れを待ち、保存結果を確認します。停止理由の対象キーは再開計画に自動追加され、任意の別作品だけを確認して対象を省略できません。

計画作成はMSETを含む短命の疎通検査、本体/版番号の観測、未解決エラー・作品/SEOの一致確認を行います。`review-001.json` を確認し、欠損・保存結果不明・未解決エラーがあれば修復/再確認を先に行います。原因が本当に解消したかという管理者判断を、機械的な疎通検査で代用しません。

確認後だけ適用します。

```sh
node scripts/ledger-admin-dev.js resume review-001.json --reviewed
node scripts/ledger-admin-dev.js health
```

計画は5分で失効します（暫定値）。計画後の停止状態、本体、メタ情報の変更やアクティブleaseがあれば適用を拒否します。再開後の新しい障害は再び停止できます。監査は新規領域の最大20スロット・14日TTLという隔離暫定設定。停止フラグ自体は自動失効しません。

保存/疎通障害で通知・停止状態自体を書けないときは、終了コード/HTTP 503/ログを使って停止として扱います。応答が失われた場合は、保存されていないと決めつけず再確認します。コントロールJSONの破損や索引の型破損は、通常の解除だけで直るとは扱いません。

## 手動確認・項目ロック

`edit.json` 例：

```json
{
  "type": "movie",
  "id": 900000001,
  "revision": 1,
  "patch": {"title": "隔離試験で確認した題名"},
  "lockedFields": ["title"],
  "confirm": true,
  "reason": "保存済み試験資料と照合"
}
```

```sh
node scripts/ledger-admin-dev.js inspect request.json
node scripts/ledger-admin-dev.js edit-work edit.json
```

`revision` は直前の確認結果を使います。古い版、未解決エラーを残す確認、許可していない項目を拒否します。作品・SEO・索引を更新し、ページ固有欄を保持します。ロックや確認状態を省略した場合は既存状態を保持します。解除する場合は明示的な値と理由が必要です。今回の確認は試験データ用であり、最新実データの確認済み認定ではありません。

## 索引の初期補完・再反映

新しい保存/更新は自動反映します。以前の直書きで保存された作品・人物には、既存本体を変更しない索引補完を使います。

```sh
node scripts/ledger-admin-dev.js pause '索引初期補完'
node scripts/ledger-admin-dev.js reindex reindex-request.json
```

要求は `{"keys":[作品/人物の本体キー],"activate":false}`。1回最大10,000キー。`activate:true`でv2検索を有効にする場合、旧検索カタログの既知全件を含むことを要求します。部分的に補完して検索全件が移行済みとは扱いません。直接SETする旧ライターが残れば新しい名前が索引に反映されないため、切替前のライター統一が必要です。

検索APIの最初の応答に`nextCursor`がある場合は、同じ検索語・種別で次回に渡します。深いページはページ番号だけで読み進めません。最大512候補や読取量の上限で区切る場合、続きがある0件応答を最終0件と扱わないでください。通常作品画面はこの継続操作に対応しています。

## バックアップ・別領域への復元

```sh
node scripts/ledger-admin-dev.js pause 'バックアップ取得'
node scripts/ledger-admin-dev.js backup request.json backup-001.json
node scripts/ledger-admin-dev.js restore backup-001.json doko:dev:restore:review-001:
```

本体最大5,000キー、メタを含め最大10,000キー、JSON最大16MiB。共有停止を要求し、日次実行/対象leaseが残る場合は拒否、読み取り後も値の変化を検査します。バックアップにはキー・値・SHA256・絶対失効時刻を保存します。SHA256は破損検出用で、第三者の認証署名ではありません。

復元は新しい `doko:dev:restore:...:` のみ。既存先は拒否します。全体検証前は`incomplete`、全件照合後だけ`verified`です。元の台帳は上書き/削除しません。失効時刻を延長しません。失敗した領域も自動削除しません。新索引は派生データなので、原本の台帳・メタの復元後に再作成/確認する運用です。

復元確認後も、元データの継続更新を再開するには上記の確認計画と`--reviewed`を使います。バックアップが失敗した場合に自動で停止解除はしません。新しい復元領域は容量を追加消費します。次の復元前に必要容量を確認し、既存領域の削除は今回の手順に含めません。

この作業環境での全既知データの再現用スクリプトは `scripts/rehearse-ledger-operations-dev.js`。専用フラグが必要で、既に別の停止がある場合は拒否します。バックアップは作業環境内のファイルであり、利用者のPCへ持ち出したバックアップではありません。

## 起動・監視との接続

既存 `/api/update-streaming` のGET/Bearer認証を維持しています。`DEV_SHARED_CRON_ENABLED=1`かつproduction以外の場合だけ、ローカルRedis・固定試験配信のアダプターへ接続します。本番設定は変更していません。

ローカルワーカーは既存 `scripts/run-ledger-worker-dev.js` を使い、共通停止・監視・通知箱に接続しました。失敗/停止は終了コード2。通知箱は最大16スロットで重複を抑制します。`health`はポーリング用です。起動されなかった障害を自動検知するには、この健康確認を定期的に呼ぶ外部運用が別途必要です。

クラウドの新しいスケジューラー/通知サービス、メール/Slack送信、GitHub Actions起動やVercel設定変更は行っていません。実プランと費用を確認し、別途承認された範囲で接続します。14日などの全暫定値は本番未確定です。
