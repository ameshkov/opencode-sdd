### System Design

Design for a mobile environment:

- The app runs on user devices with variable network quality — prefer
  local-first data with background sync over blocking network calls.
- Handle offline and poor-connectivity scenarios gracefully; never crash or
  show a blank screen when the network is unavailable.
- Minimize main-thread work — move parsing, encryption, and image
  processing to background threads or workers.
- Keep the binary size small; avoid large dependencies that bloat the
  download.
- Respect battery and bandwidth — batch network requests, debounce
  rapid updates, and avoid polling.
- Manage app lifecycle correctly — persist state on background/terminate,
  restore on resume; do not assume the process stays alive.
- Fail fast on startup — validate critical resources early and show a
  meaningful error rather than a blank or broken UI.
