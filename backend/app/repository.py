from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from app.etl.transform import UFS_BRASIL
from app.models import (
    Deputado,
    DeputadoMandatoHistorico,
    DeputadoRecorte,
    Despesa,
    ExecucaoColeta,
    ensure_utc,
)
from app.schemas import (
    AnalyticsResponse,
    CategoriaResumo,
    DeputadoCardOut,
    DeputadoComparacaoOut,
    DeputadoDetailResponse,
    DespesaOut,
    DespesasPageResponse,
    ExecucaoOut,
    FornecedorResumo,
    MandatoHistoricoOut,
    MensalResumo,
    MetaResponse,
    OverviewResponse,
    UfComparacaoOut,
    UfLoadedSummary,
)

MESES_PT = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
]


def _f(val: Decimal | float | int | None) -> float:
    if val is None:
        return 0.0
    return round(float(val), 2)


def _exec_to_schema(ex: ExecucaoColeta) -> ExecucaoOut:
    return ExecucaoOut(
        id=ex.id,
        uf=ex.uf,
        ano=ex.ano,
        status=ex.status,
        iniciado_em=ensure_utc(ex.iniciado_em) or datetime.now(timezone.utc),
        finalizado_em=ensure_utc(ex.finalizado_em),
        legislaturas_consultadas=list(ex.legislaturas_consultadas or []),
        deputados_esperados=ex.deputados_esperados,
        deputados_processados=ex.deputados_processados,
        deputados_com_erro=ex.deputados_com_erro,
        despesas_coletadas=ex.despesas_coletadas,
        despesas_inseridas=ex.despesas_inseridas,
        despesas_atualizadas=ex.despesas_atualizadas,
        resumo_erros=ex.resumo_erros,
        origem_api=ex.origem_api,
    )


