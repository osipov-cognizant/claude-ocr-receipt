# Acceptance suite (bash + curl)

Black-box acceptance tests that bring up the app as a **containerized stack** and
exercise it from the outside — through the bundled CLI (`cli/receipts`) and the
raw REST API. Distinct from the in-process `node:test` suites (`npm test` is
hermetic; `test/live/*` are node-driven live tests).

```
test/acceptance/
├─ run-all.sh        # up → cli/ steps → rest/ steps → teardown
├─ lib/
│  ├─ common.sh      # config, logging, assertions, shared helpers (sourced)
│  └─ compose.sh     # engine-aware up / wait-healthy / down (sourced)
├─ lifecycle/
│  ├─ 00_up.sh       # build + start the isolated test stack, wait until healthy
│  └─ 99_down.sh     # tear down (removes volumes by default)
├─ cli/              # driven through ./cli/receipts and ./cli/products
│  ├─ 10_health.sh  20_upload.sh  30_list.sh  40_view.sh
│  └─ 50_productsCacheIo.sh   # `products` CLI cache export/import round-trip (offline)
└─ rest/             # driven through raw curl
   ├─ 10_health.sh  20_upload.sh  30_list.sh  40_image.sh  50_view.sh  60_errors.sh
   ├─ 70_applyProfile.sh        # apply a profile to a processed receipt (sync)
   ├─ 80_uploadWithProfile.sh   # upload with profileId → OCR-then-profile BullMQ flow
   ├─ 81_tesseractProfile.sh    # tesseractGroceryUs cleanup profile (Tesseract mode only)
   ├─ 90_resolveProducts.sh     # resolve products from a profile result (sync/async/dryRun)
   └─ 95_multitenancy.sh        # dynamic tenant onboarding, per-tenant queues, cross-tenant/user isolation
```

Steps auto-discover: `run-all.sh` runs every `cli/*.sh` then `rest/*.sh` in name
order. The profile-content assertions in `70`/`80` only run under `--vision`
(under Tesseract the store name is unreadable, so `usGrocery` is a near no-op);
`81` is the reverse — it exercises the `tesseractGroceryUs` cleanup profile and
**skips under `--vision`**.

## Isolation from production (run it on a host that already runs the app)

The suite **never touches a production stack**. Three layers:

| Mechanism | Production | Test suite |
|-----------|-----------|------------|
| compose project | `receipt-enricher` | `test-receipt-enricher` (`test-` prefix → obvious in `podman ps`) |
| container label | `io.receipt-enricher.suite=prod` | `io.receipt-enricher.suite=test` |
| host port | `8080` | `18080` |
| volumes | `receipt-enricher_*` | `test-receipt-enricher_*` |

`lifecycle/99_down.sh` (and `run-all.sh` teardown) is scoped strictly to the test
project **and refuses to run if the project name equals `receipt-enricher`**, so a
misconfiguration can't wipe prod data.

## Usage

```bash
cd receipt-enricher

# Whole suite: up → all steps → teardown (volumes removed)
bash test/acceptance/run-all.sh

# Keep the stack up afterward to poke at it, or keep its data:
bash test/acceptance/run-all.sh --no-teardown
bash test/acceptance/run-all.sh --keep-volumes

# Use the Anthropic vision path instead of offline Tesseract:
bash test/acceptance/run-all.sh --vision        # (or --ocr vision)

# Run individual steps (stack must be up first):
bash test/acceptance/lifecycle/00_up.sh
bash test/acceptance/rest/20_upload.sh
bash test/acceptance/cli/30_list.sh
bash test/acceptance/lifecycle/99_down.sh
```

Each step is self-contained: steps that need a processed receipt reuse a cached
id (`.state/receipt_id`) or create one on demand, and fail fast with a clear
message if the stack isn't up.

## OCR modes

- **`tesseract` (default)** — fully offline (local `tessdata` + bundled
  `tesseract.js-core`); no API key or network needed. Extraction is best-effort,
  so steps only assert pipeline completion (`status==done`) and structure, not
  item counts.
- **`vision`** — uses `ANTHROPIC_API_KEY` from `.env` with `claude-sonnet-4-6`.
  Costs a few API calls per run; adds stricter assertions (items > 0, store
  detected, totals sum > 0).

## Configuration (env vars, all defaulted)

| Var | Default | Meaning |
|-----|---------|---------|
| `RE_TEST_ENGINE` | `podman` | `podman` (uses `podman-compose`) or `docker` (`docker compose`) |
| `RE_TEST_PROJECT` | `test-receipt-enricher` | compose project name (isolation) |
| `RE_TEST_API_PORT` | `18080` | host port for the test API |
| `RE_TEST_BASE` | `http://localhost:$RE_TEST_API_PORT` | base URL the steps hit |
| `RE_TEST_OCR` | `tesseract` | `tesseract` or `vision` |
| `RE_TEST_SAMPLE` | upright costco sample | receipt image to upload |
| `RE_TEST_KEEP_VOLUMES` | `0` | `1` keeps volumes on teardown |
| `RE_TEST_NO_TEARDOWN` | `0` | `1` leaves the stack running after `run-all.sh` |
| `RE_TEST_POLL_TIMEOUT` | `240` | seconds to wait for health / processing |
| `RE_TEST_POLL_INTERVAL` | `3` | poll interval seconds |

## Requirements

`curl` and `jq` on the host; `podman` + `podman-compose` (default) or Docker.
On this host `podman` is under `/opt/podman/bin` — the suite adds it to `PATH`
automatically. Note: plain `podman compose` is **not** used (its external
docker-compose provider can't reach the podman socket here); `podman-compose` is.
