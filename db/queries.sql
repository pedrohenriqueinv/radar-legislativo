-- ============================================================================
-- Radar Legislativo — Consultas Analíticas SQL (PostgreSQL)
-- ============================================================================

-- 1. Visão geral do recorte (UF + Ano) com contagem real de deputados, despesas e soma líquida
SELECT
    r.uf,
    r.ano,
    COUNT(DISTINCT r.deputado_id) AS qtd_deputados,
    COUNT(d.id) AS qtd_despesas,
    COALESCE(SUM(d.valor_liquido), 0.00) AS total_liquido,
    COUNT(DISTINCT d.tipo_despesa) AS qtd_categorias
FROM deputado_recortes r
LEFT JOIN despesas d
    ON d.deputado_id = r.deputado_id
   AND d.uf_recorte = r.uf
   AND d.ano = r.ano
WHERE r.uf = :uf
  AND r.ano = :ano
GROUP BY r.uf, r.ano;

-- 2. Distribuição de despesas por categoria (CEAP) no recorte
SELECT
    tipo_despesa,
    COUNT(*) AS qtd_lancamentos,
    COALESCE(SUM(valor_liquido), 0.00) AS total_liquido,
    ROUND(
        100.0 * COALESCE(SUM(valor_liquido), 0.00)
        / NULLIF(SUM(SUM(valor_liquido)) OVER (), 0),
        2
    ) AS percentual
FROM despesas
WHERE uf_recorte = :uf
  AND ano = :ano
GROUP BY tipo_despesa
ORDER BY total_liquido DESC;

-- 3. Evolução mensal (Jan–Dez) do recorte
SELECT
    mes,
    COUNT(*) AS qtd_lancamentos,
    COUNT(DISTINCT deputado_id) AS qtd_deputados_ativos,
    COALESCE(SUM(valor_liquido), 0.00) AS total_liquido
FROM despesas
WHERE uf_recorte = :uf
  AND ano = :ano
GROUP BY mes
ORDER BY mes ASC;

-- 4. Parlamentares incluídos no recorte histórico com totais no ano
SELECT
    dep.id,
    dep.nome_parlamentar,
    dep.url_foto,
    dep.link_oficial,
    r.uf,
    COALESCE(MAX(r.sigla_partido_recorte), dep.sigla_partido_atual) AS sigla_partido,
    STRING_AGG(DISTINCT r.id_legislatura::text, ', ' ORDER BY r.id_legislatura::text) AS legislaturas,
    COUNT(d.id) AS qtd_despesas,
    COALESCE(SUM(d.valor_liquido), 0.00) AS total_liquido
FROM deputado_recortes r
JOIN deputados dep ON dep.id = r.deputado_id
LEFT JOIN despesas d
    ON d.deputado_id = dep.id
   AND d.uf_recorte = r.uf
   AND d.ano = r.ano
WHERE r.uf = :uf
  AND r.ano = :ano
GROUP BY dep.id, dep.nome_parlamentar, dep.url_foto, dep.link_oficial, r.uf
ORDER BY total_liquido DESC, dep.nome_parlamentar ASC;

-- 5. Comparação entre UFs já carregadas para um ano
SELECT
    r.uf,
    COUNT(DISTINCT r.deputado_id) AS qtd_deputados,
    COUNT(d.id) AS qtd_despesas,
    COALESCE(SUM(d.valor_liquido), 0.00) AS total_liquido
FROM deputado_recortes r
LEFT JOIN despesas d
    ON d.deputado_id = r.deputado_id
   AND d.uf_recorte = r.uf
   AND d.ano = r.ano
WHERE r.ano = :ano
GROUP BY r.uf
ORDER BY total_liquido DESC;

-- 6. Última execução de coleta por UF e ano (auditoria e completude)
SELECT
    id,
    uf,
    ano,
    status,
    iniciado_em,
    finalizado_em,
    deputados_esperados,
    deputados_processados,
    deputados_com_erro,
    despesas_coletadas,
    despesas_inseridas,
    despesas_atualizadas,
    resumo_erros
FROM execucoes_coleta
WHERE uf = :uf
  AND ano = :ano
ORDER BY iniciado_em DESC
LIMIT 1;
