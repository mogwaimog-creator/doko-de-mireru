# Windows PC経由のRDB復元・全件照合計画

状態: 手順準備のみ。実RDB未入手・未検証、実Aiven復元未実施。Windowsからの疎通成功はユーザー報告であり、復元互換性や容量の証明ではありません。この文書は実行承認ではありません。旧Upstashへ接続する手順・自動migration wizardは使いません。

## 実測値と容量判定

2026-11-14にユーザーから報告されたWindows PC → Aiven Freeの結果:

|項目|結果|
|---|---:|
|status / TLS / commands|PASS / true / 5|
|version|9.1.3|
|used_memory|5,174,912 bytes（約4.94MiB）|
|maxmemory|312,475,648 bytes（298MiB、約312.48MB）|
|connected_clients|4|

この時点で接続・証明書検証が成功したという証拠です。パスワード、endpoint、INFO全文は記録しません。書込/旧Upstashアクセス/本番変更なしとの報告を受領しました。こちらから再接続はしていません。

**以前の「約193MBのRDB」と298MiBのmaxmemoryだけでは収容可能と判定できません。** 以前のファイル自体・正確なバイト数・取得時点・SHA-256が未確認です。193MBが十進なら約184MiB、193MiBなら約202MBです。どちらでもRDBは圧縮/エンコードされた直列化データであり、ロード後のオブジェクト、辞書、検索index、allocator等のメモリとは別物です。Redis 7とValkey 9の内部形式差もあります。疎通時の約5MBを差し引いた残量も、復元可能なRDBサイズではありません。

今回の合成Redis7.2.7試験では、RDB 25,876 bytesに対しdataset約2,232,696 bytes、used_memory約3,193,256 bytesでした。これは圧縮サイズによる判断が危険という反例で、実データの倍率予測ではありません。別の合成復元試験はnoeviction下で64キーのうち10キー復元後にOOMとなり、既存/復元済みキーは保持、evictionは0でした。OOMが出ても自動rollbackはなく、不完全なDBが残ります。eviction有効ならOOMなしに古いキーが追い出される可能性があり、全キー照合が必要です。

実データについての現在の結論は **容量未判定・復元不可（保留）** です。298MiBでは足りない可能性を排除できません。過去の「FreeのRAM1GB/maxmemory50%」という資料上の推定より、今回の実測maxmemoryを優先します。計画/契約変更による現値の変動も再確認が必要です。

## 取得前の条件（現時点では実行しない）

- Upstash側のexport料金/command計上/無料可否、全writer停止・drain、取得時点の整合性と対象DB/機能範囲を別途確認・承認する。最新RDBが届いても取得時点以後の書込との差分を解決するまで切替用と扱わない。
- provider exportはFunctions/Search module等を除外する場合がある。全物理キーの独立した件数証拠、DB一覧、除外機能、export完了状態が必要。RDB内全件一致だけでは、exportから漏れた元DBデータの完全性は証明できない。欠落はindex再生成や旧Upstashの無断SCANで埋めない。
- Aivenへの実書込は別承認。空の専用移行先、DB/コマンド/データ型互換、実maxmemory-policy、永続化/復旧策、残容量を確認する。本番や既存targetへ上書きしない。noevictionが確認できない場合は進めない。勝手な設定変更や有料アップグレードはしない。

## Windowsで受領・保管する手順（RDB取得後の別承認作業）

1. 個人PCの暗号化されたドライブ（BitLocker等）にアクセス制限した専用フォルダーを作る。OneDrive等の同期フォルダー、Git checkout、共有ドライブへ置かない。RDB・manifest・archive/proofはすべて秘密データとして扱う。
2. 所有者が承認済みprovider手段で取得したRDBを置く。元ファイルは保存し、作業用コピーだけ使う。外部サイトへuploadしない。ダウンロードURL/署名tokenをログやチャットへ貼らない。
3. PowerShellでローカルの正確なサイズとhashを記録する（値に実レコードは含まれないがファイルパスの共有は避ける）。

