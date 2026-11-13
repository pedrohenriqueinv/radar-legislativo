import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bookmark, Search } from 'lucide-react';

interface HeaderNavProps {
  selectedUf: string;
  selectedAno: number;
  onNavigateSection: (sectionId: string) => void;
  onOpenCollectionModal: () => void;
  onSearchDataClick: () => void;
}

const SECTION_LINKS = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'estados', label: 'Estados' },
  { id: 'parlamentares', label: 'Parlamentares' },
  { id: 'despesas', label: 'Despesas' },
  { id: 'analises', label: 'Análises' },
  { id: 'sobre-dados', label: 'Sobre os dados' },
];

export function HeaderNav({
  selectedUf,
  selectedAno,
  onNavigateSection,
  onOpenCollectionModal,
  onSearchDataClick,
}: HeaderNavProps) {
  const [activeSection, setActiveSection] = useState<string>('visao-geral');

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const elements = SECTION_LINKS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0 && visible[0].target.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: '-22% 0px -55% 0px',
        threshold: [0.05, 0.2, 0.45],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <header className="site-header-wrap" aria-label="Navegação principal do Radar Legislativo">
      <div className="main-nav-bar">
        <div className="container main-nav-inner">
          <a
            href="#topo"
            className="brand-mark"
            aria-label="Radar Legislativo — voltar ao topo"
            onClick={(e) => {
              e.preventDefault();
              onNavigateSection('topo');
            }}
          >
            <span className="brand-title">
              Radar<span className="brand-title-light">.leg</span>
            </span>
          </a>

          <nav className="nav-anchors" aria-label="Navegação principal">
            {SECTION_LINKS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`nav-link ${isActive ? 'nav-link--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveSection(item.id);
                    onNavigateSection(item.id);
                  }}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-underline"
                      className="nav-active-indicator"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                </a>
              );
            })}
          </nav>

          <div className="nav-actions">
            <button
              type="button"
              className="nav-bookmark-btn"
              onClick={onOpenCollectionModal}
              title={`Recorte ativo: ${selectedUf} · ${selectedAno}. Clique para coletar ou trocar UF/Ano`}
              aria-label={`Recorte ativo ${selectedUf} ${selectedAno} — abrir seleção e coleta`}
            >
              <Bookmark size={16} />
              <span className="nav-bookmark-tag tabular">
                {selectedUf} · {selectedAno}
              </span>
            </button>

            <button type="button" className="nav-explore-pill" onClick={onSearchDataClick}>
              <Search size={14} />
              <span>Explorar os dados</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
