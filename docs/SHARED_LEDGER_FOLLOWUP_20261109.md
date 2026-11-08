# 共通台帳移行・push後の追加監査（2026-11-09 JST）

本番反映は未承認・未実施。今回の依頼は開発ブランチのpushと確認・報告。製品コードの追加修正は行っていない。

## pushとデプロイ抑止

- `2b3a0c9` は書換えず、その子コミット `476e704` と一緒に `work/four-ledgers-20261107` へ通常pushした。
- 元のブランチはVercel Git連携に反応することを、旧コミットのstatusとデプロイ記録（既存のCANCELED）で確認した。
- `476e704` は `vercel.json` の `git.deploymentEnabled["work/four-ledgers-20261107"]=false` だけを意味上追加する。既存rewrites/cronsの値は維持。mainやVercel管理画面の設定は変更しない。
- 公式仕様 https://vercel.com/docs/project-configuration/git-configuration を確認。`[skip ci] [skip vercel]` も付与したが、抑止根拠はブランチ限定deploymentEnabledである。
- push後の該当SHAのデプロイ一覧は0件、ブランチの最新記録もpush前の旧コミットのまま。観測時点の結果であり、将来手動デプロイまで無効にする設定ではない。
- mainのリモートSHAは引き続き `332843235960714d38abcc1c0590ed1f834ed6ca`。

## 1. 30件の不合格と移行への影響

標準条件（保存凍結、ローカルRedisのみ）で再実行し、315件中285件合格・30件不合格を再現。前回の30件と失敗名は完全一致。変更前298件のログにもすべて同じ失敗があり、今回追加された失敗ではない。

| 分類 | 件数 | 結論 |
|---|---:|---|
| A：保存凍結と試験条件の不一致 | 16 | 試験条件の整理が必要。同時取得抑制/ID照合を飛ばす凍結時の実挙動は費用・正確性の課題 |
| B：人物v2のRedis EVALモック不正 | 6 | 引数位置の誤り。製品コードの故障と同一視しない。実Redis試験は必要 |
| C：古い前提・モック制約 | 4 | 関連カード旧文字列、シーズンrequire、映画canonical、削除計画の配列順 |
| D：シーズンoverview契約不一致 | 4 | 省容量契約と旧契約の不一致。既存UIはoverviewを表示しないが外部消費者の確認は未完了 |

別のdetached作業コピーで、人物v2モックの引数位置だけを修正し、モック用の保存許可を明示して、関連6ファイル42件を実行したところ42件すべて合格した。これは原因切分けであり、元ブランチの30件を直したことや、製品コードの安全性を保証する結果ではない。診断用のenv・テスト変更はpushしていない。本番の `LEDGER_WRITES_RESUME` は変更していない。

### 個別一覧

