import React, { useState, useEffect } from 'react'
import { userAPI } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function AdminSettings() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [credentials, setCredentials] = useState({
    app_id: '',
    cert_id: '',
    dev_id: ''
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [showCertId, setShowCertId] = useState(false)

  useEffect(() => {
    // Check if user is authenticated
    const authState = localStorage.getItem('isAuthenticated')
    if (authState !== 'true') {
      navigate('/login')
      return
    }

    // Get user data from localStorage (following app pattern)
    const userData = localStorage.getItem('userData')
    if (userData) {
      setUser(JSON.parse(userData))
    }

    fetchCredentials()
  }, [navigate])

  const fetchCredentials = async () => {
    setLoading(true)
    try {
      const token = await userAPI.getAuthToken()

      // Get the user's actual stored credentials from the database
      const profile = await userAPI.getProfile()
      if (profile) {
        setCredentials({
          app_id: profile.ebay_app_id || '',
          cert_id: profile.ebay_cert_id || '',
          dev_id: profile.ebay_dev_id || ''
        })

        if (profile.ebay_app_id || profile.ebay_cert_id) {
          setMessage({
            type: 'info',
            text: 'Your eBay credentials are shown below. Update any field and save.'
          })
        }
      }
    } catch (error) {
      console.error('Error fetching credentials:', error)
      setMessage({
        type: 'error',
        text: 'Failed to load credentials. Please refresh the page.'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    // Validate inputs
    if (!credentials.app_id || !credentials.cert_id) {
      setMessage({
        type: 'error',
        text: 'App ID and Cert ID are required. Dev ID is optional.'
      })
      return
    }

    // Check for placeholder values
    if (credentials.app_id === 'YOUR_EBAY_APP_ID' ||
        credentials.cert_id === 'YOUR_EBAY_CERT_ID') {
      setMessage({
        type: 'error',
        text: 'Please enter your actual eBay credentials, not placeholder values.'
      })
      return
    }

    setSaving(true)
    try {
      const token = await userAPI.getAuthToken()
      // Use dedicated endpoint for saving credentials
      const response = await fetch('/.netlify/functions/save-ebay-credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setMessage({
          type: 'success',
          text: 'eBay credentials saved successfully! You can now connect your eBay account.'
        })
        // Redirect to integrations tab after successful save
        setTimeout(() => {
          navigate('/account?tab=integrations')
        }, 2000)
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to save credentials'
        })
      }
    } catch (error) {
      console.error('Error saving credentials:', error)
      setMessage({
        type: 'error',
        text: 'Error saving credentials. Please try again.'
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Settings</h1>
          <div className="bg-white shadow rounded-lg p-6">
            <p className="text-gray-600">Loading credentials...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Settings</h1>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">eBay Developer Credentials</h2>

          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900 mb-2">
              <strong>Important:</strong> These are your eBay Developer Application credentials, not your eBay account login.
            </p>
            <p className="text-sm text-blue-800 mb-2">
              To get these credentials:
            </p>
            <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
              <li>Go to <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="underline">developer.ebay.com</a></li>
              <li>Sign in and go to "My Account" → "Application Keys"</li>
              <li>Create a Production application if you haven't already</li>
              <li>Copy your App ID (Client ID) and Cert ID (Client Secret)</li>
              <li>Set the redirect URI to: <code className="bg-blue-100 px-1">https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth-callback</code></li>
            </ol>
          </div>

          {message.text && (
            <div className={`mb-4 p-3 rounded-lg ${
              message.type === 'success' ? 'bg-green-100 text-green-800' :
              message.type === 'info' ? 'bg-blue-100 text-blue-800' :
              'bg-red-100 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label htmlFor="app_id" className="block text-sm font-medium text-gray-700 mb-1">
                App ID (Client ID) *
              </label>
              <input
                type="text"
                id="app_id"
                value={credentials.app_id}
                onChange={(e) => setCredentials({ ...credentials, app_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter your eBay App ID"
                required
              />
            </div>

            <div>
              <label htmlFor="cert_id" className="block text-sm font-medium text-gray-700 mb-1">
                Cert ID (Client Secret) *
              </label>
              <div className="relative">
                <input
                  type={showCertId ? 'text' : 'password'}
                  id="cert_id"
                  value={credentials.cert_id}
                  onChange={(e) => setCredentials({ ...credentials, cert_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                  placeholder="Enter your eBay Cert ID"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCertId(!showCertId)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-600 hover:text-gray-800"
                >
                  {showCertId ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="dev_id" className="block text-sm font-medium text-gray-700 mb-1">
                Dev ID (Optional)
              </label>
              <input
                type="text"
                id="dev_id"
                value={credentials.dev_id}
                onChange={(e) => setCredentials({ ...credentials, dev_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter your eBay Dev ID (optional)"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {saving ? 'Saving...' : (credentials.app_id || credentials.cert_id) ? 'Update Credentials' : 'Save Credentials'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Security Note</h3>
            <p className="text-sm text-gray-600">
              Your credentials are encrypted and stored securely in the database. They are only accessible
              by the backend services and are never exposed to the frontend after saving.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}