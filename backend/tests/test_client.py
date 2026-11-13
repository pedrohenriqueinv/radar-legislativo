from __future__ import annotations

import httpx
import pytest
import respx

from app.etl.client import CamaraAPIClient, CamaraAPIError


def test_pagination_follows_next_links() -> None:
    base = "https://dadosabertos.camara.leg.br/api/v2"
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{base}/deputados/101/despesas", params={"ano": "2025", "pagina": "2"}).respond(
            200,
            json={
                "dados": [{"codDocumento": "2", "ano": 2025, "mes": 2}],
                "links": [
                    {"rel": "self", "href": f"{base}/deputados/101/despesas?ano=2025&pagina=2"},
                    {"rel": "previous", "href": f"{base}/deputados/101/despesas?ano=2025&pagina=1"},
                ],
            },
        )
        mock.get(f"{base}/deputados/101/despesas").respond(
            200,
            json={
                "dados": [{"codDocumento": "1", "ano": 2025, "mes": 1}],
                "links": [
                    {"rel": "self", "href": f"{base}/deputados/101/despesas?ano=2025&pagina=1"},
                    {"rel": "next", "href": f"{base}/deputados/101/despesas?ano=2025&pagina=2"},
                ],
            },
        )

        with CamaraAPIClient(base_url=base, rate_limit_delay=0.0) as client:
            items, visited = client.fetch_deputado_despesas(101, 2025, id_legislatura=57)

    assert [item["codDocumento"] for item in items] == ["1", "2"]
    assert len(visited) == 2


def test_empty_api_response_returns_empty_list() -> None:
    base = "https://dadosabertos.camara.leg.br/api/v2"
    with respx.mock() as mock:
        mock.get(f"{base}/deputados/202/despesas").respond(
            200,
            json={"dados": [], "links": []},
        )
        with CamaraAPIClient(base_url=base, rate_limit_delay=0.0) as client:
            items, visited = client.fetch_deputado_despesas(202, 2025)

    assert items == []
    assert len(visited) == 1


def test_timeout_triggers_retries_and_raises_camara_error() -> None:
    base = "https://dadosabertos.camara.leg.br/api/v2"
    with respx.mock() as mock:
        route = mock.get(f"{base}/legislaturas").mock(side_effect=httpx.ReadTimeout("timeout"))
        with CamaraAPIClient(base_url=base, max_retries=2, rate_limit_delay=0.0) as client:
            client._sleep = lambda _s: None  # evita espera em testes unitários
            with pytest.raises(CamaraAPIError) as exc_info:
                client.fetch_legislaturas()

    assert route.call_count == 2
    assert exc_info.value.is_timeout is True


def test_http_503_retries_and_recovers_on_second_attempt() -> None:
    base = "https://dadosabertos.camara.leg.br/api/v2"
    with respx.mock() as mock:
        route = mock.get(f"{base}/deputados/303").mock(
            side_effect=[
                httpx.Response(503, json={"erro": "temporario"}),
                httpx.Response(200, json={"dados": {"id": 303, "ultimoStatus": {"nome": "Dep Teste"}}}),
            ]
        )
        with CamaraAPIClient(base_url=base, max_retries=3, rate_limit_delay=0.0) as client:
            client._sleep = lambda _s: None
            detail = client.fetch_deputado_detalhe(303)

    assert route.call_count == 2
    assert detail is not None
    assert detail["id"] == 303


def test_http_404_fails_without_unnecessary_retries() -> None:
    base = "https://dadosabertos.camara.leg.br/api/v2"
    with respx.mock() as mock:
        route = mock.get(f"{base}/deputados/999999").respond(404, json={"title": "Not Found"})
        with CamaraAPIClient(base_url=base, max_retries=3, rate_limit_delay=0.0) as client:
            client._sleep = lambda _s: None
            with pytest.raises(CamaraAPIError) as exc_info:
                client.fetch_deputado_detalhe(999999)

    assert route.call_count == 1
    assert exc_info.value.status_code == 404
