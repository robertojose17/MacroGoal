/**
 * streakRanks.ts
 *
 * Pure utility — no React, no Supabase.
 * Maps a consecutive-day streak count to a named rank, emoji, sub-level, and motivational quote.
 */

export interface StreakRank {
  /** Emoji for the rank tier, e.g. "🌱" or "💎👑" */
  emoji: string;
  /** Human-readable tier name, e.g. "Recruit" or "Living Legend" */
  name: string;
  /** Roman-numeral sub-level within the tier, e.g. "I", "II", … "VIII", or "" if no sub-level */
  subLevel: string;
  /** Pre-formatted display label: name + (subLevel ? " " + subLevel : ""), e.g. "Recruit II" */
  fullLabel: string;
  /** Motivational quote for this tier */
  quote: string;
}

// ─── Weekly tier definitions (days 1–364) ────────────────────────────────────

interface WeeklyTier {
  startDay: number;   // inclusive
  endDay: number;     // inclusive
  emoji: string;
  name: string;
  subLevels: string[];
  quote: string;
}

/**
 * Each tier covers 4 sub-levels of 7 days each (28 days per tier),
 * except Living Legend (weekly) which has 8 sub-levels covering weeks 45–52 (days 309–364).
 */
const WEEKLY_TIERS: WeeklyTier[] = [
  { startDay: 1,   endDay: 28,  emoji: '🌱',  name: 'Recruit',       subLevels: ['I','II','III','IV'],                          quote: "Most people quit. You didn't." },
  { startDay: 29,  endDay: 56,  emoji: '⚡',  name: 'Apprentice',    subLevels: ['I','II','III','IV'],                          quote: 'Habits are starting to form.' },
  { startDay: 57,  endDay: 84,  emoji: '🔥',  name: 'Builder',       subLevels: ['I','II','III','IV'],                          quote: "You're building the foundation." },
  { startDay: 85,  endDay: 112, emoji: '💪',  name: 'Warrior',       subLevels: ['I','II','III','IV'],                          quote: 'Discipline beats motivation.' },
  { startDay: 113, endDay: 140, emoji: '🦁',  name: 'Champion',      subLevels: ['I','II','III','IV'],                          quote: 'Results are becoming visible.' },
  { startDay: 141, endDay: 168, emoji: '⚔️', name: 'Elite',         subLevels: ['I','II','III','IV'],                          quote: 'Most people never reach this level.' },
  { startDay: 169, endDay: 196, emoji: '👑',  name: 'Master',        subLevels: ['I','II','III','IV'],                          quote: "You're no longer trying. This is who you are." },
  { startDay: 197, endDay: 224, emoji: '🏆',  name: 'Titan',         subLevels: ['I','II','III','IV'],                          quote: 'People are starting to notice.' },
  { startDay: 225, endDay: 252, emoji: '💎',  name: 'Legend',        subLevels: ['I','II','III','IV'],                          quote: 'Your consistency is rare.' },
  { startDay: 253, endDay: 280, emoji: '🚀',  name: 'Icon',          subLevels: ['I','II','III','IV'],                          quote: "Others want what you've built." },
  { startDay: 281, endDay: 308, emoji: '🌟',  name: 'Immortal',      subLevels: ['I','II','III','IV'],                          quote: "You've gone further than almost everyone." },
  { startDay: 309, endDay: 364, emoji: '💎👑', name: 'Living Legend', subLevels: ['I','II','III','IV','V','VI','VII','VIII'],    quote: 'Your name is etched in iron.' },
];

// ─── Yearly tier definitions (days 365+) ─────────────────────────────────────

interface YearlyTier {
  startDay: number;   // inclusive
  endDay: number;     // inclusive (use Infinity for the last tier)
  emoji: string;
  name: string;
  quote: string;
}

const YEARLY_TIERS: YearlyTier[] = [
  { startDay: 365,  endDay: 729,        emoji: '💎',    name: 'Living Legend',    quote: "One full year. You've changed forever." },
  { startDay: 730,  endDay: 1094,       emoji: '⚔️',   name: 'Iron Will',        quote: 'Two years. Unshakeable.' },
  { startDay: 1095, endDay: 1459,       emoji: '🏆',    name: 'Discipline Titan', quote: 'Three years. A force of nature.' },
  { startDay: 1460, endDay: 1824,       emoji: '👑',    name: 'Lifestyle Master', quote: 'Four years. This IS your life.' },
  { startDay: 1825, endDay: 2189,       emoji: '🌟',    name: 'Elite of the Elite', quote: 'Five years. Beyond the rare.' },
  { startDay: 2190, endDay: 2554,       emoji: '💎🏛️', name: 'Hall of Fame',     quote: 'Six years. Permanently inscribed.' },
  { startDay: 2555, endDay: 2919,       emoji: '🔥',    name: 'Unbreakable',      quote: 'Seven years. Nothing stops you.' },
  { startDay: 2920, endDay: 3284,       emoji: '👑',    name: 'The Standard',     quote: 'Eight years. Others measure themselves against you.' },
  { startDay: 3285, endDay: 3649,       emoji: '🌟',    name: 'The Example',      quote: 'Nine years. You are the proof.' },
  { startDay: 3650, endDay: Infinity,   emoji: '🐐',    name: 'Macro Goal GOAT',  quote: 'Ten years. The greatest of all time.' },
];

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Returns the StreakRank for a given number of consecutive days.
 *
 * @param days - The current streak in days (0 or negative → "No Streak")
 */
export function getStreakRank(days: number): StreakRank {
  // Edge case: no streak
  if (days <= 0) {
    return {
      emoji: '✨',
      name: 'No Streak',
      subLevel: '',
      fullLabel: 'No Streak',
      quote: 'Start today.',
    };
  }

  // Yearly tiers (365+)
  if (days >= 365) {
    for (const tier of YEARLY_TIERS) {
      if (days >= tier.startDay && days <= tier.endDay) {
        return {
          emoji: tier.emoji,
          name: tier.name,
          subLevel: '',
          fullLabel: tier.name,
          quote: tier.quote,
        };
      }
    }
    // Fallback to last yearly tier (should never reach here)
    const last = YEARLY_TIERS[YEARLY_TIERS.length - 1];
    return {
      emoji: last.emoji,
      name: last.name,
      subLevel: '',
      fullLabel: last.name,
      quote: last.quote,
    };
  }

  // Weekly tiers (1–364)
  for (const tier of WEEKLY_TIERS) {
    if (days >= tier.startDay && days <= tier.endDay) {
      // Which sub-level within this tier?
      // Each sub-level is 7 days. Sub-level index = floor((days - startDay) / 7)
      const offsetInTier = days - tier.startDay;
      const subLevelIndex = Math.min(
        Math.floor(offsetInTier / 7),
        tier.subLevels.length - 1
      );
      const subLevel = tier.subLevels[subLevelIndex];
      const fullLabel = `${tier.name} ${subLevel}`;
      return {
        emoji: tier.emoji,
        name: tier.name,
        subLevel,
        fullLabel,
        quote: tier.quote,
      };
    }
  }

  // Should never reach here for valid input in range 1–364
  return {
    emoji: '✨',
    name: 'No Streak',
    subLevel: '',
    fullLabel: 'No Streak',
    quote: 'Start today.',
  };
}
