/**
 * llm.js
 * Isolated Groq provider using the OpenAI-compatible SDK.
 * All LLM interactions go through callLLM(). Swap provider here only.
 *
 * Error types thrown:
 *   TIMEOUT      - request exceeded TIMEOUT_MS
 *   BAD_KEY      - 401 from Groq (invalid API key)
 *   RATE_LIMIT   - 429 from Groq (too many requests / token limit)
 *   SERVER_ERROR - 5xx from Groq (retried, still failed)
 *   UNKNOWN      - anything else
 */

import OpenAI from 'openai/index.mjs';

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const BASE_URL = 'https://api.groq.com/openai/v1';
const TIMEOUT_MS = 30_000;  // 30 seconds per request
const MAX_RETRIES = 2;       // attempts before giving up
const RETRY_DELAY = 1_500;   // base delay between retries (ms)

// Lazy client so missing key doesn't crash at import time
let _client = null;
function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: BASE_URL,
    });
  }
  return _client;
}

/** Simple promise-based delay. */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tag an error with a machine-readable type for the route handler. */
function tagged(message, type) {
  return Object.assign(new Error(message), { type });
}

/**
 * Call the Groq model with a system + user prompt.
 * Returns the raw content string from the model's message.
 * Throws a tagged Error on failure (see types above).
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
export async function callLLM(systemPrompt, userPrompt) {
  const client = getClient();
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await client.chat.completions.create(
        {
          model: MODEL,
          temperature: 0,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        },
        { signal: controller.signal }
      );

      clearTimeout(timer);
      return response.choices[0].message.content;

    } catch (err) {
      clearTimeout(timer);
      lastErr = err;

      // Timeout (AbortController fired)
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        throw tagged('Request timed out. Please try again.', 'TIMEOUT');
      }

      // Invalid API key
      if (err.status === 401) {
        throw tagged(
          'Invalid API key. Check GROQ_API_KEY in your .env file.',
          'BAD_KEY'
        );
      }

      // Rate-limited — wait, then retry
      if (err.status === 429) {
        if (attempt < MAX_RETRIES - 1) {
          await delay(RETRY_DELAY * (attempt + 1));
          continue;
        }
        throw tagged(
          'Rate limit reached. Please wait a moment and try again.',
          'RATE_LIMIT'
        );
      }

      // Server error — retry
      if (err.status >= 500) {
        if (attempt < MAX_RETRIES - 1) {
          await delay(RETRY_DELAY);
          continue;
        }
        throw tagged(
          'The Groq service is temporarily unavailable. Please try again shortly.',
          'SERVER_ERROR'
        );
      }

      // Any other error — don't retry
      throw tagged(`LLM error: ${err.message}`, 'UNKNOWN');
    }
  }

  throw tagged(lastErr?.message || 'Unknown LLM error', 'UNKNOWN');
}
