/**
 * diag.js — Groq API connectivity test.
 * Run: node tests/diag.js
 */
import 'dotenv/config';
import OpenAI from 'openai/index.mjs';

const KEY = process.env.GROQ_API_KEY;
const BASE_URL = 'https://api.groq.com/openai/v1';

// Chat-capable models confirmed available on this account
const MODELS_TO_TRY = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'allam-2-7b',
];

console.log('\n🔍 Groq API Diagnostic\n');
console.log(`  Key loaded : ${KEY ? `YES (length=${KEY.length}, prefix="${KEY.slice(0, 8)}…")` : 'NO — GROQ_API_KEY missing in .env'}`);
console.log(`  Base URL   : ${BASE_URL}\n`);

if (!KEY) {
  console.error('❌ GROQ_API_KEY is not set in .env');
  process.exit(1);
}

const client = new OpenAI({ apiKey: KEY, baseURL: BASE_URL });

// Fetch and display available models from the API directly
console.log('Fetching available models from Groq…');
try {
  const modelsRes = await client.models.list();
  const names = modelsRes.data.map((m) => m.id).sort();
  console.log(`  Available: ${names.join(', ')}\n`);
} catch (e) {
  console.log(`  Could not fetch model list: ${e.message}\n`);
}

console.log('Attempting chat completion with each model…\n');
let success = false;
let workingModel = null;

for (const model of MODELS_TO_TRY) {
  process.stdout.write(`  Trying "${model}" … `);
  try {
    const res = await client.chat.completions.create({
      model,
      max_tokens: 10,
      temperature: 0,
      messages: [{ role: 'user', content: 'Say OK' }],
    });
    const text = res.choices[0].message.content;
    console.log(`✅  WORKS! Response: "${text.trim()}"`);
    workingModel = model;
    success = true;
    break;
  } catch (err) {
    // Show full error message
    console.log(`❌  HTTP ${err.status || '?'} — ${err.message}`);
  }
}

if (success) {
  console.log(`\n✅ Update your .env:\n   GROQ_MODEL=${workingModel}`);
} else {
  console.log('\n❌ No model worked. Check the available model list printed above.');
  console.log('   Add one of the available model IDs as GROQ_MODEL in your .env');
}

console.log('');
