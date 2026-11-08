# Codex実装引継ぎ指示（草案・未承認）
2026-11-09。**ユーザーの内容確認と明示承認があるまで実装開始・本番操作しないこと。**

## 必須の前提
Repository: `mogwaimog-creator/doko-de-mireru`
Working branch: `work/four-ledgers-20261107`
main、本番Vercel、本番Upstash、課金設定、既存データの削除を禁止。新たな有料サービスを契約しない。ユーザー向けルールは `prototype/USER_RULES_REVIEW.md`、配信台帳の現状は `prototype/STREAMING_HANDOFF_STATUS_20261108.md` を参照。

## 最初に監査するファイル
- `api/search.js` の movie/tv 詳細返却、検索・シーズン経路。
- `api/_detail-providers-cache.js`（旧詳細キャッシュ）、`api/_redis.js`（Upstash REST）、**`api/series-watch.js`（現行のシリーズ共通読み取りAPI、`doko:watch:v3:`）**。
- `detail.html` の `renderMovie`、`renderSeries`、SEO更新ガード。
- `prototype/work-ledger.js`, `streaming-ledger.js`, `person-ledger.js`, `season-ledger.js`, `seo-ledger.js`, `seo-detail-renderer.js`。
- `prototype/streaming-update-schedule.js`, `streaming-refresh-guard.js`, `streaming-distributed-lock.js`, `streaming-refresh-flow.js`, `streaming-write-safety.js`。
- `prototype/detail-series-payload.js`, `series-streaming-adapter.js`, `redis-series-streaming-readonly.js`、`prototype/DETAIL_SERIES_INTEGRATION_PLAN.md`。

## 実装順序（承認後）
1. **現状確認と契約の固定**：作品/配信/人物/シーズン/SEOのキー形式、スキーマ、既存ページのAPI利用、配信サービス比較表と鬼滅の刃のデータ取得経路を一覧化。**mainで確認済み：`kimetsu.html` と `streaming.html` はともに `/api/series-watch` を利用し、既存のRedis `doko:watch:v3:` から保存済み情報を取得する。未共通と決めつけて再実装しない。** 13シリーズ全ての所属と重複作品を確認。
2. **試作コードの危険な旧分岐を統一**：`streaming-ledger.js` の `eligible(...,isSeries)` はシリーズなら常にtrueとなる旧挙動。新しい `streaming-update-schedule.js` の6時JST/24時間判定に統一。閲覧時にシリーズ作品を再取得しない。
3. **台帳保存形式の確定**：映画/TVの複合キー、固定情報の確認ロック、ページ固有の手動欄、JP配信区分、最終正常取得時刻・最終試行時刻・エラー・最終日次試行日、version/CASを定義。未取得と正常取得0件を区別。旧キーを即削除しない。
4. **更新実装**：見る順番所属作品はJST毎朝6時1回、その他は最終成功24時間後の次回アクセス時。更新失敗時は旧成功情報を保持。再試行クールダウンは暫定30分、決定前にユーザーへ確認。失敗した6時更新を当日再実行するかは未確定。
5. **同時実行・原子的保存**：Redis SET NX PX相当でロックを取得し、所有トークンをサーバー側で比較して原子的に解除。期限切れ後の旧ワーカーの書き込みを防ぐCAS/フェンシング。ロック中の他リクエストは古い正常データを返す。保存失敗を取得失敗と混同しない。ネットワーク断・ロックTTL切れ・同時更新・途中停止を隔離環境で試験。
6. **既存APIへの段階的接続**：機能フラグで新台帳の読み取りを追加。映画/TV詳細レスポンスの互換性を維持。`seriesStreamingByWork` は取得済み空配列のみ「見放題なし」、未取得・失敗はキー省略。余分なAPIを増やさない。**比較表と鬼滅の刃は既に既存共有キャッシュを利用しているため、その経路を保護し、新台帳への移行が必要か・どの互換アダプターが必要かを先に検証する。**
7. **SEOと表示**：初期HTMLのtitle/description/h1/canonical/OGP、映画とTVのcanonical区別、人物/シーズン/特集導線、モバイル表示を回帰確認。
8. **テスト・費用評価**：`node --test`、ブラウザ・プレビュー、隔離Redisでテスト。TMDB呼び出し・Vercel Functions/CDN・Redis容量・失敗時リトライ数を計測。増額リスクを示し、追加課金が必要なら実装を停止し相談。
9. **移行前の報告**：バックアップ・復元テスト、機能フラグ無効化での即時ロールバック、差分・テスト結果・費用見積もりを日本語で報告し、ユーザーの本番反映承認を待つ。

## 試作を本番完成品として扱わない
- オフラインV8模擬テスト成功 ≠ Node.js・実ブラウザ・実Redisでの成功。
- `streaming-refresh-guard.js` は単一プロセス内のみ。複数Vercelワーカーでは共通Redisロックが必要。
- `streaming-distributed-lock.js` と `streaming-write-safety.js` は原子的なストレージ操作の**契約だけ**。実Redisのコマンド・権限・互換性を検証。
- `streaming-refresh-flow.js` はCAS付きの実保存処理にまだ結合していない。書き込み競合、取得成功後の保存失敗、エラー重複、日次更新の再試行方針は要補強。
- 既存の `doko:detail-providers:v1:` は旧キャッシュ。新共通配信台帳と混同しない。

## 完了条件
- 全13シリーズ、作品詳細、関連作品カード、配信サービス比較表で配信表示が整合。
- 6時JST日次更新と24時間アクセス更新の区別が実測で確認できる。
- エラー/未取得/正常0件/古い正常データが混同されず、ロック競合・保存失敗時にも既存情報が保護される。
- SEO・人物・シーズン・検索・モバイルの回帰テストを通過。
- API・Redis・Vercel費用に想定外の増加がないことを計測。
- **ユーザー承認前に本番公開しない。**
