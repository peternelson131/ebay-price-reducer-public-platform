/**
 * eBay OAuth Service with Refresh Token Automation
 * Handles OAuth flow, token refresh, and credential management
 */

const axios = require('axios')
const crypto = require('crypto')
const querystring = require('querystring')

class EbayOAuthService {
  constructor() {
    this.clientId = process.env.EBAY_CLIENT_ID
    this.clientSecret = process.env.EBAY_CLIENT_SECRET
    this.redirectUri = process.env.EBAY_REDIRECT_URI || `${process.env.APP_URL}/api/ebay/callback`
    this.environment = process.env.EBAY_ENVIRONMENT || 'PRODUCTION'

    // eBay OAuth URLs
    this.authUrl = this.environment === 'SANDBOX'
      ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
      : 'https://auth.ebay.com/oauth2/authorize'

    this.tokenUrl = this.environment === 'SANDBOX'
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
      : 'https://api.ebay.com/identity/v1/oauth2/token'
  }

  /**
   * Generate OAuth authorization URL with state parameter for security
   */
  generateAuthUrl(userId) {
    const state = this.generateState(userId)
    const scope = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.marketing',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
    ].join(' ')

    const params = {
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scope,
      state: state,
      prompt: 'login' // Force login to ensure we get fresh credentials
    }

    return `${this.authUrl}?${querystring.stringify(params)}`
  }

  /**
   * Generate secure state parameter to prevent CSRF attacks
   */
  generateState(userId) {
    const timestamp = Date.now()
    const random = crypto.randomBytes(16).toString('hex')
    const data = `${userId}:${timestamp}:${random}`

    // Encrypt the state data
    const cipher = crypto.createCipher('aes-256-cbc', process.env.STATE_ENCRYPTION_KEY || 'default-key')
    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    return encrypted
  }

  /**
   * Verify state parameter to prevent CSRF attacks
   */
  verifyState(state) {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', process.env.STATE_ENCRYPTION_KEY || 'default-key')
      let decrypted = decipher.update(state, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      const [userId, timestamp] = decrypted.split(':')

      // Check if state is not older than 10 minutes
      const stateAge = Date.now() - parseInt(timestamp)
      if (stateAge > 600000) {
        throw new Error('State parameter expired')
      }

      return userId
    } catch (error) {
      throw new Error('Invalid state parameter')
    }
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  async exchangeCodeForTokens(code) {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.redirectUri
    })

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      })

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type
      }
    } catch (error) {
      console.error('Token exchange error:', error.response?.data || error.message)
      throw new Error('Failed to exchange authorization code for tokens')
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: [
        'https://api.ebay.com/oauth/api_scope',
        'https://api.ebay.com/oauth/api_scope/sell.inventory',
        'https://api.ebay.com/oauth/api_scope/sell.marketing',
        'https://api.ebay.com/oauth/api_scope/sell.account',
        'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
      ].join(' ')
    })

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      })

      return {
        access_token: response.data.access_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type
      }
    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message)

      // If refresh token is invalid, user needs to re-authenticate
      if (error.response?.status === 400) {
        throw new Error('REFRESH_TOKEN_INVALID')
      }

      throw new Error('Failed to refresh access token')
    }
  }

  /**
   * Get user consent URL for initial setup
   */
  getUserConsentUrl(userId) {
    const consentUrl = this.environment === 'SANDBOX'
      ? 'https://signin.sandbox.ebay.com/ws/eBayISAPI.dll?UserAgreement'
      : 'https://signin.ebay.com/ws/eBayISAPI.dll?UserAgreement'

    const params = {
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state: this.generateState(userId),
      scope: [
        'https://api.ebay.com/oauth/api_scope',
        'https://api.ebay.com/oauth/api_scope/sell.inventory',
        'https://api.ebay.com/oauth/api_scope/sell.marketing',
        'https://api.ebay.com/oauth/api_scope/sell.account',
        'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
      ].join(' ')
    }

    return `${consentUrl}&${querystring.stringify(params)}`
  }

  /**
   * Validate access token
   */
  async validateToken(accessToken) {
    try {
      // Make a simple API call to validate the token
      const response = await axios.get(
        `${this.environment === 'SANDBOX' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com'}/sell/account/v1/privilege`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      return response.status === 200
    } catch (error) {
      return false
    }
  }

  /**
   * Automatically refresh token if expired or about to expire
   */
  async ensureValidToken(user) {
    const now = Date.now()
    const tokenExpiresAt = new Date(user.ebay_token_expires_at).getTime()

    // Refresh if token expires in less than 5 minutes
    if (tokenExpiresAt - now < 300000) {
      try {
        const newTokens = await this.refreshAccessToken(user.ebay_refresh_token)

        // Calculate new expiration time
        const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000))

        // Update user with new tokens
        return {
          access_token: newTokens.access_token,
          expires_at: newExpiresAt,
          needs_update: true
        }
      } catch (error) {
        if (error.message === 'REFRESH_TOKEN_INVALID') {
          // User needs to re-authenticate
          return {
            needs_reauth: true
          }
        }
        throw error
      }
    }

    // Token is still valid
    return {
      access_token: user.ebay_access_token,
      expires_at: user.ebay_token_expires_at,
      needs_update: false
    }
  }
}

module.exports = new EbayOAuthService()