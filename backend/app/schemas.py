from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database_connected: bool
    storage_backend: str
    storage_label: str
    database_error: str | None = None
    has_any_data: bool = False
    camara_api_base_url: str


class UfLoadedSummary(BaseModel):
    uf: str
    nome: str
    regiao: str
    anos_disponiveis: list[int] = Field(default_factory=list)
    total_deputados_carregados: int = 0
    total_despesas_carregadas: int = 0
    total_liquido: float = 0.0
    ultima_atualizacao: datetime | None = None
    ultimo_status: str | None = None


class MetaResponse(BaseModel):
    ufs: list[UfLoadedSummary]
    anos_suportados: list[int]
    recortes_carregados: list[dict]
    recorte_padrao_uf: str
    recorte_padrao_ano: int
    storage_backend: str
    storage_label: str
    stale_threshold_days: int


class ExecucaoOut(BaseModel):
    id: int
    uf: str
    ano: int
    status: str
    iniciado_em: datetime
    finalizado_em: datetime | None
    legislaturas_consultadas: list[int]
    deputados_esperados: int
    deputados_processados: int
    deputados_com_erro: int
    despesas_coletadas: int
    despesas_inseridas: int
    despesas_atualizadas: int
    resumo_erros: str | None
    origem_api: str


class CategoriaResumo(BaseModel):
    categoria: str
    qtd_lancamentos: int
    total_liquido: float
    percentual: float


class MensalResumo(BaseModel):
    mes: int
    mes_nome: str
    qtd_lancamentos: int
    qtd_deputados_ativos: int
    total_liquido: float


class OverviewResponse(BaseModel):
    uf: str
    uf_nome: str
    uf_regiao: str
    ano: int
    has_data: bool
    situacao_coleta: str  # nao_coletado | em_andamento | completa | parcial | falhou
    ultima_atualizacao: datetime | None
    is_stale: bool
    dias_desde_atualizacao: int | None
    legislaturas: list[int]
    qtd_deputados: int
    qtd_deputados_com_despesas: int
    qtd_despesas: int
    total_liquido: float
    total_glosas: float
    qtd_categorias: int
    categorias_disponiveis: list[str]
    categorias_resumo: list[CategoriaResumo]
    serie_mensal: list[MensalResumo]
    ultima_execucao: ExecucaoOut | None
    fonte_oficial_url: str
    nota_integridade: str


class DeputadoCardOut(BaseModel):
    id: int
    nome_parlamentar: str
    nome_civil: str | None
    uf: str
    partido: str | None
    url_foto: str | None
    link_oficial: str
    situacao_atual: str | None
    legislaturas_no_recorte: list[int]
    qtd_despesas: int
    total_liquido: float
    percentual_no_recorte: float


class MandatoHistoricoOut(BaseModel):
    id_legislatura: int
    sigla_uf: str
    sigla_partido: str | None
    nome_na_epoca: str | None
    situacao: str | None
    condicao_eleitoral: str | None
    descricao_status: str | None
    data_hora_evento: datetime | None


class FornecedorResumo(BaseModel):
    nome_fornecedor: str
    cnpj_cpf_fornecedor: str | None
    qtd_lancamentos: int
    total_liquido: float


class DeputadoDetailResponse(BaseModel):
    id: int
    nome_parlamentar: str
    nome_civil: str | None
    uf_atual: str | None
    partido_atual: str | None
    url_foto: str | None
    email: str | None
    link_oficial: str
    situacao_atual: str | None
    condicao_eleitoral: str | None
    ano_referencia: int
    uf_referencia: str | None
    qtd_despesas: int
    total_liquido: float
    total_glosas: float
    categorias: list[CategoriaResumo]
    serie_mensal: list[MensalResumo]
    principais_fornecedores: list[FornecedorResumo]
    historico_mandatos: list[MandatoHistoricoOut]
    fonte_oficial_url: str


class DespesaOut(BaseModel):
    id: int
    deputado_id: int
    deputado_nome: str
    deputado_partido: str | None
    uf: str
    ano: int
    mes: int
    tipo_despesa: str
    data_documento: date | None
    data_documento_original: str | None
    nome_fornecedor: str
    cnpj_cpf_fornecedor: str | None
    valor_documento: float
    valor_glosa: float
    valor_liquido: float
    valor_liquido_api_raw: float
    sinal_normalizado: bool
    tipo_documento: str | None
    num_documento: str | None
    cod_documento: str | None
    url_documento: str | None
    fonte_url: str


class DespesasPageResponse(BaseModel):
    items: list[DespesaOut]
    total: int
    page: int
    page_size: int
    total_pages: int
    soma_filtrada: float
    slice_has_data: bool


class DeputadoComparacaoOut(BaseModel):
    deputado_id: int
    nome_parlamentar: str
    partido: str | None
    uf: str
    qtd_despesas: int
    total_liquido: float
    media_por_lancamento: float


class UfComparacaoOut(BaseModel):
    uf: str
    uf_nome: str
    qtd_deputados: int
    qtd_despesas: int
    total_liquido: float
    media_por_deputado: float
    status_coleta: str | None


class AnalyticsResponse(BaseModel):
    uf: str
    ano: int
    has_data: bool
    total_liquido: float
    por_categoria: list[CategoriaResumo]
    evolucao_mensal: list[MensalResumo]
    comparacao_parlamentares: list[DeputadoComparacaoOut]
    distribuicao_ufs: list[UfComparacaoOut]
    aviso_metodologico: str


class ColetaRequest(BaseModel):
    uf: str = Field(..., min_length=2, max_length=2)
    ano: int = Field(..., ge=2008, le=2100)
    max_deputados: int | None = Field(default=None, ge=1, le=600)


class ColetaAcceptedResponse(BaseModel):
    message: str
    uf: str
    ano: int
    already_running: bool = False
    execucao: ExecucaoOut | None = None
