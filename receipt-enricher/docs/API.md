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
> stack running** (`docker compose up` / `podman-compose up` — see the README).
> The read endpoints (`GET …`) and the web views only read records from disk and
> work without Redis.

---

## Endpoints

| Method | Path | Purpose | Returns |
|--------|------|---------|---------|
| `GET`  | `/health` | Liveness + Redis/config status | JSON |
| `POST` | `/api/receipts` | Upload a receipt image (enqueues processing) | `202` JSON |
| `GET`  | `/api/receipts` | List recent receipts (`?limit=`, max 500) | JSON array |
| `GET`  | `/api/receipts/:id` | Full record for one receipt | JSON |
| `GET`  | `/receipts/:id/view` | Human-readable HTML view | HTML |
| `GET`  | `/receipts/:id/image` | The original uploaded photo | image bytes |
| `GET`  | `/` | HTML list of all receipts | HTML |

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
  "time": "2026-06-03T20:00:00.000Z"
}
```
Returns `200` when Redis is reachable, `503` (`status: "degraded"`) otherwise.

### `POST /api/receipts`

Multipart upload. The file field may be named **`receipt`** (preferred),
`file`, or `image`. Optional text field `source` tags the origin (`api`, `cli`,
`telegram`, …). Max size: `MAX_UPLOAD_MB` (default 15 MB). Only `image/*` types
are accepted.

```bash
curl -fsS \
  -F "receipt=@/path/to/receipt.jpg" \
  -F "source=curl" \
  "$BASE/api/receipts"
```
```json
{
  "id": "1b70d95bbd9f462f",
  "status": "queued",
  "statusUrl": "http://localhost:8080/api/receipts/1b70d95bbd9f462f",
  "viewUrl": "http://localhost:8080/receipts/1b70d95bbd9f462f/view"
}
```
Responds `202 Accepted` immediately; processing happens asynchronously.
Errors: `400` (no/invalid image), `413` (too large).

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

## Notes

- **Enrichment** (per-item images/metadata via Tavily) only runs when
  `TAVILY_API_KEY` is set; otherwise items list cleanly with no `imageUrl`.
- **Extraction quality**: a vision model (`ANTHROPIC_API_KEY` /
  `VISION_PROVIDER=openai`) reads layout and returns clean items; with no key it
  falls back to offline Tesseract OCR (best on an upright, sharp photo).
- **No HEIC**: convert iPhone HEIC photos to JPEG/PNG before uploading.
- The id is a 16-char hex token; records are durable JSON files under `DATA_DIR`.
