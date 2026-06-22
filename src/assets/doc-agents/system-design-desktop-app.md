### System Design

Design for a desktop environment:

- The app runs as a long-lived process — clean up resources (file handles,
  sockets, temp files) proactively; do not rely on process exit to free them.
- Handle multiple windows and concurrent user actions safely; use the
  framework's threading/dispatch model instead of raw shared-state mutation.
- Persist user preferences and window state across restarts; restore on
  launch.
- Perform heavy work (indexing, compilation, downloads) on background
  threads; keep the UI thread responsive.
- Support graceful shutdown — save unsaved work, cancel in-progress
  operations, and exit within a few seconds of the user's quit request.
- Handle crashes gracefully — write crash logs, offer to restore previous
  state on next launch, do not corrupt user data.
