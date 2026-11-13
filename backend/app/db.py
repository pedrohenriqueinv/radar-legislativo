from __future__ import annotations

import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings
from app.models import Base

logger = logging.getLogger("radar_legislativo.db")


@dataclass
class DatabaseContext:
    engine: Engine
    session_factory: sessionmaker[Session]
    backend_kind: str  # "postgresql" | "preview_sqlite"
    target_label: str


def _sqlite_enable_foreign_keys(dbapi_connection: Any, _connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
    except Exception:
        # Read-only or tmp-restricted filesystems fallback cleanly to default journal mode.
        pass
    cursor.close()


def _resolve_sqlite_runtime_path(cfg: Settings) -> tuple[Path, str]:
    """Resolve um arquivo SQLite gravável (copiando o snapshot para /tmp em serverless)."""
    sqlite_path = cfg.resolved_preview_sqlite_path
    snapshot_path = cfg.resolved_snapshot_sqlite_path
    is_default_preview = cfg.preview_sqlite_path == "data/radar_preview.sqlite"
    running_serverless = bool(
        os.environ.get("VERCEL")
        or os.environ.get("VERCEL_ENV")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
    )

    if running_serverless and not str(sqlite_path).startswith(tempfile.gettempdir()):
        target = Path(tempfile.gettempdir()) / "radar_preview.sqlite"
        if (not target.exists() or target.stat().st_size == 0) and snapshot_path.exists():
            shutil.copy2(snapshot_path, target)
            return target, "SQLite Snapshot (Vercel /tmp)"
        if target.exists():
            return target, "SQLite Snapshot (Vercel /tmp)"
        if snapshot_path.exists():
            return snapshot_path, "SQLite Snapshot (somente leitura)"
        return target, "SQLite Temporário (Vercel /tmp)"

    try:
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        target = Path(tempfile.gettempdir()) / "radar_preview.sqlite"
        if (not target.exists() or target.stat().st_size == 0) and snapshot_path.exists():
            shutil.copy2(snapshot_path, target)
        return target, "SQLite Snapshot (/tmp)"

    if (
        is_default_preview
        and (not sqlite_path.exists() or sqlite_path.stat().st_size == 0)
        and snapshot_path.exists()
    ):
        shutil.copy2(snapshot_path, sqlite_path)
    return sqlite_path, f"SQLite local (prévia): {sqlite_path.name}"


def build_engine_from_url(url: str) -> Engine:
    if url.startswith("sqlite"):
        engine = create_engine(
            url,
            future=True,
            connect_args={"check_same_thread": False},
        )
        event.listen(engine, "connect", _sqlite_enable_foreign_keys)
        return engine

    return create_engine(
        url,
        future=True,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 4},
    )


def create_database_context(settings: Settings | None = None) -> DatabaseContext:
    cfg = settings or get_settings()

    if cfg.radar_storage_mode == "preview":
        sqlite_path, label = _resolve_sqlite_runtime_path(cfg)
        url = f"sqlite:///{sqlite_path.as_posix()}"
        engine = build_engine_from_url(url)
        return DatabaseContext(
            engine=engine,
            session_factory=sessionmaker(bind=engine, autoflush=False, expire_on_commit=False),
            backend_kind="preview_sqlite",
            target_label=label,
        )

    if cfg.radar_storage_mode == "auto" and cfg.database_url:
        try:
            pg_engine = build_engine_from_url(cfg.database_url)
            with pg_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return DatabaseContext(
                engine=pg_engine,
                session_factory=sessionmaker(bind=pg_engine, autoflush=False, expire_on_commit=False),
                backend_kind="postgresql",
                target_label="PostgreSQL",
            )
        except Exception as exc:
            logger.warning("PostgreSQL indisponível no modo auto (%s). Usando SQLite de prévia.", exc)
            sqlite_path, label = _resolve_sqlite_runtime_path(cfg)
            url = f"sqlite:///{sqlite_path.as_posix()}"
            engine = build_engine_from_url(url)
            return DatabaseContext(
                engine=engine,
                session_factory=sessionmaker(bind=engine, autoflush=False, expire_on_commit=False),
                backend_kind="preview_sqlite",
                target_label=label,
            )

    if not cfg.database_url:
        if cfg.radar_storage_mode == "auto":
            sqlite_path, label = _resolve_sqlite_runtime_path(cfg)
            url = f"sqlite:///{sqlite_path.as_posix()}"
            engine = build_engine_from_url(url)
            return DatabaseContext(
                engine=engine,
                session_factory=sessionmaker(bind=engine, autoflush=False, expire_on_commit=False),
                backend_kind="preview_sqlite",
                target_label=label,
            )
        raise RuntimeError("DATABASE_URL não configurada para o modo postgresql.")

    engine = build_engine_from_url(cfg.database_url)
    return DatabaseContext(
        engine=engine,
        session_factory=sessionmaker(bind=engine, autoflush=False, expire_on_commit=False),
        backend_kind="postgresql" if engine.dialect.name == "postgresql" else "preview_sqlite",
        target_label="PostgreSQL" if engine.dialect.name == "postgresql" else "SQLite",
    )


def init_schema(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)


def dialect_insert(engine: Engine, table: Any) -> Any:
    if engine.dialect.name == "postgresql":
        return pg_insert(table)
    return sqlite_insert(table)


def check_database_connection(engine: Engine) -> tuple[bool, str | None]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:
        return False, str(exc)
