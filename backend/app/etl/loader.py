from __future__ import annotations

from typing import Any

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.db import dialect_insert
from app.models import (
    Deputado,
    DeputadoMandatoHistorico,
    DeputadoRecorte,
    Despesa,
    ExecucaoColeta,
    Legislatura,
    utc_now,
)


def upsert_legislaturas(session: Session, engine: Engine, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    now = utc_now()
    payload = [{**r, "coletado_em": now} for r in rows]
    stmt = dialect_insert(engine, Legislatura).values(payload)
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "uri": stmt.excluded.uri,
            "data_inicio": stmt.excluded.data_inicio,
            "data_fim": stmt.excluded.data_fim,
            "coletado_em": stmt.excluded.coletado_em,
        },
    )
    session.execute(stmt)


def create_execution(
    session: Session,
    *,
    uf: str,
    ano: int,
    origem_api: str,
) -> ExecucaoColeta:
    execucao = ExecucaoColeta(
        uf=uf.upper(),
        ano=ano,
        status="em_andamento",
        iniciado_em=utc_now(),
        legislaturas_consultadas=[],
        detalhes_log=[],
        origem_api=origem_api,
    )
    session.add(execucao)
    session.commit()
    session.refresh(execucao)
    return execucao


def finalize_execution(
    session: Session,
    execucao_id: int,
    *,
    status: str,
    legislaturas_consultadas: list[int],
    deputados_esperados: int,
    deputados_processados: int,
    deputados_com_erro: int,
    despesas_coletadas: int,
    despesas_inseridas: int,
    despesas_atualizadas: int,
    resumo_erros: str | None,
    detalhes_log: list[dict[str, Any]],
) -> ExecucaoColeta:
    execucao = session.get(ExecucaoColeta, execucao_id)
    assert execucao is not None
    execucao.status = status
    execucao.finalizado_em = utc_now()
    execucao.legislaturas_consultadas = legislaturas_consultadas
    execucao.deputados_esperados = deputados_esperados
    execucao.deputados_processados = deputados_processados
    execucao.deputados_com_erro = deputados_com_erro
    execucao.despesas_coletadas = despesas_coletadas
    execucao.despesas_inseridas = despesas_inseridas
    execucao.despesas_atualizadas = despesas_atualizadas
    execucao.resumo_erros = resumo_erros
    execucao.detalhes_log = detalhes_log
    session.commit()
    session.refresh(execucao)
    return execucao


def upsert_deputado_bundle(
    session: Session,
    engine: Engine,
    *,
    deputado_data: dict[str, Any],
    historico_rows: list[dict[str, Any]],
    recorte_rows: list[dict[str, Any]],
    despesas_rows: list[dict[str, Any]],
    execucao_id: int,
) -> tuple[int, int]:
    """
    Persiste em transação única os dados de um deputado, seu histórico, vínculo de recorte
    e suas despesas, retornando `(inseridas, atualizadas)`.
    """
    now = utc_now()
    dep_payload = {**deputado_data, "atualizado_em": now}
    dep_stmt = dialect_insert(engine, Deputado).values(dep_payload)
    dep_stmt = dep_stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "uri": dep_stmt.excluded.uri,
            "nome_parlamentar": dep_stmt.excluded.nome_parlamentar,
            "nome_civil": dep_stmt.excluded.nome_civil,
            "sigla_uf_atual": dep_stmt.excluded.sigla_uf_atual,
            "sigla_partido_atual": dep_stmt.excluded.sigla_partido_atual,
            "id_legislatura_atual": dep_stmt.excluded.id_legislatura_atual,
            "url_foto": dep_stmt.excluded.url_foto,
            "email": dep_stmt.excluded.email,
            "link_oficial": dep_stmt.excluded.link_oficial,
            "situacao_atual": dep_stmt.excluded.situacao_atual,
            "condicao_eleitoral": dep_stmt.excluded.condicao_eleitoral,
            "atualizado_em": dep_stmt.excluded.atualizado_em,
        },
    )
    session.execute(dep_stmt)

    if historico_rows:
        hist_stmt = dialect_insert(engine, DeputadoMandatoHistorico).values(historico_rows)
        hist_stmt = hist_stmt.on_conflict_do_update(
            index_elements=["chave_evento"],
            set_={
                "sigla_partido": hist_stmt.excluded.sigla_partido,
                "nome_na_epoca": hist_stmt.excluded.nome_na_epoca,
                "situacao": hist_stmt.excluded.situacao,
                "condicao_eleitoral": hist_stmt.excluded.condicao_eleitoral,
                "descricao_status": hist_stmt.excluded.descricao_status,
            },
        )
        session.execute(hist_stmt)

    if recorte_rows:
        rec_payload = [{**r, "coletado_em": now} for r in recorte_rows]
        rec_stmt = dialect_insert(engine, DeputadoRecorte).values(rec_payload)
        rec_stmt = rec_stmt.on_conflict_do_update(
            index_elements=["deputado_id", "uf", "ano", "id_legislatura"],
            set_={
                "sigla_partido_recorte": rec_stmt.excluded.sigla_partido_recorte,
                "despesas_coletadas": rec_stmt.excluded.despesas_coletadas,
                "coletado_em": rec_stmt.excluded.coletado_em,
            },
        )
        session.execute(rec_stmt)

    if not despesas_rows:
        return 0, 0

    keys = [row["chave_deduplicacao"] for row in despesas_rows]
    existing_keys: set[str] = set()
    chunk_size = 400
    for i in range(0, len(keys), chunk_size):
        chunk = keys[i : i + chunk_size]
        found = session.scalars(select(Despesa.chave_deduplicacao).where(Despesa.chave_deduplicacao.in_(chunk))).all()
        existing_keys.update(found)

    inserted = sum(1 for k in keys if k not in existing_keys)
    updated = len(keys) - inserted

    for i in range(0, len(despesas_rows), 200):
        batch = [{**r, "execucao_id": execucao_id, "coletado_em": now} for r in despesas_rows[i : i + 200]]
        desp_stmt = dialect_insert(engine, Despesa).values(batch)
        desp_stmt = desp_stmt.on_conflict_do_update(
            index_elements=["chave_deduplicacao"],
            set_={
                "uf_recorte": desp_stmt.excluded.uf_recorte,
                "execucao_id": desp_stmt.excluded.execucao_id,
                "tipo_despesa": desp_stmt.excluded.tipo_despesa,
                "data_documento": desp_stmt.excluded.data_documento,
                "nome_fornecedor": desp_stmt.excluded.nome_fornecedor,
                "cnpj_cpf_fornecedor": desp_stmt.excluded.cnpj_cpf_fornecedor,
                "valor_documento": desp_stmt.excluded.valor_documento,
                "valor_glosa": desp_stmt.excluded.valor_glosa,
                "valor_liquido_api_raw": desp_stmt.excluded.valor_liquido_api_raw,
                "valor_liquido": desp_stmt.excluded.valor_liquido,
                "sinal_normalizado": desp_stmt.excluded.sinal_normalizado,
                "url_documento": desp_stmt.excluded.url_documento,
                "fonte_url": desp_stmt.excluded.fonte_url,
                "coletado_em": desp_stmt.excluded.coletado_em,
            },
        )
        session.execute(desp_stmt)

    return inserted, updated
