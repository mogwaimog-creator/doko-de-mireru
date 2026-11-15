# 原キー復元・全件照合ツール（Windows PC / WSL2）

この版は合成RDBとローカルValkey **9.1.3** で検証済みです。実Upstash export、実Aiven書込、Windows実機操作は未検証です。今回の実行範囲はローカル試験までで、実データの取得/採取/復元は後日の個別判断です。Export回答待ちは継続します。

## 追加したもの

`node scripts/original-key-migration.js` は引数なしの対話CLIです。

|モード|接続先|動作|
|---|---|---|
|capture|ローカルUnix socketのみ|既にRDBをロードして停止状態のValkeyから全DB/全キーを採取・照合し、private bundleを作る|
|rehearse|空のローカルUnix socketのみ|原キーRESTOREと全件照合を行い、データのhashに結びついた容量リハーサル報告を作る|
|restore|Aivenの検証済みTLSのみ|成功した同一bundleのリハーサル報告を検査し、空の専用targetへ原キー復元後に全件照合|
|verify|ローカルsocketまたはAiven TLS|書込なしで全DB/全キー/全台帳の保存内容をbundleと照合|

アプリモジュール/REST/旧Upstash接続経路はありません。remoteは `.aivencloud.com` ホスト名だけを受け付け、URL/環境変数から接続しません。独自ドメインはこの版では不可です。新ツールであり、既存の隔離prefix限定restoreVerifiedを変更していません。

## まずPCを準備する（実接続なし）

1. [接続確認のWindows手順](AIVEN_CONNECTION_CHECK_WINDOWS.md)に従いテストブランチ最新版を取得。WindowsネイティブのPowerShellではNode.js 22と `npm.cmd ci --ignore-scripts --no-audit --no-fund` を使えます。パスワードを保存する設定は不要です。
2. ローカルRDB採取とリハーサルはUnix socketを使うため、Windowsでは **WSL2のUbuntu** が必要です。Windows TerminalのUbuntuタブで作業します。WSL2の導入はMicrosoft公式 https://learn.microsoft.com/windows/wsl/install を参照。Windows/WSL2のNodeと依存導入は別です。WSL2にもNode.js 22を用意し、WSL側のリポジトリで `npm ci --ignore-scripts --no-audit --no-fund` を実行してください。
3. WSL内にValkey9.1.3の公式ソースをHTTPSで取得し、ローカルにビルドできます。make/Cコンパイラを事前に用意します。今回Cloud上で検証したビルドは以下です（WSL環境そのものは未検証）。

```bash
mkdir -p "$HOME/valkey-tools"
cd "$HOME/valkey-tools"
curl -fL https://codeload.github.com/valkey-io/valkey/tar.gz/refs/tags/9.1.3 -o valkey-9.1.3.tar.gz
tar -xzf valkey-9.1.3.tar.gz
make -C valkey-9.1.3 -j2 MALLOC=libc BUILD_TLS=no OPTIMIZATION=-O2 valkey-server valkey-cli
./valkey-9.1.3/src/valkey-server --version
```

これはローカルUnix socket用のビルドです。AivenへのTLSはNodeが担当します。バージョン9.1.3以外は新ツールが拒否します。実Aivenとのallocator/ビルド差があるため、ローカル容量がそのまま本番の保証にはなりません。

4. RDB/bundle/報告/journalの保管先は暗号化ドライブ上のprivateフォルダーにします。Git checkout、OneDrive、共有フォルダーを使わないでください。WSLでは `umask 077` を設定し、native Windowsではフォルダーの「プロパティ → セキュリティ」で自分だけに権限を限定します。Nodeのmode0600だけでWindows ACLを保証するものではありません。
5. ターミナル録画、PowerShell transcript、debug/inspector/ログ収集を止めます。NODE_DEBUG/DEBUG/TLS検証無効化は拒否されます。パスワード入力は自分のPCの端末だけで行ってください。

## 合成データによる開発者テスト（今実行できる範囲）

リポジトリのWSL側フォルダーで実行します。テストは自分で合成RDB/一時サーバー/証明書を作り、終了時に片付けます。Upstashや実Aivenの接続情報は不要です。

```bash
VALKEY_TEST_SERVER="$HOME/valkey-tools/valkey-9.1.3/src/valkey-server" node --test --test-concurrency=1 tests/original-key-migration.test.js
```

