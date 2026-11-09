# 新5台帳の段階的な実データ登録（2026-11-10 JST）

前回の実検証報告は `2c54350` で `work/four-ledgers-20261107` へpush済み。今回も本番デプロイ・公開先切替・旧データ削除は行っていない。

## 実施結果

旧データの移行ではなく、既存の明示ID一覧に対するTMDB実データの新規登録。旧台帳の手動情報保全・全件移行・旧全件バックアップを登録の前提にしていない。

| 対象 | 実取得・ローカル新台帳保存・元パケット照合 |
|---|---:|
| 作品 | 266（映画207・TV59） |
| 作品固有SEO | 266 |
| 日本配信（見放題・レンタル・購入） | 266 |
| TVシーズン一覧 | 59 |
| 各TVの最初の正のシーズン | 59、計2,275話 |
| 明示取得した人物 | 2 |

取得済み2作品・人物1・シーズン1の生パケットは再利用。残264作品に対して追加TMDB取得588件、応答計28,441,869 bytes。内訳は作品詳細264・日本配信264・最初の正のシーズン58・人物プロフィール/出演情報各1。成功応答ごとにGit外へ保存し、チェックポイントがあれば再取得しない。出演作や出演者全員へ再帰的に展開していない。すべてのシーズン・人物を取得済みという意味ではない。

23バッチで実行。最初4作品→8作品→16作品と増やし、容量予約が8MiBを超える段階では8作品へ縮小、最後は4作品。収集は直列でリクエスト開始間隔350ms以上、1応答2MiB・1バッチ32MiB上限、自動再試行なし。取得エラー0。

全266件の作品ID/区分/題名・SEO世代整合・日本配信3区分、59TVの一覧と最初のシーズンの全話番号/話名、人物名の照合に合格。未取得の別シーズンは未取得として保持。

## 表示と負荷

実TMDB検索2件で「シン・ゴジラ」と人物検索を行い、保存済み詳細・人物ページ・新規TV「モナーク」のシーズン/話までPC1280px・スマートフォン390pxで確認。初回10項目合格。全266作品登録後は実検索結果のキャッシュを再利用し、追加取得0で12項目合格、未処理JS例外0。映画/TVの初期SEO HTML、未登録HTMLの503/noindexと追加取得・保存0も確認した。

全件登録後の再検証で、検証サーバーの作品ID制限が静的な人物ページのIDまで拒否する不具合を発見。作品データの経路だけに限定して修正し、人物HTMLと画面操作の回帰確認を追加した。新規スクリプトの保存済みディレクトリー再開エラーも修正し、再開時の既存応答保護を試験した。

ローカルRedisの所有キー1,729、MEMORY USAGE合計2,955,245 bytes（約2.96MB）。保存/索引/制御等を含み、Redisプロセス全体やUpstash容量ではない。16作品バッチの一例はDB命令差分919・保守的予約935（当時の報告値は終了INFO前、終了INFOを含める修正後は936）。最初の6作品のみredis-cliを使用したため、INFO命令差分には各接続のHELLOも含まれる。その後はRESP直接通信に変更し、接続ハンドシェイクを実測に混ぜないようにした。

全件照合と最終画面確認までの予約累計は機械可読証跡に記録。INFOの差分は他クライアントの処理も含むため、Upstash請求の専有分とは扱わない。20並列の保存済み読取も追加ソース読取/TMDB取得0。遅延は証跡JSONに記載し、本番Vercel性能を予測する値には使わない。

選択Node試験14件合格（新規7件＋既存収集関連7件）。隔離・上限停止・秘密値非表示・部分成功後の再開・他プロセスとの排他を含む。既存テスト全体の再実行ではない。

## 実Upstashに対する限定と上限

実Upstash登録は資格情報待ちで未実施。実行を試みた際も `Upstash credentials missing; local work may continue` で送信前に停止し、実Upstash要求0。ローカル測定値を実Upstash実測とは報告しない。

