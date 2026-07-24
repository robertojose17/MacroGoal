
/**
 * utils/stringUtils.ts
 * Pure string manipulation helpers with zero dependencies.
 * Kept dependency-free to avoid circular import issues in the production bundle.
 */

/**
 * Naively singularize a food unit word.
 * "cookies" → "cookie", "slices" → "slice", "pieces" → "piece"
 */
export function singularizeUnit(word: string): string {
  if (!word || word.length <= 3) return word;
  if (word === 'serving' || word === 'servings') return 'serving';
  if (word.endsWith('ies') && word.length > 4) {
    const stem = word.slice(0, -3); // strip 'ies': "berr", "cook", "brown", "cand"
    const vowels = 'aeiou';
    const lastChar = stem[stem.length - 1] || '';
    const secondLastChar = stem.length >= 2 ? stem[stem.length - 2] : '';
    // Doubled consonant at end of stem → y→ies pattern (berry→berr+ies, cherry→cherr+ies)
    if (lastChar === secondLastChar && lastChar && !vowels.includes(lastChar)) {
      return stem + 'y'; // "berr" → "berry", "cherr" → "cherry"
    }
    // Stem ends in vowel+consonant → "ie" base word (cookie: stem="cook", calorie: stem="calor")
    if (vowels.includes(secondLastChar.toLowerCase())) {
      return word.slice(0, -1); // drop 's' → "cookie", "calorie"
    }
    // Stem ends in common consonant clusters that form "ie" words (brownie: "wn", smoothie: "th")
    const ieConsonantClusters = ['wn', 'th', 'sh', 'ch', 'gh', 'ph'];
    if (ieConsonantClusters.some(c => stem.endsWith(c))) {
      return word.slice(0, -1); // drop 's' → "brownie", "smoothie"
    }
    // Default: apply ies→y (candy→cand+y, pastry→pastr+y)
    return stem + 'y';
  }
  if (word.endsWith('es') && word.length > 4 && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}
