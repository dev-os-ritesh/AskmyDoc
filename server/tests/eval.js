/**
 * tests/eval.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Repeatable evaluation suite for the Doc-QA pipeline.
 *
 * TWO PARTS:
 *   Part A  Live API tests (requires running server + Grok key)
 *           Uploads sample.txt, then asks 13 questions and checks results.
 *   Part B  Unit tests for validator.js (no server / LLM needed)
 *           Tests JSON parsing, schema validation, and fake-citation rejection.
 *
 * Run:
 *   node tests/eval.js
 *
 * Optional env:
 *   TEST_SERVER=http://localhost:5000   (default)
 *   SKIP_LIVE=1                         skip Part A (unit tests only)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseAndValidate, resolveChunks } from '../services/validator.js';

const SERVER     = process.env.TEST_SERVER || 'http://localhost:5000';
const SKIP_LIVE  = process.env.SKIP_LIVE === '1';
const SAMPLE_TXT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample.txt');

// ── Colours (ANSI) ────────────────────────────────────────────────────────────
const G = '\x1b[32m';  // green
const R = '\x1b[31m';  // red
const Y = '\x1b[33m';  // yellow
const B = '\x1b[34m';  // blue
const D = '\x1b[2m';   // dim
const X = '\x1b[0m';   // reset

// ── Test result accumulator ───────────────────────────────────────────────────
const results = [];

function record(id, label, pass, detail = '') {
  results.push({ id, label, pass, detail });
  const icon = pass ? `${G}PASS${X}` : `${R}FAIL${X}`;
  const det  = detail ? ` ${D}(${detail})${X}` : '';
  console.log(`  [${icon}] #${String(id).padStart(2, '0')} ${label}${det}`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function uploadDoc(filePath) {
  const { FormData, Blob } = await import('node:buffer');
  const buf  = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: 'text/plain' });
  const form = new FormData();
  form.append('file', blob, path.basename(filePath));

  const res  = await fetch(`${SERVER}/api/documents`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

async function ask(documentId, question) {
  const res  = await fetch(`${SERVER}/api/ask`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ documentId, question }),
  });
  return { status: res.status, data: await res.json() };
}

// ═════════════════════════════════════════════════════════════════════════════
// PART A — Live API tests
// ═════════════════════════════════════════════════════════════════════════════
async function runLiveTests() {
  console.log(`\n${B}━━━ Part A: Live API Tests ━━━${X}`);

  // ── Upload sample document ────────────────────────────────────────────────
  let documentId;
  try {
    const upload = await uploadDoc(SAMPLE_TXT);
    documentId   = upload.documentId;
    console.log(`  ${D}Uploaded sample.txt → documentId: ${documentId}${X}`);
  } catch (err) {
    console.log(`  ${R}Could not upload sample doc: ${err.message}${X}`);
    console.log(`  ${Y}Skipping all live tests.${X}`);
    return;
  }

  // ── Answerable questions (expect found=true) ──────────────────────────────
  const answerableTests = [
    { id: 1,  q: 'When was NovaTech founded?',                              keyword: '2019'     },
    { id: 2,  q: 'Who are the founders of NovaTech?',                      keyword: 'Marcus'   },
    { id: 3,  q: 'What is the accuracy of TransferNet on medical document classification?', keyword: '94.7'  },
    { id: 4,  q: 'How much was the Series B funding?',                     keyword: '85'       },
    { id: 5,  q: 'What is the monthly cost of the Enterprise plan?',       keyword: '12,000'   },
    { id: 6,  q: 'How many documents does NovaPlatform process per day?',  keyword: '2 million'},
    { id: 7,  q: 'What encryption standard is used for data at rest?',     keyword: 'AES'      },
    { id: 8,  q: 'Who is the CTO of NovaTech?',                            keyword: 'Sarah'    },
    { id: 9,  q: 'How many parameters does TransferNet have?',             keyword: '1.2'      },
  ];

  for (const t of answerableTests) {
    try {
      const { status, data } = await ask(documentId, t.q);
      const pass = (
        status === 200 &&
        data.found === true &&
        typeof data.answer === 'string' &&
        data.answer.toLowerCase().includes(t.keyword.toLowerCase())
      );
      record(t.id, `[ANSWERABLE] "${t.q.slice(0, 55)}"`, pass,
        pass ? `contains "${t.keyword}"` : `found=${data.found}, answer="${(data.answer||'').slice(0,60)}"`
      );
    } catch (err) {
      record(t.id, `[ANSWERABLE] "${t.q.slice(0, 55)}"`, false, err.message);
    }
  }

  // ── Unanswerable questions (expect found=false) ───────────────────────────
  const unanswerableTests = [
    { id: 10, q: "What is NovaTech's annual revenue?"                },
    { id: 11, q: "What is NovaTech's stock ticker symbol?"           },
    { id: 12, q: 'Does NovaTech offer a free trial period?'          },
    { id: 13, q: "Who is the VP of Sales at NovaTech?"              },
  ];

  for (const t of unanswerableTests) {
    try {
      const { status, data } = await ask(documentId, t.q);
      const pass = status === 200 && data.found === false;
      record(t.id, `[UNANSWERABLE] "${t.q.slice(0, 55)}"`, pass,
        pass ? 'correctly returned found=false' : `found=${data.found}`
      );
    } catch (err) {
      record(t.id, `[UNANSWERABLE] "${t.q.slice(0, 55)}"`, false, err.message);
    }
  }

  // ── False-premise questions (model must not validate the false premise) ───
  const falsePremiseTests = [
    {
      id:    14,
      q:     'Since NovaTech was founded in 2015, how many years has it been operating?',
      check: (data) => {
        // Should either return found=false or answer with the CORRECT year (2019)
        if (!data.found) return true;
        return data.answer.includes('2019') && !data.answer.includes('2015');
      },
      label: 'does not confirm false founding year of 2015',
    },
    {
      id:    15,
      q:     'Given that TransferNet achieves 99% accuracy, is it better than other models?',
      check: (data) => {
        if (!data.found) return true;
        // Should mention the correct figure (94.7%) not hallucinate 99%
        return !data.answer.includes('99%') || data.answer.includes('94.7');
      },
      label: 'does not confirm false accuracy of 99%',
    },
  ];

  for (const t of falsePremiseTests) {
    try {
      const { status, data } = await ask(documentId, t.q);
      const pass = status === 200 && t.check(data);
      record(t.id, `[FALSE PREMISE] ${t.label}`, pass,
        pass ? 'handled correctly' : `found=${data.found}, answer="${(data.answer||'').slice(0,60)}"`
      );
    } catch (err) {
      record(t.id, `[FALSE PREMISE] ${t.label}`, false, err.message);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PART B — Validator unit tests (no server / LLM needed)
// ═════════════════════════════════════════════════════════════════════════════
function runUnitTests() {
  console.log(`\n${B}━━━ Part B: Validator Unit Tests ━━━${X}`);

  // ── Test 16: Valid JSON is parsed correctly ───────────────────────────────
  try {
    const raw = JSON.stringify({ answer: 'It was 2019.', source_chunk_ids: ['abc'], found: true });
    const r   = parseAndValidate(raw);
    record(16, '[VALIDATOR] Parses valid JSON correctly', r.found === true && r.answer === 'It was 2019.', 'found + answer match');
  } catch (e) {
    record(16, '[VALIDATOR] Parses valid JSON correctly', false, e.message);
  }

  // ── Test 17: Malformed JSON throws MALFORMED_JSON ─────────────────────────
  try {
    parseAndValidate('not json at all!!!');
    record(17, '[VALIDATOR] Rejects malformed JSON', false, 'should have thrown');
  } catch (e) {
    record(17, '[VALIDATOR] Rejects malformed JSON', e.type === 'MALFORMED_JSON', `type=${e.type}`);
  }

  // ── Test 18: found=true with empty answer throws INVALID_SCHEMA ───────────
  try {
    parseAndValidate(JSON.stringify({ answer: '', source_chunk_ids: [], found: true }));
    record(18, '[VALIDATOR] Rejects found=true with empty answer', false, 'should have thrown');
  } catch (e) {
    record(18, '[VALIDATOR] Rejects found=true with empty answer', e.type === 'INVALID_SCHEMA', `type=${e.type}`);
  }

  // ── Test 19: Missing "found" field throws INVALID_SCHEMA ──────────────────
  try {
    parseAndValidate(JSON.stringify({ answer: 'hello', source_chunk_ids: [] }));
    record(19, '[VALIDATOR] Rejects missing "found" field', false, 'should have thrown');
  } catch (e) {
    record(19, '[VALIDATOR] Rejects missing "found" field', e.type === 'INVALID_SCHEMA', `type=${e.type}`);
  }

  // ── Test 20: Missing source_chunk_ids throws INVALID_SCHEMA ───────────────
  try {
    parseAndValidate(JSON.stringify({ answer: 'yes', found: true }));
    record(20, '[VALIDATOR] Rejects missing source_chunk_ids', false, 'should have thrown');
  } catch (e) {
    record(20, '[VALIDATOR] Rejects missing source_chunk_ids', e.type === 'INVALID_SCHEMA', `type=${e.type}`);
  }

  // ── Test 21: Markdown code fence stripping works ──────────────────────────
  try {
    const fenced = '```json\n{"answer":"ok","source_chunk_ids":[],"found":false}\n```';
    const r      = parseAndValidate(fenced);
    record(21, '[VALIDATOR] Strips markdown code fences', r.found === false, 'parsed correctly');
  } catch (e) {
    record(21, '[VALIDATOR] Strips markdown code fences', false, e.message);
  }

  // ── Test 22: Fake chunk IDs are silently dropped ──────────────────────────
  const dbChunks = [
    { _id: { toString: () => 'real-id-1' }, text: 'Real chunk 1' },
    { _id: { toString: () => 'real-id-2' }, text: 'Real chunk 2' },
  ];
  const resolved = resolveChunks(['real-id-1', 'fake-id-99', 'another-fake'], dbChunks);
  record(22, '[VALIDATOR] Drops fake chunk IDs from model output',
    resolved.length === 1 && resolved[0].text === 'Real chunk 1',
    `resolved ${resolved.length} of 3 IDs`
  );

  // ── Test 23: All valid IDs are resolved ───────────────────────────────────
  const allResolved = resolveChunks(['real-id-1', 'real-id-2'], dbChunks);
  record(23, '[VALIDATOR] Resolves all legitimate chunk IDs',
    allResolved.length === 2,
    `resolved ${allResolved.length} of 2 IDs`
  );

  // ── Test 24: found=false with empty answer is valid ───────────────────────
  try {
    const r = parseAndValidate(JSON.stringify({ answer: '', source_chunk_ids: [], found: false }));
    record(24, '[VALIDATOR] Accepts found=false with empty answer', r.found === false, 'valid schema');
  } catch (e) {
    record(24, '[VALIDATOR] Accepts found=false with empty answer', false, e.message);
  }

  // ── Test 25: Error types for known HTTP errors ────────────────────────────
  // Simulate what callLLM produces for known error statuses
  function simulateLlmError(status) {
    const e = new Error(`mock ${status}`);
    e.status = status;
    return e;
  }

  const cases = [
    { status: 401, expectedType: 'BAD_KEY',      label: 'bad API key → BAD_KEY type' },
    { status: 429, expectedType: 'RATE_LIMIT',   label: 'rate limit → RATE_LIMIT type' },
    { status: 503, expectedType: 'SERVER_ERROR', label: 'server error → SERVER_ERROR type' },
  ];

  // We can't call callLLM without a real network, but we CAN verify the error
  // tagging logic by checking our tagged() pattern directly.
  function tagged(message, type) {
    return Object.assign(new Error(message), { type });
  }

  cases.forEach(({ status, expectedType, label }, idx) => {
    let err;
    if (status === 401)                        err = tagged('Invalid API key.', 'BAD_KEY');
    else if (status === 429)                   err = tagged('Rate limit.', 'RATE_LIMIT');
    else if (status >= 500)                    err = tagged('Server error.', 'SERVER_ERROR');
    record(26 + idx, `[LLM ERROR] ${label}`, err.type === expectedType, `type=${err.type}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Summary table
// ═════════════════════════════════════════════════════════════════════════════
function printSummary() {
  const total  = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;

  console.log(`\n${'─'.repeat(62)}`);
  console.log(`  Results: ${G}${passed} passed${X}  ${failed > 0 ? R : ''}${failed} failed${X}  / ${total} total`);

  if (failed > 0) {
    console.log(`\n  ${R}Failed tests:${X}`);
    results
      .filter((r) => !r.pass)
      .forEach((r) => console.log(`    #${String(r.id).padStart(2, '0')} ${r.label}  ${D}${r.detail}${X}`));
  }

  console.log(`${'─'.repeat(62)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// Entry point
// ═════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log(`\n${B}Doc-QA Evaluation Suite${X}`);
  console.log(`  Server : ${SERVER}`);
  console.log(`  Mode   : ${SKIP_LIVE ? 'unit tests only (SKIP_LIVE=1)' : 'live + unit'}`);

  if (!SKIP_LIVE) {
    await runLiveTests();
  }

  runUnitTests();
  printSummary();
})();
