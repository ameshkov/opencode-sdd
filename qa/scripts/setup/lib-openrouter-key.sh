#!/usr/bin/env bash
# Shared OpenRouter API key resolution for the QA start scripts.
# Source this file, then call `resolve_openrouter_key` before
# `docker compose up`.
#
# The key NEVER lands in git: the simple default is the gitignored
# `qa/.env` file (compose auto-loads it from the project directory — the
# directory of qa/docker-compose.yml — and these scripts read the same
# file, so the value is shared). Alternatives: export it in the shell, or
# point OPENROUTER_KEY_FILE at a file kept outside the repo. Whatever the
# source, the value is only ever in the environment of the started
# process — never written to committed files, echoed, logged, or passed
# where `ps`/history can see it.
#
# SECURITY CONTRACT — do not weaken any of these:
# 1. The key is never committed: `qa/.env` is gitignored (the tracked
#    `qa/.env.example` template carries no value); no tracked file,
#    script, compose file, or baked image layer carries the key. Compose
#    forwards it as the OPENROUTER_API_KEY environment variable at `up`
#    time; bifrost's provider configuration references it as
#    `env.OPENROUTER_API_KEY` (a literal reference string, not the value).
# 2. The resolved value is NEVER echoed, logged, written to a file, or
#    passed in a place visible to `ps` / shell history. Docker Compose
#    only reads environment variables; the scripts never materialize
#    the key in arguments.
# 3. A non-interactive context without ANY key source is a HARD STOP:
#    the interactive fallback requires a TTY, so an automated agent
#    cannot start a paid-inference stack unless the key is already placed
#    in `qa/.env` (or exported) by the human.
#
# Resolution order (first hit wins):
#   1. OPENROUTER_API_KEY already in the environment (incl. `qa/.env`,
#      loaded at source time — existing env vars always win over the file).
#   2. OPENROUTER_KEY_FILE=<path> — read silently (e.g. a file kept
#      outside the repo; cf. the sandbox-VM notes in the README).
#   3. Interactive hidden prompt (TTY only).
#   4. Non-interactive without a key: refuse to start paid inference.
#
# The `qa/.env` parser mirrors docker compose: KEY=VALUE lines, `#`
# comments, optional surrounding single/double quotes stripped, `#` kept
# inside values. Only QA-known keys are read; nothing is ever sourced.
set -euo pipefail

# qa/.env sits two directories up from this library
# (qa/scripts/setup/lib-openrouter-key.sh -> qa/.env).
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QA_ENV_FILE="${QA_ENV_FILE:-$LIB_DIR/../../.env}"

load_qa_env() {
  # Read the gitignored qa/.env (if present) and export the QA-known
  # keys that are NOT already set — re-exporting an existing env var
  # would silently override `export OPENROUTER_API_KEY=...`. Values are
  # parsed like compose: surrounding quotes stripped, trailing `\r`
  # removed, `#` inside values preserved.
  [ -r "$QA_ENV_FILE" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    # Drop leading whitespace, then skip blank lines and comments (#...),
    # like docker compose does.
    line="${line#"${line%%[![:space:]]*}"}"
    if [ -z "$line" ] || [ "${line#\#}" != "$line" ]; then
      continue
    fi
    case "$line" in
      OPENROUTER_API_KEY=*|OPENROUTER_KEY_FILE=*|QA_HOST_PORT=*)
        key="${line%%=*}"
        val="${line#*=}"
        # Strip one level of matching quotes, like `docker compose` does.
        case "$val" in
          \"*\") val="${val#\"}"; val="${val%\"}" ;;
          \'*\') val="${val#\'}"; val="${val%\'}" ;;
        esac
        if [ -z "${!key:-}" ]; then
          export "$key=$val"
        fi
        ;;
    esac
  done < "$QA_ENV_FILE"
}
load_qa_env

resolve_openrouter_key() {
  # 1. Already in the environment (or loaded from qa/.env above).
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    export OPENROUTER_API_KEY
    return 0
  fi

  # 2. External key file.
  if [ -n "${OPENROUTER_KEY_FILE:-}" ]; then
    if [ ! -r "$OPENROUTER_KEY_FILE" ]; then
      echo "ERROR: OPENROUTER_KEY_FILE is set but not readable: $OPENROUTER_KEY_FILE" >&2
      exit 1
    fi
    # The value goes straight into the environment; nothing is echoed.
    OPENROUTER_API_KEY="$(cat "$OPENROUTER_KEY_FILE")"
    export OPENROUTER_API_KEY
    return 0
  fi

  # 3. Interactive hidden prompt — only when stdin is a TTY.
  if [ -t 0 ]; then
    printf '%s' 'OpenRouter API key (hidden input; not stored anywhere): ' >&2
    IFS= read -rs OPENROUTER_API_KEY
    printf '\n' >&2
    if [ -z "${OPENROUTER_API_KEY:-}" ]; then
      echo "ERROR: no OpenRouter API key entered." >&2
      exit 1
    fi
    export OPENROUTER_API_KEY
    return 0
  fi

  # 4. Non-interactive without a key: refuse to start paid inference.
  echo "ERROR: no OpenRouter API key available." >&2
  echo "  The QA stack needs one of these (never commit the value):" >&2
  echo "    - qa/.env:         copy qa/.env.example, fill in OPENROUTER_API_KEY" >&2
  echo "      (gitignored; docker compose picks it up automatically)" >&2
  echo "    - export OPENROUTER_API_KEY=sk-or-...   (one-off override)" >&2
  echo "    - OPENROUTER_KEY_FILE=/path/to/key-file  (keep the file" >&2
  echo "      outside the repository)" >&2
  echo "    - run the script interactively: it prompts for the key" >&2
  echo "      with hidden input" >&2
  echo "  Non-interactive starts without any key source fail here on" >&2
  echo "  purpose: starts are human-gated so neither the repository nor" >&2
  echo "  an automated agent silently starts paid inference. Key types" >&2
  echo "  (e.g. sk-or-v1-...) are accepted as-is." >&2
  exit 1
}
