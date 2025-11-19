# eBay Token Management Improvement Plan

**Date**: 2025-10-02
**Git Commit**: e379801f4f33f9e2f00869c6f5d10516f73614b7
**Branch**: main
**Purpose**: Establish uniform patterns, simplify architecture, and improve user experience for eBay OAuth token management

---

## Executive Summary

This plan addresses the current inconsistencies in token management and proposes a unified, simplified architecture that emphasizes:

1. **Uniformity** - Consistent patterns across all backend functions
2. **Simplicity** - Reduced complexity in token flow and error handling
3. **Security** - Enhanced validation and encryption practices
4. **User Experience** - Clear status indicators and easy troubleshooting
5. **Scalability** - Patterns that work for multi-user, multi-tenant architecture

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Identified Issues](#identified-issues)
3. [Proposed Architecture](#proposed-architecture)
4. [Unified Token Management Service](#unified-token-management-service)
5. [Simplified Connection Status UI](#simplified-connection-status-ui)
6. [Error Recovery Strategy](#error-recovery-strategy)
7. [Security Improvements](#security-improvements)
8. [Implementation Plan](#implementation-plan)
9. [Testing Strategy](#testing-strategy)
10. [Rollout Plan](#rollout-plan)

---

## Current State Analysis

### Token Flow (As-Is)

```
User → Supabase JWT → Backend Function
                           ↓
                  RPC: get_user_ebay_credentials
                           ↓
                  RPC: get_user_ebay_app_credentials
                           ↓
                     Decrypt cert_id
                           ↓
               POST eBay OAuth API (refresh token)
                           ↓
              Store access_token in memory (ephemeral)
                           ↓
                   Make eBay API call
```

### Current Implementation Issues

#### 1. **Multiple eBay Client Implementations**
- `user-ebay-client.js` (primary, 440 lines)
- `enhanced-ebay-client.js` (alternative, similar functionality)
- `ebay-client.js` (legacy?)
- **Problem**: Code duplication, inconsistent patterns, maintenance burden

#### 2. **Inconsistent Credential Retrieval**
Different functions use different approaches:
- Some use `get_user_ebay_credentials` RPC
- Some use `get_user_ebay_app_credentials` RPC
- Some use direct table queries
- **Problem**: No single source of truth, error-prone

#### 3. **Unclear Connection Status**
Frontend has multiple state variables:
- `connectionStep` (idle, connecting, connected, error, needs-setup)
- `credentials` (hasAppId, hasCertId, hasRefreshToken)
- `profile.ebay_connection_status` (disconnected, connected)
- **Problem**: States can be out of sync, confusing UX

#### 4. **No Token Expiration Tracking**
- Access tokens (2 hours) not tracked
- Refresh tokens (18 months) not validated
- **Problem**: Silent failures, poor error messages

#### 5. **Inconsistent Error Handling**
- Some functions throw errors
- Some return error objects
- Some log errors but continue
- **Problem**: Unpredictable behavior, hard to debug

#### 6. **Frontend Token Management Logic**
- `ebayTokenManager.js` has token refresh logic
- Backend also has token refresh logic
- Comments say "automatic token refresh removed"
- **Problem**: Confusion about where token management happens

#### 7. **Database Schema Mismatches**
- Code references non-existent columns (already fixed)
- Column names inconsistent (ebay_refresh_token vs refresh_token)
- **Problem**: Runtime errors, migration issues

### What Works Well

✅ **Encryption Implementation**: AES-256-CBC with random IVs is solid
✅ **PKCE OAuth Flow**: Security best practice properly implemented
✅ **Per-User Credentials**: Scalable multi-tenant architecture
✅ **RLS Policies**: Database security is well-designed
✅ **Serverless Architecture**: Netlify functions work well

---

## Identified Issues

### Critical Issues (Must Fix)

1. **Token Refresh Reliability**
   - Current: 401 errors common, unclear cause
   - Impact: Users cannot sync listings
   - Root Cause: Credential format inconsistencies, missing validation

2. **Connection Status Confusion**
   - Current: Multiple states, can be out of sync
   - Impact: Users don't know if they're connected
   - Root Cause: No single source of truth

3. **Error Messages Unhelpful**
   - Current: "Token refresh failed: eBay API error (401): client authentication failed"
   - Impact: Users don't know how to fix
   - Root Cause: Generic error messages, no actionable guidance

### High Priority Issues (Should Fix)

4. **Code Duplication**
   - Current: 2-3 eBay client implementations
   - Impact: Inconsistent behavior, maintenance burden
   - Root Cause: Incremental development, no refactoring

5. **No Token Expiration Tracking**
   - Current: Access tokens expire silently
   - Impact: Unexpected failures mid-operation
   - Root Cause: Tokens stored in memory only, no metadata

6. **Disconnect Complexity**
   - Current: Multiple disconnect methods (normal, force)
   - Impact: Users unable to disconnect, frustrated
   - Root Cause: Schema mismatches, validation too strict

### Medium Priority Issues (Nice to Have)

7. **OAuth State Cleanup**
   - Current: oauth_states table grows indefinitely
   - Impact: Database bloat (minor)
   - Root Cause: No cleanup job

8. **Credential Format Validation**
   - Current: Validation happens during use
   - Impact: Errors happen late in flow
   - Root Cause: No validation at storage time

---

## Proposed Architecture

### Unified Token Management Service

**Goal**: Single source of truth for all eBay token operations

```javascript
// netlify/functions/utils/ebay-token-service.js

class EbayTokenService {
  constructor(userId) {
    this.userId = userId
    this.cache = new Map() // In-memory cache for access tokens
  }

  // ============================================================================
  // CORE METHODS (Public API)
  // ============================================================================

  /**
   * Get a valid eBay access token (refresh if needed)
   * @returns {Promise<string>} Valid access token
   */
  async getAccessToken() {
    // 1. Check cache for valid access token
    const cached = this.cache.get(this.userId)
    if (cached && cached.expiresAt > Date.now() + 60000) { // 1 min buffer
      return cached.accessToken
    }

    // 2. Get credentials from database
    const credentials = await this.getCredentials()

    // 3. Validate credentials
    this.validateCredentials(credentials)

    // 4. Exchange refresh token for access token
    const tokenData = await this.exchangeRefreshToken(credentials)

    // 5. Cache access token
    this.cache.set(this.userId, {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000)
    })

    return tokenData.access_token
  }

  /**
   * Get user's eBay credentials (app credentials + refresh token)
   * @returns {Promise<Object>} { appId, certId, refreshToken, ebayUserId }
   */
  async getCredentials() {
    // Single RPC call to get all credentials
    const { data, error } = await supabase.rpc('get_user_ebay_credentials_complete', {
      user_uuid: this.userId
    })

    if (error) {
      throw new TokenError('CREDENTIALS_FETCH_FAILED', `Failed to fetch credentials: ${error.message}`)
    }

    if (!data || data.length === 0) {
      throw new TokenError('USER_NOT_FOUND', 'User not found in database')
    }

    const creds = data[0]

    // Check if user has configured app credentials
    if (!creds.ebay_app_id || !creds.ebay_cert_id_encrypted) {
      throw new TokenError('CREDENTIALS_NOT_CONFIGURED',
        'eBay App ID and Cert ID not configured. Please add credentials in Admin Settings.')
    }

    // Check if user has connected eBay account (refresh token)
    if (!creds.ebay_refresh_token) {
      throw new TokenError('NOT_CONNECTED',
        'eBay account not connected. Please complete OAuth flow.')
    }

    return {
      appId: creds.ebay_app_id,
      certId: this.decryptCertId(creds.ebay_cert_id_encrypted),
      refreshToken: creds.ebay_refresh_token, // Already decrypted by RPC
      ebayUserId: creds.ebay_user_id,
      connectionStatus: creds.ebay_connection_status,
      connectedAt: creds.ebay_connected_at
    }
  }

  /**
   * Get connection status for user
   * @returns {Promise<Object>} { connected, hasCredentials, canSync, issues }
   */
  async getConnectionStatus() {
    try {
      const credentials = await this.getCredentials()

      // Try to get access token to verify connectivity
      try {
        await this.getAccessToken()
        return {
          connected: true,
          hasCredentials: true,
          canSync: true,
          ebayUserId: credentials.ebayUserId,
          connectedAt: credentials.connectedAt,
          issues: []
        }
      } catch (error) {
        // Connected but token refresh failed
        return {
          connected: false,
          hasCredentials: true,
          canSync: false,
          issues: [{
            code: error.code,
            message: error.message,
            action: error.action
          }]
        }
      }
    } catch (error) {
      if (error.code === 'CREDENTIALS_NOT_CONFIGURED') {
        return {
          connected: false,
          hasCredentials: false,
          canSync: false,
          issues: [{
            code: 'CREDENTIALS_NOT_CONFIGURED',
            message: 'eBay App ID and Cert ID not configured',
            action: 'GO_TO_ADMIN_SETTINGS'
          }]
        }
      } else if (error.code === 'NOT_CONNECTED') {
        return {
          connected: false,
          hasCredentials: true,
          canSync: false,
          issues: [{
            code: 'NOT_CONNECTED',
            message: 'eBay account not connected via OAuth',
            action: 'CONNECT_EBAY'
          }]
        }
      } else {
        return {
          connected: false,
          hasCredentials: false,
          canSync: false,
          issues: [{
            code: 'UNKNOWN_ERROR',
            message: error.message,
            action: 'CONTACT_SUPPORT'
          }]
        }
      }
    }
  }

  /**
   * Disconnect eBay account (clear refresh token)
   * @returns {Promise<void>}
   */
  async disconnect() {
    const { error } = await supabase
      .from('users')
      .update({
        ebay_refresh_token: null,
        ebay_user_id: null,
        ebay_connection_status: 'disconnected',
        ebay_connected_at: null
      })
      .eq('id', this.userId)

    if (error) {
      throw new TokenError('DISCONNECT_FAILED', `Failed to disconnect: ${error.message}`)
    }

    // Clear cache
    this.cache.delete(this.userId)
  }

  // ============================================================================
  // INTERNAL METHODS (Private)
  // ============================================================================

  /**
   * Validate credentials format and content
   */
  validateCredentials(credentials) {
    // Validate App ID format
    if (!credentials.appId || credentials.appId.length < 10) {
      throw new TokenError('INVALID_APP_ID',
        'Invalid App ID format. Expected format: username-appname-env-random')
    }

    // Validate Cert ID format (should be hex string after decryption)
    if (!credentials.certId || credentials.certId.length < 32) {
      throw new TokenError('INVALID_CERT_ID',
        'Invalid Cert ID format. Expected 32+ character hex string')
    }

    // Validate refresh token format
    if (!credentials.refreshToken || credentials.refreshToken.length < 50) {
      throw new TokenError('INVALID_REFRESH_TOKEN',
        'Invalid refresh token format')
    }
  }

  /**
   * Decrypt Cert ID (with validation)
   */
  decryptCertId(encryptedCertId) {
    // Check for migration marker
    if (encryptedCertId.startsWith('NEEDS_MIGRATION:')) {
      throw new TokenError('NEEDS_MIGRATION',
        'Credentials need migration. Please disconnect and reconnect your eBay account.',
        'DISCONNECT_AND_RECONNECT')
    }

    // Validate encryption format (hex:hex)
    if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encryptedCertId)) {
      throw new TokenError('INVALID_ENCRYPTION_FORMAT',
        `Invalid encryption format. Expected hex:hex, got: ${encryptedCertId.substring(0, 20)}...`,
        'DISCONNECT_AND_RECONNECT')
    }

    // Decrypt
    try {
      return decrypt(encryptedCertId)
    } catch (error) {
      throw new TokenError('DECRYPTION_FAILED',
        `Failed to decrypt Cert ID: ${error.message}`,
        'DISCONNECT_AND_RECONNECT')
    }
  }

  /**
   * Exchange refresh token for access token
   */
  async exchangeRefreshToken(credentials) {
    const credentialsBase64 = Buffer.from(`${credentials.appId}:${credentials.certId}`).toString('base64')

    console.log('🔄 Exchanging refresh token for access token', {
      userId: this.userId,
      appIdPreview: credentials.appId.substring(0, 10) + '...',
      certIdLength: credentials.certId.length
    })

    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentialsBase64}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken
      })
    })

    const data = await response.json()

    if (!response.ok) {
      const ebayError = data.error_description || data.error || 'Unknown eBay error'

      console.error('❌ eBay token refresh rejected:', {
        status: response.status,
        error: ebayError,
        userId: this.userId
      })

      // Determine error type and action
      if (response.status === 401) {
        throw new TokenError('EBAY_AUTH_FAILED',
          `eBay rejected credentials: ${ebayError}. Your credentials may be invalid or expired.`,
          'DISCONNECT_AND_RECONNECT')
      } else if (response.status === 400) {
        throw new TokenError('EBAY_INVALID_REQUEST',
          `eBay rejected request: ${ebayError}`,
          'DISCONNECT_AND_RECONNECT')
      } else {
        throw new TokenError('EBAY_API_ERROR',
          `eBay API error (${response.status}): ${ebayError}`,
          'TRY_AGAIN_LATER')
      }
    }

    console.log('✅ Access token obtained successfully', {
      expiresIn: data.expires_in,
      userId: this.userId
    })

    return data
  }
}

/**
 * Custom error class for token operations
 */
class TokenError extends Error {
  constructor(code, message, action = null) {
    super(message)
    this.name = 'TokenError'
    this.code = code
    this.action = action
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      action: this.action
    }
  }
}

module.exports = { EbayTokenService, TokenError }
```

### New Database RPC Function

```sql
-- Get all eBay credentials in one call
CREATE OR REPLACE FUNCTION get_user_ebay_credentials_complete(user_uuid uuid)
RETURNS TABLE (
  ebay_app_id text,
  ebay_cert_id_encrypted text,
  ebay_refresh_token text,
  ebay_user_id text,
  ebay_connection_status text,
  ebay_connected_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    users.ebay_app_id,
    users.ebay_cert_id_encrypted,
    decrypt_ebay_token(users.ebay_refresh_token) AS ebay_refresh_token,
    users.ebay_user_id,
    users.ebay_connection_status,
    users.ebay_connected_at
  FROM users
  WHERE id = user_uuid;
END;
$$;
```

### Updated eBay API Client

```javascript
// netlify/functions/utils/ebay-api-client.js

const { EbayTokenService } = require('./ebay-token-service')

/**
 * Simplified eBay API client
 * Uses EbayTokenService for all token operations
 */
class EbayApiClient {
  constructor(userId) {
    this.userId = userId
    this.tokenService = new EbayTokenService(userId)
  }

  /**
   * Initialize client (get valid access token)
   */
  async initialize() {
    this.accessToken = await this.tokenService.getAccessToken()
    return true
  }

  /**
   * Make authenticated eBay API call
   */
  async makeApiCall(endpoint, method = 'GET', data = null, apiType = 'trading') {
    // Ensure we have valid access token
    if (!this.accessToken) {
      await this.initialize()
    }

    const baseUrls = {
      trading: 'https://api.ebay.com/ws/api.dll',
      finding: 'https://svcs.ebay.com/services/search/FindingService/v1',
      sell: 'https://api.ebay.com/sell'
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`
    }

    // Add API-specific headers
    if (apiType === 'trading') {
      headers['X-EBAY-API-SITEID'] = '0'
      headers['X-EBAY-API-COMPATIBILITY-LEVEL'] = '967'
      headers['X-EBAY-API-CALL-NAME'] = endpoint
    }

    const url = apiType === 'trading' ? baseUrls.trading : `${baseUrls[apiType]}${endpoint}`

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined
      })

      const responseData = await response.json()

      if (!response.ok) {
        throw new Error(`eBay API Error: ${responseData.error?.message || 'Unknown error'}`)
      }

      return responseData

    } catch (error) {
      console.error(`eBay API call failed (${endpoint}):`, error)
      throw error
    }
  }

  // ============================================================================
  // HIGH-LEVEL API METHODS
  // ============================================================================

  async getActiveListings(page = 1, limit = 50) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      Pagination: {
        EntriesPerPage: limit,
        PageNumber: page
      },
      DetailLevel: 'ReturnAll',
      StartTimeFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      StartTimeTo: new Date().toISOString()
    }

    return await this.makeApiCall('GetMyeBaySelling', 'POST', requestData, 'trading')
  }

  async getItemDetails(itemId) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      ItemID: itemId,
      DetailLevel: 'ReturnAll'
    }

    return await this.makeApiCall('GetItem', 'POST', requestData, 'trading')
  }

  async updateItemPrice(itemId, newPrice) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      Item: {
        ItemID: itemId,
        StartPrice: newPrice
      }
    }

    return await this.makeApiCall('ReviseItem', 'POST', requestData, 'trading')
  }

  async endListing(itemId, reason = 'NotAvailable') {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      ItemID: itemId,
      EndingReason: reason
    }

    return await this.makeApiCall('EndItem', 'POST', requestData, 'trading')
  }
}

