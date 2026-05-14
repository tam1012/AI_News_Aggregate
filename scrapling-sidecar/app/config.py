import os

TIMEOUT_MS = int(os.environ.get("SCRAPLING_TIMEOUT_MS", "60000"))
PORT = int(os.environ.get("SCRAPLING_PORT", "8000"))
WORKERS = int(os.environ.get("SCRAPLING_WORKERS", "2"))
