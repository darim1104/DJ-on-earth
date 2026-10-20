# 캐시 없이 실행하는 서버:  python3 server.py   →  http://localhost:8123
import http.server, socketserver
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", 8123), H) as s:
    print("http://localhost:8123 에서 실행 중 (끄려면 control+C)"); s.serve_forever()
