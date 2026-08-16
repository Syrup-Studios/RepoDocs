# Writing documentation

Each source repository owns its pages, navigation, and documentation assets.

## Prepare the source repository

The source repository must have a `docs/` directory at its root. A native RepoDocs package contains its Markdown pages directly in this directory. A shared ModdedMC V1 package uses a different layout under the same directory. See [ModdedMC compatibility](moddedmc-compatibility.md) for that layout.

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
│   ├── translations/
│   │   └── de/
│   │       ├── index.md
│   │       └── getting-started.md
│   ├── .nav.yml
│   └── repodocs.yml
```

`index.md` or `README.md` becomes the page for its directory. Other Markdown filenames become route segments without the `.md` extension.

| Source file | Project-relative page path |
| --- | --- |
| `docs/index.md` | `/` |
| `docs/getting-started.md` | `/getting-started/` |
| `docs/guide/index.md` | `/guide/` |
| `docs/guide/configuration.md` | `/guide/configuration/` |

If there is no root index page, RepoDocs uses the first page in the navigation as the project landing page.

## Markdown behavior

RepoDocs uses Markdown-it to render `.md` and `.mdx` files. It supports headings, lists, links, images, block quotes, tables, and fenced code blocks. Code fences get syntax highlighting when the language is known. Safe HTML elements are supported. Unsafe elements, event handlers, and attributes are removed. RepoDocs treats `.mdx` as Markdown and does not execute imports, JavaScript expressions, or React components.

Images can use relative paths. Assets under `docs/` are copied with the documentation. When `rootREADME` is active, images from the root README are copied from the repository and their URLs are rewritten.

The first level-one heading becomes the page title. If the page has no level-one heading, RepoDocs creates a title from the filename. Level-two and level-three headings appear in the page table of contents. Duplicate headings get unique anchors.

RepoDocs normalizes some MkDocs-style content:

- `!!!` and `???` admonitions become block quotes.
- Markdown task list items become visible checked or unchecked symbols.
- Material icon markers and simple MkDocs attribute markers are removed.
- YAML front matter is removed before rendering.

## Links and assets

Use paths relative to the current Markdown file:

```md
[Configuration](guide/configuration.md)
![Example](images/example.png)
```

RepoDocs changes links to known Markdown files into documentation routes. Other relative links become repository asset URLs. It copies all non-Markdown files under `docs/` to `public/repository-assets/<project-slug>/<version>/` and keeps their directory structure.

Links cannot escape the `docs/` directory. Absolute URLs stay external and open in a new browser tab.

## Translate documentation

Set `defaultLocale` in `docs/repodocs.yml` when the source language is not English. Put translated Markdown under `docs/translations/<locale>/`. Underscores and hyphens in locale directory names are normalized to hyphens.

```text
docs/
├── index.md
├── guide/
│   └── setup.md
└── translations/
    ├── de/
    │   ├── index.md
    │   └── guide/
    │       └── setup.md
    └── pt_br/
        └── index.md
```

A translation can contain only some pages. RepoDocs uses the default-language page when a translated page is missing. A translated `.nav.yml` is optional. The language selector lists every locale found on the selected version branch.

Translation assets stay inside their locale directory. RepoDocs copies them with the other version assets and rewrites relative paths.

## Control navigation

Navigation is optional. Without a navigation file, RepoDocs builds a tree from Markdown files and directories. Index and README pages appear first. Other entries follow in alphabetical order.

Add `docs/.nav.yml` to set the order and labels.

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

This example keeps the home page first and adds all other files automatically:

```yaml
nav:
  - Home: index.md
  - "*"
```

A directory can contain its own `.nav.yml`. RepoDocs uses it when it builds navigation for that directory. A missing target or invalid navigation structure stops the build.

## Page history

Each documentation page shows:

- Its creation date.
- Its last edit date.
- Its authors.
- Its source file path.
- The source commit used for the build.

RepoDocs reads this data with `git log --follow`. It fetches the full history when an older cached clone is shallow. A Markdown file without Git history stops the build. Commit a new page before you publish it.

## Next step

[Build and deploy RepoDocs](operations.md).
