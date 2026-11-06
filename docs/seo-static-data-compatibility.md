# 静的作品データと既存詳細画面の互換性監査（2026-11-04）

対象：`detail.html` の `loadMovie` → `renderMovie` と `api/_work-ledger.js` の `normalizeWork`。読み取り専用調査。本番には未適用。

| 既存画面が参照する項目 | 共通作品台帳の項目 | 判定 |
|---|---|---|
| `id`, `title` | `id`, `title` | 直接対応 |
| `original_title` | `originalTitle` | 名前の変換が必要 |
| `release_date` | `releaseDate` | 名前の変換が必要 |
| `poster_path` | `posterPath` | 名前の変換が必要 |
| `runtime` | `runtimeMinutes` | 変換が必要。TVの1話時間との意味の整合も要確認 |
| `vote_average` | `voteAverage` | 名前の変換が必要 |
| `director: {id,name}` | `directors[]` | 配列から1件を選ぶ変換が必要。構造の確認も必要 |
| `cast[]`, `genres[]`, `overview`, `status`, `seasons[]` | 同名または近い項目あり | 内部要素の構造を検証する必要あり |
| `streaming[]`, `rental[]`, `purchase[]`, `free[]` | 共通作品台帳に保存しない | **配信台帳／更新済み配信情報から合成が必須** |
| `series[]` | `collectionId`, `collectionName` など | 既存のシリーズ表示に必要な構造が足りるか未確認 |
| `number_of_seasons`, `number_of_episodes`, `media_type`, `link` | 対応する直列項目なし | 表示要件を調べる必要あり |

## 結論
1. **共通作品台帳のJSONをそのまま `renderMovie` に渡すことはできない。** 項目名・構造が異なる。
2. 固定情報の静的JSONを生成する場合、画面用アダプター（変換関数）と、配信台帳からの動的情報の合成が必要。
3. 現行 `loadMovie` は1つの `/api/search` レスポンスで両者を受け取る。固定データを別取得にすると、配信情報だけを安全に取得できるAPIの有無を確認しなければ、**呼び出し回数が逆に増える可能性**がある。
4. `renderMovie` はFAQ・SEO説明文・配信見出しにも配信情報を使うため、静的JSONのみで表示を完成させない。
5. 次の実装前に、現行APIレスポンスの実データ形状と、配信専用エンドポイント／キャッシュ方式を確認する。朝6時・夕方18時の配信更新を維持する。

本番URL・既存テンプレート・Cron・Vercel設定は変更しない。
