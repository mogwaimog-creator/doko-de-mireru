# ドコデミレル？ 緊急最小構成・原因究明・12月再開 引継ぎ（2026-11-13）

## 重要：本番変更禁止
2026-11月末まで本番は緊急最小構成を維持。原因究明、Googleインデックス回復調査、新しい「見る順番」のローカル制作は進めるが、ユーザー承認なしに main マージ、デプロイ、環境変数、Firewall、Upstash Redis、課金設定、既存台帳を書き換えない。追加課金は絶対に避ける。調査は読み取り専用、必要なら作業ブランチで修正案を準備。自動で通常運用へ戻さない。

## 背景・問題
- 2026-10後半から外部アクセス（特に /api/search、/detail.html）とCDN Requests/Functionsの増加、Redis COMMANDSの異常な増加が問題。BOT、内部処理、Redisへの複数回アクセスの寄与率は未確定。
- Upstash無料枠コマンド増加、人物台帳の新規取得・リンク停止、作品台帳の新規取得停止を段階的に導入。新旧キャッシュ・台帳移行、SEO用HTML生成、Google検索流入減少も課題。
- 2026-11-13の公開後ログ（直近1時間の実行ログ集計）で /detail.html 110件、/api/search 18件のエラーログ。これはアクセス件数でもUpstash課金COMMANDSでもない。新デプロイの detail.html では未登録作品に対して WORK_ACQUISITION_STOPPED が出ており、停止処理が動作。BOTかどうかは未確定。旧デプロイ時の POPULAR FALLBACK ERROR 等も同時間帯のログに混在するため、deploymentIdを分けて分析する。
- Google表示の低下は未解決。FirewallのGooglebot遮断、GSCインデックス状況、SSR HTML、canonical/robots/sitemap、取得時ステータスを別々に検証。推測で原因を確定しない。

## 2026-11-13実施済み
1. PR #44 までの本番を土台に、PR #46 https://github.com/mogwaimog-creator/doko-de-mireru/pull/46 を作成。#45の未登録作品早期停止も#46に含むため、#45は未マージのまま。
2. PR #46では保存済み作品・人物・シーズンを新規TMDB取得なしで表示。未登録作品は取得準備・lock/quotaチェック前に停止。検索は保存済み作品インデックスから返す。配信台帳の重複読み取りを削減。回帰テスト成功。
3. 追加コミット ef6cc28：index.html に緊急最小構成（html[data-emergency-minimal="1"]）。配信サービス別・詳細条件等を非表示、人気自動取得を停止。検索カードの配信ロゴ・TVアニメ詳細リンク修正。ユーザーのスクリーンショットで作品名検索、シリーズ、映画特集、ジャンル、保存済み作品詳細の表示を確認。ジャンル/おすすめの一部は残る。トップ初回API呼び出しはローカルテストで1→0件。
4. #46のみ main に squash merge。commit de03bd5775328b09de8ff796c3425513e00f8b4c。Vercel production dpl_Hgo3EqZ8Z9CvdxXt77VDvRFpceLx が READY。
5. 当初独自ドメイン doko-de-mireru.com は旧 dpl_FbrvvgtLzn5i3upj5pGaqq9zjQC4 を指していた。Vercel request_promote で新デプロイを昇格し、list_aliases で doko-de-mireru.com → dpl_Hgo3EqZ8Z9CvdxXt77VDvRFpceLx、promote aliases completed を確認。ユーザーが新トップのスクリーンショットを提示し、シリーズ・詳細も見えると報告。
6. 本番Redisのデータ、Firewall、Vercel設定、PR #45は変更なし。自動テスト成功。ただし本番Upstash COMMANDS削減率は未測定。

