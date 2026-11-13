from __future__ import annotations

import httpx
import respx
from sqlalchemy import func, select

from app.etl.client import CamaraAPIClient
from app.etl.pipeline import run_collection
from app.models import Despesa, ExecucaoColeta
from app.repository import RadarRepository


def _mock_camara_two_deputies(mock: respx.MockRouter, *, fail_second_deputy: bool = False) -> None:
    base = "https://dadosabertos.camara.leg.br/api/v2"
    mock.get(f"{base}/legislaturas").respond(
        200,
        json={
            "dados": [{"id": 57, "uri": f"{base}/legislaturas/57", "dataInicio": "2023-02-01", "dataFim": "2027-01-31"}],
            "links": [],
        },
    )
    mock.get(f"{base}/deputados").respond(
        200,
        json={
            "dados": [
                {"id": 101, "nome": "Ana Parlamentar", "siglaUf": "DF", "siglaPartido": "ABC", "idLegislatura": 57},
                {"id": 102, "nome": "Bruno Deputado", "siglaUf": "DF", "siglaPartido": "XYZ", "idLegislatura": 57},
            ],
            "links": [],
        },
    )
    mock.get(f"{base}/deputados/101").respond(
        200,
        json={
            "dados": {
                "id": 101,
                "nomeCivil": "ANA PARLAMENTAR CIVIL",
                "ultimoStatus": {"nomeEleitoral": "Ana Parlamentar", "siglaUf": "DF", "siglaPartido": "ABC", "situacao": "Exercício"},
            }
        },
    )
    mock.get(f"{base}/deputados/101/historico").respond(200, json={"dados": []})
    mock.get(f"{base}/deputados/101/despesas").respond(
        200,
        json={
            "dados": [
                {
                    "ano": 2025,
                    "mes": 1,
                    "tipoDespesa": "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.",
                    "codDocumento": "5001",
                    "dataDocumento": "2025-01-10T00:00:00",
                    "valorDocumento": 1500.0,
                    "valorGlosa": 0.0,
                    "valorLiquido": -1500.0,
                    "nomeFornecedor": "Grafica DF",
                },
                {
                    "ano": 2025,
                    "mes": 2,
                    "tipoDespesa": "COMBUSTÍVEIS E LUBRIFICANTES.",
                    "codDocumento": "5002",
                    "dataDocumento": "2025-02-12T00:00:00",
                    "valorDocumento": 300.0,
                    "valorGlosa": 0.0,
                    "valorLiquido": -300.0,
                    "nomeFornecedor": "Posto Eixo",
                },
            ],
            "links": [],
        },
    )

    mock.get(f"{base}/deputados/102").respond(
        200,
        json={
            "dados": {
                "id": 102,
                "nomeCivil": "BRUNO DEPUTADO CIVIL",
                "ultimoStatus": {"nomeEleitoral": "Bruno Deputado", "siglaUf": "DF", "siglaPartido": "XYZ", "situacao": "Exercício"},
            }
        },
    )
    mock.get(f"{base}/deputados/102/historico").respond(200, json={"dados": []})
    if fail_second_deputy:
        mock.get(f"{base}/deputados/102/despesas").respond(500, json={"erro": "falha interna"})
    else:
        mock.get(f"{base}/deputados/102/despesas").respond(
            200,
            json={
                "dados": [
                    {
                        "ano": 2025,
                        "mes": 1,
                        "tipoDespesa": "PASSAGEM AÉREA - SIGEPA",
                        "codDocumento": "9001",
                        "dataDocumento": "2025-01-18T12:00:00",
                        "valorDocumento": 950.0,
                        "valorGlosa": 0.0,
                        "valorLiquido": 950.0,
                        "nomeFornecedor": "LATAM",
                    }
                ],
                "links": [],
            },
        )


def test_idempotent_rerun_does_not_duplicate_records(isolated_db) -> None:
    with respx.mock() as mock:
        _mock_camara_two_deputies(mock, fail_second_deputy=False)
        with CamaraAPIClient(rate_limit_delay=0.0) as client:
            res1 = run_collection(isolated_db.session_factory, isolated_db.engine, client, uf="DF", ano=2025)
            res2 = run_collection(isolated_db.session_factory, isolated_db.engine, client, uf="DF", ano=2025)

    assert res1.status == "completa"
    assert res1.despesas_inseridas == 3
    assert res1.despesas_atualizadas == 0

    assert res2.status == "completa"
    assert res2.despesas_inseridas == 0
    assert res2.despesas_atualizadas == 3

    with isolated_db.session_factory() as session:
        total_rows = session.scalar(select(func.count(Despesa.id)))
        assert total_rows == 3


def test_partial_collection_and_failure_preserve_existing_valid_data(isolated_db) -> None:
    # 1. Primeira execução completa com 3 despesas
    with respx.mock() as mock:
        _mock_camara_two_deputies(mock, fail_second_deputy=False)
        with CamaraAPIClient(rate_limit_delay=0.0) as client:
            ok_res = run_collection(isolated_db.session_factory, isolated_db.engine, client, uf="DF", ano=2025)
    assert ok_res.status == "completa"

    # 2. Segunda execução com falha parcial no deputado 102 -> deve marcar `parcial` sem perder despesas
    with respx.mock() as mock:
        _mock_camara_two_deputies(mock, fail_second_deputy=True)
        with CamaraAPIClient(max_retries=1, rate_limit_delay=0.0) as client:
            partial_res = run_collection(isolated_db.session_factory, isolated_db.engine, client, uf="DF", ano=2025)

    assert partial_res.status == "parcial"
    assert partial_res.deputados_processados == 1
    assert partial_res.deputados_com_erro == 1

    # 3. Terceira execução com falha fatal na API de legislaturas -> `falhou`, mas preserva todas as 3 despesas anteriores
    base = "https://dadosabertos.camara.leg.br/api/v2"
    with respx.mock() as mock:
        mock.get(f"{base}/legislaturas").mock(side_effect=httpx.ConnectError("sem rede"))
        with CamaraAPIClient(max_retries=1, rate_limit_delay=0.0) as client:
            fail_res = run_collection(isolated_db.session_factory, isolated_db.engine, client, uf="DF", ano=2025)

    assert fail_res.status == "falhou"
    with isolated_db.session_factory() as session:
        total_rows = session.scalar(select(func.count(Despesa.id)))
        exec_count = session.scalar(select(func.count(ExecucaoColeta.id)))
        assert total_rows == 3
        assert exec_count == 3


def test_repository_filters_and_totals_match_loaded_data(isolated_db) -> None:
    with respx.mock() as mock:
        _mock_camara_two_deputies(mock, fail_second_deputy=False)
        with CamaraAPIClient(rate_limit_delay=0.0) as client:
            run_collection(isolated_db.session_factory, isolated_db.engine, client, uf="DF", ano=2025)

    repo = RadarRepository()
    with isolated_db.session_factory() as session:
        ov = repo.get_overview(session, uf="DF", ano=2025)
        assert ov.has_data is True
        assert ov.qtd_deputados == 2
        assert ov.qtd_despesas == 3
        assert ov.total_liquido == 2750.0  # 1500 + 300 + 950
        assert ov.qtd_categorias == 3

        filtered = repo.list_despesas(session, uf="DF", ano=2025, mes=1)
        assert filtered.total == 2
        assert filtered.soma_filtrada == 2450.0  # 1500 + 950

        by_dep = repo.list_despesas(session, uf="DF", ano=2025, deputado_id=101, categoria="COMBUSTÍVEIS E LUBRIFICANTES.")
        assert by_dep.total == 1
        assert by_dep.soma_filtrada == 300.0
