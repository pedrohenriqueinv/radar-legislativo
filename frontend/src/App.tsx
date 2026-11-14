import { useCallback, useEffect, useState } from 'react';
import { AboutDataSection } from './components/AboutDataSection';
import { AnalyticsSection } from './components/AnalyticsSection';
import { CollectionDrawer } from './components/CollectionDrawer';
import { DeputiesSection } from './components/DeputiesSection';
import { DeputyDetailView } from './components/DeputyDetailView';
import { ExpensesSection } from './components/ExpensesSection';
import { HeaderNav } from './components/HeaderNav';
import { HeroSection } from './components/HeroSection';
import { SwipeToast, type ToastItem } from './components/motion/SwipeToast';
import { OverviewSection } from './components/OverviewSection';
import { StateExplorerSection } from './components/StateExplorerSection';
import { ApiError, radarApi } from './services/api';
import type {
  AnalyticsResponse,
  DeputadoCardOut,
  ExecucaoOut,
  HealthResponse,
  MetaResponse,
  OverviewResponse,
} from './types/api';

function readInitialQuery() {
  if (typeof window === 'undefined') {
    return { uf: '', ano: 0, deputado: null as number | null };
  }
  const params = new URLSearchParams(window.location.search);
  const uf = (params.get('uf') ?? '').toUpperCase().slice(0, 2);
  const anoRaw = Number(params.get('ano') ?? '0');
  const depRaw = Number(params.get('deputado') ?? '0');
  return {
    uf,
    ano: Number.isFinite(anoRaw) && anoRaw >= 2008 ? anoRaw : 0,
    deputado: Number.isFinite(depRaw) && depRaw > 0 ? depRaw : null,
  };
}

