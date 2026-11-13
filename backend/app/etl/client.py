from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger("radar_legislativo.etl.client")

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class CamaraAPIError(Exception):
    """Erro estruturado ao consultar a API de Dados Abertos da Câmara."""

    def __init__(
        self,
        message: str,
        *,
        url: str,
        status_code: int | None = None,
        is_timeout: bool = False,
        is_connection_error: bool = False,
    ) -> None:
        super().__init__(message)
        self.url = url
        self.status_code = status_code
        self.is_timeout = is_timeout
        self.is_connection_error = is_connection_error


class CamaraAPIClient:
    """Cliente HTTP resiliente para a API v2 da Câmara dos Deputados."""

    def __init__(
        self,
        base_url: str = "https://dadosabertos.camara.leg.br/api/v2",
        timeout_seconds: float = 15.0,
        max_retries: int = 3,
        rate_limit_delay: float = 0.08,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(1, max_retries)
        self.rate_limit_delay = max(0.0, rate_limit_delay)
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(
            timeout=httpx.Timeout(timeout_seconds),
            headers={
                "Accept": "application/json",
                "User-Agent": "RadarLegislativo/1.0 (Dados Abertos Portfolio)",
            },
            follow_redirects=True,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> CamaraAPIClient:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def _sleep(self, seconds: float) -> None:
        if seconds > 0:
            time.sleep(seconds)

    def get_json(self, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """Executa GET com timeout, tratamento de erro HTTP e backoff progressivo."""
        last_error: CamaraAPIError | None = None

        for attempt in range(self.max_retries):
            if attempt > 0:
                backoff = min(4.0, 0.4 * (2 ** (attempt - 1)))
                logger.warning("Tentativa %d/%d para %s após %.2fs", attempt + 1, self.max_retries, url, backoff)
                self._sleep(backoff)

            try:
                response = self._client.get(url, params=params)
            except httpx.TimeoutException as exc:
                last_error = CamaraAPIError(
                    f"Timeout após {self.timeout_seconds}s ao consultar {url}",
                    url=url,
                    is_timeout=True,
                )
                logger.warning("Timeout na requisição (%s): %s", url, exc)
                continue
            except httpx.RequestError as exc:
                last_error = CamaraAPIError(
                    f"Falha de conexão ao consultar {url}: {exc}",
                    url=url,
                    is_connection_error=True,
                )
                logger.warning("Erro de transporte na requisição (%s): %s", url, exc)
                continue

            if response.status_code in RETRYABLE_STATUS_CODES:
                last_error = CamaraAPIError(
                    f"HTTP {response.status_code} temporário em {url}",
                    url=url,
                    status_code=response.status_code,
                )
                logger.warning("HTTP %d retentável em %s", response.status_code, url)
                continue

            if response.status_code >= 400:
                raise CamaraAPIError(
                    f"Erro HTTP {response.status_code} ao consultar {url}",
                    url=url,
                    status_code=response.status_code,
                )

            try:
                payload = response.json()
            except ValueError as exc:
                raise CamaraAPIError(
                    f"Resposta JSON inválida recebida de {url}: {exc}",
                    url=url,
                    status_code=response.status_code,
                ) from exc

            if not isinstance(payload, dict):
                raise CamaraAPIError(
                    f"Formato inesperado na resposta de {url}: esperado objeto JSON.",
                    url=url,
                    status_code=response.status_code,
                )

            self._sleep(self.rate_limit_delay)
            return payload

        assert last_error is not None
        raise last_error

    def paginate_all(
        self,
        path_or_url: str,
        params: dict[str, Any] | None = None,
        *,
        max_pages: int = 200,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        """Percorre todas as páginas seguindo os links `rel=next` da API oficial."""
        initial_url = path_or_url if path_or_url.startswith("http") else f"{self.base_url}{path_or_url}"
        next_url: str | None = initial_url
        next_params: dict[str, Any] | None = dict(params or {})
        items: list[dict[str, Any]] = []
        visited_urls: list[str] = []
        seen_urls: set[str] = set()

        for _ in range(max_pages):
            if not next_url:
                break
            payload = self.get_json(next_url, params=next_params)
            # Os links `next` da Câmara já carregam query string completa.
            visited_urls.append(next_url)
            seen_urls.add(next_url)

            page_items = payload.get("dados")
            if isinstance(page_items, list):
                items.extend(row for row in page_items if isinstance(row, dict))

            links = payload.get("links") or []
            candidate_next = None
            if isinstance(links, list):
                for link in links:
                    if isinstance(link, dict) and link.get("rel") == "next" and link.get("href"):
                        candidate_next = str(link["href"])
                        break

            if not candidate_next or candidate_next in seen_urls:
                break

            next_url = candidate_next
            next_params = None

        return items, visited_urls

    def fetch_legislaturas(self) -> list[dict[str, Any]]:
        items, _ = self.paginate_all(
            "/legislaturas",
            params={"itens": 100, "ordem": "DESC", "ordenarPor": "id"},
        )
        return items

    def fetch_deputados_uf_legislatura(self, uf: str, id_legislatura: int) -> list[dict[str, Any]]:
        items, _ = self.paginate_all(
            "/deputados",
            params={
                "siglaUf": uf.upper(),
                "idLegislatura": id_legislatura,
                "itens": 100,
                "ordem": "ASC",
                "ordenarPor": "nome",
            },
        )
        return items

    def fetch_deputado_detalhe(self, deputado_id: int) -> dict[str, Any] | None:
        payload = self.get_json(f"{self.base_url}/deputados/{deputado_id}")
        dados = payload.get("dados")
        return dados if isinstance(dados, dict) else None

    def fetch_deputado_historico(self, deputado_id: int) -> list[dict[str, Any]]:
        payload = self.get_json(f"{self.base_url}/deputados/{deputado_id}/historico")
        dados = payload.get("dados")
        return [row for row in dados if isinstance(row, dict)] if isinstance(dados, list) else []

    def fetch_deputado_despesas(
        self,
        deputado_id: int,
        ano: int,
        id_legislatura: int | None = None,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        params: dict[str, Any] = {
            "ano": ano,
            "itens": 100,
            "ordem": "ASC",
            "ordenarPor": "mes",
        }
        if id_legislatura is not None:
            params["idLegislatura"] = id_legislatura
        return self.paginate_all(f"/deputados/{deputado_id}/despesas", params=params)
