/**
 * chunker.js
 * Splits raw document text into overlapping chunks of ~200-400 words.
 * Overlap ensures context at chunk boundaries is not lost.
 */

const TARGET_WORDS  = 300;  // aim for this many words per chunk
const OVERLAP_WORDS = 50;   // words shared between consecutive chunks

/**
 * @param {string} text - Raw document text
 * @returns {{ index: number, text: string }[]} Array of chunk objects
 */
export function chunkText(text) {
  // Normalise whitespace then split into word tokens
  const words = text.trim().split(/\s+/);

  if (words.length === 0) return [];

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + TARGET_WORDS, words.length);

    chunks.push({
      index: chunks.length,
      text:  words.slice(start, end).join(' '),
    });

    // If we just captured the last word, stop
    if (end === words.length) break;

    // Advance by (TARGET - OVERLAP) so the next chunk shares OVERLAP words
    start += TARGET_WORDS - OVERLAP_WORDS;
  }

  return chunks;
}
