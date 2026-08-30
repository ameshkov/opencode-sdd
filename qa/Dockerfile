# QA workspace image. Runs the manual test plan (qa/README.md)
# fully inside a container so nothing touches the host environment:
# opencode configs, scratch projects, caches, and installed globals all
# live in the container or its named volumes.
#
# The plugin repository is BAKED into the image (multi-stage): the build
# stage compiles build/ from the checked-out source, and the final image
# keeps only the production dependencies the plugin/CLI need at runtime
# (the install wizard's model probe imports @opencode-ai/sdk). There is no
# host bind mount at all - the host only needs docker.
#
# After changing plugin source, rebuild:
#   docker compose -f qa/docker-compose.yml build qa
#   docker compose -f qa/docker-compose.yml up -d qa

FROM node:24-bookworm-slim AS build

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@10.14.0

COPY . /src
WORKDIR /src
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24-bookworm-slim AS qa-workspace

ARG OPENCODE_VERSION=1.18.23

# Baked at build time by qa/scripts/setup/qa-up.sh (which computes the
# repo hash and passes it via `docker compose build --build-arg`).
# qa-up.sh compares this label against the current repo hash and REFUSES
# to start the stack on a stale image: the image bakes the repo, so a
# stale image silently loses the qa/docker/ payload, qa/scripts/,
# qa/features/ and the plugin build. A manual `docker compose build qa`
# without the build-arg records `unknown`, which qa-up.sh treats as
# stale — build through qa-up.sh (or export QA_SRC_HASH) instead.
ARG SRC_HASH=unknown
LABEL org.opencode-sdd.qa.src-hash=${SRC_HASH}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git curl ca-certificates python3 vim bash \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@10.14.0

# --no-modify-path avoids editing shell rc files that do not exist in the
# image. The installer drops the binary in $HOME/.opencode/bin.
RUN curl -fsSL https://opencode.ai/install \
    | bash -s -- --version ${OPENCODE_VERSION} --no-modify-path \
    && mv "${HOME}/.opencode/bin/opencode" /usr/local/bin/opencode \
    && opencode --version

# The plugin source + compiled build/ live at /app (read-only by
# convention - write tests never touch /app).
COPY --from=build /src /app
WORKDIR /app
RUN pnpm install --prod --frozen-lockfile

WORKDIR /work

# Keep the container alive so `docker compose exec -it qa ...` sessions
# (including the opencode TUI) can be started and restarted freely.
CMD ["tail", "-f", "/dev/null"]