export function App() {
  const initial = readInitialQuery();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [selectedUf, setSelectedUf] = useState<string>(initial.uf || 'DF');
  const [selectedAno, setSelectedAno] = useState<number>(initial.ano || 2024);
  const [selectedDeputadoId, setSelectedDeputadoId] = useState<number | null>(initial.deputado);
  const [initializedFromMeta, setInitializedFromMeta] = useState<boolean>(
    Boolean(initial.uf && initial.ano)
  );

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [deputados, setDeputados] = useState<DeputadoCardOut[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [execucoes, setExecucoes] = useState<ExecucaoOut[]>([]);

  const [loadingSlice, setLoadingSlice] = useState<boolean>(true);
  const [dbError, setDbError] = useState<{ message: string; detail: string | null } | null>(null);
  const [collectionOpen, setCollectionOpen] = useState<boolean>(false);
  const [submittingCollection, setSubmittingCollection] = useState<boolean>(false);
  const [activeColeta, setActiveColeta] = useState<{ uf: string; ano: number } | null>(null);
  const [refreshToken, setRefreshToken] = useState<number>(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 6500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Sync URL query params for direct sharing and reload persistence
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    params.set('uf', selectedUf);
    params.set('ano', String(selectedAno));
    if (selectedDeputadoId) {
      params.set('deputado', String(selectedDeputadoId));
    }
    window.history.replaceState({}, '', `?${params.toString()}`);
  }, [selectedUf, selectedAno, selectedDeputadoId]);

  const loadBootstrap = useCallback(async () => {
    try {
      const [h, m] = await Promise.all([radarApi.getHealth(), radarApi.getMeta()]);
      setHealth(h);
      setMeta(m);
      setDbError(null);
      if (!initializedFromMeta) {
        setSelectedUf(m.recorte_padrao_uf);
        setSelectedAno(m.recorte_padrao_ano);
        setInitializedFromMeta(true);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setDbError({ message: err.message, detail: err.detailText });
      } else {
        setDbError({
          message: 'Erro ao consultar o estado inicial da API.',
          detail: String(err),
        });
      }
    }
  }, [initializedFromMeta]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap, refreshToken]);

  const loadSliceData = useCallback(async () => {
    setLoadingSlice(true);
    try {
      const [ov, deps, an, ex] = await Promise.all([
        radarApi.getOverview(selectedUf, selectedAno),
        radarApi.getDeputados({ uf: selectedUf, ano: selectedAno }),
        radarApi.getAnalytics(selectedUf, selectedAno),
        radarApi.getExecucoes(20),
      ]);
      setOverview(ov);
      setDeputados(deps);
      setAnalytics(an);
      setExecucoes(ex);
      setDbError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setDbError({ message: err.message, detail: err.detailText });
      } else {
        setDbError({
          message: 'Falha inesperada ao carregar os dados do recorte.',
          detail: String(err),
        });
      }
    } finally {
      setLoadingSlice(false);
    }
  }, [selectedUf, selectedAno]);

  useEffect(() => {
    loadSliceData();
  }, [loadSliceData, refreshToken]);

  // Poll collection lifecycle while any collection is running for the active cut
  useEffect(() => {
    const pollingTarget =
      activeColeta ??
      (overview?.situacao_coleta === 'em_andamento'
        ? { uf: overview.uf, ano: overview.ano }
        : null);

    if (!pollingTarget) return;

    const timer = window.setInterval(async () => {
      try {
        const [ov, exList, m] = await Promise.all([
          radarApi.getOverview(pollingTarget.uf, pollingTarget.ano),
          radarApi.getExecucoes(20),
          radarApi.getMeta(),
        ]);
        setMeta(m);
        setExecucoes(exList);
        if (pollingTarget.uf === selectedUf && pollingTarget.ano === selectedAno) {
          setOverview(ov);
        }

        if (ov.situacao_coleta !== 'em_andamento') {
          setActiveColeta(null);
          setRefreshToken((t) => t + 1);
          if (ov.situacao_coleta === 'completa') {
            pushToast({
              tone: 'ok',
              title: `Coleta de ${pollingTarget.uf}/${pollingTarget.ano} concluída`,
              description: `${ov.qtd_deputados} parlamentares e ${ov.qtd_despesas} despesas disponíveis.`,
            });
          } else if (ov.situacao_coleta === 'parcial') {
            pushToast({
              tone: 'warn',
              title: `Coleta parcial em ${pollingTarget.uf}/${pollingTarget.ano}`,
              description: ov.nota_integridade,
            });
          } else if (ov.situacao_coleta === 'falhou') {
            pushToast({
              tone: 'error',
              title: `Coleta de ${pollingTarget.uf}/${pollingTarget.ano} falhou`,
              description: ov.nota_integridade,
            });
          }
        }
      } catch {
        // tolerate transient poll jitter
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [activeColeta, overview, selectedUf, selectedAno, pushToast]);

  const handleTriggerCollection = async (
    uf: string,
    ano: number,
    maxDeputados: number | null
  ) => {
    setSubmittingCollection(true);
    try {
      const res = await radarApi.triggerColeta({
        uf,
        ano,
        max_deputados: maxDeputados,
      });
      setCollectionOpen(false);
      setSelectedDeputadoId(null);
      setSelectedUf(uf);
      setSelectedAno(ano);
      setActiveColeta({ uf, ano });
      setRefreshToken((t) => t + 1);
      pushToast({
        tone: 'info',
        title: res.already_running ? 'Coleta já em andamento' : `Coleta iniciada para ${uf}/${ano}`,
        description: res.message,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Não foi possível iniciar a coleta',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
      });
    } finally {
      setSubmittingCollection(false);
    }
  };

  const navigateToSection = (sectionId: string) => {
    if (selectedDeputadoId !== null) {
      setSelectedDeputadoId(null);
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  const navigateToExpensesSearch = () => {
    const focusSearch = () => {
      document.getElementById('despesas')?.scrollIntoView({ behavior: 'smooth' });
      window.setTimeout(() => {
        const input = document.getElementById('despesas-search-input') as HTMLInputElement | null;
        input?.focus({ preventScroll: true });
      }, 420);
    };

    if (selectedDeputadoId !== null) {
      setSelectedDeputadoId(null);
      window.setTimeout(focusSearch, 80);
      return;
    }
    focusSearch();
  };

  return (
    <>
      <a href="#conteudo-principal" className="skip-link">
        Pular para o conteúdo principal
      </a>

      <HeaderNav
        selectedUf={selectedUf}
        selectedAno={selectedAno}
        onNavigateSection={navigateToSection}
        onOpenCollectionModal={() => setCollectionOpen(true)}
        onSearchDataClick={navigateToExpensesSearch}
      />

      <main id="conteudo-principal">
        {selectedDeputadoId !== null ? (
          <DeputyDetailView
            deputadoId={selectedDeputadoId}
            ano={selectedAno}
            ufContext={selectedUf}
            onBack={() => setSelectedDeputadoId(null)}
          />
        ) : (
          <>
            <HeroSection
              overview={overview}
              meta={meta}
              loading={loadingSlice}
              failed={Boolean(dbError)}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              onExploreClick={() => navigateToSection('visao-geral')}
              onOpenCollectionModal={() => setCollectionOpen(true)}
              onQuickSelectCut={(uf, ano) => {
                setSelectedUf(uf);
                setSelectedAno(ano);
              }}
            />

            <OverviewSection
              overview={overview}
              meta={meta}
              health={health}
              selectedAno={selectedAno}
              onChangeAno={(ano) => setSelectedAno(ano)}
              loading={loadingSlice}
              dbError={dbError}
              onRetry={() => setRefreshToken((t) => t + 1)}
              onOpenCollectionModal={() => setCollectionOpen(true)}
            />

            <StateExplorerSection
              meta={meta}
              overview={overview}
              deputados={deputados}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              onChangeUf={setSelectedUf}
              onChangeAno={setSelectedAno}
              onOpenCollectionModal={() => setCollectionOpen(true)}
            />

            <DeputiesSection
              deputados={deputados}
              loading={loadingSlice}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              hasData={overview?.has_data ?? false}
              onOpenDeputy={(id) => {
                setSelectedDeputadoId(id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            <ExpensesSection
              meta={meta}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              deputados={deputados}
              categoriasDisponiveis={overview?.categorias_disponiveis ?? []}
              onChangeUf={setSelectedUf}
              onChangeAno={setSelectedAno}
              onOpenDeputy={(id) => {
                setSelectedDeputadoId(id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              refreshToken={refreshToken}
            />

            <AnalyticsSection
              analytics={analytics}
              loading={loadingSlice}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              onSelectUf={(uf) => {
                setSelectedUf(uf);
                navigateToSection('visao-geral');
              }}
              onOpenDeputy={(id) => {
                setSelectedDeputadoId(id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            <AboutDataSection
              overview={overview}
              execucoes={execucoes}
              health={health}
            />
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <strong>Radar Legislativo</strong> · Aplicação de exploração de dados públicos da Câmara
            dos Deputados (CEAP) com base PostgreSQL.
          </div>
          <div>
            Dados públicos oficiais via{' '}
            <a
              href="https://dadosabertos.camara.leg.br/swagger/api.html"
              target="_blank"
              rel="noreferrer"
            >
              dadosabertos.camara.leg.br
            </a>
          </div>
        </div>
      </footer>

      <CollectionDrawer
        open={collectionOpen}
        meta={meta}
        defaultUf={selectedUf}
        defaultAno={selectedAno}
        submitting={submittingCollection}
        onClose={() => setCollectionOpen(false)}
        onSubmit={handleTriggerCollection}
      />

      <SwipeToast toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
export default App;
