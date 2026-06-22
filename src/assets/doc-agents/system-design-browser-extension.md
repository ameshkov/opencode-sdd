### System Design

Design for a browser extension:

- The extension runs in a sandboxed environment with limited APIs —
  request only the permissions you need; do not ask for broad host
  permissions when specific origins suffice.
- Keep the extension lightweight — every added size slows down browser
  startup and page load. Avoid bundling large dependencies.
- Separate concerns across the extension's contexts: background
  (service worker) for long-lived logic, content scripts for page
  interaction, popup/options for UI. Do not put business logic in
  content scripts; delegate to the background script via messaging.
- Handle lifecycle correctly — the background service worker can be
  terminated at any time. Persist critical state to `browser.storage`
  (or equivalent), not in-memory variables.
- Use message passing between extension contexts; never share mutable
  state directly. Treat each context as an independent process.
- React to browser events asynchronously; never block the main thread
  of the page or the browser UI.
- Design for updates — the extension may be updated while the user is
  active. Migrate stored data on update; do not break existing user
  state. Handle version transitions gracefully.
