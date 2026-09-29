"""振り分けボードの画面（web/）と、振り分けの API（POST /classify）を出す。標準ライブラリの http.server だけで動く。

    python -m router.server --model model/jeff-0.8b      # → http://127.0.0.1:8765/
"""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from router.model import JeffModel
from router.routing import route
from router.teams import load_teams

WEB = Path(__file__).resolve().parent.parent / "web"
FILES = {"/": ("board.html", "text/html"), "/board.js": ("board.js", "text/javascript"), "/board.css": ("board.css", "text/css")}


def make_handler(model: JeffModel, teams):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = self.path.split("?")[0]
            if path in FILES:
                name, kind = FILES[path]
                return self.reply(200, kind + "; charset=utf-8", (WEB / name).read_bytes())
            if path == "/teams":
                body = {"threshold": teams.threshold, "teams": teams.teams}
                return self.reply(200, "application/json", json.dumps(body, ensure_ascii=False).encode())
            self.reply(404, "text/plain", b"not found")

        def do_POST(self):
            if self.path != "/classify":
                return self.reply(404, "text/plain", b"not found")
            text = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"{}").get("text", "").strip()
            if not text:
                return self.reply(400, "text/plain", b"text is empty")
            ranking, ms = model.classify(text, teams.instructions, teams.criteria)
            decided = route(ranking, teams.threshold)
            body = {"ranking": ranking, "ms": ms, "team": decided.team, "probability": decided.probability,
                    "runner_up": decided.runner_up, "automatic": decided.automatic}
            self.reply(200, "application/json", json.dumps(body, ensure_ascii=False).encode())

        def reply(self, code, kind, body):
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    return Handler


def main():
    parser = argparse.ArgumentParser(description="日本語の問い合わせを担当に振り分ける画面を出す")
    parser.add_argument("--model", default="model/jeff-0.8b", help="Jeff のモデルを落とした場所")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--threads", type=int, help="CPU のスレッド数（既定は全部）")
    args = parser.parse_args()
    model, teams = JeffModel(args.model, args.threads), load_teams()
    print(f"http://127.0.0.1:{args.port}/ を開いてください", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(model, teams)).serve_forever()


if __name__ == "__main__":
    main()
