# Codex引継ぎ（2026-11-14 JST）

再開時はこのファイルを最初に読み、GitHubのmainとVercelのデプロイ履歴を読み取り専用で確認する。予定を実績に読み替えない。下記の本番デプロイはすでに1回実施済みであり、再送・再作成しない。

## 作業目的と承認済みの方針

- 対象: `mogwaimog-creator/doko-de-mireru`。
- 保存済み作品の閲覧・検索・シリーズ配信情報の読み取りに伴う不要なRedisガード操作を削減する。
- Redis修正 `44879d5` のmain統合と、必要な本番デプロイはユーザー承認済み。本番は原則1回にまとめる。
- GitHubとVercelの接続は維持する。連携解除は禁止。
- `vercel.json` の `git.deploymentEnabled` をboolean `false` とし、全ブランチのGit自動デプロイを停止する。
- 既存サイト、環境変数、ドメイン、朝6時JSTのCronを維持する。
- 想定外の連続デプロイが発生しそうな場合は中断して報告する。
- この承認は今回の修正・設定・引継ぎ更新のためのもの。将来の別変更の統合や本番デプロイを包括承認したものではない。

## 完了した作業

1. 純粋な読み取りではcontrolのGETだけを行い、最初の書き込み/外部取得直前にガード登録するよう修正。所有したticketだけをfinallyで解放する。停止競合、quota、ロック、fencing、失敗時の旧データ保持を維持。
2. 監査済みの検索・SEO読み取りLuaはticket登録を省略。未知のコマンド/スクリプトは引き続きガード対象。
3. `git.deploymentEnabled: false` をRedis修正と同じブランチ先端へ入れてからpush。旧Redis単独コミットのpushは行っていない。
4. PR #47でmainへ統合。GitHubの2つの回帰workflowはともにsuccess。
5. PR #48で、main統合済み・本番未実施の時点の引継ぎをmainへ記録。
6. 確定したmain `5980937` から手動本番デプロイを1回作成。READYを確認後、同じビルドを本番へ昇格。昇格による再ビルド/追加デプロイはない。
7. 既存の `doko-de-mireru.com` が新デプロイを参照していることをVercel Alias APIで確認。`doko-de-mireru.vercel.app` の既存308リダイレクト設定も維持。
8. 環境変数23件のID・key・type・target・updatedAt・返却値を作業前後で比較し、変更なしを確認（decrypt=false。秘密値は記録していない）。
9. Cron (`/api/update-streaming`, `0 21 * * *` UTC = 毎朝6時JST)、routes、Functions設定は修正前mainと同一。デプロイ対象のAPI/テストコードは検証済みRedisコミットと同一。
10. この引継ぎ書を区切りごとに作成・push。デプロイ作成直後のIDも `8366cff` で作業ブランチへ記録済み。今回の最終記録はdocs更新だけで、再デプロイしない。

## コミット・ブランチ・PR

|用途|識別子|
|---|---|
|開始時main|`de03bd5775328b09de8ff796c3425513e00f8b4c`|
|Redis修正|`44879d5f430ca13838e4a538d917e71b92345f92`|
|Git自動停止と初回引継ぎ|`2753ccc4149bf55ced1ef609534430a4c88b178d`|
|PR #47の先端|`4e98534ff0fc3573a5f8714257a9b7b9c301f82a`|
|Redis/設定のmain統合|`cc8a4f07622f5847481b4c1bcad208e82869c85d`（PR #47）|
|本番反映前の引継ぎ|`aa1d3b2977a9ee60ac3e5adef862b1eef2ff4466`|
|実際にデプロイしたmain|`5980937ef2e8484a217097f220941c16ef159034`（PR #48統合）|
|本番作成直後の引継ぎ|`8366cff`（作業ブランチへpush済み）|
|実装ブランチ|`test/redis-read-guard-20261114`|
|引継ぎ更新ブランチ|`docs/codex-handoff-20261114`|

- PR #47: https://github.com/mogwaimog-creator/doko-de-mireru/pull/47 （統合済み）
- PR #48: https://github.com/mogwaimog-creator/doko-de-mireru/pull/48 （統合済み）
- この最終記録自体のコミット/統合IDは `git log -- docs/CODEX_HANDOFF.md` とGitHubのPR履歴から確認する。本書内に自分自身のSHAは埋め込まない。
- デプロイ後のmainにdocsだけの追加コミットがある場合、そのための再デプロイは不要。アプリコードと設定の差分を確認する。

変更したファイル:
- `api/_cutover-runtime-dev.js`
- `api/_release-application.js`
- `api/_release-connection.js`
- `tests/lazy-request-guard.test.js`
- `tests/paused-ledger-reads.test.js`
- `.github/workflows/paused-ledger-reads.yml`
- `docs/REDIS_READ_GUARD_20261114.md`
- `vercel.json`
- `docs/CODEX_HANDOFF.md`

## テスト結果と既知の問題