| No. | 不合格テスト | 分類 | 直接原因 |
|---:|---|:---:|---|
| 1 | `two simultaneous first requests fetch providers once` | A | 保存凍結では未保存作品を永続化せずloadを返すため、同時2アクセスで取得2回。試験は取得1回を期待。 |
| 2 | `Redis lock outage does not trigger TMDB provider fetch` | A | 凍結時の未保存経路はロックを使わずloadへ進み、ロック障害による拒否を期待した試験と一致しない。 |
| 3 | `Redis write outage never reports uncached data as safely cached` | A | 凍結時はSETしないので、保存障害を期待した拒否が起こらない。 |
| 4 | `corrupt saved provider payload is not served as a valid cache hit` | A | 破損キャッシュを有効として返したわけではない。取得応答は正常だが、凍結で破損した保存値を置換しないため保存値の比較が失敗。 |
| 5 | `related-series rendering currently launches one streaming request per rendered card` | C | 変更済みHTMLから旧コメントを文字検索しており見つからない。共有ヒット時も全カードが個別取得するという旧前提。 |
| 6 | `first access saves v2 record, subsequent access reuses without upstream call` | B | EVALを分解したrestのkey countはrest[0]なのにrest[1]（lock key）を数値化するモックの誤り。 |
| 7 | `60 day refresh keeps initial creation timestamp` | B | 同じEVALモックの引数位置誤りで初回保存を準備できず、60日更新の検証に到達しない。 |
| 8 | `failed refresh preserves existing record and its checkedAt` | B | 同じEVALモックの誤りで旧データの初期保存に失敗。失敗時保持の本体の証明にはなっていない。 |
| 9 | `oversized refresh retains prior record and timestamp` | B | 同じEVALモックの誤りで事前保存を用意できず、過大応答時保持を検証できない。 |
| 10 | `incomplete upstream credits do not erase previously saved filmography` | B | 同じEVALモックの誤りで旧出演作品を保存できず、欠損応答防止の検証に到達しない。 |
| 11 | `unexpected empty filmography cannot overwrite populated credits` | B | 同じEVALモックの誤りで旧出演作品を保存できず、不自然な空配列防止の検証に到達しない。 |
| 12 | `first request stores person and second request reuses it without loading upstream` | A | 人物v1の保存凍結により新規人物を保存しない。2回のアクセスに取得1回を期待する試験と不一致。 |
| 13 | `stale data refreshes after sixty days` | A | 人物v1の凍結中は古い保存データを返し、60日を過ぎても更新しない。試験は更新を期待。 |
| 14 | `invalid upstream identity is rejected and lock released` | A | 人物v1の凍結・未保存経路はloadのID検証を通らない。拒否を期待する試験と不一致。ID照合の移行上の穴でもある。 |
| 15 | `tests/season-detail-contract.test.js` | D | 新しいシーズン応答はエピソードoverviewを出さないが、試験は第1話のあらすじを期待する。 |
| 16 | `tests/season-ledger-redis-mock.test.js` | A | シーズン保存ガードはLEDGER_WRITES_RESUMEが1以外なら拒否。試験が書込み許可を指定せずNX保存を期待。 |
| 17 | `tests/season-ledger-response.test.js` | D | seasonResponseが返す4フィールドにoverviewがなく、旧期待オブジェクトと不一致。 |
| 18 | `tests/season-legacy-compatibility.test.js` | D | 旧・新の比較用visibleShapeがoverviewを含むが、新しい省容量形式はあらすじを保存しない。 |
| 19 | `tests/season-realistic-tmdb-fixture.test.js` | D | fromTmdbSeasonがoverviewを省くのに、試験は空文字列のoverviewを期待している。 |
| 20 | `tests/season-search-switch-behavior.test.js` | C | 実searchの追加require(_season-refresh-opt-in)を許さないモックが初期化失敗を起こし、旧経路へ戻る。期待は新経路。 |
| 21 | `server response has unique SEO and visible H1 before JS runs` | C | 映画canonicalは現行契約では?id=321、TVのみ&type=tv。試験は映画にも&type=movieを期待。 |
| 22 | `person ledger saves compact credits, retains profile, reuses cache` | A | VM内envに書込み再開指定がないため人物を保存しない。未定義の保存値をJSON.parseして失敗。 |
| 23 | `detail provider cache saves JP only, reuses cache` | A | VM内envに書込み再開指定がないため詳細配信を保存しない。保存済み応答を読む試験と不一致。 |
| 24 | `two simultaneous requests share one first TMDB metadata fetch` | A | 作品固定情報の凍結・未保存経路はloadを直接呼ぶため、2要求で取得2回。取得1回を期待。 |
| 25 | `cached work avoids further metadata fetches` | A | 作品固定情報を保存しないため、2回目もTMDB相当loadを呼び、取得1回を期待する試験が失敗。 |
| 26 | `waiter times out with retryable busy error without duplicate TMDB fetch` | A | 凍結中は初回ロードロック経路に入らず、待機→busy拒否を期待する試験に一致しない。 |
| 27 | `movie and tv with same TMDB number have independent locks` | A | 凍結中は初回ロードロックを取得しないため、movie/tv別ロックの試験期待に一致しない。 |
| 28 | `Redis lock outage fails closed without fetching TMDB` | A | 凍結中は初回ロードロックを取得しないため、ロック障害によるfail-closedの試験に一致しない。 |
| 29 | `Redis read failure after acquiring metadata lock returns storage error without TMDB fetch` | A | 凍結中はロック後の再読取りをしないため、2回目GET障害の試験に一致しない。 |
| 30 | `removal plan does not mutate source` | C | removalPlanはextensionsをseasonsより先に列挙する。試験は先頭をseasonsと決めつけている。seasonsのaction自体は正しい。 |

