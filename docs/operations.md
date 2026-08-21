# Build and deployment

RepoDocs creates a complete static website during each production build.

This page is for RepoDocs site operators. Project owners only need to keep their documentation in the source repository's root `docs/` directory.

## Commands

| Command | Result |
| --- | --- |
| `bun run docs:sync` | Pull the configured repositories and rebuild generated documentation data and assets. |
| `bun run dev` | Sync the documentation and start Vite. |
| `bun run build` | Sync, build the browser files, and prerender all static routes into `dist/`. |
| `bun run preview` | Serve the completed `dist/` build. Run `bun run build` first. |
| `bun run lint` | Check the project source with ESLint. |

## Generated files and cache

RepoDocs creates these paths during a sync or build:

- `.repodocs-cache/repositories/`: cached Git clones with all configured branches.
- `generated/docs.json`: project identity, source repository host and owner, owners, compatibility, licenses with provenance, platform references, versions, locales, rendered pages, navigation, search content, and source history.
- `public/repository-assets/<project>/<version>/`: copied files from each version's source `docs/` directory.
- `dist/`: the deployable static website.

These paths are generated and ignored by Git. Do not edit them by hand.

Existing cached clones are reset to the fetched revision and cleaned before each compile. This only changes the clone in the RepoDocs cache. It does not change the original source repository.

Set `REPODOCS_CACHE_DIR` to use another cache location:

```bash
REPODOCS_CACHE_DIR=/var/cache/repodocs bun run docs:sync
```

## Sync concurrency

RepoDocs syncs up to four repositories in parallel. Set `REPODOCS_SYNC_CONCURRENCY` to an integer from `1` to `16` to change the limit:

```bash
REPODOCS_SYNC_CONCURRENCY=8 bun run build
```

Use a lower value if the build machine has limited memory or if a Git host limits requests. RepoDocs never starts more workers than the number of configured repositories.

## Build and failure behavior

Repositories without a valid root `docs/` directory are skipped. A native RepoDocs project must contain Markdown files in that directory. A ModdedMC V1 project must contain MDX pages under `docs/docs/`. A legacy ModdedMC project keeps its MDX pages directly under `docs/`. RepoDocs reports each skipped project and continues.

Other problems stop the build. These problems include an invalid repository file, a duplicate slug, an unsupported metadata schema, a mismatched project ID, a Git failure, an invalid `docs/repodocs.yml`, a missing navigation target, and a Markdown page without Git history. This behavior prevents publication of incomplete or inconsistent data.

The final website contains:

- A directory page for each known documentation type and category.
- One short project route for every version and language combination. It opens the default documentation page.
- One canonical route for every version, language, and documentation page combination.
- A static 404 page.
- In-browser search across page titles, project names, descriptions, and rendered page text.
- Client-side navigation for internal links.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds and deploys the site:

- After each push to `main`.
- Every three hours, so remote documentation changes are published.
- When a maintainer starts it manually from the Actions page.

In the GitHub repository settings, open **Pages** and set **Source** to **GitHub Actions**. The workflow installs the locked Bun dependencies, runs `bun run build`, uploads `dist/`, and deploys it.

The site uses root-relative links. Host it at the root of its configured domain. Update the application paths before you deploy it below a URL prefix.

## Current limits

- Only public repositories are supported. RepoDocs does not support authentication or private repositories.
- Site registration files must use the `.yml` extension and must be direct children of the RepoDocs website's `repositories/` directory.
- Source documentation must be in a root `docs/` directory.
- Documentation updates need a new RepoDocs build and deployment.
