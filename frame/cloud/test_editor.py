import hashlib
import http.client
import json
import struct
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
import server


def boxes(path):
    found = []
    with path.open('rb') as f:
        while raw := f.read(8):
            size, kind = struct.unpack('>I4s', raw)
            found.append(kind)
            if size == 1:
                size = struct.unpack('>Q', f.read(8))[0]
                size -= 8
            if size == 0:
                break
            f.seek(size - 8, 1)
    return found


class EditorMP4Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        server.OUT = Path(cls.tmp.name)
        cls.sample = server.OUT / 'fragmented.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=160x120:rate=60:duration=1', '-f', 'lavfi',
                        '-i', 'sine=duration=1', '-c:v', 'libx264', '-threads', '1',
                        '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov',
                        str(cls.sample)], check=True)
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        server.PORT = cls.httpd.server_port
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', server.PORT, timeout=10)
        conn.request(method, path, body, headers or {})
        response = conn.getresponse()
        status, raw = response.status, response.read()
        conn.close()
        return status, raw

    def wait_job(self, ident):
        for _ in range(100):
            status, raw = self.request('GET', '/api/jobs/' + ident)
            job = json.loads(raw)
            if job['state'] != 'running':
                return job
            time.sleep(.05)
        self.fail('conversion did not finish')

    def test_fragmented_mp4_becomes_regular_mp4_without_losing_frames(self):
        self.assertIn(b'moof', boxes(self.sample))
        status, raw = self.request('POST', '/api/editor', self.sample.read_bytes(),
                                   {'Content-Type': 'application/octet-stream'})
        self.assertEqual(status, 202, raw)
        ident = json.loads(raw)['id']
        job = self.wait_job(ident)
        self.assertEqual(job['state'], 'done', job)
        self.assertNotIn('file', job)
        status, raw = self.request('GET', '/api/files/' + ident)
        self.assertEqual(status, 200)
        output = server.OUT / 'result.mp4'
        output.write_bytes(raw)
        kinds = boxes(output)
        self.assertNotIn(b'moof', kinds)
        self.assertLess(kinds.index(b'moov'), kinds.index(b'mdat'))
        def video_hash(path):
            return subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path),
                                            '-map', '0:v:0', '-c', 'copy', '-f',
                                            'hash', '-hash', 'sha256', '-'])
        self.assertEqual(video_hash(self.sample), video_hash(output))
        self.assertFalse((server.OUT / ident / 'source.mp4').exists())

    def test_nonvideo_input_returns_error_and_removes_upload(self):
        status, raw = self.request('POST', '/api/editor', b'<html>not a video</html>',
                                   {'Content-Type': 'application/octet-stream'})
        self.assertEqual(status, 202, raw)
        ident = json.loads(raw)['id']
        self.assertEqual(self.wait_job(ident)['state'], 'error')
        self.assertFalse((server.OUT / ident).exists())

    def test_oversized_upload_rejected_before_reading(self):
        status, raw = self.request('POST', '/api/editor', None,
                                   {'Content-Type': 'application/octet-stream',
                                    'Content-Length': str(129 * 1024 * 1024)})
        self.assertEqual(status, 413, raw)

    def test_cross_origin_upload_rejected(self):
        status, _ = self.request('POST', '/api/editor', b'x',
                                  {'Content-Type': 'application/octet-stream',
                                   'Origin': 'https://unrelated.example'})
        self.assertEqual(status, 403)


if __name__ == '__main__':
    unittest.main()
