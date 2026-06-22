### System Design

Design for a distributed environment:

- Requests are load-balanced across replicas in arbitrary order; there are no
  sticky sessions.
- Replica count can change at any moment (autoscaling).
- No shared memory between replicas — use Redis or a database.
- No local files for state — use S3 or a database.
- No in-memory caches without invalidation — use Redis or a database.
- Keep processes stateless; store sessions and shared state in Redis / database.
- If you need to coordinate one-time operations across replicas, use Redis
  distributed locks (Redis `SET ... NX EX`).
- Provide CLI commands for periodic jobs. In production periodic jobs will be
  scheduled using K8s CronJobs. Exception: use an in-process scheduler only for
  very frequent (seconds/minutes) and lightweight tasks.
- Disposability — start in 1–2 seconds, handle `SIGTERM` gracefully within 5–10
  seconds.
