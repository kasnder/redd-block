#!/usr/bin/env bash
set -euo pipefail

readonly ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
readonly DEFAULT_KEYSTORE="${HOME}/StudioProjects/Keys/redd.jks"
readonly KEYCHAIN_ACCOUNT="${USER:?USER is not set}"
readonly STORE_PASSWORD_SERVICE="redd-block_android_keystore_password"
readonly KEY_PASSWORD_SERVICE="redd-block_android_key_password"
readonly KEY_ALIAS_SERVICE="redd-block_android_key_alias"
readonly ANDROID_PROJECT="$ROOT/src-tauri/gen/android"
readonly OUTPUT_DIR="${REDD_BLOCK_ANDROID_OUTPUT_DIR:-$ROOT/for-distribution/android}"

usage() {
    cat <<EOF
Usage:
  $0 --setup    Store the Android signing credentials in macOS Keychain.
  $0            Build and verify a signed Google Play AAB.

Defaults:
  keystore: $DEFAULT_KEYSTORE
  output:   $OUTPUT_DIR

Override the keystore with REDD_BLOCK_ANDROID_KEYSTORE. The build reads the
passwords from macOS Keychain and never writes them to the repository.
EOF
}

fail() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

keychain_read() {
    security find-generic-password \
        -a "$KEYCHAIN_ACCOUNT" \
        -s "$1" \
        -w 2>/dev/null || true
}

keychain_write() {
    security add-generic-password \
        -U \
        -a "$KEYCHAIN_ACCOUNT" \
        -s "$1" \
        -w "$2" >/dev/null
}

configure_java() {
    if [[ -n ${JAVA_HOME:-} && -x "$JAVA_HOME/bin/java" ]]; then
        export PATH="$JAVA_HOME/bin:$PATH"
        export JAVA_HOME
        return
    fi

    local candidate
    for candidate in \
        "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
        "/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home"; do
        if [[ -x "$candidate/bin/java" ]]; then
            export JAVA_HOME="$candidate"
            export PATH="$JAVA_HOME/bin:$PATH"
            return
        fi
    done

    if [[ -x /usr/libexec/java_home ]]; then
        candidate=$(/usr/libexec/java_home 2>/dev/null || true)
        if [[ -n $candidate && -x "$candidate/bin/java" ]]; then
            export JAVA_HOME="$candidate"
            export PATH="$JAVA_HOME/bin:$PATH"
            return
        fi
    fi

    fail "could not find a JDK; install Android Studio or set JAVA_HOME"
}

configure_android_toolchain() {
    export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
    [[ -d $ANDROID_HOME ]] || fail "Android SDK not found: $ANDROID_HOME"

    if [[ -z ${NDK_HOME:-} ]]; then
        local latest_ndk
        latest_ndk=$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null \
            | sort -V | tail -1 || true)
        [[ -n $latest_ndk ]] || fail "Android NDK not found under $ANDROID_HOME/ndk"
        export NDK_HOME="$latest_ndk"
    fi
    [[ -d $NDK_HOME ]] || fail "Android NDK not found: $NDK_HOME"

    local rust_toolchain="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin"
    if [[ -d $rust_toolchain ]]; then
        export PATH="$rust_toolchain:$PATH"
    fi
}

discover_alias() {
    local keystore="$1"
    local store_password="$2"
    keytool -list -v \
        -keystore "$keystore" \
        -storepass "$store_password" 2>/dev/null \
        | awk -F': ' '/^Alias name: / { print $2 }'
}

setup_keychain() {
    require_command keytool
    require_command security
    configure_java

    local keystore="${REDD_BLOCK_ANDROID_KEYSTORE:-$DEFAULT_KEYSTORE}"
    [[ -f $keystore ]] || fail "keystore not found: $keystore"

    local store_password
    local key_password
    local alias
    printf 'Keystore password: ' >&2
    IFS= read -r -s store_password
    printf '\n' >&2
    [[ -n $store_password ]] || fail "keystore password cannot be empty"

    local aliases
    aliases=$(discover_alias "$keystore" "$store_password")
    [[ -n $aliases ]] || fail "could not unlock the keystore or find an alias"
    local alias_count
    alias_count=$(printf '%s\n' "$aliases" | sed '/^$/d' | wc -l | tr -d ' ')
    if [[ $alias_count == 1 ]]; then
        alias=$(printf '%s\n' "$aliases" | sed -n '1p')
    else
        printf 'Keystore aliases:\n%s\n' "$aliases" >&2
        printf 'Key alias: ' >&2
        IFS= read -r alias
    fi
    [[ -n $alias ]] || fail "key alias cannot be empty"

    printf 'Key password (press Enter if it matches the keystore password): ' >&2
    IFS= read -r -s key_password
    printf '\n' >&2
    [[ -n $key_password ]] || key_password="$store_password"

    keytool -certreq \
        -alias "$alias" \
        -keystore "$keystore" \
        -storepass "$store_password" \
        -keypass "$key_password" \
        -file /dev/null >/dev/null 2>&1 \
        || fail "key password does not unlock alias: $alias"

    keychain_write "$STORE_PASSWORD_SERVICE" "$store_password"
    keychain_write "$KEY_PASSWORD_SERVICE" "$key_password"
    keychain_write "$KEY_ALIAS_SERVICE" "$alias"
    printf 'Stored Android signing credentials in the macOS Keychain.\n'
    printf 'Alias: %s\n' "$alias"
}

