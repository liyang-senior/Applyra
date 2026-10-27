/**
 * Export-only tweaks so a job title row is less likely to sit alone at a page foot
 * while the company line + bullets start on the next page.
 *
 * Does not edit profile JSON. Splits existing bullets at ". " (same facts, two lines)
 * to add vertical slack before the next role when lines are long enough.
 */

function wordCount(s) {
  return String(s ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Split `text` at ". " after at least `minWordsBeforeSplit` words, with each part
 * having at least `minPartWords`. Returns [a, b] or null.
 */
function splitAtSentenceMid(
  text,
  { minTotalWords, minWordsBeforeSplit, minPartWords }
) {
  const t = String(text ?? "").trim();
  if (wordCount(t) < minTotalWords) return null;

  const target = Math.floor(wordCount(t) / 2);
  let words = 0;
  let splitAt = -1;
  for (let i = 0; i < t.length; i++) {
    if (i > 0 && /\s/.test(t[i]) && !/\s/.test(t[i - 1])) words += 1;
    if (
      words >= Math.max(minWordsBeforeSplit, target) &&
      t.slice(i, i + 2) === ". "
    ) {
      splitAt = i + 1;
      break;
    }
  }
  if (splitAt === -1) return null;
  const part1 = t.slice(0, splitAt).trim();
  const part2 = t.slice(splitAt + 1).trim();
  if (wordCount(part1) < minPartWords || wordCount(part2) < minPartWords) {
    return null;
  }
  return [part1, part2];
}

function applySplit(lines, idx, parts) {
  const next = [...lines];
  next.splice(idx, 1, parts[0], parts[1]);
  return next;
}

/**
 * Prefer splitting the longest line in `experience[0]`; if none qualify, split the
 * last line (often the final bullet before the next job) when it is still long.
 */
export function splitLongestDetailInFirstRoleForPageFlow(mergedDetails) {
  if (!Array.isArray(mergedDetails) || mergedDetails.length < 2) {
    return mergedDetails;
  }
  const first = mergedDetails[0];
  if (!Array.isArray(first) || first.length < 2) return mergedDetails;

  let bestIdx = -1;
  let bestWords = 0;
  first.forEach((line, i) => {
    const w = wordCount(line);
    if (w > bestWords) {
      bestWords = w;
      bestIdx = i;
    }
  });
  if (bestIdx < 0) return mergedDetails;

  const longestParts = splitAtSentenceMid(first[bestIdx], {
    minTotalWords: 64,
    minWordsBeforeSplit: 28,
    minPartWords: 22,
  });
  if (longestParts) {
    return [applySplit(first, bestIdx, longestParts), ...mergedDetails.slice(1)];
  }

  const lastIdx = first.length - 1;
  const lastParts = splitAtSentenceMid(first[lastIdx], {
    minTotalWords: 46,
    minWordsBeforeSplit: 18,
    minPartWords: 18,
  });
  if (lastParts) {
    return [applySplit(first, lastIdx, lastParts), ...mergedDetails.slice(1)];
  }

  return mergedDetails;
}
