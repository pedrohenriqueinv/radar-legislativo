from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.etl.transform import (
    legislaturas_para_ano,
    normalize_deputado,
    normalize_legislaturas,
    parse_date_safe,
    to_decimal_money,
    transform_despesas,
)


def test_missing_optional_fields_are_handled_safely() -> None:
    dep = normalize_deputado(
        {"id": 123, "nome": "  Maria   Silva  ", "siglaUf": "sp"},
        detail=None,
    )
    assert dep["nome_parlamentar"] == "Maria Silva"
    assert dep["sigla_uf_atual"] == "SP"
    assert dep["url_foto"] is None
    assert dep["sigla_partido_atual"] is None
    assert dep["link_oficial"] == "https://www.camara.leg.br/deputados/123"

    raw_expenses = [
        {
            "ano": 2025,
            "mes": 3,
            "tipoDespesa": "TELEFONIA",
            "codDocumento": "0",
            "tipoDocumento": None,
            "dataDocumento": None,
            "numDocumento": None,
            "valorDocumento": 120.5,
            "valorGlosa": None,
            "valorLiquido": -120.5,
            "urlDocumento": "",
            "nomeFornecedor": "",
            "cnpjCpfFornecedor": None,
            "parcela": None,
        }
    ]
    rows, errors = transform_despesas(123, "SP", "https://api/despesas", raw_expenses)
    assert errors == []
    assert len(rows) == 1
    row = rows[0]
    assert row["data_documento"] is None
    assert row["url_documento"] is None
    assert row["nome_fornecedor"] == "Fornecedor não informado"
    assert row["valor_glosa"] == Decimal("0.00")
    assert row["valor_liquido"] == Decimal("120.50")
    assert row["sinal_normalizado"] is True


def test_date_and_monetary_conversions_and_refund_sign() -> None:
    assert parse_date_safe("2025-01-08T14:22:00") == date(2025, 1, 8)
    assert parse_date_safe("08/01/2025") == date(2025, 1, 8)
    assert parse_date_safe("invalida") is None
    assert to_decimal_money("1.234,56") == Decimal("1234.56")
    assert to_decimal_money(170.035) == Decimal("170.04")

    # Passagem aérea cancelada (SIGEPA): documento e líquido negativos -> deve permanecer negativo!
    raw = [
        {
            "ano": 2024,
            "mes": 2,
            "tipoDespesa": "PASSAGEM AÉREA - SIGEPA",
            "codDocumento": "223521",
            "dataDocumento": "2024-02-07T12:00:00",
            "valorDocumento": -1577.58,
            "valorGlosa": 0.0,
            "valorLiquido": -1577.58,
            "nomeFornecedor": "GOL",
        },
        {
            "ano": 2024,
            "mes": 1,
            "tipoDespesa": "PASSAGEM AÉREA - SIGEPA",
            "codDocumento": "223521",
            "dataDocumento": "2024-01-30T12:00:00",
            "valorDocumento": 129.54,
            "valorGlosa": 0.0,
            "valorLiquido": 129.54,
            "nomeFornecedor": "GOL",
        },
    ]
    rows, errors = transform_despesas(74057, "SP", "https://api/despesas", raw)
    assert errors == []
    assert len(rows) == 2
    assert rows[0]["valor_liquido"] == Decimal("-1577.58")
    assert rows[0]["sinal_normalizado"] is False
    assert rows[1]["valor_liquido"] == Decimal("129.54")
    # Mesmo codDocumento e parcela=0, mas chaves distintas!
    assert rows[0]["chave_deduplicacao"] != rows[1]["chave_deduplicacao"]


def test_deduplication_preserves_distinct_zero_doc_and_identical_lines() -> None:
    raw = [
        {
            "ano": 2025,
            "mes": 4,
            "tipoDespesa": "TELEFONIA",
            "codDocumento": "0",
            "numDocumento": "111",
            "valorDocumento": 10.0,
            "valorLiquido": -10.0,
            "nomeFornecedor": "RAMAL",
        },
        {
            "ano": 2025,
            "mes": 4,
            "tipoDespesa": "TELEFONIA",
            "codDocumento": "0",
            "numDocumento": "111",
            "valorDocumento": 10.0,
            "valorLiquido": -10.0,
            "nomeFornecedor": "RAMAL",
        },
        {
            "ano": 2025,
            "mes": 4,
            "tipoDespesa": "TELEFONIA",
            "codDocumento": "0",
            "numDocumento": "222",
            "valorDocumento": 25.0,
            "valorLiquido": -25.0,
            "nomeFornecedor": "CELULAR",
        },
    ]
    rows1, _ = transform_despesas(10, "AP", "https://api", raw)
    rows2, _ = transform_despesas(10, "AP", "https://api", raw)
    assert len({r["chave_deduplicacao"] for r in rows1}) == 3
    # Reprocessamento determinístico produz exatamente as mesmas chaves (idempotência)
    assert [r["chave_deduplicacao"] for r in rows1] == [r["chave_deduplicacao"] for r in rows2]


def test_legislaturas_mapping_handles_transition_year_2023() -> None:
    legs = normalize_legislaturas(
        [
            {"id": 57, "dataInicio": "2023-02-01", "dataFim": "2027-01-31"},
            {"id": 56, "dataInicio": "2019-02-01", "dataFim": "2023-01-31"},
        ]
    )
    assert legislaturas_para_ano(legs, 2023) == [56, 57]
    assert legislaturas_para_ano(legs, 2022) == [56]
    assert legislaturas_para_ano(legs, 2025) == [57]
