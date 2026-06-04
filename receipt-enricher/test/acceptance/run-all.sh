#!/usr/bin/env bash
# Full acceptance suite: bring up an isolated TEST stack, run every cli/ and
# rest/ step, then tear it down. Exits non-zero if any step fails.
#
# Common overrides (env or flags):
#   --engine podman|docker     RE_TEST_ENGINE       (default podman)
#   --ocr tesseract|vision     RE_TEST_OCR          (default tesseract, offline)
#   --vision                   shortcut for --ocr vision
#   --keep-volumes             RE_TEST_KEEP_VOLUMES=1 (keep data on teardown)
#   --no-teardown              RE_TEST_NO_TEARDOWN=1  (leave the stack running)
#   -h | --help
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --engine)       RE_TEST_ENGINE="${2:?}"; shift 2 ;;
    --ocr)          RE_TEST_OCR="${2:?}"; shift 2 ;;
    --vision)       RE_TEST_OCR="vision"; shift ;;
    --keep-volumes) RE_TEST_KEEP_VOLUMES=1; shift ;;
    --no-teardown)  RE_TEST_NO_TEARDOWN=1; shift ;;
    -h|--help)      usage 0 ;;
    *) echo "unknown arg: $1" >&2; usage 1 ;;
  esac
done
export RE_TEST_ENGINE RE_TEST_OCR RE_TEST_KEEP_VOLUMES RE_TEST_NO_TEARDOWN 2>/dev/null || true

. "$DIR/lib/common.sh"
. "$DIR/lib/compose.sh"
require_curl; require_jq

STEPS_RUN=0
STEPS_FAILED=0
FAILED_NAMES=""

run_step() {
  local script="$1"
  STEPS_RUN=$((STEPS_RUN + 1))
  if bash "$script"; then
    return 0
  else
    STEPS_FAILED=$((STEPS_FAILED + 1))
    FAILED_NAMES="$FAILED_NAMES ${script#$DIR/}"
  fi
}

teardown() {
  if [ "$RE_TEST_NO_TEARDOWN" = "1" ]; then
    warn "RE_TEST_NO_TEARDOWN=1 — leaving '$RE_TEST_PROJECT' running at $RE_TEST_BASE"
    warn "tear down later with: RE_TEST_PROJECT=$RE_TEST_PROJECT bash $DIR/lifecycle/99_down.sh"
    return 0
  fi
  stack_down
}
trap teardown EXIT

# --- bring up the isolated test stack --------------------------------------
stack_up

# --- run every step, in order, cli/ then rest/ -----------------------------
for d in cli rest; do
  for s in "$DIR/$d"/*.sh; do
    [ -f "$s" ] || continue
    run_step "$s"
  done
done

# --- summary ---------------------------------------------------------------
printf '\n%s\n' "${_C_BLU}================ ACCEPTANCE SUMMARY ================${_C_RST}" >&2
if [ "$STEPS_FAILED" -eq 0 ]; then
  printf '%s\n' "${_C_GRN}All ${STEPS_RUN} step(s) passed.${_C_RST}" >&2
else
  printf '%s\n' "${_C_RED}${STEPS_FAILED} of ${STEPS_RUN} step(s) failed:${_C_RST}${FAILED_NAMES}" >&2
fi

[ "$STEPS_FAILED" -eq 0 ]
