'use strict';

const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');

const app = createApp();

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
