import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { userAPI } from '../lib/supabase'

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const [loadingCredentials, setLoadingCredentials] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const { register, handleSubmit, setValue } = useForm()

  const onSaveGeneral = (data) => {
    console.log('General settings:', data)
    toast.success('General settings saved')
  }

  const fetchCredentials = async () => {
    try {
      setLoadingCredentials(true)
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/ebay-oauth?action=get-credentials', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()
      setCredentials(data)

      // Pre-fill form if credentials exist
      if (data.appId) setValue('ebayAppId', data.appId)
      if (data.devId) setValue('ebayDevId', data.devId)
      // Note: Don't pre-fill cert_id (it's encrypted, only show if exists)

    } catch (error) {
      console.error('Error fetching credentials:', error)
      toast.error('Failed to load eBay credentials. Please refresh the page.')
    } finally {
      setLoadingCredentials(false)
    }
  }

  const fetchConnectionStatus = async () => {
    try {
      setLoadingStatus(true)
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/ebay-oauth?action=status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()
      setConnectionStatus(data)
    } catch (error) {
      console.error('Error fetching connection status:', error)
      toast.error('Failed to load eBay connection status. Please refresh the page.')
    } finally {
      setLoadingStatus(false)
    }
  }

  const connectEbay = async () => {
    try {
      // Prevent concurrent connection attempts
      if (window.ebayAuthWindow && !window.ebayAuthWindow.closed) {
        window.ebayAuthWindow.focus()
        toast.info('eBay connection window is already open. Please complete the authorization.')
        return
      }

      setConnecting(true)

      // Get OAuth authorization URL from backend
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/ebay-oauth?action=initiate', {
        headers: {
          'Authorization': `Bearer ${token}`
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

        // Check if popup was blocked
        if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
          toast.error('Popup blocked! Please allow popups for this site and try again.')
          setConnecting(false)
          return
        }

        // Store reference to the popup window
        window.ebayAuthWindow = authWindow

        // Allowed origins for security validation
        const allowedOrigins = [
          window.location.origin,
          /^https:\/\/.*\.netlify\.app$/,
          /^http:\/\/localhost(:\d+)?$/
        ]

        // Listen for messages from the popup
        const messageHandler = (event) => {
          // Security: Strict origin validation with exact matching
          const isAllowedOrigin = allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') {
              return event.origin === allowed
            } else if (allowed instanceof RegExp) {
              return allowed.test(event.origin)
            }
            return false
          })

          if (!isAllowedOrigin) {
            console.warn(`Rejected message from untrusted origin: ${event.origin}`)
            return
          }

          if (event.data.type === 'ebay-oauth-success') {
            console.log('eBay OAuth success!', event.data)

            // Clean up listeners and window reference
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.ebayAuthWindow = null

            // Refresh status
            fetchConnectionStatus()
            fetchCredentials()

            toast.success(`Successfully connected to eBay${event.data.ebayUser ? ` as ${event.data.ebayUser}` : ''}!`)
            setConnecting(false)
          } else if (event.data.type === 'ebay-oauth-error') {
            console.error('eBay OAuth error:', event.data)

            // Clean up listeners and window reference
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.ebayAuthWindow = null

            toast.error(`Failed to connect to eBay: ${event.data.error || 'Unknown error'}`)
            setConnecting(false)
          }
        }

        // Add message event listener
        window.addEventListener('message', messageHandler)

        // Check if window was closed without completing OAuth
        const checkClosed = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkClosed)
            window.removeEventListener('message', messageHandler)
            window.ebayAuthWindow = null
            setConnecting(false)
          }
        }, 1000)
      } else {
        throw new Error('Failed to get authorization URL')
      }
    } catch (error) {
      console.error('Connection error:', error)
      toast.error(`Failed to connect to eBay: ${error.message}`)
      setConnecting(false)
    }
  }

  const disconnectEbay = async () => {
    if (!confirm('Are you sure you want to disconnect your eBay account?\n\nThis will remove your OAuth token but keep your developer credentials.')) {
      return
    }

    setDisconnecting(true)

    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/ebay-oauth?action=disconnect', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh status
        await fetchConnectionStatus()
        await fetchCredentials()

        toast.success('eBay account disconnected successfully')
      } else {
        throw new Error(data.error || 'Failed to disconnect')
      }
    } catch (error) {
      console.error('Disconnect error:', error)
      toast.error(`Failed to disconnect: ${error.message}`)
    } finally {
      setDisconnecting(false)
    }
  }

  const testConnection = async () => {
    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/test-ebay-connection', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`eBay API connection successful! Active listings: ${data.activeListings || 0}`)
      } else {
        toast.error(data.message || 'Connection test failed')
      }
    } catch (error) {
      console.error('Test error:', error)
      toast.error('Failed to test eBay connection')
    }
  }

  const onSaveEbay = async (data) => {
    setSaving(true)
    try {
      const token = await userAPI.getAuthToken()
      const response = await fetch('/.netlify/functions/save-ebay-credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: data.ebayAppId,
          cert_id: data.ebayCertId,
          dev_id: data.ebayDevId || null
        })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        toast.success('eBay credentials saved successfully')
        // Refresh credentials
        await fetchCredentials()
      } else {
        throw new Error(result.error || 'Failed to save credentials')
      }
    } catch (error) {
      console.error('Error saving credentials:', error)

      let errorMessage = 'Failed to save credentials'
      if (error.message.includes('Unauthorized')) {
        errorMessage = 'Session expired. Please refresh the page and try again.'
      } else if (error.message.includes('required')) {
        errorMessage = 'App ID and Cert ID are required'
      } else if (error.message) {
        errorMessage = error.message
      }

      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const onSaveNotifications = (data) => {
    console.log('Notification settings:', data)
    toast.success('Notification settings saved')
  }

  useEffect(() => {
    if (activeTab === 'ebay') {
      fetchCredentials()
      fetchConnectionStatus()
    }
  }, [activeTab])

  const tabs = [
    { id: 'general', name: 'General' },
    { id: 'ebay', name: 'eBay Integration' },
    { id: 'notifications', name: 'Notifications' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your eBay price reduction preferences
        </p>
      </div>

      <div className="card">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-ebay-blue text-ebay-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="card-body">
          {/* General Settings */}
          {activeTab === 'general' && (
            <form onSubmit={handleSubmit(onSaveGeneral)} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Default Price Reduction Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="form-group">
                    <label className="form-label">Default Reduction Strategy</label>
                    <select {...register('defaultReductionStrategy')} className="form-input">
                      <option value="fixed_percentage">Fixed Percentage</option>
                      <option value="market_based">Market Based</option>
                      <option value="time_based">Time Based</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Strategy applied to new imported listings
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Reduction Percentage (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      defaultValue="5"
                      {...register('defaultReductionPercentage')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Reduction Interval (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      defaultValue="7"
                      {...register('defaultReductionInterval')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Minimum Price Ratio (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      defaultValue="70"
                      {...register('defaultMinimumPriceRatio')}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Percentage of original price to set as minimum (70% = never go below 70% of original)
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Monitoring Preferences
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="autoEnableMonitoring"
                      defaultChecked
                      {...register('autoEnableMonitoring')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                    />
                    <label htmlFor="autoEnableMonitoring" className="ml-2 text-sm text-gray-700">
                      Automatically enable monitoring for newly imported listings
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="pauseOnWeekends"
                      {...register('pauseOnWeekends')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                    />
                    <label htmlFor="pauseOnWeekends" className="ml-2 text-sm text-gray-700">
                      Pause price reductions on weekends
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="marketAnalysisBeforeReduction"
                      defaultChecked
                      {...register('marketAnalysisBeforeReduction')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                    />
                    <label htmlFor="marketAnalysisBeforeReduction" className="ml-2 text-sm text-gray-700">
                      Perform market analysis before each price reduction
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save General Settings
                </button>
              </div>
            </form>
          )}

          {/* eBay Integration */}
          {activeTab === 'ebay' && (
            <div className="space-y-6">
              {/* Help text for new users */}
              {!credentials?.hasAppId && !loadingCredentials && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Getting Started with eBay Integration</h4>
                  <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                    <li>Get your eBay developer credentials from <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="underline">eBay Developers Program</a></li>
                    <li>Enter your App ID and Cert ID below and click "Save Credentials"</li>
                    <li>Click "Connect eBay Account" to authorize access to your listings</li>
                    <li>Once connected, you can manage your listings and automate price reductions</li>
                  </ol>
                </div>
              )}

              {/* Loading State */}
              {(loadingCredentials || loadingStatus) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="animate-pulse flex space-x-4">
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                  </div>
                </div>
              )}

              {/* Credentials Status */}
              {!loadingCredentials && credentials && (
                <div className={`border rounded-lg p-4 ${
                  credentials.hasAppId && credentials.hasCertId
                    ? 'bg-green-50 border-green-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <h4 className={`font-medium mb-2 ${
                    credentials.hasAppId && credentials.hasCertId
                      ? 'text-green-900'
                      : 'text-yellow-900'
                  }`}>
                    Developer Credentials {credentials.hasAppId && credentials.hasCertId ? 'Configured' : 'Required'}
                  </h4>
                  <div className="text-sm space-y-1">
                    <p className={credentials.hasAppId ? 'text-green-700' : 'text-yellow-700'}>
                      {credentials.hasAppId ? '✓' : '○'} App ID: {credentials.hasAppId ? 'Configured' : 'Not set'}
                    </p>
                    <p className={credentials.hasCertId ? 'text-green-700' : 'text-yellow-700'}>
                      {credentials.hasCertId ? '✓' : '○'} Cert ID: {credentials.hasCertId ? 'Configured' : 'Not set'}
                    </p>
                    {credentials.hasDevId && (
                      <p className="text-green-700">✓ Dev ID: Configured</p>
                    )}
                  </div>
                </div>
              )}

              {/* Connection Status */}
              {!loadingStatus && connectionStatus && (
                <div className={`border rounded-lg p-4 ${
                  connectionStatus.connected
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`font-medium ${
                        connectionStatus.connected ? 'text-green-900' : 'text-gray-900'
                      }`}>
                        eBay Account {connectionStatus.connected ? 'Connected' : 'Not Connected'}
                      </h4>
                      {connectionStatus.connected && connectionStatus.userId && (
                        <p className="text-sm text-green-700 mt-1">
                          Connected as: {connectionStatus.userId}
                        </p>
                      )}
                      {connectionStatus.connected && connectionStatus.refreshTokenExpiresAt && (
                        <p className="text-xs text-green-600 mt-1">
                          Token expires: {new Date(connectionStatus.refreshTokenExpiresAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {connectionStatus.connected && (
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-green-700">Active</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit(onSaveEbay)} className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    eBay API Credentials
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Configure your eBay developer credentials to enable API access.
                    <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="text-ebay-blue hover:text-blue-700 ml-1">
                      Get your credentials here
                    </a>
                  </p>

                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="form-label">App ID (Client ID) *</label>
                      <input
                        type="text"
                        placeholder="Your eBay App ID"
                        {...register('ebayAppId', { required: true })}
                        className="form-input"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Cert ID (Client Secret) *</label>
                      <input
                        type="password"
                        placeholder="Your eBay Cert ID"
                        {...register('ebayCertId', { required: true })}
                        className="form-input"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Dev ID (Optional)</label>
                      <input
                        type="text"
                        placeholder="Your eBay Dev ID (optional)"
                        {...register('ebayDevId')}
                        className="form-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  {/* Show Connect button only if credentials are saved but not connected */}
                  {credentials?.hasAppId && credentials?.hasCertId && !connectionStatus?.connected && (
                    <button
                      type="button"
                      onClick={connectEbay}
                      disabled={connecting}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {connecting ? 'Connecting...' : 'Connect eBay Account'}
                    </button>
                  )}

                  {/* Show Disconnect button if connected */}
                  {connectionStatus?.connected && (
                    <>
                      <button
                        type="button"
                        onClick={testConnection}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Test Connection
                      </button>
                      <button
                        type="button"
                        onClick={disconnectEbay}
                        disabled={disconnecting}
                        className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    </>
                  )}

                  {/* Always show Save Credentials button */}
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Credentials'}
                  </button>
                </div>
              </form>

              {/* Only show sync settings if connected */}
              {connectionStatus?.connected && (
                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Sync Settings
                  </h3>

                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="form-label">Auto-sync Interval (hours)</label>
                      <select {...register('syncInterval')} className="form-input">
                        <option value="1">Every hour</option>
                        <option value="6">Every 6 hours</option>
                        <option value="12">Every 12 hours</option>
                        <option value="24">Daily</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        How often to automatically sync your eBay listings
                      </p>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="autoImportNewListings"
                        defaultChecked
                        {...register('autoImportNewListings')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="autoImportNewListings" className="ml-2 text-sm text-gray-700">
                        Automatically import new eBay listings
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleSubmit(onSaveNotifications)} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Email Notifications
                </h3>

                <div className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      {...register('notificationEmail')}
                      className="form-input"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="priceReductionAlerts"
                        defaultChecked
                        {...register('priceReductionAlerts')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="priceReductionAlerts" className="ml-2 text-sm text-gray-700">
                        Notify when prices are reduced
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="errorAlerts"
                        defaultChecked
                        {...register('errorAlerts')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="errorAlerts" className="ml-2 text-sm text-gray-700">
                        Notify when errors occur
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="weeklyReports"
                        {...register('weeklyReports')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="weeklyReports" className="ml-2 text-sm text-gray-700">
                        Send weekly activity reports
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="marketInsights"
                        {...register('marketInsights')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="marketInsights" className="ml-2 text-sm text-gray-700">
                        Send market analysis insights
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Alert Thresholds
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="form-group">
                    <label className="form-label">Alert when price drops below (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      defaultValue="80"
                      {...register('priceDropThreshold')}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Get notified when a listing's price drops below this percentage of its original price
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Alert when near minimum price (%)</label>
                    <input
                      type="number"
                      min="90"
                      max="100"
                      defaultValue="95"
                      {...register('nearMinimumThreshold')}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Get notified when a listing is close to its minimum price
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save Notification Settings
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}