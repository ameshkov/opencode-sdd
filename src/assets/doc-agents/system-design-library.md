### System Design

Design for a library:

- The library is consumed by other code — never access the filesystem,
  network, or environment unless the caller explicitly opts in.
  Keep side effects out of the default code path.
- Export a stable public API; internal functions and types MUST be
  explicitly marked as private or internal.
- Keep the dependency footprint minimal — every transitive dependency
  becomes a burden on consumers. Prefer built-in APIs over adding
  packages.
- Do not mutate global state (environment variables, process listeners,
  shared singletons) — the consumer may use the library in a
  long-running process alongside other code.
- Provide complete type definitions so the library is usable with
  static type checking and editor autocompletion out of the box.
- Document every public function, class, and type with doc comments —
  consumers should not need to read source code to use the library.
- Handle errors by throwing specific, documented error classes — let the
  consumer decide how to recover.
