'use strict';

const express = require('express');
const config = require('../config');
const store = require('../store');
const profileStore = require('../receiptProfiles/profileStore');
const resultStore = require('../receiptProfiles/resultStore');
const registry = require('../receiptProfiles/registry');
const { applyProfileToReceipt } = require('../receiptProfiles/applyService');
const { enqueueApplyProfile } = require('../queue');
const logger = require('../logger');

const router = express.Router();

function summary(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    version: p.version,
    transformer: p.transformer,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function isValidationError(err) {
  return err && err.name === 'ValidationError' && Array.isArray(err.errors);
}

// --- Available transformers (read-only; code shipped with the app) ----------

router.get('/api/transformers', (req, res) => {
  res.json(registry.list());
});

// --- Profile CRUD ----------------------------------------------------------

router.get('/api/receiptProfiles', async (req, res, next) => {
  try {
    const all = await profileStore.list();
    res.json(all.map(summary));
  } catch (err) {
    next(err);
  }
});

router.post('/api/receiptProfiles', async (req, res, next) => {
  try {
    const profile = await profileStore.create(req.body || {});
    logger.info({ id: profile.id, name: profile.name, transformer: profile.transformer }, 'receipt profile created');
    res.status(201).json(profile);
  } catch (err) {
    if (isValidationError(err)) return res.status(400).json({ error: err.message, details: err.errors });
    next(err);
  }
});

router.get('/api/receiptProfiles/:id', async (req, res, next) => {
  try {
    const profile = await profileStore.get(req.params.id);
    if (!profile) return res.status(404).json({ error: 'not found' });
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

router.put('/api/receiptProfiles/:id', async (req, res, next) => {
  try {
    const updated = await profileStore.update(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  } catch (err) {
    if (isValidationError(err)) return res.status(400).json({ error: err.message, details: err.errors });
    next(err);
  }
});

router.delete('/api/receiptProfiles/:id', async (req, res, next) => {
  try {
    const ok = await profileStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Apply + results -------------------------------------------------------

// Apply a profile to an already-processed receipt. Synchronous by default
// (Step 1; the transform is pure and fast). ?dryRun=1 runs the transform and
// returns it without persisting. ?async=1 enqueues a childless `applyProfile`
// job (Step 2) and returns 202 instead of running inline.
router.post('/api/receipts/:id/applyProfile/:profileId', async (req, res, next) => {
  try {
    // Async re-apply: validate existence up front (so unknown ids still 404),
    // then enqueue and return 202. dryRun has no meaning for a queued apply.
    if (req.query.async && !req.query.dryRun) {
      const record = await store.get(req.params.id);
      if (!record) return res.status(404).json({ error: 'receipt not found' });
      const profile = await profileStore.get(req.params.profileId);
      if (!profile) return res.status(404).json({ error: 'profile not found' });
      await enqueueApplyProfile(record.id, profile.id);
      logger.info({ receiptId: record.id, profileId: profile.id }, 'profile apply enqueued (async)');
      return res.status(202).json({
        receiptId: record.id,
        profileId: profile.id,
        status: 'queued',
        profileResultUrl: `${config.publicBaseUrl}/api/receipts/${record.id}/profileResults/${profile.id}`,
      });
    }

    const result = await applyProfileToReceipt(req.params.id, req.params.profileId, {
      dryRun: !!req.query.dryRun,
    });
    res.json(result);
  } catch (err) {
    if (err && err.name === 'ApplyError') return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get('/api/receipts/:id/profileResults', async (req, res, next) => {
  try {
    const record = await store.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'receipt not found' });
    res.json(await resultStore.list(record.id));
  } catch (err) {
    next(err);
  }
});

router.get('/api/receipts/:id/profileResults/:profileId', async (req, res, next) => {
  try {
    // Accept profile id or name; results are keyed by id, so resolve a name.
    const profile = await profileStore.get(req.params.profileId);
    const profileId = profile ? profile.id : req.params.profileId;
    const result = await resultStore.get(req.params.id, profileId);
    if (!result) return res.status(404).json({ error: 'not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
