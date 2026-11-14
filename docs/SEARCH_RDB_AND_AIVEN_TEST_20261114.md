# 検索のRDB移管影響とAiven接続テスト準備

## 今回の状態

開始点は移管ブランチ `0d79393fe437db58d54eae276bbbc5475f84cdf6`。リモート先端と一致を確認。mainは `a05897e`、緊急修正を再適用しない。

ユーザー報告: Aiven Free `doko-de-mireru-valkey`、Valkey 9.1.3、Running。実Aivenへ接続して確認した状態ではない。UpstashへRDB Exportの料金・コマンド計上を問い合わせ中で回答待ち。今回、旧Upstash/Aiven/TMDB/本番Vercelへアクセスしていない。

## 「Redis SearchのindexがRDBに含まれない」の影響

現行コードではRedis Search/RediSearchを使っていない。`api`、`scripts/lib`、`prototype` のJavaScriptとpackage依存を調査し、`SEARCH.*`、`FT.*`、`VECTOR.*`、`@upstash/search`、RediSearchの利用がないことを確認した。`api/search.js` というファイル名や検索という機能名は、Redis Searchの利用を意味しない。

|経路|実装|依存データ/command|
|---|---|---|
|取得停止中の作品・人物検索|_release-application → _paused-ledger-search → _indexed-search → _search-index-v2|独自JSON/stringとSorted Set。EVAL、ZLEXCOUNT、ZRANGEBYLEX、GET/STRLEN|
|取得停止中の人気/ジャンル/条件検索|_paused-ledger-search.browse|ids:work zsetをZRANGE、作品JSONをEVAL/GETで読む。配信filterはMGET|
|通常運行の作品・人物検索|_release-application → _recovery-search|TMDBの/search/movie, tv, multi, personと既存query cache。Redis Search module不使用|
|通常運行のdiscovery等|_release-query-context経由のsearch.js|TMDBと既存recovery cache。Redis Search module不使用|
|作品/人物保存時のindex更新|_dev-content-store.COMMIT、_search-index-v2.SEED|JSON documentとZADD/ZREMで更新。独自Luaでatomic保存|

独自indexの論理キーは `doko:dev:search:v2:` 配下。release transportが実際の `doko:ledger:release:{稼働中release識別値先頭16桁}:search:v2:` に写像する。GitコミットSHAへ置き換えない。

- `doc:work:{movie|tv}:{id}`、`doc:person:{id}`: string/JSON。検索用document。
- `ids:work`、`ids:person`: zset。登録済みID一覧。
- `grams:work`、`grams:person`: zset。日本語/原題を正規化して作った1文字/2文字gramとID。
- ready/unused等も既存移管計画どおり全キー保全する。ただしREADY定数が存在することを「現行の検索がreadyフラグを必ず検査する」と解釈しない。
- 本体のwork/person、各meta、配信台帳も含めて同じ時点で保持する。

**結論: Redis Search固有indexの欠落が、このコードの検索を直接壊す依存関係はない。** 独自zset/stringがRDBに保持されることが条件。元DBの実際の全内容は未確認であり、別用途のSEARCH.* indexがないと断定するものではない。実Exportで必要キーが欠落/破損していれば保存済み検索が空・不完全・エラーとなり得る。通常検索がTMDBで動いても、保存済みindexの完全性の証明にはならない。

indexを再構築して欠落を隠さない。移管前後でdocument・registry・gramのmember/scoreとwork/personの整合を確認する。Upstash回答で「Redis Search indexは含まれない」と言われた場合、アプリが使う通常のzset/stringも含まれないという意味かを区別する。

## ローカル検証

`tests/migration-rdb-rehearsal.test.js` に追加したテストは、合成の作品・人物を既存COMMITで保存し、実際の検索用zset/stringを作る。日本語作品検索・人物検索・ジャンルbrowseの結果を取得後、ローカルSAVE→別Unix socketのRedisへRDBロードし、indexを再構築せず完全一致を確認する。検索中にSEARCH.*/FT.*を使わず、読み取りだけであることも確認。work JSONバイトを保持する。

既存RDBテストと合わせて2件PASS。これはローカルRedis7.2.7の合成データの証拠。実Upstash exportやAiven9.1.3のRDB/DUMP版差・Lua互換性を保証するものではない。既存93件の証拠は消さず、今回の全回帰結果は進捗ログへ追記する。

## Secretを設定する場所と値

**本番VercelやGitHub repository secretsではなく、このCodexチャットが使用しているCloud実行環境に設定する。** Vercel接続先の切替設定は今回不要。既存のTMDB/Upstash用Secretと変数は変更・削除しない。

