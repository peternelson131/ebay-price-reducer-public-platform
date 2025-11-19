import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiService, { handleApiError } from '../services/api';

export default function Analytics() {
  const [selectedItem, setSelectedItem] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Get eBay listings for analysis
  const { data: listings, isLoading: listingsLoading } = useQuery(
    ['ebay-listings'],
    () => apiService.getEbayListings(),
    {
      enabled: !apiService.isDemoMode?.(),
      refetchOnWindowFocus: false,
      onError: (error) => {
        console.error('Failed to load listings:', error);
        setNotifications(prev => [...prev, {
          type: 'error',
          message: handleApiError(error, 'Failed to load listings')
        }]);
      }
    }
  );

  // Analyze market for selected item
  const analyzeItemMarket = async (itemId, title) => {
    setLoading(true);
    try {
      const result = await apiService.analyzeMarket(itemId, title);
      setMarketData(result.analysis);
      setNotifications(prev => [...prev, {
        type: 'success',
        message: `Market analysis completed for "${title}"`
      }]);
    } catch (error) {
      setNotifications(prev => [...prev, {
        type: 'error',
        message: handleApiError(error, 'Market analysis failed')
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-dismiss notifications
  useEffect(() => {
    const timer = setTimeout(() => {
      setNotifications(prev => prev.slice(1));
    }, 5000);
    return () => clearTimeout(timer);
  }, [notifications]);

  if (apiService.isDemoMode?.()) {
    return (
      <div className="p-4 sm:p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">Demo Mode - Analytics</h2>
          <p className="text-blue-700">
            Analytics features require eBay API integration. Configure your eBay credentials to access real market data.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Demo Analytics Cards */}
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-2">Market Analysis</h3>
            <p className="text-gray-600 mb-4">Analyze competitor pricing and market trends</p>
            <div className="bg-gray-100 rounded p-3">
              <div className="text-sm text-gray-500">Demo Data</div>
              <div className="text-2xl font-bold text-green-600">$24.99</div>
              <div className="text-sm text-gray-600">Average Market Price</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-2">Price Recommendations</h3>
            <p className="text-gray-600 mb-4">Get optimal pricing suggestions</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Competitive:</span>
                <span className="font-semibold">$23.74</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Aggressive:</span>
                <span className="font-semibold">$21.24</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Quick Sale:</span>
                <span className="font-semibold">$22.49</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-2">Market Insights</h3>
            <p className="text-gray-600 mb-4">Understand market dynamics</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Total Items:</span>
                <span className="font-semibold">47</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Price Range:</span>
                <span className="font-semibold">$15-$35</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Competition:</span>
                <span className="font-semibold text-orange-600">Medium</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Market Analytics</h1>
        <p className="text-gray-600">Analyze market data and optimize your pricing strategy</p>
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 left-4 sm:left-auto max-w-sm sm:max-w-none z-50 space-y-2">
          {notifications.map((notification, index) => (
            <div
              key={index}
              className={`px-4 py-2 rounded-lg shadow-lg ${
                notification.type === 'error'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-green-100 text-green-800'
              }`}
            >
              {notification.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Listings Selection */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Select Item for Analysis</h2>
          </div>
          <div className="p-4">
            {listingsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading listings...</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {listings?.listings?.map((listing) => (
                  <div
                    key={listing.itemId}
                    onClick={() => setSelectedItem(listing)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedItem?.itemId === listing.itemId
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{listing.title}</div>
                    <div className="text-sm text-gray-600">
                      Current Price: ${listing.currentPrice || 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Market Analysis Results */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Market Analysis</h2>
          </div>
          <div className="p-4">
            {selectedItem ? (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="font-medium text-sm truncate">{selectedItem.title}</div>
                  <div className="text-sm text-gray-600">
                    Current Price: ${selectedItem.currentPrice}
                  </div>
                </div>

                <button
                  onClick={() => analyzeItemMarket(selectedItem.itemId, selectedItem.title)}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Analyzing...' : 'Analyze Market'}
                </button>

                {marketData && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="text-sm text-gray-600">Average Price</div>
                        <div className="text-xl font-bold text-green-600">
                          ${marketData.averagePrice}
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-sm text-gray-600">Median Price</div>
                        <div className="text-xl font-bold text-blue-600">
                          ${marketData.medianPrice}
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-sm font-medium mb-2">Price Distribution</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2 text-sm">
                        <div>Low: {marketData.priceDistribution?.low || 0}</div>
                        <div>Medium: {marketData.priceDistribution?.medium || 0}</div>
                        <div>High: {marketData.priceDistribution?.high || 0}</div>
                      </div>
                    </div>

                    {marketData.recommendations && (
                      <div className="bg-yellow-50 rounded-lg p-3">
                        <div className="text-sm font-medium mb-2">Pricing Recommendations</div>
                        <div className="space-y-1 text-sm">
                          <div>Competitive: ${marketData.recommendations.competitive}</div>
                          <div>Aggressive: ${marketData.recommendations.aggressive}</div>
                          <div>Quick Sale: ${marketData.recommendations.quickSale}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Select an item to analyze its market data
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}