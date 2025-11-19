import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import EbayConnectionModal from '../components/EbayConnectionModal';
import { supabase } from '../lib/supabase';

export default function EbaySetup() {
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [connectionData, setConnectionData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkUser();

    // Check for eBay connection success callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ebay_connected') === 'true') {
      // Show success message and refresh status
      setTimeout(() => {
        checkConnectionStatus();
      }, 1000);
    }
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      await checkConnectionStatus();
    }
  };

  const checkConnectionStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/.netlify/functions/ebay-oauth?action=status`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        setConnectionData(result);
        setConnectionStatus(result.connected ? 'connected' : 'disconnected');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (err) {
      console.error('Error checking connection status:', err);
      setConnectionStatus('disconnected');
    }
  };

  const handleConnect = () => {
    setIsModalOpen(true);
  };

  const handleRefresh = async () => {
    setLoading(true);
    await checkConnectionStatus();
    setLoading(false);
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-gray-600">Please log in to connect your eBay account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">eBay Account Connection</h1>
        <p className="text-gray-600">
          Connect your eBay seller account to enable automated price management for your listings.
        </p>
      </div>

      {/* Connection Status Card */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Connection Status</h2>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        {connectionStatus === 'checking' && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Checking connection status...</span>
          </div>
        )}

        {connectionStatus === 'connected' && connectionData && (
          <div className="space-y-4">
            <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircleIcon className="h-6 w-6 text-green-500 mr-3" />
              <div>
                <p className="font-medium text-green-800">eBay Account Connected</p>
                <p className="text-sm text-green-600">
                  Connected on {new Date(connectionData.connectedAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 mb-1">eBay User ID</h3>
                <p className="text-sm text-gray-600">{connectionData.ebayUserId || 'N/A'}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Token Status</h3>
                <p className={`text-sm font-medium ${connectionData.tokenValid ? 'text-green-600' : 'text-red-600'}`}>
                  {connectionData.tokenValid ? 'Valid' : 'Expired'}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 mb-1">Refresh Token Expires</h3>
                <p className="text-sm text-gray-600">
                  {connectionData.refreshTokenExpiresAt ?
                    new Date(connectionData.refreshTokenExpiresAt).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleConnect}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                <Cog6ToothIcon className="h-4 w-4 inline mr-2" />
                Manage Connection
              </button>
            </div>
          </div>
        )}

        {connectionStatus === 'disconnected' && (
          <div className="text-center py-8">
            <div className="mx-auto h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <ExclamationTriangleIcon className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No eBay Account Connected</h3>
            <p className="text-gray-600 mb-6">
              Connect your eBay seller account to start managing your listings and automating price reductions.
            </p>
            <button
              onClick={handleConnect}
              className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700"
            >
              Connect eBay Account
            </button>
          </div>
        )}
      </div>

      {/* Features Overview */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">What you can do with eBay integration:</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-blue-500 text-white">
                📊
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Import Listings</h3>
              <p className="text-sm text-gray-600">
                Automatically sync all your active eBay listings into the dashboard.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-green-500 text-white">
                💰
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Price Management</h3>
              <p className="text-sm text-gray-600">
                Automatically adjust prices based on your configured strategies.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-purple-500 text-white">
                📈
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Market Analysis</h3>
              <p className="text-sm text-gray-600">
                Get insights into pricing trends and competitor analysis.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-yellow-500 text-white">
                🔄
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Automated Updates</h3>
              <p className="text-sm text-gray-600">
                Real-time synchronization of listing changes and price updates.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-red-500 text-white">
                📋
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Performance Tracking</h3>
              <p className="text-sm text-gray-600">
                Monitor the effectiveness of your price reduction strategies.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-indigo-500 text-white">
                🔒
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Secure Connection</h3>
              <p className="text-sm text-gray-600">
                Your eBay credentials are never stored. We use secure OAuth tokens.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <CheckCircleIcon className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Security & Privacy</h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-disc list-inside space-y-1">
                <li>We never store your eBay password or login credentials</li>
                <li>All connections use secure OAuth 2.0 tokens</li>
                <li>You can disconnect your account at any time</li>
                <li>We only access the data you explicitly authorize</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* eBay Connection Modal */}
      <EbayConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={user}
      />
    </div>
  );
}