### 今回の実装に関する追加発見（30件とは別）

1. **新旧データの鮮度優先に穴がある。** 新台帳が古くても互換レコードとして存在すればseries-watchはそれを優先し、その作品の旧キーは読まない。旧キーに新しい情報があっても利用できない挙動を、実ハンドラ＋モックで再現した。比較表はstaleを除外するため、移行中に配信表示が欠ける可能性がある。フラグを本番有効化する前に修正が必要。
2. **詳細で鮮度状態が伝わらない。** readDetailはstaleを返すが、searchの映画/TV詳細は主にdataだけを使い、閲覧者が古い正常データかどうか分からない。未取得/失敗/正常0件のAPI・画面契約まで必要。
3. **旧フォールバックは新更新方針を強制しない。** 新台帳ミス時の旧詳細キャッシュ/関連カードは従来取得を起動し得る。WORK_LEDGER_ENABLEDが無効のTVでは固定情報にwatch/providersをappendする経路もある。新フラグONだけでは「シリーズ閲覧時のTMDB配信取得なし」を保証しない。
4. **作品の軽量化と旧API互換は未完。** extensionsを保持する修正は既存固定詳細の再利用に必要だったが、`extensions.tmdbDetail`と共通フィールドの重複を解消したものではない。v2のみへ置換すると旧詳細がWORK_METADATA_INCOMPLETEとなる経路がある。新規保存の最小形式・サイズ上限・互換アダプターを確定する必要がある。

上記はいずれも本番移行を止める理由。新規テスト失敗0件という前回の報告だけで安全と判定してはいけない。

## 2. 未実装・未検証の一覧

| 分野 | あるもの | 残作業・未検証 |
|---|---|---|
| 公開API→新配信台帳 | movie/TV詳細、関連カード、series-watchの開発用read | visit更新未接続。loopback限定、本番では強制無効。旧フォールバック・stale整合修正 |
| 日次更新 | JST06:00判定・ローカルcronサービス・所有権/CAS | 実Cron未接続、実UpstashのEVAL権限/課金、遅延・停止、期限切れ、予算内完走/再開 |
| 所属・作品ID | 13シリーズ266作品のAPI配列と一致 | 正式な所属台帳への一本化、更新対象との差5作品、固定情報未取得43作品、過去未確定51エントリ |
| 固定作品台帳 | v1、v2試作、確認/項目ロックの純粋関数 | v2から既存詳細応答への完全変換、raw TMDB重複保存除去、全保存経路の確認ロック/CAS、手動欄保護の実データ照合 |
| 人物 | v1、v2正規化・60日判定・v2 preview限定読取り | v2はAPI側allowWrites:false。実人物/大規模フィルモグラフィー、実Redis原子更新、凍結時ID検証/重複取得 |
| シーズン | 遅延取得、NX、更新試作、応答アダプター | overview契約整理、作品台帳との分離、上部件数/下部一覧の同一情報源、実データ・実Redis・モバイル。season=0は既存決定で今回対象外 |
| SEO | 純粋レンダラーとローカル初期HTML試験 | 本番初期HTMLへのルーティング/保存/無効化、canonical/OGPと映画TV同IDの全導線、クローラ応答、費用 |
| 画面・検索 | 13シリーズAPI、鬼滅・比較表・映画TV詳細の一部ブラウザ試験 | 全13ページの実配信・全検索/人物/シーズン/関連作品/モバイル回帰。fixtureからの脱却 |
| 運用 | ローカル復元・フラグOFF試験 | 本番由来安全コピーの隔離復元、月次PCバックアップ、年次評価・定期異常検出、切替中の二重更新停止手順 |
| 費用制御 | 並列3・upstream timeout6.5秒・起動予算240秒 | 全体取得件数/保存量/失敗回数/日月上限、無料残枠確認、停止判定・通知。現状は予算内の完走を保証しない |

