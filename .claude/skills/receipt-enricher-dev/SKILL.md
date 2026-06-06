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
  in src/parse); the OCR providers in src/ocr; receipt profiles & transformers
  (src/receiptProfiles — applying/seeding usGrocery1 or tesseractGroceryUs1,
  `--profile`/profileId uploads, an "unknown profile" 400, or pinning the OCR
  engine via OCR_PROVIDER); Tavily enrichment; the CLI or web
  views; running the hermetic, live, or bash/curl acceptance tests (e.g.
  `npm run test:live:vision` skipping, Tesseract producing garbage, or
  `test/acceptance/run-all.sh`); standing up or tearing down the containerized
  stack with podman-compose (or docker compose); processing a receipt or viewing
  its extracted metadata at localhost:8080; uploading via the REST API with curl;
  or hitting the project's known gotchas (corporate TLS breaking jsdelivr/Tavily
  but not Anthropic, an empty ANTHROPIC_API_KEY shadowing .env, Tesseract needing
  local tessdata (orientation is auto-corrected via Tesseract OSD),
  `podman compose` vs `podman-compose`, a new seedProfiles file not taking until
  `down -v`, or the vision MODULE_NOT_FOUND import bug).
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
│  ├─ receiptProfiles/     # profile engine, registry, stores + transformers/ (see "Receipt profiles")
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
samples/                  # test corpus, organized by store chain (subfolders)
├─ costco/*.jpg           # Costco receipts (PXL_*, 4967*); some shot rotated 90°
└─ samsclub/*.jpg         # Sam's Club receipts (sams-club-*)
```

OCR now **auto-corrects orientation** before recognizing (Tesseract OSD — see
the gotchas), so the old `rotated_*` upright copies were removed: feed any sample
to Tesseract regardless of how it was shot.

### Reference docs (read these instead of guessing or duplicating)

- **`receipt-enricher/README.md`** — the **canonical user-facing guide**: quick
  start, the modes table, the full env-var **Configuration reference**, Podman
  notes, REST/Telegram usage, and Troubleshooting. It's the source of truth for
  "how does an operator run/configure this?" — read it (don't restate it) when a
  question is about setup, config defaults, or the supported run modes.
- **`receipt-enricher/docs/API.md`** — full HTTP API reference + curl walkthrough.
- **`receipt-enricher/test/README.md`** — test design / coverage map.
- **[`references/stack-bringup.md`](references/stack-bringup.md)** — idioms for
  standing up a fresh, isolated stack for a purpose (qa/feat prefixes), built on
  the parameterized compose file; points back to the README for the rest.

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
  `podman-compose -p receipt-enricher down` then `podman-compose -p receipt-enricher up --build -d`.
- **Always pass `-p receipt-enricher`.** podman-compose names built images
  `<project>_<service>` and resolves the project name from (in order) the `-p`
  flag → `COMPOSE_PROJECT_NAME` → the compose `name:` (`${RECEIPT_PROJECT:-receipt-enricher}`)
  → the dir basename. A `RECEIPT_PROJECT` or `COMPOSE_PROJECT_NAME` left exported
  in your shell silently poisons the name; an invalid value (one not starting
  with a letter/digit) makes the build fail with `Error: tag
  _-receipt-enricher_worker: invalid reference format` (podman rejects the image
  tag — note `redis` still builds since it uses a prebuilt image). The norm regex
  `[^-_a-z0-9]` keeps leading `_`/`-`, so the junk survives to the tag. `-p` wins
  over both env vars and `name:`, so it's deterministic regardless of environment.
  If you skip `-p`, first `echo "$RECEIPT_PROJECT"; echo "$COMPOSE_PROJECT_NAME"`
  and `unset` any stray value.

```bash
export PATH="/opt/podman/bin:$PATH"
cd receipt-enricher
podman-compose -p receipt-enricher up --build -d   # redis + api(:8080) + worker
curl -fsS localhost:8080/health | jq .
podman-compose -p receipt-enricher down            # stop, KEEP volumes
podman-compose -p receipt-enricher down -v         # stop + WIPE data volumes (fresh slate)
```

**Pin the OCR engine at `up` time** by prefixing the env var (it's a host-side
compose param, *not* a CLI/per-upload flag): `OCR_PROVIDER=tesseract
podman-compose -p receipt-enricher up --build -d`. Add `--no-cache` for a
guaranteed clean image (the README quick-start does). `/health` is your
confirmation — it returns `{status, redis, ocrProvider, enrichment,
receiptProfiles, time}` (`src/app.js`), so `jq '{status, ocrProvider,
receiptProfiles}'` tells you in one shot whether the engine pin took
(`ocrProvider: "tesseract"` vs a plain `up`'s `"auto"`) and how many profiles
seeded. `status` is `ok` only when Redis is up.

The compose file is **parameterized** with prod-safe defaults, so the same file
serves prod and the test suite: `RECEIPT_PROJECT` (project name),
`RECEIPT_API_PORT` (host port), `OCR_PROVIDER`, `RECEIPT_SUITE` (container
label), `PUBLIC_BASE_URL`. A plain `up` is unchanged (project `receipt-enricher`,
port 8080, `auto` OCR). **`PUBLIC_BASE_URL` defaults to `http://localhost:8080`
and is what the API advertises in `statusUrl`/`viewUrl`** — set it whenever the
published host port differs (e.g. the test stack on 18080) or links point at the
wrong port.

**Fresh stack for a specific purpose (qa / feat / repro).** Because the compose
file is parameterized, you can run a second, fully isolated stack by varying
host-side env vars — pick a purpose **prefix** and a free port, and keep `-p`,
`RECEIPT_PROJECT`, and `PUBLIC_BASE_URL` consistent (volumes are namespaced by
project name, so isolation from prod is automatic):

```bash
PREFIX=feat; PORT=38080; PROJ=${PREFIX}-receipt-enricher   # qa→28080, feat→38080, …
RECEIPT_PROJECT=$PROJ RECEIPT_API_PORT=$PORT RECEIPT_SUITE=$PREFIX \
PUBLIC_BASE_URL=http://localhost:$PORT OCR_PROVIDER=tesseract \
  podman-compose -p "$PROJ" up --build --no-cache -d
API_URL=http://localhost:$PORT ./cli/receipts health        # CLI needs API_URL set
podman-compose -p "$PROJ" down -v                            # teardown (same -p!)
```

The acceptance suite is just the canonical instance of this pattern
(`test-receipt-enricher` on `18080`). **For the full parameter matrix, port
convention, and the prefix-specific gotchas, read
[`references/stack-bringup.md`](references/stack-bringup.md).**

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

## Receipt profiles & transformers (post-OCR cleanup)

A *profile* is metadata that binds a name to a **transformer** — a code module
under `src/receiptProfiles/transformers/` (loaded by `registry.js`, listed at
`GET /api/transformers`). Applying a profile runs the transformer over a parsed
receipt and stores the result **separately** with a change log; the original
record is never mutated. This is orthogonal to OCR: the *engine* (Tesseract vs
vision) is chosen at stack-up time via `OCR_PROVIDER`; the *profile* is a
separate post-OCR step. Two transformers ship, each tuned to its OCR source:

| Transformer        | Tuned for         | What it does                                            |
|--------------------|-------------------|---------------------------------------------------------|
| `usGrocery`        | clean vision output | normalize store/date, fold per-item discounts, rewrite Costco water |
| `tesseractGroceryUs` | noisy Tesseract output | strip junk prefixes + embedded SKUs, Title-Case ALL-CAPS, recover store name, rewrite water |

**Seeding (and its sharp edge).** On boot `server.js` calls
`profileStore.seedIfEmpty()`, which loads **every** `*.json` in
`src/receiptProfiles/seedProfiles/`. Two seed files ship, so a fresh store gets
two profiles: **`usGrocery1`** (→ `usGrocery`, the vision pairing) and
**`tesseractGroceryUs1`** (→ `tesseractGroceryUs`, the Tesseract pairing). The
gotcha is in the name: it seeds **only when the profile store is empty**. Adding
or changing a seed file therefore does *nothing* to an existing store — you must
wipe the data volume (`podman-compose -p receipt-enricher down -v`) and bring it
back up for new seeds to take. Confirm with `curl -fsS localhost:8080/health |
jq .receiptProfiles` (expect 2) or `GET /api/receiptProfiles`. Profile names
must be camelCase letters/digits, no dashes/spaces (`validate.js` `NAME_RE`).

**Applying a profile.** Three paths: at upload (`receipts upload <img> --profile
<id|name>`, or raw `-F profileId=<id|name>` → runs a BullMQ flow: OCR child →
applyProfile parent); after the fact (`POST /api/receipts/<id>/applyProfile/
<name>`, `?async=1` to queue it); or server-wide via `DEFAULT_PROFILE_ID`
(`config.defaultProfileId`) so every upload that omits one gets it.
`profileStore.get()` resolves a profile by `rp_…` id **or** by name. The cleaned
result is at `GET /api/receipts/<id>/profileResults/<name>` and viewable at
`…/profileResults/<name>/view`.

**Debugging a profile upload that 400s.** `receipts upload --profile foo` failing
with a bare `curl: (22) … 400` almost always means the profile doesn't exist —
the route returns `400 {"error":"unknown profile \"foo\""}`, but the CLI's
`curl -fsS` swallows the body so you only see the code. See the real error with:
`curl -sS -o /tmp/b -w 'HTTP %{http_code}\n' -F receipt=@<img> -F
profileId=<name> localhost:8080/api/receipts; cat /tmp/b`. The fix is usually to
register/seed the profile (see seeding above), not to change the upload.

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

4. **Tesseract needs local language data (orientation is now auto-handled).**
   - **Orientation:** the pipeline auto-corrects rotation before recognizing —
     `src/ocr/tesseract.js` runs Tesseract OSD (`tessdata/osd.traineddata`, the
     legacy oem-0 core) to detect the 90° quadrant, then recognizes with it
     corrected; with nothing to correct it falls back to `rotateAuto` for skew.
     OSD is best-effort (skips below `config.tesseractOsdMinConfidence`, or if
     `osd.traineddata` is missing). So you no longer need an upright copy — feed
     any orientation; the old `rotated_*` samples were deleted accordingly.
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

**Run Tesseract offline on a sample (any orientation — auto-corrected):**
```bash
SAMPLE_IMAGE=samples/costco/PXL_20260526_235419811.jpg npm run test:live:tesseract
```

**Run the whole sample corpus through the containerized Tesseract + cleanup
profile** (the CLI selects a *profile*, not the engine; the engine is pinned at
`up` time — see Receipt profiles for why both pieces are needed):
```bash
export PATH="/opt/podman/bin:$PATH"; cd receipt-enricher
OCR_PROVIDER=tesseract podman-compose -p receipt-enricher up --build -d
curl -fsS localhost:8080/health | jq '{status, ocrProvider, receiptProfiles}'  # expect tesseract, ≥2
for img in ../samples/*/*.jpg; do
  ./cli/receipts upload "$img" --wait --profile tesseractGroceryUs1
done
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
- **Keep `docs/API.md` in sync with the routes.** It's the canonical HTTP API
  reference. Whenever you add, remove, or change an endpoint in
  `src/routes/*.js` (path, method, query params, request/response shape, or
  status codes), update `docs/API.md` in the same change — both the **Endpoints**
  table and the relevant section/curl example. The web routes live alongside the
  REST routes (e.g. `src/routes/receiptProfiles.js` carries both `/api/...` and
  the HTML `/...view`/list views), so a "just a view" change still counts.
