'use strict';

// Redis-backed tenant registry. Tenants are real, explicitly-provisioned
// accounts: the API rejects an upload for an unknown tenant (mirroring the
// "unknown profile" 400). The registry is a single Redis SET (`re:tenants`) so
// it is shared across all server/worker processes — crucially, the WORKER
// watches it to spin up one BullMQ Worker per tenant queue (`receipts:<tenant>`)
// as tenants are onboarded at runtime.
//
// The configured default tenant is ALWAYS allowed (and registered at boot) even
// if the SET read fails, so a single-tenant deployment and the test suite work
// without provisioning anything. Best-effort like the other Redis helpers: a
// Redis error degrades (the default stays usable) but never throws to a caller.

const config = require('./config');
const logger = require('./logger');
const { cache } = require('./redis');
const { isValidSegment } = require('./identity');

const SET_KEY = 're:tenants';

/** Register (idempotently create) a tenant account. */
async function register(tenantId) {
  if (!isValidSegment(tenantId)) throw new Error(`invalid tenant id "${tenantId}"`);
  try {
    await cache().sadd(SET_KEY, tenantId);
  } catch (err) {
    logger.warn({ err: err.message, tenantId }, 'tenant register failed');
  }
  return tenantId;
}

/** All registered tenants, sorted. The default tenant is always included. */
async function list() {
  let members = [];
  try {
    members = await cache().smembers(SET_KEY);
  } catch (err) {
    logger.warn({ err: err.message }, 'tenant list failed');
  }
  const set = new Set(members || []);
  if (isValidSegment(config.defaultTenantId)) set.add(config.defaultTenantId);
  return [...set].sort();
}

/** Whether a tenant has been provisioned (or is the always-allowed default). */
async function isAllowed(tenantId) {
  if (!isValidSegment(tenantId)) return false;
  if (tenantId === config.defaultTenantId) return true;
  try {
    return (await cache().sismember(SET_KEY, tenantId)) === 1;
  } catch (err) {
    logger.warn({ err: err.message, tenantId }, 'tenant lookup failed');
    return false;
  }
}

/** Remove a tenant from the registry (does not delete its data). */
async function remove(tenantId) {
  try {
    return (await cache().srem(SET_KEY, tenantId)) === 1;
  } catch (err) {
    logger.warn({ err: err.message, tenantId }, 'tenant remove failed');
    return false;
  }
}

/** Register the configured default tenant (called at server/worker startup). */
async function ensureDefault() {
  if (isValidSegment(config.defaultTenantId)) await register(config.defaultTenantId);
}

module.exports = { register, list, isAllowed, remove, ensureDefault, SET_KEY };
