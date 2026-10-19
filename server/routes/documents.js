/**
 * routes/documents.js
 * POST /api/documents
 * Accepts .txt or .pdf files, extracts text, chunks it, stores in MongoDB.
 * Response: { documentId, chunkCount }
 */

import express  from 'express';
import multer   from 'multer';
import { createRequire } from 'module';
import Document from '../models/Document.js';
import Chunk    from '../models/Chunk.js';
import { chunkText } from '../services/chunker.js';

// pdf-parse is CommonJS — use createRequire for ES module compatibility
const require   = createRequire(import.meta.url);
const pdfParse  = require('pdf-parse/lib/pdf-parse.js');

const router = express.Router();

const ACCEPTED_TYPES = new Set([
  'text/plain',
  'application/pdf',
]);

// Keep files in memory — we only need the buffer, not a disk path
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    const ok  = ACCEPTED_TYPES.has(file.mimetype) ||
                ext.endsWith('.txt') ||
                ext.endsWith('.pdf');
    if (ok) cb(null, true);
    else    cb(new Error('Only .txt and .pdf files are accepted.'));
  },
});

/** Extract plain text from the uploaded buffer based on file type. */
async function extractText(file) {
  const ext = file.originalname.toLowerCase();
  if (file.mimetype === 'application/pdf' || ext.endsWith('.pdf')) {
    const parsed = await pdfParse(file.buffer);
    return parsed.text;
  }
  // Default: plain text
  return file.buffer.toString('utf-8');
}

// POST /api/documents
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Extract text (handles both .txt and .pdf)
    let text;
    try {
      text = await extractText(req.file);
    } catch (parseErr) {
      return res.status(422).json({ error: `Could not read file: ${parseErr.message}` });
    }

    if (!text?.trim()) {
      return res.status(400).json({ error: 'The uploaded file is empty or contains no readable text.' });
    }

    // Split into overlapping chunks
    const rawChunks = chunkText(text);

    // Persist document record
    const doc = await Document.create({
      filename:   req.file.originalname,
      chunkCount: rawChunks.length,
    });

    // Persist all chunks in one bulk insert
    await Chunk.insertMany(
      rawChunks.map((c) => ({
        documentId: doc._id,
        index:      c.index,
        text:       c.text,
      }))
    );

    res.json({ documentId: doc._id, chunkCount: rawChunks.length });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

export default router;
