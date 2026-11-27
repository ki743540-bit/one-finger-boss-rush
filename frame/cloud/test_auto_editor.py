import contextlib
import http.client
import json
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
import server
from test_editor import boxes


class AutoEditorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_out = server.OUT
        server.OUT = Path(self.tmp.name)
        self.sample = server.OUT / 'fixture.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=160x120:rate=60:duration=1', '-c:v', 'libx264',
                        '-threads', '1', '-movflags', 'frag_keyframe+empty_moov',
                        str(self.sample)], check=True)
        sample = self.sample.read_bytes()
        self.starts = 0
        self.polls = 0
        self.fail_provider = False
        self.unsafe_redirect = False
        owner = self

        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                u = urlparse(self.path)
                query = parse_qs(u.query)
                if u.path == '/api/v2/download':
                    owner.starts += 1
                    if query.get('apikey') != ['fixture-key']:
                        self.send_response(401); self.end_headers(); return
                    owner.assertEqual(query.get('format'), ['1080'])
                    owner.assertEqual(query.get('url'), ['https://www.youtube.com/watch?v=RtC5AH-q2bA'])
                    data = {'success': True, 'id': 'fixture', 'url': None,
                            'progress_url': owner.base + '/api/progress?id=fixture'}
                elif u.path == '/api/progress':
                    owner.polls += 1
                    data = ({'progress': 1000, 'success': 0} if owner.fail_provider else
                            {'progress': 500, 'success': 0} if owner.polls == 1 else
                            {'progress': 1000, 'success': 1,
                             'download_url': owner.base + '/api/v2/download/file'})
                elif u.path == '/api/v2/download/file':
                    if owner.unsafe_redirect:
                        self.send_response(302)
                        self.send_header('Location', 'http://127.0.0.1:1/api/private')
                        self.end_headers(); return
                    self.send_response(200)
                    self.send_header('Content-Length', str(len(sample)))
                    self.end_headers(); self.wfile.write(sample); return
                else:
                    self.send_response(404); self.end_headers(); return
                raw = json.dumps(data).encode()
                self.send_response(200); self.end_headers(); self.wfile.write(raw)

        self.provider = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        self.base = 'http://127.0.0.1:' + str(self.provider.server_port)
        self.stack = contextlib.ExitStack()
        # Substitute only the external HTTP service. All download, polling,
        # remuxing, and application routes exercise production code.
        self.stack.enter_context(patch.object(server, 'PROVIDER_BASE', self.base, create=True))
        self.stack.enter_context(patch.object(server, 'PROVIDER_DOMAIN', '127.0.0.1', create=True))
        self.stack.enter_context(patch.object(server, 'PROVIDER_POLL_SECONDS', .01, create=True))
        self.stack.enter_context(patch.dict('os.environ', {'VDA_API_KEY': 'fixture-key', 'FRAME_AUTO_EDIT': '1'}))
        self.app = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.old_port = server.PORT
        server.PORT = self.app.server_port
        for service in (self.provider, self.app):
            threading.Thread(target=service.serve_forever, daemon=True).start()

    def tearDown(self):
        for service in (self.app, self.provider):
            service.shutdown(); service.server_close()
        self.stack.close()
        server.PORT = self.old_port
        server.OUT = self.original_out
        server.JOBS.clear()
        self.tmp.cleanup()

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.app.server_port, timeout=10)
        conn.request(method, path, json.dumps(body).encode() if body else None,
                     {'Content-Type': 'application/json'})
        response = conn.getresponse()
        result = response.status, response.read()
        conn.close()
        return result

    def test_youtube_link_downloads_regular_mp4_without_file_upload(self):
        status, raw = self.request('POST', '/api/auto-editor',
                                   {'url': 'https://youtu.be/RtC5AH-q2bA?si=tracking', 'quality': '1080'})
        self.assertEqual(status, 202, raw)
        ident = json.loads(raw)['id']
        for _ in range(100):
            _, raw = self.request('GET', '/api/jobs/' + ident)
            job = json.loads(raw)
            self.assertNotIn('fixture-key', raw.decode())
            if job['state'] != 'running':
                break
            time.sleep(.03)
        self.assertEqual(job['state'], 'done', job)
        status, raw = self.request('GET', '/api/files/' + ident)
        self.assertEqual(status, 200)
        result = server.OUT / 'output.mp4'; result.write_bytes(raw)
        kinds = boxes(result)
        self.assertNotIn(b'moof', kinds)
        self.assertLess(kinds.index(b'moov'), kinds.index(b'mdat'))
        self.assertEqual(self.starts, 1)
        self.assertGreaterEqual(self.polls, 2)
        def video_hash(path):
            return subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path),
                                            '-map', '0:v:0', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'])
        self.assertEqual(video_hash(self.sample), video_hash(result))

    def test_unconfigured_feature_does_not_start_chargeable_request(self):
        with patch.dict('os.environ', {'VDA_API_KEY': ''}):
            status, raw = self.request('POST', '/api/auto-editor',
                                       {'url': 'https://youtu.be/RtC5AH-q2bA', 'quality': '1080'})
        self.assertEqual(status, 503, raw)
        self.assertEqual(self.starts, 0)

    def test_unapproved_feature_does_not_start_chargeable_request(self):
        with patch.dict('os.environ', {'FRAME_AUTO_EDIT': '0'}):
            status, _ = self.request('POST', '/api/auto-editor',
                                     {'url': 'https://youtu.be/RtC5AH-q2bA', 'quality': '1080'})
        self.assertEqual(status, 503)
        self.assertEqual(self.starts, 0)

    def test_unsupported_quality_does_not_start_provider_request(self):
        status, _ = self.request('POST', '/api/auto-editor',
                                 {'url': 'https://youtu.be/RtC5AH-q2bA', 'quality': '99999'})
        self.assertEqual(status, 400)
        self.assertEqual(self.starts, 0)

    def failed_job(self):
        status, raw = self.request('POST', '/api/auto-editor',
                                   {'url': 'https://youtu.be/RtC5AH-q2bA', 'quality': '1080'})
        self.assertEqual(status, 202, raw)
        ident = json.loads(raw)['id']
        for _ in range(100):
            _, raw = self.request('GET', '/api/jobs/' + ident)
            job = json.loads(raw)
            if job['state'] != 'running':
                break
            time.sleep(.03)
        self.assertEqual(job['state'], 'error', job)
        self.assertNotIn('fixture-key', raw.decode())
        self.assertEqual(self.request('GET', '/api/files/' + ident)[0], 404)
        self.assertFalse((server.OUT / ident).exists())

    def test_failed_provider_never_returns_unprocessed_video(self):
        self.fail_provider = True
        self.failed_job()
        self.assertEqual(self.starts, 1)

    def test_untrusted_redirect_is_rejected_and_partial_file_removed(self):
        self.unsafe_redirect = True
        self.failed_job()

    def test_provider_url_rejects_private_and_deceptive_destinations(self):
        for value in ['file:///etc/passwd', 'http://localhost/api/private',
                      self.base.replace('127.0.0.1', '127.0.0.1.attacker.example') + '/api/file',
                      self.base.replace('127.0.0.1', 'secret@127.0.0.1') + '/api/file']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                server.provider_url(value)


if __name__ == '__main__':
    unittest.main()
