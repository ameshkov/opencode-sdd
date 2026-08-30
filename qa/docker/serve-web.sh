#!/usr/bin/env bash
# Launches the opencode server that SERVES THE WEB UI — the driver for the
# QA flows without a TUI/PTY: the suite's opencode session runs as a
# headless server and is driven from a browser (Playwright) or straight
# from the server API. Runs INSIDE the workspace container; the whole repo
# is baked at /app.
#
# Why: `opencode serve` (1.18.23+) serves the full web client, so the
# interactive gates the QA suite needs — the slash-command list, the agent
# selector, permission asks, and the `question`-tool interview/approval
# gates — render as DOM the browser can locate, assert and answer
# (REG-01's "(provided by opencode-sdd)" suffix, which the TUI truncates,
# is fully rendered in the web slash menu). The PTY driver stays for the
# CLI wizard (group C), which is a plain TTY inquirer program.
#
# Question tool: headless `opencode serve` gates the `question` tool to
# `app`/`cli`/`desktop` clients (upstream issues #20514, #27644, #19702),
# so the SDD HITL gates (prd-to-issues Phase 3 approval, the prd-write
# interview) would never fire. The flag below re-enables it; the web
# client renders a pending question with an answer UI (qa/README.md 3.6).
# The TUI path does not need the flag (the cli client always has it).
#
# Usage: qa/docker/serve-web.sh [project-dir] [port]
#   project-dir  defaults to /work/sdd-manual (the wired scratch project)
#   port         defaults to 4096 (container side; the host mapping is
#                QA_WEB_PORT in qa/docker-compose.ports.yml, default 4097)
#
# Env:
#   OPENCODE_ENABLE_QUESTION_TOOL  default "1" (set to an empty value to
#                                 keep the headless-mode gate off, the
#                                 pre-flag behaviour of the tool)
#   QA_SERVE_READY_FILE            readiness marker, default
#                                 /tmp/serve-web.ready — polling it with a
#                                 fast `docker exec ... cat` is the
#                                 sandbox-VM-safe start-up handshake
#                                 (exec stdout drops once the process
#                                 idles; see qa/README.md 2.1)
#
# Scripted start (recommended):
#   docker compose -f qa/docker-compose.yml \
#     -f qa/docker-compose.ports.yml up -d qa          # publishes the web UI
#   docker exec -d opencode-sdd-qa-qa-1 \
#     /app/qa/docker/serve-web.sh                      # headless, no TTY needed
#   docker exec opencode-sdd-qa-qa-1 \
#     sh -c 'cat /tmp/serve-web.ready'                 # poll until "ready"
#
# Interactive start (human at the terminal):
#   qa exec '/app/qa/docker/serve-web.sh'
#
# Stop: Ctrl-C on the interactive exec; `docker exec ... pkill -f
# 'opencode serve'`; or restart the container (state is in the volumes).
# Config changes need a restart — plugins load once at startup.
set -euo pipefail

PROJECT="${1:-/work/sdd-manual}"
PORT="${2:-4096}"
READY_FILE="${QA_SERVE_READY_FILE:-/tmp/serve-web.ready}"
export OPENCODE_ENABLE_QUESTION_TOOL="${OPENCODE_ENABLE_QUESTION_TOOL:-1}"

if [ ! -d "$PROJECT" ]; then
  echo "ERROR: project dir not found: $PROJECT" >&2
  echo "  run scratch-init.sh first: qa/docker/scratch-init.sh $PROJECT" >&2
  exit 1
fi

cd "$PROJECT"

# --print-logs keeps /tmp/serve-web.out a full transcript (markers, errors)
# on top of the usual opencode.log under the qa-home volume.
opencode serve --port "$PORT" --hostname 0.0.0.0 \
  --log-level DEBUG --print-logs >/tmp/serve-web.out 2>&1 &
SERVER_PID=$!

# Handshake: wait until the web client answers (or the process died), then
# write the ready marker the host-side driver polls. The server start is
# cold (plugin load + config read), so give it ~30 s.
ready=""
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    ready="yes"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if [ -n "$ready" ]; then
  echo "opencode web UI ready on http://127.0.0.1:$PORT (pid $SERVER_PID)"
  echo "ready project=$PROJECT port=$PORT pid=$SERVER_PID" > "$READY_FILE"
else
  echo "ERROR: opencode serve did not become ready on port $PORT." >&2
  echo "  transcript: /tmp/serve-web.out" >&2
  echo "FAILED pid=$SERVER_PID" > "$READY_FILE"
fi

trap 'kill "$SERVER_PID" 2>/dev/null || true' INT TERM
wait "$SERVER_PID"