## 現在の運用ルール
- 維持：作品名検索（映画・ドラマ・アニメ）、保存済み作品詳細・配信ロゴ、13シリーズ「見る順番」、ジブリ・名作映画など特集、SEO用HTMLとサイトマップ。
- 一時停止/非表示：トップの配信サービス別検索、人気作品の自動取得、詳細条件検索など。完全なUI復帰には html[data-emergency-minimal="0"] だけでなく、対応する処理と表示の実地確認が必要。
- 保存済み作品でも検索インデックスに未登録なら検索結果に出ない可能性。国別検索、人気順などに制限。未登録作品の詳細は取得停止で表示できない。Googlebotにも503が返る可能性があり、SEO調査対象。
- 新規作品・人物・シーズン情報のTMDB取得は停止。既存データは保持、削除しない。人物ページの導線も一時的に制限中。取得停止設定 NON_STREAMING_ACQUISITION_PAUSED、PERSON_LEDGER_WRITES_PAUSED 等の実環境値は再開時に読み取り専用で確認し、推測で解除しない。
- 配信情報：13シリーズ約266ユニーク作品は日本時間毎朝6時更新。その他は最終成功から24時間経過後の次回閲覧時に更新。失敗時は前回情報保持。配信更新停止は今回の対象外。

## 調査の優先順（本番変更禁止）
1. Upstashの実測 COMMANDS を時系列で比較（変更前後、時間帯、6時Cron前後、実際の月次リセット日）。Vercel Functions/CDNリクエストと同じ時間軸で突き合わせる。Redisのプログラム上の呼び出し回数と請求COMMANDSは異なる。大規模SCAN/書込をしない。
2. Vercel runtime logs と observability で /detail.html、/api/search、/person.html、/api/streaming 等の回数・失敗をdeployment別に分類。繰り返し未登録ID、Googlebotか外部BOTか、内部呼び出し、guard Lua、lock、index、streamingロゴの読取回数を検証。現在ログにある WORK_ACQUISITION_STOPPED は想定停止と本当の障害を区別。
3. Google Search Console：検索パフォーマンスの表示回数/クリック/掲載順位、ページのインデックス、URL検査、クロール統計、Googlebotの403/429/5xx、Firewall challenge/deny、SEO HTML/canonical/robots/sitemap を照合。GSCは画面・接続で実測できなければユーザーに必要な画面だけ依頼。
4. 修正案はローカルまたは別ブランチで作り、mainには反映しない。根拠・推定効果・副作用・ロールバック案を残す。
5. 13シリーズの既存テンプレを使い、新しい「見る順番」をローカルで制作。作品情報・ポスター・順番・FAQ等は本番Redisを使わず準備し、配信情報は公開時に共通台帳連携を確認。制作途中でもmainにマージしない。

## 月末・月初の解除チェックリスト（すべてユーザー承認制）
- 既存オートメーション「Upstashリセット・人物ページ・最小構成解除確認」ID Automation_9fea30a36fac8191a56076e3895adb4f、Asia/Tokyo、11/25～12/5毎日9時の条件監視を更新済み。
- 実際のUpstash無料枠リセットとCOMMANDS/ストレージ、Vercel課金リスク、Bot・エラーの沈静化を確認。月替わりだけでリセットと判断しない。
- 6時配信更新、保存済み作品検索/詳細/人物ページ、SEO・Googlebotのアクセスを点検。
- 別々に解除を検討：(A) 人物ページと人物リンク、(B) 新規作品/人物/シーズン取得、(C) トップの緊急最小構成（配信サービス別・人気・新着・詳細条件・自動取得）。一括解除を前提にしない。
- 再開時にはアクセス負荷・Redis COMMANDSの監視、再停止条件、SEOへの影響を確認し、ユーザー承認を得てから変更。
- 実測できない情報は「未確認」と報告し、勝手に解除・課金・大量取得しない。

## 参照
- PR #46: https://github.com/mogwaimog-creator/doko-de-mireru/pull/46
- #46以前の調査報告: docs/paused-ledger-reads-20261113.md （PR #46ブランチで作成）
- 本番: https://doko-de-mireru.com/
- Vercel deployment: https://vercel.com/mogwaimog-1706/doko-de-mireru/Hgo3EqZ8Z9CvdxXt77VDvRFpceLx

この文書は引継ぎ専用ブランチに保存。mainや本番サイトには反映しない。