- 修正前main: 82件中67成功・15失敗。Redis修正/停止設定追加後: 91件中76成功・15失敗。cancelled/skip 0。
- 失敗15件のテスト名とエラー内容は変更前mainと一致。検証対象で新規失敗0。
- `acquisition-guard.test.js` の9件: 廃止済み `guardModule.initial` を要求する旧仕様テスト。
- `new-work-ingest.test.js` の6件: 旧予約方式/初期controlの前提が現行と異なる。これら15件の整理は未実施であり、成功扱いしない。
- ローカルRedisとモックTMDBで、新規登録、24時間の更新境界、停止競合、並列登録、エラー時の既存データ保持、13シリーズ266作品の6時更新、SEO、検索を確認。
- GitHub Actions成功: Recovery guard regression `43465900962`、Paused ledger reads `43465901139`。
- 保存済み作品の送信コマンド3→2、Lua内部込みのローカル実行7→2。更新を伴う要求は事前GETが1件増える。Upstashの課金COMMANDSの実測ではない。

## push・main統合・Vercel反映の実績

- 実装ブランチ: push済み。main: PR #47で統合済み。
- 自動Gitデプロイ: 0回（実装ブランチpush、PR作成、main統合、引継ぎ更新後の履歴で確認）。
- 手動本番デプロイ: **1回のみ**。作成APIは1回だけ送信。preview作成0回。
- デプロイID: `dpl_4EyPmEBUFSVeXhyhY2GXSnsSuNws`。
- 対象SHA: `5980937ef2e8484a217097f220941c16ef159034`。READY。
- 作成日時: 2026-11-14 01:48 JST頃。その後同じビルドを本番へ昇格。
- 公開サイト: https://doko-de-mireru.com/
- デプロイ管理画面: https://vercel.com/mogwaimog-1706/doko-de-mireru/4EyPmEBUFSVeXhyhY2GXSnsSuNws
- 固有URL: https://doko-de-mireru-qif3cd02g-mogwaimog-1706.vercel.app
- 作業前本番/戻し先候補: `dpl_Hgo3EqZ8Z9CvdxXt77VDvRFpceLx` (`de03bd5`)。ロールバックは実施していない。
- プロジェクト: `prj_FoQ5WZ15y54KYpUIekYm6mW1IWq9` (`doko-de-mireru`)。
- チーム: `team_DuaQ7ug0BuRNFShbwRoNX2kU` (`mogwaimog-1706`)。

## 未完了の確認と次の手順

1. **本番画面/APIの通常ブラウザでの疎通確認は未完了**。カスタムドメインと固有URLへの少量の自動取得は、どちらもVercel Security Checkpointの429でアプリ到達前に止まった。ブラウザツールも `Browser Use could not read requirements` で起動できなかった。サイト障害と断定しない。通常の利用者ブラウザでトップ・保存済み詳細を少量確認する。保護設定を弱めたり、新規デプロイを作ったりしない。
2. デプロイのREADY・対象SHA・本番ドメインの参照先は管理APIで確認済み。アプリの実レスポンス200を確認したという意味ではない。新デプロイのerror/fatal runtime logは指定窓内で0件だったが、自動取得がWAFで止まっているため実利用の成功保証ではない。
3. 次回6時JSTのCron実行結果の観測は未実施。Cron設定と更新ロジックは維持済み。確認のために手動で大量更新やCron再実行を行わない。
4. 本番トラフィックでのUpstash削減率・課金数の実測と旧仕様テスト15件の整理は未実施。別作業として扱う。
5. 今回の最終docsコミットがmainに入っているか、再開時はPR履歴で確認する。まだならdocsだけを統合してよいが、同じ承認済み作業の完了記録に限る。docsのための本番デプロイは禁止。

## 追加費用・大量デプロイを避けるための注意

- **このデプロイは作成済み。タイムアウト/中断後も先に履歴とIDを調べ、新規作成APIを再送しない。** `forceNew`、自動retry、追加previewを使わない。
- 引継ぎ書更新のために自動デプロイを有効化しない。手動デプロイもしない。
- falseがない古いブランチをpush/更新しない。mainだけでなく対象ブランチ先端にも `git.deploymentEnabled: false` があることを先に確認。
- GitHub/Vercel接続は維持する。mainのGit設定falseを削除しない。将来Git連携を再設定する場合は自動デプロイ再開に注意。
- 環境変数、ドメイン、Cron、WAF/認証設定を勝手に変更しない。Git自動停止とCLI/API/外部CIによる手動作成は別経路。
- Upstash実データ削除・初期化は禁止。テストは127.0.0.1:16379の隔離Redis。TMDBや本番APIに大量アクセスしない。
- 資格情報、`.env`、共有リンク/保護バイパストークンを本書やGitへ記録しない。疎通ツールの一時共有リンクは永続設定として扱わない。
- リモート履歴が正。ローカルのwork/ログが別セッションに存在するとは限らない。
- ローカルで実装は専用ブランチを使用し、mainで直接作業しない。
