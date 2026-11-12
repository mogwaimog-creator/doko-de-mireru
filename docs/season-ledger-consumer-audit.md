# シーズンAPI利用箇所の一次監査（2026-11-07）

対象：開発ブランチ `work/four-ledgers-20261107`。本番環境は変更していない。

## 確認したファイル
`detail.html`、`series.html`、`mcu.html`、`godzilla.html`、`starwars.html`、`index.html`、`api/search.js`。

## 確認結果
- `detail.html` は `loadSeason(tvId,seasonNumber,type)` で `/api/search?id=...&type=...&season=...` を取得し、`renderEpisodes(data)` へ渡す。
- `renderEpisodes` が参照するエピソード表示項目は新 `seasonResponse` に存在し、専用の契約テストが合格した。
- 上記で調査した `series.html`、`mcu.html`、`godzilla.html`、`starwars.html`、`index.html` では、単純な文字列検索によるシーズンAPIクエリと `loadSeason` の呼び出しは見つからなかった。
- `api/search.js` は旧 `getTvSeason` の応答で `title`、`poster_path`、`air_date`、`episode_count`、`streaming`、`rental`、`purchase` を返す。一方、新 `seasonResponse` はそれらを含まない。
- `detail.html` 内に配信情報を読む処理はあるが、それがシーズンAPIの応答に依存するとは、この一次監査では確認されていない。作品詳細APIの配信表示と区別する必要がある。

## 限界と公開条件
これは**指定した7ファイルの一次的な文字列・コード監査**であり、リポジトリ全体の参照検索、動的なURL生成、外部利用者、ブラウザ上の実表示を網羅したものではない。「旧APIの返却項目をすべて削除して安全」とはまだ断定できない。

次の作業：
1. 全HTML/JSとAPI呼び出しの横断検索（可能ならローカル全ファイル検索）で旧シーズン応答への依存を確認。
2. シーズン0の入力正規化を統一。
3. ロック付き更新は別フラグで明示的に有効化し、書き込みガードと模擬試験を通す。
4. 実接続/本番デプロイは明示承認まで行わない。