```powershell
Get-Item -LiteralPath 'C:\PrivateMigration\source.rdb' | Select-Object Length
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\PrivateMigration\source.rdb'
```

4. Windows版の非公式Redis binaryは使わない。WSL2/Docker Desktopの利用可否・費用条件を確認し、信頼できるValkey 9.1.3の公式build/imageをバージョンとdigestで固定する。これはまだセットアップ/実行未検証。ダイジェストを推測したコマンドを実行しない。RDB formatが非対応なら検証を緩めず停止する。
5. 外部通信を禁止した専用Linux sandbox内に作業コピーを読み込む。Redis/ValkeyはTCPを無効（port 0）、private Unix socketだけ、appendonly no、saveの自動設定なし。アプリ/Cron/workerは起動しない。元RDBはread-only mount、専用のコピー先・出力先を別に用意する。最初のロード先には十分なRAMを割り当てるが、ホスト/コンテナのRAM上限を超えない。loaderをmaxmemoryだけで止められると思わない。OOM kill/ロード失敗時は不合格。

## ローカルでの容量・互換性リハーサル

1. ロード前に公式のRDB checkerでchecksum/形式を検証し、ロードログとINFO keyspaceで全DB/キー数/期限切れ件数を確認する。実RDBを初めて開くと期限切れキーは消えるため、元ファイルとロード後manifestは別の証拠として保持する。時計同期と開始/終了時刻を記録する。
2. 余裕のある隔離Valkey9.1.3で全件棚卸し。SCANは**受領RDBをロードしたローカルコピーに限る**。全DB、全キーをbinary-safeなmanifestに収録する。元キーのbyte列（base64）、DB番号、TYPE、DUMP hash、絶対TTL、型別の要素数、必要に応じたsemantic hashを保持。未知型/module/DBがあれば停止。6型のみの既存ツールで未知型を捨てない。
3. INFO memory（used_memory、dataset、overhead、RSS、peak、fragmentation）、MEMORY USAGE、最大キー/serializedサイズを測定する。MEMORY USAGE合計だけでallocator/サーバー全体の費用を見積もらない。秘密キーや値をログ/チャットへ出さない。
4. 新しい空の隔離Valkey9.1.3へ、予定するbinary RESTORE/ABSTTLと原キーで全件を逐次復元する。maxmemory=312475648、noevictionとし、INFO memory/stats/errorstatsをバッチごとに測定、OOM・evicted_keys増加・想定外expired・process終了なら即停止、不合格。native Node/Dockerのプロセスメモリも別に監視する。ローカルのCONFIG変更は専用試験サーバーだけに限定する。
5. 各バッチ前の保守的な停止線として、used_memory/観測peak/次のバッチ予測の最大値を上限の70%以下（218,732,953 bytes、約208.6MiB）に収める。これは今回の運用上の仮の余裕30%で、provider保証でも十分条件でもない。target baseline差、最大1キーの復元peak、fragmentation、接続buffer、今後の成長、永続化時のOS RAMも別途余裕を確認する。実Aiven固有のbaseline/peakをローカルだけでは保証できない。余裕未確認なら進めない。
6. 初回ロードと逐次復元の両方で、全キー/TTL/型/semantic hashと台帳参照を照合する。DUMP byte hashが版差で異なる場合は不合格のまま原因を調査し、型ごとのbinary-safeな内容比較を独立検証してから手順を再レビューする。文字列のJSON再生成で差分を隠さない。

## Aivenへ復元するための実行前ゲート

現状の `scripts/lib/redis-low-command-backup.js` は**ローカル限定・隔離prefix専用**です。`scripts/migration-inventory.js` は既存archive/proofからの棚卸しであり、生RDBを直接読むCLIではありません。Windows接続確認ツールは5読取command専用です。いずれもAiven原キー復元runnerとして使えません。prefix制限を外して実行しないでください。

