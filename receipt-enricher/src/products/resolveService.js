'use strict';

// "Resolve products for a receipt's profile result" service. Input is a receipt
// PROFILE RESULT (the cleaned line items), identified by receiptId + profileId;
// resolution only ever runs AFTER a receipt profile has been applied. Picks the
// resolver named by config.products.resolver, runs it over each line item, and
// (unless dryRun) persists a product result. Pure-ish JS, no Express/Redis dep —
// reused by both the sync route and the BullMQ worker. Mirrors
// receiptProfiles/applyService.js + the graceful degradation in enrich/index.js.

const config = require('../config');
const store = require('../store');
const profileStore = require('../receiptProfiles/profileStore');
const resultStore = require('../receiptProfiles/resultStore');
const registry = require('./registry');
const productStore = require('./productStore');
const logger = require('../logger');

// Error with an HTTP-ish status so the sync route can map it; the worker lets it
// propagate (job fails/retries).
class ResolveError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ResolveError';
    this.status = status;
  }
}

// The subset of a profile-result item we keep on each product (the source line).
function lineItemOf(it) {
  return {
    description: it.description ?? null,
    sku: it.sku ?? null,
    qty: it.qty ?? null,
    unitPrice: it.unitPrice ?? null,
    price: it.price ?? null,
  };
}

/**
 * Resolve products for a receipt's profile result.
 * @param {string} receiptId
 * @param {string} profileId  receipt-profile id or name
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<object>} the product result document
 * @throws {ResolveError} 404 (unknown receipt/profile) | 409 (profile not applied) | 422 (no resolver)
 */
async function resolveProductsForProfileResult(receiptId, profileId, { dryRun = false } = {}) {
  const record = await store.get(receiptId);
  if (!record) throw new ResolveError(404, 'receipt not found');

  const profile = await profileStore.get(profileId);
  if (!profile) throw new ResolveError(404, 'profile not found');

  const profileResult = await resultStore.get(record.id, profile.id);
  if (!profileResult) {
    throw new ResolveError(409, `profile "${profile.name}" has not been applied to this receipt yet`);
  }

  const resolver = registry.active();
  if (!resolver) {
    throw new ResolveError(422, `product resolver "${config.products.resolver}" is not available`);
  }

  const items = Array.isArray(profileResult.items) ? profileResult.items : [];
  const ctx = {
    storeName: profileResult.store ? profileResult.store.name : null,
    storeDate: profileResult.store ? profileResult.store.date : null,
    config,
    log: (msg, extra) => logger.info({ ...extra, receiptId: record.id, profile: profile.name }, msg),
  };

  const stats = { resolved: 0, skipped: 0, errors: 0 };
  const products = [];

  const enabled = config.products.enabled && resolver.ready(config);
  if (!enabled) {
    logger.info(
      { receiptId: record.id, resolver: resolver.id, enabled: config.products.enabled, ready: resolver.ready(config) },
      'product resolution disabled or backend not configured; skipping'
    );
  }

  let processed = 0;
  for (const it of items) {
    const lineItem = lineItemOf(it);
    if (!enabled) {
      products.push({ lineItem, productTitle: null, productDescription: null, productUrl: null, brand: null, category: null, confidence: null, error: null });
      stats.skipped += 1;
      continue;
    }
    if (processed >= config.products.maxItems) {
      products.push({ lineItem, productTitle: null, productDescription: null, productUrl: null, brand: null, category: null, confidence: null, error: null });
      stats.skipped += 1;
      continue;
    }
    processed += 1;
    try {
      const fields = await resolver.resolve(lineItem, ctx);
      if (fields) {
        products.push({ lineItem, ...fields, error: null });
        stats.resolved += 1;
      } else {
        products.push({ lineItem, productTitle: null, productDescription: null, productUrl: null, brand: null, category: null, confidence: null, error: null });
        stats.skipped += 1;
      }
    } catch (err) {
      logger.warn({ err: err.message, description: lineItem.description }, 'product resolution failed for item');
      products.push({ lineItem, productTitle: null, productDescription: null, productUrl: null, brand: null, category: null, confidence: null, error: err.message });
      stats.errors += 1;
    }
  }

  const result = {
    receiptId: record.id,
    receiptProfileId: profile.id,
    receiptProfileName: profile.name,
    resolver: resolver.id,
    model: resolver.id === 'anthropic' ? config.products.anthropic.model : null,
    resolvedAt: new Date().toISOString(),
    dryRun: !!dryRun,
    store: profileResult.store || { name: null, date: null },
    products,
    stats,
  };

  if (!dryRun) {
    await productStore.save(result);
    logger.info(
      { receiptId: record.id, receiptProfileId: profile.id, resolver: resolver.id, ...stats },
      'products resolved'
    );
  }
  return result;
}

module.exports = { resolveProductsForProfileResult, ResolveError };
