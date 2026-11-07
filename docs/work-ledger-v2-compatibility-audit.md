# 作品台帳 v2 互換性監査（2026-11-07）
本資料は作業ブランチ限定の読み取り監査。**本番切替は未承認・未実施**。

## 確認できた既存依存
1. `api/_detail-metadata-cache.js` は v1 の `extensions.tmdbDetail` を読み、その完全な TMDB 形式の JSON を詳細ハンドラへ返す。v2 のみでは `WORK_METADATA_INCOMPLETE` となる。
2. `api/work-detail.js` は v1 の `PUBLIC_FIELDS` を公開し、`backdropPath`、`directors`、`collectionId`、`collectionName`、`voteCount` 等を含む。v2 は `director` 単数・`rating` に変更しており、契約が異なる。
3. `api/_work-from-tmdb.js` は v1 に監督最大10名、出演最大30名、役名、背景画像、コレクション、シーズンポスター、評価数を保存する。v2 は監督1名・出演8名等に削減する。
4. `api/_work-v2-detail-adapter.js` は現時点で **基本項目だけ** を再構築する試作品。既存の詳細画面に必要な全フィールドを保証しない。
5. `api/_detail-providers-cache.js` の配信キャッシュは作品メタデータとは別。互換性作業で配信取得頻度を変更しない。

## 切替前に必須の確認
- 詳細画面の JavaScript/API 消費箇所を列挙し、v2 にないフィールドの表示影響を判定する。
- 映画・TV・コレクション・シーズン・人物リンク・シリーズリンクで表示比較する。
- `pageExtras`、確認OK、ロック、手動入力をバックアップと変換後で照合する。
- 作品 ID と type、欠損項目、旧版データの復元手順を検証する。
- 本番切替前に最新バックアップを取り、明示的な承認を得る。

## 移行禁止条件
- `extensions.tmdbDetail` を削除するだけの in-place 置換。
- 旧詳細画面が v2 に未対応のまま Redis キーを切り替える。
- オフライン変換ファイル `work-ledger-projection-LOCAL-DO-NOT-IMPORT.json` を直接インポートする。
