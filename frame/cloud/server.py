"""Frame local engine. Bind only to loopback; no external conversion service."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, threading, uuid, re, shutil, mimetypes, time, webbrowser, os

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'downloads'
OUT.mkdir(exist_ok=True)
JOBS = {}
LOCK = threading.Lock()
ACTIVE = threading.Semaphore(1)
PORT = int(os.environ.get('PORT', '8765'))
PUBLIC_ORIGIN = os.environ.get('FRAME_PUBLIC_ORIGIN', os.environ.get('RENDER_EXTERNAL_URL', '')).rstrip('/')

def video_url(raw):
    if not isinstance(raw, str):
        raise ValueError('YouTubeのリンクを入力してください。')
    u = urlparse(raw)
    if u.scheme not in ('https', 'http') or u.username or u.password:
        raise ValueError('YouTubeのリンクを入力してください。')
    ident = None
    if u.hostname == 'youtu.be':
        ident = u.path.strip('/').split('/')[0]
    elif u.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'):
        if u.path == '/watch':
            ident = parse_qs(u.query).get('v', [''])[0]
        elif re.match(r'^/(shorts|embed|live)/', u.path):
            ident = u.path.split('/')[2]
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', ident or ''):
        raise ValueError('動画のリンクを確認してください。')
    return 'https://www.youtube.com/watch?v=' + ident

def options():
    return {'quiet': True, 'no_warnings': True, 'noplaylist': True,
            'socket_timeout': 25, 'retries': 2, 'extractor_retries': 2,
            'js_runtimes': {'node': {}}, 'cachedir': False, 'max_filesize': 512 * 1024 * 1024, 'match_filter': lambda info, **kw: '2時間以内の動画に対応しています。' if (info.get('duration') or 0) > 7200 or info.get('is_live') else None}

def patch(ident, **fields):
    with LOCK:
        JOBS[ident].update(fields)

def download(ident, url, kind, quality):
    import yt_dlp
    folder = OUT / ident
    folder.mkdir()
    def hook(data):
        if data['status'] == 'downloading':
            total = data.get('total_bytes') or data.get('total_bytes_estimate')
            percent = min(99, data.get('downloaded_bytes', 0) / total * 100) if total else None
            patch(ident, percent=percent, message='ファイルを取得しています…')
        elif data['status'] == 'finished':
            patch(ident, percent=None, message='ファイルを変換・結合しています…')
    try:
        opts = options()
        opts.update(outtmpl=str(folder / '%(title).100B.%(ext)s'), progress_hooks=[hook],
                    windowsfilenames=True, restrictfilenames=False)
        if kind == 'audio':
            opts.update(format='bestaudio/best', postprocessors=[{'key':'FFmpegExtractAudio', 'preferredcodec':'mp3', 'preferredquality':'192'}])
        else:
            opts.update(format=f'bv*[height<={quality}][ext=mp4]+ba[ext=m4a]/b[height<={quality}][ext=mp4]/bv*[height<={quality}]+ba/b[height<={quality}]',
                        merge_output_format='mp4', postprocessors=[{'key':'FFmpegVideoConvertor', 'preferedformat':'mp4'}])
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
        files = [p for p in folder.iterdir() if p.suffix == ('.mp3' if kind == 'audio' else '.mp4')]
        if not files:
            raise ValueError('保存ファイルが見つかりません。FFmpegの設定を確認してください。')
        patch(ident, state='done', percent=100, file=str(files[0]), message='取得できました。')
    except Exception as exc:
        patch(ident, state='error', error='取得できませんでした。' + str(exc)[:550])
        shutil.rmtree(folder, ignore_errors=True)
    finally:
        ACTIVE.release()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def allowed(self):
        # Reject cross-origin requests and DNS rebinding; the engine is not a public proxy.
        host = self.headers.get('Host', '')
        allowed_hosts = [f'localhost:{PORT}', f'127.0.0.1:{PORT}']
        if PUBLIC_ORIGIN:
            allowed_hosts.append(urlparse(PUBLIC_ORIGIN).netloc)
        if host not in allowed_hosts:
            self.reply(403, {'error': 'ローカル画面から操作してください。'})
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://localhost:{PORT}', f'http://127.0.0.1:{PORT}', PUBLIC_ORIGIN):
            self.reply(403, {'error': '外部ページからの操作はできません。'})
            return False
        return True

    def reply(self, code, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def send_file(self, path, attachment=False):
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(path.stat().st_size))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        if attachment:
            from urllib.parse import quote
            self.send_header('Content-Disposition', "attachment; filename*=UTF-8''" + quote(path.name))
        self.end_headers()
        with path.open('rb') as f:
            shutil.copyfileobj(f, self.wfile, length=256 * 1024)

    def do_GET(self):
        if not self.allowed(): return
        path = urlparse(self.path).path
        if path == '/api/health':
            return self.reply(200, {'ok': True, 'ffmpeg': bool(shutil.which('ffmpeg'))})
        if path.startswith('/api/jobs/') or path.startswith('/api/files/'):
            ident = path.rsplit('/', 1)[-1]
            with LOCK:
                job = dict(JOBS.get(ident, {}))
            if not job:
                return self.reply(404, {'error': '保存処理が見つかりません。'})
            if path.startswith('/api/jobs/'):
                return self.reply(200, {k:v for k,v in job.items() if k != 'file'})
            if job.get('state') != 'done' or not Path(job.get('file', '')).is_file():
                return self.reply(404, {'error': 'ファイルはまだ準備できていません。'})
            return self.send_file(Path(job['file']), attachment=True)
        if path in ('/', '/index.html'):
            return self.send_file(ROOT / 'index.html')
        if path == '/favicon.ico':
            self.send_response(204); self.end_headers(); return
        self.reply(404, {'error': 'ページが見つかりません。'})

    def do_POST(self):
        if not self.allowed(): return
        try:
            if self.headers.get_content_type() != 'application/json':
                return self.reply(415, {'error': 'JSON形式で送信してください。'})
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 8192:
                return self.reply(400, {'error': '入力サイズを確認してください。'})
            body = json.loads(self.rfile.read(size))
            url = video_url(body.get('url'))
            if self.path == '/api/info':
                import yt_dlp
                with yt_dlp.YoutubeDL(options()) as ydl:
                    info = ydl.extract_info(url, download=False)
                if info.get('is_live'):
                    raise ValueError('配信中の動画には対応していません。終了した動画を指定してください。')
                return self.reply(200, {k:info.get(k) for k in ('title', 'duration', 'channel')})
            if self.path == '/api/download':
                kind = body.get('kind')
                quality = str(body.get('quality'))
                if kind not in ('video', 'audio') or quality not in ('480', '720', '1080', '2160'):
                    raise ValueError('保存形式と画質を確認してください。')
                if not shutil.which('ffmpeg'):
                    raise ValueError('FFmpegをインストールしてから再起動してください。')
                if not ACTIVE.acquire(blocking=False):
                    return self.reply(409, {'error': 'ほかの保存処理が進行中です。完了してから再度お試しください。'})
                ident = uuid.uuid4().hex
                # Drop old temporary downloads when starting a new job.
                now = time.time()
                with LOCK:
                    for old in list(JOBS):
                        if now - JOBS[old]['created'] > 86400 and JOBS[old]['state'] in ('done', 'error'):
                            shutil.rmtree(OUT / old, ignore_errors=True)
                            del JOBS[old]
                    JOBS[ident] = {'state':'running', 'percent':None, 'created':now}
                threading.Thread(target=download, args=(ident,url,kind,quality), daemon=True).start()
                return self.reply(202, {'id':ident})
            self.reply(404, {'error': '操作が見つかりません。'})
        except (ValueError, TypeError, AttributeError) as exc:
            self.reply(400, {'error': str(exc)})
        except Exception as exc:
            detail = str(exc)
            if 'Sign in to confirm' in detail or 'not a bot' in detail:
                self.reply(502, {'error': 'YouTubeがこのサーバーからの取得に本人確認を求めています。この公開サーバーでは動画を取得できません。'})
            else:
                self.reply(502, {'error': '動画情報を取得できませんでした。動画の公開状態と接続を確認してください。'})

if __name__ == '__main__':
    import yt_dlp
    httpd = ThreadingHTTPServer(('0.0.0.0' if PUBLIC_ORIGIN else '127.0.0.1', PORT), Handler)
    print(f'Frame: http://127.0.0.1:{PORT}  / 終了するには Ctrl+C')
    if not PUBLIC_ORIGIN:
        threading.Timer(1, lambda: webbrowser.open(f'http://127.0.0.1:{PORT}')).start()
    try: httpd.serve_forever()
    except KeyboardInterrupt: httpd.server_close()
