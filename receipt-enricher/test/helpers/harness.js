'use strict';

// Test harness helpers — built on Node built-ins only, so the suite needs no
// test framework, no real Redis, and no network. Each `node --test` file runs
// in its own process, so mutating process.env / require.cache here is isolated.

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Point DATA_DIR at a throwaway temp directory. Must be called BEFORE the
 * first `require('../src/config')` / `require('../src/store')` in a test file,
 * because config reads DATA_DIR at load time.
 * @returns {{ dir: string, cleanup: () => void }}
 */
function useTempDataDir(label = 'receipt-test') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  process.env.DATA_DIR = dir;
  return {
    dir,
    cleanup() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

/**
 * Inject an in-memory fake of src/redis.js into the require cache so modules
 * that `require('../redis')` (enrich, queue, server) get a working `cache()`
 * with no real Redis. Call BEFORE requiring those modules.
 * @returns {{ store: Map<string, string>, calls: object }}
 */
function installFakeRedis() {
  const store = new Map();
  const calls = { get: 0, set: 0, ping: 0 };
  const client = {
    async get(key) {
      calls.get += 1;
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value /* , 'EX', ttl */) {
      calls.set += 1;
      store.set(key, value);
      return 'OK';
    },
    async ping() {
      calls.ping += 1;
      return 'PONG';
    },
  };

  const redisPath = require.resolve('../../src/redis');
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: {
      createConnection: () => client,
      cache: () => client,
    },
  };
  return { store, calls };
}

/**
 * Replace global.fetch with a handler for the duration of a test.
 * The handler receives (url, options) and returns the value `fetch` resolves
 * to (typically a fake Response — see jsonResponse / textResponse below).
 * @returns {() => void} restore function
 */
function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options, calls);
  };
  const restore = () => {
    globalThis.fetch = original;
  };
  restore.calls = calls;
  return restore;
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function textResponse(text, { ok = false, status = 500 } = {}) {
  return {
    ok,
    status,
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

module.exports = {
  useTempDataDir,
  installFakeRedis,
  stubFetch,
  jsonResponse,
  textResponse,
};