次の別作業で、検証済みartifactだけを入力する専用target runnerと全件verifierを実装・合成データでレビューする必要があります。host/username/CAと非表示password入力は既存接続診断を再利用し、passwordを環境変数/ファイル/URLへ保存しません。実復元はそのrunner、容量リハーサル、空target、実書込許可のすべてが揃ってからです。

runnerの必須契約:

- 接続先host/port/証明書と対象DBを明示し、旧Upstash経路なし。停止中の専用targetだけ。全DBの既存キー0を確認し、最初のRESTORE前に全原キー衝突検査。非空/衝突なら停止。REPLACE/FLUSH/DELは実装しない。DB未対応ならDB0へまとめず停止。
- 全DB/原キー/値/絶対期限を保持。RESTORE ABSTTL、過去期限のキーは復活させず、期限切れとして別勘定。最大recordとbatchのbytesに上限を設ける。既存4MiB制限を超えるrecordは分割・省略せず中断して設計を見直す。
- 1接続、再試行/再送なし、期限あり。timeoutは「書込済みか不明」として停止する。明示的な成功replyとcheckpointを原artifact hashへ結びつけ、失敗後は自動再開・自動削除しない。targetを切替先にせず隔離したまま、原因調査/新しい空target作成等を別承認で検討する。
- 実targetのメモリ/eviction/OOMを少量ずつ監視。noevictionでも部分復元はtransactionではなく不完全DBが残る。容量不足をキー削除、履歴省略、圧縮JSON化、index再生成で解消しない。プラン/移管先変更が必要なら理由と予算を相談する。

## 復元後の全件・台帳整合性照合

writerは停止したまま、同一artifact/manifestを正として全DBを検証します。観測T0/T1とサーバー時計を保存し、照合中の自然失効を区別します。

|照合対象|合格条件|
|---|---|
|物理キー集合|各DBのbinaryキー集合が「manifest − 絶対期限に基づく自然失効」と一致。欠損/余剰/不明DBは0。DBSIZEだけでは不足|
|型/値|全キーのTYPE一致、stringは元byte列hash一致。hash/list/set/zset/streamは要素・順序・score・ID・metadataを含む型別binary-safe比較。互換版でDUMP hash一致も確認|
|期限|恒久キーは期限なし、期限付きは元の絶対期限一致。TTLを復元時間から延長しない。失効したキーは個別の期限と観測時刻で説明できること|
|namespace|稼働中LEDGER_RELEASE_SHA256に対応する物理prefixを維持。旧release/probe/unknownキーもmanifest対象から除外しない|
|作品/SEO|全作品IDとschema/revision/固定項目/lockedFields/pageExtrasの手動内容を比較。SEOとwork参照の欠損差分0|
|人物/シーズン|全人物/作品/シーズンID、コンパクト保存、親子参照/件数/並び/更新日時を比較。元からの不整合は記録し、勝手に修復しない|
|配信/更新履歴|日本の見放題/レンタル/購入、最終成功/試行/失敗情報、13シリーズ266作品のmembership、journal/idempotency/fencing、日次進捗と履歴を比較。Cronを動かして確認しない|
|検索|通常string/zsetのdoc/ids/gramsとcanonical参照を全件比較。独自indexを再構築せず、保存済みの日本語作品/人物/ジャンル検索を読取だけで比較|
|制御/保護|control/停止状態/quota/lock/lease/所有token等を保存。失効以外の消失なし。古いlockを勝手に解除しない|
|容量/実行結果|全キー一致、失効を別計上、eviction/OOM/errorなし、容量の余裕あり。接続診断PASSだけで完了としない|

差分報告には秘密値を出さず、DB/分類別件数、hash、自然失効、欠損/余剰/不一致件数、容量peak、実行開始/終了時刻を残します。全件照合に加え、アプリ機能のローカル回帰を行います。Aivenへは承認済みの読取検証だけを行い、更新を起こす本番APIアクセスを避けます。

全件照合が成功してもmain統合、環境変数の切替、取得停止解除、Cron再開、旧Upstash停止はそれぞれ未実施です。後続の切替承認と、最新データ維持/切り戻し計画なしに進めません。
