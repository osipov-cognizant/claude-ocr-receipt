---
name: receipt-enricher-dev
description: >-
  Developer/operator guide for THE Receipt Enricher project — the receipt-photo
  → OCR → structured & enriched line-items app under
  /Users/952657/Projects/claude-ocr-receipt/receipt-enricher (Node/Express API,
  BullMQ/Redis worker, Anthropic/OpenAI-vision-or-Tesseract OCR pipeline, Tavily
  enrichment, bash CLI, Telegram bot, server-rendered web views, node:test
  suite). Use this skill whenever working IN THIS repo: editing or debugging the
  API, worker, or pipeline; the receipt parser and store detection (KNOWN_STORES
  in src/parse); the OCR providers in src/ocr; Tavily enrichment; the CLI or web
  views; running the hermetic or live tests (e.g. `npm run test:live:vision`
  skipping, or Tesseract producing garbage); processing a receipt or viewing its
  extracted metadata at localhost:8080; uploading via the REST API with curl; or
  hitting the project's known gotchas (corporate TLS breaking jsdelivr/Tavily but
  not Anthropic, an empty ANTHROPIC_API_KEY shadowing .env, Tesseract needing an
  upright image + local tessdata, or the vision MODULE_NOT_FOUND import bug).
  Consult it before guessing how this codebase is wired or why an
  extract/parse/enrich/test step behaves as it does. It covers developing and
  running THIS app — not generic OCR/PDF extraction, generic BullMQ/Redis/Docker/
  Express setups in other projects, or one-off "read this receipt photo for me"
  requests; for those, do not use this skill.
---

# Receipt Enricher — developer guide

Turn a phone photo of a grocery receipt into structured, enriched line items.
A receipt image arrives (CLI, Telegram, or raw REST), the API saves it and
enqueues a job, and a worker runs **extract → parse → enrich → summarize**,
producing a durable JSON record viewable as HTML or JSON.

## Where things live

Working-dir root: `/Users/952657/Projects/claude-ocr-receipt`. The Node project
is the **`receipt-enricher/`** subdirectory — run `npm`/`node` from there.

```
receipt-enricher/
├─ src/
│  ├─ server.js            # Express API + web views (port 8080)
│  ├─ worker.js            # BullMQ worker that runs the pipeline
│  ├─ bot.js               # Telegram bot (optional; relays to the REST API)
│  ├─ config.js            # all env-driven config (READ THIS to understand modes)
│  ├─ queue.js  redis.js   # BullMQ queue + ioredis connections
│  ├─ store.js             # durable receipt records (JSON files + image on disk)
│  ├─ logger.js            # pino
│  ├─ routes/receipts.js   # REST routes + web view routes
│  ├─ pipeline/index.js    # processReceipt(): orchestrates the 4 stages
│  ├─ ocr/  index.js vision.js tesseract.js   # extraction providers
│  ├─ parse/receiptParser.js     # normalizeStructured() + parseText() heuristics
│  ├─ enrich/ index.js tavily.js # Tavily lookup + Redis cache
│  └─ web/view.js          # server-rendered HTML (renderReceipt / renderList)
├─ cli/receipts            # bash + curl CLI (no Node needed)
├─ test/                   # node:test suite — see test/README.md
│  ├─ *.test.js            # hermetic (no network/redis/keys); run by `npm test`
│  ├─ live/*.live.test.js  # real services; self-skip when prereqs absent
│  ├─ fixtures/ helpers/   # costco sample fixtures + harness (fetch/redis stubs)
├─ tessdata/               # offline Tesseract eng.traineddata (see its README)
├─ docs/API.md             # full HTTP API reference + curl walkthrough
├─ data/                   # durable records (data/receipts/*.json, data/uploads/*)
├─ docker-compose.yml  Dockerfile  Containerfile  .env.example
└─ README.md
samples/costco/
├─ PXL_20260526_235419811.jpg          # the original sample — shot ROTATED 90°
└─ rotated_PXL_20260526_235419811.jpg  # upright copy (use this for Tesseract)
```

For the HTTP API in detail, read **`receipt-enricher/docs/API.md`**. For the
test design, read **`receipt-enricher/test/README.md`**.

## Getting started (local dev)

```bash
cd /Users/952657/Projects/claude-ocr-receipt/receipt-enricher
npm install          # one-time
npm test             # 64 hermetic tests — no network, no Redis, no API keys
```

The hermetic suite must always pass and stay self-contained (it stubs `fetch`
and injects a fake Redis; see `test/helpers/harness.js`). `npm test` is scoped
to `test/*.test.js` so the live tests never run by accident.

### Running the app

This machine has **no Docker/Podman/Redis installed**, so the full compose stack
can't run here. But you can still develop and view receipts:

- **View existing receipts without Redis:** `npm run server`, then open
  http://localhost:8080. The server logs Redis-connection errors (harmless) —
  only the upload→queue path needs Redis; the read/view endpoints read records
  straight from `data/` and work fine.
