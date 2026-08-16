# RepoDocs

RepoDocs turns Markdown from public Git repositories into one versioned and localized documentation website. Each source repository owns its documentation. RepoDocs collects that content during a build and prerenders every route as HTML.

The deployed site does not need a server, database, or runtime access to Git.

## Requirements

- Bun 1.3 or newer
- Git
- Network access to the configured public repositories

## Quick start

Install the dependencies and start the development server:

```bash
bun install
bun run dev
```

The development command syncs all configured repositories before it starts Vite.

## Documentation

Read the [full RepoDocs guide](docs/index.md).

- Project owners put `repodocs.yml`, Markdown, navigation, and assets in their project's root `docs/` directory.
- Site operators register each public repository in the RepoDocs website's `repositories/` directory.

The guide covers:

- Site and repository configuration.
- Git branch versions and translated documentation.
- Versioned `docs/repodocs.yml` metadata with project identity, owners, compatibility, licenses, and platform references.
- Direct support for current and legacy ModdedMC Wiki metadata, MDX pages, navigation, assets, translations, and version branches.
- Automatic project and documentation license detection with source links.
- Source repository structure.
- Project classification and repository-wide footers.
- Markdown, asset, and navigation behavior.
- Build output, deployment, and failure behavior.

The same guide appears at `/docs/` on the generated website.

## Common commands

| Command | Result |
| --- | --- |
| `bun run docs:sync` | Pull repositories and rebuild generated documentation data. |
| `bun run dev` | Sync documentation and start the development server. |
| `bun run build` | Sync, build, and prerender the static website. |
| `bun run preview` | Serve the completed production build. |
| `bun run lint` | Check the project source with ESLint. |

## How the website builds

```text
repositories/*.yml
        │
        ▼
public Git repositories ──► Markdown, navigation, assets, and Git history
        │
        ▼
generated/docs.json + public/repository-assets/
        │
        ▼
Vite build + prerender ──► dist/
```
