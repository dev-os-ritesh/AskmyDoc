/**
 * retriever.js
 * TF-IDF keyword scorer: returns the top-N chunks most relevant to a question.
 * Simple, transparent, no external dependencies.
 */

// Common words that add no signal
const STOP_WORDS = new Set([
  'a','an','the','is','it','in','on','at','to','of','and','or','but',
  'for','with','as','by','from','that','this','was','are','be','been',
  'have','has','had','not','what','which','who','how','when','where',
  'why','do','does','did','will','would','could','should','can','may',
  'might','its','their','our','your','his','her','we','they','i','me',
  'my','he','she','you','am','about','if','so','up','out','more',
]);

/** Tokenise text: lowercase, strip punctuation, remove stop words. */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Count occurrences of each token. */
function termFreq(tokens) {
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  return freq;
}

/**
 * Return the top-N chunks most relevant to the query using TF-IDF.
 *
 * @param {string} question
 * @param {{ _id: any, text: string }[]} chunks - All chunks for the document
 * @param {number} topN - How many chunks to return (default 5)
 */
export function retrieveTopChunks(question, chunks, topN = 5) {
  const queryTokens = new Set(tokenize(question));

  // If nothing meaningful in the query, just return the first N chunks
  if (queryTokens.size === 0) return chunks.slice(0, topN);

  const total = chunks.length;

  // Count in how many chunks each query term appears (for IDF)
  const docFreq = {};
  for (const chunk of chunks) {
    const seen = new Set(tokenize(chunk.text));
    for (const qt of queryTokens) {
      if (seen.has(qt)) docFreq[qt] = (docFreq[qt] || 0) + 1;
    }
  }

  // Score each chunk
  const scored = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    const tf     = termFreq(tokens);
    let score    = 0;

    for (const qt of queryTokens) {
      const tfVal = (tf[qt] || 0) / (tokens.length || 1);
      // IDF: log((N+1)/(df+1)) + 1  — smooth variant
      const idf   = Math.log((total + 1) / ((docFreq[qt] || 0) + 1)) + 1;
      score += tfVal * idf;
    }

    return { chunk, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.chunk);
}
