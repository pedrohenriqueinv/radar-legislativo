export interface HealthResponse {
  status: 'ok' | 'degraded';
  database_connected: boolean;
  storage_backend: string;
  storage_label: string;
  database_error: string | null;
  has_any_data: boolean;
  camara_api_base_url: string;
}

export interface UfLoadedSummary {
  uf: string;
  nome: string;
  regiao: string;
  anos_disponiveis: number[];
  total_deputados_carregados: number;
  total_despesas_carregadas: number;
  total_liquido: number;
  ultima_atualizacao: string | null;
  ultimo_status: string | null;
}

export interface RecorteCarregado {
  uf: string;
  ano: number;
  qtd_deputados: number;
  qtd_despesas: number;
  total_liquido: number;
  status: string;
  ultima_atualizacao: string | null;
}

export interface MetaResponse {
  ufs: UfLoadedSummary[];
  anos_suportados: number[];
  recortes_carregados: RecorteCarregado[];
  recorte_padrao_uf: string;
  recorte_padrao_ano: number;
  storage_backend: string;
  storage_label: string;
  stale_threshold_days: number;
}

export interface ExecucaoOut {
  id: number;
  uf: string;
  ano: number;
  status: 'em_andamento' | 'completa' | 'parcial' | 'falhou' | string;
  iniciado_em: string;
  finalizado_em: string | null;
  legislaturas_consultadas: number[];
  deputados_esperados: number;
  deputados_processados: number;
  deputados_com_erro: number;
  despesas_coletadas: number;
  despesas_inseridas: number;
  despesas_atualizadas: number;
  resumo_erros: string | null;
  origem_api: string;
}

export interface CategoriaResumo {
  categoria: string;
  qtd_lancamentos: number;
  total_liquido: number;
  percentual: number;
}

export interface MensalResumo {
  mes: number;
  mes_nome: string;
  qtd_lancamentos: number;
  qtd_deputados_ativos: number;
  total_liquido: number;
}

export type SituacaoColeta = 'nao_coletado' | 'em_andamento' | 'completa' | 'parcial' | 'falhou';

export interface OverviewResponse {
  uf: string;
  uf_nome: string;
  uf_regiao: string;
  ano: number;
  has_data: boolean;
  situacao_coleta: SituacaoColeta;
  ultima_atualizacao: string | null;
  is_stale: boolean;
  dias_desde_atualizacao: number | null;
  legislaturas: number[];
  qtd_deputados: number;
  qtd_deputados_com_despesas: number;
  qtd_despesas: number;
  total_liquido: number;
  total_glosas: number;
  qtd_categorias: number;
  categorias_disponiveis: string[];
  categorias_resumo: CategoriaResumo[];
  serie_mensal: MensalResumo[];
  ultima_execucao: ExecucaoOut | null;
  fonte_oficial_url: string;
  nota_integridade: string;
}

export interface DeputadoCardOut {
  id: number;
  nome_parlamentar: string;
  nome_civil: string | null;
  uf: string;
  partido: string | null;
  url_foto: string | null;
  link_oficial: string;
  situacao_atual: string | null;
  legislaturas_no_recorte: number[];
  qtd_despesas: number;
  total_liquido: number;
  percentual_no_recorte: number;
}

export interface MandatoHistoricoOut {
  id_legislatura: number;
  sigla_uf: string;
  sigla_partido: string | null;
  nome_na_epoca: string | null;
  situacao: string | null;
  condicao_eleitoral: string | null;
  descricao_status: string | null;
  data_hora_evento: string | null;
}

export interface FornecedorResumo {
  nome_fornecedor: string;
  cnpj_cpf_fornecedor: string | null;
  qtd_lancamentos: number;
  total_liquido: number;
}

export interface DeputadoDetailResponse {
  id: number;
  nome_parlamentar: string;
  nome_civil: string | null;
  uf_atual: string | null;
  partido_atual: string | null;
  url_foto: string | null;
  email: string | null;
  link_oficial: string;
  situacao_atual: string | null;
  condicao_eleitoral: string | null;
  ano_referencia: number;
  uf_referencia: string | null;
  qtd_despesas: number;
  total_liquido: number;
  total_glosas: number;
  categorias: CategoriaResumo[];
  serie_mensal: MensalResumo[];
  principais_fornecedores: FornecedorResumo[];
  historico_mandatos: MandatoHistoricoOut[];
  fonte_oficial_url: string;
}

export interface DespesaOut {
  id: number;
  deputado_id: number;
  deputado_nome: string;
  deputado_partido: string | null;
  uf: string;
  ano: number;
  mes: number;
  tipo_despesa: string;
  data_documento: string | null;
  data_documento_original: string | null;
  nome_fornecedor: string;
  cnpj_cpf_fornecedor: string | null;
  valor_documento: number;
  valor_glosa: number;
  valor_liquido: number;
  valor_liquido_api_raw: number;
  sinal_normalizado: boolean;
  tipo_documento: string | null;
  num_documento: string | null;
  cod_documento: string | null;
  url_documento: string | null;
  fonte_url: string;
}

export interface DespesasPageResponse {
  items: DespesaOut[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  soma_filtrada: number;
  slice_has_data: boolean;
}

export interface DeputadoComparacaoOut {
  deputado_id: number;
  nome_parlamentar: string;
  partido: string | null;
  uf: string;
  qtd_despesas: number;
  total_liquido: number;
  media_por_lancamento: number;
}

export interface UfComparacaoOut {
  uf: string;
  uf_nome: string;
  qtd_deputados: number;
  qtd_despesas: number;
  total_liquido: number;
  media_por_deputado: number;
  status_coleta: string | null;
}

export interface AnalyticsResponse {
  uf: string;
  ano: number;
  has_data: boolean;
  total_liquido: number;
  por_categoria: CategoriaResumo[];
  evolucao_mensal: MensalResumo[];
  comparacao_parlamentares: DeputadoComparacaoOut[];
  distribuicao_ufs: UfComparacaoOut[];
  aviso_metodologico: string;
}

export interface ColetaRequest {
  uf: string;
  ano: number;
  max_deputados?: number | null;
}

export interface ColetaAcceptedResponse {
  message: string;
  uf: string;
  ano: number;
  already_running: boolean;
  execucao: ExecucaoOut | null;
}
