from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Em produção serverless (Vercel) sem DATABASE_URL configurado, usa snapshot SQLite em /tmp.
os.environ.setdefault("RADAR_STORAGE_MODE", "auto")

from app.main import app  # noqa: E402, F401
