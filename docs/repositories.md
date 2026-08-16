# Repository configuration

Repository configuration connects RepoDocs to each public source repository. Local settings define the project identity and defaults. A source repository can replace its documentation settings.

## Add a repository

Create one `.yml` file directly under `repositories/`. The filename is only for local organization. It does not change the generated URL.

For example, create `repositories/my-project.yml`:

```yaml
name: My project
slug: my-project
repository: https://github.com/example/my-project
type: minecraft
category: mod
rootREADME: true
defaultLocale: en
platforms:
  modrinth: my-project
  curseforge: my-project
versions:
  "1.21.1": "1.21"
  "1.20.1": "1.20"
footer:
  - label: Modrinth
    url: https://modrinth.com/mod/my-project
  - label: GitHub
    url: https://github.com/example/my-project
```

The first three fields are required. The other fields are optional.

| Field | Purpose |
| --- | --- |
| `name` | The project name shown on the website. |
| `slug` | The stable project URL segment. Use 1 to 63 lowercase letters, numbers, or hyphens. The first character must be a letter or number. Each project must use a unique slug. |
| `repository` | The public HTTPS URL of the Git repository. |
| `type` | The default project type. Set it together with `category`. |
| `category` | The default project category. A Minecraft project must use `mod` or `modpack`. |
| `rootREADME` | Use the root `README.md` as the project landing page. |
| `defaultLocale` | Language code for files directly inside `docs/`. The default is `en`. |
| `platforms` | Project slugs or IDs on Modrinth and CurseForge. |
| `versions` | Additional public version IDs mapped to Git branch names. |
| `footer` | An ordered list of links shown after the document and above its page metadata. |

The local documentation settings are defaults. Values in the source repository's `docs/repodocs.yml` replace matching local values. The source file cannot replace `name`, `slug`, or `repository`.

RepoDocs scans all direct `.yml` files in `repositories/`. You do not need to update a central list.

Repository URLs must point to a repository root. RepoDocs accepts public HTTPS repositories from GitHub, GitLab, Codeberg, and Bitbucket. It rejects URLs with credentials, ports, query values, fragments, or extra path segments.

## Configure the source project

A source repository can use `docs/repodocs.yml` to replace matching defaults from `repositories/*.yml`:

```yaml
# yaml-language-server: $schema=https://your-repodocs-site.example/schemas/repodocs.schema.json
schema: 1
id: my-project
platforms:
  modrinth: my-project
  curseforge: my-project
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

Set `type` and `category` together when the source repository must replace the local classification. Both values must use lowercase letters, numbers, or hyphens. A Minecraft project must use `mod` or `modpack` as its category. The file can omit both values when it only sets other project metadata.

Set `platforms.modrinth` or `platforms.curseforge` to the project slug on that service. CurseForge also accepts its numeric project ID as a string. RepoDocs uses this metadata to create project links. Use `footer` only for additional links.

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
