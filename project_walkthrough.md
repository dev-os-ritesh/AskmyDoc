# AskMyDoc — Complete Project Walkthrough

## 1. What Problem Does This Solve?

Standard LLM chatbots answer from their training data — they can hallucinate, use outdated facts, or confidently state things that aren't in your document.

**AskMyDoc solves this** by forcing the model to answer *only* from the text you upload. Every answer cites the exact passage it came from. If the document doesn't contain the answer, the app says so rather than guessing.

**Real-world use cases:**
- Ask questions about a legal contract
- Query a product manual or technical spec
- Analyse a research paper or report
- Search inside HR policy documents

---

## 2. High-Level Architecture

```
Browser (React + Vite)
       │
       │  /api/documents  (upload .txt or .pdf)
       │  /api/ask        (question → answer + sources)
       ▼
Express Server (Node.js)
       │
       ├── Chunker        → splits text into ~300-word overlapping chunks
       ├── Retriever      → TF-IDF scores chunks against the question
       ├── LLM (Groq)     → answers using only the retrieved passages
       ├── Validator      → checks JSON shape + rejects fake citations
       └── QaLog          → writes every Q&A to MongoDB for audit
       │
       ▼
MongoDB (Mongoose)
  Document | Chunk | QaLog
```

**Key design rule:** The React client never contacts Groq directly. It only talks to Express. Vite proxies `/api` → `http://localhost:5000`, so no API key ever touches the browser.

---

## 3. Folder Structure (Every File Explained)

```
doc-qa/
├── server/
│   ├── index.js                  Entry point
│   ├── .env / .env.example       Secrets (never committed)
│   ├── package.json              Server dependencies
│   │
│   ├── routes/
│   │   ├── documents.js          POST /api/documents
│   │   └── ask.js                POST /api/ask
│   │
│   ├── services/
│   │   ├── chunker.js            Text → overlapping chunks
│   │   ├── retriever.js          TF-IDF keyword scoring
│   │   ├── llm.js                Groq API wrapper
│   │   └── validator.js          JSON parse + schema checks
│   │
│   ├── models/
│   │   ├── Document.js           Document metadata
│   │   ├── Chunk.js              Individual text chunks
│   │   └── QaLog.js              Audit log
│   │
│   └── tests/
│       ├── eval.js               28-test evaluation suite
│       ├── diag.js               API connectivity tester
│       └── sample.txt            NovaTech sample document
│
└── client/
    ├── index.html                SEO meta tags + Inter font
    ├── vite.config.js            /api proxy to Express
    ├── package.json              Client dependencies
    └── src/
        ├── main.jsx              React entry point
        ├── index.css             Full design system (dark glassmorphism)
        ├── App.jsx               Root state + view switching
        └── components/
            ├── UploadBox.jsx     Drag-and-drop upload (.txt + .pdf)
            ├── AskForm.jsx       Question input form
            ├── AnswerCard.jsx    Answer / not-found / error display
            └── SourcePanel.jsx   Cited passages from the database
```

---

## 4. The Upload Pipeline

### Step 1 — File Upload (`routes/documents.js`)

```
User drops file → multer buffers it in memory → extractText() → chunkText() → MongoDB
```

- **multer** receives the file in memory (no disk writes)
- Accepts `.txt` (plain text) and `.pdf` (via `pdf-parse`)
- **PDF extraction**: `pdf-parse` reads the buffer and returns the raw text content. Scanned/image PDFs won't work — only PDFs with selectable text.
- File size limit: **10 MB**

### Step 2 — Chunking (`services/chunker.js`)

**Why chunk?** LLMs have token limits. Sending an entire 50-page document in one prompt is expensive and slow. More importantly, chunking lets us *retrieve only the relevant parts*.

**How it works:**
- Split the full text into words
- Take windows of **300 words** at a time
- Each consecutive chunk **overlaps by 50 words** with the previous one

**Why overlap?** If an answer spans a chunk boundary, overlap ensures the context isn't lost. A sentence at the end of chunk 2 also appears at the start of chunk 3.

```
Words: [1 ... 300] [251 ... 550] [501 ... 800] ...
          chunk 0      chunk 1       chunk 2
              ↑ 50-word overlap ↑
```

### Step 3 — Storage (`models/`)

Three Mongoose models:

| Model | Fields | Purpose |
|-------|--------|---------|
| `Document` | filename, uploadedAt, chunkCount | Tracks uploaded files |
| `Chunk` | documentId, index, text | The actual text segments |
| `QaLog` | documentId, question, answer, found, sourceChunkIds, latencyMs, error | Full audit trail |

All chunks are bulk-inserted (`Chunk.insertMany`) in a single database call.

---

## 5. The Question → Answer Pipeline

