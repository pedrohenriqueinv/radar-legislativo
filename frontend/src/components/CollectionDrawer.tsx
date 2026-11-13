import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RefreshCw, X } from 'lucide-react';
import type { MetaResponse } from '../types/api';

const CONTRA_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];

interface CollectionDrawerProps {
  open: boolean;
  meta: MetaResponse | null;
  defaultUf: string;
  defaultAno: number;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (uf: string, ano: number, maxDeputados: number | null) => void;
}

export function CollectionDrawer({
  open,
  meta,
  defaultUf,
  defaultAno,
  submitting,
  onClose,
  onSubmit,
}: CollectionDrawerProps) {
  const [uf, setUf] = useState(defaultUf);
  const [ano, setAno] = useState(defaultAno);
  const [maxDeps, setMaxDeps] = useState<string>('');

  useEffect(() => {
    if (open) {
      setUf(defaultUf);
      setAno(defaultAno);
    }
  }, [open, defaultUf, defaultAno]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coleta-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="modal-panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.24, ease: CONTRA_EASE }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 id="coleta-modal-title" style={{ margin: 0, fontSize: '1.22rem' }}>
                Coletar dados oficiais da Câmara
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onClose}
                aria-label="Fechar janela de coleta"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ margin: '0 0 18px', fontSize: '0.9rem', color: 'var(--ink-secondary)' }}>
              O pipeline consulta a API v2 da Câmara dos Deputados para o estado e ano selecionados,
              normaliza valores, deduplica registros e atualiza o banco preservando coletas válidas.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsedMax = maxDeps.trim() ? Number(maxDeps) : null;
                onSubmit(uf, ano, parsedMax && parsedMax > 0 ? parsedMax : null);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem' }}>
                  Unidade federativa (UF)
                  <select
                    className="filter-select"
                    value={uf}
                    onChange={(e) => setUf(e.target.value)}
                  >
                    {(meta?.ufs ?? []).map((u) => (
                      <option key={u.uf} value={u.uf}>
                        {u.uf} — {u.nome}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem' }}>
                  Ano de referência
                  <select
                    className="filter-select"
                    value={ano}
                    onChange={(e) => setAno(Number(e.target.value))}
                  >
                    {(meta?.anos_suportados ?? [2025, 2024, 2023, 2022]).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem' }}>
                Limite opcional de deputados (deixe vazio para coleta completa da UF)
                <input
                  type="number"
                  min={1}
                  max={600}
                  className="input-field"
                  placeholder="Ex.: 10 (útil para estados grandes em teste rápido)"
                  value={maxDeps}
                  onChange={(e) => setMaxDeps(e.target.value)}
                />
              </label>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  marginTop: 8,
                  paddingTop: 14,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  <RefreshCw size={15} />
                  {submitting ? 'Disparando pipeline...' : `Coletar ${uf}/${ano}`}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