class RadarRepository:
    """Camada de leitura analítica com consultas parametrizadas sobre o modelo relacional."""

    def __init__(self, stale_threshold_days: int = 7) -> None:
        self.stale_threshold_days = stale_threshold_days

    def has_any_data(self, session: Session) -> bool:
        count_rec = session.scalar(select(func.count()).select_from(DeputadoRecorte)) or 0
        count_exec = session.scalar(select(func.count()).select_from(ExecucaoColeta)) or 0
        return (count_rec + count_exec) > 0

    def get_meta(
        self,
        session: Session,
        *,
        storage_backend: str,
        storage_label: str,
    ) -> MetaResponse:
        # Agregado por UF + ano a partir de deputado_recortes e despesas
        rec_rows = session.execute(
            select(
                DeputadoRecorte.uf,
                DeputadoRecorte.ano,
                func.count(func.distinct(DeputadoRecorte.deputado_id)).label("qtd_deps"),
            ).group_by(DeputadoRecorte.uf, DeputadoRecorte.ano)
        ).all()

        desp_rows = session.execute(
            select(
                Despesa.uf_recorte,
                Despesa.ano,
                func.count(Despesa.id).label("qtd_desp"),
                func.coalesce(func.sum(Despesa.valor_liquido), 0).label("total_liq"),
            ).group_by(Despesa.uf_recorte, Despesa.ano)
        ).all()
        desp_map = {(r[0], r[1]): (int(r[2]), _f(r[3])) for r in desp_rows}

        execs = session.scalars(
            select(ExecucaoColeta).order_by(desc(ExecucaoColeta.iniciado_em))
        ).all()
        latest_exec_map: dict[tuple[str, int], ExecucaoColeta] = {}
        latest_uf_exec: dict[str, ExecucaoColeta] = {}
        for ex in execs:
            latest_exec_map.setdefault((ex.uf, ex.ano), ex)
            latest_uf_exec.setdefault(ex.uf, ex)

        recortes_carregados: list[dict] = []
        anos_por_uf: dict[str, set[int]] = {}
        deps_por_uf: dict[str, int] = {}
        desp_por_uf: dict[str, int] = {}
        total_por_uf: dict[str, float] = {}

        for uf, ano, qtd_deps in rec_rows:
            qtd_desp, total_liq = desp_map.get((uf, ano), (0, 0.0))
            ex = latest_exec_map.get((uf, ano))
            recortes_carregados.append(
                {
                    "uf": uf,
                    "ano": ano,
                    "qtd_deputados": int(qtd_deps),
                    "qtd_despesas": qtd_desp,
                    "total_liquido": total_liq,
                    "status": ex.status if ex else "completa",
                    "ultima_atualizacao": ensure_utc(ex.finalizado_em or ex.iniciado_em) if ex else None,
                }
            )
            anos_por_uf.setdefault(uf, set()).add(int(ano))
            deps_por_uf[uf] = max(deps_por_uf.get(uf, 0), int(qtd_deps))
            desp_por_uf[uf] = desp_por_uf.get(uf, 0) + qtd_desp
            total_por_uf[uf] = round(total_por_uf.get(uf, 0.0) + total_liq, 2)

        recortes_carregados.sort(key=lambda r: (r["ano"], r["qtd_despesas"]), reverse=True)

        ufs_summary: list[UfLoadedSummary] = []
        for uf_code, (nome, regiao) in sorted(UFS_BRASIL.items()):
            ex = latest_uf_exec.get(uf_code)
            ufs_summary.append(
                UfLoadedSummary(
                    uf=uf_code,
                    nome=nome,
                    regiao=regiao,
                    anos_disponiveis=sorted(anos_por_uf.get(uf_code, set()), reverse=True),
                    total_deputados_carregados=deps_por_uf.get(uf_code, 0),
                    total_despesas_carregadas=desp_por_uf.get(uf_code, 0),
                    total_liquido=total_por_uf.get(uf_code, 0.0),
                    ultima_atualizacao=ensure_utc(ex.finalizado_em or ex.iniciado_em) if ex else None,
                    ultimo_status=ex.status if ex else None,
                )
            )

        current_year = datetime.now(timezone.utc).year
        anos_suportados = list(range(current_year, 2018, -1))
        if recortes_carregados:
            default_uf = recortes_carregados[0]["uf"]
            default_ano = recortes_carregados[0]["ano"]
        else:
            default_uf = "DF"
            default_ano = 2025 if current_year >= 2025 else current_year

        return MetaResponse(
            ufs=ufs_summary,
            anos_suportados=anos_suportados,
            recortes_carregados=recortes_carregados,
            recorte_padrao_uf=default_uf,
            recorte_padrao_ano=default_ano,
            storage_backend=storage_backend,
            storage_label=storage_label,
            stale_threshold_days=self.stale_threshold_days,
        )

    def get_overview(self, session: Session, *, uf: str, ano: int) -> OverviewResponse:
        uf_norm = uf.upper()
        uf_nome, uf_regiao = UFS_BRASIL.get(uf_norm, (uf_norm, "Brasil"))

        ultima_exec = session.scalar(
            select(ExecucaoColeta)
            .where(ExecucaoColeta.uf == uf_norm, ExecucaoColeta.ano == ano)
            .order_by(desc(ExecucaoColeta.iniciado_em))
            .limit(1)
        )

        rec_rows = session.execute(
            select(
                DeputadoRecorte.deputado_id,
                DeputadoRecorte.id_legislatura,
            ).where(DeputadoRecorte.uf == uf_norm, DeputadoRecorte.ano == ano)
        ).all()

        dep_ids = {r[0] for r in rec_rows}
        legislaturas = sorted({int(r[1]) for r in rec_rows})
        if not legislaturas and ultima_exec and ultima_exec.legislaturas_consultadas:
            legislaturas = sorted(int(x) for x in ultima_exec.legislaturas_consultadas)

        agg_row = session.execute(
            select(
                func.count(Despesa.id),
                func.count(func.distinct(Despesa.deputado_id)),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
                func.coalesce(func.sum(Despesa.valor_glosa), 0),
                func.count(func.distinct(Despesa.tipo_despesa)),
            ).where(Despesa.uf_recorte == uf_norm, Despesa.ano == ano)
        ).one()

        qtd_despesas = int(agg_row[0] or 0)
        qtd_deps_com_desp = int(agg_row[1] or 0)
        total_liquido = _f(agg_row[2])
        total_glosas = _f(agg_row[3])
        qtd_categorias = int(agg_row[4] or 0)

        cat_rows = session.execute(
            select(
                Despesa.tipo_despesa,
                func.count(Despesa.id),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
            )
            .where(Despesa.uf_recorte == uf_norm, Despesa.ano == ano)
            .group_by(Despesa.tipo_despesa)
            .order_by(desc(func.sum(Despesa.valor_liquido)))
        ).all()

        categorias_resumo: list[CategoriaResumo] = []
        for cat_name, cnt, cat_sum in cat_rows:
            cat_val = _f(cat_sum)
            pct = round((cat_val / total_liquido) * 100, 2) if total_liquido else 0.0
            categorias_resumo.append(
                CategoriaResumo(
                    categoria=cat_name,
                    qtd_lancamentos=int(cnt),
                    total_liquido=cat_val,
                    percentual=pct,
                )
            )

        month_rows = session.execute(
            select(
                Despesa.mes,
                func.count(Despesa.id),
                func.count(func.distinct(Despesa.deputado_id)),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
            )
            .where(Despesa.uf_recorte == uf_norm, Despesa.ano == ano)
            .group_by(Despesa.mes)
            .order_by(asc(Despesa.mes))
        ).all()
        month_map = {
            int(r[0]): (int(r[1]), int(r[2]), _f(r[3]))
            for r in month_rows
        }
        serie_mensal = [
            MensalResumo(
                mes=m,
                mes_nome=MESES_PT[m - 1],
                qtd_lancamentos=month_map.get(m, (0, 0, 0.0))[0],
                qtd_deputados_ativos=month_map.get(m, (0, 0, 0.0))[1],
                total_liquido=month_map.get(m, (0, 0, 0.0))[2],
            )
            for m in range(1, 13)
        ]

        has_data = len(dep_ids) > 0 or qtd_despesas > 0
        if ultima_exec:
            situacao = ultima_exec.status
            ultima_atualizacao = ensure_utc(ultima_exec.finalizado_em or ultima_exec.iniciado_em)
        elif has_data:
            situacao = "completa"
            ultima_atualizacao = None
        else:
            situacao = "nao_coletado"
            ultima_atualizacao = None

        dias_desde = None
        is_stale = False
        if ultima_atualizacao is not None:
            delta = datetime.now(timezone.utc) - ultima_atualizacao
            dias_desde = max(0, delta.days)
            is_stale = dias_desde >= self.stale_threshold_days

        if not has_data:
            nota = (
                f"Ainda não há dados coletados para {uf_nome} ({uf_norm}) em {ano}. "
                "Acione a coleta oficial pela API da Câmara dos Deputados para carregar este recorte."
            )
        elif situacao == "parcial":
            nota = (
                f"Coleta parcial para {uf_nome} ({uf_norm}) em {ano}: parte dos parlamentares falhou ou "
                "o recorte foi limitado intencionalmente. Os totais exibidos refletem apenas os registros carregados."
            )
        elif situacao == "falhou":
            nota = (
                f"A última tentativa de atualização para {uf_norm}/{ano} falhou. "
                "Dados anteriores válidos foram preservados no banco."
            )
        else:
            nota = (
                f"Recorte baseado nas legislaturas {legislaturas or ['vigentes']} para {uf_nome} ({uf_norm}) em {ano}. "
                "Valores negativos em passagens/ajustes representam estornos ou bilhetes cancelados."
            )

        return OverviewResponse(
            uf=uf_norm,
            uf_nome=uf_nome,
            uf_regiao=uf_regiao,
            ano=ano,
            has_data=has_data,
            situacao_coleta=situacao,
            ultima_atualizacao=ultima_atualizacao,
            is_stale=is_stale,
            dias_desde_atualizacao=dias_desde,
            legislaturas=legislaturas,
            qtd_deputados=len(dep_ids),
            qtd_deputados_com_despesas=qtd_deps_com_desp,
            qtd_despesas=qtd_despesas,
            total_liquido=total_liquido,
            total_glosas=total_glosas,
            qtd_categorias=qtd_categorias,
            categorias_disponiveis=[c.categoria for c in categorias_resumo],
            categorias_resumo=categorias_resumo,
            serie_mensal=serie_mensal,
            ultima_execucao=_exec_to_schema(ultima_exec) if ultima_exec else None,
            fonte_oficial_url="https://dadosabertos.camara.leg.br/swagger/api.html",
            nota_integridade=nota,
        )

    def list_deputados(
        self,
        session: Session,
        *,
        uf: str,
        ano: int,
        busca: str | None = None,
        partido: str | None = None,
        ordenar_por: str = "total_desc",
    ) -> list[DeputadoCardOut]:
        uf_norm = uf.upper()

        rec_rows = session.execute(
            select(
                DeputadoRecorte.deputado_id,
                DeputadoRecorte.id_legislatura,
                DeputadoRecorte.sigla_partido_recorte,
            ).where(DeputadoRecorte.uf == uf_norm, DeputadoRecorte.ano == ano)
        ).all()

        if not rec_rows:
            return []

        legs_by_dep: dict[int, list[int]] = {}
        partido_by_dep: dict[int, str | None] = {}
        for dep_id, leg_id, sig_part in rec_rows:
            legs_by_dep.setdefault(dep_id, []).append(int(leg_id))
            if sig_part:
                partido_by_dep[dep_id] = sig_part

        dep_ids = list(legs_by_dep.keys())

        desp_rows = session.execute(
            select(
                Despesa.deputado_id,
                func.count(Despesa.id),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
            )
            .where(Despesa.uf_recorte == uf_norm, Despesa.ano == ano)
            .group_by(Despesa.deputado_id)
        ).all()
        stats_by_dep = {r[0]: (int(r[1]), _f(r[2])) for r in desp_rows}
        total_recorte = sum(v[1] for v in stats_by_dep.values())

        deps = session.scalars(select(Deputado).where(Deputado.id.in_(dep_ids))).all()
        cards: list[DeputadoCardOut] = []
        busca_low = busca.strip().lower() if busca and busca.strip() else None
        partido_norm = partido.strip().upper() if partido and partido.strip() else None

        for dep in deps:
            partido_eff = partido_by_dep.get(dep.id) or dep.sigla_partido_atual
            if busca_low and busca_low not in dep.nome_parlamentar.lower() and busca_low not in (dep.nome_civil or "").lower():
                continue
            if partido_norm and (partido_eff or "").upper() != partido_norm:
                continue

            qtd, tot = stats_by_dep.get(dep.id, (0, 0.0))
            pct = round((tot / total_recorte) * 100, 2) if total_recorte else 0.0
            cards.append(
                DeputadoCardOut(
                    id=dep.id,
                    nome_parlamentar=dep.nome_parlamentar,
                    nome_civil=dep.nome_civil,
                    uf=uf_norm,
                    partido=partido_eff,
                    url_foto=dep.url_foto,
                    link_oficial=dep.link_oficial,
                    situacao_atual=dep.situacao_atual,
                    legislaturas_no_recorte=sorted(set(legs_by_dep[dep.id])),
                    qtd_despesas=qtd,
                    total_liquido=tot,
                    percentual_no_recorte=pct,
                )
            )

        if ordenar_por == "nome_asc":
            cards.sort(key=lambda c: c.nome_parlamentar)
        elif ordenar_por == "qtd_desc":
            cards.sort(key=lambda c: (c.qtd_despesas, c.total_liquido), reverse=True)
        else:
            cards.sort(key=lambda c: (c.total_liquido, c.qtd_despesas), reverse=True)

        return cards

    def get_deputado_detail(
        self,
        session: Session,
        *,
        deputado_id: int,
        ano: int,
        uf: str | None = None,
    ) -> DeputadoDetailResponse | None:
        dep = session.get(Deputado, deputado_id)
        if dep is None:
            return None

        conds = [Despesa.deputado_id == deputado_id, Despesa.ano == ano]
        if uf and uf.upper() != "ALL":
            conds.append(Despesa.uf_recorte == uf.upper())

        agg = session.execute(
            select(
                func.count(Despesa.id),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
                func.coalesce(func.sum(Despesa.valor_glosa), 0),
            ).where(*conds)
        ).one()
        qtd_despesas = int(agg[0] or 0)
        total_liquido = _f(agg[1])
        total_glosas = _f(agg[2])

        cat_rows = session.execute(
            select(
                Despesa.tipo_despesa,
                func.count(Despesa.id),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
            )
            .where(*conds)
            .group_by(Despesa.tipo_despesa)
            .order_by(desc(func.sum(Despesa.valor_liquido)))
        ).all()
        categorias = [
            CategoriaResumo(
                categoria=r[0],
                qtd_lancamentos=int(r[1]),
                total_liquido=_f(r[2]),
                percentual=round((_f(r[2]) / total_liquido) * 100, 2) if total_liquido else 0.0,
            )
            for r in cat_rows
        ]

        month_rows = session.execute(
            select(
                Despesa.mes,
                func.count(Despesa.id),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
            )
            .where(*conds)
            .group_by(Despesa.mes)
            .order_by(asc(Despesa.mes))
        ).all()
        mmap = {int(r[0]): (int(r[1]), _f(r[2])) for r in month_rows}
        serie_mensal = [
            MensalResumo(
                mes=m,
                mes_nome=MESES_PT[m - 1],
                qtd_lancamentos=mmap.get(m, (0, 0.0))[0],
                qtd_deputados_ativos=1 if mmap.get(m, (0, 0.0))[0] > 0 else 0,
                total_liquido=mmap.get(m, (0, 0.0))[1],
            )
            for m in range(1, 13)
        ]

        forn_rows = session.execute(
            select(
                Despesa.nome_fornecedor,
                func.max(Despesa.cnpj_cpf_fornecedor),
                func.count(Despesa.id),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
            )
            .where(*conds)
            .group_by(Despesa.nome_fornecedor)
            .order_by(desc(func.sum(Despesa.valor_liquido)))
            .limit(8)
        ).all()
        fornecedores = [
            FornecedorResumo(
                nome_fornecedor=r[0],
                cnpj_cpf_fornecedor=r[1],
                qtd_lancamentos=int(r[2]),
                total_liquido=_f(r[3]),
            )
            for r in forn_rows
        ]

        hist_rows = session.scalars(
            select(DeputadoMandatoHistorico)
            .where(DeputadoMandatoHistorico.deputado_id == deputado_id)
            .order_by(desc(DeputadoMandatoHistorico.data_hora_evento), desc(DeputadoMandatoHistorico.id_legislatura))
        ).all()
        historico = [
            MandatoHistoricoOut(
                id_legislatura=h.id_legislatura,
                sigla_uf=h.sigla_uf,
                sigla_partido=h.sigla_partido,
                nome_na_epoca=h.nome_na_epoca,
                situacao=h.situacao,
                condicao_eleitoral=h.condicao_eleitoral,
                descricao_status=h.descricao_status,
                data_hora_evento=ensure_utc(h.data_hora_evento),
            )
            for h in hist_rows
        ]

        return DeputadoDetailResponse(
            id=dep.id,
            nome_parlamentar=dep.nome_parlamentar,
            nome_civil=dep.nome_civil,
            uf_atual=dep.sigla_uf_atual,
            partido_atual=dep.sigla_partido_atual,
            url_foto=dep.url_foto,
            email=dep.email,
            link_oficial=dep.link_oficial,
            situacao_atual=dep.situacao_atual,
            condicao_eleitoral=dep.condicao_eleitoral,
            ano_referencia=ano,
            uf_referencia=uf.upper() if uf and uf.upper() != "ALL" else dep.sigla_uf_atual,
            qtd_despesas=qtd_despesas,
            total_liquido=total_liquido,
            total_glosas=total_glosas,
            categorias=categorias,
            serie_mensal=serie_mensal,
            principais_fornecedores=fornecedores,
            historico_mandatos=historico,
            fonte_oficial_url=f"https://dadosabertos.camara.leg.br/api/v2/deputados/{dep.id}",
        )

    def _build_despesas_conditions(
        self,
        *,
        uf: str | None,
        ano: int | None,
        deputado_id: int | None,
        categoria: str | None,
        mes: int | None,
        busca: str | None,
    ) -> list:
        conds = []
        if uf and uf.upper() != "ALL":
            conds.append(Despesa.uf_recorte == uf.upper())
        if ano is not None:
            conds.append(Despesa.ano == ano)
        if deputado_id is not None:
            conds.append(Despesa.deputado_id == deputado_id)
        if categoria and categoria.strip() and categoria != "ALL":
            conds.append(Despesa.tipo_despesa == categoria.strip())
        if mes is not None and 1 <= mes <= 12:
            conds.append(Despesa.mes == mes)
        if busca and busca.strip():
            term = f"%{busca.strip().lower()}%"
            conds.append(
                func.lower(Despesa.nome_fornecedor).like(term)
                | func.lower(func.coalesce(Despesa.cnpj_cpf_fornecedor, "")).like(term)
                | func.lower(Deputado.nome_parlamentar).like(term)
            )
        return conds

    def list_despesas(
        self,
        session: Session,
        *,
        uf: str | None = None,
        ano: int | None = None,
        deputado_id: int | None = None,
        categoria: str | None = None,
        mes: int | None = None,
        busca: str | None = None,
        ordenar_por: str = "data_desc",
        page: int = 1,
        page_size: int = 25,
    ) -> DespesasPageResponse:
        conds = self._build_despesas_conditions(
            uf=uf,
            ano=ano,
            deputado_id=deputado_id,
            categoria=categoria,
            mes=mes,
            busca=busca,
        )

        # Verifica se há dados no recorte base (uf + ano) antes dos filtros granulares
        base_conds = []
        if uf and uf.upper() != "ALL":
            base_conds.append(Despesa.uf_recorte == uf.upper())
        if ano is not None:
            base_conds.append(Despesa.ano == ano)
        slice_count = session.scalar(select(func.count(Despesa.id)).where(*base_conds)) or 0
        slice_has_data = slice_count > 0

        stats = session.execute(
            select(
                func.count(Despesa.id),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
            )
            .select_from(Despesa)
            .join(Deputado, Deputado.id == Despesa.deputado_id)
            .where(*conds)
        ).one()

        total = int(stats[0] or 0)
        soma_filtrada = _f(stats[1])
        total_pages = max(1, (total + page_size - 1) // page_size) if total > 0 else 1
        safe_page = min(max(1, page), total_pages)
        offset = (safe_page - 1) * page_size

        order_clause = [desc(Despesa.data_documento), desc(Despesa.mes), desc(Despesa.id)]
        if ordenar_por == "valor_desc":
            order_clause = [desc(Despesa.valor_liquido), desc(Despesa.id)]
        elif ordenar_por == "valor_asc":
            order_clause = [asc(Despesa.valor_liquido), desc(Despesa.id)]
        elif ordenar_por == "data_asc":
            order_clause = [asc(Despesa.mes), asc(Despesa.data_documento), asc(Despesa.id)]

        rows = session.execute(
            select(Despesa, Deputado.nome_parlamentar, Deputado.sigla_partido_atual)
            .join(Deputado, Deputado.id == Despesa.deputado_id)
            .where(*conds)
            .order_by(*order_clause)
            .offset(offset)
            .limit(page_size)
        ).all()

        items = [
            DespesaOut(
                id=d.id,
                deputado_id=d.deputado_id,
                deputado_nome=dep_nome,
                deputado_partido=dep_partido,
                uf=d.uf_recorte,
                ano=d.ano,
                mes=d.mes,
                tipo_despesa=d.tipo_despesa,
                data_documento=d.data_documento,
                data_documento_original=d.data_documento_original,
                nome_fornecedor=d.nome_fornecedor,
                cnpj_cpf_fornecedor=d.cnpj_cpf_fornecedor,
                valor_documento=_f(d.valor_documento),
                valor_glosa=_f(d.valor_glosa),
                valor_liquido=_f(d.valor_liquido),
                valor_liquido_api_raw=_f(d.valor_liquido_api_raw),
                sinal_normalizado=d.sinal_normalizado,
                tipo_documento=d.tipo_documento,
                num_documento=d.num_documento,
                cod_documento=d.cod_documento,
                url_documento=d.url_documento,
                fonte_url=d.fonte_url,
            )
            for d, dep_nome, dep_partido in rows
        ]

        return DespesasPageResponse(
            items=items,
            total=total,
            page=safe_page,
            page_size=page_size,
            total_pages=total_pages,
            soma_filtrada=soma_filtrada,
            slice_has_data=slice_has_data,
        )

    def export_despesas_csv(
        self,
        session: Session,
        *,
        uf: str | None = None,
        ano: int | None = None,
        deputado_id: int | None = None,
        categoria: str | None = None,
        mes: int | None = None,
        busca: str | None = None,
        limit: int = 10000,
    ) -> str:
        conds = self._build_despesas_conditions(
            uf=uf,
            ano=ano,
            deputado_id=deputado_id,
            categoria=categoria,
            mes=mes,
            busca=busca,
        )
        rows = session.execute(
            select(Despesa, Deputado.nome_parlamentar, Deputado.sigla_partido_atual)
            .join(Deputado, Deputado.id == Despesa.deputado_id)
            .where(*conds)
            .order_by(desc(Despesa.data_documento), desc(Despesa.mes), desc(Despesa.id))
            .limit(limit)
        ).all()

        buf = io.StringIO()
        buf.write("\ufeff")  # BOM UTF-8 para compatibilidade direta com Excel em PT-BR
        writer = csv.writer(buf, delimiter=";")
        writer.writerow(
            [
                "uf",
                "ano",
                "mes",
                "deputado_id",
                "deputado_nome",
                "partido",
                "categoria",
                "data_documento",
                "fornecedor",
                "cnpj_cpf",
                "valor_documento_brl",
                "valor_glosa_brl",
                "valor_liquido_brl",
                "valor_liquido_api_bruto",
                "sinal_normalizado",
                "cod_documento",
                "url_documento",
                "fonte_api",
            ]
        )
        for d, dep_nome, dep_partido in rows:
            writer.writerow(
                [
                    d.uf_recorte,
                    d.ano,
                    d.mes,
                    d.deputado_id,
                    dep_nome,
                    dep_partido or "",
                    d.tipo_despesa,
                    d.data_documento.isoformat() if d.data_documento else (d.data_documento_original or ""),
                    d.nome_fornecedor,
                    d.cnpj_cpf_fornecedor or "",
                    f"{_f(d.valor_documento):.2f}",
                    f"{_f(d.valor_glosa):.2f}",
                    f"{_f(d.valor_liquido):.2f}",
                    f"{_f(d.valor_liquido_api_raw):.2f}",
                    "sim" if d.sinal_normalizado else "nao",
                    d.cod_documento or "",
                    d.url_documento or "",
                    d.fonte_url,
                ]
            )
        return buf.getvalue()

    def get_analytics(self, session: Session, *, uf: str, ano: int) -> AnalyticsResponse:
        overview = self.get_overview(session, uf=uf, ano=ano)
        deputados = self.list_deputados(session, uf=uf, ano=ano, ordenar_por="total_desc")
        comparacao_parlamentares = [
            DeputadoComparacaoOut(
                deputado_id=d.id,
                nome_parlamentar=d.nome_parlamentar,
                partido=d.partido,
                uf=d.uf,
                qtd_despesas=d.qtd_despesas,
                total_liquido=d.total_liquido,
                media_por_lancamento=round(d.total_liquido / d.qtd_despesas, 2) if d.qtd_despesas else 0.0,
            )
            for d in deputados
        ]

        # Comparação entre UFs que já possuem dados coletados no ano
        uf_rec_rows = session.execute(
            select(
                DeputadoRecorte.uf,
                func.count(func.distinct(DeputadoRecorte.deputado_id)),
            )
            .where(DeputadoRecorte.ano == ano)
            .group_by(DeputadoRecorte.uf)
        ).all()
        uf_desp_rows = session.execute(
            select(
                Despesa.uf_recorte,
                func.count(Despesa.id),
                func.coalesce(func.sum(Despesa.valor_liquido), 0),
            )
            .where(Despesa.ano == ano)
            .group_by(Despesa.uf_recorte)
        ).all()
        uf_desp_map = {r[0]: (int(r[1]), _f(r[2])) for r in uf_desp_rows}

        execs = session.scalars(
            select(ExecucaoColeta)
            .where(ExecucaoColeta.ano == ano)
            .order_by(desc(ExecucaoColeta.iniciado_em))
        ).all()
        exec_status_map: dict[str, str] = {}
        for ex in execs:
            exec_status_map.setdefault(ex.uf, ex.status)

        distribuicao_ufs: list[UfComparacaoOut] = []
        for uf_code, qtd_deps in uf_rec_rows:
            qtd_desp, tot_liq = uf_desp_map.get(uf_code, (0, 0.0))
            uf_nome = UFS_BRASIL.get(uf_code, (uf_code, ""))[0]
            distribuicao_ufs.append(
                UfComparacaoOut(
                    uf=uf_code,
                    uf_nome=uf_nome,
                    qtd_deputados=int(qtd_deps),
                    qtd_despesas=qtd_desp,
                    total_liquido=tot_liq,
                    media_por_deputado=round(tot_liq / qtd_deps, 2) if qtd_deps else 0.0,
                    status_coleta=exec_status_map.get(uf_code),
                )
            )
        distribuicao_ufs.sort(key=lambda u: u.total_liquido, reverse=True)

        return AnalyticsResponse(
            uf=overview.uf,
            ano=ano,
            has_data=overview.has_data,
            total_liquido=overview.total_liquido,
            por_categoria=overview.categorias_resumo,
            evolucao_mensal=overview.serie_mensal,
            comparacao_parlamentares=comparacao_parlamentares,
            distribuicao_ufs=distribuicao_ufs,
            aviso_metodologico=(
                "Os valores refletem despesas registradas na Cota para o Exercício da Atividade Parlamentar (CEAP) "
                "no recorte selecionado. Diferenças entre parlamentares dependem de distância até Brasília, "
                "tamanho do gabinete, tempo de exercício no ano e estrutura de atuação — não representam julgamento de irregularidade."
            ),
        )

    def list_execucoes(self, session: Session, *, limit: int = 25) -> list[ExecucaoOut]:
        rows = session.scalars(
            select(ExecucaoColeta).order_by(desc(ExecucaoColeta.iniciado_em)).limit(limit)
        ).all()
        return [_exec_to_schema(ex) for ex in rows]
