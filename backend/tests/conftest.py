from __future__ import annotations

from pathlib import Path
from typing import Iterator

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.db import DatabaseContext, build_engine_from_url, init_schema


@pytest.fixture
def isolated_db(tmp_path: Path) -> Iterator[DatabaseContext]:
    db_file = tmp_path / "test_radar.sqlite"
    engine = build_engine_from_url(f"sqlite:///{db_file.as_posix()}")
    init_schema(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    ctx = DatabaseContext(
        engine=engine,
        session_factory=session_factory,
        backend_kind="preview_sqlite",
        target_label="Test SQLite",
    )
    try:
        yield ctx
    finally:
        engine.dispose()