## 3. Redis容量・無料枠

本番Redisの資格情報・接続先・契約情報は取得していない。Redisへ接続せず、キー列挙・INFO・コピー・書込み・削除を実行していない。**本番現在容量、移行中最大容量、移行後総容量、無料枠の残量はいずれも未確認。**

| 段階 | 本番（P=現容量、Δ=新台帳増分、B=Redisに置くバックアップ） | 既存ローカル参考モデル |
|---|---|---:|
| 現在 | P：未計測 | 0.167496 MB |
| 移行中ピーク | P+Δ+B+同時ロック/割当余裕：未確定 | 0.703696 MB（+320.1%） |
| 移行後・旧データ保持 | P+Δ：未確定 | 0.547968 MB（+227.2%） |

ローカル参考は旧配信271件＋旧詳細266件、新配信266件、最小作品266件、SEO223件、バックアップ1コピー。人物・シーズン・完全固定詳細・未知の総件数・成長・Redis基礎量等は含まない。**最大容量の上限としては使えない。** 新規増分は0.380472 MB、同Redis内バックアップは0.155728 MB。旧データは削除しない前提。

実作品152件の過去配信を互換形式へ変換した別のローカル標本は、旧0.067088 MB→新0.111040 MB（+65.5%）。これは本番Redisの実測値ではない。

