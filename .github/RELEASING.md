# Desktop release pipeline

Every push to `master` runs `.github/workflows/release.yml`. The workflow runs the desktop app
tests and required workspace builds, builds the application on native macOS and Windows runners,
uploads the packages as GitHub Actions artifacts, and publishes the same files to a GitHub
Release. The existing `.github/workflows/ci.yml` workflow continues to run the full repository
type-check, test, and build validation.

The generated packages are:

- macOS x64 and arm64: DMG and ZIP
- Windows x64: NSIS installer

The release version is derived from `app/package.json`: its major and minor values are kept,
and the GitHub Actions run number becomes the patch version. For example, base version `1.0.0`
in workflow run 42 is released as `1.0.42` with Git tag `v1.0.42`.

The workflow can also be started manually with **Run workflow** from the GitHub Actions page.

## macOS signing and notarization

Configure these GitHub Actions secrets for a signed and notarized macOS release:

- `MACOS_CERTIFICATE`: base64-encoded Developer ID Application certificate (`.p12`)
- `MACOS_CERTIFICATE_PASSWORD`: certificate password
- `APPLE_ID`: Apple ID used for notarization
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID
- `APPLE_TEAM_ID`: Apple Developer team ID

Without `MACOS_CERTIFICATE`, the workflow creates an ad-hoc signed build. It is suitable for
internal testing, but users may need to approve it in macOS privacy and security settings.
Windows packages are currently unsigned and can trigger a Microsoft Defender SmartScreen warning.
