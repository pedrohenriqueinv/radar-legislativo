import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BarChart3, Download, Plus, RefreshCw } from 'lucide-react';

interface QuickActionFabProps {
  selectedUf: string;
  selectedAno: number;
  onExportCsv: () => void;
  onOpenCollectionModal: () => void;
  onGoToAnalytics: () => void;
}

const FAN_SPRING = {
  type: 'spring' as const,
  stiffness: 450,
  damping: 29,
  mass: 0.72,
};

/**
 * Editorial `+` Quick Actions contextual fan adapted from One-Tap Menu Bypass.
 * Anchored bottom-right with safe separation from SwipeToast and Dynamic Island.
 */
export const QuickActionFab = memo(function QuickActionFab({
  selectedUf,
  selectedAno,
  onExportCsv,
  onOpenCollectionModal,
  onGoToAnalytics,
}: QuickActionFabProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const shouldReduce = useReducedMotion();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const actions = [
    {
      id: 'analytics',
      label: 'Ir para Análises',
      caption: 'Gráficos e comparação de UFs',
      icon: <BarChart3 size={16} aria-hidden="true" />,
      onClick: () => {
        close();
        onGoToAnalytics();
      },
    },
    {
      id: 'collect',
      label: 'Coletar recorte',
      caption: 'Sincronizar na API da Câmara',
      icon: <RefreshCw size={16} aria-hidden="true" />,
      onClick: () => {
        close();
        onOpenCollectionModal();
      },
    },
    {
      id: 'csv',
      label: 'Exportar CSV',
      caption: `${selectedUf} · ${selectedAno}`,
      icon: <Download size={16} aria-hidden="true" />,
      onClick: () => {
        close();
        onExportCsv();
      },
    },
  ];

  return (
    <div ref={rootRef} className="quick-fab-root" data-open={open}>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Ações rápidas do recorte"
            className="quick-fab-fan"
            initial={shouldReduce ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: shouldReduce ? 0.01 : 0.14 } }}
          >
            {actions.map((action, idx) => {
              // Bottom-most item appears first (closest to + trigger)
              const reverseOrder = actions.length - 1 - idx;
              return (
                <motion.button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className="quick-fab-item"
                  onClick={action.onClick}
                  initial={
                    shouldReduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: 14, scale: 0.9, x: 6 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                  exit={
                    shouldReduce
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          y: 10,
                          scale: 0.92,
                          transition: { duration: 0.11, delay: idx * 0.02 },
                        }
                  }
                  transition={
                    shouldReduce
                      ? { duration: 0.01 }
                      : { ...FAN_SPRING, delay: reverseOrder * 0.042 }
                  }
                  whileHover={shouldReduce ? undefined : { x: -3 }}
                  whileTap={shouldReduce ? undefined : { scale: 0.97 }}
                >
                  <span className="quick-fab-item-text">
                    <span className="quick-fab-item-label">{action.label}</span>
                    <span className="quick-fab-item-caption tabular">{action.caption}</span>
                  </span>
                  <span className="quick-fab-item-icon">{action.icon}</span>
                </motion.button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        className={`quick-fab-trigger ${open ? 'quick-fab-trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={open ? 'Fechar ações rápidas' : 'Abrir ações rápidas'}
        onClick={() => setOpen((prev) => !prev)}
        whileHover={shouldReduce ? undefined : { scale: 1.05 }}
        whileTap={shouldReduce ? undefined : { scale: 0.94 }}
        transition={shouldReduce ? { duration: 0.01 } : FAN_SPRING}
      >
        <motion.span
          className="quick-fab-plus-wrap"
          animate={{ rotate: open ? 45 : 0 }}
          transition={shouldReduce ? { duration: 0.01 } : FAN_SPRING}
        >
          <Plus size={20} strokeWidth={2.3} aria-hidden="true" />
        </motion.span>
      </motion.button>
    </div>
  );
});
