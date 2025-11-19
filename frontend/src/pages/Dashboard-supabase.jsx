import { useQuery } from '@tanstack/react-query'
import { listingsAPI } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  CurrencyDollarIcon,
  ListBulletIcon,
  ClockIcon,
  TrendingDownIcon
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'

export default function Dashboard() {
  const { user } = useAuth()

  const { data: listingsData, isLoading } = useQuery({
    queryKey: ['listings', { limit: 5 }],
    queryFn: () => listingsAPI.getListings({ limit: 5 }),
    enabled: !!user
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-ebay-blue"></div>
      </div>
    )
  }

  const listings = listingsData?.listings || []
  const totalListings = listingsData?.total || 0
  const activeMonitoring = listings.filter(l => l.price_reduction_enabled).length

  // Calculate total savings based on original vs current price
  const totalSavings = listings.reduce((total, listing) => {
    const originalPrice = listing.original_price
    const currentPrice = listing.current_price
    if (originalPrice && currentPrice && originalPrice > currentPrice) {
      return total + (originalPrice - currentPrice)
    }
    return total
  }, 0)

  // Count recent price reductions (today) based on last_price_reduction field
  const today = new Date().toDateString()
  const reductionsToday = listings.reduce((count, listing) => {
    if (listing.last_price_reduction) {
      const reductionDate = new Date(listing.last_price_reduction).toDateString()
      return reductionDate === today ? count + 1 : count
    }
    return count
  }, 0)

  const stats = [
    {
      name: 'Total Listings',
      value: totalListings,
      icon: ListBulletIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      name: 'Active Monitoring',
      value: activeMonitoring,
      icon: ClockIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      name: 'Reductions Today',
      value: reductionsToday,
      icon: TrendingDownIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    },
    {
      name: 'Total Savings',
      value: `$${totalSavings.toFixed(2)}`,
      icon: CurrencyDollarIcon,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor and manage your eBay listings price reduction
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`p-3 rounded-md ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {stat.name}
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stat.value}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Listings */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Recent Listings</h3>
          </div>
          <div className="card-body">
            {listings.length > 0 ? (
              <div className="space-y-4">
                {listings.map((listing) => (
                  <div key={listing.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {listing.title}
                      </p>
                      <p className="text-sm text-gray-500">
                        ${listing.current_price} • {listing.listing_status}
                      </p>
                    </div>
                    <div className="flex-shrink-0 ml-4">
                      <span className={`badge ${
                        listing.price_reduction_enabled
                          ? 'badge-success'
                          : 'badge-warning'
                      }`}>
                        {listing.price_reduction_enabled ? 'Monitoring' : 'Paused'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <ListBulletIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No listings</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Import your eBay listings to get started.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* System Status */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">System Status</h3>
          </div>
          <div className="card-body">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Service Status</span>
                <span className="badge badge-success">Running</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Next Check</span>
                <span className="text-sm text-gray-900">In 45 minutes</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Last Sync</span>
                <span className="text-sm text-gray-900">
                  {listings.length > 0 && listings[0].last_synced_with_ebay
                    ? format(new Date(listings[0].last_synced_with_ebay), 'PPp')
                    : 'Never'
                  }
                </span>
              </div>

              <div className="pt-4">
                <button className="btn-primary w-full">
                  View All Listings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button className="btn-primary">
              Import eBay Listings
            </button>
            <button className="btn-secondary">
              Run Manual Price Check
            </button>
            <button className="btn-secondary">
              Export Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}