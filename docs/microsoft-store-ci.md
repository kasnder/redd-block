# Microsoft Store CI submit

On tag pushes (`v*`) and optional manual Release builds, GitHub Actions builds
unsigned Store `.msix` packages and submits them to Partner Center with What’s
new text from [`changelog.md`](../changelog.md). Partner Center re-signs the
packages on ingest.

The submit job is independent of the S3 / GitHub Release job: a Partner Center
outage does not block macOS or direct Windows distribution.

## One-time Partner Center / Entra setup

App update APIs are supported for **free** Store products (ReDD Blocker stays
free to download).

1. In [Partner Center](https://partner.microsoft.com/), ensure a Microsoft Entra
   tenant is associated with the account  
   (Account settings → Organizations / tenant association).
2. In [Entra admin center](https://entra.microsoft.com/), register an application
   (App registrations → New registration). Note the **Application (client) ID**
   and **Directory (tenant) ID**.
3. Under Certificates & secrets, create a **client secret** and copy the value
   immediately.
4. Back in Partner Center → Account settings → User management →
   **Microsoft Entra applications**, add that app and assign the **Manager**
   role.
5. Copy your **Seller ID** (Account settings → Identifiers / Publisher ID).
6. Copy the app’s **Store ID** (Apps and games → ReDD Blocker → Product
   identity / Store listing URL segment, e.g. `9P…`).

## GitHub Actions secrets

Add these repository secrets (separate from Trusted Signing `AZURE_CLIENT_*`
and from package identity `WINDOWS_IDENTITY_*`):

| Secret | Source |
| --- | --- |
| `AZURE_AD_TENANT_ID` | Entra Directory (tenant) ID |
| `AZURE_AD_APPLICATION_CLIENT_ID` | Entra Application (client) ID |
| `AZURE_AD_APPLICATION_SECRET` | Entra client secret value |
| `SELLER_ID` | Partner Center Seller / Publisher ID |
| `MS_STORE_PRODUCT_ID` | Store product ID (`9P…`) |

Existing Store **package identity** secrets (already used by `build:win-store`):

- `WINDOWS_IDENTITY_NAME`
- `WINDOWS_PUBLISHER`
- `WINDOWS_PUBLISHER_DISPLAY_NAME`

## Workflow behaviour

[`Release build`](../.github/workflows/release.yml):

- **Tag push `v*`:** always builds MSIX and submits to the Store (when the five
  secrets above are set).
- **Manual run:** checkbox `submit_microsoft_store` (default on). Submission
  only runs when that box is checked **or** `create_github_release` is checked
  (same gate as creating a Release); tag pushes always submit.

Flow inside [`scripts/submit-microsoft-store.ps1`](../scripts/submit-microsoft-store.ps1):

1. Bundle x64 + ARM64 `.msix` into one `.msixbundle` (`makeappx`).
2. Build What’s new from the changelog section
   ([`scripts/changelog-to-store-whats-new.js`](../scripts/changelog-to-store-whats-new.js)).
3. `msstore submission get` → patch `releaseNotes` on every listing →
   `updateMetadata`.
4. `msstore publish` the bundle (submits for certification). Live availability
   follows the app’s Partner Center publishing schedule after certification.

If What’s new stamping fails, the script still publishes the package and warns
loudly (previous release notes would carry forward — fix in Partner Center).

## Local dry-run (credentials)

On a machine with the [Microsoft Store Developer CLI](https://github.com/microsoft/msstore-cli):

```powershell
msstore reconfigure `
  --tenantId $env:AZURE_AD_TENANT_ID `
  --sellerId $env:SELLER_ID `
  --clientId $env:AZURE_AD_APPLICATION_CLIENT_ID `
  --clientSecret $env:AZURE_AD_APPLICATION_SECRET

msstore apps list
msstore submission get $env:MS_STORE_PRODUCT_ID
```

## Manual fallback

If the five submission secrets are missing, the Store job fails fast with a
clear message. You can still upload the Release’s `.msix` artifacts by hand in
Partner Center → Packages (same as before CI submit existed).
