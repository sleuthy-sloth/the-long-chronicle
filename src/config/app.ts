// Single place for product identity — change name/icon/theme here.
export const APP = {
  name: 'The Long Chronicle',
  shortName: 'Chronicle',
  tagline: 'An immortal’s archive — a companion for Thousand Year Old Vampire.',
  version: '0.1.0',
  schemaVersion: 1,
} as const
export const THEME_TOKENS = {
  light: { bg: '#f4eedd', card: '#faf6ee', ink: '#2b241f', accent: '#6e1f1f', gold: '#a8842c' },
  dark: { bg: '#1c1917', card: '#2e2823', ink: '#ece5d8', accent: '#c98a8a', gold: '#c9a44a' },
} as const
