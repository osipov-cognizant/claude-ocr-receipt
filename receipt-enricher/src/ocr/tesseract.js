'use strict';

const fs = require('fs');
const Tesseract = require('tesseract.js');
const config = require('../config');
const logger = require('./../logger');
const { imagePathFor } = require('../store');

/**
 * Returns raw OCR text only. The heuristic parser turns this into line items.
 * Note: tesseract.js downloads the English trained-data the first time it runs
 * (cached afterwards). HEIC images are not supported by tesseract; convert to
 * JPEG/PNG before sending if you use this provider.
 *
 * @returns {Promise<{ rawText: string|null, structured: object|null }>}
 */
async function extract(record) {
  const imgPath = imagePathFor(record);

  // Use a local tessdata directory as both the cache and the offline lang-path.
  // If eng.traineddata (uncompressed) or eng.traineddata.gz is present there,
  // tesseract.js loads it from disk and never touches the jsdelivr CDN. The dir
  // must exist for the cache write-back; create it if missing.
  const tessdataDir = config.tessdataDir;
  try {
    fs.mkdirSync(tessdataDir, { recursive: true });
  } catch {
    /* non-fatal: tesseract will just fall back to the CDN */
  }

  const result = await Tesseract.recognize(imgPath, 'eng', {
    langPath: tessdataDir, // local dir -> reads eng.traineddata.gz from disk if present
    cachePath: tessdataDir, // reads/writes uncompressed eng.traineddata here
    logger: (m) => {
      if (m.status === 'recognizing text' && m.progress === 1) {
        logger.debug({ id: record.id }, 'tesseract: recognition complete');
      }
    },
  });
  const rawText = result?.data?.text || '';
  return { rawText, structured: null };
}

module.exports = { extract };
