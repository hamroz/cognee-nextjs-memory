FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py .

# cognee keeps its relational/vector/graph stores under its system root;
# mount a volume here to persist memory across restarts.
ENV SYSTEM_ROOT_DIRECTORY=/data/system DATA_ROOT_DIRECTORY=/data/data
VOLUME ["/data"]

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
