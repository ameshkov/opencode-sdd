### System Design

Design for a documentation site:

- The site is built statically and served from a CDN — there is no server
  runtime. All content is generated at build time.
- Navigation and search MUST work without JavaScript. Progressive
  enhancement is acceptable; breaking without JS is not.
- Keep page load fast — optimize images, lazy-load heavy assets, and
  minimize CSS/JS bundle size.
- Content is the product — use consistent formatting, validate links at
  build time, and ensure code examples are syntactically correct.
