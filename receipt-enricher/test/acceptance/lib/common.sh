# shellcheck shell=bash
# Shared config + helpers for the acceptance suite. SOURCE this file; don't run it.
# Kept bash-3.2 compatible (macOS /bin/bash).

set -uo pipefail

# --- locate dirs (relative to this file) -----------------------------------
_RE_COMMON_SH="${BASH_SOURCE[0]}"
LIB_DIR="$(cd "$(dirname "$_RE_COMMON_SH")" && pwd)"
ACCEPTANCE_DIR="$(cd "$LIB_DIR/.." && pwd)"          # test/acceptance
PROJECT_DIR="$(cd "$ACCEPTANCE_DIR/../.." && pwd)"   # receipt-enricher
REPO_DIR="$(cd "$PROJECT_DIR/.." && pwd)"            # repo root (has samples/)

# --- config (all env-overridable) ------------------------------------------
RE_TEST_ENGINE="${RE_TEST_ENGINE:-podman}"                 # podman | docker
RE_TEST_PROJECT="${RE_TEST_PROJECT:-test-receipt-enricher}" # compose project (isolation)
RE_TEST_API_PORT="${RE_TEST_API_PORT:-18080}"              # host port (coexist with prod 8080)
RE_TEST_BASE="${RE_TEST_BASE:-http://localhost:${RE_TEST_API_PORT}}"
RE_TEST_OCR="${RE_TEST_OCR:-tesseract}"                    # tesseract (offline) | vision (anthropic)
RE_TEST_PERSISTENCE="${RE_TEST_PERSISTENCE:-sqlite}"       # sqlite (default) | filesystem (durable record backend)
[ "$RE_TEST_PERSISTENCE" = "fs" ] && RE_TEST_PERSISTENCE="filesystem"  # accept the 'fs' shorthand
# OCR now auto-corrects orientation, so the old upright `rotated_*` copies were
# removed — point at the as-shot sample (any orientation works).
RE_TEST_SAMPLE="${RE_TEST_SAMPLE:-$REPO_DIR/samples/costco/PXL_20260526_235419811.jpg}"
RE_TEST_KEEP_VOLUMES="${RE_TEST_KEEP_VOLUMES:-0}"          # 1 = keep volumes on teardown
RE_TEST_NO_TEARDOWN="${RE_TEST_NO_TEARDOWN:-0}"            # 1 = leave stack up after run-all
RE_TEST_POLL_TIMEOUT="${RE_TEST_POLL_TIMEOUT:-240}"        # seconds to wait for done/health
RE_TEST_POLL_INTERVAL="${RE_TEST_POLL_INTERVAL:-3}"
RE_TEST_STATE_DIR="${RE_TEST_STATE_DIR:-$ACCEPTANCE_DIR/.state}"

# The production project name we must NEVER tear down (safety guard).
PROD_PROJECT_NAME="receipt-enricher"

# Variables the parameterized docker-compose.yml interpolates. Exported so the
# compose engine (a child process) sees them.
export RECEIPT_PROJECT="$RE_TEST_PROJECT"
export RECEIPT_API_PORT="$RE_TEST_API_PORT"
export RECEIPT_SUITE="test"
export OCR_PROVIDER="$RE_TEST_OCR"
export PERSISTENCE="$RE_TEST_PERSISTENCE"
# Make the API advertise host-reachable links (statusUrl/viewUrl) on the test
# port, not the container-internal 8080.
export PUBLIC_BASE_URL="$RE_TEST_BASE"

mkdir -p "$RE_TEST_STATE_DIR"
RE_STATE_ID_FILE="$RE_TEST_STATE_DIR/receipt_id"

# --- logging ----------------------------------------------------------------
if [ -t 1 ] || [ -t 2 ]; then
  _C_RED=$'\033[31m'; _C_GRN=$'\033[32m'; _C_YEL=$'\033[33m'
  _C_BLU=$'\033[34m'; _C_DIM=$'\033[2m'; _C_RST=$'\033[0m'
else
  _C_RED=; _C_GRN=; _C_YEL=; _C_BLU=; _C_DIM=; _C_RST=
fi

info()        { printf '%s\n' "${_C_BLU}•${_C_RST} $*" >&2; }
warn()        { printf '%s\n' "${_C_YEL}!${_C_RST} $*" >&2; }
step_banner() { printf '\n%s\n' "${_C_BLU}==== $* ====${_C_RST}" >&2; }
die()         { printf '%s\n' "${_C_RED}FATAL:${_C_RST} $*" >&2; exit 1; }

TESTS_PASSED=0
TESTS_FAILED=0
pass() { TESTS_PASSED=$((TESTS_PASSED + 1)); printf '%s\n' "  ${_C_GRN}PASS${_C_RST} $*" >&2; }
fail() { TESTS_FAILED=$((TESTS_FAILED + 1)); printf '%s\n' "  ${_C_RED}FAIL${_C_RST} $*" >&2; }