```
POST /api/ask
  { documentId, question }
        │
        ├── 1. Fetch ALL chunks for this document from MongoDB
        ├── 2. TF-IDF score each chunk against the question
        ├── 3. Take top 5 chunks → build prompt
        ├── 4. Call Groq (LLM) → raw JSON string
        ├── 5. Parse + validate JSON
        │      ├── If malformed → retry once
        │      └── If still malformed → throw MALFORMED_JSON error
        ├── 6. Resolve chunk IDs from MongoDB (drop any fake IDs)
        ├── 7. Write QaLog
        └── 8. Return { found, answer, sources: [{ chunkId, text }] }
```

### Step A — TF-IDF Retrieval (`services/retriever.js`)

**Why not send all chunks?** If a document has 100 chunks × 300 words = 30,000 words, that's enormous and expensive. We only send the 5 most relevant.

**How TF-IDF works:**
- **TF (Term Frequency)**: how often a query word appears in a chunk, normalised by chunk length
- **IDF (Inverse Document Frequency)**: words that appear in many chunks are less distinctive → lower weight
- Each chunk gets a score = sum of `TF × IDF` for every query word
- Top 5 chunks by score are sent to the model

**Stop words** (a, the, is, in, etc.) are filtered out before scoring — they add noise.

### Step B — The Strict Prompt (`routes/ask.js`)

The system prompt enforces five rules:

1. Return **only** a JSON object — no prose, no markdown
2. JSON shape: `{ "answer": "...", "source_chunk_ids": [...], "found": true|false }`
3. Source IDs must be chunk IDs from the provided passages
4. If not found → `{ "answer": "", "source_chunk_ids": [], "found": false }`
5. Never use outside knowledge. Don't validate false premises.

The user prompt injects the top 5 chunks as numbered, ID-tagged passages:

```
Passages:

[1] (id: 64abc...) NovaTech was founded in 2019...

[2] (id: 64def...) The Series B round of $85 million...

Question: When was NovaTech founded?
```

### Step C — Validation (`services/validator.js`)

**Why validate?** LLMs can return malformed JSON, omit required fields, or claim `found=true` with an empty answer. We reject all of these.

Checks performed:
1. Strip any markdown code fences the model might add
2. `JSON.parse()` — if it fails → `MALFORMED_JSON` error → **retry once**
3. `found` must be a boolean
4. If `found=true` → `answer` must be a non-empty string
5. `source_chunk_ids` must be an array

### Step D — Grounding Guarantee (`resolveChunks`)

**This is the most important security step.**

The model returns chunk IDs like `["64abc...", "64def..."]`. We look up each ID in MongoDB. Any ID that doesn't exist in the database is **silently dropped**.

This means: even if the model fabricates a fake citation or tries to inject a non-existent source, the user only ever sees text that came from their actual document. The `sources[].text` in the API response is **always read from MongoDB**, never from the model's output.

---

## 6. The LLM Provider (`services/llm.js`)

All AI calls are isolated in one file. Swapping providers means only editing this file.

**Current provider: Groq** (OpenAI-compatible API)
- Base URL: `https://api.groq.com/openai/v1`
- Model: `openai/gpt-oss-120b` (available on the free tier)
- Uses the `openai` npm package, just pointed at Groq's endpoint

**Error handling matrix:**

| HTTP Status | Error Type | User Message |
|-------------|-----------|--------------|
| `AbortError` | `TIMEOUT` | Request timed out. Please try again. |
| `401` | `BAD_KEY` | Invalid API key. Check GROQ_API_KEY in your .env file. |
| `429` | `RATE_LIMIT` | Rate limit reached. Wait a moment. (retried first) |
| `5xx` | `SERVER_ERROR` | Service temporarily unavailable. (retried first) |
| other | `UNKNOWN` | LLM error: [message] |

**Retry logic:** Rate limits and server errors are retried up to 2 times with a 1.5-second delay. JSON parse failures trigger one more LLM call with a corrective prompt nudge.

---

## 7. The React UI

### View 1 — Upload (`UploadBox.jsx`)
- Drag-and-drop zone or click-to-browse
- Accepts `.txt` and `.pdf`
- Shows filename + size on selection
- On success → switches to Ask view, passes `documentId` up to `App`

### View 2 — Ask (`AskForm.jsx`)
- Textarea with Ctrl+Enter shortcut
- Shows active document name as a pill
- "New document" button resets to upload view

### Answer Display
- **`AnswerCard`** — three states:
  - `found=true` → green badge + answer text
  - `found=false` → amber badge + "Document doesn't contain this" message
  - `error` → red badge + friendly error message
- **`SourcePanel`** — lists each cited passage with a purple left border, labelled "Passage 1", "Passage 2", etc. A footer note reminds users these passages come from the document, not AI.

### `App.jsx` — State Management
```
documentId    null → set after upload → reset on "New document"
documentName  filename shown in the pill
result        { found, answer, sources } from /api/ask
asking        boolean → shows loading spinner
askError      string → shown in AnswerCard error state
```

