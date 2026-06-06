# Receipt Enricher — HTTP API

The backend exposes a small REST API plus server-rendered web views. The same
endpoints back both ingestion paths (the bash CLI and the Telegram bot) and the
browser views.

- **Base URL:** `http://localhost:8080` (override with `PUBLIC_BASE_URL`; the
  examples below use a `BASE` shell variable). The `statusUrl`/`viewUrl` the API
  returns are built from `PUBLIC_BASE_URL`, so set it to the address you actually
  publish — e.g. when the container's `8080` is mapped to a different host port
  (the acceptance suite publishes `18080`), point `PUBLIC_BASE_URL` there or the
  returned links won't resolve.
- **Auth:** none. Run it on a trusted network or behind a reverse proxy.
- **Content types:** JSON for the API, `multipart/form-data` for uploads,
  `text/html` for the views.

```bash
BASE=http://localhost:8080      # or: API_URL for the CLI / a remote host
```

---

## Receipt lifecycle

A receipt moves through these `status` values:

```
queued  ──►  processing  ──►  done
                   └────────►  failed
```

- `queued` — accepted, image saved, job enqueued.
- `processing` — the worker is running extract → parse → enrich → summarize.
- `done` — finished; items, totals and summary are populated.
- `failed` — all retries exhausted; `error` holds the reason.

> Uploading enqueues a job on Redis/BullMQ, so the **upload path needs the full
> stack running** (`docker compose up` / `podman-compose -p receipt-enricher up` — see the README).
> The read endpoints (`GET …`) and the web views only read records from disk and
> work without Redis.

---

## Endpoints

| Method | Path | Purpose | Returns |
|--------|------|---------|---------|
| `GET`  | `/health` | Liveness + Redis/config status | JSON |
| `POST` | `/api/receipts` | Upload a receipt image (enqueues processing; optional `profileId` applies a profile after OCR) | `202` JSON |
| `GET`  | `/api/receipts` | List recent receipts (`?limit=`, max 500) | JSON array |
| `GET`  | `/api/receipts/:id` | Full record for one receipt | JSON |
| `GET`  | `/receipts/:id/view` | Human-readable HTML view | HTML |
| `GET`  | `/receipts/:id/image` | The original uploaded photo | image bytes |
| `GET`  | `/` | HTML list of all receipts | HTML |
| `GET`  | `/api/transformers` | List available transformers | JSON array |
| `GET`  | `/api/receiptProfiles` | List receipt profiles | JSON array |
| `POST` | `/api/receiptProfiles` | Create a profile | `201` JSON |
| `GET`  | `/api/receiptProfiles/:id` | One profile (id or name) | JSON |
| `PUT`  | `/api/receiptProfiles/:id` | Replace a profile | JSON |
| `DELETE` | `/api/receiptProfiles/:id` | Delete a profile | `204` |
| `POST` | `/api/receipts/:id/applyProfile/:profileId` | Apply a profile to a receipt (`?dryRun=1`, `?async=1`) | JSON / `202` |
| `GET`  | `/api/receipts/:id/profileResults` | List profile results for a receipt | JSON array |
| `GET`  | `/api/receipts/:id/profileResults/:profileId` | One profile result | JSON |
| `GET`  | `/receipts/:id/profileResults/:profileId/view` | HTML view of the receipt with the profile applied | HTML |
| `GET`  | `/api/profileResults` | List **all** profile results across every receipt | JSON array |
| `GET`  | `/api/profileResults/:profileId` | All results for one profile (id or name), across every receipt | JSON array |
| `GET`  | `/profileResults` | HTML list of all profile results | HTML |
| `GET`  | `/profileResults/:profileId` | HTML list of results for one profile (id or name) | HTML |

