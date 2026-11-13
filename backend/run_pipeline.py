from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Permite executar diretamente via `python backend/run_pipeline.py`
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings
from app.db import check_database_connection, create_database_context, init_schema
from app.etl.client import CamaraAPIClient
from app.etl.pipeline import run_collection
from app.logging_config import configure_logging


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Executa o pipeline ETL do Radar Legislativo (API da Câmara -> Banco Relacional)."
    )
    parser.add_argument("--uf", required=True, help="Sigla da UF brasileira (ex.: DF, AP, SP)")
    parser.add_argument("--ano", required=True, type=int, help="Ano civil do recorte (ex.: 2025)")
    parser.add_argument(
        "--max-deputados",
        type=int,
        default=None,
        help="Limite opcional de parlamentares (gera coleta marcada como parcial quando menor que o total da UF).",
    )
    args = parser.parse_args()

    configure_logging()
    settings = get_settings()
    ctx = create_database_context(settings)
    ok, err = check_database_connection(ctx.engine)
    if not ok:
        print(f"[ERRO DE BANCO] Não foi possível conectar a {ctx.target_label}: {err}", file=sys.stderr)
        return 2

    init_schema(ctx.engine)
    print(f"Conectado a {ctx.target_label}. Iniciando coleta para {args.uf.upper()}/{args.ano}...")

    with CamaraAPIClient(
        base_url=settings.camara_api_base_url,
        timeout_seconds=settings.camara_http_timeout_seconds,
        max_retries=settings.camara_max_retries,
        rate_limit_delay=settings.camara_rate_limit_delay_seconds,
    ) as client:
        result = run_collection(
            ctx.session_factory,
            ctx.engine,
            client,
            uf=args.uf,
            ano=args.ano,
            max_deputados=args.max_deputados,
        )

    print(
        f"Execução #{result.execucao_id} concluída | status={result.status} | "
        f"legislaturas={result.legislaturas_consultadas} | "
        f"deputados={result.deputados_processados}/{result.deputados_esperados} (erros={result.deputados_com_erro}) | "
        f"despesas={result.despesas_coletadas} (novas={result.despesas_inseridas}, atualizadas={result.despesas_atualizadas})"
    )
    if result.resumo_erros:
        print(f"Observações/erros: {result.resumo_erros}")

    return 0 if result.status in {"completa", "parcial"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
