import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { userAPI } from '../lib/supabase'
import { isTokenExpiringSoon, refreshEbayToken, getTokenStatus, formatTokenExpiry } from '../utils/ebayTokenManager'
import { toast } from '../utils/toast'

export default function EbayConnect() {
  const [connectionStep, setConnectionStep] = useState('idle') // idle, connecting, connected, error, needs-setup
  const [showGuide, setShowGuide] = useState(false)
  const [checkingCredentials, setCheckingCredentials] = useState(true)
  const [credentials, setCredentials] = useState(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Get user profile to check eBay connection status
  const { data: profile, isLoading } = useQuery(
    ['profile'],
    () => userAPI.getProfile(),
    {
      refetchInterval: connectionStep === 'connecting' ? 2000 : false // Poll during connection
    }
  )

  // Note: Automatic token refresh removed - access tokens are managed server-side
  // The backend automatically refreshes access tokens using the stored refresh token
  // when making API calls

  // Check if credentials are configured
  useEffect(() => {
    const checkCredentials = async () => {
      try {
        const response = await fetch('/.netlify/functions/ebay-oauth?action=get-credentials', {
          headers: {
            'Authorization': `Bearer ${await userAPI.getAuthToken()}`
          }
        })
        const data = await response.json()

        // Store the credentials info for display
        setCredentials(data)

        // Check if user has saved their eBay App ID and Cert ID
        if (!data.hasAppId || !data.hasCertId) {
          setConnectionStep('needs-setup')
        } else if (data.hasRefreshToken) {
          // User has connected their eBay account (has refresh token)
          setConnectionStep('connected')
        } else if (connectionStep === 'connecting') {
          // Keep checking while connecting
        } else {
          // Credentials exist but not connected yet - this is the correct state for OAuth flow
          setConnectionStep('idle')
        }
      } catch (error) {
        console.error('Error checking credentials:', error)
        setConnectionStep('needs-setup')
      } finally {
        setCheckingCredentials(false)
      }
    }

    if (profile) {
      checkCredentials()
    }
  }, [profile, connectionStep])

  // Initiate OAuth flow
  const connectEbay = async () => {
    try {
      setConnectionStep('connecting')

      // Get OAuth authorization URL from backend
      const response = await fetch('/.netlify/functions/ebay-oauth?action=initiate', {
        headers: {
          'Authorization': `Bearer ${await userAPI.getAuthToken()}`
        }
      })

      const data = await response.json()

      if (data.authUrl) {
        // Open eBay OAuth in new window
        const authWindow = window.open(
          data.authUrl,
          'ebay-auth',
          'width=600,height=700,scrollbars=yes'
        )

        // Store reference to the popup window
        window.ebayAuthWindow = authWindow

        // Listen for messages from the popup
        const messageHandler = (event) => {
          // Security: Only accept messages from trusted origins
          if (event.origin !== window.location.origin &&
              !event.origin.includes('netlify.app') &&
              !event.origin.includes('localhost')) {
            return
          }

          if (event.data.type === 'ebay-oauth-success') {
            console.log('eBay OAuth success!', event.data)
            // Clear the reference
            window.ebayAuthWindow = null
            // Refresh profile to get updated connection status
            queryClient.invalidateQueries(['profile'])
            setConnectionStep('idle')
            // Show success message
            toast.success(`Successfully connected to eBay${event.data.ebayUser ? ` as ${event.data.ebayUser}` : ''}! Your refresh token has been securely encrypted and stored.`)
          } else if (event.data.type === 'ebay-oauth-error') {
            console.error('eBay OAuth error:', event.data)
            // Clear the reference
            window.ebayAuthWindow = null
            setConnectionStep('idle')
            // Show error message
            toast.error(`Failed to connect to eBay: ${event.data.error || 'Unknown error'}. ${event.data.message || 'Please try again.'}`)
          }
        }

        // Add message event listener
        window.addEventListener('message', messageHandler)

        // Check if window was closed without completing OAuth
        const checkClosed = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkClosed)
            // Remove message listener
            window.removeEventListener('message', messageHandler)
            // Clear the reference
            window.ebayAuthWindow = null
            // Query will refetch and update status
            queryClient.invalidateQueries(['profile'])
          }
        }, 1000)
      } else {
        throw new Error('Failed to get authorization URL')
      }
    } catch (error) {
      console.error('Connection error:', error)
      setConnectionStep('error')
      toast.error('Failed to connect to eBay. Please try again.')
    }
  }

  // Disconnect eBay account
  const disconnectEbay = async () => {
    if (!confirm('Are you sure you want to disconnect your eBay account?\n\nThis will remove your refresh token but keep your eBay App credentials.')) return

    console.log('Starting disconnect process...')
    setIsDisconnecting(true)

    try {
      const token = await userAPI.getAuthToken()
      console.log('Auth token obtained, calling disconnect endpoint')

      const response = await fetch('/.netlify/functions/ebay-oauth?action=disconnect', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('Disconnect response status:', response.status)
      const data = await response.json()
      console.log('Disconnect response data:', data)

      if (response.ok && data.success) {
        console.log('Disconnect successful, refreshing UI...')

        // Clear the refresh token from credentials state immediately
        setCredentials(prev => ({
          ...prev,
          hasRefreshToken: false
        }))

        // Force refetch profile data
        await queryClient.invalidateQueries(['profile'])
        await queryClient.refetchQueries(['profile'])

        // Refetch credentials to get the latest state from the server
        const fetchCredentials = async () => {
          try {
            const response = await fetch('/.netlify/functions/ebay-oauth?action=get-credentials', {
              headers: {
                'Authorization': `Bearer ${await userAPI.getAuthToken()}`
              }
            })
            const data = await response.json()
            setCredentials(data)
            return data
          } catch (error) {
            console.error('Error fetching credentials:', error)
            return null
          }
        }

        await fetchCredentials()

        // Update connection step based on new credentials state
        const updatedCreds = await fetchCredentials()
        if (updatedCreds && !updatedCreds.hasRefreshToken && updatedCreds.hasAppId && updatedCreds.hasCertId) {
          setConnectionStep('ready-to-connect')
        } else if (updatedCreds && !updatedCreds.hasAppId) {
          setConnectionStep('needs-setup')
        }

        toast.success('eBay account disconnected successfully. Your App credentials are still saved.')
      } else {
        throw new Error(data.error || data.message || 'Failed to disconnect')
      }
    } catch (error) {
      console.error('Disconnect error:', error)
      toast.error(`Failed to disconnect eBay account: ${error.message}`)
    } finally {
      setIsDisconnecting(false)
    }
  }

  // Refresh access token
  const refreshToken = async () => {
    console.log('Starting token refresh...')
    setIsRefreshing(true)
    setRefreshMessage(null)

    try {
      const result = await refreshEbayToken()

      if (result.success) {
        console.log('Token refresh successful')

        // Invalidate and refetch profile to get updated token expiry
        await queryClient.invalidateQueries(['profile'])
        await queryClient.refetchQueries(['profile'])

        setRefreshMessage({
          type: 'success',
          text: `Token refreshed successfully! New expiry: ${new Date(result.tokenExpiresAt).toLocaleString()}`
        })

        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          setRefreshMessage(null)
        }, 5000)
      } else {
        console.error('Token refresh failed:', result)

        setRefreshMessage({
          type: 'error',
          text: result.error || 'Failed to refresh token',
          needsReconnect: result.needsReconnect
        })

        // If refresh token is invalid, prompt user to reconnect
        if (result.needsReconnect) {
          const reconnect = confirm(
            `${result.error || 'Your refresh token has expired.'}\n\nWould you like to reconnect your eBay account now?`
          )
          if (reconnect) {
            // Disconnect and reset to idle state
            setConnectionStep('idle')
            setRefreshMessage(null)
          }
        }
      }
    } catch (error) {
      console.error('Token refresh error:', error)
      setRefreshMessage({
        type: 'error',
        text: `Failed to refresh token: ${error.message}`
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  // Test connection
  const testConnection = async () => {
    try {
      const response = await fetch('/.netlify/functions/test-ebay-connection', {
        headers: {
          'Authorization': `Bearer ${await userAPI.getAuthToken()}`
        }
      })

      const data = await response.json()

      if (data.success) {
        // Check if we're in a special mode (localStorage, demo, development)
        if (data.environment && data.environment.mode) {
          const mode = data.environment.mode;
          const modeMessages = {
            'localStorage': 'Connection test successful!\n\nNote: You are using localStorage mode. Full eBay integration testing requires database setup.',
            'demo': 'Demo connection test successful!\n\nThis is a simulated connection for demonstration purposes.',
            'development': 'Development mode connection test successful!\n\nFull eBay integration requires production setup.'
          };

          toast.info(modeMessages[mode] || `eBay connection successful! Connected as: ${data.ebayUserId || 'Unknown User'}, Active listings: ${data.activeListings || 0}`);
        } else {
          // Real eBay connection response
          toast.success(`eBay API connection successful! Connected as: ${data.ebayUserId || 'Unknown User'}, Active listings: ${data.activeListings || 0}, Status Code: ${data.statusCode || 200}`);
        }
      } else {
        // Handle different failure scenarios
        let message = data.message || 'Connection test failed';
        if (data.hint) {
          message += '\n\n' + data.hint;
        }
        if (data.needsCredentials) {
          message = '⚠️ ' + message;
        } else if (data.needsConnection) {
          message = '🔌 ' + message;
        } else if (data.needsSetup) {
          message = '🚨 ' + message;
        } else {
          message = '❌ ' + message;
        }
        toast.error(message);
      }
    } catch (error) {
      console.error('Test error:', error)
      toast.error('Failed to test eBay connection. Please check your network connection.')
    }
  }

  if (isLoading || checkingCredentials) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm">
              eB
            </div>
            <div>
              <h3 className="font-medium text-gray-900">eBay Account Connection</h3>
              <p className="text-sm text-gray-600">Connect your eBay seller account to manage listings</p>
            </div>
          </div>
          {connectionStep === 'connected' && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-700">Connected</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {connectionStep === 'needs-setup' && (
          <div className="space-y-6">
            {/* Setup Required Alert */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-2xl">⚠️</div>
                <div className="flex-1">
                  <h4 className="font-medium text-yellow-900">eBay Developer Credentials Required</h4>
                  <p className="text-sm text-yellow-800 mt-1">
                    Before you can connect your eBay account, you need to configure your eBay developer credentials.
                  </p>
                  <p className="text-sm text-yellow-700 mt-2">
                    These are your eBay App ID and Cert ID from the eBay Developers Program.
                  </p>
                </div>
              </div>
            </div>

            {/* Setup Steps */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-gray-900">Two-Step Setup Process:</h4>
              <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                <li><strong>Step 1:</strong> Configure your eBay developer credentials (App ID, Cert ID)</li>
                <li><strong>Step 2:</strong> Authorize this app to access your eBay seller account</li>
              </ol>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Security Note:</strong> Your credentials are stored securely and the OAuth flow uses
                  industry-standard security practices including CSRF protection via state parameters.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              {/* Step 1: Configure Credentials */}
              <div className="text-center">
                <button
                  onClick={() => navigate('/admin-settings')}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors w-full sm:w-auto"
                >
                  Step 1: Configure eBay Credentials
                </button>
                <p className="text-sm text-gray-500 mt-2">
                  Add your eBay App ID, Cert ID, and Dev ID
                </p>
              </div>

              {/* Step 2: OAuth Authorization (available even without credentials for testing) */}
              <div className="text-center">
                <button
                  onClick={connectEbay}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-green-700 transition-colors w-full sm:w-auto"
                >
                  Step 2: Authorize eBay Access
                </button>
                <p className="text-sm text-gray-500 mt-2">
                  Get OAuth refresh token for API access
                </p>
              </div>
            </div>

            {/* Help Link */}
            <div className="border-t pt-4 text-center">
              <a
                href="https://developer.ebay.com/develop/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Need help getting eBay developer credentials?
              </a>
            </div>
          </div>
        )}

        {connectionStep === 'idle' && (
          <div className="space-y-6">
            {/* Current Credentials Status */}
            {credentials && (credentials.hasAppId || credentials.hasCertId) && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-green-900 mb-2">eBay Developer Credentials Configured</h4>
                    <div className="text-sm text-green-700 space-y-1">
                      <p>✓ App ID: {credentials.appId ? `${credentials.appId.substring(0, 10)}...` : 'Configured'}</p>
                      <p>✓ Cert ID: {credentials.certId ? `${credentials.certId.substring(0, 10)}...` : 'Configured'}</p>
                      {credentials.hasDevId && <p>✓ Dev ID: Configured</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/admin-settings')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Edit Credentials
                  </button>
                </div>
              </div>
            )}

            {/* Connection Benefits */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-gray-900">Ready to Connect Your eBay Account</h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Automatically import and sync your eBay listings</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Update prices directly from this dashboard</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Monitor listing performance and analytics</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>Secure OAuth 2.0 connection (no password sharing)</span>
                </li>
              </ul>
            </div>

            {/* Connect Button */}
            <div className="text-center">
              <button
                onClick={connectEbay}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Connect eBay Account
              </button>
              <p className="text-sm text-gray-500 mt-3">
                You'll be redirected to eBay to authorize the connection
              </p>
            </div>

            {/* Help Section */}
            <div className="border-t pt-4">
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showGuide ? 'Hide' : 'Show'} Setup Guide
              </button>

              {showGuide && (
                <div className="mt-4 space-y-4 text-sm text-gray-700">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h5 className="font-medium text-yellow-900 mb-2">Prerequisites</h5>
                    <p>You need an eBay seller account and access to the eBay Developers Program.</p>
                  </div>

                  <div className="space-y-3">
                    <h5 className="font-medium text-gray-900">Quick Setup Steps:</h5>
                    <ol className="space-y-2 list-decimal list-inside">
                      <li>Click "Connect eBay Account" above</li>
                      <li>Log in to your eBay account when prompted</li>
                      <li>Review and accept the permissions</li>
                      <li>You'll be redirected back here automatically</li>
                    </ol>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-900">
                      <strong>Note:</strong> The connection uses OAuth 2.0 for security.
                      Your eBay password is never shared with this application.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {connectionStep === 'connecting' && (
          <div className="text-center py-8">
            <div className="inline-flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-lg text-gray-700">Connecting to eBay...</span>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Please complete the authorization in the eBay window
            </p>
          </div>
        )}

        {connectionStep === 'connected' && (
          <div className="space-y-6">
            {/* Connection Status */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-green-900">eBay Account Connected</h4>
                  <p className="text-sm text-green-700 mt-1">
                    {profile?.ebay_user_id ? `Connected as: ${profile.ebay_user_id}` : 'Your eBay account is successfully connected'}
                  </p>
                  {profile?.ebay_refresh_token_expires_at && (
                    <p className="text-xs text-green-600 mt-2">
                      Refresh token expires: {new Date(profile.ebay_refresh_token_expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="text-3xl">✅</div>
              </div>
            </div>

            {/* Token Refresh Message */}
            {refreshMessage && (
              <div className={`border rounded-lg p-4 ${
                refreshMessage.type === 'success'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start space-x-3">
                  <div className="text-2xl">
                    {refreshMessage.type === 'success' ? '✅' : '⚠️'}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      refreshMessage.type === 'success' ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {refreshMessage.text}
                    </p>
                    {refreshMessage.needsReconnect && (
                      <button
                        onClick={connectEbay}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Reconnect eBay Account
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Token Status - Note: Access tokens are automatically refreshed by the backend */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h5 className="font-medium text-blue-900 mb-2">
                    Token Management
                  </h5>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>
                      Access tokens are automatically managed by the backend using your stored refresh token.
                    </p>
                    {profile?.ebay_refresh_token_expires_at && (
                      <p className="mt-2">
                        Refresh token expires: {new Date(profile.ebay_refresh_token_expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Credentials Info */}
            {credentials && (credentials.hasAppId || credentials.hasCertId) && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="font-medium text-gray-900 mb-2">Developer Credentials</h5>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>App ID: {credentials.appId ? `${credentials.appId.substring(0, 10)}...` : 'Configured'}</p>
                      <p>Cert ID: {credentials.certId ? `${credentials.certId.substring(0, 10)}...` : 'Configured'}</p>
                      {credentials.hasDevId && <p>Dev ID: Configured</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/admin-settings')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Update Credentials
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={testConnection}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Test Connection
              </button>
              <button
                onClick={() => window.location.href = '/listings'}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                View Listings
              </button>
              <button
                onClick={disconnectEbay}
                disabled={isDisconnecting}
                className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>

            {/* Connection Info */}
            <div className="border-t pt-4">
              <h5 className="font-medium text-gray-900 mb-3">Connection Details</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Status:</span>
                  <span className="ml-2 font-medium text-green-600">Active</span>
                </div>
                <div>
                  <span className="text-gray-600">Type:</span>
                  <span className="ml-2 font-medium">OAuth 2.0</span>
                </div>
                <div>
                  <span className="text-gray-600">Permissions:</span>
                  <span className="ml-2 font-medium">Sell.Inventory, Sell.Account</span>
                </div>
                <div>
                  <span className="text-gray-600">Auto-renewal:</span>
                  <span className="ml-2 font-medium">Enabled</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {connectionStep === 'error' && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <div className="text-2xl">❌</div>
                <div>
                  <h4 className="font-medium text-red-900">Connection Failed</h4>
                  <p className="text-sm text-red-700 mt-1">
                    Unable to connect to your eBay account. Please try again.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={connectEbay}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => setConnectionStep('idle')}
                className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}