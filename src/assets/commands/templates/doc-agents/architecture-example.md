### Architecture

<universal principles — bulleted list, one per principle>

The easiest way to achieve these principles is **layered architecture**.
This project's layers, from top to bottom:

```text
Handlers (API routes, webhooks)
     ↓
Services (business logic)
     ↓
Repositories (data access)
     ↓
Database
```

<layer> may call <layer>. No layer may depend on a layer above it.

**Known exclusions** (to be fixed):

- <description of violation and where it occurs>
