# シーズンAPI切替前の互換性監査（2026-11-07）

対象：開発ブランチ `work/four-ledgers-20261107`。本番未接続。

## 確認済み
- `detail.html` の `loadSeason` は `/api/search?id=...&type=tv&season=...` を呼び出し、`renderEpisodes` が `season_name`、`season_number`、`episodes[].episode_number/name/air_date/runtime/overview` を使用。
- `renderSeasons` は作品詳細の `seasons[].season_number/name/episode_count` を使用。v2作品アダプターがこれらを生成する。
- 現行 `api/search.js` の `getTvSeason` はシーズン取得に加えてTV本体の `watch/providers` も取得する。新しい台帳ではエピソード表示に不要な追加取得を省く設計。
- 現行シーズン応答には `id/title/poster_path/air_date/episode_count/streaming/rental/purchase` も含まれるが、現行 `renderEpisodes` では使用しない。
- GitHubのデフォルトブランチ検索では `season_name` の参照は `api/search.js` と `detail.html` に見られた。ただし検索は全呼び出し元の網羅を保証しない。

## 切替前に必須
1. 本番に影響しない統合テストで、既存の `/api/search` のシーズン分岐と新アダプターのレスポンスを比較する。
2. 新ルートの `fetchSeason` 実装はシーズンAPIのみを呼び、TMDBのエラー時は成功として空配列を保存しない。
3. Redisの読み書きは新しい `doko:season:v1` 名前空間のみ。初回保存は `SET ... NX`、競合時は既存値を優先。
4. 現行APIの `season` パラメーターは `parseInt` と `Math.max(1,...)` で補正するが、新ルートは厳密に検証する。互換性を確認するまで既存APIを置換しない。
5. シーズン0は現行UIで一覧カードを表示しない。新ルートは0を許可するが、公開時の挙動は別途決定する。
6. 本番切替・デプロイ・Redis移行はユーザー承認後のみ。既存APIは保持し、切り戻し可能な構成にする。

## 現状
部品単位のオフラインテストはPASS。実際のブラウザ表示・Redis・TMDB統合テストは未実施。
