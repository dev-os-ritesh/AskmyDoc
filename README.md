# AskMyDoc — AI Document Q&A Assistant

> Upload a document. Ask questions. Get answers grounded **only** in your document — with the exact source passage cited.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-blue?style=flat-square&logo=react)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-brightgreen?style=flat-square&logo=mongodb)](https://mongodb.com)
[![Groq](https://img.shields.io/badge/LLM-Groq-orange?style=flat-square)](https://console.groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## ✨ What It Does

AskMyDoc lets you upload any `.txt` or `.pdf` file and ask natural language questions about it. Unlike generic AI chatbots, it **never guesses** — every answer is:

- ✅ Grounded strictly in your uploaded document
- ✅ Backed by the exact source passage from the file
- ✅ Honest about what it doesn't know ("Not found in document")

---

## 🖥️ Demo

```
User: Upload: annual_report.pdf

User: What was the revenue in Q3?
AI:   Revenue in Q3 was $4.2 billion, up 12% YoY.
      Source: "...Q3 revenues reached $4.2B, representing a 12% increase..."
```

---

## 🏗️ Architecture

```
Browser (React + Vite)
    │
    ├── POST /api/documents  → Upload + chunk document
    └── POST /api/ask        → Question → answer + sources
             │
        Express Server (Node.js)
             ├── Chunker    → 300-word overlapping windows
             ├── Retriever  → TF-IDF keyword scoring
             ├── LLM        → Groq (OpenAI-compatible)
             └── Validator  → Schema check + citation grounding
             │
        MongoDB (Mongoose)
          Document · Chunk · QaLog
```

**Key guarantee:** Source text is always read from MongoDB — even if the model fabricates a citation, the user only ever sees real document text.

---

## 📂 Project Structure

```
AskmyDoc/
├── server/                    Express + Node.js backend
│   ├── index.js               Entry point
│   ├── routes/
│   │   ├── documents.js       POST /api/documents (upload)
│   │   └── ask.js             POST /api/ask (Q&A pipeline)
│   ├── services/
│   │   ├── chunker.js         Text → overlapping chunks
│   │   ├── retriever.js       TF-IDF scoring
│   │   ├── llm.js             Groq API wrapper
│   │   └── validator.js       JSON validation + citation grounding
│   ├── models/
│   │   ├── Document.js        Document metadata
│   │   ├── Chunk.js           Text segments
│   │   └── QaLog.js           Full audit log
│   ├── tests/
│   │   ├── eval.js            28-test evaluation suite
│   │   └── diag.js            API connectivity tester
│   └── .env.example           Environment variable template
│
└── client/                    React + Vite frontend
    └── src/
        ├── App.jsx            Root state + routing
        ├── index.css          Design system (PaperTrail light theme)
        └── components/
            ├── UploadBox.jsx  Drag-and-drop upload
            ├── AskForm.jsx    Question input
            ├── AnswerCard.jsx Answer display
            └── SourcePanel.jsx Source passages
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js 18+](https://nodejs.org)
- [MongoDB](https://www.mongodb.com/try/download/community) running locally, or a free [MongoDB Atlas](https://cloud.mongodb.com) cluster
- A free [Groq API key](https://console.groq.com) (no credit card needed)

### 1. Clone the repository

```bash
git clone https://github.com/dev-os-ritesh/AskmyDoc.git
cd AskmyDoc
```

### 2. Configure the server

```bash
cd server
cp .env.example .env
```

Edit `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/askmydoc
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=openai/gpt-oss-120b
PORT=5000
```

### 3. Install dependencies

```bash
# Server
cd server && npm install

# Client (open a new terminal)
cd client && npm install
```

### 4. Verify your API key

```bash
cd server
node tests/diag.js
```

You should see `✅ WORKS!` — if not, check your `GROQ_API_KEY`.

### 5. Start the app

**Terminal 1 — Server:**
```bash
cd server && npm run dev
```

**Terminal 2 — Client:**
```bash
cd client && npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** 🎉

---

## 🔧 How It Works

### Upload Pipeline

1. **File accepted** — `.txt` or `.pdf` (max 10 MB) buffered in memory via multer
2. **Text extracted** — `pdf-parse` for PDFs, direct UTF-8 decode for text files
3. **Chunked** — Split into 300-word windows with 50-word overlap to preserve context at boundaries
4. **Stored** — Document metadata + all chunks bulk-inserted into MongoDB

### Question → Answer Pipeline

1. **Retrieve** — All chunks fetched; TF-IDF scores each chunk against the question; top 5 selected
2. **Prompt** — System prompt with strict JSON-only instructions; user prompt injects the 5 passages
3. **Generate** — Groq LLM returns `{ answer, source_chunk_ids, found }`
4. **Validate** — Schema checked; JSON parse errors trigger one retry
5. **Ground** — Returned chunk IDs cross-checked against MongoDB; fake IDs silently dropped
6. **Log** — Every Q&A written to `QaLog` with latency, result, and error details

---

## 🧪 Running Tests

```bash
cd server

# Full suite (requires running server + valid API key)
npm test

# Unit tests only (no server or API key needed)
SKIP_LIVE=1 npm test
```

The eval suite covers:
- ✅ Answerable questions (correct answer + source)
- ✅ Unanswerable questions (`found: false` returned)
- ✅ False-premise questions (not validated by the model)
- ✅ Validator unit tests (JSON parse, schema checks, citation grounding)

---

## 📡 API Reference

### `POST /api/documents`

Upload and process a document.

**Request:** `multipart/form-data` with a `file` field (`.txt` or `.pdf`)

**Response:**
```json
{ "documentId": "64abc...", "chunkCount": 12 }
```

---

### `POST /api/ask`

Ask a question about an uploaded document.

**Request:**
```json
{ "documentId": "64abc...", "question": "What is the refund policy?" }
```

**Response (found):**
```json
{
  "found": true,
  "answer": "The refund policy allows returns within 30 days.",
  "sources": [
    { "chunkId": "64def...", "text": "...customers may return items within 30 days of purchase..." }
  ]
}
```

**Response (not found):**
```json
{ "found": false, "answer": "", "sources": [] }
```

---

## 🔒 Security

| Concern | Mitigation |
|---------|-----------|
| API key exposure | Lives only in `.env` on the server; never sent to browser |
| Hallucinated citations | Source text always read from MongoDB, not from model output |
| Prompt injection | Only bounded, numbered passages sent; strict JSON output enforced |
| Malicious uploads | File type + size validated server-side before processing |
| Data isolation | Each Q&A scoped to a `documentId` |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Vanilla CSS |
| Backend | Node.js, Express 4 |
| Database | MongoDB 7, Mongoose 8 |
| File parsing | Multer, pdf-parse |
| LLM | Groq API (OpenAI-compatible) |
| Retrieval | TF-IDF (zero-dependency, in-process) |

---

## 📄 License

MIT © [Ritesh](https://github.com/dev-os-ritesh)
