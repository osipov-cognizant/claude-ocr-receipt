# shellcheck shell=bash
# Engine-aware compose lifecycle. SOURCE after lib/common.sh.
#
# Everything here is scoped to the TEST project ($RE_TEST_PROJECT) via -p, so it
# can never touch a production stack on the same host. stack_down additionally
# refuses to run if the project name equals the production name.

# Resolve the compose command into the array _COMPOSE_CMD.
_resolve_engine() {
  case "$RE_TEST_ENGINE" in
    podman)
      # podman lives in /opt/podman/bin on this host; ensure it's reachable.
      case ":$PATH:" in
        *":/opt/podman/bin:"*) ;;
        *) PATH="/opt/podman/bin:$PATH"; export PATH ;;
      esac
      command -v podman-compose >/dev/null 2>&1 || \
        die "podman-compose not found (RE_TEST_ENGINE=podman). Plain 'podman compose' is not used."
      _COMPOSE_CMD=(podman-compose)
      ;;
    docker)
      command -v docker >/dev/null 2>&1 || die "docker not found (RE_TEST_ENGINE=docker)"
      _COMPOSE_CMD=(docker compose)
      ;;
    *)
      die "unknown RE_TEST_ENGINE='$RE_TEST_ENGINE' (use 'podman' or 'docker')"
      ;;
  esac
}

# Run a compose subcommand against the test project + base compose file.
compose() {
  _resolve_engine
  ( cd "$PROJECT_DIR" && "${_COMPOSE_CMD[@]}" -p "$RE_TEST_PROJECT" -f docker-compose.yml "$@" )
}

# Run a shell command inside a service container (api|worker|redis). -T disables
# the pseudo-TTY so output is capturable in $(...). Used by the stack/ checks to
# assert image contents (e.g. the Tesseract blobs are baked in).
in_container() {
  compose exec -T "$1" sh -c "$2"
}

# Build + start the test stack, then wait until /health is OK.
stack_up() {
  info "engine=$RE_TEST_ENGINE  project=$RE_TEST_PROJECT  port=$RE_TEST_API_PORT  ocr=$RE_TEST_OCR"
  info "building + starting the test stack ..."
  compose up --build -d || die "compose up failed"
  wait_healthy
}

# Poll the API /health endpoint until it returns 200 (status ok) or times out.
wait_healthy() {
  info "waiting for $RE_TEST_BASE/health ..."
  local waited=0
  while :; do
    if curl -fsS "$RE_TEST_BASE/health" >/dev/null 2>&1; then
      info "stack is healthy at $RE_TEST_BASE"
      return 0
    fi
    if [ "$waited" -ge "$RE_TEST_POLL_TIMEOUT" ]; then
      warn "last container status:"; compose ps >&2 || true
      die "stack did not become healthy within ${RE_TEST_POLL_TIMEOUT}s"
    fi
    sleep 2; waited=$((waited + 2))
  done
}

# Tear down the test stack. Removes volumes unless RE_TEST_KEEP_VOLUMES=1.
stack_down() {
  # SAFETY GUARD: never operate on the production project name.
  if [ "$RE_TEST_PROJECT" = "$PROD_PROJECT_NAME" ]; then
    die "refusing to tear down project '$RE_TEST_PROJECT' (matches production name '$PROD_PROJECT_NAME'). Set RE_TEST_PROJECT to a test-only name."
  fi
  if [ "$RE_TEST_KEEP_VOLUMES" = "1" ]; then
    info "tearing down '$RE_TEST_PROJECT' (keeping volumes)"
    compose down || warn "compose down returned non-zero"
  else
    info "tearing down '$RE_TEST_PROJECT' (removing volumes)"
    compose down -v || warn "compose down -v returned non-zero"
    # Belt-and-suspenders: ensure the named volumes are gone even if the engine
    # ignored -v. Scoped strictly to the test project.
    _resolve_engine
    if [ "${_COMPOSE_CMD[0]}" = "podman-compose" ]; then
      podman volume rm "${RE_TEST_PROJECT}_redis-data" "${RE_TEST_PROJECT}_receipt-data" >/dev/null 2>&1 || true
    fi
  fi
  rm -f "$RE_STATE_ID_FILE"
}
