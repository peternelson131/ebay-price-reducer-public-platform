import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { listingsAPI } from '../lib/supabase'
import { toast } from 'react-toastify'
import {
  ArrowLeftIcon,
  TrendingDownIcon,
  ChartBarIcon,
  ClockIcon
} from '@heroicons/react/24/outline'

export default function ListingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showSettings, setShowSettings] = useState(false)

  const { data: listing, isLoading } = useQuery(
    ['listing', id],
    () => listingsAPI.getListing(id)
  )

  // Note: Price history functionality removed - price_history table has been dropped

  const { data: marketAnalysis } = useQuery(
    ['marketAnalysis', id],
    () => ({ hasData: false })
  )

  const { register, handleSubmit, reset } = useForm()

  const updateMutation = useMutation(
    (data) => listingsAPI.updateListing(id, data),
    {
      onSuccess: () => {
        toast.success('Listing settings updated')
        queryClient.invalidateQueries(['listing', id])
        setShowSettings(false)
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to update listing')
      }
    }
  )

  const reducePriceMutation = useMutation(
    ({ listingId, customPrice }) => listingsAPI.recordPriceReduction(listingId, customPrice || listing?.current_price * 0.95, 'manual'),
    {
      onSuccess: (data) => {
        toast.success(`Price reduced to $${data.current_price}`)
        queryClient.invalidateQueries(['listing', id])
        // Note: priceHistory query removed
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to reduce price')
      }
    }
  )

  const onUpdateSettings = (data) => {
    updateMutation.mutate(data)
  }

  const handleReducePrice = (customPrice = null) => {
    if (window.confirm(`Are you sure you want to reduce the price${customPrice ? ` to $${customPrice}` : ''}?`)) {
      reducePriceMutation.mutate({ listingId: id, customPrice })
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-ebay-blue"></div>
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">Listing not found</div>
        <button onClick={() => navigate('/listings')} className="btn-primary">
          Back to Listings
        </button>
      </div>
    )
  }

  const listingData = listing
  // Note: Price history data no longer available - using empty array for backward compatibility
  const priceHistoryData = []
  const marketData = marketAnalysis

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/listings')}
          className="flex items-center text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Listings
        </button>

        <div className="flex space-x-3">
          <button
            onClick={() => handleReducePrice()}
            className="btn-danger btn-sm"
            disabled={reducePriceMutation.isLoading}
          >
            <TrendingDownIcon className="h-4 w-4 mr-1" />
            Reduce Price Now
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn-secondary btn-sm"
          >
            Settings
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Listing Info */}
          <div className="card">
            <div className="card-body">
              <div className="flex">
                <div className="flex-shrink-0">
                  {listingData.image_urls && listingData.image_urls[0] ? (
                    <img
                      className="h-32 w-32 rounded-lg object-cover"
                      src={listingData.image_urls[0]}
                      alt={listingData.title}
                    />
                  ) : (
                    <div className="h-32 w-32 rounded-lg bg-gray-300 flex items-center justify-center">
                      <span className="text-gray-500">No Image</span>
                    </div>
                  )}
                </div>

                <div className="ml-6 flex-1">
                  <h1 className="text-xl font-bold text-gray-900 mb-2">
                    {listingData.title}
                  </h1>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">eBay Item ID:</span>
                      <div className="font-medium">{listingData.ebay_item_id}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Category:</span>
                      <div className="font-medium">{listingData.category}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Condition:</span>
                      <div className="font-medium">{listingData.condition}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Quantity:</span>
                      <div className="font-medium">{listingData.quantity}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Price History - Disabled: price_history table removed */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">Price History</h3>
            </div>
            <div className="card-body">
              <div className="text-center py-6 text-gray-500">
                <p>Price history feature temporarily unavailable.</p>
                <p className="text-sm mt-2">Current price: <span className="font-semibold">${listingData.current_price}</span></p>
                <p className="text-sm">Original price: <span className="font-semibold">${listingData.original_price}</span></p>
                {listingData.last_price_reduction && (
                  <p className="text-sm mt-1">
                    Last reduced: <span className="font-semibold">{new Date(listingData.last_price_reduction).toLocaleDateString()}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Market Analysis */}
          {marketData && marketData.hasData && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <ChartBarIcon className="h-5 w-5 mr-2" />
                  Market Analysis
                </h3>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-500">Average Market Price:</span>
                    <div className="font-medium text-lg">${marketData.averagePrice}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Your Position:</span>
                    <div className={`font-medium ${
                      marketData.currentPricePosition === 'below_average'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {marketData.currentPricePosition === 'below_average' ? 'Below Average' : 'Above Average'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Suggested Price:</span>
                    <div className="font-medium text-lg">${marketData.suggestedPrice}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Recent Sales:</span>
                    <div className="font-medium">{marketData.totalSales}</div>
                  </div>
                </div>

                {marketData.suggestedPrice < listingData.current_price && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded-md">
                    <p className="text-sm text-yellow-800">
                      Consider reducing your price to ${marketData.suggestedPrice} to be more competitive.
                    </p>
                    <button
                      onClick={() => handleReducePrice(marketData.suggestedPrice)}
                      className="btn-primary btn-sm mt-2"
                    >
                      Apply Suggested Price
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Current Status */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">Current Status</h3>
            </div>
            <div className="card-body space-y-4">
              <div>
                <span className="text-gray-500">Current Price:</span>
                <div className="text-2xl font-bold text-green-600">
                  ${listingData.current_price}
                </div>
              </div>

              <div>
                <span className="text-gray-500">Original Price:</span>
                <div className="font-medium">${listingData.original_price}</div>
              </div>

              <div>
                <span className="text-gray-500">Minimum Price:</span>
                <div className="font-medium">${listingData.minimum_price}</div>
              </div>

              <div>
                <span className="text-gray-500">Monitoring Status:</span>
                <div>
                  <span className={`badge ${
                    listingData.price_reduction_enabled ? 'badge-success' : 'badge-warning'
                  }`}>
                    {listingData.price_reduction_enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>

              {listingData.next_price_reduction && (
                <div>
                  <span className="text-gray-500">Next Reduction:</span>
                  <div className="font-medium flex items-center">
                    <ClockIcon className="h-4 w-4 mr-1" />
                    {new Date(listingData.next_price_reduction).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-lg font-medium text-gray-900">Settings</h3>
              </div>
              <div className="card-body">
                <form onSubmit={handleSubmit(onUpdateSettings)} className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">
                      <input
                        type="checkbox"
                        defaultChecked={listingData.price_reduction_enabled}
                        {...register('price_reduction_enabled')}
                        className="mr-2"
                      />
                      Enable Price Monitoring
                    </label>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reduction Strategy</label>
                    <select
                      defaultValue={listingData.reduction_strategy}
                      {...register('reduction_strategy')}
                      className="form-input"
                    >
                      <option value="fixed_percentage">Fixed Percentage</option>
                      <option value="market_based">Market Based</option>
                      <option value="time_based">Time Based</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reduction Percentage (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      defaultValue={listingData.reduction_percentage}
                      {...register('reduction_percentage', { valueAsNumber: true })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Minimum Price ($)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      defaultValue={listingData.minimum_price}
                      {...register('minimum_price', { valueAsNumber: true })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reduction Interval (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      defaultValue={listingData.reduction_interval}
                      {...register('reduction_interval', { valueAsNumber: true })}
                      className="form-input"
                    />
                  </div>

                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      className="btn-primary btn-sm"
                      disabled={updateMutation.isLoading}
                    >
                      Save Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}