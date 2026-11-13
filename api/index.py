from __future__ import annotations

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Em produção serverless sem DATABASE_URL configurado, usa automaticamente o snapshot SQLite em /tmp.
os.environ.setdefault("RADAR_STORAGE_MODE", "auto")

from app.main import create_app  # noqa: E402

app = create_app()
