# syntax=docker/dockerfile:1

# Multi-stage Dockerfile that runs the full quality gate (format, lint,
# type-check, unit tests) and both mock-LLM e2e lanes (V1 binary + V2
# in-process/loader smoke). Each gate is a stage
# that writes a *-results.txt file, and each has a `FROM scratch` collector
# stage so `--output type=local` yields only that result file. Usage:
#
#   docker build --output type=local,dest=./ci-output .                          # all gates
#   docker build --target lint-output      --output type=local,dest=./ci-output .
#   docker build --target unit-test-output --output type=local,dest=./ci-output .
#   docker build --target e2e-output       --output type=local,dest=./ci-output .
#
# The default (final) stage, `ci-output`, is a scratch image that collects
# every result file.

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps

# Use bash with pipefail for every RUN so a failing command piped into `tee`
# (used by the lint/test stages to capture results) propagates its non-zero
# exit status instead of being masked by `tee`, which always exits 0. The
# default /bin/sh on this image is dash, which returns the *last* command's
# status for a pipeline. This SHELL is inherited by every stage built
# `FROM deps` (build, lint, unit-test, e2e-test).
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# pnpm is pinned to the version the project is developed against.
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

# Copy lockfile and manifest first for layer caching.
COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,target=/pnpm,id=opencode-sdd-pnpm \
    pnpm install \
    --frozen-lockfile \
    --prefer-offline \
    --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: Copy source and compile
# ---------------------------------------------------------------------------
FROM deps AS build

COPY . .

RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 3: Format, lint, and type checks
# ---------------------------------------------------------------------------
FROM build AS lint

RUN pnpm format:check 2>&1 | tee /tmp/lint-results.txt
RUN pnpm lint 2>&1 | tee -a /tmp/lint-results.txt
RUN pnpm typecheck 2>&1 | tee -a /tmp/lint-results.txt

# ---------------------------------------------------------------------------
# Stage 4: Unit tests
# ---------------------------------------------------------------------------
FROM build AS unit-test

RUN pnpm test 2>&1 | tee /tmp/unit-test-results.txt

# ---------------------------------------------------------------------------
# Stage 5: Install the opencode binary (needed only for e2e tests)
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS opencode

# Fresh base image: re-declare the pipefail shell so the `curl | bash`
# download fails the build if the fetch errors out.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# The versions tested locally (see docs/e2e.md). Override with
# --build-arg OPENCODE_VERSION=... / OPENCODE_V2_VERSION=... to pin
# different releases.
ARG OPENCODE_VERSION=1.18.29
ARG OPENCODE_V2_VERSION=2.0.14

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --no-modify-path avoids editing shell rc files that do not exist in the
# image. The installer drops the binary in $HOME/.opencode/bin.
RUN curl -fsSL https://opencode.ai/install \
    | bash -s -- --version ${OPENCODE_VERSION} --no-modify-path

# Move it onto PATH so the e2e harness (which calls `opencode --version`)
# finds it without any PATH plumbing.
RUN mv "${HOME}/.opencode/bin/opencode" /usr/local/bin/opencode \
    && opencode --version

# The V2 CLI installs both `opencode` and `opencode2` bins. Install it into
# a private prefix so the V1 binary stays the one on PATH for `opencode`;
# only `opencode2` is added from /opt/oc2/bin (appended to PATH below).
RUN npm install --global --prefix /opt/oc2 @opencode/cli@${OPENCODE_V2_VERSION} \
    && /opt/oc2/bin/opencode2 --version

# ---------------------------------------------------------------------------
# Stage 6: E2E tests (real opencode server + mock LLM)
# ---------------------------------------------------------------------------
FROM build AS e2e-test

COPY --from=opencode /usr/local/bin/opencode /usr/local/bin/opencode
COPY --from=opencode /opt/oc2 /opt/oc2

# Appended (not prepended): `opencode` keeps resolving to the V1 binary in
# /usr/local/bin, while `opencode2` is found in /opt/oc2/bin.
ENV PATH="${PATH}:/opt/oc2/bin"

RUN pnpm test:e2e:all 2>&1 | tee /tmp/e2e-results.txt

# ---------------------------------------------------------------------------
# Stage 7: Output collectors
#
# Each gate has its own `FROM scratch` collector so `--output type=local`
# against its target yields ONLY that gate's result file (not the whole app
# tree). The default target (`ci-output`) collects all three.
# ---------------------------------------------------------------------------
FROM scratch AS lint-output
COPY --from=lint /tmp/lint-results.txt /lint-results.txt

FROM scratch AS unit-test-output
COPY --from=unit-test /tmp/unit-test-results.txt /unit-test-results.txt

FROM scratch AS e2e-output
COPY --from=e2e-test /tmp/e2e-results.txt /e2e-results.txt

# Default target — all result files.
FROM scratch AS ci-output
COPY --from=lint /tmp/lint-results.txt /lint-results.txt
COPY --from=unit-test /tmp/unit-test-results.txt /unit-test-results.txt
COPY --from=e2e-test /tmp/e2e-results.txt /e2e-results.txt
