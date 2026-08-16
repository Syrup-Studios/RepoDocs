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
| `footer` | An ordered list of links shown after the document and above its page metadata. |

The local documentation settings are defaults. Values in the source repository's `docs/repodocs.yml` replace matching local values. The source file cannot replace `name`, `slug`, or `repository`.

RepoDocs scans all direct `.yml` files in `repositories/`. You do not need to update a central list.

Repository URLs must point to a repository root. RepoDocs accepts public HTTPS repositories from GitHub, GitLab, Codeberg, and Bitbucket. It rejects URLs with credentials, ports, query values, fragments, or extra path segments.

## Configure the source project

A source repository can use `docs/repodocs.yml` to replace matching defaults from `repositories/*.yml`:

```yaml
type: minecraft
category: mod
rootREADME: true
footer:
  - label: Modrinth
    url: https://modrinth.com/mod/my-project
  - label: CurseForge
    url: https://www.curseforge.com/minecraft/mc-mods/my-project
```

Set `type` and `category` together when the source repository must replace the local classification. Both values must use lowercase letters, numbers, or hyphens. A Minecraft project must use `mod` or `modpack` as its category. The file can omit both values when it only sets `rootREADME` or `footer`.

Set `rootREADME: true` to use the repository's root `README.md` as the landing page. The default value is `false`. The repository must contain a committed root `README.md` when this setting is active. Other documentation pages and routes do not change.

## Project routes

Classification controls directory and project routes:

| Classification | Directory route | Example project route |
| --- | --- | --- |
| `minecraft` and `mod` | `/mods/` | `/mods/my-project/` |
| `minecraft` and `modpack` | `/modpacks/` | `/modpacks/my-project/` |
| No `type` and `category` | `/projects/` | `/docs/my-project/` |

Other type and category values create matching directory pages. Minecraft has a dedicated category view with Mods and Modpacks tabs.

For a Minecraft mod, RepoDocs looks for `src/main/resources/assets/<mod-id>/icon.png`. It uses the first matching file as the favicon. If the standard path does not contain an icon, RepoDocs checks the icon path in Fabric, Forge, and NeoForge metadata.

## Add repository-wide footer links

Set `footer` in the local `repositories/*.yml` file or the source repository's `docs/repodocs.yml` file. Each item needs a label and an HTTP or HTTPS URL.

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