The profile endpoints are documented in **[Receipt Profiles](#receipt-profiles)** below.

### `GET /health`

```bash
curl -fsS "$BASE/health" | jq .
```
```json
{
  "status": "ok",
  "redis": "up",
  "ocrProvider": "vision",
  "enrichment": "disabled",
  "receiptProfiles": 1,
  "time": "2026-06-03T20:00:00.000Z"
}
```
Returns `200` when Redis is reachable, `503` (`status: "degraded"`) otherwise.

### `POST /api/receipts`

Multipart upload. The file field may be named **`receipt`** (preferred),
`file`, or `image`. Optional text field `source` tags the origin (`api`, `cli`,
`telegram`, …). Max size: `MAX_UPLOAD_MB` (default 15 MB). Only `image/*` types
are accepted.

Optional text field **`profileId`** (a profile id or name) applies a
[Receipt Profile](#receipt-profiles) right after OCR — the worker runs the
pipeline first, then the profile, wired with a BullMQ flow (`process-receipt`
child → `applyProfile` parent). An unknown profile returns `400`. A server-wide
default can be set with `DEFAULT_PROFILE_ID`; it applies when `profileId` is
omitted.

```bash
curl -fsS \
  -F "receipt=@/path/to/receipt.jpg" \
  -F "source=curl" \
  -F "profileId=usGrocery1" \
  "$BASE/api/receipts"
```
```json
{
  "id": "1b70d95bbd9f462f",
  "status": "queued",
  "profileId": "rp_9f3c1a2b4d5e6f70",
  "profileResultUrl": "http://localhost:8080/api/receipts/1b70d95bbd9f462f/profileResults/rp_9f3c1a2b4d5e6f70",
  "statusUrl": "http://localhost:8080/api/receipts/1b70d95bbd9f462f",
  "viewUrl": "http://localhost:8080/receipts/1b70d95bbd9f462f/view"
}
```
Responds `202 Accepted` immediately; processing happens asynchronously. Without
a `profileId`, `profileId`/`profileResultUrl` are `null`. Poll `statusUrl` until
`status` is `done`, then read `profileResultUrl` for the canonicalized result.
Errors: `400` (no/invalid image, or unknown profile), `413` (too large).

### `GET /api/receipts/:id`

```bash
curl -fsS "$BASE/api/receipts/1b70d95bbd9f462f" | jq .
```
```json
{
  "id": "1b70d95bbd9f462f",
  "status": "done",
  "source": "seed",
  "store": { "name": "Costco Wholesale", "date": "2026-05-26" },
  "items": [
    { "description": "KS WATER GAL", "sku": "931484", "qty": 1,
      "unitPrice": 4.99, "price": 4.99, "enrichment": null },
    { "description": "US WAGYU BEEF", "sku": "1455728", "qty": 1,
      "unitPrice": 19.99, "price": 19.99, "enrichment": null }
  ],
  "totals": { "subtotal": null, "tax": null, "total": null,
              "itemCount": 14, "sumOfItems": 120.11 },
  "summary": "Costco Wholesale: 14 item(s), total $120.11 (summed from items). 0 item(s) matched with images/metadata.",
  "extraction": { "provider": "vision" },
  "statusUrl": "http://localhost:8080/api/receipts/1b70d95bbd9f462f",
  "viewUrl": "http://localhost:8080/receipts/1b70d95bbd9f462f/view"
}
```
Returns `404` if the id is unknown. When `enrichment` ran, each item also carries
`{ imageUrl, title, snippet, url, ... }`.

### `GET /api/receipts?limit=N`

```bash
curl -fsS "$BASE/api/receipts?limit=20" \
  | jq '.[] | {id, status, store: .store.name, itemCount, createdAt}'
```

### `GET /receipts/:id/view` and `/receipts/:id/image`

`/view` returns the styled HTML page (open it in a browser). `/image` streams
the original photo with its stored content type.

---

## End-to-end walkthrough (curl)

Process a receipt, open the page, then pull the other representations.

```bash
BASE=http://localhost:8080
IMG=../samples/costco/PXL_20260526_235419811.jpg   # any receipt photo (JPEG/PNG)

# 1. Is the API up?
curl -fsS "$BASE/health" | jq .

# 2. Upload — capture the new id from the 202 response
ID=$(curl -fsS -F "receipt=@$IMG" -F "source=curl" "$BASE/api/receipts" | jq -r .id)
echo "receipt id: $ID"

# 3. Poll until processing finishes (done or failed)
until s=$(curl -fsS "$BASE/api/receipts/$ID" | jq -r .status); \
      [ "$s" = "done" ] || [ "$s" = "failed" ]; do
  printf '  status: %s\r' "$s"; sleep 2;
done
echo "final status: $s"

# 4. Open the human-readable view in your browser
open    "$BASE/receipts/$ID/view"   # macOS
# xdg-open "$BASE/receipts/$ID/view" # Linux

# 5. Fetch the structured JSON
curl -fsS "$BASE/api/receipts/$ID" | jq '{store: .store.name, items: (.items|length), summary}'

# 6. Save the original photo
curl -fsS "$BASE/receipts/$ID/image" -o "receipt-$ID.jpg"
echo "saved receipt-$ID.jpg"

# 7. See it in the list
curl -fsS "$BASE/api/receipts" | jq '.[] | {id, status, store: .store.name, itemCount}'
```

If you only want to **view an already-processed receipt** (no upload), skip to
steps 4–6 with a known `ID` — those work even when Redis isn't running.

---

## CLI shortcut

The bundled bash CLI wraps these calls (no Node required — just `curl`, plus
`jq` for pretty output):

```bash
./cli/receipts health
./cli/receipts upload "$IMG" --wait     # upload + poll, prints the view URL
./cli/receipts status <id>              # full JSON record
./cli/receipts list                     # recent receipts
./cli/receipts view <id>                # print + open the web view
```

Point it at another host with `API_URL=http://my-host:8080 ./cli/receipts …`.

---

## Receipt Profiles

A **receipt profile** canonicalizes a parsed receipt — normalizing store names,
date formats, and item descriptions, and folding per-item discount lines into the
item they apply to — by running a **transformer** (a small TypeScript/JavaScript
module shipped with the app). You apply a profile to an
already-processed receipt; the original record is never modified, and the result
(plus an auto-derived change log) is stored separately. Design details:
[`docs/RECEIPT-PROFILES.md`](RECEIPT-PROFILES.md).

- A **profile** is metadata: `{ name, description, transformer, config }`. It
  binds a name to a transformer id and an optional `config` object.
- A **transformer** is code under `src/receiptProfiles/transformers/`, referenced
  by id (filename without extension). Transformers are **not** uploaded via the
  API — there is no remote code execution.

### Transformers

```bash
curl -fsS "$BASE/api/transformers" | jq .
```
```json
[ { "id": "usGrocery", "name": "usGrocery", "version": 1,
    "description": "Normalize common US grocery receipts …" },
  { "id": "tesseractGroceryUs", "name": "tesseractGroceryUs", "version": 1,
    "description": "Clean up noisy Tesseract OCR output for US grocery receipts …" } ]
```

`usGrocery` also **folds per-item discounts** into the item they apply to, so the
net price shows on one row instead of a separate negative line. Association is
store-specific: at **Costco** the discount line sits next to its item and
references the item's SKU (e.g. `Discount 975416`); at **Sam's Club** a single
`Instant Savings` line is printed at the bottom and names the item
(`Dog Chow (Inst Sv)`). The folded amount is recorded on the item's `discount`
field and surfaced in the HTML view; a discount that can't be matched is left as
its own line rather than guessed onto the wrong item.

`tesseractGroceryUs` is a derivative of `usGrocery` tuned for the offline
**Tesseract** pipeline: it strips OCR junk + the embedded SKU code, Title-Cases
item names, expands common abbreviations, and infers the store from Kirkland
items. Use it when receipts are processed with `OCR_PROVIDER=tesseract`.

### Profile CRUD

```bash
# Create — body is the profile metadata (transformer must be a known id)
curl -fsS -X POST "$BASE/api/receiptProfiles" -H 'content-type: application/json' -d '{
  "name": "usGrocery1",
  "description": "Normalize US grocery receipts",
  "transformer": "usGrocery",
  "config": {}
}'
```
```json
{
  "id": "rp_9f3c1a2b4d5e6f70",
  "name": "usGrocery1",
  "description": "Normalize US grocery receipts",
  "version": 1,
  "transformer": "usGrocery",
  "config": {},
  "createdAt": "2026-06-04T18:20:00.000Z",
  "updatedAt": "2026-06-04T18:20:00.000Z"
}
```

Other operations (`:id` accepts the profile **id or name**):

```bash
curl -fsS "$BASE/api/receiptProfiles"                 # list (summaries)
curl -fsS "$BASE/api/receiptProfiles/usGrocery1"      # one (id or name)
curl -fsS -X PUT "$BASE/api/receiptProfiles/usGrocery1" \
  -H 'content-type: application/json' -d @profile.json # replace (bumps version)
curl -fsS -X DELETE "$BASE/api/receiptProfiles/usGrocery1"   # -> 204
```

A shipped example profile (`usGrocery1` → the `usGrocery` transformer) is seeded
on first boot. Validation errors return `400` with a `details` array:

```json
{ "error": "profile validation failed",
  "details": ["unknown transformer \"foo\"; available: usGrocery"] }
```

### Apply a profile

```bash
# Apply to an already-processed receipt; persists the result.
curl -fsS -X POST "$BASE/api/receipts/$ID/applyProfile/usGrocery1" | jq .
```
```json
{
  "receiptId": "1b70d95bbd9f462f",
  "profileId": "rp_9f3c1a2b4d5e6f70",
  "profileName": "usGrocery1",
  "profileVersion": 1,
  "transformer": "usGrocery",
  "appliedAt": "2026-06-04T18:20:05.000Z",
  "dryRun": false,
  "store":  { "name": "Costco", "date": "05-26-2026" },
  "items":  [ { "description": "Water 5 Liter", "price": 4.99, … }, … ],
  "totals": { "itemCount": 14, "sumOfItems": 125.11, "subtotalMatch": null, … },
  "changes": [
    { "field": "store.name", "from": "Costco Wholesale", "to": "Costco" },
    { "field": "item.description", "itemIndex": 0, "from": "KS Water Gal", "to": "Water 5 Liter" }
  ]
}
```

Add `?dryRun=1` to run the transform and return the result **without** persisting
it (handy for trying a profile). Errors: `404` (unknown receipt or profile),
`422` (the profile's transformer is no longer available).

Add `?async=1` to apply the profile **in the background** via a BullMQ
`applyProfile` job instead of inline. It validates the receipt/profile, returns
`202` with `{ receiptId, profileId, status: "queued", profileResultUrl }`, and
the result appears at `profileResultUrl` once the worker finishes:

```bash
curl -fsS -X POST "$BASE/api/receipts/$ID/applyProfile/usGrocery1?async=1" | jq .
```
```json
{
  "receiptId": "1b70d95bbd9f462f",
  "profileId": "rp_9f3c1a2b4d5e6f70",
  "status": "queued",
  "profileResultUrl": "http://localhost:8080/api/receipts/1b70d95bbd9f462f/profileResults/rp_9f3c1a2b4d5e6f70"
}
```

### Read results

```bash
curl -fsS "$BASE/api/receipts/$ID/profileResults"               # all results
curl -fsS "$BASE/api/receipts/$ID/profileResults/usGrocery1"    # one (id or name)
open "$BASE/receipts/$ID/profileResults/usGrocery1/view"        # HTML, discounts folded in
```

The `…/view` endpoint renders the profile-applied receipt as HTML — discounts
fold into their line item (with the pre-discount price struck through). It shows
the stored result when present, otherwise computes it on the fly (no persistence).

### Browse results across receipts

The endpoints above are scoped to one receipt. To see results **across all
receipts** — e.g. every receipt cleaned by a given transformer profile — use the
cross-receipt endpoints (results are sorted newest-first by `appliedAt`):

```bash
curl -fsS "$BASE/api/profileResults"                  # every result, all receipts
curl -fsS "$BASE/api/profileResults/usGrocery1"       # only this profile (id or name)
open "$BASE/profileResults"                            # HTML list of all results
open "$BASE/profileResults/usGrocery1"                 # HTML list filtered to one profile
```

The `:profileId` accepts a profile **id or name** (a name is resolved to its id,
which is how results are keyed). An **unknown profile returns an empty array**
(`200`), not `404`, so results from a since-deleted profile stay reachable by
their raw `rp_…` id. The HTML list at `/profileResults` links each row to its
per-result `…/view`; the profile badge on each row links to that profile's
filtered list.

> Profiles and results are durable JSON under `DATA_DIR/receiptProfiles/` and
> `DATA_DIR/profileResults/<receiptId>/`. Applying a profile is **synchronous by
> default** (the transform is pure and fast); pass `?async=1` to run it on the
> worker, or set a `profileId` at upload time to chain it after OCR via a flow.

---

## Notes

- **Enrichment** (per-item images/metadata via Tavily) only runs when
  `TAVILY_API_KEY` is set; otherwise items list cleanly with no `imageUrl`.
- **Extraction quality**: a vision model (`ANTHROPIC_API_KEY` /
  `VISION_PROVIDER=openai`) reads layout and returns clean items; with no key it
  falls back to offline Tesseract OCR (best on an upright, sharp photo).
- **No HEIC**: convert iPhone HEIC photos to JPEG/PNG before uploading.
- The id is a 16-char hex token; records are durable JSON files under `DATA_DIR`.
