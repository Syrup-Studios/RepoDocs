# Incremental builds and deployment

This page is for RepoDocs operators. The normal deployment uses validated local caches to reduce repeated project compilation and static route rendering. A cache miss or invalid entry causes a rebuild.

## Build commands

Run commands from the RepoDocs root with Bun 1.3.14 and Git available.

| Command | Result |
| --- | --- |
| `bun run docs:sync:incremental` | Fetch source repositories and reuse a project compile only when its current source and compiler key match a valid cache entry. |
| `bun run build:incremental` | Run incremental sync, build the browser files, and prerender the site. |
| `bun run build:clean` | Clear compiled-project and prerender caches, then build every project and route. Use this to compare a clean build or diagnose cache behavior. |
| `bun run build` | Run a full project sync, build browser files, and prerender the site. |

Set `REPODOCS_CACHE_DIR` to put all local RepoDocs caches outside the repository:

```sh
REPODOCS_CACHE_DIR=/var/cache/repodocs bun run build:incremental
```

## Cache contents and checks

RepoDocs uses these cache paths under `.repodocs-cache/` by default:

- `repositories/` holds Git clones used to fetch configured branches and history. GitHub Actions does not transfer this cache between runs.
- `compiled/` holds per-project compiled data and copied assets. The manifest records a compiler fingerprint and each project key. Project keys include its repository identity, fetched revision for every version, registration fields, effective metadata, and compiler inputs. Entries are checked against hashes before use.
- `prerender/` holds static HTML bodies indexed by route, a rendering key, and a body hash. The key includes the project data and route, relevant directory data, site data, and the frontend rendering source fingerprint. Missing, mismatched, or corrupt bodies are rendered again.

The site build always assembles the current index, browser bundle, static route files, and `publication.json`. Reusing a cache entry does not decide whether a project is published. The Worker checks the deployed publication manifest and source revisions.

## GitHub Actions behavior

`.github/workflows/deploy-pages.yml` uses frozen Bun lock installation and `build:incremental`. It restores and saves only `compiled/` and `prerender/` under a versioned key. Restore uses the most recent key with the same cache version and runner OS. The cache save occurs only after the build output check passes.

Cache restore and save are limited to `Syrup-Studios/RepoDocs` on `main`. A manual run on another branch builds without a transferred cache and does not save one. The workflow validates the publication manifest, generated project data, and every route from the static route list. It uploads the full `dist/` directory only after validation.

The registration pull-request workflow uses `build:clean` on a fresh runner. It does not restore or save an Actions cache. It checks out the pull request's base revision and copies only the changed registration YAML files from the pull request before it builds. It does not run pull request code or use pull request artifacts as a cache.

## Cache key changes

The Actions cache key starts with `repodocs-build-cache-v1`. Increment this version when the cache layout or trust rules change. The compiled and prerender manifests also check their own format versions and input fingerprints. Those checks handle ordinary code, source, registration, and content changes without changing the Actions cache key.

Do not upload only changed routes or projects to Pages. GitHub Pages receives the complete, validated `dist/` output for each deployment.
