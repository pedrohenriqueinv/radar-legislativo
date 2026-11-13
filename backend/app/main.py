from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy import desc, select

from app.config import Settings, get_settings
from app.db import (
    DatabaseContext,
    check_database_connection,
    create_database_context,
    init_schema,
)
from app.etl.client import CamaraAPIClient
from app.etl.pipeline import run_collection
from app.etl.transform import UFS_BRASIL
from app.logging_config import configure_logging
from app.models import ExecucaoColeta, ensure_utc
from app.repository import RadarRepository
from app.schemas import (
    AnalyticsResponse,
    ColetaAcceptedResponse,
    ColetaRequest,
    DeputadoCardOut,
    DeputadoDetailResponse,
    DespesasPageResponse,
    ExecucaoOut,
    HealthResponse,
    MetaResponse,
    OverviewResponse,
)

configure_logging()
logger = logging.getLogger("radar_legislativo.api")


class AppState:
    def __init__(self, settings: Settings, db_ctx: DatabaseContext | None = None) -> None:
        self.settings = settings
        self.db_ctx = db_ctx
        self.db_init_error: str | None = None
        self.repo = RadarRepository(stale_threshold_days=settings.stale_data_days)
        self.lock = threading.Lock()
        self.running_keys: set[tuple[str, int]] = set()


def _ensure_db(state: AppState) -> DatabaseContext:
    if state.db_ctx is None:
        try:
            ctx = create_database_context(state.settings)
            init_schema(ctx.engine)
            state.db_ctx = ctx
            state.db_init_error = None
        except Exception as exc:
            state.db_init_error = str(exc)
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "database_error",
                    "message": "Banco de dados indisponível. Verifique DATABASE_URL e o serviço PostgreSQL.",
                    "detail": str(exc),
                },
            ) from exc

    ok, err = check_database_connection(state.db_ctx.engine)
    if not ok:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "database_error",
                "message": "Falha de conexão com o banco de dados.",
                "detail": err,
            },
        )
    return state.db_ctx


def _execute_collection_task(state: AppState, uf: str, ano: int, max_deputados: int | None) -> None:
    key = (uf, ano)
    try:
        ctx = _ensure_db(state)
        with CamaraAPIClient(
            base_url=state.settings.camara_api_base_url,
            timeout_seconds=state.settings.camara_http_timeout_seconds,
            max_retries=state.settings.camara_max_retries,
            rate_limit_delay=state.settings.camara_rate_limit_delay_seconds,
        ) as client:
            run_collection(
                ctx.session_factory,
                ctx.engine,
                client,
                uf=uf,
                ano=ano,
                max_deputados=max_deputados,
            )
    except Exception:
        logger.exception("Erro inesperado ao executar coleta em background para %s/%s", uf, ano)
    finally:
        with state.lock:
            state.running_keys.discard(key)


