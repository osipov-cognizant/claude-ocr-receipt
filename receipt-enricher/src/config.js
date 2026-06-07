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

  // Receipt Profiles: user-defined transformation rules applied to a parsed
  // receipt (see docs/RECEIPT-PROFILES.md). Definitions and results are durable
  // JSON, mirroring the receipt store. Limits guard the user-supplied rules
  // (regex compile + length caps) since the API is unauthenticated.
  receiptProfiles: {
    profilesDir: path.join(dataDir, 'receiptProfiles'),
    resultsDir: path.join(dataDir, 'profileResults'),
    // Transformers are code modules shipped WITH the app (not user-uploaded), so
    // they live under src, not DATA_DIR. A profile references one by id.
    transformersDir: path.join(__dirname, 'receiptProfiles', 'transformers'),
    // Optional server-wide default profile (id or name) applied at upload time
    // when the request omits a profileId. Empty = no default.
    defaultProfileId: process.env.DEFAULT_PROFILE_ID || '',
  },

  // Local directory for Tesseract language data (eng.traineddata[.gz]). Used as
  // both the cache and the offline lang-path so first run needs no CDN download
  // — handy on networks that block/inspect the jsdelivr CDN. Override with
  // TESSDATA_PATH (e.g. a mounted volume in Docker).
  tessdataDir: path.resolve(process.env.TESSDATA_PATH || path.join(__dirname, '..', 'tessdata')),

  // Upper bound (ms) on a single Tesseract recognition. tesseract.js has no
  // built-in timeout: if language data can't be loaded it can hang forever
  // (e.g. a CDN-blocked download, or an empty/mounted tessdata dir). The OCR
  // module races the call against this so a stuck recognition fails *that job*
  // instead of stalling a worker slot indefinitely. Override with TESSERACT_TIMEOUT_MS.
  tesseractTimeoutMs: Number(process.env.TESSERACT_TIMEOUT_MS) || 120000,

  // Tesseract orientation handling. Before recognition the OCR module runs
  // Tesseract's OSD (orientation & script detection) to find the page rotation
  // (0/90/180/270) so a sideways or upside-down phone photo is corrected first.
  // Needs osd.traineddata in tessdataDir; if it's missing or OSD isn't confident
  // the module falls back to skew-only auto-rotation. Disable with TESSERACT_OSD=0.
  tesseractOsd: process.env.TESSERACT_OSD !== '0',
  // Minimum OSD confidence before a 90/180/270 rotation is trusted and applied.
  // Below this we leave orientation alone (a low-confidence reading on a noisy
  // photo can otherwise flip an already-upright image into garbage).
  tesseractOsdMinConfidence: Number(process.env.TESSERACT_OSD_MIN_CONFIDENCE) || 1.0,

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

  // Product resolution: the final pipeline stage. Maps each cleaned line item
  // from a receipt PROFILE RESULT to product information (title, description,
  // substantiating web link) via a configurable backend *resolver* (an adapter).
  // The resolver is chosen by config — like OCR_PROVIDER picks the OCR engine —
  // NOT by a per-receipt record. The first resolver ('anthropic') calls a
  // low-end Anthropic model; a Tavily resolver can be added later by dropping a
  // module in resolvers/ and setting PRODUCT_RESOLVER=tavily.
  products: {
    enabled: bool(process.env.PRODUCTS_ENABLED, true),
    resolver: (process.env.PRODUCT_RESOLVER || 'anthropic').toLowerCase(),
    // Resolver modules ship WITH the app (code, not user data), like transformers.
    resolversDir: path.join(__dirname, 'products', 'resolvers'),
    // Durable product results, mirroring the receipt + profile-result stores.
    resultsDir: path.join(dataDir, 'products'),
    // Cap on line items resolved per receipt (each item is one backend call).
    maxItems: int(process.env.PRODUCT_MAX_ITEMS, 100),
    // Resolve products by default whenever an upload applies a receipt profile
    // (opt out per-upload with resolveProducts=0). Products require a profile,
    // so an upload with no profile (and no DEFAULT_PROFILE_ID) still won't resolve.
    resolveOnUpload: bool(process.env.PRODUCT_RESOLVE_ON_UPLOAD, true),
    anthropic: {
      // Reuses the same Anthropic credentials/endpoint as the vision OCR path.
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.PRODUCT_ANTHROPIC_MODEL || 'claude-haiku-4-5',
      version: process.env.ANTHROPIC_VERSION || '2023-06-01',
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      // Use Anthropic's server-side web_search/web_fetch tools so productUrl is a
      // real, grounded link (the retrieval happens on Anthropic's infra, which is
      // why it isn't blocked by the corporate TLS wall that breaks Tavily here).
      // If the configured model can't use the tools, set PRODUCT_ANTHROPIC_MODEL
      // to a model that can (e.g. claude-sonnet-4-6), or disable with =0.
      webSearch: bool(process.env.PRODUCT_ANTHROPIC_WEB_SEARCH, true),
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
