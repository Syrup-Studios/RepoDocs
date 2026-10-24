# Authentication Worker setup

This Worker provides GitHub App sign-in and server-side sessions for RepoDocs.

## GitHub App

Create a GitHub App and enable expiring user access tokens. Set its callback URL to:

`https://<worker-host>/auth/github/callback`

The Worker requests `offline_access`. Grant the user authorization app `Metadata: read` repository permission so it can list installations and check repository permissions. The Worker does not expose GitHub tokens to the browser.

## Cloudflare setup

From the `backend` directory:

1. Install backend dependencies with `bun install --frozen-lockfile`.
2. Create the D1 database with `bun run db:create` and place the returned ID in `wrangler.toml`.
3. Set Worker secrets `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_ORIGIN`, and `SESSION_ENCRYPTION_KEY`.
4. Set `APP_ORIGIN` to the exact site origin, including scheme and port where used. Set the GitHub repository Actions variable `REPODOCS_API_ORIGIN` to the Worker API origin, for example `https://api.example.com`. The Pages build passes this public origin to Vite as `VITE_API_BASE_URL`; do not put credentials or secrets in this variable. The site may use `https://docs.example.com`. The site and Worker must use custom hostnames under the same registrable domain so browser requests are same-site. A default `*.workers.dev` Worker with a GitHub Pages site is cross-site and will not support this cookie flow reliably.
5. Create a random 32-byte encryption key and encode it as base64 for `SESSION_ENCRYPTION_KEY`.
6. Apply the D1 migration with `bun run db:migrate:remote`.
7. Deploy with `bun run deploy`.

Use `wrangler secret put <NAME>` to set each secret. `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are GitHub App credentials. The callback URL host must match the deployed Worker host and the callback URL configured in GitHub.

For local development, use the local D1 migration command. Set the same secrets for the local Worker, and use the exact frontend origin as `APP_ORIGIN`. The session and OAuth cookies use `SameSite=Lax`; deploy the site and Worker on same-site hostnames for production.

## HTTP contract

- `GET /auth/github` starts the OAuth flow with state and PKCE S256.
- `GET /auth/github/callback` creates a secure, HttpOnly session cookie.
- `GET /api/me` returns `{ "user": { "id": number, "login": string, "avatarUrl": string }, "csrfToken": string }` when signed in. It returns `401` with `{ "user": null }` otherwise.
- `POST /auth/logout` requires the session cookie, exact `Origin`, and `X-CSRF-Token` returned by `/api/me`. It revokes the D1 session and clears the cookie.

The browser API client must use credentials and send `X-CSRF-Token` on logout. Configure its API base URL as `VITE_API_BASE_URL`.

## Repository registration

Apply all D1 migrations before using repository registration. Copy `.dev.vars.example` to `.dev.vars` for local development. Do not commit secret values.

Create a separate GitHub App for publishing registration pull requests. Install it only on `Syrup-Studios/RepoDocs`. Grant repository `Contents: write`, `Pull requests: write`, and `Actions: read`. Grant `Actions: write` only if operators use explicit refresh requests. Set `PUBLISHER_APP_ID`, `PUBLISHER_INSTALLATION_ID`, and `PUBLISHER_PRIVATE_KEY_PKCS8` as Worker secrets. The private key value must be base64 encoded PKCS#8 DER. The Worker requests an installation token limited to the `RepoDocs` repository. Registration PRs use `Contents: write` and `Pull requests: write`; status checks use `Actions: read`; explicit refresh requests use `Actions: write`.

Set the Worker variable `AUTO_APPROVE_VERIFIED_REPOSITORIES` to `true` only when you want the Worker to request GitHub auto-merge for new registration and change PRs. The default is `false`. Before you enable it, enable auto-merge in RepoDocs settings and make the `validate` status check from `.github/workflows/validate-registration.yml` required on the `main` branch. Add any other required reviews and checks there. GitHub only merges after all required checks and reviews pass. The Worker does not approve or merge a PR directly, and it does not bypass branch protection. If GitHub cannot enable auto-merge, the PR stays open and the API returns `autoMergeStatus: "unavailable"` with a message. Successful requests return `autoMergeStatus: "requested"`; this does not mean that the PR has merged.

`GET /api/github/repositories` returns public, non-archived repositories the signed-in user can access, with their admin flag. `GET /api/repositories` returns registrations the user currently administers, plus that user's pending submissions and changes. The Worker checks the numeric GitHub repository ID, current admin permission, registration YAML on the RepoDocs default branch, live PR state, and the deployed `/publication.json` manifest. A registration is `published` only when the manifest source revision matches the current RepoDocs main revision and its slug and HTTPS GitHub repository URL match. A merged registration that is not in the deployed manifest is `publishing`. `update_failed` appears only when the latest completed deploy workflow run for the current RepoDocs main SHA has a real failure conclusion; if Actions status is unavailable or the run is pending, the Worker reports `publishing`. An open edit PR has status `pending_approval`; an open removal PR has status `removal_pending`. The response includes `siteSourceRevision` from the manifest. `latestPublishedAt` is the timestamp in the deployed artifact manifest, not an exact Pages activation time. The manifest has `{ "publishedAt": string, "siteSourceRevision": string, "projects": [{ "slug": string, "repositoryUrl": string, "sourceRevision": string, "documentationUrl": string, "iconUrl"?: string }] }`.

`POST /api/repositories/validate` checks the GitHub root URL, admin permission, app installation, and documentation layout. It looks for a Markdown or MDX page in `docs/` and bounded nested folders, parses optional `docs/repodocs.yml`, checks its schema and common fields, and returns safe defaults in `docs.metadata`. This is a preflight. The required `validate` workflow and full site build remain authoritative. `POST /api/repositories` repeats the checks, validates the registration fields, and opens a pull request that adds only `repositories/<slug>.yml`. It returns `{ "registration": { "slug": string, "status": "pending_approval", "prUrl": string } }`. The Worker does not merge the pull request. A pending approval means the pull request is open; it does not mean the repository is published.

`GET /api/repositories/:slug` and `GET /api/repositories/:slug/status` return a registration's current YAML fields and publication status after a fresh admin check. `PATCH /api/repositories/:slug` opens a pull request that edits only its existing `repositories/<slug>.yml` file. The slug and repository URL cannot change. Omitted optional fields keep their current values; send `null` for `summary`, `defaultLocale`, or both `type` and `category` to clear them, and send an empty `versions` object to clear versions. `DELETE /api/repositories/:slug` requires JSON `{ "confirm": true }` and opens a pull request to remove only that YAML file. Both change requests require the session, exact `Origin`, and CSRF token. The Worker rejects changes while an initial registration pull request is active. A change response has `{ "registration": { "slug": string, "operation": "edit" | "delete", "status": "pending_approval", "prUrl": string } }` and may include `autoMergeStatus` when auto-merge is enabled.

`POST /api/repositories/:slug/refresh` checks the current admin permission and asks GitHub Actions to dispatch `.github/workflows/deploy-pages.yml` on `main`. It returns `{ "refresh": { "status": "requested" } }` only after GitHub accepts the dispatch. Requests are limited to one per repository every ten minutes. A request does not confirm that a deployment completed or that the registration is published.
