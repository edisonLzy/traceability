# Desktop release pipeline

Every push to `master` runs `.github/workflows/release.yml`. The workflow runs the desktop app
tests and required workspace builds, builds the application on native macOS and Windows runners,
uploads the packages as GitHub Actions artifacts, and publishes the same files to a GitHub
Release. The existing `.github/workflows/ci.yml` workflow continues to run the full repository
type-check, test, and build validation.

The generated packages and updater manifests are:

- macOS x64 and arm64: DMG and ZIP
- Windows x64: NSIS installer
- macOS: `latest-mac.yml`
- Windows: `latest.yml`

The native build jobs publish directly to the pre-created, published GitHub Release with
`--publish always`. The YAML manifests must be uploaded together with the exact installer/ZIP
files they describe; Windows `electron-updater` cannot find or verify an update without them.
macOS reads the published `latest-mac.yml` manifest, downloads the matching architecture ZIP, and
then replaces the local app with a user-confirmed helper process. This personal-use path does not
require Apple Developer signing or notarization, although Gatekeeper may require a manual approval.
The macOS updater accepts only ZIP assets with a valid SHA-512 digest from `latest-mac.yml` and
verifies the download before replacement; releases without a digest or a matching architecture
are rejected. This avoids depending on GitHub's anonymous REST API rate limit for desktop checks.
Releases must not remain Draft because neither the public provider nor the macOS release lookup
exposes draft releases to clients.

All installers use `app/resources/icon.png`, configured through
`app/electron-builder.yml`. Keep the source PNG square, transparent, and at least
1024×1024; electron-builder derives the platform-specific icon resources during packaging.

The release version is derived from `app/package.json`: its major and minor values are kept,
and the GitHub Actions run number becomes the patch version. For example, base version `1.0.0`
in workflow run 42 is released as `1.0.42` with Git tag `v1.0.42`.

The workflow can also be started manually with **Run workflow** from the GitHub Actions page.

For a local packaging smoke test on macOS:

```bash
pnpm build:app
pnpm --dir app exec electron-builder --mac --arm64 --dir --publish never
```

The unpacked app should contain a generated `.icns` resource and display the Traceability icon.

---

## CLI release pipeline

Every push to `master` that touches `packages/cli/src/**` or `packages/cli/package.json` runs
`.github/workflows/publish-cli.yml`. The workflow builds the CLI package (after building its
server type dependency via Turborepo), then runs `release-it --ci` from inside `packages/cli/`.

`release-it` analyses [Conventional Commits](https://www.conventionalcommits.org/) since the last
`@tracerability/cli@*` git tag and:

- **Publishes a new version** when `feat:`, `fix:`, or `BREAKING CHANGE:` commits are found —
  bumps `packages/cli/package.json`, prepends to `packages/cli/CHANGELOG.md`, creates a signed
  git tag (`@tracerability/cli@x.y.z`), publishes to npm, and creates a GitHub Release.
- **Does nothing** when only `chore:`, `docs:`, `test:`, or similar non-release commits are found.

### Required secret

Add `NPM_TOKEN` (a valid npm access token with publish rights for `@tracerability/cli`) in:
**repo Settings → Secrets and variables → Actions → New repository secret**.

### Local release workflow

```bash
# Preview what would be released (no side effects)
pnpm --filter @tracerability/cli release:dry

# Perform a release locally (requires NPM_TOKEN and GITHUB_TOKEN env vars)
pnpm --filter @tracerability/cli release
```

### Tag format

CLI releases use the tag pattern `@tracerability/cli@x.y.z` (prefixed with the package name) to
avoid conflicts with the desktop app's `v*` tags. The tag is created in `packages/cli/` but pushed
to the shared repository.

---

## macOS signing and notarization

Configure these GitHub Actions secrets for a signed and notarized macOS release:

- `MACOS_CERTIFICATE`: base64-encoded Developer ID Application certificate (`.p12`)
- `MACOS_CERTIFICATE_PASSWORD`: certificate password
- `APPLE_ID`: Apple ID used for notarization
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID
- `APPLE_TEAM_ID`: Apple Developer team ID

Without `MACOS_CERTIFICATE`, the workflow creates an ad-hoc/unsigned build. It is suitable for
this personal-use flow, but users may need to approve it in macOS privacy and security settings.
Windows packages are currently unsigned and can trigger a Microsoft Defender SmartScreen warning.
Apple signing and notarization remain optional here because macOS does not use the signed
`electron-updater` replacement path. Windows code signing is strongly recommended for a trustworthy
installer and fewer SmartScreen warnings.
