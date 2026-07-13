// Lightweight fuzzy name matching to detect when an imported draft likely
// refers to a product already in the catalog — so the merchant can choose
// "update existing" instead of blindly creating a duplicate. Deterministic,
// client-side, no AI.

/** Normalize a product name for comparison: lowercase, strip punctuation,
 *  collapse whitespace. Keeps Arabic/Latin letters and digits. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token-set Jaccard similarity of two normalized names (0-1). */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const sa = new Set(na.split(" "));
  const sb = new Set(nb.split(" "));
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const MATCH_THRESHOLD = 0.6;

/**
 * Find the best existing product whose name closely matches `draftName`, or
 * null when none clears the similarity threshold.
 */
export function findDuplicate(
  draftName: string,
  existing: { id: string; name: string }[]
): { id: string; name: string } | null {
  let best: { id: string; name: string } | null = null;
  let bestScore = MATCH_THRESHOLD;
  for (const p of existing) {
    const score = similarity(draftName, p.name);
    if (score >= bestScore) {
      bestScore = score;
      best = { id: p.id, name: p.name };
    }
  }
  return best;
}
