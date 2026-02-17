#!/bin/bash
# ==============================================
# ReddBlock Helper Daemon Smoke Test (macOS)
# ==============================================
# Tests the helper daemon via its Unix socket IPC.
# Run with: sudo ./scripts/test-helper-mac.sh
#
# Prerequisites: Helper daemon must be installed and running.
# Uses socat for Unix socket communication (install via: brew install socat)
# Falls back to nc (netcat) if socat is unavailable.

set -e

SOCKET="/tmp/redd-block-helper.sock"
TEST_DOMAIN="smoke-test-reddblock.invalid"
HOSTS_FILE="/etc/hosts"
PASSED=0
FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo "🔬 ReddBlock Helper Daemon Smoke Test (macOS)"
    echo "=============================================="
    echo ""
}

pass() {
    echo -e "  ${GREEN}✅ PASS:${NC} $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "  ${RED}❌ FAIL:${NC} $1"
    FAILED=$((FAILED + 1))
}

warn() {
    echo -e "  ${YELLOW}⚠️  WARN:${NC} $1"
}

# Send a JSON command to the helper socket and return the response
send_command() {
    local cmd="$1"
    if command -v socat &> /dev/null; then
        echo "$cmd" | socat - UNIX-CONNECT:"$SOCKET" 2>/dev/null
    elif command -v nc &> /dev/null; then
        echo "$cmd" | nc -U "$SOCKET" 2>/dev/null
    else
        echo ""
        return 1
    fi
}

# ==========================================
# CHECKS
# ==========================================

print_header

# Check we're running as root (needed to read hosts file reliably)
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}Note: Running without sudo. Hosts file checks may be limited.${NC}"
    echo ""
fi

# Check socket exists
echo "📡 1. Checking helper socket..."
if [ -S "$SOCKET" ]; then
    pass "Socket exists at $SOCKET"
else
    fail "Socket not found at $SOCKET"
    echo ""
    echo "Helper daemon is not installed or not running."
    echo "Install it by starting a block in the app first."
    exit 1
fi

# Check communication tool available
if ! command -v socat &> /dev/null && ! command -v nc &> /dev/null; then
    fail "Neither socat nor nc (netcat) available"
    echo "  Install socat: brew install socat"
    exit 1
fi

# Test 1: Ping
echo ""
echo "🏓 2. Ping test..."
RESPONSE=$(send_command '{"action":"ping"}')
if echo "$RESPONSE" | grep -q '"success":true'; then
    pass "Helper responded to ping"
else
    fail "Helper did not respond to ping (response: $RESPONSE)"
fi

# Test 2: Get version
echo ""
echo "🔖 3. Version check..."
RESPONSE=$(send_command '{"action":"get-version"}')
if echo "$RESPONSE" | grep -q '"version"'; then
    VERSION=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','unknown'))" 2>/dev/null || echo "unknown")
    pass "Helper version: $VERSION"
else
    fail "Could not get helper version (response: $RESPONSE)"
fi

# Test 3: Get status (should show no active block initially, or existing one)
echo ""
echo "📊 4. Status check..."
RESPONSE=$(send_command '{"action":"get-status"}')
if echo "$RESPONSE" | grep -q '"success":true'; then
    IS_ACTIVE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('active',False))" 2>/dev/null || echo "unknown")
    pass "Status check OK (active: $IS_ACTIVE)"
    
    if [ "$IS_ACTIVE" = "True" ]; then
        warn "There is already an active block — skipping start/clear tests to avoid disruption"
        echo ""
        echo "=========================================="
        echo -e "  RESULTS: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}, 3 skipped"
        echo "=========================================="
        exit 0
    fi
else
    fail "Status check failed (response: $RESPONSE)"
fi

# Test 4: Start a test block
echo ""
echo "🚫 5. Start test block..."
END_TIME=$(python3 -c "import time; print(int((time.time() + 120) * 1000))")
RESPONSE=$(send_command "{\"action\":\"start-block\",\"domains\":[\"$TEST_DOMAIN\"],\"endTime\":$END_TIME,\"blocklistId\":\"smoke-test\"}")
if echo "$RESPONSE" | grep -q '"success":true'; then
    pass "Test block started for $TEST_DOMAIN"
else
    fail "Failed to start test block (response: $RESPONSE)"
fi

# Test 5: Verify hosts file contains the test domain
echo ""
echo "📝 6. Verify hosts file..."
sleep 1  # Give helper a moment to write
if grep -q "$TEST_DOMAIN" "$HOSTS_FILE" 2>/dev/null; then
    pass "Hosts file contains $TEST_DOMAIN"
else
    fail "Hosts file does NOT contain $TEST_DOMAIN"
fi

# Test 6: Verify hosts file has block markers
if grep -q "BEGIN REDD BLOCK" "$HOSTS_FILE" 2>/dev/null; then
    pass "Hosts file has REDD BLOCK markers"
else
    fail "Hosts file missing REDD BLOCK markers"
fi

# Test 7: Clear the block
echo ""
echo "🧹 7. Clear test block..."
RESPONSE=$(send_command '{"action":"clear-block"}')
if echo "$RESPONSE" | grep -q '"success":true'; then
    pass "Test block cleared"
else
    fail "Failed to clear test block (response: $RESPONSE)"
fi

# Test 8: Verify hosts file no longer has the test domain
echo ""
echo "🔍 8. Verify cleanup..."
sleep 1  # Give helper a moment to write
if grep -q "$TEST_DOMAIN" "$HOSTS_FILE" 2>/dev/null; then
    fail "Hosts file STILL contains $TEST_DOMAIN after clear"
else
    pass "Hosts file cleaned — $TEST_DOMAIN removed"
fi

# Test 9: Safety check — localhost still present
if grep -q "localhost" "$HOSTS_FILE" 2>/dev/null; then
    pass "Safety: localhost entry present in hosts file"
else
    fail "SAFETY ISSUE: localhost entry MISSING from hosts file!"
fi

# Test 10: Verify no stale block markers after clear
if grep -q "BEGIN REDD BLOCK" "$HOSTS_FILE" 2>/dev/null; then
    warn "Block markers still present (may have other active blocks)"
else
    pass "Block markers removed after clear"
fi

# ==========================================
# SUMMARY
# ==========================================

echo ""
echo "=========================================="
TOTAL=$((PASSED + FAILED))
if [ "$FAILED" -eq 0 ]; then
    echo -e "  ${GREEN}ALL $TOTAL CHECKS PASSED ✅${NC}"
else
    echo -e "  RESULTS: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
fi
echo "=========================================="
echo ""

exit $FAILED
