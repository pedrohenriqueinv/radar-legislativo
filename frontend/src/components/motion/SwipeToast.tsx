import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, Info, X, XCircle } from 'lucide-react';
import './SwipeToast.css';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone?: 'ok' | 'warn' | 'error' | 'info';
}

interface SwipeToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

/**
 * Port em TypeScript de ReactBits SwipeToast usando motion/react (Motion).
 */
export function SwipeToast({ toasts, onDismiss }: SwipeToastProps) {
  return (
    <div className="radar-toast-viewport" role="region" aria-label="Notificações do sistema">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = toast.tone ?? 'info';
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              drag="x"
              dragConstraints={{ left: 0, right: 180 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80 || info.velocity.x > 400) {
                  onDismiss(toast.id);
                }
              }}
              className={`radar-toast-card radar-toast-card--${tone}`}
              role="status"
            >
              <div className="radar-toast-body">
                {tone === 'ok' && (
                  <Check size={17} strokeWidth={2.2} color="#2C5E44" style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                {tone === 'warn' && (
                  <AlertTriangle size={18} color="var(--status-warn)" style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                {tone === 'error' && (
                  <XCircle size={18} color="var(--status-error)" style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                {tone === 'info' && (
                  <Info size={18} color="var(--status-info)" style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                <div>
                  <p className="radar-toast-title">{toast.title}</p>
                  {toast.description && <p className="radar-toast-desc">{toast.description}</p>}
                </div>
              </div>
              <button
                type="button"
                className="radar-toast-close"
                aria-label="Fechar notificação"
                onClick={() => onDismiss(toast.id)}
              >
                <X size={16} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
