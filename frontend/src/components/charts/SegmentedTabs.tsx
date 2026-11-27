import { memo, startTransition } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { INSTANT_TRANSITION, SPRING_SNAPPY } from './chartMotion';

export interface TabOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  groupId: string;
  value: T;
  options: readonly TabOption<T>[];
  label: string;
  size?: 'sm' | 'md';
  onChange: (next: T) => void;
}

function SegmentedTabsInner<T extends string>({
  groupId,
  value,
  options,
  label,
  size = 'md',
  onChange,
}: SegmentedTabsProps<T>) {
  const shouldReduce = useReducedMotion();

  return (
    <div
      className={`segmented-tabs${size === 'sm' ? ' segmented-tabs--sm' : ''}`}
      role="group"
      aria-label={label}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className="segmented-tab-btn"
            aria-pressed={active}
            onClick={() => {
              if (opt.id === value) return;
              startTransition(() => {
                onChange(opt.id);
              });
            }}
          >
            {active ? (
              <motion.span
                layoutId={groupId}
                className="segmented-tab-pill"
                transition={shouldReduce ? INSTANT_TRANSITION : SPRING_SNAPPY}
              />
            ) : null}
            <span className="segmented-tab-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const SegmentedTabs = memo(SegmentedTabsInner) as typeof SegmentedTabsInner;
