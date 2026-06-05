'use strict';

const express = require('express');
const config = require('./config');
const logger = require('./logger');
const receipts = require('./routes/receipts');
const receiptProfiles = require('./routes/receiptProfiles');
const profileStore = require('./receiptProfiles/profileStore');
const { cache } = require('./redis');

/**
 * Build the Express app: JSON parsing, health check, receipt routes, and the
 * shared error handler. Kept separate from server.js (which binds the port) so
 * the HTTP surface can be exercised in-process by the test suite.
 */
function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Health check (used by Docker/Podman healthcheck and the CLI).
  app.get('/health', async (req, res) => {
    let redis = 'down';
    try {
      redis = (await cache().ping()) === 'PONG' ? 'up' : 'unknown';
    } catch {
      redis = 'down';
    }
    const ok = redis === 'up';
    let receiptProfileCount = 0;
    try {
      receiptProfileCount = await profileStore.count();
    } catch {
      /* a profile-store read error shouldn't fail the health check */
    }
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      redis,
      ocrProvider: config.ocrProvider,
      enrichment: config.enrich.enabled ? 'enabled' : 'disabled',
      receiptProfiles: receiptProfileCount,
      time: new Date().toISOString(),
    });
  });

  app.use(receipts);
  app.use(receiptProfiles);

  // Error handler (multer + unexpected).
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.message && /too large|file size/i.test(err.message) ? 413 : 400;
    logger.warn({ err: err.message }, 'request error');
    res.status(status).json({ error: err.message || 'request failed' });
  });

  return app;
}

module.exports = { createApp };
