# RepoDocs

RepoDocs uses Bun, React, and Vite to turn documentation from public Git repositories into a fully static website. The repository remains the source of truth.

## Requirements

- Bun 1.3 or newer
- Git

## Configure the site

Edit `repodocs.config.ts`:

```ts
const config = {
  site: {
    name: "RepoDocs",
    description: "Documentation that lives with the code.",
    repository: "https://github.com/example/repodocs",
  },
};
```

## Add a repository

Create a `.yml` file directly under `repositories/`. The filename does not affect the generated URL.

For example, create `repositories/my-project.yml`:

```yaml
name: My project
slug: my-project
repository: https://github.com/example/my-project
```

The `slug` value becomes the stable URL segment. It must use lowercase letters, numbers, and hyphens. Each repository must use a unique slug.

The development and production builds scan every `.yml` file directly under `repositories/`. You do not need to add the repository to a central list.

Each configured repository must contain a root `docs/` directory. RepoDocs reads `.nav.yml` or `docs/.nav.yml`. If neither file exists, it creates navigation from the Markdown file tree.

## Project type and category

A repository can define its documentation type in `docs/repodocs.yml`:

```yaml
type: minecraft
category: mod
```

Minecraft projects support these categories:

- `mod`
- `modpack`

The project directory first asks the visitor to select a documentation type. Selecting Minecraft opens the category shell with Mods and Modpacks tabs:

```text
/mods/
/modpacks/
/mods/example-mod/
/modpacks/example-pack/
```

The category page can expand a project's page tree without changing the URL. Clicking the project name opens its documentation in the same shell.

A repository without `docs/repodocs.yml` appears under `/projects/` as a general project.

## Develop

```bash
bun install
bun run dev
```

The development command first pulls all configured repositories and generates the documentation data.

## Build the static website

```bash
bun run build
```

The command performs these steps:

1. Clone or fetch each configured repository.
2. Read its root `docs/` directory.
3. Parse Markdown and navigation.
4. Copy documentation assets.
5. Generate every documentation route.
6. Build the browser assets with Vite.
7. Prerender every route to static HTML in `dist/`.

RepoDocs syncs up to four repositories in parallel. Set `REPODOCS_SYNC_CONCURRENCY` to a value from `1` to `16` to change this limit:

```bash
REPODOCS_SYNC_CONCURRENCY=8 bun run build
```

Use a lower value if the build machine has limited memory or if a Git host rate-limits requests.

The deployed website has no server process, API routes, database, or runtime Git access. Every route contains prerendered HTML. A small browser bundle provides navigation without full-page reloads. To publish repository changes, run and deploy a new build. A CI service can run this command after a push or on a schedule.

Each documentation page includes its creation date, last edit date, and authors. RepoDocs reads this metadata from the Markdown file's Git history during the build.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds and deploys the site after each push to `main`. It also supports a manual run from the Actions page.

In the GitHub repository settings, open **Pages** and set **Source** to **GitHub Actions**. The site uses root-relative links and is intended to run from its configured custom domain.

## Navigation

RepoDocs supports MkDocs-style navigation:

```yaml
nav:
  - Home: index.md
  - Getting Started: getting-started.md
  - API:
      - Overview: api/overview.md
```

## Supported sources

The current allowlist supports public HTTPS repositories from GitHub, GitLab, Codeberg, and Bitbucket. Authentication and private repositories are not part of this static MVP.
