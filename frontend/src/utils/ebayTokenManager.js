/**
 * eBay Token Management Utility
 *
 * NOTE: As of the database migration, access token expiration (ebay_token_expires_at) is no longer
 * stored in the database. Access tokens are now managed server-side and automatically refreshed
 * using the stored refresh token when making API calls.
 *
 * This utility is retained for backward compatibility and manual token refresh operations.
 * Most functions that reference ebay_token_expires_at are deprecated.
 *
 * Current active columns:
 * - ebay_refresh_token (replaces ebay_user_token)
 * - ebay_connection_status (replaces ebay_credentials_valid)
 * - ebay_connected_at
 * - ebay_refresh_token_expires_at
 */

import { userAPI } from '../lib/supabase'

/**
 * Check if the access token is expired or expiring soon
 * @param {string} tokenExpiresAt - ISO timestamp of token expiration
 * @param {number} bufferMinutes - Minutes before expiry to consider "expiring soon" (default: 30)
 * @returns {boolean} - True if token is expired or expiring soon
 */
export function isTokenExpiringSoon(tokenExpiresAt, bufferMinutes = 30) {
  if (!tokenExpiresAt) return true

  const expiryTime = new Date(tokenExpiresAt).getTime()
  const now = Date.now()
  const buffer = bufferMinutes * 60 * 1000

  return (expiryTime - now) <= buffer
}

/**
 * Check if the access token is currently valid
 * @param {string} tokenExpiresAt - ISO timestamp of token expiration
 * @returns {boolean} - True if token is still valid
 */
export function isTokenValid(tokenExpiresAt) {
  if (!tokenExpiresAt) return false
  return new Date(tokenExpiresAt) > new Date()
}

/**
 * Get time remaining until token expiration
 * @param {string} tokenExpiresAt - ISO timestamp of token expiration
 * @returns {object} - Object with days, hours, minutes remaining
 */
export function getTimeUntilExpiry(tokenExpiresAt) {
  if (!tokenExpiresAt) return null

  const expiryTime = new Date(tokenExpiresAt).getTime()
  const now = Date.now()
  const diff = expiryTime - now

  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0 }
  }

  const minutes = Math.floor(diff / (1000 * 60)) % 60
  const hours = Math.floor(diff / (1000 * 60 * 60)) % 24
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  return { expired: false, days, hours, minutes }
}

/**
 * Refresh the eBay access token
 * @returns {Promise<object>} - Result object with success status and data
 */
export async function refreshEbayToken() {
  try {
    const token = await userAPI.getAuthToken()

    const response = await fetch('/.netlify/functions/ebay-oauth?action=refresh-token', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    if (response.ok && data.success) {
      return {
        success: true,
        tokenExpiresAt: data.tokenExpiresAt,
        expiresIn: data.expiresIn,
        message: data.message
      }
    } else {
      return {
        success: false,
        error: data.error,
        needsReconnect: data.needsReconnect,
        message: data.message
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'Failed to refresh token'
    }
  }
}

/**
 * Check connection status and refresh token if needed
 * @param {object} profile - User profile object
 * @returns {Promise<object>} - Result object with status and any refresh results
 */
export async function checkAndRefreshToken(profile) {
  if (!profile?.ebay_token_expires_at) {
    return {
      hasToken: false,
      message: 'No token found'
    }
  }

  const needsRefresh = isTokenExpiringSoon(profile.ebay_token_expires_at, 30)

  if (needsRefresh) {
    console.log('Token expiring soon, auto-refreshing...')
    const refreshResult = await refreshEbayToken()

    return {
      hasToken: true,
      wasExpiring: true,
      refreshed: refreshResult.success,
      ...refreshResult
    }
  }

  return {
    hasToken: true,
    wasExpiring: false,
    valid: isTokenValid(profile.ebay_token_expires_at),
    expiresAt: profile.ebay_token_expires_at
  }
}

/**
 * Format token expiry time for display
 * @param {string} tokenExpiresAt - ISO timestamp of token expiration
 * @returns {string} - Formatted display string
 */
export function formatTokenExpiry(tokenExpiresAt) {
  if (!tokenExpiresAt) return 'Unknown'

  const timeRemaining = getTimeUntilExpiry(tokenExpiresAt)

  if (!timeRemaining || timeRemaining.expired) {
    return 'Expired'
  }

  if (timeRemaining.days > 0) {
    return `${timeRemaining.days}d ${timeRemaining.hours}h remaining`
  } else if (timeRemaining.hours > 0) {
    return `${timeRemaining.hours}h ${timeRemaining.minutes}m remaining`
  } else {
    return `${timeRemaining.minutes}m remaining`
  }
}

/**
 * Get status message and color for token state
 * @param {string} tokenExpiresAt - ISO timestamp of token expiration
 * @returns {object} - Object with status, message, and color
 */
export function getTokenStatus(tokenExpiresAt) {
  if (!tokenExpiresAt) {
    return {
      status: 'missing',
      message: 'No token',
      color: 'gray'
    }
  }

  if (!isTokenValid(tokenExpiresAt)) {
    return {
      status: 'expired',
      message: 'Expired - Refresh needed',
      color: 'red'
    }
  }

  if (isTokenExpiringSoon(tokenExpiresAt, 60)) {
    return {
      status: 'expiring',
      message: 'Expiring soon',
      color: 'yellow'
    }
  }

  return {
    status: 'valid',
    message: 'Valid',
    color: 'green'
  }
}

export default {
  isTokenExpiringSoon,
  isTokenValid,
  getTimeUntilExpiry,
  refreshEbayToken,
  checkAndRefreshToken,
  formatTokenExpiry,
  getTokenStatus
}
