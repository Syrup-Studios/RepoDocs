# RepoDocs

RepoDocs turns Markdown from public Git repositories into one static documentation website. Each source repository owns its documentation. RepoDocs pulls that documentation during a build, creates the site navigation and page data, and prerenders every route as HTML.

The deployed site does not need a server, database, or runtime access to Git. Publish a new build when the source documentation changes.

## How RepoDocs works

A build has three main stages:

1. **Sync:** RepoDocs reads each YAML file in `repositories/`. It clones a new repository or fetches the latest commit into its local cache.
2. **Compile:** RepoDocs reads the repository's root `docs/` directory. It converts Markdown to HTML, builds navigation, rewrites local links, copies assets, and reads page history from Git.
3. **Publish:** Vite builds the browser files. The prerender script then writes an `index.html` file for every project, directory, documentation page, and the 404 page.

The browser bundle adds client-side navigation and search. The main page content is already present in the generated HTML, so a page remains useful before React starts.

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

`bun run dev` syncs all configured repositories before it starts Vite. Changes in a remote documentation repository do not appear automatically while the server runs. Restart the command or run `bun run docs:sync` to pull them again.

## Configure the site

Edit `repodocs.config.ts` to set the site name, summary, and source link:

```ts
const config = {
  site: {
    name: "RepoDocs",
    description: "Documentation that lives with the code.",
    repository: "https://github.com/example/repodocs",
  },
};
```

These values appear in page titles, headers, metadata, and links on the generated site.

## Edit the RepoDocs guide

The Markdown file at `docs/index.md` is the source for the `/docs/` page. Edit that file to change the public "How it works" guide. The documentation sync renders it and creates its table of contents during each development or production build.

## Add a repository

Create one `.yml` file directly under `repositories/`. The filename is only for local organization. It does not affect the generated URL.

For example, create `repositories/my-project.yml`:

```yaml
name: My project
slug: my-project
repository: https://github.com/example/my-project
type: minecraft
category: mod
rootREADME: true
```

The first three fields are required. The classification fields are optional:

| Field | Purpose |
| --- | --- |
| `name` | The project name shown on the website. |
| `slug` | The stable project URL segment. Use 1 to 63 lowercase letters, numbers, or hyphens. The first character must be a letter or number. Each project must use a unique slug. |
| `repository` | The public HTTPS URL of the Git repository. |
| `type` | The optional default project type. It must be set together with `category`. |
| `category` | The optional default project category. A Minecraft project must use `mod` or `modpack`. |
| `rootREADME` | The optional default for using the root `README.md` as the project landing page. |

The local documentation settings are defaults. Values in the source repository's `docs/repodocs.yml` replace matching local values. The source file cannot replace `name`, `slug`, or `repository`.

RepoDocs scans all direct `.yml` files in `repositories/` during development and production builds. You do not need to update a central list.

Repository URLs must point to the repository root. RepoDocs accepts public HTTPS repositories from GitHub, GitLab, Codeberg, and Bitbucket. URLs with credentials, ports, query values, fragments, or extra path segments are rejected.

## Prepare the source repository

The source repository must have a `docs/` directory at its root. It must contain at least one Markdown file.

A small source repository can use this structure:

```text
my-project/
├── docs/
│   ├── index.md
│   ├── getting-started.md
│   ├── guide/
│   │   ├── index.md
│   │   └── configuration.md
│   ├── images/
│   │   └── example.png
│   ├── .nav.yml
│   └── repodocs.yml
└── .nav.yml                 # optional alternative to docs/.nav.yml
```

`index.md` or `README.md` becomes the page for its directory. Other Markdown filenames become route segments without the `.md` extension. For example:

| Source file | Project-relative page path |
| --- | --- |
| `docs/index.md` | `/` |
| `docs/getting-started.md` | `/getting-started/` |
| `docs/guide/index.md` | `/guide/` |
| `docs/guide/configuration.md` | `/guide/configuration/` |

If there is no root index page, RepoDocs uses the first page in the navigation as the project landing page.

## Project type and category

A source repository can configure its documentation in `docs/repodocs.yml`. Its values replace matching defaults in `repositories/*.yml`:

```yaml
type: minecraft
category: mod
rootREADME: true
```

Both values must use lowercase letters, numbers, or hyphens. A Minecraft project must use `mod` or `modpack` as its category.

Set the optional `rootREADME` value to `true` to use the repository's root `README.md` as the project landing page. The default value is `false`. When this value is enabled, the repository must contain a committed root `README.md` file. Documentation pages and their routes stay unchanged.

Classification controls the directory and project routes:

| Classification | Directory route | Example project route |
| --- | --- | --- |
| `minecraft` and `mod` | `/mods/` | `/mods/my-project/` |
| `minecraft` and `modpack` | `/modpacks/` | `/modpacks/my-project/` |
| No `docs/repodocs.yml` | `/projects/` | `/docs/my-project/` |

Other type and category values create matching directory pages. Minecraft has a dedicated category view with Mods and Modpacks tabs.

For a Minecraft mod, RepoDocs also looks for `src/main/resources/assets/<mod-id>/icon.png`. It uses the first matching file as the favicon for all documentation pages of that mod. If the standard path does not contain an icon, RepoDocs checks the icon path in Fabric, Forge, and NeoForge metadata.

