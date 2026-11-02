import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import mongoose from 'mongoose';
import documentsRouter from './routes/documents.js';
import askRouter       from './routes/ask.js';

const app  = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:5173',
  'https://askmy-doc-eqbd.vercel.app',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.options('*', cors());

app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/documents', documentsRouter);
app.use('/api/ask',       askRouter);
app.get('/api/health',   (_req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

// ── MongoDB connection (cached for serverless cold starts) ─────────────────
// On serverless each invocation may reuse an existing connection.
// We use a module-level promise so mongoose only connects once per container.
let mongoConnectPromise = null;

function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    // Already connected — reuse the connection
    return Promise.resolve();
  }
  if (!mongoConnectPromise) {
    mongoConnectPromise = mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      })
      .then(() => {
        console.log('✅ Connected to MongoDB');
        mongoConnectPromise = null; // allow reconnect if needed later
      })
      .catch((err) => {
        console.error('❌ MongoDB connection failed:', err.message);
        mongoConnectPromise = null;
        throw err;
      });
  }
  return mongoConnectPromise;
}

// Middleware to ensure DB is connected before any API route runs
app.use('/api', async (_req, res, next) => {
  try {
    await connectMongo();
    next();
  } catch (err) {
    res.status(503).json({ error: 'Database unavailable. Please try again shortly.' });
  }
});

// ── Local dev server ───────────────────────────────────────────────────────
// On Vercel (serverless) we export the app — listen() is NOT called.
if (!process.env.VERCEL) {
  connectMongo().then(() => {
    app.listen(PORT, () =>
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    );
  }).catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}

// Required export for Vercel serverless
export default app;
