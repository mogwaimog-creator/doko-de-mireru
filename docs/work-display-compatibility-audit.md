# 作品台帳の表示互換性・静的確認（2026-11-07）

対象: 開発ブランチ。GitHub上のコードを読むだけの確認。Redis/TMDB/本番接続なし。

## 確認
- `detail.html` はTV詳細レスポンスの `number_of_seasons` と `number_of_episodes` を表示する。
- `api/search.js` の `getTvDetail` は元のTMDBデータの `number_of_seasons`、`number_of_episodes`、`created_by`、`original_language` などを参照する。
- 現在の `api/_work-display-adapter.js` は上記の一部をまだ返さない。**このまま既存APIに接続してはいけない**。
- 既存の `api/_work-ledger.js` には `seasons` がある。シーズン数・話数を既存情報から導出できる場合があるが、TMDBの総数と一致するかは未検証。シーズン0、未公開シーズン、件数の差に注意。
- `created_by`（制作者）と `original_language`（原語）は現在の軽量台帳の共通項目にはない。**ユーザーの承認なしに保存項目を増やさない**。

## 次のローカル確認
1. 既存の映画/TV詳細の全参照フィールドと表示用アダプターを照合する。
2. 既存の決定済み保存項目だけで同等表示できるか、特にTVのシーズン/話数・制作者・原語を検証する。
3. 不足を解消できない場合は、項目追加や表示変更を実装せず、差分と費用影響をユーザーに提示して相談する。
4. 既存台帳の全件書換え、本番Redisへの接続、デプロイは行わない。

## テスト状況
- `tests/work-display-adapter.test.js` は開発ブランチに作成済み。**この監査では未実行**。
- 現時点では画面表示の完全互換は未確認。
