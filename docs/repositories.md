# Repository configuration

Repository configuration connects RepoDocs to each public source repository. Local settings define the project identity and defaults. A source repository can replace its documentation settings.

## Add a repository

Create one `.yml` file directly under `repositories/`. The filename is only for local organization. It does not change the generated URL.

For example, create `repositories/my-project.yml`:

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

The first three fields are required. The other fields are optional.

| Field | Purpose |
| --- | --- |
| `name` | The project name shown on the website. |
| `summary` | A plain-text project description with at most 240 characters. |
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
| `versions` | Additional public version IDs mapped to Git branch names. |
| `footer` | An ordered list of links shown after the document and above its page metadata. |

The local documentation settings are defaults. Values in the source repository's `docs/repodocs.yml` replace matching local values. The source file can replace the display name. It cannot replace the stable slug or repository URL.

RepoDocs scans all direct `.yml` files in `repositories/`. You do not need to update a central list.

Repository URLs must point to a repository root. RepoDocs accepts public HTTPS repositories from GitHub, GitLab, Codeberg, and Bitbucket. It rejects URLs with credentials, ports, query values, fragments, or extra path segments.

## Configure the source project

A source repository can use `docs/repodocs.yml` to replace matching defaults from `repositories/*.yml`:

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
  "1.21.1": "1.21"
footer:
  - label: Source
    url: https://github.com/example/my-project
```

`schema` and `id` are required. `schema` must be the number `1`, not the string `"1"`. The ID must match the `slug` in the local repository registration. RepoDocs ignores configuration files that do not declare a schema. It stops the build for an unknown schema, a mismatched ID, or an unknown field.

The published [JSON Schema](/schemas/repodocs.schema.json) provides validation and editor completion. Use a YAML language-server comment to connect a source file to the schema.

Set `name` and `summary` to let the source repository own the public project identity. The summary is plain text. It must fit on one line and cannot exceed 240 characters.

Set `type` and `category` together when the source repository must replace the local classification. Both values must use lowercase letters, numbers, or hyphens. A Minecraft project must use `mod` or `modpack` as its category. The file can omit both values when it only sets other project metadata.

Use `modId` for the ID found in Minecraft resources and loader metadata. Use `owners` for GitHub users or organizations that maintain the project. RepoDocs links each owner to its GitHub profile.

List `gameVersions` from newest to oldest. Use `loaders` for values such as `fabric`, `forge`, `neoforge`, or `quilt`. Use `tags` for project topics. Loaders and tags use lowercase letters, numbers, and hyphens.

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

An explicit license in local metadata or `docs/repodocs.yml` always replaces the detected license of the same type. This is the license priority:

1. Explicit `repodocs.yml` or local repository metadata
2. Detected repository file
3. Primary platform data when platform synchronization is available

RepoDocs ignores symbolic links and license files larger than 512 KiB. It does not guess a license when no supported file exists.

Set `platforms.modrinth.id` or `platforms.curseforge.id` to the project slug on that service. CurseForge also accepts its numeric project ID as a string. RepoDocs uses these references to create project links. Set `platforms.primary` when both services are present. Later platform synchronization will prefer this service when their name, summary, icon, or license differs. The primary service must have a matching project reference. Use `footer` only for additional links.

An omitted source field keeps its local default. An explicit list such as `owners: []` or `tags: []` removes the local list. A complete `licenses` or `platforms` object replaces the matching local object.

Set `rootREADME: true` to use the repository's root `README.md` as the landing page. The default value is `false`. The repository must contain a committed root `README.md` when this setting is active. Other documentation pages and routes do not change.

## Publish documentation versions

The default Git branch is always published with the reserved version ID `latest`. Add `versions` to publish other branches. Each key is the public version ID. Each value is a branch name.

```yaml
versions:
  "1.21.1": "docs/1.21"
  "1.20.1": "docs/1.20"
```

Every configured branch must contain its own root `docs/` directory. Pages, navigation, assets, translations, and Git history are isolated by version. RepoDocs reads `docs/repodocs.yml` from the default branch as the authoritative project configuration.

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

Set `footer` in the local `repositories/*.yml` file or the source repository's `docs/repodocs.yml` file. Each item needs a label and an HTTP or HTTPS URL. Do not repeat Modrinth or CurseForge here when they are present in `platforms`.

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

A footer in `docs/repodocs.yml` replaces the footer in `repositories/*.yml`. Set `footer: []` in the source file to hide the local footer. Footer labels must be unique within one list. URLs cannot contain credentials.

## Next step

[Prepare and write the source documentation](authoring.md).