# --- assertions (record pass/fail, never abort the step) --------------------
assert_eq() {        # desc expected actual
  if [ "$2" = "$3" ]; then pass "$1 (= $3)"; else fail "$1 (expected '$2', got '$3')"; fi
}
assert_http() {      # desc expected_code actual_code
  assert_eq "$1 [HTTP]" "$2" "$3"
}
assert_nonempty() {  # desc value
  if [ -n "$2" ] && [ "$2" != "null" ]; then pass "$1 ('$2')"; else fail "$1 (empty/null)"; fi
}
assert_num_gt() {    # desc value threshold
  if printf '%s' "$2" | grep -Eq '^-?[0-9]+(\.[0-9]+)?$' && awk "BEGIN{exit !($2 > $3)}"; then
    pass "$1 ($2 > $3)"
  else
    fail "$1 (value '$2' not > $3)"
  fi
}
assert_contains() {  # desc haystack needle
  case "$2" in *"$3"*) pass "$1";; *) fail "$1 (missing '$3')";; esac
}

# Print this step's tally and return non-zero if anything failed. Call last.
report() {
  printf '%s\n' "${_C_DIM}---- $(basename "$0"): ${TESTS_PASSED} passed, ${TESTS_FAILED} failed ----${_C_RST}" >&2
  [ "$TESTS_FAILED" -eq 0 ]
}

require_jq()    { command -v jq >/dev/null 2>&1 || die "jq is required (brew install jq)"; }
require_curl()  { command -v curl >/dev/null 2>&1 || die "curl is required"; }
require_stack() {
  curl -fsS "$RE_TEST_BASE/health" >/dev/null 2>&1 || \
    die "stack not reachable at $RE_TEST_BASE — run lifecycle/00_up.sh (or run-all.sh) first"
}

# Path to the CLI wrapper, pre-pointed at the test stack. Usage: "$(cli)" health
cli() { printf '%s' "$PROJECT_DIR/cli/receipts"; }

# Path to the products CLI. Usage: API_URL="$RE_TEST_BASE" "$(products_cli)" cache stats
products_cli() { printf '%s' "$PROJECT_DIR/cli/products"; }

# Render a receipt's JSON (read from stdin) as pretty-printed text. Used instead
# of opening a browser. Prints nothing if the input isn't a valid receipt.
render_receipt_text() {
  jq -r '
    "==================================================",
    "Receipt \(.id)   [\(.status)]   provider: \(.extraction.provider // "—")",
    "Store: \(.store.name // "(not detected)")" + (if .store.date then "   Date: \(.store.date)" else "" end),
    "--------------------------------------------------",
    (.items[]? | "  • " + (.description // "?") + (if (.qty != null) then "  (x\(.qty))" else "" end) + "   $" + ((.price // 0)|tostring)),
    "--------------------------------------------------",
    "Items: \(.totals.itemCount // (.items|length))   Sum: $\(.totals.sumOfItems // 0)" + (if .totals.total then "   Total: $\(.totals.total)" else "" end),
    (if .summary then "Summary: \(.summary)" else empty end),
    "=================================================="
  ' 2>/dev/null
}

# Ensure a processed receipt exists; echo its id. Caches the id so steps run
# independently but reuse the same receipt when run in sequence.
ensure_receipt() {
  require_jq
  if [ -f "$RE_STATE_ID_FILE" ]; then
    local cached; cached="$(cat "$RE_STATE_ID_FILE" 2>/dev/null)"
    if [ -n "$cached" ] && curl -fsS "$RE_TEST_BASE/api/receipts/$cached" >/dev/null 2>&1; then
      printf '%s' "$cached"; return 0
    fi
  fi
  [ -f "$RE_TEST_SAMPLE" ] || die "sample image not found: $RE_TEST_SAMPLE"
  local id
  id="$(curl -fsS -F "receipt=@$RE_TEST_SAMPLE" -F "source=acceptance" "$RE_TEST_BASE/api/receipts" | jq -r .id)"
  [ -n "$id" ] && [ "$id" != "null" ] || die "upload failed (no id returned)"
  local waited=0 s=""
  while :; do
    s="$(curl -fsS "$RE_TEST_BASE/api/receipts/$id" | jq -r .status)"
    [ "$s" = "done" ] && break
    [ "$s" = "failed" ] && die "receipt $id failed to process"
    [ "$waited" -ge "$RE_TEST_POLL_TIMEOUT" ] && die "timed out waiting for $id (last status: $s)"
    sleep "$RE_TEST_POLL_INTERVAL"; waited=$((waited + RE_TEST_POLL_INTERVAL))
  done
  printf '%s' "$id" > "$RE_STATE_ID_FILE"
  printf '%s' "$id"
}
