// src/lib/fuzzy-search.ts — Fuzzy matching for chats & messages

export interface FuzzyResult<T> {
  item: T
  score: number
  matches: number[] // indices of matched characters
}

/**
 * Simple fuzzy matcher.  Scores higher when consecutive characters match.
 *
 * @param items    Array of items to search.
 * @param query    Lower-case query string.
 * @param getText  Function that returns the searchable text for an item.
 * @returns        Results sorted by score (best first).
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  getText: (item: T) => string,
): FuzzyResult<T>[] {
  if (!query) {
    return items.map((item) => ({ item, score: 0, matches: [] }))
  }

  const q = query.toLowerCase()
  const results: FuzzyResult<T>[] = []

  for (const item of items) {
    const text = getText(item).toLowerCase()
    const matchResult = scoreFuzzy(text, q)
    if (matchResult.matched) {
      results.push({ item, score: matchResult.score, matches: matchResult.indices })
    }
  }

  // Higher score = better match (more consecutive, earlier matches)
  results.sort((a, b) => b.score - a.score)
  return results
}

interface FuzzyScore {
  matched: boolean
  score: number
  indices: number[]
}

function scoreFuzzy(text: string, query: string): FuzzyScore {
  const indices: number[] = []
  let textIdx = 0
  let queryIdx = 0
  let score = 0
  let lastMatchIdx = -1
  let consecutiveBonus = 0

  while (textIdx < text.length && queryIdx < query.length) {
    const tChar = text[textIdx]
    const qChar = query[queryIdx]

    if (tChar === qChar) {
      indices.push(textIdx)
      queryIdx++

      // Consecutive match bonus
      if (lastMatchIdx >= 0 && textIdx === lastMatchIdx + 1) {
        consecutiveBonus += 10
        score += 10 + consecutiveBonus
      } else {
        consecutiveBonus = 0
        score += 5
      }

      // Earlier match bonus
      score += Math.max(0, 20 - textIdx)

      lastMatchIdx = textIdx
    }

    textIdx++
  }

  if (queryIdx < query.length) {
    return { matched: false, score: 0, indices: [] }
  }

  // Penalize long texts (shorter = better)
  score -= text.length * 0.5

  return { matched: true, score, indices }
}
