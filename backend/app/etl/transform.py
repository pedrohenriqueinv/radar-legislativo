from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

UFS_BRASIL: dict[str, tuple[str, str]] = {
    "AC": ("Acre", "Norte"),
    "AL": ("Alagoas", "Nordeste"),
    "AM": ("Amazonas", "Norte"),
    "AP": ("Amapá", "Norte"),
    "BA": ("Bahia", "Nordeste"),
    "CE": ("Ceará", "Nordeste"),
    "DF": ("Distrito Federal", "Centro-Oeste"),
    "ES": ("Espírito Santo", "Sudeste"),
    "GO": ("Goiás", "Centro-Oeste"),
    "MA": ("Maranhão", "Nordeste"),
    "MG": ("Minas Gerais", "Sudeste"),
    "MS": ("Mato Grosso do Sul", "Centro-Oeste"),
    "MT": ("Mato Grosso", "Centro-Oeste"),
    "PA": ("Pará", "Norte"),
    "PB": ("Paraíba", "Nordeste"),
    "PE": ("Pernambuco", "Nordeste"),
    "PI": ("Piauí", "Nordeste"),
    "PR": ("Paraná", "Sul"),
    "RJ": ("Rio de Janeiro", "Sudeste"),
    "RN": ("Rio Grande do Norte", "Nordeste"),
    "RO": ("Rondônia", "Norte"),
    "RR": ("Roraima", "Norte"),
    "RS": ("Rio Grande do Sul", "Sul"),
    "SC": ("Santa Catarina", "Sul"),
    "SE": ("Sergipe", "Nordeste"),
    "SP": ("São Paulo", "Sudeste"),
    "TO": ("Tocantins", "Norte"),
}

CAMARA_PORTAL_DEPUTADO_URL = "https://www.camara.leg.br/deputados/{deputado_id}"


def clean_str(value: Any, *, max_len: int | None = None) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    if not text:
        return None
    if max_len is not None and len(text) > max_len:
        return text[:max_len].rstrip()
    return text


