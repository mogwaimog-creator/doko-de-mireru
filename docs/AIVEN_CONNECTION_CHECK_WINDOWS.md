# WindowsでのAiven接続確認ツール

今回作成したツールはローカル検証済みですが、実Aivenにはまだ接続していません。以下の実接続操作は、接続テストの実施が明示的に承認されてから行ってください。今は準備までです。

## 準備（実接続なし）

1. 自分のWindows PCへ、公式 https://nodejs.org/ からNode.js 22 LTSをインストールします。端末を開き直してください。
2. GitHubでリポジトリのブランチを `test/temporary-redis-migration-20261114` に切り替え、緑のCode → Download ZIPでダウンロードして展開します。既存の作業フォルダーへ上書きせず、新しいフォルダーを使ってください。
3. 展開したフォルダー内で右クリック →「ターミナルで開く」を選び、PowerShellで次を実行します。package.jsonがあるフォルダーで実行してください。

```powershell
node --version
npm.cmd ci --ignore-scripts --no-audit --no-fund
```

Nodeの表示が `v22.` で始まることを確認します。`npm.cmd` はPowerShellのスクリプト実行制限を変更せず使えます。依存はlockfileどおりの `redis@5.11.0` です。これはパッケージ取得だけで、Aivenへ接続しません。

4. Aiven管理画面でホスト名、TLSポート、ユーザー名を確認しておきます。CA証明書が必要なら、Aivenから取得したCA証明書をローカルに保存します。CA証明書は公開証明書であり、パスワードや秘密鍵を保存する操作ではありません。秘密鍵はこのツールで使いません。
5. 管理者権限は不要です。Windows Terminal/PowerShellの通常ターミナルを使い、録画・トランスクリプト・デバッグ・端末ログ保存を停止してください。IDEのDebug Console、Cloud共有ターミナル、チャットでは入力しません。TLS検証無効化やNODE_DEBUG/DEBUGが設定されているとツールは停止します。

## 実接続の承認後だけ実行する手順

```powershell
node .\scripts\aiven-connection-check.js
```

引数やパスワード入りURLを追加しません。順番に入力します。

- `Host (no URL):` Aivenのホスト名だけ。`https://`、`valkeys://`やパスワードは付けません。
- `TLS port:` Aiven画面のTLSポート番号。
- `Username:` Aivenのユーザー名（例: default。画面の値を優先）。
- `CA certificate file path ...:` CAファイルのパス。例: `C:\Users\自分の名前\Downloads\ca.pem`。公開CAをシステムが信頼する場合のみ空欄でEnter。証明書エラー時は正しいCAを確認し、検証を無効化しません。
- `Password (hidden):` 自分のPCの端末でパスワードを入力してEnter。文字も伏字も表示されません。環境変数、.env、引数、ファイルへ保存する必要はありません。可能ならパスワード管理アプリの自動入力を使い、クリップボードへコピーした場合は後で消去してください。

Ctrl+Cで中止できます。入力欄ではCtrl+D/Escapeも中止扱いです。バックスペースで修正できます。非TTY入力（パイプなど）は拒否します。ホスト名等はEnterごとに一項目ずつ入力し、複数行をまとめて貼り付けないでください。

成功時は `status:PASS`、`tlsVerified:true`、バージョン、メモリ使用量/上限、接続数だけをJSON表示します。ホスト名、ユーザー名、パスワード、サーバー時刻、INFO全文は表示しません。共有するならこの結果だけで十分です。失敗時は詳細を伏せた固定メッセージと終了コード1を返します。

```powershell
$LASTEXITCODE
```

0は成功、1は失敗です。失敗後は繰り返し試さず、パスワードを含まない症状だけを共有してください。ユーザーが再実行すれば新しい接続になります。

## 通信・安全性の範囲

TLS証明書の信頼チェーンと入力ホスト名を検証し、1接続でPING、TIME、INFO server、INFO memory、INFO clientsを順に各1回だけ実行します。各接続/コマンドに8秒の期限があり、再接続、再試行、offline queueは無効です。認証AUTH等はSDKの接続準備として別途発生するため、総通信数が5回という意味ではありません。SDKのCLIENT SETINFOは無効にしています。

SET/EVAL/RESTORE/SCAN/KEYS/既存作品のGET、Cron、アプリ起動、移管は行いません。アプリモジュールをimportせず、旧Upstashへの経路もありません。REDIS_URL等の環境変数から接続設定を読みません。接続後は成功/失敗/期限超過ともsocketを破棄し、QUITも送信しません。

パスワードは入力とSDK認証に必要なプロセスメモリに存在します。JavaScriptのメモリを完全に消去できるという保証はありません。端末・OSの侵害やメモリダンプまで防ぐツールではありません。

## 開発者向けローカルテスト（Aivenへの接続なし）

```bash
REDIS_TEST_SERVER=/path/to/local/redis-server node --test tests/aiven-connection-check.test.js
```

Node.js 22、OpenSSL、Redis 7が必要です。ローカルで一時Redisと合成パスワード、一時自己署名証明書、TLSブリッジを作ります。実Redisでの成功、認証拒否、CA拒否、ホスト名拒否とsocket終了を検証し、モックで非表示入力/中止/端末復旧、固定5コマンド、再接続無効、接続/コマンド期限超過、例外秘匿、後片付けを検証します。合成資格情報のみを使い、一時ファイルとプロセスは終了時に削除します。REDIS_TEST_SERVER未指定時は実Redisテストがスキップされるため、全検証成功とは扱いません。

Windows実機での対話操作と実AivenのACL・疎通は未検証です。このテストはデータ移行やLua/RESTORE互換性の証明ではありません。
