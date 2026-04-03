import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


PORT = int(os.environ.get('PORT', '8080'))
HOST = os.environ.get('HOST', '127.0.0.1')
API_KEY = os.environ.get('ANTHROPIC_API_KEY')


class OperationSwoleHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/api/coach':
            self.send_error(404, 'Not found')
            return

        key = self.headers.get('X-User-Api-Key') or API_KEY
        if not key:
            self._send_json(503, {
                'error': 'AI coach is not configured.',
                'detail': 'Set the ANTHROPIC_API_KEY environment variable before starting server.py, or enter your API key in the app.',
            })
            return

        try:
            content_length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(content_length).decode('utf-8')
            payload = json.loads(body or '{}')
        except (ValueError, json.JSONDecodeError):
            self._send_json(400, {'error': 'Invalid JSON request body.'})
            return

        request = urllib.request.Request(
            'https://api.anthropic.com/v1/messages',
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
            method='POST',
        )

        try:
            with urllib.request.urlopen(request) as response:
                data = response.read()
                content_type = response.headers.get('Content-Type', 'application/json; charset=utf-8')
                self.send_response(response.status)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as error:
            data = error.read()
            content_type = error.headers.get('Content-Type', 'application/json; charset=utf-8')
            self.send_response(error.code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except urllib.error.URLError as error:
            self._send_json(502, {
                'error': 'Failed to reach Anthropic API.',
                'detail': str(error.reason),
            })

    def _send_json(self, status_code, payload):
        data = json.dumps(payload).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    server = ThreadingHTTPServer((HOST, PORT), OperationSwoleHandler)
    print(f'Operation Swole running at http://{HOST}:{PORT}')
    server.serve_forever()