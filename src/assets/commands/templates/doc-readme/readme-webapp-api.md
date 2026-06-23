<!-- Template: web application + API service -->

# Project Name

<p align="center">
  > *One-line description* — what the application does and who it's for.
</p>

<p align="center">
  <img src="assets/screenshot.png" alt="Application screenshot" width="600">
</p>

## Description

*Target audience* — who this application is for and what problem it
solves. Explain the motivation for building it, the pain points it
addresses, and the primary use case.

## Table of Contents

- [Access](#access)
- [Quick Start](#quick-start)
- [Features](#features)
- [Common Workflows](#common-workflows)
- [API Overview](#api-overview)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
- [Error Handling](#error-handling)
- [Rate Limits](#rate-limits)
- [Administration](#administration)
- [Documentation](#documentation)

---

## Access

- **Web app URL**: https://app.example.com
- **API base URL**: https://api.example.com/v1
- **Supported browsers**: Chrome, Firefox, Safari, Edge (last 2 major
  versions)
- **Authentication**: Sign up or sign in with email/password or SSO

## Quick Start

### Using the Web Application

1. Navigate to the application URL
2. Create an account or sign in
3. Complete the onboarding wizard
4. You are now ready to use the application

### Using the API

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/v1/health
```

## Features

### Feature One

Brief description of what this feature does and who uses it.

### Feature Two

Brief description of what this feature does and who uses it.

## Common Workflows

Step-by-step guides for the main tasks users perform in the application.

### Workflow: Creating a resource

1. Click **New** in the sidebar
2. Fill in the required fields
3. Click **Save**
4. The resource appears in the list

## API Overview

The API is available at `https://api.example.com/v1`. All requests must
be authenticated (see [Authentication](#authentication)).

## Authentication

How to obtain and use API keys or tokens. Include the expected header
format (e.g., `Authorization: Bearer <token>`).

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/v1/users` | List all users |
| POST | `/v1/users` | Create a user |
| GET | `/v1/users/:id` | Get a user by ID |

### Request / Response Examples

```bash
curl -X POST https://api.example.com/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Alice"}'
```

```json
{
  "id": "usr_123",
  "name": "Alice",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

## Error Handling

| Status Code | Meaning |
| --- | --- |
| 400 | Bad request — check request body |
| 401 | Unauthenticated — missing or invalid token |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Rate Limits

Requests per minute/hour, how to check remaining quota (response
headers).

## Administration

Configuration options available to administrators (user management,
settings, billing).

---

## Documentation

- [Deployment](DEPLOYMENT.md) — installation and configuration
- [Development](DEVELOPMENT.md) — how to set up and contribute
- [Changelog](CHANGELOG.md) — version history
- [LLM agent rules](AGENTS.md) — AI-assisted development guidelines
