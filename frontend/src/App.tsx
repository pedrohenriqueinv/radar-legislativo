import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AboutDataSection } from './components/AboutDataSection';
import { AnalyticsSection } from './components/AnalyticsSection';
import { CollectionDrawer } from './components/CollectionDrawer';
import { CommandPalette } from './components/CommandPalette';
import { DeputiesSection } from './components/DeputiesSection';
import { DeputyDetailView } from './components/DeputyDetailView';
import {
  DynamicCollectionIsland,
  type CollectionIslandState,
  type IslandPhase,
} from './components/DynamicCollectionIsland';
import { ExpensesSection } from './components/ExpensesSection';
import { HeaderNav } from './components/HeaderNav';
import { HeroSection } from './components/HeroSection';
import { OverviewSection } from './components/OverviewSection';
import { QuickActionFab } from './components/QuickActionFab';
import { StateExplorerSection } from './components/StateExplorerSection';
import { SwipeToast, type ToastItem } from './components/motion/SwipeToast';
import { ApiError, radarApi } from './services/api';
import type {
  AnalyticsResponse,
  DeputadoCardOut,
  ExecucaoOut,
  HealthResponse,
  MetaResponse,
  OverviewResponse,
} from './types/api';
import './components/GlobalInteractions.css';

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

function setControlledInputValue(input: HTMLInputElement, nextValue: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, nextValue);
  } else {
    input.value = nextValue;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function App() {
  const [initial] = useState(readInitialQuery);
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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [submittingCollection, setSubmittingCollection] = useState<boolean>(false);
  const [activeColeta, setActiveColeta] = useState<{ uf: string; ano: number } | null>(null);
  const [terminalIsland, setTerminalIsland] = useState<CollectionIslandState | null>(null);
  const [islandDismissed, setIslandDismissed] = useState<boolean>(false);
  const [refreshToken, setRefreshToken] = useState<number>(0);
  const [expensesSearchSync, setExpensesSearchSync] = useState<{
    query: string;
    nonce: number;
  }>({ query: '', nonce: 0 });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const islandTimerRef = useRef<number | null>(null);

  const clearIslandTimer = useCallback(() => {
    if (islandTimerRef.current !== null) {
      window.clearTimeout(islandTimerRef.current);
      islandTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearIslandTimer, [clearIslandTimer]);

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

  // Global deduplicated Cmd+K / Ctrl+K shortcut for Command Palette
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCollectionOpen(false);
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
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

  const pollingUf =
    activeColeta?.uf ??
    (overview?.situacao_coleta === 'em_andamento' ? overview.uf : null);
  const pollingAno =
    activeColeta?.ano ??
    (overview?.situacao_coleta === 'em_andamento' ? overview.ano : null);

  // Poll collection lifecycle while any collection is running for the active cut
  useEffect(() => {
    if (!pollingUf || !pollingAno) return;

    const targetUf = pollingUf;
    const targetAno = pollingAno;

    const timer = window.setInterval(async () => {
      try {
        const [ov, exList, m] = await Promise.all([
          radarApi.getOverview(targetUf, targetAno),
          radarApi.getExecucoes(20),
          radarApi.getMeta(),
        ]);
        setMeta(m);
        setExecucoes(exList);
        if (targetUf === selectedUf && targetAno === selectedAno) {
          setOverview(ov);
        }

        if (ov.situacao_coleta !== 'em_andamento') {
          setActiveColeta(null);
          setRefreshToken((t) => t + 1);
          setIslandDismissed(false);

          const latestExec =
            exList.find((e) => e.uf === targetUf && e.ano === targetAno) ?? ov.ultima_execucao;

          if (
            ov.situacao_coleta === 'completa' ||
            ov.situacao_coleta === 'parcial' ||
            ov.situacao_coleta === 'falhou'
          ) {
            setTerminalIsland({
              uf: targetUf,
              ano: targetAno,
              phase: ov.situacao_coleta,
              deputadosProcessados: ov.qtd_deputados || latestExec?.deputados_processados || 0,
              deputadosEsperados: latestExec?.deputados_esperados || ov.qtd_deputados || 0,
              despesasColetadas: ov.qtd_despesas || latestExec?.despesas_coletadas || 0,
              despesasInseridas: latestExec?.despesas_inseridas ?? 0,
              despesasAtualizadas: latestExec?.despesas_atualizadas ?? 0,
              nota: ov.nota_integridade,
              execucao: latestExec,
            });

            clearIslandTimer();
            if (ov.situacao_coleta === 'completa') {
              islandTimerRef.current = window.setTimeout(() => {
                setTerminalIsland(null);
                islandTimerRef.current = null;
              }, 4400);
            } else if (ov.situacao_coleta === 'parcial') {
              islandTimerRef.current = window.setTimeout(() => {
                setTerminalIsland(null);
                islandTimerRef.current = null;
              }, 7500);
            }
          }
        }
      } catch {
        // tolerate transient poll jitter
      }
    }, 2200);

    return () => window.clearInterval(timer);
  }, [pollingUf, pollingAno, selectedUf, selectedAno, clearIslandTimer]);

  // Derive live Dynamic Collection Island state during render
  const collectionIslandState = useMemo<CollectionIslandState | null>(() => {
    if (islandDismissed) return null;

    if (pollingUf && pollingAno) {
      const matchingExec =
        execucoes.find(
          (ex) => ex.uf === pollingUf && ex.ano === pollingAno && ex.status === 'em_andamento'
        ) ??
        (overview?.uf === pollingUf && overview.ano === pollingAno
          ? overview.ultima_execucao
          : null);

      const processed = matchingExec?.deputados_processados ?? 0;
      const expected = matchingExec?.deputados_esperados ?? 0;
      const expenses = matchingExec?.despesas_coletadas ?? 0;

      let phase: IslandPhase = 'connecting';
      if (processed > 0) {
        phase = expected > 0 && processed >= expected ? 'saving' : 'processing';
      }

      return {
        uf: pollingUf,
        ano: pollingAno,
        phase,
        deputadosProcessados: processed,
        deputadosEsperados: expected,
        despesasColetadas: expenses,
        despesasInseridas: matchingExec?.despesas_inseridas ?? 0,
        despesasAtualizadas: matchingExec?.despesas_atualizadas ?? 0,
        execucao: matchingExec,
      };
    }

    return terminalIsland;
  }, [islandDismissed, pollingUf, pollingAno, execucoes, overview, terminalIsland]);

  const handleTriggerCollection = useCallback(
    async (uf: string, ano: number, maxDeputados: number | null) => {
      setSubmittingCollection(true);
      clearIslandTimer();
      setTerminalIsland(null);
      setIslandDismissed(false);
      try {
        const res = await radarApi.triggerColeta({
          uf,
          ano,
          max_deputados: maxDeputados,
        });
        setCollectionOpen(false);
        startTransition(() => {
          setSelectedDeputadoId(null);
          setSelectedUf(uf);
          setSelectedAno(ano);
        });
        setActiveColeta({ uf, ano });
        if (res.execucao) {
          setExecucoes((prev) => [res.execucao!, ...prev.filter((e) => e.id !== res.execucao!.id)]);
        }
        setRefreshToken((t) => t + 1);
      } catch (err) {
        pushToast({
          tone: 'error',
          title: 'Não foi possível iniciar a coleta',
          description: err instanceof Error ? err.message : 'Erro desconhecido.',
        });
      } finally {
        setSubmittingCollection(false);
      }
    },
    [clearIslandTimer, pushToast]
  );

  const handleQuickCollectActive = useCallback(() => {
    void handleTriggerCollection(selectedUf, selectedAno, null);
  }, [handleTriggerCollection, selectedUf, selectedAno]);

  const handleDismissIsland = useCallback(() => {
    clearIslandTimer();
    setTerminalIsland(null);
    setIslandDismissed(true);
  }, [clearIslandTimer]);

  const handleRetryIsland = useCallback(
    (uf: string, ano: number) => {
      void handleTriggerCollection(uf, ano, null);
    },
    [handleTriggerCollection]
  );

  const navigateToSection = useCallback(
    (sectionId: string) => {
      if (selectedDeputadoId !== null) {
        startTransition(() => {
          setSelectedDeputadoId(null);
        });
        window.setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
        }, 70);
        return;
      }
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    },
    [selectedDeputadoId]
  );

  const navigateToExpensesSearch = useCallback(
    (prefillQuery?: string) => {
      if (typeof prefillQuery === 'string' && prefillQuery.trim().length > 0) {
        const cleanQuery = prefillQuery.trim();
        setExpensesSearchSync((prev) => ({
          query: cleanQuery,
          nonce: prev.nonce + 1,
        }));
      }

      const focusSearch = () => {
        document.getElementById('despesas')?.scrollIntoView({ behavior: 'smooth' });
        window.setTimeout(() => {
          const input = document.getElementById('despesas-search-input') as HTMLInputElement | null;
          if (!input) return;
          if (typeof prefillQuery === 'string' && prefillQuery.trim().length > 0 && input.value !== prefillQuery.trim()) {
            setControlledInputValue(input, prefillQuery.trim());
          }
          input.focus({ preventScroll: true });
        }, 420);
      };

      if (selectedDeputadoId !== null) {
        startTransition(() => {
          setSelectedDeputadoId(null);
        });
        window.setTimeout(focusSearch, 90);
        return;
      }
      focusSearch();
    },
    [selectedDeputadoId]
  );

  const handleExportCsv = useCallback(() => {
    const csvUrl = radarApi.getDespesasCsvUrl({ uf: selectedUf, ano: selectedAno });
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = `radar-legislativo-${selectedUf}-${selectedAno}.csv`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    pushToast({
      tone: 'ok',
      title: `Exportando CSV (${selectedUf}/${selectedAno})`,
      description: 'O download das despesas oficiais do recorte foi iniciado.',
    });
  }, [selectedUf, selectedAno, pushToast]);

  const handleOpenDeputy = useCallback((id: number) => {
    startTransition(() => {
      setSelectedDeputadoId(id);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectUf = useCallback((uf: string) => {
    startTransition(() => {
      setSelectedDeputadoId(null);
      setSelectedUf(uf);
    });
  }, []);

  const handleSelectAno = useCallback((ano: number) => {
    startTransition(() => {
      setSelectedAno(ano);
    });
  }, []);

  const handleQuickSelectCut = useCallback((uf: string, ano: number) => {
    startTransition(() => {
      setSelectedUf(uf);
      setSelectedAno(ano);
    });
  }, []);

  const handleOpenCollectionModal = useCallback(() => setCollectionOpen(true), []);
  const handleCloseCollectionModal = useCallback(() => setCollectionOpen(false), []);
  const handleOpenCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const handleCloseCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const handleRetryRefresh = useCallback(() => setRefreshToken((t) => t + 1), []);
  const handleGoToAnalytics = useCallback(() => navigateToSection('analises'), [navigateToSection]);

  const activeStorageLabel =
    health?.database_connected === false
      ? 'Banco indisponível'
      : health?.storage_label || meta?.storage_label || 'banco relacional';

  return (
    <MotionConfig reducedMotion="user">
      <a href="#conteudo-principal" className="skip-link">
        Pular para o conteúdo principal
      </a>

      <HeaderNav
        selectedUf={selectedUf}
        selectedAno={selectedAno}
        onNavigateSection={navigateToSection}
        onOpenCollectionModal={handleOpenCollectionModal}
        onSearchDataClick={() => navigateToExpensesSearch()}
        onOpenCommandPalette={handleOpenCommandPalette}
      />

      <DynamicCollectionIsland
        state={collectionIslandState}
        storageLabel={activeStorageLabel}
        onDismiss={handleDismissIsland}
        onRetry={handleRetryIsland}
      />

      <main id="conteudo-principal">
        {selectedDeputadoId !== null ? (
          <DeputyDetailView
            deputadoId={selectedDeputadoId}
            ano={selectedAno}
            ufContext={selectedUf}
            deputadosInSlice={deputados}
            onBack={() =>
              startTransition(() => {
                setSelectedDeputadoId(null);
              })
            }
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
              onOpenCollectionModal={handleOpenCollectionModal}
              onQuickSelectCut={handleQuickSelectCut}
            />

            <OverviewSection
              overview={overview}
              meta={meta}
              health={health}
              selectedAno={selectedAno}
              onChangeAno={handleSelectAno}
              loading={loadingSlice}
              dbError={dbError}
              onRetry={handleRetryRefresh}
              onOpenCollectionModal={handleOpenCollectionModal}
              onQuickCollectActive={handleQuickCollectActive}
              submittingCollection={submittingCollection}
            />

            <StateExplorerSection
              meta={meta}
              overview={overview}
              deputados={deputados}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              onChangeUf={handleSelectUf}
              onChangeAno={handleSelectAno}
              onOpenCollectionModal={handleOpenCollectionModal}
            />

            <DeputiesSection
              deputados={deputados}
              overview={overview}
              loading={loadingSlice}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              hasData={overview?.has_data ?? false}
              onOpenDeputy={handleOpenDeputy}
            />

            <ExpensesSection
              meta={meta}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              deputados={deputados}
              categoriasDisponiveis={overview?.categorias_disponiveis ?? []}
              onChangeUf={handleSelectUf}
              onChangeAno={handleSelectAno}
              onOpenDeputy={handleOpenDeputy}
              refreshToken={refreshToken}
              externalSearchQuery={expensesSearchSync.query}
              externalSearchNonce={expensesSearchSync.nonce}
            />

            <AnalyticsSection
              analytics={analytics}
              deputados={deputados}
              loading={loadingSlice}
              selectedUf={selectedUf}
              selectedAno={selectedAno}
              onSelectUf={(uf) => {
                handleSelectUf(uf);
                navigateToSection('visao-geral');
              }}
              onOpenDeputy={handleOpenDeputy}
            />

            <AboutDataSection
              overview={overview}
              execucoes={execucoes}
              health={health}
              meta={meta}
            />
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <strong>Radar Legislativo</strong> · Aplicação de exploração de dados públicos da Câmara
            dos Deputados (CEAP) · Armazenamento ativo: <strong>{activeStorageLabel}</strong>.
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
        storageLabel={activeStorageLabel}
        onClose={handleCloseCollectionModal}
        onSubmit={handleTriggerCollection}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={handleCloseCommandPalette}
        meta={meta}
        deputados={deputados}
        selectedUf={selectedUf}
        selectedAno={selectedAno}
        onSelectUf={(uf) => {
          handleSelectUf(uf);
          navigateToSection('visao-geral');
        }}
        onOpenDeputy={handleOpenDeputy}
        onNavigateSection={navigateToSection}
        onJumpToExpenses={navigateToExpensesSearch}
        onOpenCollectionModal={handleOpenCollectionModal}
        onExportCsv={handleExportCsv}
      />

      <QuickActionFab
        selectedUf={selectedUf}
        selectedAno={selectedAno}
        onExportCsv={handleExportCsv}
        onOpenCollectionModal={handleOpenCollectionModal}
        onGoToAnalytics={handleGoToAnalytics}
      />

      <SwipeToast toasts={toasts} onDismiss={dismissToast} />
    </MotionConfig>
  );
}

export default App;
