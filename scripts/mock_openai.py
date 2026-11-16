"""Tiny OpenAI-compatible Chat Completions mock for testing live mode offline.

It streams back an answer that quotes the recalled memories it was given, so
you can see recall working without spending tokens. Not used in production.

    python scripts/mock_openai.py 8790
    OPENAI_BASE_URL=http://127.0.0.1:8790/v1 OPENAI_API_KEY=mock ...
"""

import json
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        system = next((m["content"] for m in body["messages"] if m["role"] == "system"), "")
        if isinstance(system, list):
            system = " ".join(p.get("text", "") for p in system)
        recalled = re.findall(r"^\[(\d+)\] (.*)$", system, flags=re.M)
        answer = f"(mock LLM) I was given {len(recalled)} recalled memories."
        if recalled:
            answer += " First one: " + recalled[0][1][:160]
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        base = {"id": "mock", "object": "chat.completion.chunk", "created": int(time.time()), "model": body["model"]}
        for i, word in enumerate(re.findall(r"\S+\s*", answer)):
            delta = {"content": word, **({"role": "assistant"} if i == 0 else {})}
            chunk = {**base, "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
        done = {**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}
        self.wfile.write(f"data: {json.dumps(done)}\n\ndata: [DONE]\n\n".encode())


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1] if len(sys.argv) > 1 else 8790)), Handler).serve_forever()
