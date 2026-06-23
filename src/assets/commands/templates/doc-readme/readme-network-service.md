<!-- Template: network service / daemon -->

# Project Name

<p align="center">
  > *One-line description* — what the service does and who it's for.
</p>

<p align="center">
  <img src="assets/diagram.png" alt="Architecture diagram" width="600">
</p>

## Description

*Target audience* — who this service is for and what problem it solves.
Explain the motivation for building it, the pain points it addresses,
and the primary use case.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Protocol / Interface](#protocol--interface)
- [Operation](#operation)
- [Monitoring](#monitoring)
- [FAQ / Troubleshooting](#faq--troubleshooting)
- [Documentation](#documentation)

---

## Installation

### macOS

```bash
brew install project-name
```

### Linux

```bash
sudo apt install project-name   # Debian-based
sudo dnf install project-name   # Fedora-based
```

Or run via Docker:

```bash
docker run project-name
```

### Configuration File

The default config location is `/etc/project-name/config.yaml`.

## Quick Start

Minimal setup to get the service running:

```bash
project-name --config /path/to/config.yaml
```

Verify the service is running:

```bash
project-name status
```

## Configuration

### Config File (`/etc/project-name/config.yaml`)

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `listen` | string | `":53"` | Address and port to listen on |
| `upstream` | string | — | Upstream server address |
| `timeout` | duration | `5s` | Query timeout |
| `log.level` | string | `"info"` | Log level (debug, info, warn, error) |

### Environment Variables

| Variable | Description |
| --- | --- |
| `PROJECT_LOG_LEVEL` | Override log level |
| `PROJECT_CONFIG_PATH` | Path to config file |

### Command-Line Flags

| Flag | Description |
| --- | --- |
| `--config` | Path to config file |
| `--verbose` | Enable verbose logging |
| `--version` | Print version and exit |

## Protocol / Interface

Describe the protocol the service speaks (DNS, DHCP, SMTP, etc.).
Include:

- Transport (UDP, TCP, TLS, QUIC)
- Default port(s)
- Any extensions or non-standard behavior
- RFC references where applicable

## Operation

### Starting and Stopping

```bash
systemctl start project-name
systemctl stop project-name
```

### Logs

```bash
journalctl -u project-name -f
```

### Health Check

```bash
project-name health
```

## Monitoring

- **Metrics endpoint**: `http://localhost:9090/metrics` (Prometheus)
- **Health endpoint**: responds on the configured health check port

## FAQ / Troubleshooting

Common issues, port conflicts, permission errors, and how to collect
diagnostics.

---

## Documentation

- [Deployment](DEPLOYMENT.md) — production deployment and tuning
- [Development](DEVELOPMENT.md) — how to build and contribute
- [Changelog](CHANGELOG.md) — version history
- [LLM agent rules](AGENTS.md) — AI-assisted development guidelines
