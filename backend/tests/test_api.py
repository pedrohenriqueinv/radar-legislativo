from __future__ import annotations

from datetime import datetime, timedelta, timezone

import respx
from fastapi.testclient import TestClient

from app.config import Settings
from app.etl.client import CamaraAPIClient
from app.etl.pipeline import run_collection
from app.main import create_app
from app.models import ExecucaoColeta
from tests.test_pipeline_db import _mock_camara_two_deputies


def test_api_empty_state_then_loaded_and_filter_empty(isolated_db) -> None:
    app = create_app(Settings(radar_storage_mode="preview"), db_ctx=isolated_db)
    client = TestClient(app)

    # 1. Estado inicial sem dados
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["database_connected"] is True
    assert health.json()["has_any_data"] is False

    ov_empty = client.get("/api/overview", params={"uf": "DF", "ano": 2025})
    assert ov_empty.status_code == 200
    assert ov_empty.json()["has_data"] is False
    assert ov_empty.json()["situacao_coleta"] == "nao_coletado"

    # 2. Carrega dados via pipeline simulado
    with respx.mock() as mock:
        _mock_camara_two_deputies(mock, fail_second_deputy=False)
        with CamaraAPIClient(rate_limit_delay=0.0) as api_client:
            run_collection(isolated_db.session_factory, isolated_db.engine, api_client, uf="DF", ano=2025)

    ov_loaded = client.get("/api/overview", params={"uf": "DF", "ano": 2025})
    assert ov_loaded.status_code == 200
    body = ov_loaded.json()
    assert body["has_data"] is True
    assert body["situacao_coleta"] == "completa"
    assert body["total_liquido"] == 2750.0

    # 3. Filtro que não retorna nenhum resultado mas o recorte base tem dados
    no_match = client.get("/api/despesas", params={"uf": "DF", "ano": 2025, "busca": "FornecedorInexistenteXYZ"})
    assert no_match.status_code == 200
    assert no_match.json()["total"] == 0
    assert no_match.json()["slice_has_data"] is True

    # 4. Detalhe do deputado
    detail = client.get("/api/deputados/101", params={"ano": 2025, "uf": "DF"})
    assert detail.status_code == 200
    assert detail.json()["total_liquido"] == 1800.0

    # 5. Exportação CSV com filtros
    csv_resp = client.get("/api/despesas/export.csv", params={"uf": "DF", "ano": 2025, "deputado_id": 101})
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "Grafica DF" in csv_resp.text
    assert "LATAM" not in csv_resp.text


def test_api_stale_data_flag_and_partial_status(isolated_db) -> None:
    with respx.mock() as mock:
        _mock_camara_two_deputies(mock, fail_second_deputy=True)
        with CamaraAPIClient(max_retries=1, rate_limit_delay=0.0) as api_client:
            run_collection(isolated_db.session_factory, isolated_db.engine, api_client, uf="DF", ano=2025)

    # Envelhece a data da execução para 15 dias atrás
    with isolated_db.session_factory() as session:
        ex = session.query(ExecucaoColeta).first()
        assert ex is not None
        ex.finalizado_em = datetime.now(timezone.utc) - timedelta(days=15)
        session.commit()

    app = create_app(Settings(radar_storage_mode="preview", stale_data_days=7), db_ctx=isolated_db)
    client = TestClient(app)

    ov = client.get("/api/overview", params={"uf": "DF", "ano": 2025}).json()
    assert ov["situacao_coleta"] == "parcial"
    assert ov["is_stale"] is True
    assert ov["dias_desde_atualizacao"] >= 14


def test_api_reports_database_error_explicitly_when_postgres_unconfigured() -> None:
    bad_settings = Settings(radar_storage_mode="postgres", database_url="")
    app = create_app(bad_settings, db_ctx=None)
    client = TestClient(app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["database_connected"] is False
    assert health.json()["status"] == "degraded"

    ov = client.get("/api/overview", params={"uf": "DF", "ano": 2025})
    assert ov.status_code == 503
    assert ov.json()["detail"]["code"] == "database_error"


def test_vercel_serverless_snapshot_fallback(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("TEMP", str(tmp_path))
    monkeypatch.setenv("TMP", str(tmp_path))
    monkeypatch.setenv("TMPDIR", str(tmp_path))

    settings = Settings(radar_storage_mode="auto", database_url="")
    app = create_app(settings, db_ctx=None)
    client = TestClient(app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["database_connected"] is True
    assert health.json()["has_any_data"] is True

    meta = client.get("/api/meta")
    assert meta.status_code == 200
    assert len(meta.json()["recortes_carregados"]) >= 1

    for path in (
        "/api/overview",
        "/api/deputados",
        "/api/despesas",
        "/api/analytics",
    ):
        resp = client.get(path, params={"uf": "DF", "ano": 2024})
        assert resp.status_code == 200
        payload = resp.json()
        assert isinstance(payload, (dict, list)) and len(payload) > 0


def test_configure_logging_handles_vercel_and_readonly_fs(monkeypatch, tmp_path) -> None:
    import logging
    from logging.handlers import RotatingFileHandler
    from app import logging_config

    logger = logging.getLogger("radar_legislativo")
    original_handlers = list(logger.handlers)
    try:
        logger.handlers.clear()
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.setattr(logging_config, "PROJECT_ROOT", tmp_path)
        configured = logging_config.configure_logging()
        assert len(configured.handlers) == 1
        assert not any(isinstance(h, RotatingFileHandler) for h in configured.handlers)
        assert not (tmp_path / "logs").exists()

        logger.handlers.clear()
        for env_key in ("VERCEL", "VERCEL_ENV", "AWS_LAMBDA_FUNCTION_NAME"):
            monkeypatch.delenv(env_key, raising=False)
        blocking_file = tmp_path / "readonly_parent"
        blocking_file.write_text("x", encoding="utf-8")
        monkeypatch.setattr(logging_config, "PROJECT_ROOT", blocking_file)
        configured = logging_config.configure_logging()
        assert len(configured.handlers) == 1
        assert not any(isinstance(h, RotatingFileHandler) for h in configured.handlers)
    finally:
        logger.handlers.clear()
        for handler in original_handlers:
            logger.addHandler(handler)


