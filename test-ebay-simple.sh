#!/bin/bash

# Simple eBay OAuth Test Script
# Tests the token exchange directly with curl

echo "========================================"
echo "eBay OAuth Token Exchange Test"
echo "========================================"

# Configuration - Update these with your actual credentials
CLIENT_ID="${EBAY_CLIENT_ID:-}"
CLIENT_SECRET="${EBAY_CLIENT_SECRET:-}"
REDIRECT_URI="${EBAY_REDIRECT_URI:-https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth}"

# eBay endpoints
AUTH_URL="https://auth.ebay.com/oauth2/authorize"
TOKEN_URL="https://api.ebay.com/identity/v1/oauth2/token"

# Test different scope combinations
test_exchange() {
    local AUTH_CODE="$1"
    local USE_SCOPE="$2"
    local SCOPE_SET="$3"

    echo ""
    echo "=== Testing Token Exchange ==="
    echo "Authorization Code: ${AUTH_CODE:0:20}..."
    echo "Use Scope: $USE_SCOPE"
    echo "Scope Set: $SCOPE_SET"
    echo ""

    # Prepare scopes based on set
    case "$SCOPE_SET" in
        "withRoot")
            SCOPES="https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly"
            ;;
        "onlyRoot")
            SCOPES="https://api.ebay.com/oauth/api_scope"
            ;;
        "withoutRoot")
            SCOPES="https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.inventory.readonly"
            ;;
        *)
            SCOPES="https://api.ebay.com/oauth/api_scope"
            ;;
    esac

    # Create base64 auth
    AUTH_HEADER=$(echo -n "${CLIENT_ID}:${CLIENT_SECRET}" | base64)

    # Prepare request body
    if [ "$USE_SCOPE" = "yes" ]; then
        REQUEST_BODY="grant_type=authorization_code&code=${AUTH_CODE}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}"
    else
        REQUEST_BODY="grant_type=authorization_code&code=${AUTH_CODE}&redirect_uri=${REDIRECT_URI}"
    fi

    echo "Request Body (truncated):"
    echo "grant_type=authorization_code"
    echo "code=${AUTH_CODE:0:20}..."
    echo "redirect_uri=${REDIRECT_URI}"
    if [ "$USE_SCOPE" = "yes" ]; then
        echo "scope=${SCOPES}"
    fi
    echo ""

    # Make the request
    RESPONSE=$(curl -s -X POST "$TOKEN_URL" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -H "Authorization: Basic ${AUTH_HEADER}" \
        -d "$REQUEST_BODY")

    echo "Response:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

    # Check for refresh token
    if echo "$RESPONSE" | grep -q "refresh_token"; then
        echo ""
        echo "✅ SUCCESS! Refresh token received!"
        REFRESH_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('refresh_token', ''))" 2>/dev/null)
        echo "Refresh Token: ${REFRESH_TOKEN:0:30}..."
    else
        echo ""
        echo "❌ WARNING: No refresh token in response!"
    fi
}

# Generate authorization URL
generate_auth_url() {
    local SCOPE_SET="${1:-withRoot}"

    case "$SCOPE_SET" in
        "withRoot")
            SCOPES="https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly"
            ;;
        "onlyRoot")
            SCOPES="https://api.ebay.com/oauth/api_scope"
            ;;
        "withoutRoot")
            SCOPES="https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.inventory.readonly"
            ;;
        *)
            SCOPES="https://api.ebay.com/oauth/api_scope"
            ;;
    esac

    # URL encode the scopes
    ENCODED_SCOPES=$(echo -n "$SCOPES" | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read()))")
    ENCODED_REDIRECT=$(echo -n "$REDIRECT_URI" | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read()))")

    echo "Authorization URL for scope set: $SCOPE_SET"
    echo ""
    echo "${AUTH_URL}?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${ENCODED_REDIRECT}&scope=${ENCODED_SCOPES}&state=test_${SCOPE_SET}"
    echo ""
    echo "Visit this URL and copy the 'code' parameter from the callback URL"
}

# Main script
case "$1" in
    "auth")
        SCOPE_SET="${2:-withRoot}"
        if [ -z "$CLIENT_ID" ]; then
            echo "Error: EBAY_CLIENT_ID not set"
            echo "Please export EBAY_CLIENT_ID=your_client_id"
            exit 1
        fi
        generate_auth_url "$SCOPE_SET"
        ;;

    "exchange")
        AUTH_CODE="$2"
        if [ -z "$AUTH_CODE" ]; then
            echo "Usage: $0 exchange <authorization_code>"
            exit 1
        fi
        if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
            echo "Error: EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set"
            exit 1
        fi

        echo "Testing multiple configurations..."

        # Test 1: With scope (recommended)
        test_exchange "$AUTH_CODE" "yes" "withRoot"

        echo ""
        echo "========================================"

        # Test 2: Without scope
        test_exchange "$AUTH_CODE" "no" "withRoot"

        echo ""
        echo "========================================"

        # Test 3: Only root scope
        test_exchange "$AUTH_CODE" "yes" "onlyRoot"
        ;;

    *)
        echo "eBay OAuth Test Tool"
        echo ""
        echo "Commands:"
        echo "  $0 auth [scopeSet]     - Generate authorization URL"
        echo "                           scopeSet: withRoot (default), onlyRoot, withoutRoot"
        echo "  $0 exchange <code>     - Test token exchange with authorization code"
        echo ""
        echo "Required environment variables:"
        echo "  EBAY_CLIENT_ID         - Your eBay App ID"
        echo "  EBAY_CLIENT_SECRET     - Your eBay Cert ID"
        echo "  EBAY_REDIRECT_URI      - Your redirect URI (optional)"
        echo ""
        echo "Example workflow:"
        echo "  1. export EBAY_CLIENT_ID=your_app_id"
        echo "  2. export EBAY_CLIENT_SECRET=your_cert_id"
        echo "  3. $0 auth"
        echo "  4. Visit the URL and authorize"
        echo "  5. Copy the 'code' parameter from callback"
        echo "  6. $0 exchange <code>"
        ;;
esac