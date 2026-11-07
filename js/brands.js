// Brand badges: the brand name in text on the brand's colour. No logo art (trademark caution).
// Colours are [background, text]; every pair is checked for WCAG AA (4.5:1) in the e2e tests.
import { norm, esc } from './util.js';

export const BRAND_COLORS = {
  'esso': ['#0B3D91', '#FFFFFF'],
  'petro-canada': ['#C8102E', '#FFFFFF'],
  'shell': ['#FFD500', '#1A1814'],
  'ultramar': ['#005AA7', '#FFFFFF'],
  'harnois': ['#1B6B3A', '#FFFFFF'],
  'irving': ['#E85D04', '#1A1814'],
  'sonic': ['#7A1FA2', '#FFFFFF'],
  'couche-tard': ['#D4202B', '#FFFFFF'],
  'crevier': ['#0B6E99', '#FFFFFF'],
  'canadian tire': ['#C8102E', '#FFFFFF'],
  'costco': ['#0A4DA2', '#FFFFFF'],
  'mobil': ['#1D4E9E', '#FFFFFF'],
  'eko': ['#00704A', '#FFFFFF'],
  'nutrinor energies': ['#0F5C5C', '#FFFFFF'],
  'petroplus': ['#B3261E', '#FFFFFF'],
  'paquet': ['#5B3A1A', '#FFFFFF'],
};
const NEUTRAL = ['#EAE3D4', '#4A443A']; // same as --muted-surface / --on-muted-surface

const isNone = (b) => !b || /^(independant|aucun|)$/.test(norm(b));
export const badgeLabel = (b) => (isNone(b) ? 'Indépendant' : b);
export function brandColors(b) { return (!isNone(b) && BRAND_COLORS[norm(b)]) || NEUTRAL; }

/** Small badge: brand name as text. `cls` adds modifiers (e.g. 'brand-badge--sm'). */
export function brandBadge(b, cls = '') {
  const [bg, fg] = brandColors(b);
  return `<span class="brand-badge ${cls}" style="--bb:${bg};--bb-on:${fg}">${esc(badgeLabel(b))}</span>`;
}
