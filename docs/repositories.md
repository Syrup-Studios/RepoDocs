# Add and configure a project

RepoDocs uses two configuration files for different purposes:

| File | Who manages it | Purpose |
| --- | --- | --- |
| `docs/repodocs.yml` | Project owner | Defines the documentation and public project metadata. This file belongs in the project repository. |
| `repositories/<project>.yml` | RepoDocs site operator | Registers the public Git repository with one RepoDocs website. This file belongs in the RepoDocs website repository. |

Most project owners only edit `docs/repodocs.yml`. Do not add a `repositories/` directory to your project. The site operator manages that directory on the server side.

## For project owners

### Create the project configuration

Create `docs/repodocs.yml` in your project repository. The path must start at the repository root:

```text
my-project/
├── docs/
│   ├── index.md
│   └── repodocs.yml
└── README.md
```

A minimal configuration contains a schema version and a stable project ID:

```yaml
# yaml-language-server: $schema=https://your-repodocs-site.example/schemas/repodocs.schema.json
schema: 1
id: my-project
```

Ask the site operator which ID to use. It must match the `slug` in the site registration. Adding `docs/repodocs.yml` does not register the repository by itself. The site operator must register the repository once before RepoDocs can find it.

You can add public project metadata to the same file:

```yaml
# yaml-language-server: $schema=https://your-repodocs-site.example/schemas/repodocs.schema.json
schema: 1
id: my-project
name: My project
summary: A small technology mod with configurable machines.
modId: my_project
owners:
  - example
gameVersions:
  - "1.21.1"
  - "1.20.1"
loaders:
  - fabric
  - neoforge
tags:
  - technology
platforms:
  primary: modrinth
  modrinth:
    id: my-project
  curseforge:
    id: my-project
licenses:
  project:
    id: MIT
    url: https://opensource.org/license/mit
  documentation:
    id: CC-BY-4.0
    url: https://creativecommons.org/licenses/by/4.0/
type: minecraft
category: mod
rootREADME: true
defaultLocale: en
versions:
  "1.21.1": "docs/1.21"
footer:
  - label: Source
    url: https://github.com/example/my-project
```

`schema` and `id` are required. `schema` must be the number `1`, not the string `"1"`. The ID must match the registered project slug. RepoDocs ignores a file that has no schema. It stops the build for an unknown schema, a mismatched ID, or an unknown field.

The published [JSON Schema](/schemas/repodocs.schema.json) provides validation and editor completion. Replace the example domain in the YAML language-server comment with the address of your RepoDocs website.

A project that also publishes on ModdedMC can use `docs/sinytra-wiki.json` and the ModdedMC V1 folder layout instead. RepoDocs reads that file directly. It does not require duplicated shared metadata in `repodocs.yml`. See [ModdedMC compatibility](moddedmc-compatibility.md).

### Available project fields

| Field | Purpose |
| --- | --- |
| `schema` | RepoDocs metadata format. The current value is the number `1`. |
| `id` | Stable project ID. It must match the slug registered by the site operator. |
| `name` | Project name shown on the website. |
| `summary` | Plain-text project description with at most 240 characters. |
| `type` | Project type. Set it together with `category`. |
| `category` | Project category. A Minecraft project must use `mod` or `modpack`. |
| `modId` | Lowercase Minecraft mod ID. |
| `owners` | GitHub users or organizations that own the project. |
| `gameVersions` | Supported game versions, ordered from newest to oldest. This does not create documentation versions. |
| `loaders` | Supported loaders or runtimes. Values use lowercase URL-safe names. |
| `tags` | Searchable project labels. Values use lowercase URL-safe names. |
| `licenses` | Separate project and documentation license records. |
| `rootREADME` | Uses the root `README.md` as the project landing page when set to `true`. |
| `defaultLocale` | Language code for files directly inside `docs/`. The default is `en`. |
| `platforms` | Project references for Modrinth and CurseForge. |
| `versions` | Additional documentation version IDs mapped to Git branch names. |
| `footer` | Ordered links shown after each document and before its page metadata. |

Set `name` and `summary` to let the source repository own the public project identity. The summary is plain text. It must fit on one line and cannot exceed 240 characters.

Set `type` and `category` together. Both values must use lowercase letters, numbers, or hyphens. A Minecraft project must use `mod` or `modpack` as its category.

Use `modId` for the ID found in Minecraft resources and loader metadata. Use `owners` for GitHub users or organizations that maintain the project. RepoDocs links each owner to its GitHub profile.

