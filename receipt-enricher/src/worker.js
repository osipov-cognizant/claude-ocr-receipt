'use strict';

const { Worker } = require('bullmq');
const config = require('./config');
const logger = require('./logger');
const { createConnection } = require('./redis');
const store = require('./store');
const { processReceipt } = require('./pipeline');

const connection = createConnection();

const worker = new Worker(
  config.queueName,
  async (job) => {
    const { receiptId } = job.data;
    logger.info({ jobId: job.id, receiptId, attempt: job.attemptsMade + 1 }, 'processing receipt');
    return processReceipt(receiptId);
  },
  { connection, concurrency: config.queueConcurrency }
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, receiptId: job.data.receiptId }, 'job completed');
});

worker.on('failed', async (job, err) => {
  logger.error(
    { jobId: job?.id, receiptId: job?.data?.receiptId, attempt: job?.attemptsMade, err: err.message },
    'job failed'
  );
  // On the final attempt, mark the durable record as failed.
  if (job && job.attemptsMade >= (job.opts.attempts || config.jobAttempts)) {
    try {
      await store.update(job.data.receiptId, { status: 'failed', error: err.message });
    } catch (e) {
      logger.error({ err: e.message }, 'could not mark receipt failed');
    }
  }
});

logger.info(
  { queue: config.queueName, concurrency: config.queueConcurrency, ocr: config.ocrProvider },
  'worker started'
);

function shutdown(sig) {
  logger.info({ sig }, 'shutting down worker');
  worker.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