def parse_date_safe(value: Any) -> date | None:
    raw = clean_str(value)
    if not raw:
        return None
    candidate = raw[:10]
    try:
        return date.fromisoformat(candidate)
    except ValueError:
        pass
    for fmt in ("%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(candidate, fmt).date()
        except ValueError:
            continue
    return None


def parse_datetime_safe(value: Any) -> datetime | None:
    raw = clean_str(value)
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            # Horário oficial de Brasília (-03:00) convertido para UTC para armazenamento consistente.
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        d = parse_date_safe(raw)
        if d is not None:
            return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        return None


def to_decimal_money(value: Any, default: str = "0.00") -> Decimal:
    if value is None or value == "":
        return Decimal(default)
    try:
        if isinstance(value, str):
            normalized = value.strip().replace(" ", "")
            if "," in normalized and "." in normalized:
                normalized = normalized.replace(".", "").replace(",", ".")
            elif "," in normalized:
                normalized = normalized.replace(",", ".")
            d = Decimal(normalized)
        else:
            d = Decimal(str(value))
        return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Valor monetário inválido: {value!r}") from exc


def normalize_valor_liquido(
    valor_documento: Decimal,
    valor_liquido_api_raw: Decimal,
) -> tuple[Decimal, bool]:
    """
    Normaliza o valor líquido considerando o comportamento real observado na API v2 da Câmara:
    - Para a maior parte das despesas CEAP (exceto PASSAGEM AÉREA - SIGEPA), a API v2
      retorna `valorLiquido` negativo mesmo quando `valorDocumento >= 0`.
    - Para passagens aéreas SIGEPA canceladas/reembolsadas, tanto `valorDocumento` quanto
      `valorLiquido` vêm negativos: esses estornos legítimos devem permanecer negativos.
    """
    if valor_liquido_api_raw == Decimal("0.00"):
        return Decimal("0.00"), False
    if valor_documento >= Decimal("0.00") and valor_liquido_api_raw < Decimal("0.00"):
        return abs(valor_liquido_api_raw).quantize(Decimal("0.01")), True
    return valor_liquido_api_raw.quantize(Decimal("0.01")), False


def normalize_legislaturas(raw_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in raw_items:
        leg_id = item.get("id")
        dt_ini = parse_date_safe(item.get("dataInicio"))
        dt_fim = parse_date_safe(item.get("dataFim"))
        if leg_id is None or dt_ini is None or dt_fim is None:
            continue
        normalized.append(
            {
                "id": int(leg_id),
                "uri": clean_str(item.get("uri"), max_len=255),
                "data_inicio": dt_ini,
                "data_fim": dt_fim,
            }
        )
    normalized.sort(key=lambda row: row["id"], reverse=True)
    return normalized


def legislaturas_para_ano(legislaturas: list[dict[str, Any]], ano: int) -> list[int]:
    """Retorna todas as legislaturas cuja vigência sobrepõe o ano civil informado."""
    inicio_ano = date(ano, 1, 1)
    fim_ano = date(ano, 12, 31)
    matches = [
        int(leg["id"])
        for leg in legislaturas
        if leg["data_inicio"] <= fim_ano and leg["data_fim"] >= inicio_ano
    ]
    return sorted(set(matches))


def normalize_deputado(
    summary: dict[str, Any],
    detail: dict[str, Any] | None = None,
) -> dict[str, Any]:
    dep_id = int(summary["id"])
    ultimo_status = (detail or {}).get("ultimoStatus") or {}
    if not isinstance(ultimo_status, dict):
        ultimo_status = {}

    nome_parlamentar = (
        clean_str(ultimo_status.get("nomeEleitoral"), max_len=200)
        or clean_str(ultimo_status.get("nome"), max_len=200)
        or clean_str(summary.get("nome"), max_len=200)
        or f"Deputado {dep_id}"
    )

    uf_atual = clean_str(ultimo_status.get("siglaUf") or summary.get("siglaUf"), max_len=2)
    partido_atual = clean_str(ultimo_status.get("siglaPartido") or summary.get("siglaPartido"), max_len=40)
    leg_atual = ultimo_status.get("idLegislatura") or summary.get("idLegislatura")

    return {
        "id": dep_id,
        "uri": clean_str(summary.get("uri"), max_len=255)
        or f"https://dadosabertos.camara.leg.br/api/v2/deputados/{dep_id}",
        "nome_parlamentar": nome_parlamentar,
        "nome_civil": clean_str((detail or {}).get("nomeCivil"), max_len=255),
        "sigla_uf_atual": uf_atual.upper() if uf_atual else None,
        "sigla_partido_atual": partido_atual,
        "id_legislatura_atual": int(leg_atual) if leg_atual is not None else None,
        "url_foto": clean_str(ultimo_status.get("urlFoto") or summary.get("urlFoto"), max_len=500),
        "email": clean_str(
            (ultimo_status.get("gabinete") or {}).get("email")
            if isinstance(ultimo_status.get("gabinete"), dict)
            else None
        )
        or clean_str(ultimo_status.get("email") or summary.get("email"), max_len=255),
        "link_oficial": CAMARA_PORTAL_DEPUTADO_URL.format(deputado_id=dep_id),
        "situacao_atual": clean_str(ultimo_status.get("situacao"), max_len=80),
        "condicao_eleitoral": clean_str(ultimo_status.get("condicaoEleitoral"), max_len=80),
    }


def normalize_historico(deputado_id: int, raw_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for ev in raw_events:
        leg = ev.get("idLegislatura")
        uf = clean_str(ev.get("siglaUf"), max_len=2)
        if leg is None or not uf:
            continue
        uf_upper = uf.upper()
        partido = clean_str(ev.get("siglaPartido"), max_len=40)
        nome_epoca = clean_str(ev.get("nomeEleitoral") or ev.get("nome"), max_len=200)
        situacao = clean_str(ev.get("situacao"), max_len=80)
        condicao = clean_str(ev.get("condicaoEleitoral"), max_len=80)
        descricao = clean_str(ev.get("descricaoStatus"))
        data_raw = clean_str(ev.get("dataHora")) or ""
        dt_evento = parse_datetime_safe(data_raw)

        payload_key = "|".join(
            [
                str(deputado_id),
                str(int(leg)),
                uf_upper,
                partido or "",
                data_raw,
                situacao or "",
                descricao or "",
            ]
        )
        chave = hashlib.sha256(payload_key.encode("utf-8")).hexdigest()
        if chave in seen_keys:
            continue
        seen_keys.add(chave)

        normalized.append(
            {
                "deputado_id": deputado_id,
                "id_legislatura": int(leg),
                "sigla_uf": uf_upper,
                "sigla_partido": partido,
                "nome_na_epoca": nome_epoca,
                "situacao": situacao,
                "condicao_eleitoral": condicao,
                "descricao_status": descricao,
                "data_hora_evento": dt_evento,
                "chave_evento": chave,
            }
        )

    return normalized


def transform_despesas(
    deputado_id: int,
    uf_recorte: str,
    fonte_url: str,
    raw_items: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Valida, padroniza e gera chaves determinísticas de deduplicação para um lote de despesas.
    Retorna (despesas_validas, lista_de_erros_de_registro).
    """
    transformed: list[dict[str, Any]] = []
    errors: list[str] = []
    occurrence_counter: dict[str, int] = defaultdict(int)

    for idx, item in enumerate(raw_items):
        try:
            ano = int(item["ano"])
            mes = int(item["mes"])
            if not (2000 <= ano <= 2100) or not (1 <= mes <= 12):
                raise ValueError(f"Período inválido ano={ano}, mes={mes}")

            tipo_despesa = clean_str(item.get("tipoDespesa"), max_len=200)
            if not tipo_despesa:
                raise ValueError("Campo obrigatório tipoDespesa ausente ou vazio.")

            valor_documento = to_decimal_money(item.get("valorDocumento"))
            valor_glosa = to_decimal_money(item.get("valorGlosa"))
            valor_liquido_raw = to_decimal_money(item.get("valorLiquido"))
            valor_liquido, sinal_normalizado = normalize_valor_liquido(valor_documento, valor_liquido_raw)

            data_raw = clean_str(item.get("dataDocumento"), max_len=40)
            data_doc = parse_date_safe(data_raw)

            cod_documento = clean_str(item.get("codDocumento"), max_len=80)
            num_documento = clean_str(item.get("numDocumento"), max_len=100)
            parcela = int(item.get("parcela") or 0)
            cod_lote = int(item["codLote"]) if item.get("codLote") is not None else None
            num_ressarcimento = clean_str(item.get("numRessarcimento"), max_len=80)
            nome_fornecedor = clean_str(item.get("nomeFornecedor"), max_len=255) or "Fornecedor não informado"
            cnpj_cpf = clean_str(item.get("cnpjCpfFornecedor"), max_len=32)
            tipo_documento = clean_str(item.get("tipoDocumento"), max_len=100)
            cod_tipo_doc = int(item["codTipoDocumento"]) if item.get("codTipoDocumento") is not None else None
            url_documento = clean_str(item.get("urlDocumento"), max_len=500)

            base_fingerprint = "|".join(
                [
                    str(deputado_id),
                    str(ano),
                    str(mes),
                    cod_documento or "",
                    num_documento or "",
                    str(parcela),
                    str(cod_lote or ""),
                    tipo_despesa,
                    cnpj_cpf or "",
                    nome_fornecedor,
                    data_raw or "",
                    f"{valor_documento:.2f}",
                    f"{valor_liquido_raw:.2f}",
                    f"{valor_glosa:.2f}",
                    num_ressarcimento or "",
                ]
            )
            occ_idx = occurrence_counter[base_fingerprint]
            occurrence_counter[base_fingerprint] += 1

            dedup_hash = hashlib.sha256(f"{base_fingerprint}#occ={occ_idx}".encode("utf-8")).hexdigest()

            transformed.append(
                {
                    "chave_deduplicacao": dedup_hash,
                    "deputado_id": deputado_id,
                    "uf_recorte": uf_recorte.upper(),
                    "ano": ano,
                    "mes": mes,
                    "tipo_despesa": tipo_despesa,
                    "cod_documento": cod_documento,
                    "tipo_documento": tipo_documento,
                    "cod_tipo_documento": cod_tipo_doc,
                    "data_documento": data_doc,
                    "data_documento_original": data_raw,
                    "num_documento": num_documento,
                    "parcela": parcela,
                    "cod_lote": cod_lote,
                    "num_ressarcimento": num_ressarcimento,
                    "nome_fornecedor": nome_fornecedor,
                    "cnpj_cpf_fornecedor": cnpj_cpf,
                    "valor_documento": valor_documento,
                    "valor_glosa": valor_glosa,
                    "valor_liquido_api_raw": valor_liquido_raw,
                    "valor_liquido": valor_liquido,
                    "sinal_normalizado": sinal_normalizado,
                    "url_documento": url_documento,
                    "fonte_url": fonte_url[:500],
                }
            )
        except Exception as exc:
            errors.append(f"Item #{idx} ignorado (dep={deputado_id}): {exc}")

    return transformed, errors