def create_app(
    settings: Settings | None = None,
    db_ctx: DatabaseContext | None = None,
) -> FastAPI:
    cfg = settings or get_settings()
    state = AppState(cfg, db_ctx=db_ctx)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            ctx = state.db_ctx or create_database_context(cfg)
            init_schema(ctx.engine)
            state.db_ctx = ctx
            state.db_init_error = None
            logger.info("Schema verificado em %s (%s)", ctx.backend_kind, ctx.target_label)
        except Exception as exc:
            state.db_init_error = str(exc)
            logger.error("Banco indisponível na inicialização: %s", exc)
        yield

    app = FastAPI(
        title="Radar Legislativo API",
        description="API analítica e pipeline de dados públicos da Câmara dos Deputados (CEAP).",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.state.radar = state

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        if state.db_ctx is None:
            try:
                ctx = create_database_context(cfg)
                init_schema(ctx.engine)
                state.db_ctx = ctx
                state.db_init_error = None
            except Exception as exc:
                state.db_init_error = str(exc)
                return HealthResponse(
                    status="degraded",
                    database_connected=False,
                    storage_backend=cfg.radar_storage_mode,
                    storage_label="Indisponível",
                    database_error=str(exc),
                    has_any_data=False,
                    camara_api_base_url=cfg.camara_api_base_url,
                )

        ok, err = check_database_connection(state.db_ctx.engine)
        has_data = False
        if ok:
            with state.db_ctx.session_factory() as session:
                has_data = state.repo.has_any_data(session)

        return HealthResponse(
            status="ok" if ok else "degraded",
            database_connected=ok,
            storage_backend=state.db_ctx.backend_kind,
            storage_label=state.db_ctx.target_label,
            database_error=err,
            has_any_data=has_data,
            camara_api_base_url=cfg.camara_api_base_url,
        )

    @app.get("/api/meta", response_model=MetaResponse)
    def meta() -> MetaResponse:
        ctx = _ensure_db(state)
        with ctx.session_factory() as session:
            return state.repo.get_meta(
                session,
                storage_backend=ctx.backend_kind,
                storage_label=ctx.target_label,
            )

    @app.get("/api/overview", response_model=OverviewResponse)
    def overview(
        uf: str = Query(..., min_length=2, max_length=2),
        ano: int = Query(..., ge=2008, le=2100),
    ) -> OverviewResponse:
        uf_norm = uf.strip().upper()
        if uf_norm not in UFS_BRASIL:
            raise HTTPException(status_code=400, detail=f"UF inválida: {uf}")
        ctx = _ensure_db(state)
        with ctx.session_factory() as session:
            res = state.repo.get_overview(session, uf=uf_norm, ano=ano)
        with state.lock:
            if (uf_norm, ano) in state.running_keys:
                res.situacao_coleta = "em_andamento"
        return res

    @app.get("/api/deputados", response_model=list[DeputadoCardOut])
    def deputados(
        uf: str = Query(..., min_length=2, max_length=2),
        ano: int = Query(..., ge=2008, le=2100),
        busca: str | None = Query(default=None),
        partido: str | None = Query(default=None),
        ordenar_por: str = Query(default="total_desc"),
    ) -> list[DeputadoCardOut]:
        uf_norm = uf.strip().upper()
        if uf_norm not in UFS_BRASIL:
            raise HTTPException(status_code=400, detail=f"UF inválida: {uf}")
        ctx = _ensure_db(state)
        with ctx.session_factory() as session:
            return state.repo.list_deputados(
                session,
                uf=uf_norm,
                ano=ano,
                busca=busca,
                partido=partido,
                ordenar_por=ordenar_por,
            )

    @app.get("/api/deputados/{deputado_id}", response_model=DeputadoDetailResponse)
    def deputado_detail(
        deputado_id: int,
        ano: int = Query(..., ge=2008, le=2100),
        uf: str | None = Query(default=None),
    ) -> DeputadoDetailResponse:
        ctx = _ensure_db(state)
        with ctx.session_factory() as session:
            detail = state.repo.get_deputado_detail(session, deputado_id=deputado_id, ano=ano, uf=uf)
        if detail is None:
            raise HTTPException(status_code=404, detail="Parlamentar não encontrado no banco local.")
        return detail

    @app.get("/api/despesas", response_model=DespesasPageResponse)
    def despesas(
        uf: str | None = Query(default=None),
        ano: int | None = Query(default=None, ge=2008, le=2100),
        deputado_id: int | None = Query(default=None),
        categoria: str | None = Query(default=None),
        mes: int | None = Query(default=None, ge=1, le=12),
        busca: str | None = Query(default=None),
        ordenar_por: str = Query(default="data_desc"),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=5, le=100),
    ) -> DespesasPageResponse:
        ctx = _ensure_db(state)
        with ctx.session_factory() as session:
            return state.repo.list_despesas(
                session,
                uf=uf,
                ano=ano,
                deputado_id=deputado_id,
                categoria=categoria,
                mes=mes,
                busca=busca,
                ordenar_por=ordenar_por,
                page=page,
                page_size=page_size,
            )

    @app.get("/api/despesas/export.csv")
    def export_despesas_csv(
        uf: str | None = Query(default=None),
        ano: int | None = Query(default=None, ge=2008, le=2100),
        deputado_id: int | None = Query(default=None),
        categoria: str | None = Query(default=None),
        mes: int | None = Query(default=None, ge=1, le=12),
        busca: str | None = Query(default=None),
    ) -> PlainTextResponse:
        ctx = _ensure_db(state)
        with ctx.session_factory() as session:
            csv_body = state.repo.export_despesas_csv(
                session,
                uf=uf,
                ano=ano,
                deputado_id=deputado_id,
                categoria=categoria,
                mes=mes,
                busca=busca,
            )
        uf_tag = (uf or "ALL").upper()
        ano_tag = ano or "todos"
        return PlainTextResponse(
            content=csv_body,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="radar_legislativo_{uf_tag}_{ano_tag}.csv"'
            },
        )

    @app.get("/api/analytics", response_model=AnalyticsResponse)
    def analytics(
        uf: str = Query(..., min_length=2, max_length=2),
        ano: int = Query(..., ge=2008, le=2100),
    ) -> AnalyticsResponse:
        uf_norm = uf.strip().upper()
        if uf_norm not in UFS_BRASIL:
            raise HTTPException(status_code=400, detail=f"UF inválida: {uf}")
        ctx = _ensure_db(state)
        with ctx.session_factory() as session:
            return state.repo.get_analytics(session, uf=uf_norm, ano=ano)

    @app.get("/api/execucoes", response_model=list[ExecucaoOut])
    def execucoes(limit: int = Query(default=25, ge=1, le=100)) -> list[ExecucaoOut]:
        ctx = _ensure_db(state)
        with ctx.session_factory() as session:
            return state.repo.list_execucoes(session, limit=limit)

    @app.post("/api/coletas", response_model=ColetaAcceptedResponse, status_code=202)
    def trigger_coleta(payload: ColetaRequest, background_tasks: BackgroundTasks) -> ColetaAcceptedResponse:
        uf_norm = payload.uf.strip().upper()
        if uf_norm not in UFS_BRASIL:
            raise HTTPException(status_code=400, detail=f"UF inválida: {payload.uf}")

        ctx = _ensure_db(state)
        key = (uf_norm, payload.ano)

        with state.lock:
            if key in state.running_keys:
                with ctx.session_factory() as session:
                    running_exec = session.scalar(
                        select(ExecucaoColeta)
                        .where(ExecucaoColeta.uf == uf_norm, ExecucaoColeta.ano == payload.ano)
                        .order_by(desc(ExecucaoColeta.iniciado_em))
                        .limit(1)
                    )
                return ColetaAcceptedResponse(
                    message=f"Já existe uma coleta em andamento para {uf_norm}/{payload.ano}.",
                    uf=uf_norm,
                    ano=payload.ano,
                    already_running=True,
                    execucao=None
                    if running_exec is None
                    else ExecucaoOut(
                        id=running_exec.id,
                        uf=running_exec.uf,
                        ano=running_exec.ano,
                        status="em_andamento",
                        iniciado_em=ensure_utc(running_exec.iniciado_em),
                        finalizado_em=ensure_utc(running_exec.finalizado_em),
                        legislaturas_consultadas=list(running_exec.legislaturas_consultadas or []),
                        deputados_esperados=running_exec.deputados_esperados,
                        deputados_processados=running_exec.deputados_processados,
                        deputados_com_erro=running_exec.deputados_com_erro,
                        despesas_coletadas=running_exec.despesas_coletadas,
                        despesas_inseridas=running_exec.despesas_inseridas,
                        despesas_atualizadas=running_exec.despesas_atualizadas,
                        resumo_erros=running_exec.resumo_erros,
                        origem_api=running_exec.origem_api,
                    ),
                )
            state.running_keys.add(key)

        background_tasks.add_task(_execute_collection_task, state, uf_norm, payload.ano, payload.max_deputados)
        return ColetaAcceptedResponse(
            message=f"Coleta oficial iniciada para {uf_norm}/{payload.ano}.",
            uf=uf_norm,
            ano=payload.ano,
            already_running=False,
        )

    return app


app = create_app()
