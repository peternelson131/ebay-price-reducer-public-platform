import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listingsAPI } from '../lib/supabase'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const [editingListing, setEditingListing] = useState(null)
  const [priceDropSettings, setPriceDropSettings] = useState({})
  const queryClient = useQueryClient()

  const { data: listings, isLoading } = useQuery(
    ['listings'],
    () => listingsAPI.getListings()
  )

  const updateListingMutation = useMutation(
    ({ id, updates }) => listingsAPI.updateListing(id, updates),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['listings'])
        setEditingListing(null)
        alert('Listing updated successfully!')
      },
      onError: (error) => {
        alert('Failed to update listing: ' + error.message)
      }
    }
  )

  const handleApplyPriceDropRule = (listingId) => {
    const settings = priceDropSettings[listingId]
    if (!settings) {
      alert('Please configure price drop settings first')
      return
    }

    updateListingMutation.mutate({
      id: listingId,
      updates: {
        price_reduction_enabled: true,
        reduction_strategy: settings.strategy,
        reduction_percentage: settings.percentage,
        minimum_price: settings.minimumPrice,
        reduction_interval: settings.interval
      }
    })
  }

  const handleSettingsChange = (listingId, field, value) => {
    setPriceDropSettings(prev => ({
      ...prev,
      [listingId]: {
        ...prev[listingId],
        [field]: value
      }
    }))
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>
  }

  const stats = [
    {
      name: 'Total Listings',
      value: listings?.total || 0,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      name: 'Active Monitoring',
      value: listings?.listings?.filter(l => l.price_reduction_enabled).length || 0,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      name: 'Total Value',
      value: listings?.listings ?
        `$${listings.listings.reduce((sum, l) => sum + l.current_price, 0).toFixed(2)}` :
        '$0',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      name: 'Potential Savings',
      value: listings?.listings ?
        `$${listings.listings.reduce((sum, l) => sum + (l.current_price - l.minimum_price), 0).toFixed(2)}` :
        '$0',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">eBay Price Reducer Dashboard</h1>
        <p className="text-gray-600 mt-2">Configure price drop rules and manage your eBay listings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className={`${stat.bgColor} rounded-md p-3 flex items-center justify-center`}>
                <div className={`w-6 h-6 ${stat.color} flex items-center justify-center text-lg`}>📊</div>
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Listings with Price Drop Configuration */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Your Listings - Apply Price Drop Rules</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {listings?.listings?.map((listing) => (
            <div key={listing.id} className="px-4 sm:px-6 py-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <img
                  src={listing.image_urls[0]}
                  alt={listing.title}
                  className="w-full sm:w-20 h-48 sm:h-20 rounded-lg object-cover flex-shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-medium text-gray-900 mb-2">{listing.title}</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-4">
                    <div>
                      <span className="text-sm text-gray-500">Current Price:</span>
                      <div className="text-xl font-bold text-green-600">${listing.current_price}</div>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">Original Price:</span>
                      <div className="text-lg font-medium">${listing.original_price}</div>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">Current Min Price:</span>
                      <div className="text-lg font-medium text-red-600">${listing.minimum_price}</div>
                    </div>
                  </div>

                  {/* Price Drop Rule Configuration */}
                  {editingListing === listing.id ? (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h5 className="font-medium text-gray-900 mb-3">Configure Price Drop Rule</h5>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Strategy</label>
                          <select
                            value={priceDropSettings[listing.id]?.strategy || listing.reduction_strategy}
                            onChange={(e) => handleSettingsChange(listing.id, 'strategy', e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                          >
                            <option value="fixed_percentage">Fixed Percentage</option>
                            <option value="market_based">Market Based</option>
                            <option value="time_based">Time Based</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Drop Percentage</label>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={priceDropSettings[listing.id]?.percentage || listing.reduction_percentage}
                            onChange={(e) => handleSettingsChange(listing.id, 'percentage', parseInt(e.target.value))}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Price ($)</label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={priceDropSettings[listing.id]?.minimumPrice || listing.minimum_price}
                            onChange={(e) => handleSettingsChange(listing.id, 'minimumPrice', parseFloat(e.target.value))}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Check Interval (days)</label>
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={priceDropSettings[listing.id]?.interval || listing.reduction_interval}
                            onChange={(e) => handleSettingsChange(listing.id, 'interval', parseInt(e.target.value))}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => handleApplyPriceDropRule(listing.id)}
                          disabled={updateListingMutation.isLoading}
                          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 w-full sm:w-auto"
                        >
                          Apply Price Drop Rule
                        </button>
                        <button
                          onClick={() => setEditingListing(null)}
                          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 w-full sm:w-auto"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium text-center sm:text-left ${
                          listing.price_reduction_enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {listing.price_reduction_enabled ? '🟢 Active' : '⚪ Inactive'}
                        </span>
                        <span className="text-sm text-gray-600 text-center sm:text-left">
                          Strategy: {listing.reduction_strategy} • {listing.reduction_percentage}% • Every {listing.reduction_interval} days
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => setEditingListing(listing.id)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 w-full sm:w-auto"
                        >
                          Configure Rules
                        </button>
                        <Link
                          to={`/listings/${listing.id}`}
                          className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 w-full sm:w-auto text-center"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/listings"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-center"
          >
            View All Listings
          </Link>
          <Link
            to="/strategies"
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 text-center"
          >
            Manage Strategies
          </Link>
          <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Import from eBay
          </button>
          <button className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">
            Run Price Check
          </button>
        </div>
      </div>
    </div>
  )
}