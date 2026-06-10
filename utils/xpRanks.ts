/**
 * xpRanks.ts
 *
 * 20-tier XP rank system. Each tier has 5 sub-levels (I–V),
 * giving 100 total levels (1–100).
 */

export interface XpRank {
  level: number;
  tierIndex: number;
  tierName: string;
  subLevel: number;
  romanNumeral: string;
  primaryColor: string;
  gradientColor?: string;
  isLight: boolean;
}

interface TierDef {
  name: string;
  primaryColor: string;
  gradientColor?: string;
  isLight: boolean;
}

const TIERS: TierDef[] = [
  { name: 'Rookie',        primaryColor: '#6B7280',              isLight: false }, // 0  L1-5
  { name: 'Novice',        primaryColor: '#16A34A',              isLight: false }, // 1  L6-10
  { name: 'Challenger',    primaryColor: '#2563EB',              isLight: false }, // 2  L11-15
  { name: 'Athlete',       primaryColor: '#4F46E5',              isLight: false }, // 3  L16-20
  { name: 'Warrior',       primaryColor: '#7C3AED',              isLight: false }, // 4  L21-25
  { name: 'Fighter',       primaryColor: '#9333EA',              isLight: false }, // 5  L26-30
  { name: 'Grinder',       primaryColor: '#DB2777',              isLight: false }, // 6  L31-35
  { name: 'Dedicated',     primaryColor: '#EA580C',              isLight: false }, // 7  L36-40
  { name: 'Iron Mind',     primaryColor: '#DC2626',              isLight: false }, // 8  L41-45
  { name: 'Titan',         primaryColor: '#991B1B',              isLight: false }, // 9  L46-50
  { name: 'Elite',         primaryColor: '#B45309',              isLight: false }, // 10 L51-55
  { name: 'Champion',      primaryColor: '#D97706',              isLight: false }, // 11 L56-60
  { name: 'Master',        primaryColor: '#F59E0B',              isLight: true  }, // 12 L61-65
  { name: 'Grandmaster',   primaryColor: '#EAB308',              isLight: true  }, // 13 L66-70
  { name: 'Legend',        primaryColor: '#0891B2',              isLight: false }, // 14 L71-75
  { name: 'Mythic',        primaryColor: '#06B6D4',              isLight: true  }, // 15 L76-80
  { name: 'Immortal',      primaryColor: '#94A3B8',              isLight: true  }, // 16 L81-85
  { name: 'Ascendant',     primaryColor: '#E2E8F0',              isLight: true  }, // 17 L86-90
  { name: 'Transcendent',  primaryColor: '#0F172A', gradientColor: '#3B82F6', isLight: false }, // 18 L91-95
  { name: 'Apex',          primaryColor: '#0F172A', gradientColor: '#F59E0B', isLight: false }, // 19 L96-100
];

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V'];

export function getXpRank(level: number): XpRank {
  const clamped = Math.max(1, Math.min(100, level));
  const tierIndex = Math.min(Math.floor((clamped - 1) / 5), 19);
  const subLevel = ((clamped - 1) % 5) + 1;
  const tier = TIERS[tierIndex];

  return {
    level: clamped,
    tierIndex,
    tierName: tier.name,
    subLevel,
    romanNumeral: ROMAN_NUMERALS[subLevel - 1],
    primaryColor: tier.primaryColor,
    gradientColor: tier.gradientColor,
    isLight: tier.isLight,
  };
}

export function getAllXpRanks(): XpRank[] {
  const ranks: XpRank[] = [];
  for (let lvl = 1; lvl <= 100; lvl++) {
    ranks.push(getXpRank(lvl));
  }
  return ranks;
}

export function getNextXpRank(level: number): XpRank | null {
  if (level >= 100) return null;
  return getXpRank(level + 1);
}

export function formatRankLabel(rank: XpRank): string {
  return rank.tierName + ' ' + rank.romanNumeral;
}

export function formatRankFullLabel(rank: XpRank): string {
  return (rank.tierName + ' ' + rank.romanNumeral).toUpperCase();
}