接続済みVercelから既存ストアの非秘密メタデータのみ確認：Free、月500,000 Commands、autoUpgrade=false、eviction=false、usageQuotaExceeded=false。ただし最新月間消費・残枠・実容量はこのメタデータからは分からない。Vercel上の接続変数はsensitiveで値を取得できず、設定を変更していない。

安全性は新規7試験とローカル実行で確認済み：

- ランダムな新接頭辞 `doko:ledger:release:<owned-id>:` の検証用キーだけ。初期制御はSET NXで衝突時に停止。アプリケーションの本番接続先・公開モードは変更しない。
- 旧キー参照、SCAN、KEYS、FLUSHDB/FLUSHALL、単独DEL、未登録Luaを拒否。登録・計測は全件走査を使わない。Luaでの一時リース解放も所有する新接頭辞内だけ。
- 容量測定は追跡済みの自分のキーへMEMORY USAGEを実行。DB全体はINFOの集計だけを参照し、既存レコードの内容を読み出さない。
- Redis操作は1バッチ最大2,500、対象ごとの累計最大40,000の保守的Commands予約。送信前に予約を保存し、失敗・不明な応答でも戻さない。HTTP往復数とCommandsを別に記録する。
- 所有キー容量上限8MiB。書込み前に1作品262,144 bytesと関連人物/運用2MiBの余地を予約し、上限を超えるバッチは書かない。未完了の容量予約と追跡キーは再開時も保持する。
- 実Upstashでは書込み前のINFOで容量を確認し、現在量＋8MiBが240,000,000 bytesを超えるか、測定できなければ停止。容量確認後も各バッチで所有キーを再測定する。
- 保存処理と検証サーバーは対象別の排他ロックを使い、同じ計測ファイルを同時更新しない。無料枠超過時の再試行・自動プラン変更・新ストア作成は行わない。

既存UPSTASH_REDIS_REST_URLとUPSTASH_REDIS_REST_TOKENをCodex環境Secretsへ登録し、接続先ホストの通信許可を追加すれば、小さい実Upstashバッチから開始できる。キーの値はチャット/Git/証跡へ出さない。

## 再開コマンド

以下の私有パケットディレクトリーは今回作成済み。266件が揃っているので、実Upstash測定のために再収集する必要はない。

```bash
# 既存パケットだけを使い、まず4作品を新しい実Upstash検証用領域へ保存
NODE_USE_ENV_PROXY=1 node scripts/save-staged-five-ledgers.js --out /workspace/work/staged-five-ledgers-20261110 --target upstash --execute --limit 4
# 結果/残枠/容量を確認してから8作品、最大16作品へ進む。保存済み作品はスキップ
NODE_USE_ENV_PROXY=1 node scripts/save-staged-five-ledgers.js --out /workspace/work/staged-five-ledgers-20261110 --target upstash --execute --limit 8
# 同じパケットと新領域の保存値を全件照合（旧キーを読まない）
NODE_USE_ENV_PROXY=1 node scripts/audit-staged-five-ledgers.js --out /workspace/work/staged-five-ledgers-20261110 --target upstash
# 新領域を読むループバック表示。公開先は切り替えない
NODE_USE_ENV_PROXY=1 node scripts/serve-staged-five-ledgers.js --out /workspace/work/staged-five-ledgers-20261110 --target upstash --port 16384 --external-search
NODE_USE_ENV_PROXY=1 node scripts/verify-staged-five-ledgers.js http://127.0.0.1:16384 /workspace/work/staged-browser-upstash-20261110
```

画像は現環境の通信許可外のため、今回のブラウザー試験ではポスター/ロゴを含む外部画像通信を遮断している。画像の実表示まで確認済みとは扱わない。`image.tmdb.org` の許可追加後に検証へ `--images` を付けると、既存プロキシを使い、画像は最大32要求・各1MiB・合計8MiBの範囲で実取得して表示確認する。画像経路にTMDBキーは送らない。

生パケット・出演情報・スクリーンショット・所有名前空間の再開状態は `/workspace/work/staged-five-ledgers-20261110` と `/workspace/work/staged-browser-*` 内に保持し、Gitへは実装・報告・秘密情報を含まない集計証跡だけを保存する。
