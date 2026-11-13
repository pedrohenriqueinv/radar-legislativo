import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { HelpCircle, X } from 'lucide-react';

interface MethodPopoverProps {
  title: string;
  body: string;
  sourceLabel?: string;
}

/**
 * Popover explicativo acionado por ícone `?`, inspirado diretamente
 * nos relatórios da Contra Labs para manter os gráficos limpos e didáticos.
 */
export function MethodPopover({ title, body, sourceLabel }: MethodPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="method-popover-wrap">
      <button
        type="button"
        className="method-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Metodologia: ${title}`}
        title="Ver nota metodológica e fonte"
      >
        <HelpCircle size={15} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.48, 0.05, 0.35, 0.99] }}
            className="method-popover-card"
            role="dialog"
            aria-label={title}
          >
            <div className="method-popover-head">
              <strong>{title}</strong>
              <button
                type="button"
                className="method-close"
                aria-label="Fechar explicação"
                onClick={() => setOpen(false)}
              >
                <X size={13} />
              </button>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', lineHeight: 1.48, color: 'var(--ink-secondary)' }}>
              {body}
            </p>
            {sourceLabel && (
              <p style={{ margin: '8px 0 0', fontSize: '0.73rem', color: 'var(--ink-muted)' }}>
                {sourceLabel}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
