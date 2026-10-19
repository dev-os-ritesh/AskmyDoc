/**
 * routes/ask.js
 * POST /api/ask  { documentId, question }
 * Pipeline: fetch chunks → TF-IDF retrieve → build prompt →
 *           call Grok → validate JSON → resolve chunk IDs from DB →
 *           log to QaLog → respond.
 *
 * GROUNDING GUARANTEE: sources[].text always comes from MongoDB,
 * never from model output.
 */

import express from 'express';
import Chunk   from '../models/Chunk.js';
import QaLog   from '../models/QaLog.js';
import { retrieveTopChunks }          from '../services/retriever.js';
import { callLLM }                    from '../services/llm.js';
import { parseAndValidate, resolveChunks } from '../services/validator.js';

const router = express.Router();

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a document Q&A assistant. You ONLY answer questions using the numbered passages provided.

STRICT RULES:
1. Return ONLY a valid JSON object — no prose, no markdown, no code fences.
2. JSON shape must be exactly: {"answer": "...", "source_chunk_ids": [...], "found": true|false}
3. "source_chunk_ids" must list the "id" values of passages that support your answer.
4. If the answer is NOT in the passages, return: {"answer": "", "source_chunk_ids": [], "found": false}
5. NEVER use outside knowledge. NEVER invent information not in the passages.
6. If the question contains a false premise, do not validate it — answer based solely on the passages.
7. Do not include any text outside the JSON object.`;

/** Build the user-facing prompt with numbered, ID-tagged passages. */
function buildUserPrompt(question, topChunks) {
  const passages = topChunks
    .map((c, i) => `[${i + 1}] (id: ${c._id})\n${c.text}`)
    .join('\n\n');
  return `Passages:\n\n${passages}\n\nQuestion: ${question}`;
}

// ── POST /api/ask ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { documentId, question } = req.body;
  const startTime = Date.now();

  // Shared log entry — written on both success and error
  const logEntry = {
    documentId,
    question:      question || '',
    answer:        '',
    found:         false,
    sourceChunkIds:[],
    latencyMs:     0,
    error:         null,
  };

  try {
    // ── Input validation ────────────────────────────────────────────────────
    if (!documentId || !question?.trim()) {
      return res.status(400).json({ error: 'documentId and question are required.' });
    }

    // ── Fetch all chunks for this document ──────────────────────────────────
    const allChunks = await Chunk.find({ documentId }).lean();
    if (!allChunks.length) {
      return res.status(404).json({ error: 'Document not found or has no content.' });
    }

    // ── Retrieve top relevant chunks (TF-IDF) ───────────────────────────────
    const topChunks = retrieveTopChunks(question, allChunks, 5);

    // ── Call Grok ───────────────────────────────────────────────────────────
    let rawResponse = await callLLM(SYSTEM_PROMPT, buildUserPrompt(question, topChunks));

    // ── Parse + validate (retry once on bad JSON) ───────────────────────────
    let validated;
    try {
      validated = parseAndValidate(rawResponse);
    } catch (parseErr) {
      if (parseErr.type === 'MALFORMED_JSON') {
        // One retry with a nudge to fix the format
        rawResponse = await callLLM(
          SYSTEM_PROMPT + '\n\nPrevious response was not valid JSON. Return ONLY the JSON object.',
          buildUserPrompt(question, topChunks)
        );
        validated = parseAndValidate(rawResponse); // throws if still bad
      } else {
        throw parseErr;
      }
    }

    // ── Resolve chunk IDs from DB (guards against fake citations) ───────────
    const resolvedChunks = resolveChunks(validated.source_chunk_ids, allChunks);

    // ── Write QaLog ─────────────────────────────────────────────────────────
    logEntry.answer         = validated.answer;
    logEntry.found          = validated.found;
    logEntry.sourceChunkIds = resolvedChunks.map((c) => c._id);
    logEntry.latencyMs      = Date.now() - startTime;
    await QaLog.create(logEntry);

    // ── Build sources from DB text — never model output ─────────────────────
    const sources = resolvedChunks.map((c) => ({ chunkId: c._id, text: c.text }));

    return res.json({
      found:   validated.found,
      answer:  validated.answer,
      sources,
    });

  } catch (err) {
    logEntry.latencyMs = Date.now() - startTime;
    logEntry.error     = err.message;
    // Never let a log-write failure mask the real error
    await QaLog.create(logEntry).catch(() => {});

    const userMessage = err.type
      ? err.message
      : 'Something went wrong. Please try again.';

    return res.status(500).json({
      error:     userMessage,
      errorType: err.type || 'UNKNOWN',
    });
  }
});

export default router;
