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
  views; running the hermetic, live, or bash/curl acceptance tests (e.g.
  `npm run test:live:vision` skipping, Tesseract producing garbage, or
  `test/acceptance/run-all.sh`); standing up or tearing down the containerized
  stack with podman-compose (or docker compose); processing a receipt or viewing
  its extracted metadata at localhost:8080; uploading via the REST API with curl;
  or hitting the project's known gotchas (corporate TLS breaking jsdelivr/Tavily
  but not Anthropic, an empty ANTHROPIC_API_KEY shadowing .env, Tesseract needing
  an upright image + local tessdata, `podman compose` vs `podman-compose`, or the
  vision MODULE_NOT_FOUND import bug).
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
│  ├─ web/view.js          # server-rendered HTML (renderReceipt / renderList)
│  └─ healthcheck.js  healthcheck-worker.js   # container healthchecks (see Podman)
├─ cli/receipts            # bash + curl CLI (no Node needed)
├─ test/                   # node:test suite — see test/README.md
│  ├─ *.test.js            # hermetic (no network/redis/keys); run by `npm test`
│  ├─ live/*.live.test.js  # real services; self-skip when prereqs absent
│  ├─ acceptance/          # bash/curl black-box suite vs a container stack (see its README)
│  ├─ fixtures/ helpers/   # costco sample fixtures + harness (fetch/redis stubs)
├─ tessdata/               # offline Tesseract eng.traineddata (see its README)
├─ docs/API.md             # full HTTP API reference + curl walkthrough
├─ data/                   # durable records (data/receipts/*.json, data/uploads/*)
├─ docker-compose.yml      # PARAMETERIZED (project/port/OCR/label/base-url) — see Podman
├─ Dockerfile  Containerfile  .env.example
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
npm test             # ~76 hermetic tests — no network, no Redis, no API keys
```

The hermetic suite must always pass and stay self-contained (it stubs `fetch`
and injects a fake Redis; see `test/helpers/harness.js`). `npm test` is scoped
to `test/*.test.js` so the live tests never run by accident.

### Running the app

Three ways, depending on whether you need the queue/worker:

- **Read-only / no Redis:** `npm run server`, then open http://localhost:8080.
  Redis-connection errors in the log are harmless — only the upload→queue path
  needs Redis; the read/view endpoints read records straight from `data/`.
- **Process a receipt without the queue:** call `pipeline.processReceipt(id)`
  directly (how records get seeded locally — see "Process a receipt locally").
- **Full stack (the real upload→queue→worker path):** run it in containers with
  Podman — see "Containerized stack (Podman)" below.

## Containerized stack (Podman)

Podman **is** installed on this host (older notes that said "no Podman" are
stale). What you need to know:

- The binary lives at **`/opt/podman/bin`** and isn't always on `PATH` —
  `export PATH="/opt/podman/bin:$PATH"` first. The VM is a running `applehv`
  machine (`podman machine list`; `podman machine start` if stopped).
- **Use `podman-compose` (hyphen), NOT `podman compose`.** Plain `podman
  compose` delegates to an external `docker-compose` provider that can't reach
  the podman socket here ("Cannot connect to the Docker daemon"). The hyphenated
  `podman-compose` (a pyenv/pip shim) drives the CLI directly and works.
- `podman-compose` does **not** auto-recreate running containers on `up` (you
  get "container name already in use"). To apply code/compose/env changes:
  `podman-compose down` then `podman-compose up --build -d`.

```bash
export PATH="/opt/podman/bin:$PATH"
cd receipt-enricher
podman-compose up --build -d        # redis + api(:8080) + worker
curl -fsS localhost:8080/health | jq .
podman-compose down                 # stop, KEEP volumes
podman-compose down -v              # stop + WIPE data volumes (fresh slate)
```

The compose file is **parameterized** with prod-safe defaults, so the same file
serves prod and the test suite: `RECEIPT_PROJECT` (project name),
`RECEIPT_API_PORT` (host port), `OCR_PROVIDER`, `RECEIPT_SUITE` (container
label), `PUBLIC_BASE_URL`. A plain `up` is unchanged (project `receipt-enricher`,
port 8080, `auto` OCR). **`PUBLIC_BASE_URL` defaults to `http://localhost:8080`
and is what the API advertises in `statusUrl`/`viewUrl`** — set it whenever the
published host port differs (e.g. the test stack on 18080) or links point at the
wrong port.

**Healthchecks are real** (`src/healthcheck.js` GETs `/health`;
`src/healthcheck-worker.js` PINGs Redis). They're *script files*, not inline
`node -e "..."`: the runtime runs the healthcheck via `/bin/sh`, where parens in
an inline program (`fetch(...)`) throw `syntax error` and the container shows
`unhealthy` forever.

## Acceptance suite (bash/curl) — `test/acceptance/`

Black-box tests that bring the stack up in containers and drive it from the
outside via the CLI and raw curl. Separate from `npm test` (hermetic) and
`test/live/*` (node-driven). Full details in `test/acceptance/README.md`.

```bash
cd receipt-enricher
bash test/acceptance/run-all.sh                # up → cli/ + rest/ steps → teardown
bash test/acceptance/run-all.sh --vision       # Anthropic instead of Tesseract
bash test/acceptance/run-all.sh --no-teardown  # leave the stack up to inspect
bash test/acceptance/rest/20_upload.sh         # one step (stack must be up first)
```

- **Layout:** `lib/{common,compose}.sh`, `lifecycle/{00_up,99_down}.sh`, `cli/*`
  (via `cli/receipts`), `rest/*` (raw curl). Steps are independently runnable and
  self-seed a receipt (cached id in `.state/`, gitignored).
- **Isolated from any prod stack on the host:** distinct project
  `test-receipt-enricher`, host port `18080`, label `io.receipt-enricher.suite=
  test`, separate volumes. Teardown is scoped to the test project and **refuses
  to run against the prod name `receipt-enricher`**; removes volumes by default
  (`RE_TEST_KEEP_VOLUMES=1` keeps them).
- **OCR default = offline Tesseract** — works in-container because
  `tesseract.js-core` (wasm) and `tessdata/eng.traineddata` are bundled, so no
  CDN. `RE_TEST_OCR=vision` uses `claude-sonnet-4-6`. Assertions are structural +
  HTTP only; item-count/store are asserted only on the vision path (Tesseract
  text is noisy by design).
- **Engine:** `podman` by default; `RE_TEST_ENGINE=docker` switches to
  `docker compose`. Config: `RE_TEST_{ENGINE,PROJECT,API_PORT,BASE,OCR,SAMPLE,
  KEEP_VOLUMES,NO_TEARDOWN,POLL_TIMEOUT}`.

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
   - In the **container**, Tesseract runs fully offline: `tesseract.js-core`
     (wasm) is reinstalled by `npm ci` and `tessdata` is `COPY`d in, so the
     CDN-hang doesn't apply there.

5. **`podman compose` vs `podman-compose`, and a substitution bug.** Use the
   hyphenated `podman-compose` (see "Containerized stack"). Also, podman-compose
   mishandles **nested** `${VAR:-...${VAR2:-x}}` default expansions — it leaks a
   literal `}` into the value. Keep compose interpolation **flat** (this is why
   `PUBLIC_BASE_URL` defaults to a literal `http://localhost:8080`, not a nested
   `...${RECEIPT_API_PORT}`).

## Testing model

- **Hermetic** (`npm test`): each `test/*.test.js` runs in its own process,
  stubs global `fetch`, injects an in-memory fake Redis via the require cache,
  and uses a temp `DATA_DIR`. No keys, no network, no Redis. Keep it that way.
- **Live** (`npm run test:live:vision|tesseract|stack|samples`): real services,
  each self-skips when its prerequisite (API key / local lang data / running
  stack) is missing, and prints the extracted receipt. `SAMPLE_IMAGE` overrides
  the input photo for the single-image tests; `test:live:samples` runs the
  vision model over the whole `samples/costco/` corpus as a quality smoke test.
- **Acceptance** (`test/acceptance/run-all.sh`): bash/curl black-box tests
  against a containerized stack, isolated from prod. See the dedicated section
  above and `test/acceptance/README.md`.
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
- **BullMQ custom job ids must not contain `:`.** `queue.js` uses
  `receipt-<id>`; a past `receipt:<id>` made *every* upload fail with HTTP 400
  ("Custom Id cannot contain :"). The hermetic suite's fake Redis didn't catch
  it (it doesn't validate ids) — the acceptance suite does, since it hits real
  Redis. Keep job ids `:`-free.
- The acceptance suite must stay isolated: never point its teardown at the prod
  project, never bind the prod host port. Defaults (`test-receipt-enricher`,
  18080) already ensure this; the teardown guard refuses the prod name.
