const BRL_FULL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BRL_WHOLE = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const INT_FORMAT = new Intl.NumberFormat('pt-BR');
const PCT_FORMAT = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatBRL(value: number | null | undefined, whole = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return whole ? BRL_WHOLE.format(value) : BRL_FULL.format(value);
}

export function formatBRLCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}R$ ${(abs / 1_000_000).toFixed(2).replace('.', ',')} mi`;
  }
  if (abs >= 1_000) {
    return `${sign}R$ ${(abs / 1_000).toFixed(1).replace('.', ',')} mil`;
  }
  return BRL_FULL.format(value);
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0';
  }
  return INT_FORMAT.format(Math.round(value));
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0,0%';
  }
  return `${PCT_FORMAT.format(value)}%`;
}

export function formatDateBR(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return 'Data não informada';
  }
  const normalized = isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function formatDateTimeBR(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) {
    return 'Ainda não coletado';
  }
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return isoDateTime;
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatDocumentTaxId(raw: string | null | undefined): string {
  if (!raw) return 'Sem CNPJ/CPF';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  return raw;
}

export function getStatusMeta(status: string): {
  label: string;
  tone: 'ok' | 'warn' | 'error' | 'idle' | 'active';
  description: string;
} {
  switch (status) {
    case 'completa':
      return {
        label: 'Coleta completa',
        tone: 'ok',
        description: 'Todos os parlamentares esperados do recorte foram processados.',
      };
    case 'parcial':
      return {
        label: 'Coleta parcial',
        tone: 'warn',
        description: 'Parte dos deputados apresentou falha; os registros válidos foram preservados.',
      };
    case 'em_andamento':
      return {
        label: 'Coleta em andamento',
        tone: 'active',
        description: 'A API oficial da Câmara está sendo consultada neste momento.',
      };
    case 'falhou':
      return {
        label: 'Falha na última execução',
        tone: 'error',
        description: 'A tentativa mais recente falhou. Dados anteriores válidos permanecem visíveis.',
      };
    default:
      return {
        label: 'Não coletado',
        tone: 'idle',
        description: 'Ainda não há coleta persistida para este estado e ano.',
      };
  }
}

export function getMonthLabel(mes: number): string {
  const names = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return names[mes - 1] ?? `Mês ${mes}`;
}

export function shortenCategory(category: string): string {
  const normalized = category.trim().replace(/\.\s*$/, '');
  const mapped: Record<string, string> = {
    'MANUTENÇÃO DE ESCRITÓRIO DE APOIO À ATIVIDADE PARLAMENTAR': 'Manutenção de escritório',
    'DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR': 'Divulgação parlamentar',
    'PASSAGEM AÉREA - SIGEPA': 'Passagens aéreas (SIGEPA)',
    'PASSAGEM AÉREA - RPA': 'Passagens aéreas (RPA)',
    'PASSAGEM AÉREA - REEMBOLSO': 'Passagens aéreas (reembolso)',
    'LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES': 'Locação de veículos',
    'LOCAÇÃO OU FRETAMENTO DE AERONAVES': 'Fretamento de aeronaves',
    'LOCAÇÃO OU FRETAMENTO DE EMBARCAÇÕES': 'Fretamento de embarcações',
    'COMBUSTÍVEIS E LUBRIFICANTES': 'Combustíveis e lubrificantes',
    'CONSULTORIAS, PESQUISAS E TRABALHOS TÉCNICOS': 'Consultorias e trabalhos técnicos',
    'HOSPEDAGEM ,EXCETO DO PARLAMENTAR NO DISTRITO FEDERAL': 'Hospedagem (fora do DF)',
    'HOSPEDAGEM, EXCETO DO PARLAMENTAR NO DISTRITO FEDERAL': 'Hospedagem (fora do DF)',
    'FORNECIMENTO DE ALIMENTAÇÃO DO PARLAMENTAR': 'Alimentação do parlamentar',
    'SERVIÇO DE TÁXI, PEDÁGIO E ESTACIONAMENTO': 'Táxi, pedágio e estacionamento',
    'SERVIÇO DE SEGURANÇA PRESTADO POR EMPRESA ESPECIALIZADA': 'Segurança especializada',
    'PASSAGENS TERRESTRES, MARÍTIMAS OU FLUVIAIS': 'Passagens terrestres/fluviais',
    'ASSINATURA DE PUBLICAÇÕES': 'Assinatura de publicações',
    TELEFONIA: 'Telefonia',
    'SERVIÇOS POSTAIS': 'Serviços postais',
    'PARTICIPAÇÃO EM CURSO, PALESTRA OU EVENTO SIMILAR': 'Cursos e eventos',
  };
  if (mapped[normalized]) {
    return mapped[normalized];
  }
  const clean = normalized.replace(/\s*,\s*/g, ', ');
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

export interface BrazilTile {
  uf: string;
  nome: string;
  regiao: string;
  col: number;
  row: number;
}

// Cartograma geométrico 7 colunas x 7 linhas preservando adjacências geográficas do Brasil
export const BRAZIL_TILE_GRID: BrazilTile[] = [
  { uf: 'RR', nome: 'Roraima', regiao: 'Norte', col: 2, row: 1 },
  { uf: 'AP', nome: 'Amapá', regiao: 'Norte', col: 4, row: 1 },

  { uf: 'AM', nome: 'Amazonas', regiao: 'Norte', col: 1, row: 2 },
  { uf: 'PA', nome: 'Pará', regiao: 'Norte', col: 3, row: 2 },
  { uf: 'MA', nome: 'Maranhão', regiao: 'Nordeste', col: 5, row: 2 },
  { uf: 'CE', nome: 'Ceará', regiao: 'Nordeste', col: 6, row: 2 },
  { uf: 'RN', nome: 'Rio Grande do Norte', regiao: 'Nordeste', col: 7, row: 2 },

  { uf: 'AC', nome: 'Acre', regiao: 'Norte', col: 1, row: 3 },
  { uf: 'RO', nome: 'Rondônia', regiao: 'Norte', col: 2, row: 3 },
  { uf: 'TO', nome: 'Tocantins', regiao: 'Norte', col: 4, row: 3 },
  { uf: 'PI', nome: 'Piauí', regiao: 'Nordeste', col: 5, row: 3 },
  { uf: 'PB', nome: 'Paraíba', regiao: 'Nordeste', col: 6, row: 3 },
  { uf: 'PE', nome: 'Pernambuco', regiao: 'Nordeste', col: 7, row: 3 },

  { uf: 'MT', nome: 'Mato Grosso', regiao: 'Centro-Oeste', col: 2, row: 4 },
  { uf: 'GO', nome: 'Goiás', regiao: 'Centro-Oeste', col: 3, row: 4 },
  { uf: 'DF', nome: 'Distrito Federal', regiao: 'Centro-Oeste', col: 4, row: 4 },
  { uf: 'BA', nome: 'Bahia', regiao: 'Nordeste', col: 5, row: 4 },
  { uf: 'AL', nome: 'Alagoas', regiao: 'Nordeste', col: 6, row: 4 },
  { uf: 'SE', nome: 'Sergipe', regiao: 'Nordeste', col: 7, row: 4 },

  { uf: 'MS', nome: 'Mato Grosso do Sul', regiao: 'Centro-Oeste', col: 2, row: 5 },
  { uf: 'MG', nome: 'Minas Gerais', regiao: 'Sudeste', col: 4, row: 5 },
  { uf: 'ES', nome: 'Espírito Santo', regiao: 'Sudeste', col: 5, row: 5 },

  { uf: 'PR', nome: 'Paraná', regiao: 'Sul', col: 3, row: 6 },
  { uf: 'SP', nome: 'São Paulo', regiao: 'Sudeste', col: 4, row: 6 },
  { uf: 'RJ', nome: 'Rio de Janeiro', regiao: 'Sudeste', col: 5, row: 6 },

  { uf: 'SC', nome: 'Santa Catarina', regiao: 'Sul', col: 3, row: 7 },
  { uf: 'RS', nome: 'Rio Grande do Sul', regiao: 'Sul', col: 2, row: 7 },
];