module.exports = { EbayApiClient }
```

### Simplified Backend Function Pattern

```javascript
// netlify/functions/trigger-sync.js (REFACTORED)

const { createClient } = require('@supabase/supabase-js')
const { EbayApiClient } = require('./utils/ebay-api-client')
const { TokenError } = require('./utils/ebay-token-service')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // 1. Validate Supabase JWT
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Unauthorized',
          code: 'NO_AUTH_TOKEN'
        })
      }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    const user = userData?.user

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Invalid token',
          code: 'INVALID_AUTH_TOKEN'
        })
      }
    }

    console.log(`📥 Manual sync triggered for user: ${user.email}`)

    // 2. Initialize eBay client (handles token refresh automatically)
    const ebayClient = new EbayApiClient(user.id)
    await ebayClient.initialize()

    // 3. Fetch listings from eBay
    const listings = await ebayClient.getActiveListings()

    // 4. Sync to database (logic omitted for brevity)
    const syncResult = {
      listingsFound: listings.length,
      listingsUpdated: 0,
      listingsCreated: 0
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Sync completed successfully',
        ...syncResult
      })
    }

  } catch (error) {
    console.error('Sync failed:', error)

    // Handle TokenError with detailed error response
    if (error instanceof TokenError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: error.message,
          code: error.code,
          action: error.action
        })
      }
    }

    // Handle other errors
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Sync failed',
        message: error.message,
        code: 'UNKNOWN_ERROR'
      })
    }
  }
}
```

---

## Simplified Connection Status UI

### Connection Status Component Design

**Goal**: Clear, actionable status display with easy troubleshooting

```jsx
// frontend/src/components/EbayConnectionStatus.jsx

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { userAPI } from '../lib/supabase'

