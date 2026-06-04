'use strict';

require('dotenv').config();

const path = require('path');

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

// Decide which OCR/extraction provider to actually use.
const visionProvider = (process.env.VISION_PROVIDER || 'anthropic').toLowerCase();
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const visionKeyPresent =
  (visionProvider === 'anthropic' && hasAnthropic) ||
  (visionProvider === 'openai' && hasOpenAI);

let ocrProvider = (process.env.OCR_PROVIDER || 'auto').toLowerCase();
if (ocrProvider === 'auto') {
  ocrProvider = visionKeyPresent ? 'vision' : 'tesseract';
}

const config = {
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  port: int(process.env.PORT, 8080),
  // Used to build shareable links (Telegram replies, API responses).
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${int(process.env.PORT, 8080)}`).replace(/\/$/, ''),

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  queueName: process.env.QUEUE_NAME || 'receipts',
  queueConcurrency: int(process.env.QUEUE_CONCURRENCY, 2),
  jobAttempts: int(process.env.JOB_ATTEMPTS, 3),

  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  receiptsDir: path.join(dataDir, 'receipts'),
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 15) * 1024 * 1024,

  // Local directory for Tesseract language data (eng.traineddata[.gz]). Used as
  // both the cache and the offline lang-path so first run needs no CDN download
  // — handy on networks that block/inspect the jsdelivr CDN. Override with
  // TESSDATA_PATH (e.g. a mounted volume in Docker).
  tessdataDir: path.resolve(process.env.TESSDATA_PATH || path.join(__dirname, '..', 'tessdata')),

  // JSON file mapping canonical store names to their aliases/substrings. The
  // parser uses it to normalize store names (e.g. "Costco Wholesale" -> "Costco")
  // across the vision and OCR paths. Override to ship your own store list.
  storeAliasesPath: path.resolve(
    process.env.STORE_ALIASES_PATH || path.join(__dirname, 'parse', 'store-aliases.json')
  ),

  // Extraction
  ocrProvider, // 'vision' | 'tesseract'
  vision: {
    provider: visionProvider, // 'anthropic' | 'openai'
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      version: process.env.ANTHROPIC_VERSION || '2023-06-01',
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
    },
  },

  // Enrichment via Tavily
  enrich: {
    enabled: bool(process.env.ENRICH_ENABLED, !!process.env.TAVILY_API_KEY),
    maxItems: int(process.env.ENRICH_MAX_ITEMS, 40),
    cacheTtlSeconds: int(process.env.ENRICH_CACHE_TTL_SECONDS, 60 * 60 * 24 * 7),
    tavily: {
      apiKey: process.env.TAVILY_API_KEY || '',
      baseUrl: process.env.TAVILY_BASE_URL || 'https://api.tavily.com',
      searchDepth: process.env.TAVILY_SEARCH_DEPTH || 'basic',
      maxResults: int(process.env.TAVILY_MAX_RESULTS, 3),
    },
  },

  telegram: {
    enabled: !!process.env.TELEGRAM_BOT_TOKEN,
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    // Where the bot uploads receipts. Inside compose this is the api service.
    apiUrl: (process.env.API_URL || `http://localhost:${int(process.env.PORT, 8080)}`).replace(/\/$/, ''),
  },
};

module.exports = config;