[Upstash公開料金表](https://upstash.com/docs/redis/overall/pricing)を今回読み取り確認。Freeの紹介は保存250MB、50万commands/月、帯域10GB/月（比較表の保存上限には256MB表記もあるため、250MBを保守的な参考値とする）。対象DBがFreeかどうか、残量、地域・レプリカ、支払設定は不明。Pay as You Go等にはFreeの50万commands枠をそのまま適用しない。

**参考モデルが1MB未満でも、無料枠超過の危険なしとは判定できない。** 同一DBの既存データ・他用途・全台帳の成長が不明である。バックアップは可能ならローカルファイル側に保持してRedisへの二重保存を避ける設計を検討するが、本番コピー取得の通信/コマンドも事前に予算化する。

## 4. API・通信・費用リスク

| 項目 | 数値・影響 | 未確認部分/制約 |
|---|---|---|
| 定期TMDB | 271/日→266/日なら8,130→7,980回/30日、約1.85%減 | 対象外5件の方針次第。実稼働回数・レート制限は未計測 |
| Cron時刻 | リポジトリはUTC21時=JST06時の1回 | 旧資料の06/18時2回を根拠に半減とは言わない |
| Redis更新 | 旧約274RPC/日→新約1,330RPC/日。8,220→39,900RPC/30日、約4.85倍 | Lua内部課金・レプリカ倍率は未確認。RPC数=請求commands数とは断定しない |
| 無料commands枠の参考 | 39,900は50万の約8.0% | 残り約46万を使えるという意味ではない。既存読取り/他台帳/コピー/失敗/Lua課金を加算する必要 |
| Luaの感度分析 | 上位5操作にcommit内GET/PTTL/GET/SETとrelease内GET/DELの6操作を別計上する仮定なら11×266×30=87,780/月 | 課金仕様の確定値ではなく安全側の計算例。レプリカ等でさらに増える可能性 |
| 一般失敗時 | 暫定30分待機なら、連続アクセスで最大48試行/日/作品という計算 | 100作品が連続失敗なら4,800取得/日。保存失敗で試行日時を書けない場合はこの間隔すら永続保証しない |
| 表示の読取り | series-watch全新ヒット1 MGET、移行中最大2 MGET | ブラウザHTTPが同じでもRedis回数/JSON量は増える。未取得カードの個別APIも残る |
| Vercel | 読取りRPC増で待機時間・メモリ課金が増え得る。新規APIルートはなし | 実行時間、invocation、CDNヒット率、転送量、プラン残枠は未測定 |
| 完走 | 並列3・240秒で266作品を終えるには、概算で1作品平均約2.7秒以内 | timeout6.5秒が続けば全件完走しない。deferredの翌日/同日再開、失敗時上限が必要 |

公開料金の例：Upstash Pay as You Goのcommands単価は$0.20/10万commands。もしこの単価とRPC=課金1commandを仮定すれば、新定期更新だけで約$0.0798/30日、旧比増分約$0.06336。**これはFree内なら課金されるという意味でも、対象DBの確定請求額でもない。** Lua・レプリカ・保存/帯域・既存利用を含めると変わる。今回は課金を伴う実験は行っていない。

Vercelは既存の接続済み管理APIから設定・デプロイ記録・請求情報を読み取り確認した。請求APIは広い期間では応答サイズ制限、1日窓では期間のずれとサンプル制限があり、対象サイトの月額・無料残枠は確定できなかった。アカウントの具体的な請求明細は公開リポジトリへ保存しない。契約変更・利用上限変更・支払情報取得・環境変数/秘密の取得は行わない。

## 5. 安全な残作業の順序

1. 開発ブランチのデプロイ無効設定を維持し、30件のテスト前提を正規化する。凍結ON/OFFを明示した試験を分け、凍結中の同時取得抑制とID照合も保証する。テストを緩めて通すだけにはしない。
2. stale優先・詳細への状態伝達・新台帳ミス時の旧取得を修正。未取得/失敗/正常0件/古い成功のAPI・画面契約を確定する。
3. 所属の正式な情報源、5件の差分、未確定ID、軽量作品形式と全手動欄/確認ロックを確定する。人物・シーズン・SEOの純粋アダプターと契約を整える。旧データは削除しない。
4. 本番に接続せずに確認できる範囲で、管理画面等の既存の使用量表示・契約・無料残枠の情報を確認する。不明なら本番容量/費用は未確定のまま維持する。取得や接続自体に費用の可能性がある場合は実行前に相談する。
5. 費用ゼロと隔離が確認できた場合に限り、安全なコピーの小さな標本から全台帳のサイズ/件数/ロック/バックアップ/通信を評価する。人物の大規模出演歴と多数シーズンも含めて最大側を見積もり、月50万commands等の契約上限に対して余裕を取る。無料枠内で用意できる隔離環境がなければ停止して報告する。
6. 開発でvisit/Cronの新台帳への接続を実装し、日次の永続進捗/再実行上限、一般24h、タイムアウト/保存失敗/同時実行、全13ページと検索/人物/シーズン/SEO/モバイル、バックアップ復元/切り戻しを試験する。無償が確認できないVercelプレビューは作らない。
7. 修正差分・全試験・実測と最大予測・費用上限・切替/戻し方を再報告する。**その後の本番操作はユーザーの改めての明示承認を待つ。**
8. 承認後の計画としては、小規模な段階切替と監視、旧・新の日次取得の二重実行回避、異常時フラグOFFを先に行う。mainマージ、デプロイ、本番書込み、古いデータ削除の許可を一括推定しない。削除は復元試験後の別承認まで行わない。

**本番反映は未実施。ユーザーの明示承認待ち。**
