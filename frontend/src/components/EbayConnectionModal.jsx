import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';

export default function EbayConnectionModal({ isOpen, onClose, user }) {
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [connectionData, setConnectionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && user) {
      checkConnectionStatus();
    }
  }, [isOpen, user]);

  const checkConnectionStatus = async () => {
    try {
      setError(null);
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
        setError('Failed to check connection status');
      }
    } catch (err) {
      console.error('Error checking connection status:', err);
      setConnectionStatus('disconnected');
      setError('Failed to check connection status');
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/.netlify/functions/ebay-oauth?action=auth-url`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        // Redirect to eBay OAuth
        window.location.href = result.authUrl;
      } else {
        setError('Failed to generate authorization URL');
      }
    } catch (err) {
      console.error('Error connecting to eBay:', err);
      setError('Failed to connect to eBay');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/.netlify/functions/ebay-oauth`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        setConnectionStatus('disconnected');
        setConnectionData(null);
      } else {
        setError('Failed to disconnect eBay account');
      }
    } catch (err) {
      console.error('Error disconnecting eBay:', err);
      setError('Failed to disconnect eBay account');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshToken = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/.netlify/functions/ebay-oauth`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'refresh-token' })
      });

      const result = await response.json();

      if (result.success) {
        await checkConnectionStatus(); // Refresh the status
      } else {
        setError('Failed to refresh token');
      }
    } catch (err) {
      console.error('Error refreshing token:', err);
      setError('Failed to refresh token');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">eBay Account Connection</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Connection Status */}
          {connectionStatus === 'checking' && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">Checking connection status...</p>
            </div>
          )}

          {connectionStatus === 'connected' && connectionData && (
            <div className="space-y-4">
              <div className="flex items-center p-3 bg-green-50 border border-green-200 rounded-md">
                <CheckCircleIcon className="h-5 w-5 text-green-400" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">eBay Account Connected</p>
                  <p className="text-xs text-green-600">
                    Connected on {new Date(connectionData.connectedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-md space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">eBay User ID:</span>
                  <span className="font-medium">{connectionData.ebayUserId || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Token Status:</span>
                  <span className={`font-medium ${connectionData.tokenValid ? 'text-green-600' : 'text-red-600'}`}>
                    {connectionData.tokenValid ? 'Valid' : 'Expired'}
                  </span>
                </div>
                {connectionData.refreshTokenExpiresAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Refresh Token Expires:</span>
                    <span className="font-medium">
                      {new Date(connectionData.refreshTokenExpiresAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {!connectionData.tokenValid && (
                  <button
                    onClick={handleRefreshToken}
                    disabled={loading}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Refreshing...' : 'Refresh Token'}
                  </button>
                )}

                <button
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="w-full bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Disconnecting...' : 'Disconnect eBay Account'}
                </button>
              </div>
            </div>
          )}

          {connectionStatus === 'disconnected' && (
            <div className="space-y-4">
              <div className="text-center py-6">
                <div className="mx-auto h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h3 className="mt-3 text-sm font-medium text-gray-900">No eBay Account Connected</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Connect your eBay account to start managing your listings and automating price reductions.
                </p>
              </div>

              <div className="bg-blue-50 p-4 rounded-md">
                <h4 className="text-sm font-medium text-blue-800 mb-2">What you'll get:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Access to your eBay listings</li>
                  <li>• Automated price reduction strategies</li>
                  <li>• Real-time market analysis</li>
                  <li>• Performance tracking and analytics</li>
                </ul>
              </div>

              <button
                onClick={handleConnect}
                disabled={loading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Connecting...' : 'Connect eBay Account'}
              </button>

              <p className="text-xs text-gray-500 text-center">
                This will redirect you to eBay to authorize the connection.
                Your eBay credentials are never stored by our application.
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}