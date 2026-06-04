'use strict';

const { Queue } = require('bullmq');
const config = require('./config');
const { createConnection } = require('./redis');

// One connection dedicated to the producer-side Queue.
const connection = createConnection();

const receiptsQueue = new Queue(config.queueName, {
  connection,
  defaultJobOptions: {
    attempts: config.jobAttempts,
    backoff: { type: 'exponential', delay: 5000 },
    // Keep history bounded so Redis doesn't grow forever.
    removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

/**
 * Enqueue a receipt for processing. The job payload is intentionally tiny;
 * the durable record lives on disk and is looked up by id in the worker.
 */
async function enqueueReceipt(receiptId) {
  return receiptsQueue.add(
    'process-receipt',
    { receiptId },
    // NOTE: BullMQ rejects ':' in custom job ids ("Custom Id cannot contain :"),
    // so use a '-' separator.
    { jobId: `receipt-${receiptId}` }
  );
}

module.exports = { receiptsQueue, enqueueReceipt, connection };