List `gameVersions` from newest to oldest. This field only describes compatibility. It does not publish branches or add items to the documentation version selector. Use `versions` for documentation branches. Use `loaders` for values such as `fabric`, `forge`, `neoforge`, or `quilt`. Use `tags` for project topics.

Set `rootREADME: true` to use the repository's root `README.md` as the landing page. The repository must contain a committed root `README.md` when this setting is active. Other documentation pages and routes do not change.

## For site operators

### Register the source repository

This step applies only to the person who operates the RepoDocs website. Create one `.yml` file directly under `repositories/` in the RepoDocs website repository. Do not put this file in the source project.

For example, create `repositories/my-project.yml` in the RepoDocs website repository:

```yaml
name: My project
summary: A short description of what the project does.
slug: my-project
repository: https://github.com/example/my-project
type: minecraft
category: mod
modId: my_project
owners:
  - example
gameVersions:
  - "1.21.1"
loaders:
  - fabric
tags:
  - technology
rootREADME: true
defaultLocale: en
platforms:
  primary: modrinth
  modrinth:
    id: my-project
  curseforge:
    id: my-project
licenses:
  project:
    id: MIT
    url: https://opensource.org/license/mit
  documentation:
    id: CC-BY-4.0
    url: https://creativecommons.org/licenses/by/4.0/
versions:
  "1.21.1": "1.21"
  "1.20.1": "1.20"
footer:
  - label: GitHub
    url: https://github.com/example/my-project
```

`name`, `slug`, and `repository` are required. The other fields are optional defaults for projects that do not define them in `docs/repodocs.yml`.

| Field | Purpose |
| --- | --- |
| `name` | Default project name shown on the website. |
| `summary` | Default plain-text project description with at most 240 characters. |
| `slug` | The stable project URL segment. Use 1 to 63 lowercase letters, numbers, or hyphens. The first character must be a letter or number. Each project must use a unique slug. |
| `repository` | The public HTTPS URL of the Git repository. |
| `type` | The default project type. Set it together with `category`. |
| `category` | The default project category. A Minecraft project must use `mod` or `modpack`. |
| `modId` | The lowercase Minecraft mod ID. |
| `owners` | GitHub users or organizations that own the project. |
| `gameVersions` | Supported game versions, ordered from newest to oldest. |
| `loaders` | Supported loaders or runtimes. Values use lowercase URL-safe names. |
| `tags` | Searchable project labels. Values use lowercase URL-safe names. |
| `licenses` | Separate project and documentation license records. |
| `rootREADME` | Use the root `README.md` as the project landing page. |
| `defaultLocale` | Language code for files directly inside `docs/`. The default is `en`. |
| `platforms` | Structured project references for Modrinth and CurseForge. |
| `versions` | Default additional documentation version IDs mapped to Git branch names. |
| `footer` | An ordered list of links shown after the document and above its page metadata. |

The registration settings are defaults. Values in the source repository's `docs/repodocs.yml` replace matching default values. The source file cannot replace the stable slug or repository URL.

RepoDocs scans all direct `.yml` files in `repositories/`. You do not need to update a central list.

Repository URLs must point to a repository root. RepoDocs accepts public HTTPS repositories from GitHub, GitLab, Codeberg, and Bitbucket. It rejects URLs with credentials, ports, query values, fragments, or extra path segments.

If the source file omits a field, RepoDocs keeps the registration default. If the source file defines a field, it replaces the complete default value for that field. RepoDocs does not merge lists or maps. For example, a source `versions` map replaces the complete registration `versions` map.

The `licenses.project` and `licenses.documentation` records are independent. Each record must have an SPDX `id` or a display `name`. A record can also have an HTTP or HTTPS `url`.

### Detect licenses automatically

RepoDocs detects a project license from one of these files in the repository root:

```text
LICENSE
LICENSE.md
LICENSE.txt
LICENCE
LICENCE.md
LICENCE.txt
COPYING
COPYING.md
COPYING.txt
```

It checks the same filenames directly inside `docs/` for a separate documentation license. It does not use the project license as the documentation license.

RepoDocs identifies common SPDX licenses only when the file contains clear matching text. An unrecognized file becomes a custom license. When possible, RepoDocs uses the first license title near the start of a custom file as its display name. Detected license records link to the file on the repository's default branch and include their source path in generated data.

An explicit license in the site registration or `docs/repodocs.yml` always replaces the detected license of the same type. This is the license priority:

1. Explicit `repodocs.yml` or site registration metadata
2. Detected repository file
3. Primary platform data when platform synchronization is available