/**
 * Simplified eBay connection status component
 * Shows clear status and actionable next steps
 */
export default function EbayConnectionStatus() {
  const queryClient = useQueryClient()

  // Fetch connection status from backend
  const { data: status, isLoading, error } = useQuery(
    ['ebay-connection-status'],
    async () => {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/ebay-connection-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to fetch status')
      return response.json()
    },
    {
      refetchInterval: 30000, // Refresh every 30 seconds
      staleTime: 10000 // Consider data stale after 10 seconds
    }
  )

  if (isLoading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <div className="animate-pulse flex items-center space-x-3">
          <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
          <div className="h-4 bg-gray-300 rounded w-32"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h4 className="font-medium text-red-900">Unable to Check Connection Status</h4>
            <p className="text-sm text-red-700 mt-1">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }

  // Determine status card style
  const getStatusStyle = () => {
    if (status.connected) {
      return {
        bg: 'bg-green-50',
        border: 'border-green-200',
        icon: '✅',
        iconColor: 'text-green-600',
        title: 'text-green-900',
        text: 'text-green-700'
      }
    } else if (status.hasCredentials) {
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        icon: '⚠️',
        iconColor: 'text-yellow-600',
        title: 'text-yellow-900',
        text: 'text-yellow-700'
      }
    } else {
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        icon: '🔌',
        iconColor: 'text-gray-600',
        title: 'text-gray-900',
        text: 'text-gray-700'
      }
    }
  }

  const style = getStatusStyle()

  return (
    <div className={`${style.bg} border ${style.border} rounded-lg p-6`}>
      {/* Status Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-3xl">{style.icon}</span>
          <div>
            <h3 className={`font-medium ${style.title}`}>
              {status.connected ? 'eBay Connected' :
               status.hasCredentials ? 'eBay Not Connected' :
               'eBay Setup Required'}
            </h3>
            {status.connected && status.ebayUserId && (
              <p className={`text-sm ${style.text}`}>
                Connected as: {status.ebayUserId}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            status.connected ? 'bg-green-500 animate-pulse' :
            status.hasCredentials ? 'bg-yellow-500' :
            'bg-gray-400'
          }`}></div>
        </div>
      </div>

      {/* Status Details */}
      {status.connected ? (
        <div className="space-y-3">
          <div className={`text-sm ${style.text}`}>
            <p>✓ Your eBay account is connected and ready to sync listings.</p>
            {status.connectedAt && (
              <p className="mt-1">Connected since: {new Date(status.connectedAt).toLocaleString()}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={() => {/* trigger sync */}}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Sync Listings
            </button>
            <button
              onClick={() => {/* test connection */}}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Test Connection
            </button>
            <button
              onClick={() => {/* disconnect */}}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Issues List */}
          {status.issues && status.issues.length > 0 && (
            <div className="space-y-2">
              {status.issues.map((issue, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <div className="flex-1">
                    <p className={`text-sm ${style.text} font-medium`}>{issue.message}</p>
                    {issue.action && (
                      <ActionButton action={issue.action} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Setup Steps */}
          {!status.hasCredentials && (
            <div className="bg-white border border-gray-200 rounded p-4 mt-4">
              <h4 className="font-medium text-gray-900 mb-3">Setup Steps:</h4>
              <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                <li>Configure your eBay App credentials (App ID, Cert ID)</li>
                <li>Connect your eBay account via OAuth</li>
                <li>Sync your listings</li>
              </ol>
              <button
                onClick={() => window.location.href = '/admin-settings'}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full"
              >
                Go to Admin Settings
              </button>
            </div>
          )}

          {status.hasCredentials && !status.connected && (
            <button
              onClick={() => {/* initiate OAuth */}}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full"
            >
              Connect eBay Account
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Action button component based on error action code
 */
function ActionButton({ action }) {
  const actions = {
    'GO_TO_ADMIN_SETTINGS': {
      text: 'Configure Credentials',
      onClick: () => window.location.href = '/admin-settings',
      className: 'bg-blue-600 hover:bg-blue-700'
    },
    'CONNECT_EBAY': {
      text: 'Connect eBay Account',
      onClick: () => {/* initiate OAuth */},
      className: 'bg-blue-600 hover:bg-blue-700'
    },
    'DISCONNECT_AND_RECONNECT': {
      text: 'Disconnect & Reconnect',
      onClick: async () => {
        if (confirm('Disconnect and reconnect eBay account?')) {
          // disconnect then redirect to connect
        }
      },
      className: 'bg-yellow-600 hover:bg-yellow-700'
    },
    'TRY_AGAIN_LATER': {
      text: 'Retry Connection',
      onClick: () => window.location.reload(),
      className: 'bg-gray-600 hover:bg-gray-700'
    },
    'CONTACT_SUPPORT': {
      text: 'Contact Support',
      onClick: () => window.location.href = '/support',
      className: 'bg-red-600 hover:bg-red-700'
    }
  }

  const actionConfig = actions[action]
  if (!actionConfig) return null

  return (
    <button
      onClick={actionConfig.onClick}
      className={`mt-2 text-white px-3 py-1 rounded text-sm ${actionConfig.className}`}
    >
      {actionConfig.text}
    </button>
  )
}
```

### New Backend Endpoint

```javascript
// netlify/functions/ebay-connection-status.js

const { createClient } = require('@supabase/supabase-js')
const { EbayTokenService } = require('./utils/ebay-token-service')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // Validate Supabase JWT
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    const user = userData?.user

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      }
    }

    // Get connection status
    const tokenService = new EbayTokenService(user.id)
    const status = await tokenService.getConnectionStatus()

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(status)
    }

  } catch (error) {
    console.error('Status check failed:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to check connection status',
        message: error.message
      })
    }
  }
}
```

---

## Error Recovery Strategy

### Automatic Error Recovery

```javascript
// netlify/functions/utils/ebay-token-service.js (additions)

class EbayTokenService {
  // ... existing methods ...

  /**
   * Attempt automatic error recovery
   * @param {TokenError} error - The error to recover from
   * @returns {Promise<boolean>} - True if recovery successful
   */
  async attemptRecovery(error) {
    console.log(`🔧 Attempting recovery for error: ${error.code}`)

    switch (error.code) {
      case 'NEEDS_MIGRATION':
      case 'INVALID_ENCRYPTION_FORMAT':
      case 'DECRYPTION_FAILED':
        // These require user action (disconnect/reconnect)
        return false

      case 'EBAY_AUTH_FAILED':
        // Check if refresh token is expired (18 months)
        const credentials = await this.getCredentials()
        if (credentials.connectedAt) {
          const ageInMonths = (Date.now() - new Date(credentials.connectedAt).getTime()) / (30 * 24 * 60 * 60 * 1000)
          if (ageInMonths > 18) {
            // Token expired, mark as such
            await supabase
              .from('users')
              .update({ ebay_connection_status: 'expired' })
              .eq('id', this.userId)
            return false
          }
        }
        return false

      case 'EBAY_API_ERROR':
        // Retry once after 1 second delay
        await new Promise(resolve => setTimeout(resolve, 1000))
        try {
          await this.getAccessToken()
          return true
        } catch (retryError) {
          return false
        }

      default:
        return false
    }
  }
}
```

### User-Facing Error Messages

```javascript
// Error message mapping for user-friendly display
const ERROR_MESSAGES = {
  'CREDENTIALS_NOT_CONFIGURED': {
    title: 'eBay Credentials Not Configured',
    message: 'You need to add your eBay App ID and Cert ID before connecting.',
    action: 'GO_TO_ADMIN_SETTINGS',
    actionText: 'Configure Credentials',
    severity: 'warning'
  },
  'NOT_CONNECTED': {
    title: 'eBay Account Not Connected',
    message: 'You need to authorize this app to access your eBay account.',
    action: 'CONNECT_EBAY',
    actionText: 'Connect eBay Account',
    severity: 'warning'
  },
  'NEEDS_MIGRATION': {
    title: 'Credentials Need Update',
    message: 'Your eBay credentials are in an old format and need to be reconfigured.',
    action: 'DISCONNECT_AND_RECONNECT',
    actionText: 'Disconnect & Reconnect',
    severity: 'error'
  },
  'INVALID_ENCRYPTION_FORMAT': {
    title: 'Invalid Credential Format',
    message: 'Your stored credentials are corrupted. Please reconnect your eBay account.',
    action: 'DISCONNECT_AND_RECONNECT',
    actionText: 'Disconnect & Reconnect',
    severity: 'error'
  },
  'EBAY_AUTH_FAILED': {
    title: 'eBay Authentication Failed',
    message: 'eBay rejected your credentials. They may be invalid, expired, or revoked.',
    action: 'DISCONNECT_AND_RECONNECT',
    actionText: 'Reconnect eBay Account',
    severity: 'error'
  },
  'EBAY_API_ERROR': {
    title: 'eBay API Temporarily Unavailable',
    message: 'eBay\'s servers are experiencing issues. Please try again in a few minutes.',
    action: 'TRY_AGAIN_LATER',
    actionText: 'Retry',
    severity: 'warning'
  },
  'UNKNOWN_ERROR': {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred. Please contact support if this persists.',
    action: 'CONTACT_SUPPORT',
    actionText: 'Contact Support',
    severity: 'error'
  }
}
```

---

## Security Improvements

### 1. Credential Validation on Storage

```javascript
// netlify/functions/save-ebay-credentials.js (IMPROVED)

exports.handler = async (event, context) => {
  // ... existing auth code ...

  const { ebay_app_id, ebay_cert_id, ebay_dev_id } = JSON.parse(event.body)

  // VALIDATE FORMAT BEFORE STORING

  // Validate App ID format
  if (!ebay_app_id || !/^[a-zA-Z0-9]+-[a-zA-Z0-9]+-[a-zA-Z0-9]+-[a-zA-Z0-9]+$/.test(ebay_app_id)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Invalid App ID format',
        message: 'App ID should be in format: username-appname-env-random'
      })
    }
  }

  // Validate Cert ID format (should be hex string)
  if (!ebay_cert_id || !/^[0-9a-f]{32,}$/i.test(ebay_cert_id)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Invalid Cert ID format',
        message: 'Cert ID should be a 32+ character hexadecimal string'
      })
    }
  }

  // Validate Dev ID format (optional, UUID-like)
  if (ebay_dev_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ebay_dev_id)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Invalid Dev ID format',
        message: 'Dev ID should be in UUID format'
      })
    }
  }

  // Encrypt Cert ID
  const encryptedCertId = encrypt(ebay_cert_id)

  // Save to database
  const { error: updateError } = await supabase
    .from('users')
    .update({
      ebay_app_id: ebay_app_id,
      ebay_cert_id_encrypted: encryptedCertId,
      ebay_dev_id: ebay_dev_id || null
    })
    .eq('id', user.id)

  if (updateError) {
    throw new Error(`Failed to save credentials: ${updateError.message}`)
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: 'eBay credentials saved successfully',
      validated: true
    })
  }
}
```

### 2. OAuth State Cleanup Job

```javascript
// netlify/functions/scheduled-cleanup-oauth-states.js (NEW)

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Cleanup expired OAuth states
 * Runs every hour via Netlify scheduled functions
 */
