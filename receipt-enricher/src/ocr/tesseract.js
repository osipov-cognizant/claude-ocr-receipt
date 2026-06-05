'use strict';

const fs = require('fs');
const Tesseract = require('tesseract.js');
const config = require('../config');
const logger = require('./../logger');
const { imagePathFor } = require('../store');

/**
 * Returns raw OCR text only. The heuristic parser turns this into line items.
 * Note: the English trained-data is loaded from the local tessdata dir (see
 * config.tessdataDir), so this runs fully offline — no jsdelivr CDN download.
 * HEIC images are not supported by tesseract; convert to JPEG/PNG before
 * sending if you use this provider.
 *
 * @returns {Promise<{ rawText: string|null, structured: object|null }>}
 */
async function extract(record) {
  const imgPath = imagePathFor(record);

  // Use a local tessdata directory as both the cache and the offline lang-path.
  // We ship the *uncompressed* eng.traineddata, so:
  //   - cachePath: tesseract.js reads/writes `<dir>/eng.traineddata` (uncompressed).
  //   - langPath + gzip:false: on a cache miss it falls back to reading
  //     `<dir>/eng.traineddata` too. With the default gzip:true it would instead
  //     look for `<dir>/eng.traineddata.gz` (which we do NOT ship) and fail with
  //     ENOENT — the in-container crash this module had. (The gunzip step still
  //     auto-detects gzip magic bytes, so a .gz on disk would also load fine.)
  // Either way it never touches the jsdelivr CDN. The dir must exist for the
  // cache write-back; create it if missing.
  const tessdataDir = config.tessdataDir;
  try {
    fs.mkdirSync(tessdataDir, { recursive: true });
  } catch {
    /* non-fatal: tesseract will just fall back to the CDN */
  }

  let result;
  try {
    result = await withTimeout(
      Tesseract.recognize(imgPath, 'eng', {
        langPath: tessdataDir,
        cachePath: tessdataDir,
        gzip: false, // load the uncompressed eng.traineddata we ship (see above)
        // Without an errorHandler, tesseract.js does `throw Error(...)` inside its
        // worker's message handler on any load/recognize failure. That throw is an
        // UNCAUGHT exception: it bypasses this try/catch and kills the whole worker
        // process (every in-flight job dies; BullMQ flow parents then cascade as
        // "child failed"). Supplying one keeps the failure inside the promise chain
        // so we can fail just this job.
        errorHandler: (err) => {
          logger.error({ id: record.id, err: String(err) }, 'tesseract worker error');
        },
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress === 1) {
            logger.debug({ id: record.id }, 'tesseract: recognition complete');
          }
        },
      }),
      config.tesseractTimeoutMs
    );
  } catch (err) {
    // Surface as a normal rejection so the pipeline marks the job failed and the
    // worker stays alive to process other receipts.
    throw new Error(`tesseract OCR failed: ${err && err.message ? err.message : err}`);
  }

  const rawText = result?.data?.text || '';
  return { rawText, structured: null };
}

/**
 * Reject if `promise` doesn't settle within `ms`. tesseract.js has no internal
 * timeout, and with an errorHandler set a *language-load* failure leaves its
 * startup promise unsettled (the library swallows that rejection), so the call
 * would otherwise hang forever. This bounds it.
 */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { extract };
