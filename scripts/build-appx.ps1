param(
  [string]$Architecture = "x64"  # x64 or arm64
)

$ErrorActionPreference = "Stop"

# Configuration
$AppName = "ReDD Block"
$AppVersion = "0.4.2.0"  # APPX requires 4-part version
$Publisher = "CN=EC16037E-D0B5-446F-9912-F41B3DCCBFB3"
$IdentityName = "ReduceDigitalDistraction.ReDDBlock"
$DisplayName = "ReDD Block"
$PublisherDisplayName = "Reduce Digital Distraction"

# Paths
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Set release directory based on architecture
if ($Architecture -eq "x64") {
  $ReleaseDir = Join-Path $ProjectRoot "src-tauri\target\x86_64-pc-windows-msvc\release"
  $HelperDir = Join-Path $ProjectRoot "helper-daemon\target\x86_64-pc-windows-msvc\release"
}
else {
  $ReleaseDir = Join-Path $ProjectRoot "src-tauri\target\aarch64-pc-windows-msvc\release"
  $HelperDir = Join-Path $ProjectRoot "helper-daemon\target\aarch64-pc-windows-msvc\release"
}

$AppxDir = Join-Path $ProjectRoot "appx-build"
$AssetsSource = Join-Path $ProjectRoot "assets\appx"
$OutputAppx = Join-Path $ProjectRoot "ReDD-Block_$($AppVersion)_$($Architecture).appx"

# Auto-generate APPX assets if missing
if (-not (Test-Path $AssetsSource)) {
  Write-Host "APPX assets not found. Generating..." -ForegroundColor Yellow
  
  # Check if base icons exist first
  $IconsDir = Join-Path $ProjectRoot "assets\icons\1024x1024.png"
  if (-not (Test-Path $IconsDir)) {
    Write-Host "Generating base icons from SVG..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    node scripts/generate-icons-from-svg.js
    Pop-Location
  }
  
  # Generate APPX assets
  Push-Location $ProjectRoot
  node scripts/generate-appx-assets.js
  Pop-Location
  
  if (-not (Test-Path $AssetsSource)) {
    Write-Error "Failed to generate APPX assets. Make sure Node.js and sharp are installed."
    exit 1
  }
  Write-Host "APPX assets generated successfully." -ForegroundColor Green
}

# Find makeappx.exe - use host machine architecture, not target architecture
$WindowsKitsPath = "C:\Program Files (x86)\Windows Kits\10\bin"
# Detect host architecture (the machine running this script)
$HostArch = if ([Environment]::Is64BitOperatingSystem) {
  if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
}
else { "x86" }

$MakeAppx = Get-ChildItem -Path $WindowsKitsPath -Recurse -Filter "makeappx.exe" | 
Where-Object { $_.FullName -match "\\$HostArch\\" } | 
Sort-Object LastWriteTime -Descending | 
Select-Object -First 1

if (-not $MakeAppx) {
  Write-Error "makeappx.exe not found. Please install Windows 10 SDK."
  exit 1
}

Write-Host "Building $Architecture APPX package..."
Write-Host "Using makeappx.exe: $($MakeAppx.FullName)"

# Clean and create appx directory
if (Test-Path $AppxDir) {
  Remove-Item -Recurse -Force $AppxDir
}
New-Item -ItemType Directory -Path $AppxDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $AppxDir "Assets") | Out-Null

# Copy main executable
Write-Host "Copying application files from $ReleaseDir..."
Copy-Item (Join-Path $ReleaseDir "redd-block.exe") $AppxDir

# Copy helper daemon with architecture-specific name (required by app code)
Write-Host "Copying helper from $HelperDir..."
if ($Architecture -eq "x64") {
  $HelperTargetName = "redd-block-helper-x86_64-pc-windows-msvc.exe"
}
else {
  $HelperTargetName = "redd-block-helper-aarch64-pc-windows-msvc.exe"
}
Copy-Item (Join-Path $HelperDir "redd-block-helper.exe") (Join-Path $AppxDir $HelperTargetName)

# Copy WebView2 loader if exists
$WebView2Loader = Join-Path $ReleaseDir "WebView2Loader.dll"
if (Test-Path $WebView2Loader) {
  Copy-Item $WebView2Loader $AppxDir
}

# Copy assets
Write-Host "Copying assets..."
Get-ChildItem $AssetsSource -Filter "*.png" | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $AppxDir "Assets\$($_.Name)")
}

# Create AppxManifest.xml
Write-Host "Creating AppxManifest.xml..."
$ManifestContent = @"
<?xml version="1.0" encoding="utf-8"?>
<Package 
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  
  <Identity 
    Name="$IdentityName" 
    Publisher="$Publisher" 
    Version="$AppVersion" 
    ProcessorArchitecture="$Architecture" />
  
  <Properties>
    <DisplayName>$DisplayName</DisplayName>
    <PublisherDisplayName>$PublisherDisplayName</PublisherDisplayName>
    <Logo>Assets\StoreLogo.scale-100.png</Logo>
  </Properties>
  
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" />
  </Dependencies>
  
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  
  <Applications>
    <Application Id="App" Executable="redd-block.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements 
        DisplayName="$DisplayName" 
        Description="Block distracting websites and apps to stay focused"
        BackgroundColor="transparent" 
        Square150x150Logo="Assets\Square150x150Logo.scale-100.png"
        Square44x44Logo="Assets\Square44x44Logo.scale-100.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.scale-100.png" Square71x71Logo="Assets\SmallTile.scale-100.png" Square310x310Logo="Assets\LargeTile.scale-100.png" />
        <uap:SplashScreen Image="Assets\Square150x150Logo.scale-200.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@

$ManifestContent | Out-File -FilePath (Join-Path $AppxDir "AppxManifest.xml") -Encoding UTF8

# Create the APPX package
Write-Host "Creating APPX package..."
& $MakeAppx.FullName pack /d $AppxDir /p $OutputAppx /o

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "SUCCESS! APPX package created: $OutputAppx" -ForegroundColor Green
  Write-Host ""
  Write-Host "Next steps for Windows Store submission:" -ForegroundColor Yellow
  Write-Host "1. Sign the package with your certificate (if required)"
  Write-Host "2. Upload to Partner Center: https://partner.microsoft.com/dashboard"
}
else {
  Write-Error "makeappx.exe failed with exit code $LASTEXITCODE"
}
