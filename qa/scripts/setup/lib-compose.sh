#!/usr/bin/env bash
# Shared QA-environment resolution for the lifecycle scripts.
#
# Sourced by qa-up.sh, qa-shell.sh, llm-up.sh, and llm-down.sh after they
# set REPO_ROOT. It reads QA_ENV (v1|v2, default v1) and exports:
#   QA_ENV             the selected environment
#   QA_COMPOSE_FILE    the base compose file
#   QA_COMPOSE_ARGS    `-f` args for docker compose (base + v2 override)
#   QA_WORKSPACE_IMAGE the environment's workspace image tag
#   QA_PROJECT         the compose project name
#
# The V2 override renames the project (`opencode-sdd-qa-v2`) and the image
# tag, so the two stacks keep separate volumes and can run side by side.
# shellcheck shell=bash

QA_ENV="${QA_ENV:-v1}"
case "$QA_ENV" in
  v1 | v2) ;;
  *)
    echo "ERROR: QA_ENV must be v1 or v2 (got '$QA_ENV')" >&2
    return 1
    ;;
esac

QA_COMPOSE_FILE="$REPO_ROOT/qa/docker-compose.yml"
QA_COMPOSE_ARGS=(-f "$QA_COMPOSE_FILE")
if [ "$QA_ENV" = "v2" ]; then
  QA_COMPOSE_ARGS+=(-f "$REPO_ROOT/qa/docker-compose.v2.yml")
  QA_WORKSPACE_IMAGE="opencode-sdd-qa:workspace-v2"
  QA_PROJECT="opencode-sdd-qa-v2"
else
  QA_WORKSPACE_IMAGE="opencode-sdd-qa:workspace"
  QA_PROJECT="opencode-sdd-qa"
fi
export QA_ENV QA_COMPOSE_FILE QA_WORKSPACE_IMAGE QA_PROJECT
