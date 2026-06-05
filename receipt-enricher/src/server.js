'use strict';

const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const profileStore = require('./receiptProfiles/profileStore');

const app = createApp();

// Seed the shipped example receipt profile(s) on first boot (no-op if any exist).
profileStore
  .seedIfEmpty()
  .then((n) => {
    if (n) logger.info({ seeded: n }, 'seeded receipt profiles');
  })
  .catch((err) => logger.warn({ err: err.message }, 'receipt profile seeding failed'));

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(
    { port: config.port, ocr: config.ocrProvider, enrichment: config.enrich.enabled },
    'API server listening'
  );
});

function shutdown(sig) {
  logger.info({ sig }, 'shutting down API');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