build_play_bundle() {
    require_command pnpm
    require_command keytool
    require_command security
    require_command shasum
    configure_java
    configure_android_toolchain

    local keystore="${REDD_BLOCK_ANDROID_KEYSTORE:-$DEFAULT_KEYSTORE}"
    [[ -f $keystore ]] || fail "keystore not found: $keystore"

    local store_password="${REDD_BLOCK_ANDROID_STORE_PASSWORD:-$(keychain_read "$STORE_PASSWORD_SERVICE")}"
    local key_password="${REDD_BLOCK_ANDROID_KEY_PASSWORD:-$(keychain_read "$KEY_PASSWORD_SERVICE")}"
    local alias="${REDD_BLOCK_ANDROID_KEY_ALIAS:-$(keychain_read "$KEY_ALIAS_SERVICE")}"
    [[ -n $store_password ]] || fail "keystore password missing; run $0 --setup"
    [[ -n $key_password ]] || key_password="$store_password"
    if [[ -z $alias ]]; then
        alias=$(discover_alias "$keystore" "$store_password" | sed -n '1p')
    fi
    [[ -n $alias ]] || fail "key alias missing; run $0 --setup"

    export REDD_BLOCK_ANDROID_KEYSTORE="$keystore"
    export REDD_BLOCK_ANDROID_STORE_PASSWORD="$store_password"
    export REDD_BLOCK_ANDROID_KEY_ALIAS="$alias"
    export REDD_BLOCK_ANDROID_KEY_PASSWORD="$key_password"

    printf 'Building signed Google Play bundle with alias %s...\n' "$alias"
    pnpm build:android --apk false --aab true

    local aab
    aab=$(find "$ANDROID_PROJECT/app/build/outputs/bundle" -type f -name '*.aab' -print \
        | sort | tail -1)
    [[ -f $aab ]] || fail "Gradle did not produce an AAB"

    "$JAVA_HOME/bin/jarsigner" -verify "$aab" >/dev/null 2>&1 \
        || fail "AAB signature verification failed: $aab"

    local fingerprint
    fingerprint=$(keytool -list -v \
        -keystore "$keystore" \
        -storepass "$store_password" \
        -alias "$alias" 2>/dev/null \
        | awk -F': ' '/SHA-256:|SHA256:/ { gsub(":", "", $2); print $2; exit }')
    [[ -n $fingerprint ]] || fail "could not read the keystore certificate fingerprint"

    local bundle_fingerprint
    bundle_fingerprint=$(keytool -printcert -jarfile "$aab" 2>/dev/null \
        | awk -F': ' '/SHA-256:|SHA256:/ { gsub(":", "", $2); print $2; exit }')
    [[ $bundle_fingerprint == "$fingerprint" ]] \
        || fail "AAB was signed by an unexpected certificate"

    local version_name
    version_name=$(sed -n 's/^tauri.android.versionName=//p' \
        "$ANDROID_PROJECT/app/tauri.properties")
    [[ -n $version_name ]] || version_name=unknown

    mkdir -p "$OUTPUT_DIR"
    local output="$OUTPUT_DIR/redd-block-${version_name}-play.aab"
    cp "$aab" "$output"
    local checksum
    checksum=$(shasum -a 256 "$output" | awk '{ print $1 }')

    printf '\nSigned Google Play bundle: %s\n' "$output"
    printf 'SHA-256: %s\n' "$checksum"
    printf 'Signing certificate SHA-256: %s\n' "${fingerprint:-unknown}"
}

case "${1:-}" in
    --help|-h)
        usage
        ;;
    --setup)
        [[ $# == 1 ]] || fail "--setup does not accept additional arguments"
        setup_keychain
        ;;
    '')
        build_play_bundle
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac
