from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    """Configurações centralizadas carregadas de variáveis de ambiente."""

    model_config = SettingsConfigDict(
        env_file=str(DEFAULT_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = ""
    test_database_url: str = ""
    radar_storage_mode: Literal["postgres", "preview", "auto"] = "postgres"
    preview_sqlite_path: str = "data/radar_preview.sqlite"
    snapshot_sqlite_path: str = "backend/data/radar_snapshot.sqlite"

    camara_api_base_url: str = "https://dadosabertos.camara.leg.br/api/v2"
    camara_http_timeout_seconds: float = 15.0
    camara_max_retries: int = 3
    camara_rate_limit_delay_seconds: float = 0.08

    stale_data_days: int = 7
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [item.strip() for item in self.cors_origins.split(",") if item.strip()]
        for env_key in ("VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
            host = os.environ.get(env_key, "").strip()
            if host:
                origin = host if host.startswith("http") else f"https://{host}"
                if origin not in origins:
                    origins.append(origin)
        return origins

    @property
    def resolved_preview_sqlite_path(self) -> Path:
        raw = Path(self.preview_sqlite_path)
        if raw.is_absolute():
            return raw
        return PROJECT_ROOT / raw

    @property
    def resolved_snapshot_sqlite_path(self) -> Path:
        raw = Path(self.snapshot_sqlite_path)
        if raw.is_absolute():
            return raw
        repo_candidate = PROJECT_ROOT / raw
        if repo_candidate.exists():
            return repo_candidate
        # Quando o serviço Vercel roda isolado dentro de `backend/`, resolve relativo a BACKEND_DIR.
        backend_candidate = BACKEND_DIR / "data" / raw.name
        if backend_candidate.exists():
            return backend_candidate
        return repo_candidate


@lru_cache
def get_settings() -> Settings:
    return Settings()
