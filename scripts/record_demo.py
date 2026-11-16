"""Record the demo-mode fixture from a REAL cognee run through the sidecar.

For every scripted turn it does exactly what the live chat route does:
  1. POST /recall with the user message  -> the memories cognee returns
  2. POST /remember with the finished turn, then wait for the job
  3. GET  /graph                          -> graph snapshot after the turn

Assistant answers are taken from demo-script.json (scripted, no LLM). The
memories and graph snapshots are cognee's actual output. Usage:

    python scripts/record_demo.py http://127.0.0.1:8000
"""

import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
ROOT = Path(__file__).resolve().parent.parent
DATASET = "demo_recording"


def req(method, path, body=None, timeout=900):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method, headers={"content-type": "application/json"})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read())


def main():
    script = json.loads((ROOT / "scripts" / "demo-script.json").read_text())
    health = req("GET", "/health")
    req("POST", "/forget", {"dataset": DATASET})

    turns = []
    for i, t in enumerate(script["turns"]):
        recalled = req("POST", "/recall", {"query": t["user"], "dataset": DATASET, "top_k": 4})
        text = f"User: {t['user']}\nAssistant: {t['assistant']}"
        job = req("POST", "/remember", {"text": text, "dataset": DATASET})
        started = time.time()
        while True:
            st = req("GET", f"/jobs/{job['job_id']}")
            if st["status"] in ("completed", "errored"):
                break
            time.sleep(1)
        if st["status"] == "errored":
            raise SystemExit(f"turn {i} remember failed: {st['error']}")
        graph = req("GET", f"/graph?dataset={DATASET}")
        print(f"turn {i}: {len(recalled['memories'])} memories, graph {len(graph['nodes'])} nodes / {len(graph['edges'])} edges, cognify {time.time() - started:.1f}s")
        turns.append({**t, "memories": recalled["memories"], "graph": graph})

    out = {
        "title": script["title"],
        "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cognee_version": health["cognee_version"],
        "llm_configured": health["llm_configured"],
        "recall_search_type": health["recall_search_type"],
        "turns": turns,
    }
    dest = ROOT / "src" / "lib" / "demo-recording.json"
    dest.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print("wrote", dest)


if __name__ == "__main__":
    main()