8 tests、FAIL 0、skip 0を確認します。VALKEY_TEST_SERVERを設定しないと実サーバー試験がskipされます。模擬TLSサーバー用にOpenSSLも必要です。

## 最新RDBを安全に取得できた後のローカル操作（まだ実行しない）

[RDB復元計画](AIVEN_RDB_RESTORE_WINDOWS_PLAN.md)の取得/完全性/停止/容量ゲートが先です。RDBの元ファイルを保持し、コピーを使います。sourceでアプリ/Cronを動かしません。source/targetとも専用の新しいフォルダーを使い、既存データを上書きしません。

1. ローカルロード: 公式RDB checkerとhashを確認した作業コピーを専用sourceフォルダーの `data.rdb` に置きます。RDB checksumエラー、未対応module/format、ロード失敗、ホストRAM不足なら停止します。十分なRAMのローカル専用プロセスをTCP無効、Unix socketのみ、自動保存なしで起動します。次はパスの**例**です。自分の新規privateディレクトリへ読み替えます。

```bash
umask 077
"$HOME/valkey-tools/valkey-9.1.3/src/valkey-server" --port 0 --unixsocket "$HOME/private-migration/source/socket" --unixsocketperm 700 --save '' --appendonly no --dir "$HOME/private-migration/source" --dbfilename data.rdb --maxmemory 0
```

このサーバーは起動したタブで動かしたまま、別のUbuntuタブでNodeを使います。maxmemory0はローカル初回解析用であり、ホスト/WSLのRAM容量は別に確認します。Aivenへの設定変更ではありません。RDBロード時点ですでに失効したキーは消えるため、元RDBとproviderの独立件数/失効情報を保管します。ツールはRDB生ファイルを直接解析するものではありません。

2. `capture` を選択。元RDBのパス、active releaseの完全SHA256、source socketの絶対パス、**存在しない**private bundle JSON出力パスを入力します。元RDBはストリームでSHA256を計算し、接続元がそのRDBをロードしたことと全writer停止/完全exportを手動で宣言します。単にhashを記録するだけでexportの完全性やsocketとファイルの対応を自動証明するものではありません。

```bash
node scripts/original-key-migration.js
```

`LOCAL FROZEN COMPLETE` はその事実を確認した場合にだけ入力します。採取中の期限切れ/値変化を検出したら停止するので、原因を確認してローカル採取をやり直す判断が必要です。未知のキーを捨てず、未知型は中断します。

3. 全く別の空targetを、`maxmemory 312475648`、`maxmemory-policy noeviction`、TCP無効で起動します。sourceのRDBをこのtargetへコピーしないでください。各試験に新しい空フォルダーを用意し、失敗したtargetを削除/初期化して再利用しません。

```bash
"$HOME/valkey-tools/valkey-9.1.3/src/valkey-server" --port 0 --unixsocket "$HOME/private-migration/rehearsal/socket" --unixsocketperm 700 --save '' --appendonly no --dir "$HOME/private-migration/rehearsal" --dbfilename unused.rdb --maxmemory 312475648 --maxmemory-policy noeviction
```

4. CLIの `rehearse` に、bundle、空targetのsocket、新規result JSON、新規journalファイルを指定します。表示された `LOCAL RESTORE <bundle hash>` を確認して入力。全DBが空、全DBへのSELECTが可能、Valkey9.1.3/noeviction/maxmemory実測が一致した後にだけ書き込みます。resultが `status:PASS`、内側のverificationもPASSで、verified+expiredが入力全件数に一致することを確認します。
5. 別実行の `verify` → `local` で同じbundleとtargetを再照合できます。verifyはキーを変更しません。sourceの既存参照不整合（SEO/season/配信record→work）やactive namespace欠落は復元を止めます。元データを修復せず別にレビューします。

## 実Aivenへの操作は、後日の明示的な判断後だけ

現在はこの段階へ進みません。空の専用Aiven、全writer停止、実データの容量/完全性、必要command権限/noeviction、export回答が確認され、実書込を明示的に承認された後の手順です。

PowerShellで `node .\scripts\original-key-migration.js` → `restore` を選びます。bundle、成功rehearsal report、host/TLS port/username/CA、新規result/journalを指定し、表示された `RESTORE <bundle hash> <host>` を確認して入力します。パスワードは最後の非表示入力で、環境変数、argv、URL、ファイルへ保存しません。証明書の信頼とホスト名を検証します。hash/hostを含む確認文字列は誤対象防止であり、承認の代わりではありません。

