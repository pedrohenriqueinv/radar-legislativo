import type {
  AnalyticsResponse,
  ColetaAcceptedResponse,
  ColetaRequest,
  DeputadoCardOut,
  DeputadoDetailResponse,
  DespesasPageResponse,
  ExecucaoOut,
  HealthResponse,
  MetaResponse,
  OverviewResponse,
} from '../types/api';

const API_BASE = ((import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ?? '')
  .trim()
  .replace(/\/$/, '');

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export class ApiError extends Error {
  status: number;
  code: string;
  detailText: string | null;

  constructor(message: string, status: number, code = 'api_error', detailText: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detailText = detailText;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiError(
      'Não foi possível conectar ao servidor do Radar Legislativo. Verifique se o backend FastAPI está em execução na porta 8000.',
      0,
      'network_error',
      err instanceof Error ? err.message : String(err)
    );
  }

  if (!response.ok) {
    let code = `http_${response.status}`;
    let message = `Erro HTTP ${response.status} ao consultar ${url}`;
    let detailText: string | null = null;

    try {
      const payload = await response.json();
      const detail = payload?.detail;
      if (detail && typeof detail === 'object') {
        code = String(detail.code ?? code);
        message = String(detail.message ?? message);
        detailText = detail.detail ? String(detail.detail) : null;
      } else if (typeof detail === 'string') {
        message = detail;
      }
    } catch {
      // keep fallback HTTP error text
    }

    throw new ApiError(message, response.status, code, detailText);
  }

  return (await response.json()) as T;
}

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value));
    }
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : '';
}

export const radarApi = {
  getHealth: () => requestJson<HealthResponse>(apiUrl('/api/health')),

  getMeta: () => requestJson<MetaResponse>(apiUrl('/api/meta')),

  getOverview: (uf: string, ano: number) =>
    requestJson<OverviewResponse>(apiUrl(`/api/overview${buildQuery({ uf, ano })}`)),

  getDeputados: (params: {
    uf: string;
    ano: number;
    busca?: string;
    partido?: string;
    ordenar_por?: 'total_desc' | 'nome_asc' | 'qtd_desc';
  }) => requestJson<DeputadoCardOut[]>(apiUrl(`/api/deputados${buildQuery(params)}`)),

  getDeputadoDetail: (id: number, params: { ano: number; uf?: string }) =>
    requestJson<DeputadoDetailResponse>(apiUrl(`/api/deputados/${id}${buildQuery(params)}`)),

  getDespesas: (params: {
    uf?: string;
    ano?: number;
    deputado_id?: number | null;
    categoria?: string;
    mes?: number | null;
    busca?: string;
    ordenar_por?: 'data_desc' | 'valor_desc' | 'valor_asc';
    page?: number;
    page_size?: number;
  }) => requestJson<DespesasPageResponse>(apiUrl(`/api/despesas${buildQuery(params)}`)),

  getDespesasCsvUrl: (params: {
    uf?: string;
    ano?: number;
    deputado_id?: number | null;
    categoria?: string;
    mes?: number | null;
    busca?: string;
  }) => apiUrl(`/api/despesas/export.csv${buildQuery(params)}`),

  getAnalytics: (uf: string, ano: number) =>
    requestJson<AnalyticsResponse>(apiUrl(`/api/analytics${buildQuery({ uf, ano })}`)),

  getExecucoes: (limit = 20) =>
    requestJson<ExecucaoOut[]>(apiUrl(`/api/execucoes${buildQuery({ limit })}`)),

  triggerColeta: (body: ColetaRequest) =>
    requestJson<ColetaAcceptedResponse>(apiUrl('/api/coletas'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
