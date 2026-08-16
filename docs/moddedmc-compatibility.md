# ModdedMC compatibility

RepoDocs can publish current and legacy ModdedMC Wiki documentation packages without converting their metadata or folder layout. This lets one source tree publish to both websites.

This integration follows the [ModdedMC Wiki repository format](https://github.com/Sinytra/Wiki/tree/master/apps/docs/content/en/docs/folder_structure).

## Current V1 layout

Place the ModdedMC documentation package in the repository's root `docs/` directory:

```text
docs/
├── sinytra-wiki.json
├── assets/
├── docs/
│   ├── _index.mdx
│   ├── _meta.json
│   └── getting-started.mdx
└── translated/
    └── de_de/
        └── docs/
            ├── _meta.json
            └── getting-started.mdx
```

RepoDocs detects this layout from `docs/sinytra-wiki.json` with string schema version `"1"`. It then reads documentation pages from `docs/docs/`. This is separate from the numeric schema value in `repodocs.yml`.

The shared metadata file can contain the current ModdedMC fields:

```json
{
  "schema": "1",
  "id": "example-mod",
  "platforms": {
    "modrinth": "example-mod",
    "curseforge": "example-mod"
  },
  "modid": "example_mod",
  "owners": ["example"],
  "versions": {
    "1.21.1": "docs/1.21"
  },
  "licenses": {
    "project": {
      "id": "MIT"
    }
  }
}
```

RepoDocs maps the fields as follows:

| ModdedMC field | RepoDocs value |
| --- | --- |
| `id` | Stable project ID. It must match the registered repository slug. |
| `platforms.modrinth` | Modrinth project ID. |
| `platforms.curseforge` | CurseForge project ID. |
| `modid` | Minecraft mod ID. |
| `owners` | Project owners. |
| `versions` | Public version IDs mapped to Git branches. |
| `licenses` | Project and documentation license records. |

The deprecated ModdedMC `platform` and `slug` pair is also accepted.

## Legacy layout

ModdedMC treats a metadata file without `schema` as its legacy format. RepoDocs uses the same detection rule.

```text
docs/
├── sinytra-wiki.json
├── _homepage.mdx
├── _meta.json
├── getting-started.mdx
├── .assets/
└── .translated/
    └── de_de/
        ├── _meta.json
        └── getting-started.mdx
```

Legacy pages stay directly under `docs/`. `_homepage.mdx` becomes the documentation home page. RepoDocs also reads `_meta.json` navigation, `.assets/`, and `.translated/<locale>/` from their legacy locations.

## Shared pages and navigation

RepoDocs supports these ModdedMC V1 documentation conventions:

- `.mdx` documentation pages.
- `docs/_index.mdx` as the documentation home page.
- `_meta.json` names and ordering in each documentation folder.
- Assets stored under the package's `assets/` directory.
- Translations stored under `translated/<locale>/docs/`.
- Version branches declared in `sinytra-wiki.json`.

Standard Markdown and safe HTML inside `.mdx` files render on both websites. RepoDocs removes unsafe HTML. It does not execute MDX imports, JavaScript expressions, or React components. ModdedMC-specific interactive components and game-data content pages do not have RepoDocs equivalents. Keep essential guide text in standard Markdown when a page must work on both websites.

## Add RepoDocs-only metadata

`docs/repodocs.yml` is optional for a ModdedMC package. Add it only when the project needs RepoDocs-only fields such as a display name, summary, classification, tags, a default locale, documentation license, or footer links.

When both files exist, RepoDocs reads `sinytra-wiki.json` first and applies `repodocs.yml` afterwards. Shared values in `repodocs.yml` take precedence. ModdedMC continues to read only `sinytra-wiki.json`.
