/**
 * api/index.js
 * Vercel Serverless Function entry point.
 * Re-exports the Express app from server/index.js.
 * All /api/* requests are routed here by vercel.json.
 */

import app from '../server/index.js';

export default app;
