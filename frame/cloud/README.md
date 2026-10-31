# Frame スマホブラウザ版 — 配置待ち

同じサーバーから画面と取得APIを配信するため、PC起動もChatGPT認証も不要です。

- Dockerfile: Python 3.12、Node.js 22、FFmpeg、yt-dlpを導入。
- RenderはRENDER_EXTERNAL_URLから公開URLを取得して待ち受けます。
- 他社ホストの場合はFRAME_PUBLIC_ORIGINに公開HTTPS URL、PORTに待ち受けポートを指定。
- 最大2時間・単体ファイル512MB制限。容量上限は形式により完全な総容量制限ではありません。
- 取得ファイルは一時領域。URLはランダムなジョブID付きで配信します。
- 取得は全体で同時1件。個人用の小規模運用を想定。
- Android Chrome/iPhone Safariで開き、取得完了後のリンクから保存する設計。
- Render接続と実サーバーへの配置は未完了。実YouTube取得・実機保存も未検証。
- YouTube側でデータセンターIPが制限される場合は取得できません。

ローカルAPI検証: python3 -m unittest test_cloud -v

Renderに配置するには、このリポジトリのDockerfileを使ったWebサービスを作成します。
Renderがこの内部Git URLを直接取得できるかは接続後に確認が必要です。
未接続の時点で外部サービスの作成・課金操作は行っていません。