## Write documentation

RepoDocs uses Markdown-it to render `.md` files. It supports standard Markdown features such as headings, lists, links, images, block quotes, tables, and fenced code blocks. Code fences get syntax highlighting when the language is known. Safe HTML elements are supported. Unsafe elements, event handlers, and attributes are removed.

Images can use relative paths. Assets under `docs/` are copied with the documentation. When `rootREADME` is enabled, images referenced by the root README are copied from the source repository and their URLs are rewritten automatically.

The first level-one heading becomes the page title. If the page has no level-one heading, RepoDocs creates a title from the filename. Level-two and level-three headings appear in the page table of contents. Duplicate headings get unique anchors.

Raw HTML is disabled. RepoDocs also normalizes some MkDocs-style content:

- `!!!` and `???` admonitions become block quotes.
- Markdown task list items become visible checked or unchecked symbols.
- Material icon markers and simple MkDocs attribute markers are removed.
- YAML front matter is removed before rendering.

### Links and assets

Use paths relative to the current Markdown file:

```md
[Configuration](guide/configuration.md)
![Example](images/example.png)
```

RepoDocs changes links to known Markdown files into documentation routes. Other relative links become repository asset URLs. It copies all non-Markdown files under `docs/` to `public/repository-assets/<project-slug>/` and keeps their directory structure.

Links cannot escape the `docs/` directory. Absolute URLs are kept as external links and open in a new browser tab.

## Control navigation

Navigation is optional. Without a navigation file, RepoDocs builds a tree from the Markdown files and directories. Index and README pages appear first, followed by the other entries in alphabetical order.

To set the order and labels, add `.nav.yml` at the repository root or at `docs/.nav.yml`. A root `.nav.yml` has priority when both exist.

```yaml
nav:
  - Home: index.md
  - Getting started: getting-started.md
  - Guide:
      - Overview: guide/index.md
      - Configuration: guide/configuration.md
```

Navigation entries can be:

- A filename or directory name.
- A named page or section with one YAML key.
- A nested list of pages and sections.
- `*`, which inserts all items not named at that level.

For example, this keeps the home page first and adds all other files automatically:

```yaml
nav:
  - Home: index.md
  - "*"
```

A directory can also contain its own `.nav.yml`. RepoDocs uses it when it builds navigation for that directory. A missing target or an invalid navigation structure stops the build.

## Page history

Each documentation page shows:

- Its creation date.
- Its last edit date.
- Its authors.
- Its source file path.
- The source commit used for the build.

RepoDocs reads this data with `git log --follow`. It fetches the full history when an older cached clone is shallow. A Markdown file without Git history causes the build to fail. Commit a new page before you try to publish it.

## Commands

| Command | Result |
| --- | --- |
| `bun run docs:sync` | Pull the configured repositories and rebuild the generated documentation data and assets. |
| `bun run dev` | Sync the documentation and start the Vite development server. |
| `bun run build` | Sync, build the browser files, and prerender all static routes into `dist/`. |
| `bun run preview` | Serve the completed `dist/` build for a local production check. Run `bun run build` first. |
| `bun run lint` | Check the project source with ESLint. |

## Generated files and cache

RepoDocs creates these paths during a sync or build:

- `.repodocs-cache/repositories/`: cached Git clones.
- `generated/docs.json`: rendered pages, navigation, project metadata, search content, and source history.
- `public/repository-assets/`: copied files from each source `docs/` directory.
- `dist/`: the deployable static website.

These paths are generated and ignored by Git. Do not edit them by hand.

Existing cached clones are reset to the fetched revision and cleaned before each compile. This only changes the clone inside the RepoDocs cache. It does not change the original source repository.

Set `REPODOCS_CACHE_DIR` to store the cache in another location:

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

Repositories without a valid root `docs/` directory, or without Markdown files in that directory, are skipped. RepoDocs reports each skipped project and continues.

Other problems stop the build. These include an invalid repository file, a duplicate slug, a Git failure, an invalid `docs/repodocs.yml`, a missing navigation target, and a Markdown page without Git history. This behavior prevents the site from publishing incomplete or inconsistent data.

The final website contains:

- A directory page for each known documentation type and category.
- One static route for every documentation page.
- A static 404 page.
- In-browser search across page titles, project names, descriptions, and rendered page text.
- Client-side navigation for internal links.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds and deploys the site:

- After each push to `main`.
- Every three hours, so remote documentation changes are published.
- When started manually from the Actions page.

In the GitHub repository settings, open **Pages** and set **Source** to **GitHub Actions**. The workflow installs the locked Bun dependencies, runs `bun run build`, uploads `dist/`, and deploys it.

The site uses root-relative links. Host it at the root of its configured domain, or update the application paths before you deploy it below a URL prefix.

## Current limits

- Only public repositories are supported. RepoDocs does not support authentication or private repositories.
- The build reads the default branch selected by the remote Git repository.
- Repository configuration files must use the `.yml` extension and must be direct children of `repositories/`.
- Source documentation must be in a root `docs/` directory.
- Documentation updates require a new RepoDocs build and deployment.
