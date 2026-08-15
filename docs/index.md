# How it works

RepoDocs collects Markdown from public Git repositories and builds one static documentation website. Each project keeps its documentation beside its code, so the source repository stays authoritative.

The published site does not need a database, a server process, or access to Git. A new build publishes changes from the source repositories.

## Add a repository

Add a YAML file to the `repositories/` directory in RepoDocs. The file defines the project name, a stable URL slug, and its public HTTPS repository URL.

```yaml
name: My project
slug: my-project
repository: https://github.com/example/my-project
```

The slug uses lowercase letters, numbers, and hyphens. It stays the same if the repository name changes. Public repositories from GitHub, GitLab, Codeberg, and Bitbucket are supported.

## Write documentation

Put Markdown files in the source repository's root `docs/` directory. An `index.md` or `README.md` file becomes the landing page. Other filenames become page paths without the `.md` extension.

```text
docs/
├── index.md
├── getting-started.md
├── guide/
│   └── configuration.md
└── images/
    └── example.png
```

Relative links between Markdown files become site links. Other files under `docs/`, such as images and downloads, are copied with the same directory structure.

## Organize navigation

Navigation follows the file tree by default. Add `.nav.yml` at the repository root or inside `docs/` to set page names and order.

```yaml
nav:
  - Home: index.md
  - Getting started: getting-started.md
  - Guide:
      - Configuration: guide/configuration.md
```

A navigation file can contain pages, named sections, nested lists, and `*` to include files that are not listed by name.

## Classify the project

An optional `docs/repodocs.yml` file puts a project in the correct directory. For example, use `type: minecraft` with `category: mod` or `category: modpack`. Projects without this file appear under General projects.

## Build the site

During a build, RepoDocs pulls the latest commit from each configured repository. It renders the Markdown, creates navigation, copies assets, and reads creation dates, edit dates, and authors from Git history.

It then creates a static HTML file for every route. The browser code adds fast internal navigation and search across all published pages.

## Publish updates

Documentation changes appear after the next RepoDocs build and deployment. The deployment workflow runs after changes to this repository, on a schedule, or when a maintainer starts it manually.