1. Aiven Consoleで `doko-de-mireru-valkey` → Overview/Connection informationを開く。Free/$0、Running、host/port、username、TLS付きService URIを確認する。Import database/migration wizardは実行しない。
2. このチャットのCloud環境設定（環境メニュー/Settingsから実行環境の編集が提供される場合）を開き、Secretsで次を追加する。画面名称はクライアントにより異なる。UIが見当たらない場合はSecret値ではなく設定画面の項目名を知らせる。

|Secret名/環境変数への割当|設定する値|扱い|
|---|---|---|
|REDIS_URL|Aivenの完全なTLS Service URI。例は `valkeys://<user>:<encoded-password>@<host>:<port>`、またはrediss://|URL全体をSecretにする。runtimeの平文変数へ貼らない。passwordの予約文字はURIエンコード済みのConsole URIを優先|
|REDIS_CA_CERT|サービスがproject CAを要求する場合だけ、CAのPEM全文（BEGIN/ENDと改行を含む）|新サービスで公開CAを使う場合は通常不要。URIにTLS検証無効化optionを追加しない|

3. Secretの環境変数名も上記と一致させる。ネットワーク用のSecretにドメイン指定がある場合はAiven URIの**実hostだけ**に限定し、Cloud側の接続許可にもそのhost/portを追加する。サービス名 `doko-de-mireru-valkey` 自体をhostとして使わない。*.aivencloud.com全体などへの拡大は不要。
4. 保存/適用後、Secretの準備完了と、host/port（passwordなし）を知らせる。URI、password、CA本文をチャットへ送らない。こちらはSecretの名前・ready状態・許可先だけを確認し、値をprintしない。
5. **Secretが保存されたことと、node-redisのTLS/TCPから利用できることは別。** CloudのHTTPS proxyがHTTP用Secretをplaceholderとして注入する方式だけの場合、node-redisのTCP接続にそのまま使えるとは限らない。実値を安全にruntimeへ渡せるSecret方式とTCP/TLSの到達性をテスト前に確認する。HTTP用placeholderをパスワードとして送信したり、proxy/TLSを無効化して回避したりしない。安全な方法が提供されない場合はそこでブロッカーとして報告する。

今回確認したCloud設定にはAivenのSecret/接続許可がまだない。既存許可が旧Upstashを含んでいても、今回アクセスする根拠にはならない。設定が適用済みかは次回statusのobserved revision/readyで確認する。設定UIが別マシンを対象としている場合はそのまま試行しない。

`REDIS_PROVIDER`、LEDGER_RELEASE_*、NON_STREAMING_ACQUISITION_PAUSEDなどは今回変更不要。接続テストは `_valkey.createValkey` に指定したAiven設定だけを渡す独立処理とし、アプリdispatchや旧Upstashへのfallbackは使わない。

## 実接続テスト範囲の確認案（まだ実行しない）

最初は次の読み取りだけを提案する。Secret準備とこの範囲のユーザー確認が揃った後に実施する。Secret設定だけでテスト承認と解釈しない。

- 接続先は `doko-de-mireru-valkey` のTLS host/portのみ。旧Upstash・TMDB・本番サイトへ接続しない。
- TCP/TLS接続と証明書検証、認証、PING、TIME、INFO server、INFO memory、INFO clientsを各1回。アプリcommandは5回。認証・SDKのCLIENT SETINFO等のhandshakeは別途数える。INFOは必要なversion/メモリ/接続数だけ要約し、raw応答/資格情報をログへ出さない。
- 1接続、接続/各command8秒上限、全体60秒以内、再試行・自動再送なし、最後にclose。HTTP GETやcurlへの置き換えでTCP成功を判定しない。
- SET/EVAL/RESTORE/DUMP/SCAN/KEYS/検索index操作、既存キーのGET/MGET、移管、source credentialsの参照は実施しない。追加の書込みテストが必要なら、TTL付きランダムprobe namespaceと上限を別途具体化して確認する。
- これが成功しても、Lua、CAS/ロック、RESTORE互換、原データ整合性、9.1.3でのアプリ全体の合格を意味しない。続く隔離キーの検証は別段階。

## 未完了と次の一手

ユーザー: Cloud実行環境のSecret/TCP許可を準備し、上記5読取commandの範囲を確認する。Upstashの回答待ちは継続し、Exportはまだ実行しない。

Codex: Secret準備後に設定の適用状況・受け渡し方式を確認。範囲確認が済んでからAiven読取接続テストへ進む。Upstashへのアクセス、実移管、本番環境変数変更、main統合、デプロイ、Cron実行は今回も禁止。