- **Process a receipt without the queue:** call `pipeline.processReceipt(id)`
  directly (this is how records get seeded locally — see "Process a receipt
  locally" below). The worker (`npm run worker`) and uploads need a real Redis.
- **Full stack (where available):** `docker compose up --build -d` (or
  `podman compose up --build -d`), then `./cli/receipts upload <img> --wait`.

## Extraction modes & expected behavior

Provider selection is computed in `config.js` from env (`OCR_PROVIDER=auto` by
default):

| You have…                       | Extraction     | Enrichment        |
|---------------------------------|----------------|-------------------|
| nothing                         | Tesseract OCR  | skipped           |
| `TAVILY_API_KEY`                | Tesseract OCR  | Tavily images     |
| `ANTHROPIC_API_KEY` (or OpenAI) | vision model   | skipped           |
| both                            | vision model   | Tavily images     |

Receipt lifecycle (`status`): `queued → processing → done` (or `failed`).
Canonical parsed shape: `{ store:{name,date}, items:[{description,sku,qty,
unitPrice,price,enrichment}], totals:{subtotal,tax,total,itemCount,sumOfItems,
subtotalMatch} }`. `parse/receiptParser` canonicalizes known store names to the
chain (vision's "Costco Wholesale" → "Costco" via `KNOWN_STORES`), and
`subtotalMatch` is a data-quality signal (do items reconcile with the printed
subtotal? `null` if none). The pipeline summary flags a *shortfall* — items
summing under the subtotal, a likely missed line (an overage is expected when a
discount line is excluded, so it isn't flagged).

**Quality reality:** the vision path reads layout, returns clean items, the
store name, even discount lines, and handles a rotated photo with no
preprocessing — it is the recommended path. Tesseract is a best-effort offline
fallback: it needs an upright, sharp image and produces noisy descriptions and
the occasional digit slip. The bigger/“best” Tesseract model is not meaningfully
better here — image quality is the bottleneck, not the model.

## Environment gotchas (hard-won — check these first when something "doesn't work")

This repo is developed on a corporate-managed network, which causes several
non-obvious failures. Before debugging code, rule these out:

1. **Corporate TLS interception.** Node uses its *own* CA bundle (separate from
   the macOS keychain / `curl`), so on this network outbound HTTPS to *some*
   hosts fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Observed:
   `api.anthropic.com` ✅ reachable, `cdn.jsdelivr.net` ❌ blocked,
   `api.tavily.com` ❌ blocked. Consequences: the vision path works, but the
   Tesseract first-run CDN download and Tavily enrichment fail.
   **Fix:** `export NODE_EXTRA_CA_CERTS=/path/to/corp-root-ca.pem` (proper) or
   `NODE_TLS_REJECT_UNAUTHORIZED=0` (insecure, dev-only). `npm install` works.

2. **An empty `ANTHROPIC_API_KEY` is exported in the shell** (`""`). `dotenv`
   never overwrites an already-set variable, so that empty export *shadows* the
   key in `.env`. Symptom: vision skips/fails with "no API key" even though the
   key is in `.env`. **Fix:** `unset ANTHROPIC_API_KEY` (the real app uses plain
   `dotenv`, so it needs this). The live tests already work around it by loading
   `.env` with `override: true` (see `test/live/_shared.js`).

3. **`.env` location.** The app loads `.env` from its own dir
   (`receipt-enricher/.env`). A copy may also sit at the repo root. The live-test
   helper searches both and loads with override. `config.js` uses plain
   `dotenv.config()` (cwd-relative, no override).

4. **Tesseract needs an upright image + local language data.**
   - The bundled sample is rotated 90°; Tesseract reads sideways text as noise.
     Use `samples/costco/rotated_*.jpg`, or pass `SAMPLE_IMAGE=<path>` to the
     live tests.
   - Language data lives in `tessdata/eng.traineddata` (offline; see
     `tessdata/README.md`). The code points Tesseract there via
     `config.tessdataDir` (override `TESSDATA_PATH`), so no CDN download is
     needed. Without local data on a CDN-blocked network, `tesseract.js` hangs
     (its download has no timeout) — the live test preflights and skips fast.

## Testing model

- **Hermetic** (`npm test`): each `test/*.test.js` runs in its own process,
  stubs global `fetch`, injects an in-memory fake Redis via the require cache,
  and uses a temp `DATA_DIR`. No keys, no network, no Redis. Keep it that way.
- **Live** (`npm run test:live:vision|tesseract|stack|samples`): real services,
  each self-skips when its prerequisite (API key / local lang data / running
  stack) is missing, and prints the extracted receipt. `SAMPLE_IMAGE` overrides
  the input photo for the single-image tests; `test:live:samples` runs the
  vision model over the whole `samples/costco/` corpus as a quality smoke test.
- Coverage map and the corporate-TLS/Colab notes are in `test/README.md`.

## Common tasks

**Run one test file:** `node --test test/parser.test.js`

**See vision extraction on the real receipt (needs the key):**
```bash
cd receipt-enricher && unset ANTHROPIC_API_KEY   # drop the empty shadow var
npm run test:live:vision                          # auto-loads .env with override
```

**Run Tesseract offline on the upright sample:**
```bash
SAMPLE_IMAGE=samples/costco/rotated_PXL_20260526_235419811.jpg npm run test:live:tesseract
```

**Process a receipt locally and view it (no Docker/Redis):** load `.env` with
`{ override: true }` first, then `store.createReceipt(...)` →
`pipeline.processReceipt(id)` (enrichment auto-skips with no Tavily key, so the
cache/Redis is never touched), then `npm run server` and open
`http://localhost:8080/receipts/<id>/view`.

**Add/canonicalize a recognized store:** edit `src/parse/store-aliases.json`
(canonical name → lowercase alias substrings; override the path with
`STORE_ALIASES_PATH`). The parser loads it at startup and falls back to a
built-in list if the file is missing. **Add/adjust an extractor:** `src/ocr/`.
**Change the web view:** `src/web/view.js` (pure, dependency-free, unit-tested).

## Guardrails

- Keep `npm test` hermetic — never let it require network, Redis, or keys.
- Never commit secrets: `.env*` is gitignored (root + project); `.env.example`
  stays tracked.
- `src/ocr/vision.js` must require `../config`/`../logger` (one level up). A
  past bug used `./config`/`./logger`, which broke the entire vision path with
  `MODULE_NOT_FOUND`; `ocr-vision.test.js` and `pipeline.test.js` guard it.