---

## 8. Provider History

During development we tried several providers before settling on Groq:

| Provider | Issue |
|----------|-------|
| xAI (Grok) | Key format `grok_` not accepted by `api.x.ai` — needs `xai-` prefix |
| Google Gemini | Key `AQ.` prefix was an OAuth token, not an API key (`AIzaSy` prefix needed) |
| DeepSeek | API key was valid but account had zero balance (HTTP 402) |
| **Groq** | ✅ Free, API key valid, model `openai/gpt-oss-120b` confirmed working |

The `llm.js` isolation made every switch a 20-line change.

---

## 9. Security Principles

| Rule | Implementation |
|------|---------------|
| No secrets in client | Vite proxies `/api` → Express. React never sees the API key. |
| No hardcoded keys | All secrets in `.env`, never committed (`gitignore`) |
| Model output untrusted | Source text always read from MongoDB, not from LLM response |
| Fake citations blocked | `resolveChunks()` silently drops IDs not in DB |
| Schema enforced | `validator.js` rejects missing/wrong fields before any response |
| File type enforced | multer rejects non-.txt/.pdf at the server level |
| File size capped | 10 MB max prevents abuse |

---

## 10. MongoDB Audit Log (`QaLog`)

Every single question is logged with:

| Field | Example |
|-------|---------|
| `documentId` | ObjectId of the document |
| `question` | "When was NovaTech founded?" |
| `answer` | "NovaTech was founded in 2019." |
| `found` | `true` |
| `sourceChunkIds` | `[ObjectId(...)]` |
| `latencyMs` | `1243` |
| `error` | `null` (or error message if failed) |
| `createdAt` | timestamp |

This lets you review all past queries, measure accuracy, and debug issues without touching the LLM again.

---

## 11. The Test Suite (`tests/eval.js`)

28 tests in two parts:

### Part A — Live API Tests (requires running server)
Uploads `sample.txt` (NovaTech fictional company), then:

| Category | Count | What's checked |
|----------|-------|----------------|
| Answerable | 9 | `found=true` + answer contains the expected keyword |
| Unanswerable | 4 | `found=false` returned correctly |
| False premise | 2 | Model doesn't validate a wrong fact in the question |

### Part B — Validator Unit Tests (no server needed)
| Test | What's verified |
|------|----------------|
| Valid JSON parsed | Returns correct fields |
| Malformed JSON | Throws `MALFORMED_JSON` type |
| `found=true` + empty answer | Throws `INVALID_SCHEMA` |
| Missing `found` field | Throws `INVALID_SCHEMA` |
| Missing `source_chunk_ids` | Throws `INVALID_SCHEMA` |
| Markdown fence stripping | Parsed correctly |
| Fake chunk IDs dropped | Only real IDs resolved |
| All real IDs resolved | Count matches |
| `found=false` + empty answer | Accepted as valid |
| Error type tagging | BAD_KEY / RATE_LIMIT / SERVER_ERROR correct |

Run:
```bash
# Full suite (server must be running)
cd server && npm test

# Unit tests only (no server/key needed)
cd server && SKIP_LIVE=1 npm test
```

---

## 12. How to Run Everything

```bash
# 1. Install dependencies
cd doc-qa/server && npm install
cd doc-qa/client && npm install

# 2. Set up environment
cd doc-qa/server
copy .env.example .env
# Edit .env: add GROQ_API_KEY, MONGODB_URI

# 3. Verify API connectivity
node tests/diag.js

# 4. Start server (Terminal 1)
cd doc-qa/server && npm run dev

# 5. Start client (Terminal 2)
cd doc-qa/client && npm run dev

# 6. Open browser
# http://localhost:5173

# 7. Run tests
cd doc-qa/server && npm test
```

---

## 13. Data Flow Summary (End-to-End)

```
1. User uploads report.pdf
2. Server extracts text (pdf-parse) → 12 chunks stored in MongoDB
3. API returns documentId: "64abc..."

4. User types: "What is the refund policy?"
5. Server fetches all 12 chunks from MongoDB
6. TF-IDF ranks chunks → top 5 selected (those mentioning "refund")
7. Prompt built: [5 numbered passages] + question
8. Groq returns: {"answer":"30-day refund...","source_chunk_ids":["64def..."],"found":true}
9. Validator checks: JSON valid ✓, found=true with non-empty answer ✓, array present ✓
10. resolveChunks: "64def..." exists in DB ✓ → chunk text fetched
11. QaLog written: question, answer, found=true, latency=1200ms, error=null
12. Response: { found: true, answer: "30-day refund...", sources: [{ chunkId, text: "...the actual passage..." }] }
13. React displays answer card (green) + source panel with the DB text
```

The answer the user reads comes from the LLM. The source passage they see comes from MongoDB. These are two separate things by design.