復元完了後、別実行の `verify` → `aiven` に同じbundleを指定し、読取だけで全件照合します。verifyも多くの読取commandを送るため、この検証範囲の承認が必要です。read-onlyでも無負荷ではありません。

## 何を検証し、何を保証しないか

- 全DBをINFO keyspaceで発見し、全物理キーをbinary-safe SCANで照合。SELECTを保持する単一接続です。原キー（空文字/非UTF8を含む）、string/hash/list/set/zset/streamのDUMP全byteとTYPE、stringの元byte hash、絶対期限を比較します。streamのgroup/consumer/PELもDUMPに含めて照合し、再生成しません。版差でDUMPが違えば安全側に中断し、比較を弱めません。
- 作品/人物/シーズン/SEO/配信/index/control/lock/journal/unknownをすべて対象にし、分類別件数とソース参照警告を返します。固定項目、手動pageExtras、revision、indexや履歴もbyte一致で保存を証明します。任意のJSON schemaや全ての意味上の参照が元から正しいことまで保証しません。元の不整合は別調査し、アプリの回帰・検索/表示等の検証も別途必要です。
- 期限はABSTTLで保持し、過去期限は書かずに失効数へ計上。欠損を失効扱いにできるのは元の絶対期限がサーバー時刻以下の場合だけです。検証中の失効競合で保守的に失敗することもあります。TTL延長/期限切れキーの復活はしません。
- SHA256は破損検出の自己checksumです。署名やprovider完全性の証明ではありません。信頼済みprivate bundle/reportだけを使い、編集/改変しません。capture前に既に失われたキーやprovider除外データはbundleからは検出できません。
- 1接続、再接続/再送/offline queueなし、1操作8秒の期限、command/bytes上限。RESTOREは逐次、REPLACE/FLUSH/DELなし。作業中は全writerを独立して止める必要があり、読取照合は外部writerに対する原子的snapshotではありません。
- 容量は298MiB上限の70%を停止線にし、各キー前後にused_memory/peak/evicted_keys/policy/maxmemoryを確認します。実復元では同一bundle/同一version/同一上限のリハーサルpeak増分と最大1キー増分を加えた予測も判定。OOM/eviction観測/上限変更を検出すれば停止。これは実RDB約193MBが収まる証明ではなく、最大一時allocationやRSS/OSのOOMを完全に予測するものでもありません。
- 現版の上限は100,000 keys、64非空DB（DB番号0..1023）、raw dump合計256MiB、bundle JSON512MiB、1キー名64KiB、1DUMP/非圧縮string4MiB、RDB hash入力1GiB。超過/未知型/別versionは省略せず停止します。stream等の大きいrecordも分割しません。sourceがすでに部分欠損なら、provider証拠なしに完全移管とは呼べません。

## エラー・途中中止・後片付け

- resultは開始時に `INCOMPLETE` を保存し、全件照合完了時だけPASSへ置き換えます。終了コードは0/1。クラッシュ時はJSON破損の可能性もあり、これも不合格です。
- journalは新規作成のみで、書込前intentと応答後ackを逐次fsyncします。キー名/値/password/接続先は書きません。最後がintentなら書込結果が不明、ackで止まっても全件完了ではありません。checkpointからの自動resumeは実装していません。
- Ctrl+C/期限超過/認証/書込/ディスクエラーは停止してsocketを閉じます。最後の書込が完了したか不明な場合があり、再試行しません。入力待ちCtrl+Cは非表示入力処理が端末モードを復旧。operation中のSIGINT/SIGTERMは接続を閉じます。
- targetに一部データが残っても自動削除/rollbackしません。切替に使わず隔離し、private result/journalと原RDBを保持して原因を調査します。削除/新target作成/再実行は後で別判断です。ログにパスワードやINFO全文を貼らないでください。
- 自分で起動したローカルサーバーだけを停止します。private RDB/bundle等の保管・削除は所有者の保持方針に従い、旧Upstashや実Aivenのデータは操作しません。通常のJSメモリからパスワードを完全消去できる保証はありません。

次工程はUpstash回答と最新RDBの安全な受領後の**ローカル**完全性/容量判定です。実復元、main統合、環境変数変更、取得停止解除、Cron再開、公開、料金プラン変更は未承認・未実施です。
