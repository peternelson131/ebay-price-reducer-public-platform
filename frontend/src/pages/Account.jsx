import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { userAPI, authAPI } from '../lib/supabase'
import keepaApi from '../services/keepaApi'
import EbayConnect from '../components/EbayConnect'

export default function Account() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('profile')
  const [isEditing, setIsEditing] = useState(false)
  const [profileData, setProfileData] = useState({})
  const [isEditingPreferences, setIsEditingPreferences] = useState(false)
  const [preferencesData, setPreferencesData] = useState({})
  const [keepaCredentials, setKeepaCredentials] = useState({
    api_key: ''
  })
  const [keepaTestStatus, setKeepaTestStatus] = useState(null)
  const [keepaTestLoading, setKeepaTestLoading] = useState(false)
  const [keepaConnectionStatus, setKeepaConnectionStatus] = useState(null)
  const [connectionStatusLoading, setConnectionStatusLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    ebay: false,
    keepa: false,
    other: false
  })
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [ebayConnectionMessage, setEbayConnectionMessage] = useState(null)
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery(
    ['profile'],
    () => userAPI.getProfile(),
    {
      refetchOnWindowFocus: false
    }
  )

  // Initialize form states when profile data loads
  useEffect(() => {
    if (profile && !isEditing) {
      setProfileData({
        name: profile.name || '',
        default_reduction_strategy: profile.default_reduction_strategy || 'fixed_percentage',
        default_reduction_percentage: profile.default_reduction_percentage || 5,
        default_reduction_interval: profile.default_reduction_interval || 7
      })
    }
  }, [profile, isEditing])

  useEffect(() => {
    if (profile && !isEditingPreferences) {
      setPreferencesData({
        email_notifications: profile.email_notifications ?? true,
        price_reduction_alerts: profile.price_reduction_alerts ?? true
      })
    }
  }, [profile, isEditingPreferences])

  // Handle tab query parameter
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['profile', 'preferences', 'security', 'billing', 'integrations'].includes(tab)) {
      setActiveTab(tab)
      // If navigating to integrations tab, expand the eBay section by default
      if (tab === 'integrations') {
        setExpandedSections(prev => ({ ...prev, ebay: true }))
      }
    }
  }, [searchParams])

  // Handle eBay OAuth callback
  useEffect(() => {
    const ebayConnected = searchParams.get('ebay_connected')
    const ebayUser = searchParams.get('ebay_user')
    const error = searchParams.get('error')

    if (ebayConnected === 'true') {
      setEbayConnectionMessage({
        type: 'success',
        text: `Successfully connected to eBay${ebayUser ? ` as ${ebayUser}` : ''}! Your account is now linked and ready to manage listings.`
      })
      setActiveTab('integrations')
      setExpandedSections(prev => ({ ...prev, ebay: true }))

      // Refresh profile to get updated eBay connection status
      queryClient.invalidateQueries(['profile'])

      // Clear the URL parameters after showing the message
      setTimeout(() => {
        setSearchParams({})
      }, 100)

      // Auto-hide success message after 10 seconds
      setTimeout(() => {
        setEbayConnectionMessage(null)
      }, 10000)
    } else if (error) {
      const errorDetails = searchParams.get('details')
      setEbayConnectionMessage({
        type: 'error',
        text: `Failed to connect to eBay: ${errorDetails || error}. Please try again.`
      })
      setActiveTab('integrations')
      setExpandedSections(prev => ({ ...prev, ebay: true }))

      // Clear the URL parameters
      setTimeout(() => {
        setSearchParams({})
      }, 100)

      // Auto-hide error message after 10 seconds
      setTimeout(() => {
        setEbayConnectionMessage(null)
      }, 10000)
    }
  }, [searchParams, queryClient, setSearchParams])

  // Test Keepa connection on profile load if API key exists
  useEffect(() => {
    if (profile?.keepa_api_key && !keepaConnectionStatus && !connectionStatusLoading) {
      // Add a small delay to ensure UI is ready
      const timer = setTimeout(() => {
        handleTestKeepaConnection()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [profile?.keepa_api_key])

  const updateProfileMutation = useMutation(
    (updates) => userAPI.updateProfile(updates),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['profile'])
        setIsEditing(false)
        alert('Profile updated successfully!')
      },
      onError: (error) => {
        alert('Failed to update profile: ' + error.message)
      }
    }
  )

  const updatePreferencesMutation = useMutation(
    (updates) => userAPI.updateProfile(updates),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['profile'])
        setIsEditingPreferences(false)
        alert('Preferences updated successfully!')
      },
      onError: (error) => {
        alert('Failed to update preferences: ' + error.message)
      }
    }
  )


  const handleProfileSave = () => {
    updateProfileMutation.mutate(profileData)
  }

  const handlePreferencesSave = () => {
    updatePreferencesMutation.mutate(preferencesData)
  }


  const handleSaveKeepaCredentials = async () => {
    if (!keepaCredentials.api_key) {
      alert('Please enter an API key')
      return
    }

    try {
      setKeepaTestLoading(true)
      setKeepaTestStatus(null)

      // Save and validate the API key
      const result = await keepaApi.saveApiKey(keepaCredentials.api_key)

      if (result.success) {
        queryClient.invalidateQueries(['profile'])
        setKeepaTestStatus({
          success: true,
          message: `API key saved successfully! Tokens available: ${result.validation?.tokensLeft || 'Unknown'}`,
          tokensLeft: result.validation?.tokensLeft
        })

        // Clear the input field after successful save
        setKeepaCredentials({ api_key: '' })

        // Test connection after successful save to update status
        await handleTestKeepaConnection()

        alert('Keepa API key saved and validated successfully!')
      } else {
        setKeepaTestStatus({
          success: false,
          message: result.message || 'Failed to save API key'
        })
      }
    } catch (error) {
      setKeepaTestStatus({
        success: false,
        message: error.message || 'Failed to save API key'
      })
      alert('Failed to save Keepa API key: ' + error.message)
    } finally {
      setKeepaTestLoading(false)
    }
  }

  const handleTestKeepaConnection = async () => {
    try {
      setConnectionStatusLoading(true)
      setKeepaConnectionStatus(null)
      setKeepaTestLoading(true)
      setKeepaTestStatus(null)

      const result = await keepaApi.testConnection()

      setKeepaTestStatus({
        success: result.success,
        message: result.message,
        tokensLeft: result.tokensLeft,
        details: result.details
      })

      setKeepaConnectionStatus({
        connected: result.connected,
        success: result.success,
        tokensLeft: result.tokensLeft,
        message: result.message
      })

      // Only show alert for failures, not success
      if (!result.success) {
        alert(`Keepa connection failed: ${result.message}`)
      }
    } catch (error) {
      setKeepaTestStatus({
        success: false,
        message: error.message || 'Connection test failed'
      })
      setKeepaConnectionStatus({
        connected: false,
        success: false,
        message: error.message || 'Connection test failed'
      })
      alert('Connection test failed: ' + error.message)
    } finally {
      setKeepaTestLoading(false)
      setConnectionStatusLoading(false)
    }
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }


  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match')
      return
    }

    if (passwordData.newPassword.length < 6) {
      alert('Password must be at least 6 characters long')
      return
    }

    try {
      const { error } = await authAPI.updatePassword(passwordData.newPassword)

      if (error) {
        throw error
      }

      alert('Password updated successfully!')
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (error) {
      alert('Failed to update password: ' + error.message)
    }
  }

  const handleDeleteAccount = async () => {
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      if (window.confirm('This will permanently delete all your listings and data. Are you absolutely sure?')) {
        alert('Account deletion would be processed. In demo mode, this is simulated.')
      }
    }
  }

  const handleExportData = () => {
    // Simulate data export
    const exportData = {
      profile: profile,
      exportDate: new Date().toISOString(),
      listings: 3, // From our mock data
      priceHistory: 'Available'
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ebay-price-reducer-data.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: '👤' },
    { id: 'preferences', name: 'Preferences', icon: '⚙️' },
    { id: 'security', name: 'Security', icon: '🔒' },
    { id: 'billing', name: 'Billing', icon: '💳' },
    { id: 'integrations', name: 'Integrations', icon: '🔗' }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account settings and preferences</p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Mobile Tab Selector */}
        <div className="sm:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full px-4 py-3 text-base border-b border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.icon} {tab.name}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop Tab Navigation */}
        <div className="hidden sm:block border-b border-gray-200">
          <nav className="flex flex-wrap" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-4 sm:px-6 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className="hidden md:inline">{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Profile Information</h3>
                <p className="text-sm text-gray-600">Update your account profile information.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profileData.name || profile?.name || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  ) : (
                    <div className="text-gray-900">{profile?.name || 'Not set'}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <div className="text-gray-900">{profile?.email || 'Not available'}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Reduction Strategy</label>
                  {isEditing ? (
                    <select
                      value={profileData.default_reduction_strategy || profile?.default_reduction_strategy || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_strategy: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="fixed_percentage">Fixed Percentage</option>
                      <option value="market_based">Market Based</option>
                      <option value="time_based">Time Based</option>
                    </select>
                  ) : (
                    <div className="text-gray-900 capitalize">
                      {profile?.default_reduction_strategy?.replace('_', ' ') || 'Fixed Percentage'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Reduction Percentage</label>
                  {isEditing ? (
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={profileData.default_reduction_percentage || profile?.default_reduction_percentage || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_percentage: parseInt(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  ) : (
                    <div className="text-gray-900">{profile?.default_reduction_percentage || 5}%</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Reduction Interval (Days)</label>
                  {isEditing ? (
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={profileData.default_reduction_interval || profile?.default_reduction_interval || ''}
                      onChange={(e) => setProfileData(prev => ({ ...prev, default_reduction_interval: parseInt(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  ) : (
                    <div className="text-gray-900">{profile?.default_reduction_interval || 7} days</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleProfileSave}
                      disabled={updateProfileMutation.isLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Edit Profile
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Preferences</h3>
                <p className="text-sm text-gray-600">Customize your application preferences.</p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b sm:border-0">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Email Notifications</label>
                    <p className="text-sm text-gray-600">Receive general email notifications</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEditingPreferences ? (preferencesData.email_notifications ?? profile?.email_notifications ?? true) : (profile?.email_notifications ?? true)}
                    onChange={(e) => {
                      if (isEditingPreferences) {
                        setPreferencesData(prev => ({ ...prev, email_notifications: e.target.checked }))
                      }
                    }}
                    disabled={!isEditingPreferences}
                    className="h-4 w-4 text-blue-600"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b sm:border-0">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Price Reduction Alerts</label>
                    <p className="text-sm text-gray-600">Receive alerts when prices are automatically reduced</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEditingPreferences ? (preferencesData.price_reduction_alerts ?? profile?.price_reduction_alerts ?? true) : (profile?.price_reduction_alerts ?? true)}
                    onChange={(e) => {
                      if (isEditingPreferences) {
                        setPreferencesData(prev => ({ ...prev, price_reduction_alerts: e.target.checked }))
                      }
                    }}
                    disabled={!isEditingPreferences}
                    className="h-4 w-4 text-blue-600"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {isEditingPreferences ? (
                  <>
                    <button
                      onClick={handlePreferencesSave}
                      disabled={updatePreferencesMutation.isLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setIsEditingPreferences(false)}
                      className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditingPreferences(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Edit Preferences
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Security Settings</h3>
                <p className="text-sm text-gray-600">Manage your account security and password.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <button
                  onClick={handlePasswordChange}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Update Password
                </button>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Billing & Subscription</h3>
                <p className="text-sm text-gray-600">Manage your subscription and billing information.</p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      {profile?.subscription_plan ? profile.subscription_plan.charAt(0).toUpperCase() + profile.subscription_plan.slice(1) : 'Free'} Plan
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>You're currently on the {profile?.subscription_plan || 'free'} plan with up to {profile?.listing_limit || 10} listings.</p>
                      {profile?.subscription_active === false && (
                        <p className="text-red-600 mt-1">⚠️ Subscription inactive</p>
                      )}
                      {profile?.subscription_expires_at && (
                        <p className="mt-1">Expires: {new Date(profile.subscription_expires_at).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900">Starter</h4>
                  <div className="text-2xl font-bold text-gray-900 mt-2">$9/mo</div>
                  <ul className="text-sm text-gray-600 mt-4 space-y-2">
                    <li>• Up to 50 listings</li>
                    <li>• Basic strategies</li>
                    <li>• Email support</li>
                  </ul>
                </div>

                <div className="border border-blue-500 rounded-lg p-4 relative">
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-2 py-1 text-xs rounded">Popular</span>
                  </div>
                  <h4 className="font-medium text-gray-900">Professional</h4>
                  <div className="text-2xl font-bold text-gray-900 mt-2">$29/mo</div>
                  <ul className="text-sm text-gray-600 mt-4 space-y-2">
                    <li>• Up to 500 listings</li>
                    <li>• Advanced strategies</li>
                    <li>• Market analysis</li>
                    <li>• Priority support</li>
                  </ul>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900">Enterprise</h4>
                  <div className="text-2xl font-bold text-gray-900 mt-2">$99/mo</div>
                  <ul className="text-sm text-gray-600 mt-4 space-y-2">
                    <li>• Unlimited listings</li>
                    <li>• Custom strategies</li>
                    <li>• API access</li>
                    <li>• Dedicated support</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Platform Integrations</h3>
                <p className="text-sm text-gray-600">Connect your accounts and configure API access for various platforms.</p>
              </div>

              {/* Quick Link to Listing Settings */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900 mb-1">📋 eBay Listing Settings</h4>
                    <p className="text-sm text-blue-700 mb-3">
                      Configure default business policies, shipping location, and Keepa API settings for creating eBay listings.
                    </p>
                    <Link
                      to="/listing-settings"
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Open Listing Settings →
                    </Link>
                  </div>
                </div>
              </div>

              {/* eBay Connection Success/Error Message */}
              {ebayConnectionMessage && (
                <div className={`p-4 rounded-lg ${
                  ebayConnectionMessage.type === 'success'
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      {ebayConnectionMessage.type === 'success' ? (
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium">{ebayConnectionMessage.text}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* eBay Integration - Collapsible */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('ebay')}
                  className="w-full px-6 py-4 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm">
                      eB
                    </div>
                    <div className="text-left">
                      <h4 className="font-medium text-gray-900">eBay Developer Integration</h4>
                      <p className="text-sm text-gray-600">Connect to eBay for automatic price updates</p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedSections.ebay ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedSections.ebay && (
                  <div className="p-6 border-t border-gray-200">
                    <EbayConnect />
                  </div>
                )}
              </div>

              {/* Keepa Integration - Collapsible */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('keepa')}
                  className="w-full px-6 py-4 bg-orange-50 hover:bg-orange-100 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-orange-600 rounded flex items-center justify-center text-white font-bold text-sm">
                      K
                    </div>
                    <div className="text-left">
                      <h4 className="font-medium text-gray-900">Keepa Integration</h4>
                      <p className="text-sm text-gray-600">Amazon market data and price tracking</p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedSections.keepa ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedSections.keepa && (
                  <div className="p-6 space-y-6 border-t border-gray-200">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">What is Keepa?</h4>
                      <p className="text-sm text-gray-600">
                        Keepa is a powerful Amazon price tracker that provides historical price data, product research tools,
                        and market insights. Integrate Keepa to analyze Amazon market trends and optimize your eBay pricing strategy.
                      </p>
                    </div>

                    {/* Step 1: Create Keepa Account */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                      <h5 className="font-medium text-gray-900 text-base mb-3">Step 1: Create Your Keepa Account</h5>
                      <div className="space-y-3 text-sm text-gray-700">
                        <p>1. Visit <a href="https://keepa.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Keepa.com</a></p>
                        <p>2. Click "Register" in the top right corner</p>
                        <p>3. Fill in your email address and create a secure password</p>
                        <p>4. Verify your email address through the confirmation link</p>
                        <p>5. Log in to your new Keepa account</p>
                      </div>
                    </div>

                    {/* Step 2: Subscribe to API Access */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                      <h5 className="font-medium text-gray-900 text-base mb-3">Step 2: Subscribe to API Access</h5>
                      <div className="space-y-3 text-sm text-gray-700">
                        <p>Keepa API access requires a subscription. Choose a plan that fits your needs:</p>
                        <div className="ml-4 space-y-2">
                          <p>• <strong>Data API:</strong> €49/month - Ideal for price tracking and market analysis</p>
                          <p>• <strong>Product API:</strong> €89/month - Includes product finder and advanced features</p>
                          <p>• <strong>Enterprise:</strong> Custom pricing - High-volume access</p>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                          <p className="text-yellow-800 text-sm">
                            <strong>Note:</strong> API access is billed monthly. You can cancel anytime.
                            Each plan includes 100,000 tokens per month (1 token ≈ 1 product lookup).
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Generate API Key */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                      <h5 className="font-medium text-gray-900 text-base mb-3">Step 3: Generate Your API Key</h5>
                      <div className="space-y-3 text-sm text-gray-700">
                        <p>After subscribing to API access:</p>
                        <div className="space-y-2">
                          <p>1. Log in to your Keepa account</p>
                          <p>2. Navigate to <strong>Account → API Access</strong></p>
                          <p>3. Click <strong>"Generate New API Key"</strong></p>
                          <p>4. Give your API key a descriptive name (e.g., "eBay Price Reducer")</p>
                          <p>5. Set usage limits if desired (optional)</p>
                          <p>6. Click <strong>"Create API Key"</strong></p>
                          <p>7. <strong className="text-red-600">Important:</strong> Copy your API key immediately - it won't be shown again!</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-3">
                          <p className="text-blue-800 text-sm">
                            <strong>Tip:</strong> Store your API key securely. You can regenerate it if lost,
                            but this will invalidate the old key.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Step 4: Enter API Key */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                      <h5 className="font-medium text-gray-900 text-base mb-4">Step 4: Enter Your Keepa API Key</h5>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                          <input
                            type="password"
                            placeholder={profile?.keepa_api_key ? "••••••••••••••••••••••••••••••••" : "Enter your Keepa API key"}
                            value={keepaCredentials.api_key}
                            onChange={(e) => setKeepaCredentials({ api_key: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          />
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-500">
                              Your API key should be 64 characters long and contain letters and numbers.
                            </p>
                            {profile?.keepa_api_key && (
                              <span className="text-xs text-green-600 font-medium">
                                ✓ API key configured
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            onClick={handleSaveKeepaCredentials}
                            disabled={keepaTestLoading}
                            className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700 disabled:opacity-50 w-full sm:w-auto"
                          >
                            {keepaTestLoading ? 'Saving...' : profile?.keepa_api_key ? 'Update API Key' : 'Save API Key'}
                          </button>
                          <button
                            onClick={handleTestKeepaConnection}
                            disabled={keepaTestLoading}
                            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50 w-full sm:w-auto"
                          >
                            {keepaTestLoading ? 'Testing...' : 'Test Connection'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* API Features */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                      <h5 className="font-medium text-gray-900 text-base mb-3">What You Can Do With Keepa API</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <h6 className="font-medium text-gray-900 mb-2">Price History</h6>
                          <ul className="space-y-1 text-gray-600">
                            <li>• Historical price data</li>
                            <li>• Sales rank tracking</li>
                            <li>• Price drop alerts</li>
                            <li>• Lightning deals data</li>
                          </ul>
                        </div>
                        <div>
                          <h6 className="font-medium text-gray-900 mb-2">Product Research</h6>
                          <ul className="space-y-1 text-gray-600">
                            <li>• Product finder</li>
                            <li>• Category best sellers</li>
                            <li>• Competitor analysis</li>
                            <li>• Review count tracking</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Connection Status */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {connectionStatusLoading ? (
                            <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse"></div>
                          ) : (
                            <div className={`w-3 h-3 rounded-full ${
                              keepaConnectionStatus?.connected
                                ? 'bg-green-500'
                                : profile?.keepa_api_key
                                ? 'bg-red-500'
                                : 'bg-gray-400'
                            }`}></div>
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            Keepa API Status: {
                              connectionStatusLoading
                                ? 'Checking...'
                                : keepaConnectionStatus?.connected
                                ? 'Connected'
                                : profile?.keepa_api_key
                                ? 'Connection Failed'
                                : 'Not Connected'
                            }
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 text-right">
                          {connectionStatusLoading ? (
                            'Testing connection...'
                          ) : keepaConnectionStatus?.connected ? (
                            <>
                              <div>Tokens left: {keepaConnectionStatus.tokensLeft || 'Unknown'}</div>
                              <div>API key configured</div>
                            </>
                          ) : profile?.keepa_api_key ? (
                            <>
                              <div>API key configured</div>
                              <div className="text-red-500">{keepaConnectionStatus?.message || 'Connection test needed'}</div>
                            </>
                          ) : (
                            'No API key'
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Additional Resources */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                      <h5 className="font-medium text-gray-900 text-base mb-3">Keepa Resources</h5>
                      <div className="space-y-2 text-sm">
                        <p>• <a href="https://keepa.com/#!api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">API Documentation</a></p>
                        <p>• <a href="https://keepa.com/#!discuss/t/api-documentation/1295" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">API Forums & Support</a></p>
                        <p>• <a href="https://keepa.com/#!addon" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Browser Extension</a></p>
                        <p>• <a href="https://keepa.com/#!pricing" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Pricing Plans</a></p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Other Integrations - Collapsible */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('other')}
                  className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center text-white font-bold text-sm">
                      ⚙️
                    </div>
                    <div className="text-left">
                      <h4 className="font-medium text-gray-900">Other Integrations</h4>
                      <p className="text-sm text-gray-600">Additional tools and export options</p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedSections.other ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedSections.other && (
                  <div className="p-6 space-y-4 border-t border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-red-600 rounded flex items-center justify-center text-white font-bold">
                          📧
                        </div>
                        <div>
                          <h5 className="font-medium text-gray-900">Email Notifications</h5>
                          <p className="text-sm text-gray-600">Receive alerts and reports via email</p>
                        </div>
                      </div>
                      <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full sm:w-auto">
                        Configure
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-purple-600 rounded flex items-center justify-center text-white font-bold">
                          📊
                        </div>
                        <div>
                          <h5 className="font-medium text-gray-900">Analytics Export</h5>
                          <p className="text-sm text-gray-600">Export data to Google Sheets or CSV</p>
                        </div>
                      </div>
                      <button className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 w-full sm:w-auto">
                        Setup
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-green-600 rounded flex items-center justify-center text-white font-bold">
                          🔄
                        </div>
                        <div>
                          <h5 className="font-medium text-gray-900">Webhooks</h5>
                          <p className="text-sm text-gray-600">Send real-time updates to external services</p>
                        </div>
                      </div>
                      <button className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 w-full sm:w-auto">
                        Coming Soon
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded flex items-center justify-center text-white font-bold">
                          🤖
                        </div>
                        <div>
                          <h5 className="font-medium text-gray-900">Zapier Integration</h5>
                          <p className="text-sm text-gray-600">Connect to 5,000+ apps via Zapier</p>
                        </div>
                      </div>
                      <button className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 w-full sm:w-auto">
                        Coming Soon
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data & Privacy Section */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Data & Privacy</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportData}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Export My Data
          </button>
          <button
            onClick={handleDeleteAccount}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )
}