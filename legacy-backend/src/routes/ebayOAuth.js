const express = require('express')
const router = express.Router()
const ebayOAuthService = require('../services/ebayOAuth')
const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

/**
 * GET /api/ebay/auth
 * Initiate eBay OAuth flow
 */
router.get('/auth', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id

    if (!userId) {
      return res.status(401).json({ error: 'User ID required' })
    }

    const authUrl = ebayOAuthService.generateAuthUrl(userId)
    res.json({ authUrl })
  } catch (error) {
    console.error('OAuth initiation error:', error)
    res.status(500).json({ error: 'Failed to initiate OAuth flow' })
  }
})

/**
 * GET /api/ebay/callback
 * Handle eBay OAuth callback
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query

    // Handle OAuth errors
    if (oauthError) {
      console.error('OAuth error:', oauthError)
      return res.redirect(`${process.env.FRONTEND_URL}/account?error=oauth_failed`)
    }

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/account?error=missing_params`)
    }

    // Verify state parameter
    const userId = ebayOAuthService.verifyState(state)

    // Exchange code for tokens
    const tokens = await ebayOAuthService.exchangeCodeForTokens(code)

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000))

    // Update user with eBay credentials
    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_access_token: tokens.access_token,
        ebay_refresh_token: tokens.refresh_token,
        ebay_token_expires_at: expiresAt.toISOString(),
        ebay_credentials_valid: true,
        ebay_connection_status: 'connected'
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Database update error:', updateError)
      return res.redirect(`${process.env.FRONTEND_URL}/account?error=save_failed`)
    }

    // Redirect to success page
    res.redirect(`${process.env.FRONTEND_URL}/account?tab=integrations&success=ebay_connected`)
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.redirect(`${process.env.FRONTEND_URL}/account?error=callback_failed`)
  }
})

/**
 * POST /api/ebay/refresh
 * Manually refresh eBay access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.id

    if (!userId) {
      return res.status(401).json({ error: 'User ID required' })
    }

    // Get user's current refresh token
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('ebay_refresh_token, ebay_token_expires_at')
      .eq('id', userId)
      .single()

    if (fetchError || !user?.ebay_refresh_token) {
      return res.status(400).json({ error: 'No refresh token found' })
    }

    // Refresh the token
    const newTokens = await ebayOAuthService.refreshAccessToken(user.ebay_refresh_token)

    // Calculate new expiration
    const expiresAt = new Date(Date.now() + (newTokens.expires_in * 1000))

    // Update user with new access token
    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_access_token: newTokens.access_token,
        ebay_token_expires_at: expiresAt.toISOString(),
        ebay_credentials_valid: true
      })
      .eq('id', userId)

    if (updateError) {
      return res.status(500).json({ error: 'Failed to save new token' })
    }

    res.json({
      success: true,
      expiresAt: expiresAt.toISOString()
    })
  } catch (error) {
    console.error('Token refresh error:', error)

    if (error.message === 'REFRESH_TOKEN_INVALID') {
      return res.status(401).json({
        error: 'Refresh token invalid',
        requiresReauth: true
      })
    }

    res.status(500).json({ error: 'Failed to refresh token' })
  }
})

/**
 * GET /api/ebay/status
 * Check eBay connection status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id

    if (!userId) {
      return res.status(401).json({ error: 'User ID required' })
    }

    // Get user's eBay credentials
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('ebay_access_token, ebay_refresh_token, ebay_token_expires_at, ebay_credentials_valid')
      .eq('id', userId)
      .single()

    if (fetchError || !user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if user has credentials
    if (!user.ebay_access_token) {
      return res.json({
        connected: false,
        requiresAuth: true
      })
    }

    // Check if token needs refresh
    const tokenResult = await ebayOAuthService.ensureValidToken(user)

    if (tokenResult.needs_reauth) {
      return res.json({
        connected: false,
        requiresAuth: true,
        message: 'eBay credentials expired. Please reconnect your account.'
      })
    }

    if (tokenResult.needs_update) {
      // Update user with new token
      await supabase
        .from('users')
        .update({
          ebay_access_token: tokenResult.access_token,
          ebay_token_expires_at: tokenResult.expires_at
        })
        .eq('id', userId)
    }

    // Validate token with eBay
    const isValid = await ebayOAuthService.validateToken(tokenResult.access_token)

    res.json({
      connected: isValid,
      expiresAt: tokenResult.expires_at,
      requiresAuth: !isValid
    })
  } catch (error) {
    console.error('Status check error:', error)
    res.status(500).json({ error: 'Failed to check connection status' })
  }
})

/**
 * POST /api/ebay/disconnect
 * Disconnect eBay account
 */
router.post('/disconnect', async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.id

    if (!userId) {
      return res.status(401).json({ error: 'User ID required' })
    }

    // Clear eBay credentials
    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_access_token: null,
        ebay_refresh_token: null,
        ebay_token_expires_at: null,
        ebay_credentials_valid: false,
        ebay_connection_status: 'disconnected',
        ebay_user_id: null
      })
      .eq('id', userId)

    if (updateError) {
      return res.status(500).json({ error: 'Failed to disconnect account' })
    }

    res.json({ success: true, message: 'eBay account disconnected' })
  } catch (error) {
    console.error('Disconnect error:', error)
    res.status(500).json({ error: 'Failed to disconnect account' })
  }
})

module.exports = router