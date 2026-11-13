from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


JsonType = JSON().with_variant(JSONB(), "postgresql")
BigIntPK = BigInteger().with_variant(Integer(), "sqlite")


class Base(DeclarativeBase):
    pass


class Legislatura(Base):
    __tablename__ = "legislaturas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uri: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_fim: Mapped[date] = mapped_column(Date, nullable=False)
    coletado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Deputado(Base):
    __tablename__ = "deputados"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uri: Mapped[str] = mapped_column(String(255), nullable=False)
    nome_parlamentar: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    nome_civil: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sigla_uf_atual: Mapped[str | None] = mapped_column(String(2), nullable=True, index=True)
    sigla_partido_atual: Mapped[str | None] = mapped_column(String(40), nullable=True)
    id_legislatura_atual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    url_foto: Mapped[str | None] = mapped_column(String(500), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    link_oficial: Mapped[str] = mapped_column(String(500), nullable=False)
    situacao_atual: Mapped[str | None] = mapped_column(String(80), nullable=True)
    condicao_eleitoral: Mapped[str | None] = mapped_column(String(80), nullable=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    despesas: Mapped[list[Despesa]] = relationship(back_populates="deputado", cascade="all, delete-orphan")
    historico: Mapped[list[DeputadoMandatoHistorico]] = relationship(
        back_populates="deputado", cascade="all, delete-orphan"
    )


class DeputadoMandatoHistorico(Base):
    __tablename__ = "deputado_mandatos_historico"
    __table_args__ = (
        Index("idx_hist_dep_leg", "deputado_id", "id_legislatura"),
        Index("idx_hist_uf_leg", "sigla_uf", "id_legislatura"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    deputado_id: Mapped[int] = mapped_column(ForeignKey("deputados.id", ondelete="CASCADE"), nullable=False)
    id_legislatura: Mapped[int] = mapped_column(Integer, nullable=False)
    sigla_uf: Mapped[str] = mapped_column(String(2), nullable=False)
    sigla_partido: Mapped[str | None] = mapped_column(String(40), nullable=True)
    nome_na_epoca: Mapped[str | None] = mapped_column(String(200), nullable=True)
    situacao: Mapped[str | None] = mapped_column(String(80), nullable=True)
    condicao_eleitoral: Mapped[str | None] = mapped_column(String(80), nullable=True)
    descricao_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_hora_evento: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    chave_evento: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    deputado: Mapped[Deputado] = relationship(back_populates="historico")


class ExecucaoColeta(Base):
    __tablename__ = "execucoes_coleta"
    __table_args__ = (
        CheckConstraint(
            "status IN ('em_andamento', 'completa', 'parcial', 'falhou')",
            name="ck_execucao_status",
        ),
        CheckConstraint("ano BETWEEN 2000 AND 2100", name="ck_execucao_ano"),
        Index("idx_execucoes_uf_ano_inicio", "uf", "ano", "iniciado_em"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    uf: Mapped[str] = mapped_column(String(2), nullable=False)
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="em_andamento")
    iniciado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    finalizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    legislaturas_consultadas: Mapped[list[int]] = mapped_column(JsonType, default=list, nullable=False)
    deputados_esperados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deputados_processados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deputados_com_erro: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    despesas_coletadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    despesas_inseridas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    despesas_atualizadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    resumo_erros: Mapped[str | None] = mapped_column(Text, nullable=True)
    detalhes_log: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list, nullable=False)
    origem_api: Mapped[str] = mapped_column(
        String(255),
        default="https://dadosabertos.camara.leg.br/api/v2",
        nullable=False,
    )


class DeputadoRecorte(Base):
    __tablename__ = "deputado_recortes"
    __table_args__ = (
        CheckConstraint("ano BETWEEN 2000 AND 2100", name="ck_recorte_ano"),
        Index("idx_recortes_uf_ano", "uf", "ano"),
    )

    deputado_id: Mapped[int] = mapped_column(
        ForeignKey("deputados.id", ondelete="CASCADE"),
        primary_key=True,
    )
    uf: Mapped[str] = mapped_column(String(2), primary_key=True)
    ano: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_legislatura: Mapped[int] = mapped_column(Integer, primary_key=True)
    sigla_partido_recorte: Mapped[str | None] = mapped_column(String(40), nullable=True)
    despesas_coletadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    coletado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Despesa(Base):
    __tablename__ = "despesas"
    __table_args__ = (
        CheckConstraint("ano BETWEEN 2000 AND 2100", name="ck_despesa_ano"),
        CheckConstraint("mes BETWEEN 1 AND 12", name="ck_despesa_mes"),
        Index("idx_despesas_uf_ano", "uf_recorte", "ano"),
        Index("idx_despesas_dep_ano_mes", "deputado_id", "ano", "mes"),
        Index("idx_despesas_tipo", "tipo_despesa"),
        Index("idx_despesas_ano_mes", "ano", "mes"),
        Index("idx_despesas_data_doc", "data_documento"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    chave_deduplicacao: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    deputado_id: Mapped[int] = mapped_column(ForeignKey("deputados.id", ondelete="CASCADE"), nullable=False)
    uf_recorte: Mapped[str] = mapped_column(String(2), nullable=False)
    execucao_id: Mapped[int | None] = mapped_column(
        ForeignKey("execucoes_coleta.id", ondelete="SET NULL"),
        nullable=True,
    )
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    mes: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo_despesa: Mapped[str] = mapped_column(String(200), nullable=False)
    cod_documento: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tipo_documento: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cod_tipo_documento: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data_documento: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_documento_original: Mapped[str | None] = mapped_column(String(40), nullable=True)
    num_documento: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parcela: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cod_lote: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    num_ressarcimento: Mapped[str | None] = mapped_column(String(80), nullable=True)
    nome_fornecedor: Mapped[str] = mapped_column(String(255), nullable=False)
    cnpj_cpf_fornecedor: Mapped[str | None] = mapped_column(String(32), nullable=True)
    valor_documento: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    valor_glosa: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    valor_liquido_api_raw: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    valor_liquido: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    sinal_normalizado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    url_documento: Mapped[str | None] = mapped_column(String(500), nullable=True)
    fonte_url: Mapped[str] = mapped_column(String(500), nullable=False)
    coletado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    deputado: Mapped[Deputado] = relationship(back_populates="despesas")
