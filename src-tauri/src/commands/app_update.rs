//! Download a GitHub release installer and open it in the system installer UI.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Deserialize;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;

const GITHUB_RELEASES: &str = "https://github.com/ulyngs/digital-habits-blocker/releases/download";
const LATEST_VERSIONS_URL: &str = "https://ulyngs.github.io/digital-habits-blocker/latest-versions.json";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDownloadProgress {
    bytes_received: u64,
    total_bytes: Option<u64>,
    percent: Option<u8>,
}

#[derive(Debug, Deserialize)]
struct LatestVersionsManifest {
    macos: Option<serde_json::Value>,
    sha256: Option<ManifestChecksums>,
}

#[derive(Debug, Deserialize)]
struct ManifestChecksums {
    #[serde(rename = "macosPkg")]
    macos_pkg: Option<String>,
}

fn normalize_version(version: &str) -> String {
    version.trim().trim_start_matches('v').trim().to_string()
}

fn platform_version_from_manifest(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(version) => Some(normalize_version(version)),
        serde_json::Value::Object(map) => map
            .get("version")
            .and_then(|v| v.as_str())
            .map(normalize_version),
        _ => None,
    }
}

async fn fetch_expected_macos_pkg_sha256(version: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("ReDD-Blocker/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("update manifest client: {e}"))?;

    let manifest: LatestVersionsManifest = client
        .get(LATEST_VERSIONS_URL)
        .send()
        .await
        .map_err(|e| format!("Could not fetch update manifest: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Update manifest unavailable: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Update manifest was invalid: {e}"))?;

    let manifest_version = manifest
        .macos
        .as_ref()
        .and_then(platform_version_from_manifest)
        .ok_or_else(|| "Update manifest is missing a macOS version".to_string())?;

    if manifest_version != version {
        return Err(format!(
            "Update manifest version mismatch (manifest {manifest_version}, requested {version})"
        ));
    }

    manifest
        .sha256
        .and_then(|checksums| checksums.macos_pkg)
        .map(|hash| hash.trim().to_lowercase())
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| {
            "Update manifest is missing the macOS installer checksum — try again later".to_string()
        })
}

fn release_asset(version: &str) -> Result<(String, String), String> {
    let version = normalize_version(version);
    if version.is_empty() {
        return Err("missing version".into());
    }
    let tag = format!("v{version}");

    #[cfg(target_os = "macos")]
    {
        let filename = format!("Digital-Habits-Blocker-{version}.pkg");
        let url = format!("{GITHUB_RELEASES}/{tag}/{filename}");
        return Ok((url, filename));
    }

    #[cfg(target_os = "windows")]
    {
        let arch = match std::env::consts::ARCH {
            "aarch64" => "arm64",
            _ => "x64",
        };
        let filename = format!("Digital-Habits-Blocker_{version}_{arch}-setup.exe");
        let url = format!("{GITHUB_RELEASES}/{tag}/{filename}");
        return Ok((url, filename));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = tag;
        Err("in-app update download is not supported on this platform".into())
    }
}

fn installer_dest_path(filename: &str) -> PathBuf {
    std::env::temp_dir().join(filename)
}

async fn download_file(
    app: &AppHandle,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("ReDD-Blocker/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("download client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Could not reach GitHub: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed (HTTP {})",
            response.status().as_u16()
        ));
    }

    let total_bytes = response.content_length();
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("Could not write installer to disk: {e}"))?;

    let mut stream = response.bytes_stream();
    let mut bytes_received: u64 = 0;
    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download interrupted: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Could not save installer: {e}"))?;
        bytes_received += chunk.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(200) {
            emit_progress(app, bytes_received, total_bytes);
            last_emit = Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Could not finish saving installer: {e}"))?;
    emit_progress(app, bytes_received, total_bytes);
    Ok(())
}

async fn verify_file_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("Could not read downloaded installer: {e}"))?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Could not verify installer: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    let actual = format!("{:x}", hasher.finalize());
    if actual.eq_ignore_ascii_case(expected.trim()) {
        Ok(())
    } else {
        Err(
            "Download failed verification — the installer file may be corrupted or tampered with"
                .into(),
        )
    }
}

fn emit_progress(app: &AppHandle, bytes_received: u64, total_bytes: Option<u64>) {
    let percent = total_bytes.map(|total| {
        if total == 0 {
            0
        } else {
            ((bytes_received.saturating_mul(100)) / total).min(100) as u8
        }
    });
    let _ = app.emit(
        "update-download-progress",
        UpdateDownloadProgress {
            bytes_received,
            total_bytes,
            percent,
        },
    );
}

#[cfg(target_os = "macos")]
fn launch_installer(path: &Path) -> Result<(), String> {
    if let Some(path_str) = path.to_str() {
        let _ = std::process::Command::new("/usr/bin/xattr")
            .args(["-d", "com.apple.quarantine", path_str])
            .output();
    }

    let status = std::process::Command::new("/usr/bin/open")
        .arg(path)
        .status()
        .map_err(|e| format!("Could not open installer: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("Could not open installer".into())
    }
}

#[cfg(target_os = "windows")]
fn launch_installer(path: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const DETACHED_PROCESS: u32 = 0x00000008;
    std::process::Command::new(path)
        .creation_flags(DETACHED_PROCESS)
        .spawn()
        .map_err(|e| format!("Could not open installer: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn download_and_run_update(app: AppHandle, version: String) -> Result<(), String> {
    let version = normalize_version(&version);
    let (url, filename) = release_asset(&version)?;
    let dest = installer_dest_path(&filename);

    log::info!("update: downloading {url} -> {}", dest.display());

    if dest.exists() {
        if let Err(e) = tokio::fs::remove_file(&dest).await {
            log::warn!("update: could not remove stale installer {}: {e}", dest.display());
        }
    }

    download_file(&app, &url, &dest).await?;

    #[cfg(target_os = "macos")]
    {
        let expected_sha256 = fetch_expected_macos_pkg_sha256(&version).await?;
        verify_file_sha256(&dest, &expected_sha256).await?;
        log::info!("update: installer checksum verified");
    }

    launch_installer(&dest)?;

    log::info!("update: opened installer at {}", dest.display());
    Ok(())
}
