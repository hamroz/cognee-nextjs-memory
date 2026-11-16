"""FastAPI sidecar that exposes cognee as long-term memory for the Next.js chat.

Endpoints
---------
GET  /health                 liveness + cognee version + LLM/no-LLM mode
POST /remember               queue text (a chat turn) -> cognee.remember (add + cognify)
POST /remember/file          queue an uploaded document -> cognee.remember
GET  /jobs/{job_id}          status of a queued remember job
POST /recall                 cognee.recall(..., query_type=CHUNKS) + linked graph nodes
GET  /graph                  nodes/edges of the dataset's knowledge graph
POST /forget                 cognee.forget(dataset=...)

Writes are queued and processed one at a time so a chat turn never blocks on
cognify, and two cognify runs never race on the same dataset.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import cognee
from cognee import SearchType
from cognee.modules.data.methods import get_datasets_by_name
from cognee.modules.graph.methods import get_formatted_graph_data
from cognee.modules.users.methods import get_default_user

log = logging.getLogger("cognee-sidecar")

DEFAULT_DATASET = os.getenv("COGNEE_DATASET", "nextjs_chat_memory")
SIDECAR_TOKEN = os.getenv("SIDECAR_TOKEN", "")
# CHUNKS needs no LLM (works in cognee's local GLiNER mode). Any other
# SearchType name can be set, e.g. GRAPH_COMPLETION with only_context.
RECALL_SEARCH_TYPE = SearchType[os.getenv("RECALL_SEARCH_TYPE", "CHUNKS")]
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", tempfile.gettempdir())) / "cognee-sidecar-uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))


def require_token(authorization: str | None = Header(default=None)) -> None:
    """Optional shared-secret auth so a public sidecar is not an open write API."""
    if SIDECAR_TOKEN and authorization != f"Bearer {SIDECAR_TOKEN}":
        raise HTTPException(status_code=401, detail="invalid or missing sidecar token")


# --------------------------------------------------------------------------
# Write queue
# --------------------------------------------------------------------------


@dataclass
class Job:
    id: str
    dataset: str
    kind: Literal["text", "file"]
    payload: str  # text, or an absolute file path for kind="file"
    status: Literal["queued", "running", "completed", "errored"] = "queued"
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None


JOBS: dict[str, Job] = {}
QUEUE: asyncio.Queue[Job] = asyncio.Queue()


async def worker() -> None:
    while True:
        job = await QUEUE.get()
        job.status = "running"
        try:
            # Without session_id, remember() runs add() + cognify() and
            # writes to the permanent knowledge graph.
            await cognee.remember(job.payload, dataset_name=job.dataset, self_improvement=False)
            job.status = "completed"
        except Exception as exc:  # surfaced via /jobs/{id}
            log.exception("remember failed for job %s", job.id)
            job.status = "errored"
            job.error = f"{type(exc).__name__}: {exc}"
        finally:
            job.finished_at = time.time()
            if job.kind == "file":
                Path(job.payload).unlink(missing_ok=True)
            QUEUE.task_done()
            # keep the job table bounded
            if len(JOBS) > 500:
                for old in sorted(JOBS.values(), key=lambda j: j.created_at)[:100]:
                    JOBS.pop(old.id, None)


def enqueue(dataset: str, kind: Literal["text", "file"], payload: str) -> Job:
    job = Job(id=uuid.uuid4().hex, dataset=dataset, kind=kind, payload=payload)
    JOBS[job.id] = job
    QUEUE.put_nowait(job)
    return job


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(worker())
    yield
    task.cancel()


app = FastAPI(title="cognee sidecar for Next.js", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


class RememberIn(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    dataset: str = DEFAULT_DATASET


class RecallIn(BaseModel):
    query: str = Field(min_length=1, max_length=4_000)
    dataset: str = DEFAULT_DATASET
    top_k: int = Field(default=5, ge=1, le=20)


class ForgetIn(BaseModel):
    dataset: str = DEFAULT_DATASET


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "cognee_version": cognee.__version__,
        "llm_configured": bool(os.getenv("LLM_API_KEY")),
        "recall_search_type": RECALL_SEARCH_TYPE.value,
        "default_dataset": DEFAULT_DATASET,
        "queue_depth": QUEUE.qsize(),
    }


@app.post("/remember", status_code=202, dependencies=[Depends(require_token)])
async def remember(body: RememberIn) -> dict[str, Any]:
    text = body.text
    # cognee.add treats strings starting with "/" or "file://" as file paths.
    if text.startswith("/") or text.startswith("file://"):
        text = " " + text
    job = enqueue(body.dataset, "text", text)
    return {"job_id": job.id, "status": job.status}


@app.post("/remember/file", status_code=202, dependencies=[Depends(require_token)])
async def remember_file(
    file: UploadFile = File(...), dataset: str = Form(DEFAULT_DATASET)
) -> dict[str, Any]:
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file too large")
    suffix = Path(file.filename or "upload.txt").suffix[:10] or ".txt"
    dest = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    dest.write_bytes(raw)
    job = enqueue(dataset, "file", str(dest.resolve()))
    return {"job_id": job.id, "status": job.status, "filename": file.filename}


@app.get("/jobs/{job_id}", dependencies=[Depends(require_token)])
async def job_status(job_id: str) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="unknown job")
    return {"job_id": job.id, "status": job.status, "error": job.error}


async def _dataset_graph(dataset: str) -> dict[str, Any]:
    user = await get_default_user()
    found = await get_datasets_by_name([dataset], user.id)
    if not found:
        return {"nodes": [], "edges": []}
    return await get_formatted_graph_data(found[0].id, user)


def _chunk_id(item: dict[str, Any]) -> str | None:
    meta = item.get("metadata") or {}
    raw = item.get("raw") or {}
    for value in (meta.get("chunk_id"), meta.get("id"), raw.get("id"), raw.get("chunk_id")):
        if value:
            return str(value)
    return None


@app.post("/recall", dependencies=[Depends(require_token)])
async def recall(body: RecallIn) -> dict[str, Any]:
    user = await get_default_user()
    if not await get_datasets_by_name([body.dataset], user.id):
        return {"memories": [], "search_type": RECALL_SEARCH_TYPE.value}

    results = await cognee.recall(
        body.query,
        query_type=RECALL_SEARCH_TYPE,
        datasets=[body.dataset],
        top_k=body.top_k,
        only_context=RECALL_SEARCH_TYPE != SearchType.CHUNKS,
    )

    graph = await _dataset_graph(body.dataset)
    labels = {n["id"]: n["label"] for n in graph["nodes"]}
    types = {n["id"]: n["type"] for n in graph["nodes"]}
    neighbours: dict[str, set[str]] = {}
    for e in graph["edges"]:
        neighbours.setdefault(e["source"], set()).add(e["target"])
        neighbours.setdefault(e["target"], set()).add(e["source"])

    memories = []
    for r in results:
        item = r.model_dump() if hasattr(r, "model_dump") else dict(r)
        if item.get("source") == "system":  # e.g. "memory still warming up"
            continue
        text = str(item.get("text") or item.get("content") or "").strip()
        if not text:
            continue
        cid = _chunk_id(item)
        linked: list[str] = []
        if cid and cid in neighbours:
            # entities extracted from this chunk are its graph neighbours
            linked = [n for n in neighbours[cid] if types.get(n) not in {"TextDocument", "DocumentChunk", "TextSummary"}]
        if not linked:
            low = text.lower()
            linked = [
                nid
                for nid, label in labels.items()
                if types.get(nid) not in {"TextDocument", "DocumentChunk", "TextSummary"}
                and len(label) > 2
                and label.lower() in low
            ]
        memories.append(
            {
                "id": cid or uuid.uuid4().hex,
                "text": text[:1200],
                "score": item.get("score"),
                "nodes": [{"id": n, "label": labels.get(n, n)} for n in linked[:8]],
            }
        )
    return {"memories": memories, "search_type": RECALL_SEARCH_TYPE.value}


@app.get("/graph", dependencies=[Depends(require_token)])
async def graph(dataset: str = DEFAULT_DATASET) -> dict[str, Any]:
    return await _dataset_graph(dataset)


@app.post("/forget", dependencies=[Depends(require_token)])
async def forget(body: ForgetIn) -> dict[str, Any]:
    user = await get_default_user()
    if not await get_datasets_by_name([body.dataset], user.id):
        return {"ok": True, "result": "dataset did not exist"}
    result = await cognee.forget(dataset=body.dataset)
    return {"ok": True, "result": result}
