/**
 * validator.js
 * Parse and validate every LLM response before it reaches the user.
 * Two responsibilities:
 *   1. parseAndValidate - JSON parse + schema checks
 *   2. resolveChunks    - cross-check chunk IDs against the database
 */

/**
 * Strip markdown code fences from the raw model output, then JSON-parse it.
 * Validates the required fields and their types/values.
 *
 * @param {string} rawText - Raw string from the model
 * @returns {{ answer: string, source_chunk_ids: string[], found: boolean }}
 * @throws Error with .type = 'MALFORMED_JSON' | 'INVALID_SCHEMA'
 */
export function parseAndValidate(rawText) {
  // Remove markdown code fences the model might wrap around JSON
  const cleaned = rawText
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw Object.assign(
      new Error('Model returned malformed JSON. Please try again.'),
      { type: 'MALFORMED_JSON', raw: rawText }
    );
  }

  const { answer, source_chunk_ids, found } = parsed;

  // "found" must be a boolean
  if (typeof found !== 'boolean') {
    throw Object.assign(
      new Error('Model response is missing the required "found" boolean field.'),
      { type: 'INVALID_SCHEMA' }
    );
  }

  // If the model claims it found an answer, the answer must be non-empty
  if (found === true && (!answer || typeof answer !== 'string' || answer.trim() === '')) {
    throw Object.assign(
      new Error('Model reported found=true but provided an empty answer.'),
      { type: 'INVALID_SCHEMA' }
    );
  }

  // source_chunk_ids must be an array (may be empty when found=false)
  if (!Array.isArray(source_chunk_ids)) {
    throw Object.assign(
      new Error('Model response is missing the "source_chunk_ids" array.'),
      { type: 'INVALID_SCHEMA' }
    );
  }

  return {
    answer:          answer || '',
    source_chunk_ids,
    found,
  };
}

/**
 * Resolve model-provided chunk IDs against the real DB chunks.
 * Any ID that does not exist in the database is silently dropped —
 * this prevents the model from fabricating fake citations.
 *
 * @param {string[]} ids - chunk IDs returned by the model
 * @param {{ _id: any, text: string }[]} dbChunks - DB records for this document
 * @returns {{ _id: any, text: string }[]} Only chunks that actually exist in DB
 */
export function resolveChunks(ids, dbChunks) {
  const chunkMap = new Map(dbChunks.map((c) => [c._id.toString(), c]));
  const resolved = [];

  for (const id of ids) {
    const c = chunkMap.get(String(id));
    if (c) resolved.push(c);
    // Silently drop any ID the model invented
  }

  return resolved;
}
