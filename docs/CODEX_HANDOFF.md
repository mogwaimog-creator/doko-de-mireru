# Codex引継ぎ（2026-11-14）

このファイルを最初に読み、GitHubのmain・作業ブランチとVercelのデプロイ履歴を読み取り専用で再確認してから続行する。予定を完了済みと解釈しない。

## 作業目的と承認済み方針

- `mogwaimog-creator/doko-de-mireru` の保存済み表示に伴う不要なRedisガード書き込みを減らす。
- Redis修正 `44879d5f430ca13838e4a538d917e71b92345f92` をmainへ統合することはユーザー承認済み。
- GitHubとVercelの接続は維持する。解除は禁止。
- `vercel.json` の `git.deploymentEnabled` をboolean `false` にして全ブランチのGit自動デプロイを停止する。
- 既存サイト、環境変数、ドメイン、朝6時JSTのCron (`0 21 * * *` UTC) を維持する。
- 上記設定・Redis修正・本書をまとめて反映し、必要な本番デプロイは原則1回（今回のユーザー承認あり）。想定は自動0回＋手動本番1回。
- 想定外の連続デプロイが発生しそうなら中断・報告する。承認範囲を超えた追加デプロイや設定変更は行わない。

## 現在の状態（未完了を含む）

- 実装ブランチ: `test/redis-read-guard-20261114`。引継ぎ更新ブランチ: `docs/codex-handoff-20261114`。
- 開始時main: `de03bd5775328b09de8ff796c3425513e00f8b4c`（最新fetchでも一致）。
- Redis修正コミット: `44879d5f430ca13838e4a538d917e71b92345f92`。ローカル作成済み。
- 自動停止設定: `2753ccc4149bf55ced1ef609534430a4c88b178d` に含め、GitHubの作業ブランチへpush済み。リモートのboolean falseを確認済み。
- 引継ぎ書: `2753ccc` で初回push済み。作業の区切りに後続のdocsコミットで更新する。
- main統合: PR #47 (https://github.com/mogwaimog-creator/doko-de-mireru/pull/47) で完了。統合コミット `cc8a4f07622f5847481b4c1bcad208e82869c85d`。
- 今回のVercelデプロイ作成: 0回。初回push後も対象SHAのデプロイ0件を確認。手動作成リクエストは未送信。
- デプロイ前の現行本番: `dpl_Hgo3EqZ8Z9CvdxXt77VDvRFpceLx` / main `de03bd5` / READY。
- Vercelプロジェクト: `prj_FoQ5WZ15y54KYpUIekYm6mW1IWq9` (`doko-de-mireru`)。
- Vercelチーム: `team_DuaQ7ug0BuRNFShbwRoNX2kU` (`mogwaimog-1706`)。

## 完了した実装・調査

Redisガードを遅延登録し、純粋な読み取りではcontrolのGETだけを実施。最初の書き込み/外部取得前にenterし、所有ticketだけfinishする。検索・SEO用の監査済み読み取りLuaは登録不要、未知のコマンドはガード対象。

変更済みファイル（Redisコミット）:
- `api/_cutover-runtime-dev.js`
- `api/_release-application.js`
- `api/_release-connection.js`
- `tests/lazy-request-guard.test.js`
- `tests/paused-ledger-reads.test.js`
- `.github/workflows/paused-ledger-reads.yml`
- `docs/REDIS_READ_GUARD_20261114.md`

今回追加するファイル/設定:
- `vercel.json`: git設定のみ変更。routes/crons/functionsは維持。
- `docs/CODEX_HANDOFF.md`: 作業の区切りに更新。

公式仕様: https://vercel.com/docs/project-configuration/git-configuration
`git.deploymentEnabled: false` は全ブランチのGit自動デプロイを停止する。ブランチ名ごとの設定は未指定ブランチが有効になるため使用しない。

## テストと既知の問題

直近の比較（ローカルRedis、TMDB応答はモック）:
- 修正前main: 82件中67成功・15失敗。
- Redis修正: 91件中76成功・15失敗。
- 失敗15件はテスト名・エラー内容が一致。比較対象で新規失敗0。
- `acquisition-guard.test.js` の9件は廃止済み `guardModule.initial` を呼ぶ旧仕様。
- `new-work-ingest.test.js` の6件は旧予約/初期control前提が現行と異なる。
- 上記15件を成功扱いしない。今回の範囲外として記録する。
- 新規登録、24時間更新、停止競合、並列処理、エラー時の旧データ保持、朝6時更新、SEOを検証済み。
- 保存済み作品の送信コマンド3→2、Lua内部含むローカル実行7→2。実際に更新する要求は事前GETが1件増える。Upstash課金実測値ではない。
- 今回の停止設定追加後にも91件を再実行し、76成功・既知の15失敗。失敗内容は修正前mainの記録と一致し、新規失敗0。

## GitHub検証と統合済み状態

- 停止設定コミット: `2753ccc4149bf55ced1ef609534430a4c88b178d`。
- PR #47先端: `4e98534ff0fc3573a5f8714257a9b7b9c301f82a`。
- GitHub Actions: Recovery guard regression (#43465900962)、Paused ledger reads (#43465901139) はともにsuccess。
- ブランチpush・PR作成後の自動デプロイは0件。main統合後の履歴も確認してから本番を作成する。
- 次の本番作成はまだ未実施。今回の1回分の作成枠は未使用。

## 次に実施する手順

1. 設定同一性検証と91件の再テストは完了。後続の変更がdocsだけであることを確認する。
2. 停止設定込みの初回pushは完了。後続の先端とPRについてもVercel履歴を確認。旧Redis単独コミットを別途pushしない。
3. PR #47のmain統合とCI成功は完了。引継ぎ更新をmainへ反映後、確定mainのfalseとデプロイ履歴を再確認。
4. 自動作成が0件であることを確かめ、確定したmainコミットから既存Vercelプロジェクトへ手動本番デプロイを1回だけ作成。
5. 作成リクエスト直前に本書へ「デプロイ要求予定/未送信」を記録。要求を送ったらデプロイID・SHAを記録。途中で中断した場合は新規作成を再送せず、履歴から該当デプロイの有無を調べる。
6. READY、対象SHA、既存ドメイン、Cron設定、少量の表示確認を検証。本書へ実測結果を追記し、自動停止を維持したdocs更新だけを反映。docs更新で再デプロイしない。

## 再開時と費用の注意

- リモート履歴が正。ローカルだけにあるwork/のログは別セッションに存在しない可能性がある。
- デプロイ作成APIは再送しない。タイムアウト時も先に履歴で確認する。`forceNew`、自動retry、大量プレビューを使わない。
- 引継ぎ書の更新のために自動デプロイを有効化しない。本書だけの変更を理由に手動デプロイしない。
- falseがない古いブランチをpush/更新しない。再開時もmainと対象先端のgit設定を確認する。
- Upstashの実データ削除・初期化は禁止。テストは127.0.0.1:16379の隔離Redis。TMDBや本番APIへの大量アクセスをしない。
- 資格情報や `.env` の値を本書へ記載・コミットしない。環境変数の変更/再作成やドメイン付け替えをしない。
- Git連携は解除しない。CLI/APIによる手動デプロイや外部CIはgit自動停止とは別経路である。
- 既存ワークフローの自動デプロイ処理追加は不要。手動SEOプレビューworkflowは今回実行しない。
- 今回の承認はこの修正の統合と必要な本番反映のため。将来の別変更の統合・本番デプロイを包括承認したものではない。
