# 共通作品台帳：公開前の検証手順

対象ブランチ: `feature/work-ledger-foundation-20261103`

## 1. ローカルでまとめてテスト（外部APIを呼ばない）

```bash
node --test tests/work-ledger-foundation.test.js tests/work-ledger-redis.test.js tests/work-anomalies.test.js tests/work-review.test.js tests/work-first-load.test.js tests/work-busy-message.test.js
```

すべて成功するまでは本番公開しない。テストは模擬Redisを利用するため、実Redis/TMDBの動作を保証しない。

## 2. 重点確認

- 同時アクセスで作品メタデータを二重取得しない（短時間の正常系）
- 取得担当が失敗した場合にロックを解除する
- 待機2.5秒を超えた場合、重複TMDB取得せず `WORK_METADATA_BUSY` を返す
- APIが503と `Retry-After: 5`、`no-store` を返す
- 詳細画面で混雑時だけ専用メッセージを表示する
- 映画とTVの同じIDを別キーで保存する
- Redis障害時のフォールバックと、他人のロックを解除しないこと
- 異常履歴は元の作品データを変更せず、最新30件を保持する
- フラグOFFで従来の挙動を保つ

## 3. 未解決・本番前の判断

- 実RedisのLua EVAL/SET NXとタイムアウトの結合確認
- `api/search.js` 全体の回帰テスト（作品詳細・配信区分・人物・検索）
- 画面上の実表示確認（PC/スマートフォン）
- 負荷試験は本番に向けて大量リクエストを送らず、隔離環境で実施
- `WORK_LEDGER_ENABLED` は本番で有効化しないまま維持する

この手順書の作成はテスト実行・合格を意味しない。