exports.handler = async (event, context) => {
  console.log('🧹 Cleaning up expired OAuth states...')

  try {
    // Delete states older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('oauth_states')
      .delete()
      .lt('created_at', tenMinutesAgo)
      .select('id')

    if (error) {
      throw error
    }

    console.log(`✅ Cleaned up ${data?.length || 0} expired OAuth states`)

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        deleted: data?.length || 0
      })
    }

  } catch (error) {
    console.error('❌ OAuth state cleanup failed:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    }
  }
}
```

```toml
# netlify.toml (add scheduled function)

[[functions]]
  name = "scheduled-cleanup-oauth-states"
  schedule = "0 * * * *" # Every hour
```

### 3. Encryption Key Rotation Support

```javascript
// netlify/functions-dev/rotate-encryption-key.js (NEW)

/**
 * Development utility to rotate encryption key
 *
 * WARNING: This function should NEVER be deployed to production
 * It's only for local development/testing encryption key rotation
 *
 * Usage:
 * 1. Set NEW_ENCRYPTION_KEY environment variable
 * 2. Run: curl -X POST http://localhost:8888/.netlify/functions-dev/rotate-encryption-key
 * 3. Update ENCRYPTION_KEY to NEW_ENCRYPTION_KEY value
 * 4. Remove NEW_ENCRYPTION_KEY environment variable
 */

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const OLD_KEY = process.env.ENCRYPTION_KEY
const NEW_KEY = process.env.NEW_ENCRYPTION_KEY

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function decryptOld(encryptedText) {
  const key = Buffer.from(OLD_KEY, 'hex')
  const parts = encryptedText.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const ciphertext = Buffer.from(parts[1], 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(ciphertext, undefined, 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function encryptNew(text) {
  const key = Buffer.from(NEW_KEY, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

exports.handler = async (event, context) => {
  if (!OLD_KEY || !NEW_KEY) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Both ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must be set'
      })
    }
  }

  try {
    console.log('🔑 Starting encryption key rotation...')

    // Get all users with encrypted data
    const { data: users, error } = await supabase
      .from('users')
      .select('id, ebay_cert_id_encrypted, ebay_refresh_token')
      .not('ebay_cert_id_encrypted', 'is', null)

    if (error) throw error

    console.log(`Found ${users.length} users with encrypted data`)

    let updated = 0
    let failed = 0

    for (const user of users) {
      try {
        // Decrypt with old key
        const certId = user.ebay_cert_id_encrypted ? decryptOld(user.ebay_cert_id_encrypted) : null
        const refreshToken = user.ebay_refresh_token ? decryptOld(user.ebay_refresh_token) : null

        // Re-encrypt with new key
        const newCertId = certId ? encryptNew(certId) : null
        const newRefreshToken = refreshToken ? encryptNew(refreshToken) : null

        // Update database
        const { error: updateError } = await supabase
          .from('users')
          .update({
            ebay_cert_id_encrypted: newCertId,
            ebay_refresh_token: newRefreshToken
          })
          .eq('id', user.id)

        if (updateError) throw updateError

        updated++
        console.log(`✓ Updated user ${user.id}`)

      } catch (err) {
        failed++
        console.error(`✗ Failed to update user ${user.id}:`, err.message)
      }
    }

    console.log(`✅ Encryption key rotation complete: ${updated} updated, ${failed} failed`)

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        updated,
        failed
      })
    }

  } catch (error) {
    console.error('❌ Encryption key rotation failed:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1)

**Goals**:
- Create unified token service
- Add new RPC function
- Create connection status endpoint

**Tasks**:

1. **Create EbayTokenService** (3 days)
   - [x] Create `netlify/functions/utils/ebay-token-service.js`
   - [x] Implement `TokenError` class
   - [x] Implement `getAccessToken()` with caching
   - [x] Implement `getCredentials()` with validation
   - [x] Implement `getConnectionStatus()`
   - [x] Implement `disconnect()`
   - [ ] Write unit tests

2. **Create Database RPC Function** (1 day)
   - [x] Create `get_user_ebay_credentials_complete` RPC
   - [ ] Test with existing user data
   - [ ] Migrate existing code to use new RPC

3. **Create Connection Status Endpoint** (1 day)
   - [x] Create `netlify/functions/ebay-connection-status.js`
   - [ ] Test with various user states
   - [ ] Document API

4. **Testing** (1 day)
   - [ ] Test with real eBay credentials
   - [ ] Test error scenarios
   - [ ] Test token caching
   - [ ] Performance testing

### Phase 2: Client Refactor (Week 2)

**Goals**:
- Simplify eBay API client
- Migrate all backend functions to new pattern

**Tasks**:

1. **Create Simplified EbayApiClient** (2 days)
   - [x] Create `netlify/functions/utils/ebay-api-client.js`
   - [x] Implement high-level API methods
   - [x] Use EbayTokenService for token management
   - [ ] Write unit tests

2. **Migrate Backend Functions** (3 days)
   - [x] Migrate `trigger-sync.js`
   - [ ] Migrate `ebay-fetch-listings.js`
   - [ ] Migrate `reduce-price.js`
   - [ ] Migrate scheduled functions
   - [ ] Test each migration

3. **Remove Old Code** (1 day)
   - [ ] Archive `user-ebay-client.js`
   - [ ] Archive `enhanced-ebay-client.js`
   - [ ] Remove `ebayTokenManager.js` (frontend)
   - [ ] Update imports

### Phase 3: Frontend UI (Week 3)

**Goals**:
- Simplified connection status UI
- Better error messages
- Clearer user flows

**Tasks**:

1. **Create EbayConnectionStatus Component** (2 days)
   - [ ] Create `frontend/src/components/EbayConnectionStatus.jsx`
   - [ ] Implement status display
   - [ ] Implement action buttons
   - [ ] Add loading states

2. **Update EbayConnect Component** (2 days)
   - [ ] Simplify state management
   - [ ] Use new connection status endpoint
   - [ ] Improve error messages
   - [ ] Add visual feedback

3. **Update Account Page** (1 day)
   - [ ] Integrate new components
   - [ ] Simplify integrations tab
   - [ ] Test responsive design

### Phase 4: Security & Cleanup (Week 4)

**Goals**:
- Enhanced security
- Database cleanup
- Documentation

**Tasks**:

1. **Add Credential Validation** (1 day)
   - [ ] Update `save-ebay-credentials.js`
   - [ ] Add format validation
   - [ ] Add error messages

2. **Create OAuth State Cleanup** (1 day)
   - [ ] Create `scheduled-cleanup-oauth-states.js`
   - [ ] Configure Netlify scheduled function
   - [ ] Test cleanup logic

3. **Encryption Key Rotation** (1 day)
   - [ ] Create `rotate-encryption-key.js` (dev only)
   - [ ] Document rotation process
   - [ ] Test rotation script

4. **Documentation** (2 days)
   - [ ] Update CLAUDE.md with new patterns
   - [ ] Create developer guide
   - [ ] Create troubleshooting guide
   - [ ] Update API documentation

---

## Testing Strategy

### Unit Tests

```javascript
// tests/ebay-token-service.test.js

const { EbayTokenService, TokenError } = require('../netlify/functions/utils/ebay-token-service')

describe('EbayTokenService', () => {
  describe('getAccessToken', () => {
    it('should return cached token if valid', async () => {
      // Test implementation
    })

    it('should refresh token if expired', async () => {
      // Test implementation
    })

    it('should throw TokenError if credentials missing', async () => {
      // Test implementation
    })
  })

  describe('getConnectionStatus', () => {
    it('should return connected=true if token valid', async () => {
      // Test implementation
    })

    it('should return hasCredentials=false if not configured', async () => {
      // Test implementation
    })

    it('should return actionable error messages', async () => {
      // Test implementation
    })
  })

  describe('validateCredentials', () => {
    it('should accept valid credentials', () => {
      // Test implementation
    })

    it('should reject invalid App ID format', () => {
      // Test implementation
    })

    it('should reject NEEDS_MIGRATION credentials', () => {
      // Test implementation
    })
  })
})
```

### Integration Tests

```javascript
// tests/integration/token-flow.test.js

describe('Token Flow Integration', () => {
  it('should complete full OAuth flow', async () => {
    // 1. Save credentials
    // 2. Initiate OAuth
    // 3. Handle callback
    // 4. Get access token
    // 5. Make API call
    // 6. Verify listing sync
  })

  it('should handle token refresh on expiration', async () => {
    // 1. Get access token
    // 2. Wait for expiration
    // 3. Make API call
    // 4. Verify token refreshed
  })

  it('should handle credential migration', async () => {
    // 1. Set NEEDS_MIGRATION credentials
    // 2. Attempt to sync
    // 3. Verify error message
    // 4. Disconnect
    // 5. Reconnect
    // 6. Verify working
  })
})
```

### Manual Testing Checklist

#### Happy Path
- [ ] User configures credentials
- [ ] User connects eBay account
- [ ] User syncs listings
- [ ] User updates price
- [ ] User disconnects account

#### Error Scenarios
- [ ] Invalid App ID format
- [ ] Invalid Cert ID format
- [ ] Expired refresh token (18 months)
- [ ] eBay API temporarily down
- [ ] NEEDS_MIGRATION credentials
- [ ] Invalid encryption format
- [ ] Missing credentials
- [ ] OAuth state expired

#### Edge Cases
- [ ] Concurrent token refresh attempts
- [ ] Token expires mid-sync
- [ ] User deletes credentials during sync
- [ ] Network timeout
- [ ] Database connection lost

---

## Rollout Plan

### Pre-Deployment Checklist

- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] Backup database
- [ ] Rollback plan documented

### Deployment Steps

**Step 1: Database Changes** (Day 1)
1. Create new RPC function: `get_user_ebay_credentials_complete`
2. Test RPC with existing data
3. Verify no breaking changes

**Step 2: Backend Changes** (Day 2-3)
1. Deploy new utility files:
   - `ebay-token-service.js`
   - `ebay-api-client.js`
2. Deploy new endpoint: `ebay-connection-status.js`
3. Test endpoints with Postman/curl
4. Monitor Netlify logs

**Step 3: Backend Migration** (Day 4-5)
1. Deploy updated backend functions one at a time:
   - `trigger-sync.js`
   - `ebay-fetch-listings.js`
   - `reduce-price.js`
2. Test each function after deployment
3. Monitor for errors

**Step 4: Frontend Changes** (Day 6-7)
1. Deploy new components:
   - `EbayConnectionStatus.jsx`
2. Deploy updated components:
   - `EbayConnect.jsx`
   - `Account.jsx`
3. Test user flows
4. Gather user feedback

**Step 5: Cleanup** (Day 8-9)
1. Deploy scheduled cleanup function
2. Remove old code files (after 1 week observation)
3. Update documentation

**Step 6: Monitoring** (Week 2)
1. Monitor error rates
2. Monitor user feedback
3. Monitor performance metrics
4. Fix any issues

### Rollback Plan

If critical issues arise:

1. **Immediate**: Revert frontend to previous version
2. **Backend**: Keep new backend (it's backwards compatible)
3. **Database**: New RPC function is additive, no rollback needed
4. **Fix forward**: Address issues in new code rather than full rollback

### Success Metrics

**Technical Metrics**:
- [ ] 401 error rate < 1% (currently ~10%)
- [ ] Token refresh success rate > 99%
- [ ] Average connection status check < 200ms
- [ ] Zero database errors

**User Experience Metrics**:
- [ ] Connection success rate > 95%
- [ ] User understands connection status (survey)
- [ ] Support tickets reduced by 50%
- [ ] Disconnect success rate > 99%

---

## Best Practices & Patterns

### Backend Function Pattern

```javascript
// Standard pattern for all backend functions

const { createClient } = require('@supabase/supabase-js')
const { EbayApiClient } = require('./utils/ebay-api-client')
const { TokenError } = require('./utils/ebay-token-service')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // 1. Validate Supabase JWT (standard pattern)
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized', code: 'NO_AUTH_TOKEN' })
      }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    const user = userData?.user

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token', code: 'INVALID_AUTH_TOKEN' })
      }
    }

    // 2. Initialize eBay client (standard pattern)
    const ebayClient = new EbayApiClient(user.id)
    await ebayClient.initialize()

    // 3. Business logic here
    // ...

    // 4. Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, /* data */ })
    }

  } catch (error) {
    console.error('Function failed:', error)

    // 5. Handle TokenError (standard pattern)
    if (error instanceof TokenError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: error.message,
          code: error.code,
          action: error.action
        })
      }
    }

    // 6. Handle other errors
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        code: 'UNKNOWN_ERROR'
      })
    }
  }
}
```

### Error Handling Pattern

```javascript
// Always use TokenError for eBay-related errors

throw new TokenError(
  'ERROR_CODE',              // Machine-readable code
  'Human readable message',  // User-facing message
  'ACTION_CODE'              // Optional: what user should do
)

// Good error messages:
// ✅ "eBay credentials not configured. Please add App ID and Cert ID in Admin Settings."
// ✅ "eBay rejected credentials: invalid_client. Please reconnect your eBay account."

// Bad error messages:
// ❌ "Error: 401"
// ❌ "Token refresh failed"
// ❌ "Something went wrong"
```

### Frontend Component Pattern

```jsx
// Use React Query for data fetching
const { data, isLoading, error } = useQuery(
  ['ebay-connection-status'],
  fetchConnectionStatus,
  {
    refetchInterval: 30000, // Refresh periodically
    staleTime: 10000
  }
)

// Handle loading states
if (isLoading) return <LoadingSpinner />

// Handle errors clearly
if (error) return <ErrorMessage error={error} />

// Show actionable status
return <StatusDisplay status={data} />
```

---

## Conclusion

This plan establishes a **unified, simple, and secure** token management architecture that:

✅ **Reduces Complexity**: Single token service, single API client, single source of truth
✅ **Improves User Experience**: Clear status, actionable errors, easy troubleshooting
✅ **Enhances Security**: Validation at storage, cleanup jobs, encryption key rotation support
✅ **Enables Scalability**: Patterns work for multi-user, multi-tenant architecture
✅ **Simplifies Maintenance**: Consistent patterns, better documentation, fewer edge cases

### Next Steps

1. **Review this plan** with stakeholders
2. **Approve implementation timeline** (4 weeks)
3. **Begin Phase 1** (Foundation)
4. **Weekly check-ins** to track progress
5. **Deploy incrementally** following rollout plan

### Questions to Address

- [ ] Should we implement token expiration tracking in Phase 1 or Phase 2?
- [ ] Should we remove old client implementations immediately or keep for 1 week?
- [ ] Should we add Sentry/error tracking integration?
- [ ] Should we add metrics/analytics to track token refresh success rates?

---

**End of Implementation Plan**

*For questions or clarification, refer to the research document: `2025-10-02_oauth-token-management.md`*
