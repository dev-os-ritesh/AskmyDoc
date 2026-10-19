/**
 * config.js
 * Central API base URL.
 * - Dev:  Vite proxies /api → localhost:5000, so base = ''
 * - Prod: VITE_API_URL = the deployed server URL (set in Vercel dashboard)
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '';
