# Frame — スマホブラウザ版

公開先: https://frame-video-aki.onrender.com/

## 保存の流れ

1. 通常動画またはShortsのURLを入力。
2. MP4 / MP3と画質を選択。
3. 「保存ボタンを表示」を押す。
4. 画面内のVideo Download API公式ボタン「Download」で取得開始。
5. 「Download Now!」に変わったら押してファイルを保存。

PC起動やGoogleログインは不要です。リンクは外部のVideo Download APIに送信されます。
公式の埋め込みインターフェースを利用: https://video-download-api.com/button-api
独自に非公開APIへアクセスしたり、第三者サイトの保護を回避したりする実装はありません。

## 構成

cloud/index.html: FrameのUIと公式iframe連携。
cloud/server.py: 画面配信と従来の取得API。公開画面から従来の取得APIは呼びません。
PC版はpc/配下に独立して残しています。
Dockerfileを使いRenderで配信。PORTとRENDER_EXTERNAL_URLを参照します。

## 検証

- 公式連携先で約10秒の公開テスト動画を変換。
- 出力MP4を取得しffprobeで映像・音声、再生時間9.97秒を確認。
- Frame内で公式iframeと取得操作を確認。
- MP3への形式切替、画質選択、入力検証、形式変更時の取得画面リセットをブラウザで確認。
- 実Android/iOS端末での保存は未検証。
- 動画の種類、元画質、提供元の混雑や制限により取得できない場合があります。
- 保存成功はクロスオリジンのためFrame側では判定しません。偽の成功表示や履歴追加は行いません。
