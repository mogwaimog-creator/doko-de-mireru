# 共通台帳移行：Codex引継ぎ前の実装状況（2026-11-08）

## 範囲と安全条件
- 作業ブランチ：`work/four-ledgers-20261107`。main、本番サイト、本番Redis、Vercel課金設定には触れない。
- この文書は**試作・模擬テストの現状整理**であり、本番導入完了を意味しない。
- ユーザーによるルール確認後にCodexへ実装を依頼する。仕様変更は事前相談。

## 決定済みの更新方針
- 共通配信台帳を映画・TVの `type:id` で一元管理し、詳細・シリーズ・比較表などが同じ配信情報を利用する。
- 「見る順番」13シリーズ（鬼滅の刃を含む）の作品：日本時間**朝6時に1日1回**の更新対象。同じ作品が複数ページにあっても取得を重複させない。
- その他の作品：最後の正常取得から**24時間経過後、次のアクセス時**に更新。
- 取得失敗は「配信なし」ではない。最終成功データを保持し、エラーを記録する。
- 本番の旧6時・18時更新は、新システム移行までそのまま。新方針と混同しない。
- 人物・作品の固定情報と配信情報は別台帳。確認OKの固定項目は自動上書きしない。

## 開発ブランチにある試作（本番未接続）
| 分野 | 試作コード | 模擬テスト | 状態 |
|---|---|---|---|
| 共通配信レコード | `prototype/streaming-ledger.js` | `tests/streaming-ledger-status.test.js`（6件） | 基本状態の確認済み |
| 旧詳細キャッシュの読み取り橋渡し | `prototype/redis-series-streaming-readonly.js` | `tests/redis-series-streaming-readonly.test.js`（8件） | 読み取り模擬のみ |
| 更新タイミング | `prototype/streaming-update-schedule.js` | `tests/streaming-update-schedule.test.js`（9件） | 判定のみ |
| 単一実行環境内の重複防止 | `prototype/streaming-refresh-guard.js` | `tests/streaming-refresh-guard.test.js`（4件） | 実プロセス間では未保証 |
| 複数実行環境のロック契約 | `prototype/streaming-distributed-lock.js` | `tests/streaming-distributed-lock.test.js`（4件） | Redis原子操作は未接続 |
| 取得・保存の制御 | `prototype/streaming-refresh-flow.js` | `tests/streaming-refresh-flow.test.js`（4件） | 模擬ストレージのみ |
| バージョン付き安全保存 | `prototype/streaming-write-safety.js` | `tests/streaming-write-safety.test.js`（4件） | CAS契約の模擬のみ |
| 詳細内の関連作品ロゴ | `prototype/series-streaming-adapter.js`, `prototype/detail-series-payload.js`, `detail.html` | 関連テストあり | 実APIへの接続なし |
| SEO・作品・人物・シーズン | `prototype/*-ledger.js` 等 | 関連テストあり | 本番移行未完了 |

上記のテスト件数は各テストを**オフラインJavaScript模擬環境で実行**した結果。Node.js、ブラウザ、本番Redis、Vercelでの統合試験は未実施。

## 未実装・Codexに依頼する作業
1. 既存の `api/search.js` と関連詳細APIから共通配信台帳を読み取る経路を、フラグで切替可能に実装。既存表示を維持し、障害時は安全に旧経路へ戻せるようにする。
2. 13シリーズの所属情報を作品台帳から取得し、作品単位で朝6時の更新対象を確定。**定期実行の保証、失敗した日の扱い、初回登録時の扱い**を検証する。
3. その他作品の24時間経過後アクセス時更新。試作の「失敗後30分再試行抑制」は**暫定値**。再試行時の同時アクセスとAPI呼び出し増を検証する。
4. Redisの原子的ロック取得（例：SET NX PX）、所有トークンを照合した原子的解除、期限切れ・遅延処理・ロック喪失時の**古い書き込み防止（fencing/CAS）**を実装する。GET→DELの二段操作は禁止。
5. 作品レコードの原子的な比較更新（CAS）を実装。保存失敗・途中停止・再試行・複数ワーカー競合を実Redisの隔離環境で試験する。**単にロックを取るだけでは保存競合を防げない**。
6. 更新失敗・配信0件・未取得・古い正常データの表示区別。前回正常情報は残しつつ、古い情報を「最新」と誤表示しない。
7. 詳細・見る順番・配信サービス比較表・鬼滅の刃専用表示が同じ配信情報を参照するか監査。配信ロゴ重複、movie/tv混同、レンタルと見放題の混同を検証。
8. 作品・人物・シーズン・SEO台帳との整合、サーバー初期HTMLのSEO、旧キャッシュとの共存、移行時のバックアップ・復元・ロールバックを確認。
9. Node.jsテスト、ブラウザ確認、隔離Redis試験、アクセス負荷・TMDB呼び出し回数・Upstash容量・Vercel費用の見積もりを実施。ユーザー承認前に本番へ反映しない。

## 試作上の制約・要修正
- `streaming-ledger.js` の `eligible(...,isSeries)` は旧試作のままで、シリーズ時に常にtrueを返す。**新更新判定 `streaming-update-schedule.js` に統一しないと危険**。
- `streaming-refresh-flow.js` の保存契約は模擬。取得成功後の保存失敗、ロックのTTL切れ、更新の原子性、エラーの重複蓄積を本番向けに再設計する。
- 更新開始時のロック取得に失敗した側は旧成功データを返し、無制限に再試行しない。
- 30分の再試行間隔、1回の更新に許す件数・並列数、失敗時の翌日扱いはCodex引継ぎ前の**要確認**項目。
- Redis容量削減方針：配信は日本のみ保存。旧キー削除はバックアップ・復元テスト後、明示的な許可を得て行う。

## 最終確認
この文書だけで本番実装を開始しない。ユーザー向けの全決定事項一覧とCodex向け実装指示書を別途作成し、双方の整合性を確認してから移行判断する。
