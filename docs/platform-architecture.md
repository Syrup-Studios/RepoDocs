# Platform architecture

RepoDocs publishes a static React site to GitHub Pages. A Cloudflare Worker handles GitHub sign-in and repository management. GitHub is the source of truth for repository configuration and published content.

## Site build

The build reads `repositories/*.yml`, fetches each configured public Git repository, compiles its documentation, and creates static pages.

```text
repositories/*.yml + source repositories
    -> scripts/sync-docs.ts
    -> generated/docs.json + public/repository-assets/
    -> Vite browser bundle + static route rendering
    -> dist/ including publication.json and _data/
    -> GitHub Pages
```

`bun run build:incremental` restores valid per-project compiled output where its cache key matches current source and compiler inputs. It still fetches source revisions and rebuilds the site index and browser bundle. The prerender cache reuses route bodies only when route data and rendering inputs match. Invalid or missing entries are rebuilt.

GitHub Actions stores only `.repodocs-cache/compiled/` and `.repodocs-cache/prerender/`. It restores and saves these paths only for the canonical repository's `main` branch. The Pages workflow validates generated project data, the publication manifest, and every static route before it uploads the complete `dist/` directory. Pushes to `main`, a three-hour schedule, and manual dispatch run the deployment.

Registration pull-request validation uses a clean build. It copies only changed registration YAML files onto the trusted base revision, checks their generated project output, and does not restore or save an Actions cache.

See [Incremental builds and deployment](incremental-build.md) for operator commands, cache rules, and failure handling.

## Authentication and repository changes

The static frontend calls the Worker API. The Worker uses D1 for sessions and operational request state. It stores GitHub credentials and tokens in the Worker, not in browser code or site files. Session mutations require the configured origin and CSRF token.

Signed-in users can list public repositories they can access. Repository registration, edit, and removal require current GitHub admin access. The Worker creates pull requests for registration and config changes. A pull request does not mean a project is published. The site build writes `dist/publication.json`; its site and project source revisions identify the content in that deployment. The Worker reports `published` only when the deployed manifest confirms the project and source revision.

The Worker refresh endpoint dispatches a site deployment for an already published project. It reports that the request was accepted; it does not report publication completion.

See [Authentication Worker setup](auth-worker-operations.md) for Worker routes, D1 schema, secrets, and deployment operations.

## Build tools

| Part | Role |
| --- | --- |
| Bun 1.3.14 and Git | Install locked dependencies and fetch source repositories and history. |
| React, React DOM, and Vite | Build the browser application and prerender the static routes. |
| Markdown-it, highlight.js, sanitize-html, and YAML | Parse, render, highlight, sanitize, and validate documentation. |
| TypeScript and ESLint | Check application source and types. |
| Cloudflare Workers and D1 | Run authentication and repository-management APIs. |
