# AskMyDoc — AI Document Q&A Assistant

Upload a `.txt` document, ask questions, get answers grounded **strictly** in that document — with the exact source passage shown. If the document doesn't contain the answer, the app says so instead of guessing.

**Stack**: MongoDB · Express · React (Vite) · Node.js · Grok (xAI)

---

## Project Structure

```
doc-qa/
├── server/
│   ├── index.js               # Express entry point
│   ├── .env.example           # Required environment variables
│   ├── routes/
│   │   ├── documents.js       # POST /api/documents
│   │   └── ask.js             # POST /api/ask
│   ├── services/
│   │   ├── chunker.js         # Split text into overlapping chunks
│   │   ├── retriever.js       # TF-IDF keyword retrieval
│   │   ├── llm.js             # Grok API wrapper (swappable)
│   │   └── validator.js       # JSON parse, schema + chunk-ID checks
│   ├── models/
│   │   ├── Document.js        # { filename, uploadedAt, chunkCount }
│   │   ├── Chunk.js           # { documentId, index, text }
│   │   └── QaLog.js           # Audit log for every Q&A
│   └── tests/
│       ├── eval.js            # 28-test evaluation suite
│       └── sample.txt         # Sample document for tests
└── client/                    # Vite + React frontend
    ├── vite.config.js         # Proxies /api → Express
    └── src/
        ├── App.jsx
        └── components/
            ├── UploadBox.jsx
            ├── AskForm.jsx
            ├── AnswerCard.jsx
            └── SourcePanel.jsx
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| MongoDB | local or [Atlas free tier](https://www.mongodb.com/atlas) |
| xAI API key | [console.x.ai](https://console.x.ai) |

---

## Setup

### 1. Clone / open the project

```
doc-qa/
├── server/
└── client/
```

### 2. Configure the server environment

```bash
cd doc-qa/server
copy .env.example .env
```

Edit `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/docqa
XAI_API_KEY=your_real_key_here
PORT=5000
```

### 3. Install server dependencies

```bash
cd doc-qa/server
npm install
```

### 4. Install client dependencies

```bash
cd doc-qa/client
npm install
```

---

## Running the App

Open **two terminals**:

**Terminal 1 — Server**
```bash
cd doc-qa/server
npm run dev
# → Server running on http://localhost:5000
```

**Terminal 2 — Client**
```bash
cd doc-qa/client
npm run dev
# → http://localhost:5173
```

Open `http://localhost:5173` in your browser.

---

## Running the Tests

Make sure the server is running, then:

```bash
cd doc-qa/server
npm test
```

This uploads `tests/sample.txt` to your running server and runs all 28 tests.

**To run only the unit tests** (no server or API key needed):

```bash
cd doc-qa/server
SKIP_LIVE=1 npm test
```

**To point at a different server:**

```bash
TEST_SERVER=http://your-server:5000 npm test
```

---

## API Reference

### `POST /api/documents`
Upload a `.txt` file.

- **Body**: `multipart/form-data`, field name `file`
- **Response**: `{ documentId: string, chunkCount: number }`

### `POST /api/ask`
Ask a question about an uploaded document.

- **Body**: `{ documentId: string, question: string }`
- **Response (found)**:
  ```json
  {
    "found": true,
    "answer": "...",
    "sources": [{ "chunkId": "...", "text": "..." }]
  }
  ```
- **Response (not found)**:
  ```json
  { "found": false, "answer": "", "sources": [] }
  ```
- **Response (error)**:
  ```json
  { "error": "Human-readable message", "errorType": "TIMEOUT|BAD_KEY|RATE_LIMIT|..." }
  ```

---

## Grounding Guarantee

The `sources[].text` in every response is fetched from **MongoDB by chunk ID** — it is never taken from the model's output. Even if the model returns a fake chunk ID, the validator silently drops it and the client never sees fabricated text.

---

## Security Notes

- Never commit `.env` — it's in `.gitignore`
- The React client calls only your Express API; it never touches xAI directly
- File uploads are capped at 5 MB; only `.txt` files are accepted
- All LLM responses are validated before reaching the user
