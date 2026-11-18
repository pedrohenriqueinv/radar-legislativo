"""Augment an existing Radar SQLite snapshot with an official CEAP ZIP.

Usage: python backend/import_ceap_archive.py SNAPSHOT ZIP DEPUTADOS_CSV --ano 2025
Run against a copy of the snapshot. Existing UF/year cuts are preserved.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sqlite3
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile

from app.etl.ceap_source import archive_url
from app.etl.transform import UFS_BRASIL, clean_str, parse_date_safe

EXPENSE_COLUMNS = (
    "chave_deduplicacao deputado_id uf_recorte execucao_id ano mes tipo_despesa "
    "cod_documento cod_tipo_documento data_documento data_documento_original num_documento "
    "parcela cod_lote num_ressarcimento nome_fornecedor cnpj_cpf_fornecedor valor_documento "
    "valor_glosa valor_liquido_api_raw valor_liquido sinal_normalizado url_documento fonte_url coletado_em"
).split()


def money(raw: str) -> Decimal:
    value = Decimal(raw)
    if not value.is_finite() or value != value.quantize(Decimal("0.01")):
        raise ValueError(f"Valor CEAP inválido: {raw!r}")
    return value


def read_deputados(path: Path) -> dict[int, dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        return {
            int(row["uri"].rsplit("/", 1)[-1]): row
            for row in csv.DictReader(file, delimiter=";")
        }


def load_archive(db: sqlite3.Connection, archive: Path, deputies_path: Path, year: int) -> dict:
    now = datetime.now(timezone.utc).isoformat(sep=" ", timespec="seconds").split("+")[0]
    source = archive_url(year)
    catalog = read_deputados(deputies_path)
    existing = {row[0] for row in db.execute(
        "SELECT uf FROM execucoes_coleta WHERE ano = ? "
        "UNION SELECT uf_recorte FROM despesas WHERE ano = ? "
        "UNION SELECT uf FROM deputado_recortes WHERE ano = ?", (year, year, year)
    )}
    legislatures = {row[0] for row in db.execute("SELECT id FROM legislaturas")}
    expenses = defaultdict(list)
    roster = {}
    published_ufs = set()
    expected = defaultdict(lambda: [0, 0, 0])
    occurrences = Counter()
    excluded = 0

    with ZipFile(archive) as zip_file, zip_file.open(f"Ano-{year}.csv") as data:
        rows = csv.DictReader(io.TextIOWrapper(data, encoding="utf-8-sig", newline=""), delimiter=";")
        for row in rows:
            uf = row["sgUF"].strip()
            if uf == "NA" and not row["ideCadastro"].strip():
                excluded += 1
                continue
            if uf not in UFS_BRASIL:
                raise ValueError(f"UF inesperada: {uf!r}")
            if int(row["numAno"]) != year:
                raise ValueError(f"Ano inesperado para {uf}: {row['numAno']}")
            published_ufs.add(uf)
            if uf in existing:
                continue
            dep = int(row["ideCadastro"])
            leg = int(row["codLegislatura"])
            month = int(row["numMes"])
            if dep not in catalog or leg not in legislatures or month not in range(1, 13):
                raise ValueError(f"Recorte inválido: {uf}/{year}, mês {month}, deputado {dep}, legislatura {leg}")
            category = clean_str(row["txtDescricao"])
            if not category:
                raise ValueError(f"Categoria ausente para deputado {dep}")
            party = clean_str(row["sgPartido"])
            roster_key = (uf, dep, leg)
            if roster.setdefault(roster_key, party) != party:
                raise ValueError(f"Filiação conflitante para o recorte {roster_key}")
            net = money(row["vlrLiquido"])
            glosa = money(row["vlrGlosa"] or "0")
            metrics = expected[uf, month]
            metrics[0] += 1
            metrics[1] += int(net * 100)
            metrics[2] += int(glosa * 100)

            issued_raw = clean_str(row["datEmissao"])
            issued = parse_date_safe(issued_raw)
            if issued_raw and issued is None:
                raise ValueError(f"Data de emissão inválida: {issued_raw}")
            document_url = clean_str(row["urlDocumento"])
            if document_url and not document_url.startswith(("https://", "http://")):
                raise ValueError(f"URL de documento inválida para deputado {dep}")
            payload = (
                year, month, category, clean_str(row["ideDocumento"]),
                int(row["indTipoDocumento"]) if row["indTipoDocumento"] else None,
                issued.isoformat() if issued else None, issued_raw, clean_str(row["txtNumero"]),
                int(row["numParcela"] or 0), int(row["numLote"]) if row["numLote"] else None,
                clean_str(row["numRessarcimento"]), clean_str(row["txtFornecedor"]) or "Fornecedor não informado",
                clean_str(row["txtCNPJCPF"]), str(money(row["vlrDocumento"])), str(glosa), str(net),
                str(net), 0, document_url, source, now,
            )
            identity = json.dumps((uf, dep, leg, *payload[:-1]), ensure_ascii=False, separators=(",", ":"))
            sequence = occurrences[identity]
            occurrences[identity] += 1
            key = hashlib.sha256(f"ceap-csv|{identity}#{sequence}".encode()).hexdigest()
            expenses[uf, dep, leg].append((key, dep, uf, *payload))

    if published_ufs != set(UFS_BRASIL):
        raise ValueError(f"Cobertura incompleta no arquivo: {sorted(set(UFS_BRASIL) - published_ufs)}")
    by_uf = defaultdict(list)
    for key in sorted(roster):
        by_uf[key[0]].append(key)
    if set(by_uf) != published_ufs - existing:
        raise ValueError("Há recortes novos sem despesas validadas.")
    source_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
    insert_expense = f"INSERT INTO despesas ({','.join(EXPENSE_COLUMNS)}) VALUES ({','.join('?' for _ in EXPENSE_COLUMNS)})"

    for uf, keys in sorted(by_uf.items()):
        count = sum(len(expenses[key]) for key in keys)
        dep_count = len({key[1] for key in keys})
        execution = db.execute(
            "INSERT INTO execucoes_coleta (uf, ano, status, iniciado_em, finalizado_em, "
            "legislaturas_consultadas, deputados_esperados, deputados_processados, deputados_com_erro, "
            "despesas_coletadas, despesas_inseridas, despesas_atualizadas, detalhes_log, origem_api) "
            "VALUES (?, ?, 'completa', ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)",
            (uf, year, now, now, json.dumps(sorted({key[2] for key in keys})), dep_count, dep_count,
             count, count, json.dumps([{"etapa": "ceap_csv", "sha256": source_hash}]), source),
        ).lastrowid
        for key in keys:
            _, dep, leg = key
            person = catalog[dep]
            db.execute(
                "INSERT INTO deputados (id, uri, nome_parlamentar, nome_civil, link_oficial, atualizado_em) "
                "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
                (dep, person["uri"], person["nome"], person["nomeCivil"] or None,
                 f"https://www.camara.leg.br/deputados/{dep}", now),
            )
            db.execute(
                "INSERT INTO deputado_recortes (deputado_id, uf, ano, id_legislatura, sigla_partido_recorte, "
                "despesas_coletadas, coletado_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (dep, uf, year, leg, roster[key], len(expenses[key]), now),
            )
            db.executemany(insert_expense, (row[:3] + (execution,) + row[3:] for row in expenses[key]))

    actual = {
        (uf, month): [count, net, glosa]
        for uf, month, count, net, glosa in db.execute(
            "SELECT d.uf_recorte, d.mes, COUNT(*), SUM(CAST(ROUND(d.valor_liquido * 100) AS INTEGER)), "
            "SUM(CAST(ROUND(d.valor_glosa * 100) AS INTEGER)) "
            "FROM despesas d JOIN execucoes_coleta e ON e.id = d.execucao_id "
            "WHERE d.ano = ? AND e.origem_api = ? GROUP BY d.uf_recorte, d.mes", (year, source)
        )
        if uf in by_uf
    }
    if actual != dict(expected) or db.execute("PRAGMA foreign_key_check").fetchone():
        raise ValueError("As contagens, somas em centavos ou vínculos da carga SQL não conferem.")
    return {
        "sha256": source_hash, "novas_ufs": sorted(by_uf), "preservadas": sorted(existing),
        "registros": sum(group[0] for group in expected.values()), "linhas_sem_uf_de_liderancas": excluded,
        "totais": {uf: sum(v[1] for (state, _), v in expected.items() if state == uf) for uf in by_uf},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("zip", type=Path)
    parser.add_argument("deputados", type=Path)
    parser.add_argument("--ano", type=int, required=True)
    args = parser.parse_args()
    with closing(sqlite3.connect(args.snapshot.resolve().as_uri() + "?mode=rw", uri=True)) as db:
        db.execute("PRAGMA foreign_keys = ON")
        with db:
            db.execute("BEGIN IMMEDIATE")
            result = load_archive(db, args.zip, args.deputados, args.ano)
        if db.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise SystemExit("O snapshot não passou na verificação de integridade.")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
