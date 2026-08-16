# RepoDocs guide

RepoDocs collects Markdown from public Git repositories and builds one versioned and localized documentation website. Each project keeps its documentation beside its code. The source repository stays authoritative.

The published site does not need a database, a server process, or access to Git. Run a new build to publish changes from the source repositories.

## How RepoDocs works

A build has three main stages:

1. **Sync:** RepoDocs reads each YAML file in `repositories/`. It clones a new repository or fetches every configured documentation branch into its local cache.
2. **Compile:** RepoDocs reads the repository's root `docs/` directory on each branch. It converts Markdown to HTML, builds navigation, compiles translations, rewrites local links, copies versioned assets, and reads page history from Git.
3. **Publish:** Vite builds the browser files. The prerender script writes an `index.html` file for every project, directory, documentation page, and the 404 page.

The browser bundle adds client-side navigation and search. The main content is already in the generated HTML. A page remains useful before React starts.

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

## Requirements and quick start

RepoDocs needs Bun 1.3 or newer, Git, and network access to its configured public repositories.

Install the dependencies and start the development server:

```bash
bun install
bun run dev
```

`bun run dev` syncs all configured repositories before it starts Vite. Remote changes do not appear automatically while the server runs. Restart the command or run `bun run docs:sync` to pull them again.

## Configure the site

Edit `repodocs.config.ts` to set the site name, description, and source repository link:

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

The Markdown files in `docs/` are the source for this guide. The `docs/repodocs.yml` file declares schema version 1 and the stable project ID. The documentation sync renders the pages and creates the guide navigation.

## Continue setup

- [Configure repositories and versions](repositories.md).
- [Write and organize documentation](authoring.md).
- [Build and deploy the site](operations.md).
