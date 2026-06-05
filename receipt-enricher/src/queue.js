'use strict';

const { Queue, FlowProducer } = require('bullmq');
const config = require('./config');
const { createConnection } = require('./redis');

// Per-job options shared by the plain Queue and the FlowProducer. A FlowProducer
// does NOT inherit a Queue's defaultJobOptions, so each flow node must carry its
// own opts — we reuse this object to keep them identical.
const defaultJobOptions = {
  attempts: config.jobAttempts,
  backoff: { type: 'exponential', delay: 5000 },
  // Keep history bounded so Redis doesn't grow forever.
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

// One connection dedicated to the producer-side Queue.
const connection = createConnection();

const receiptsQueue = new Queue(config.queueName, { connection, defaultJobOptions });

// FlowProducer submits a dependent job tree atomically (child runs first, then
// the parent). Same connection pattern as the Queue above.
const flowProducer = new FlowProducer({ connection: createConnection() });

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

/**
 * Enqueue a flow that runs the OCR pipeline FIRST, then applies a profile:
 * child `process-receipt` (upstream) -> parent `applyProfile` (downstream).
 * The parent waits in `waiting-children` until the child completes. Used when a
 * profile is chosen at upload time.
 */
async function enqueueProcessAndApply(receiptId, profileId) {
  return flowProducer.add({
    name: 'applyProfile',
    queueName: config.queueName,
    data: { receiptId, profileId },
    opts: { ...defaultJobOptions, jobId: `applyProfile-${receiptId}-${profileId}` },
    children: [
      {
        name: 'process-receipt',
        queueName: config.queueName,
        data: { receiptId },
        opts: { ...defaultJobOptions, jobId: `receipt-${receiptId}`, failParentOnFailure: true },
      },
    ],
  });
}

/**
 * Enqueue a childless `applyProfile` job to (re)apply a profile to a receipt
 * that's already been processed — the async variant of the sync apply route.
 */
async function enqueueApplyProfile(receiptId, profileId) {
  return receiptsQueue.add(
    'applyProfile',
    { receiptId, profileId },
    { jobId: `applyProfile-${receiptId}-${profileId}` }
  );
}

module.exports = {
  receiptsQueue,
  flowProducer,
  enqueueReceipt,
  enqueueProcessAndApply,
  enqueueApplyProfile,
  connection,
};
