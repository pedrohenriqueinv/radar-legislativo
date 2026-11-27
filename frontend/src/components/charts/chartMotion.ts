import type { Transition } from 'motion/react';

export const EDITORIAL_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];
export const OUT_EXPO_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.85,
};

export const SPRING_GENTLE: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 28,
  mass: 0.95,
};

export const SPRING_TOOLTIP: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 36,
  mass: 0.7,
};

export const INSTANT_TRANSITION: Transition = {
  duration: 0,
};

/** Warm newsprint editorial palette — zero neon or dark SaaS colors */
export const DONUT_PALETTE = [
  '#B83628', // terracotta editorial
  '#25201A', // broadsheet ink
  '#C96A3B', // burnt sienna
  '#6C6357', // warm slate stone
  '#9A866C', // archival parchment taupe
  '#BFB39E', // soft newsprint sand
] as const;

export const TIER_COLORS = {
  high: {
    fill: '#B83628',
    hover: '#CE4233',
    stroke: '#FAF7F0',
    label: 'Acima da média',
    badgeBg: 'rgba(184, 54, 40, 0.12)',
    badgeInk: '#96291D',
  },
  mid: {
    fill: '#B06A2B',
    hover: '#C47B38',
    stroke: '#FAF7F0',
    label: 'Faixa intermediária',
    badgeBg: 'rgba(143, 82, 16, 0.14)',
    badgeInk: '#8F5210',
  },
  low: {
    fill: '#5E554B',
    hover: '#3E3730',
    stroke: '#FAF7F0',
    label: 'Menor volume',
    badgeBg: 'rgba(37, 32, 26, 0.09)',
    badgeInk: '#4B443A',
  },
} as const;

/** Editorial muted ink & earth tones for party hex clusters */
export const PARTY_PALETTE = [
  '#B83628',
  '#2F4F4F',
  '#8F5210',
  '#3A4F6B',
  '#6B4A3A',
  '#1D6848',
  '#7A3E48',
  '#5C5347',
  '#9A5B2C',
  '#4A5D4E',
] as const;

/** Round SVG coordinates to 1 decimal place to minimize DOM/path precision cost */
export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 1 && !['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'].includes(p.toUpperCase()));
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
