# Frame — スマホブラウザ版

公開先: https://frame-video-aki.onrender.com/

## 標準の保存方法

1. YouTube動画またはShortsのURLを入力。
2. MP4動画と画質を選択。「編集用MP4で保存」は最初から有効。
3. 「編集用MP4をダウンロード」を押す。
4. 無料サービスで取得した後、Frameが通常MP4へ自動で整形して保存。
5. 自動保存が始まらない端末では、表示された「編集用MP4を保存」を押す。

再アップロード、PC起動、Googleログイン、APIキー、残高の登録は不要。
整形はFFmpegのストリームコピーで行い、取得ファイルの映像・音声・fpsを維持します。
最大128MB・10分。元動画と完成ファイルは一時保存され、元動画は処理後、
完成ファイルは約1時間後に削除されます。

## 無料の公式API

動画の取得にはWebDownloaderの公開APIを使用します。
https://save.brianrianrehan.com/docs

- POST /api/v1/download?wait=false にURL・format=video・quality・outputFormat=mp4を送信。
- 202のdownloadId/statusUrlに従って進捗を確認。
- status=completedとdownloadUrlが揃った場合のみファイルを取得。
- FrameがFFmpegで再格納した完成ファイルのみを公開。
- 正しいアプリ名のUser-Agentを送り、ジョブ内ではCookieJarを共有。
- ファイルとリダイレクトはsave.brianrianrehan.comのHTTPS・APIパスに限定。
- 開始リクエストは再送しません。429は利用制限として表示し、回避・自動再試行しません。
- APIキー付きの有料取得処理は使用しません。

無料サービスの混雑、利用制限、動画の公開状態により取得できない場合があります。

## 通常保存・MP3・既存ファイル

「編集用MP4で保存」を外すと従来の公式埋め込み方式でMP4を保存できます。
MP3音声も従来の埋め込み方式です。
https://video-download-api.com/button-api

「Download」→「Download Now!」で取得。広告ポップアップは許可しない設定です。
埋め込み方式の保存完了はクロスオリジンのためFrame側では判定しません。
偽の保存成功や履歴追加は行いません。

すでに保存したMP4は「MP4が読み込めないとき」から整形できます。

## 構成と検証

cloud/index.html: UIと無料自動編集・公式iframe連携。
cloud/server.py: 公開画面・無料取得・無劣化MP4再格納・従来の取得API。
PC版はpc/配下に独立して残しています。
Renderは既存のfreeプランとDockerfileを利用。PORTとRENDER_EXTERNAL_URLを参照します。

テスト: `python -m unittest discover -v`

ローカルHTTPサービスを使い、APIキーがない状態での取得・進捗確認・MP4再格納・保存、
取得失敗、利用制限、不正なリダイレクト、アップロード制限を検証しています。
指定のYouTube動画RtC5AH-q2bAの無料取得と1080p/60fps、再格納前後の映像・音声ハッシュ一致、
完成ファイルの全体デコードも確認。Alight Motion実機での読み込みは未検証です。
