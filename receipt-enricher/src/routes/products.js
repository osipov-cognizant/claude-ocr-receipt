'use strict';

const express = require('express');
const config = require('../config');
const store = require('../store');
const profileStore = require('../receiptProfiles/profileStore');
const profileResultStore = require('../receiptProfiles/resultStore');
const productStore = require('../products/productStore');
const registry = require('../products/registry');
const { resolveProductsForProfileResult } = require('../products/resolveService');
const { enqueueResolveProducts } = require('../queue');
const view = require('../web/view');
const logger = require('../logger');

const router = express.Router();

function productsUrl(receiptId, profileId) {
  return `${config.publicBaseUrl}/api/receipts/${receiptId}/products/${profileId}`;
}

// --- Available resolvers (read-only; code shipped with the app) --------------

router.get('/api/productResolvers', (req, res) => {
  res.json({ active: config.products.resolver, resolvers: registry.list() });
});

// --- Resolve products from a receipt's profile result ------------------------

// Map a profile result's line items to products. Synchronous by default.
// ?dryRun=1 resolves and returns without persisting. ?async=1 enqueues a
// childless `resolveProducts` job and returns 202 instead of running inline.
// Mirrors the applyProfile route in routes/receiptProfiles.js.
router.post('/api/receipts/:id/profileResults/:profileId/resolveProducts', async (req, res, next) => {
  try {
    if (req.query.async && !req.query.dryRun) {
      const record = await store.get(req.params.id);
      if (!record) return res.status(404).json({ error: 'receipt not found' });
      const profile = await profileStore.get(req.params.profileId);
      if (!profile) return res.status(404).json({ error: 'profile not found' });
      const profileResult = await profileResultStore.get(record.id, profile.id);
      if (!profileResult) {
        return res.status(409).json({ error: `profile "${profile.name}" has not been applied to this receipt yet` });
      }
      await enqueueResolveProducts(record.id, profile.id);
      logger.info({ receiptId: record.id, profileId: profile.id }, 'product resolution enqueued (async)');
      return res.status(202).json({
        receiptId: record.id,
        receiptProfileId: profile.id,
        status: 'queued',
        productsUrl: productsUrl(record.id, profile.id),
      });
    }

    const result = await resolveProductsForProfileResult(req.params.id, req.params.profileId, {
      dryRun: !!req.query.dryRun,
    });
    res.json(result);
  } catch (err) {
    if (err && err.name === 'ResolveError') return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// --- Read product results ----------------------------------------------------

// Every product result across all receipts (newest first).
router.get('/api/products', async (req, res, next) => {
  try {
    res.json(await productStore.listAll());
  } catch (err) {
    next(err);
  }
});

router.get('/api/receipts/:id/products', async (req, res, next) => {
  try {
    const record = await store.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'receipt not found' });
    res.json(await productStore.list(record.id));
  } catch (err) {
    next(err);
  }
});

router.get('/api/receipts/:id/products/:profileId', async (req, res, next) => {
  try {
    // Accept profile id or name; results are keyed by id, so resolve a name.
    const profile = await profileStore.get(req.params.profileId);
    const profileId = profile ? profile.id : req.params.profileId;
    const result = await productStore.get(req.params.id, profileId);
    if (!result) return res.status(404).json({ error: 'not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- Web views ---------------------------------------------------------------

// HTML list of every product result across all receipts.
router.get('/products', async (req, res, next) => {
  try {
    res.type('html').send(view.renderProductList(await productStore.listAll()));
  } catch (err) {
    next(err);
  }
});

// HTML view of the products resolved from one receipt's profile result. Renders
// the stored result only — unlike the profile view it does NOT compute fresh on
// a miss, since resolution makes live backend calls (a GET shouldn't).
router.get('/receipts/:id/products/:profileId/view', async (req, res, next) => {
  try {
    const record = await store.get(req.params.id);
    if (!record) return res.status(404).send('Receipt not found');
    const profile = await profileStore.get(req.params.profileId);
    const profileId = profile ? profile.id : req.params.profileId;
    const result = await productStore.get(record.id, profileId);
    if (!result) {
      return res
        .status(404)
        .send('No products resolved for this receipt/profile yet. POST …/resolveProducts first.');
    }
    res.type('html').send(view.renderProductResult(record, result));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
