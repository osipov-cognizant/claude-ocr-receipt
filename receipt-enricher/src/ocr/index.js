'use strict';

const config = require('../config');

/**
 * Selects the configured extraction provider and returns its result:
 *   { rawText: string|null, structured: object|null, provider: string }
 */
async function extract(record) {
  const provider = config.ocrProvider; // 'vision' | 'tesseract'
  const impl = provider === 'vision' ? require('./vision') : require('./tesseract');
  const out = await impl.extract(record);
  return { ...out, provider };
}

module.exports = { extract };
