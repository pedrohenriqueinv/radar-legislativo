from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.etl.client import CamaraAPIClient, CamaraAPIError
from app.etl.loader import (
    create_execution,
    finalize_execution,
    upsert_deputado_bundle,
    upsert_legislaturas,
)
from app.etl.transform import (
    UFS_BRASIL,
    legislaturas_para_ano,
    normalize_deputado,
    normalize_historico,
    normalize_legislaturas,
    transform_despesas,
)

logger = logging.getLogger("radar_legislativo.etl.pipeline")


@dataclass
class PipelineResult:
    execucao_id: int
    uf: str
    ano: int
    status: str
    legislaturas_consultadas: list[int]
    deputados_esperados: int
    deputados_processados: int
    deputados_com_erro: int
    despesas_coletadas: int
    despesas_inseridas: int
    despesas_atualizadas: int
    resumo_erros: str | None


def run_collection(
    session_factory: sessionmaker[Session],
    engine: Engine,
    client: CamaraAPIClient,
    *,
    uf: str,
    ano: int,
    max_deputados: int | None = None,
) -> PipelineResult:
    """
    Executa coleta completa, parcial ou com falha registrada para (UF, Ano),
    preservando dados existentes mesmo diante de falhas parciais ou totais.
    """
    uf_norm = uf.strip().upper()
    if uf_norm not in UFS_BRASIL:
        raise ValueError(f"UF inválida: {uf!r}")
    if not (2008 <= ano <= 2100):
        raise ValueError(f"Ano fora do intervalo suportado pela CEAP (2008–2100): {ano}")

    with session_factory() as session:
        execucao = create_execution(session, uf=uf_norm, ano=ano, origem_api=client.base_url)
        execucao_id = execucao.id

    logs: list[dict[str, Any]] = []
    errors: list[str] = []
    legislatura_ids: list[int] = []
    deputados_esperados = 0
    deputados_processados = 0
    deputados_com_erro = 0
    despesas_coletadas = 0
    despesas_inseridas = 0
    despesas_atualizadas = 0

    try:
        logger.info("Iniciando coleta execucao_id=%s uf=%s ano=%s", execucao_id, uf_norm, ano)
        raw_legs = client.fetch_legislaturas()
        legs = normalize_legislaturas(raw_legs)
        if not legs:
            raise CamaraAPIError("Nenhuma legislatura retornada pela API oficial.", url=f"{client.base_url}/legislaturas")

        with session_factory() as session:
            upsert_legislaturas(session, engine, legs)
            session.commit()

        legislatura_ids = legislaturas_para_ano(legs, ano)
        if not legislatura_ids:
            raise ValueError(f"Nenhuma legislatura encontrada cobrindo o ano {ano}.")

        # Mapeia deputados por (deputado_id -> lista de snapshots (id_legislatura, summary))
        snapshots_by_dep: dict[int, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
        leg_errors = 0
        for leg_id in legislatura_ids:
            try:
                dep_list = client.fetch_deputados_uf_legislatura(uf_norm, leg_id)
                logs.append({"etapa": "listar_deputados", "legislatura": leg_id, "quantidade": len(dep_list)})
                for dep_summary in dep_list:
                    dep_id = int(dep_summary["id"])
                    snapshots_by_dep[dep_id].append((leg_id, dep_summary))
            except Exception as exc:
                leg_errors += 1
                msg = f"Falha ao listar deputados da UF {uf_norm} na legislatura {leg_id}: {exc}"
                logger.error(msg)
                errors.append(msg)
                logs.append({"etapa": "listar_deputados", "legislatura": leg_id, "erro": str(exc)})

        if not snapshots_by_dep and leg_errors > 0:
            raise RuntimeError("Não foi possível obter a lista de deputados em nenhuma legislatura do recorte.")

        dep_ids = sorted(snapshots_by_dep.keys())
        if max_deputados is not None and max_deputados > 0:
            dep_ids = dep_ids[:max_deputados]

        deputados_esperados = len(dep_ids)

        if deputados_esperados == 0:
            status = "completa" if leg_errors == 0 else "falhou"
            with session_factory() as session:
                finalize_execution(
                    session,
                    execucao_id,
                    status=status,
                    legislaturas_consultadas=legislatura_ids,
                    deputados_esperados=0,
                    deputados_processados=0,
                    deputados_com_erro=leg_errors,
                    despesas_coletadas=0,
                    despesas_inseridas=0,
                    despesas_atualizadas=0,
                    resumo_erros="; ".join(errors) if errors else None,
                    detalhes_log=logs,
                )
            return PipelineResult(
                execucao_id=execucao_id,
                uf=uf_norm,
                ano=ano,
                status=status,
                legislaturas_consultadas=legislatura_ids,
                deputados_esperados=0,
                deputados_processados=0,
                deputados_com_erro=leg_errors,
                despesas_coletadas=0,
                despesas_inseridas=0,
                despesas_atualizadas=0,
                resumo_erros="; ".join(errors) if errors else None,
            )

        for dep_id in dep_ids:
            dep_snapshots = snapshots_by_dep[dep_id]
            primary_summary = dep_snapshots[-1][1]
            try:
                detail: dict[str, Any] | None = None
                try:
                    detail = client.fetch_deputado_detalhe(dep_id)
                except CamaraAPIError as exc:
                    logger.warning("Detalhe indisponível para dep=%s: %s", dep_id, exc)
                    logs.append({"etapa": "detalhe_deputado", "deputado_id": dep_id, "aviso": str(exc)})

                historico_raw: list[dict[str, Any]] = []
                try:
                    historico_raw = client.fetch_deputado_historico(dep_id)
                except CamaraAPIError as exc:
                    logger.warning("Histórico indisponível para dep=%s: %s", dep_id, exc)
                    logs.append({"etapa": "historico_deputado", "deputado_id": dep_id, "aviso": str(exc)})

                dep_norm = normalize_deputado(primary_summary, detail)
                hist_norm = normalize_historico(dep_id, historico_raw)

                dep_despesas_norm: list[dict[str, Any]] = []
                recorte_rows: list[dict[str, Any]] = []
                dep_partial_leg_error = False

                for leg_id, snap in dep_snapshots:
                    try:
                        raw_expenses, visited = client.fetch_deputado_despesas(dep_id, ano, id_legislatura=leg_id)
                    except Exception as exc:
                        dep_partial_leg_error = True
                        raise RuntimeError(
                            f"Falha ao coletar despesas de {dep_norm['nome_parlamentar']} (id={dep_id}, leg={leg_id}): {exc}"
                        ) from exc

                    fonte_url = visited[0] if visited else f"{client.base_url}/deputados/{dep_id}/despesas?ano={ano}&idLegislatura={leg_id}"
                    transformed, item_errors = transform_despesas(dep_id, uf_norm, fonte_url, raw_expenses)
                    if item_errors:
                        errors.extend(item_errors[:5])
                        logs.append(
                            {
                                "etapa": "transformar_despesas",
                                "deputado_id": dep_id,
                                "legislatura": leg_id,
                                "descartados": len(item_errors),
                            }
                        )

                    dep_despesas_norm.extend(transformed)
                    recorte_rows.append(
                        {
                            "deputado_id": dep_id,
                            "uf": uf_norm,
                            "ano": ano,
                            "id_legislatura": leg_id,
                            "sigla_partido_recorte": (snap.get("siglaPartido") or dep_norm.get("sigla_partido_atual")),
                            "despesas_coletadas": len(transformed),
                        }
                    )

                with session_factory() as session:
                    ins, upd = upsert_deputado_bundle(
                        session,
                        engine,
                        deputado_data=dep_norm,
                        historico_rows=hist_norm,
                        recorte_rows=recorte_rows,
                        despesas_rows=dep_despesas_norm,
                        execucao_id=execucao_id,
                    )
                    session.commit()

                if not dep_partial_leg_error:
                    deputados_processados += 1
                despesas_coletadas += len(dep_despesas_norm)
                despesas_inseridas += ins
                despesas_atualizadas += upd

            except Exception as exc:
                deputados_com_erro += 1
                msg = str(exc)
                logger.error("Erro no processamento do deputado %s: %s", dep_id, msg)
                errors.append(msg)
                logs.append({"etapa": "processar_deputado", "deputado_id": dep_id, "erro": msg})

        if deputados_processados == 0 and (deputados_com_erro > 0 or leg_errors > 0):
            final_status = "falhou"
        elif deputados_com_erro > 0 or leg_errors > 0 or max_deputados is not None and len(snapshots_by_dep) > len(dep_ids):
            # Se houve erro em algum deputado/legislatura ou corte intencional limitado por max_deputados
            final_status = "parcial"
        else:
            final_status = "completa"

        if max_deputados is not None and len(snapshots_by_dep) > len(dep_ids):
            logs.append(
                {
                    "etapa": "recorte_amostral",
                    "total_disponivel_uf_ano": len(snapshots_by_dep),
                    "coletados": len(dep_ids),
                    "observacao": "Coleta limitada pelo parâmetro max_deputados; recorte marcado como parcial.",
                }
            )
            errors.append(
                f"Coleta limitada a {len(dep_ids)} de {len(snapshots_by_dep)} parlamentares do recorte (max_deputados)."
            )

        resumo = " | ".join(errors[:8]) if errors else None
        with session_factory() as session:
            finalize_execution(
                session,
                execucao_id,
                status=final_status,
                legislaturas_consultadas=legislatura_ids,
                deputados_esperados=deputados_esperados,
                deputados_processados=deputados_processados,
                deputados_com_erro=deputados_com_erro,
                despesas_coletadas=despesas_coletadas,
                despesas_inseridas=despesas_inseridas,
                despesas_atualizadas=despesas_atualizadas,
                resumo_erros=resumo,
                detalhes_log=logs,
            )

        logger.info(
            "Coleta finalizada execucao_id=%s status=%s deputados=%s/%s despesas=%s (ins=%s, upd=%s)",
            execucao_id,
            final_status,
            deputados_processados,
            deputados_esperados,
            despesas_coletadas,
            despesas_inseridas,
            despesas_atualizadas,
        )

        return PipelineResult(
            execucao_id=execucao_id,
            uf=uf_norm,
            ano=ano,
            status=final_status,
            legislaturas_consultadas=legislatura_ids,
            deputados_esperados=deputados_esperados,
            deputados_processados=deputados_processados,
            deputados_com_erro=deputados_com_erro,
            despesas_coletadas=despesas_coletadas,
            despesas_inseridas=despesas_inseridas,
            despesas_atualizadas=despesas_atualizadas,
            resumo_erros=resumo,
        )

    except Exception as exc:
        msg = f"Falha fatal na execução {execucao_id}: {exc}"
        logger.exception(msg)
        errors.append(msg)
        logs.append({"etapa": "fatal", "erro": str(exc)})
        with session_factory() as session:
            finalize_execution(
                session,
                execucao_id,
                status="falhou",
                legislaturas_consultadas=legislatura_ids,
                deputados_esperados=deputados_esperados,
                deputados_processados=deputados_processados,
                deputados_com_erro=deputados_com_erro,
                despesas_coletadas=despesas_coletadas,
                despesas_inseridas=despesas_inseridas,
                despesas_atualizadas=despesas_atualizadas,
                resumo_erros=" | ".join(errors[:8]),
                detalhes_log=logs,
            )
        return PipelineResult(
            execucao_id=execucao_id,
            uf=uf_norm,
            ano=ano,
            status="falhou",
            legislaturas_consultadas=legislatura_ids,
            deputados_esperados=deputados_esperados,
            deputados_processados=deputados_processados,
            deputados_com_erro=deputados_com_erro,
            despesas_coletadas=despesas_coletadas,
            despesas_inseridas=despesas_inseridas,
            despesas_atualizadas=despesas_atualizadas,
            resumo_erros=" | ".join(errors[:8]),
        )
