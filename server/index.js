import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import mongoose from 'mongoose';
import documentsRouter from './routes/documents.js';
import askRouter       from './routes/ask.js';

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ─────────────────────────────────────────────────────────────────
// Allow the deployed client URL (set CLIENT_URL on Vercel) + localhost dev
const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/documents', documentsRouter);
app.use('/api/ask',       askRouter);
app.get('/api/health',   (_req, res) => res.json({ status: 'ok' }));

// ── Database + server startup ─────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI).catch((err) => {
  console.error('❌ MongoDB connection failed:', err.message);
});

// On Vercel (serverless) we export the app — listen() is NOT called.
// Locally (npm run dev) we call listen() after Mongoose connects.
if (!process.env.VERCEL) {
  mongoose.connection.once('open', () => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () =>
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    );
  });
} else {
  mongoose.connection.once('open', () => console.log('✅ Connected to MongoDB'));
}

// Required export for Vercel serverless
export default app;