RepoDocs ignores symbolic links and license files larger than 512 KiB. It does not guess a license when no supported file exists.

Set `platforms.modrinth.id` or `platforms.curseforge.id` to the project slug on that service. CurseForge also accepts its numeric project ID as a string. RepoDocs uses these references to create project links. Set `platforms.primary` when both services are present. Later platform synchronization will prefer this service when their name, summary, icon, or license differs. The primary service must have a matching project reference. Use `footer` only for additional links.

An omitted source field keeps its site-registration default. An explicit list such as `owners: []` or `tags: []` removes the registration list. A complete `licenses` or `platforms` object replaces the matching registration object.

## Publish documentation versions

Documentation versions and `gameVersions` are different. `gameVersions` is only compatibility metadata. The `versions` map publishes documentation from Git branches.

The default Git branch is always published with the reserved ID `latest`. If a project does not define `versions`, its version selector contains only `Latest`.

Add `versions` to `docs/repodocs.yml` on the default branch to publish other branches. Each key is the public version ID shown in the selector and URL. Each value is the exact Git branch name:

```yaml
versions:
  "1.21.1": "docs/1.21"
  "1.20.1": "docs/1.20"
```

This configuration publishes three documentation versions:

| Selector label | Public version ID | Git source |
| --- | --- | --- |
| `Latest` | `latest` | The repository's default branch |
| `1.21.1` | `1.21.1` | The `docs/1.21` branch |
| `1.20.1` | `1.20.1` | The `docs/1.20` branch |

The version ID does not need to equal the branch name or a game version. It must start with a lowercase letter or number. It can contain lowercase letters, numbers, periods, underscores, and hyphens. It can contain at most 32 characters. The ID `latest` is reserved and cannot appear in the map.

Every configured branch must exist and contain its own root `docs/` directory. Pages, navigation, assets, translations, and Git history are isolated by version. A missing branch or invalid version package stops the build.

RepoDocs reads the project configuration from the default branch before it checks out version branches. This default-branch configuration is authoritative for all versions. A `versions` map inside an older branch does not change the published versions.

If both the site registration and `docs/repodocs.yml` define `versions`, the source map replaces the complete site-registration map. It does not add to it. Use an empty map to remove all additional versions:

```yaml
versions: {}
```

When a reader selects another version, RepoDocs tries to open the same page and language. If the page is not present, it opens that version's default page. If the language is not present, it uses the project's default language. A new build is required after a documentation branch changes.

The canonical documentation route is:

```text
/{locale}/project/{slug}/{version}/docs/{page}
```

The project overview uses the same version context:

```text
/{locale}/project/{slug}/{version}/
```

For example, `/en/project/my-project/1.21.1/docs/configuration/` opens the English configuration page from the `docs/1.21` branch. This canonical route is the only project documentation route.

## Project routes

Classification controls where a project appears in the directory. It does not change the project URL:

| Classification | Directory route | Example overview route |
| --- | --- | --- |
| `minecraft` and `mod` | `/mods/` | `/en/project/my-project/latest/` |
| `minecraft` and `modpack` | `/modpacks/` | `/en/project/my-project/latest/` |
| No `type` and `category` | `/projects/` | `/en/project/my-project/latest/` |

Other type and category values create matching directory pages. Minecraft has a dedicated category view with Mods and Modpacks tabs.

For a Minecraft mod, RepoDocs looks for `src/main/resources/assets/<mod-id>/icon.png`. It uses the first matching file as the favicon. If the standard path does not contain an icon, RepoDocs checks the icon path in Fabric, Forge, and NeoForge metadata.

## Add repository-wide footer links

Project owners set `footer` in `docs/repodocs.yml`. A site operator can also provide a default footer in the project registration. Each item needs a label and an HTTP or HTTPS URL. Do not repeat Modrinth or CurseForge here when they are present in `platforms`.

```yaml
footer:
  - label: Modrinth
    url: https://modrinth.com/mod/my-project
  - label: CurseForge
    url: https://www.curseforge.com/minecraft/mc-mods/my-project
  - label: GitHub
    url: https://github.com/example/my-project
```

RepoDocs uses the configured project name. It keeps the link order from the YAML file. The link block appears directly after the document and above its timestamps and source data.

A footer in `docs/repodocs.yml` replaces the site-registration footer. Set `footer: []` in the source file to hide the registration footer. Footer labels must be unique within one list. URLs cannot contain credentials.

## Next step

[Prepare and write the source documentation](authoring.md).
