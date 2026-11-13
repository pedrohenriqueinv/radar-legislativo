-- ============================================================================
-- Radar Legislativo — Modelagem Relacional PostgreSQL 18
-- Fonte oficial: API v2 de Dados Abertos da Câmara dos Deputados
-- ============================================================================

CREATE TABLE IF NOT EXISTS legislaturas (
    id INTEGER PRIMARY KEY,
    uri VARCHAR(255),
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deputados (
    id INTEGER PRIMARY KEY,
    uri VARCHAR(255) NOT NULL,
    nome_parlamentar VARCHAR(200) NOT NULL,
    nome_civil VARCHAR(255),
    sigla_uf_atual CHAR(2),
    sigla_partido_atual VARCHAR(40),
    id_legislatura_atual INTEGER,
    url_foto VARCHAR(500),
    email VARCHAR(255),
    link_oficial VARCHAR(500) NOT NULL,
    situacao_atual VARCHAR(80),
    condicao_eleitoral VARCHAR(80),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deputados_nome ON deputados (nome_parlamentar);
CREATE INDEX IF NOT EXISTS idx_deputados_uf ON deputados (sigla_uf_atual);

CREATE TABLE IF NOT EXISTS deputado_mandatos_historico (
    id BIGSERIAL PRIMARY KEY,
    deputado_id INTEGER NOT NULL REFERENCES deputados(id) ON DELETE CASCADE,
    id_legislatura INTEGER NOT NULL,
    sigla_uf CHAR(2) NOT NULL,
    sigla_partido VARCHAR(40),
    nome_na_epoca VARCHAR(200),
    situacao VARCHAR(80),
    condicao_eleitoral VARCHAR(80),
    descricao_status TEXT,
    data_hora_evento TIMESTAMPTZ,
    chave_evento CHAR(64) NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_hist_dep_leg ON deputado_mandatos_historico (deputado_id, id_legislatura);
CREATE INDEX IF NOT EXISTS idx_hist_uf_leg ON deputado_mandatos_historico (sigla_uf, id_legislatura);

CREATE TABLE IF NOT EXISTS execucoes_coleta (
    id BIGSERIAL PRIMARY KEY,
    uf CHAR(2) NOT NULL,
    ano INTEGER NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
    status VARCHAR(30) NOT NULL CHECK (status IN ('em_andamento', 'completa', 'parcial', 'falhou')),
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalizado_em TIMESTAMPTZ,
    legislaturas_consultadas JSONB NOT NULL DEFAULT '[]'::jsonb,
    deputados_esperados INTEGER NOT NULL DEFAULT 0,
    deputados_processados INTEGER NOT NULL DEFAULT 0,
    deputados_com_erro INTEGER NOT NULL DEFAULT 0,
    despesas_coletadas INTEGER NOT NULL DEFAULT 0,
    despesas_inseridas INTEGER NOT NULL DEFAULT 0,
    despesas_atualizadas INTEGER NOT NULL DEFAULT 0,
    resumo_erros TEXT,
    detalhes_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    origem_api VARCHAR(255) NOT NULL DEFAULT 'https://dadosabertos.camara.leg.br/api/v2'
);

CREATE INDEX IF NOT EXISTS idx_execucoes_uf_ano_inicio ON execucoes_coleta (uf, ano, iniciado_em DESC);

CREATE TABLE IF NOT EXISTS deputado_recortes (
    deputado_id INTEGER NOT NULL REFERENCES deputados(id) ON DELETE CASCADE,
    uf CHAR(2) NOT NULL,
    ano INTEGER NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
    id_legislatura INTEGER NOT NULL,
    sigla_partido_recorte VARCHAR(40),
    despesas_coletadas INTEGER NOT NULL DEFAULT 0,
    coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (deputado_id, uf, ano, id_legislatura)
);

CREATE INDEX IF NOT EXISTS idx_recortes_uf_ano ON deputado_recortes (uf, ano);

CREATE TABLE IF NOT EXISTS despesas (
    id BIGSERIAL PRIMARY KEY,
    chave_deduplicacao CHAR(64) NOT NULL UNIQUE,
    deputado_id INTEGER NOT NULL REFERENCES deputados(id) ON DELETE CASCADE,
    uf_recorte CHAR(2) NOT NULL,
    execucao_id BIGINT REFERENCES execucoes_coleta(id) ON DELETE SET NULL,
    ano INTEGER NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
    mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    tipo_despesa VARCHAR(200) NOT NULL,
    cod_documento VARCHAR(80),
    tipo_documento VARCHAR(100),
    cod_tipo_documento INTEGER,
    data_documento DATE,
    data_documento_original VARCHAR(40),
    num_documento VARCHAR(100),
    parcela INTEGER NOT NULL DEFAULT 0,
    cod_lote BIGINT,
    num_ressarcimento VARCHAR(80),
    nome_fornecedor VARCHAR(255) NOT NULL,
    cnpj_cpf_fornecedor VARCHAR(32),
    valor_documento NUMERIC(14, 2) NOT NULL,
    valor_glosa NUMERIC(14, 2) NOT NULL DEFAULT 0,
    valor_liquido_api_raw NUMERIC(14, 2) NOT NULL,
    valor_liquido NUMERIC(14, 2) NOT NULL,
    sinal_normalizado BOOLEAN NOT NULL DEFAULT FALSE,
    url_documento VARCHAR(500),
    fonte_url VARCHAR(500) NOT NULL,
    coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_despesas_uf_ano ON despesas (uf_recorte, ano);
CREATE INDEX IF NOT EXISTS idx_despesas_dep_ano_mes ON despesas (deputado_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_despesas_tipo ON despesas (tipo_despesa);
CREATE INDEX IF NOT EXISTS idx_despesas_ano_mes ON despesas (ano, mes);
CREATE INDEX IF NOT EXISTS idx_despesas_data_doc ON despesas (data_documento);
