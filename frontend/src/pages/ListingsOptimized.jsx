import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { debounce } from 'lodash';

// =============================================
// GRAPHQL QUERIES
// =============================================

const SEARCH_LISTINGS_QUERY = `
  query SearchListings($filter: ListingFilter, $sort: ListingSort, $first: Int, $after: String) {
    searchListings(filter: $filter, sort: $sort, first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          sku
          title
          currentPrice
          originalPrice
          currency
          quantity
          quantityAvailable
          listingStatus
          category
          primaryImageUrl
          priceReductionEnabled
          reductionPercentage
          lastSynced
          syncStatus
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
      aggregations {
        totalValue
        averagePrice
        activeCount
        categories {
          category
          count
        }
        priceRanges {
          min
          max
          count
        }
      }
    }
  }
`;

const GET_USER_STATS_QUERY = `
  query GetUserStats {
    getUserStats {
      totalListings
      activeListings
      totalValue
      reductionEnabledCount
      lastSync
    }
    getSyncStatus {
      isRunning
      lastRun
      nextScheduled
      queueLength
    }
  }
`;

const TRIGGER_SYNC_MUTATION = `
  mutation TriggerSync($input: CreateSyncJobInput!) {
    triggerSync(input: $input) {
      id
      status
      scheduledFor
    }
  }
`;

const UPDATE_LISTING_MUTATION = `
  mutation UpdateListing($input: UpdateListingInput!) {
    updateListing(input: $input) {
      id
      priceReductionEnabled
      reductionPercentage
      minimumPrice
    }
  }
`;

// =============================================
// GRAPHQL CLIENT
// =============================================

const graphqlFetch = async (query, variables = {}) => {
  const response = await fetch('/.netlify/functions/graphql-api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await response.json();

  if (data.errors) {
    throw new Error(data.errors[0].message);
  }

  return data.data;
};

// =============================================
// OPTIMIZED LISTINGS COMPONENT
// =============================================

export default function ListingsOptimized() {
  const queryClient = useQueryClient();
  const parentRef = React.useRef();

  // State management
  const [filter, setFilter] = useState({
    status: ['Active'],
    searchQuery: '',
    priceMin: null,
    priceMax: null,
    categories: [],
    priceReductionEnabled: null
  });

  const [sort, setSort] = useState({
    field: 'LAST_SYNCED',
    direction: 'DESC'
  });

  const [selectedListings, setSelectedListings] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'

  // =============================================
  // DATA FETCHING WITH INFINITE SCROLL
  // =============================================

  // Fetch listings with infinite scroll
  const {
    data: listingsData,
    error: listingsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: listingsLoading,
    refetch: refetchListings
  } = useInfiniteQuery({
    queryKey: ['listings', filter, sort],
    queryFn: async ({ pageParam = null }) => {
      const result = await graphqlFetch(SEARCH_LISTINGS_QUERY, {
        filter,
        sort,
        first: 20,
        after: pageParam
      });
      return result.searchListings;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined,
    staleTime: 30 * 1000, // 30 seconds
    cacheTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: false, // Disable auto-refetch
    refetchOnWindowFocus: false
  });

  // Fetch user stats
  const { data: userStats, refetch: refetchStats } = useQuery({
    queryKey: ['userStats'],
    queryFn: () => graphqlFetch(GET_USER_STATS_QUERY),
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000 // Refetch every minute
  });

  // =============================================
  // MUTATIONS
  // =============================================

  // Trigger sync mutation
  const triggerSync = useMutation({
    mutationFn: (input) => graphqlFetch(TRIGGER_SYNC_MUTATION, { input }),
    onSuccess: () => {
      queryClient.invalidateQueries(['userStats']);
      setTimeout(() => {
        queryClient.invalidateQueries(['listings']);
      }, 5000); // Refetch listings after 5 seconds
    }
  });

  // Update listing mutation
  const updateListing = useMutation({
    mutationFn: (input) => graphqlFetch(UPDATE_LISTING_MUTATION, { input }),
    onSuccess: (data) => {
      // Optimistically update cache
      queryClient.setQueryData(['listings', filter, sort], (old) => {
        // Update the specific listing in the infinite query pages
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            edges: page.edges.map(edge =>
              edge.node.id === data.updateListing.id
                ? { ...edge, node: { ...edge.node, ...data.updateListing } }
                : edge
            )
          }))
        };
      });
    }
  });

  // =============================================
  // VIRTUALIZATION FOR PERFORMANCE
  // =============================================

  // Flatten all listings for virtualization
  const allListings = useMemo(() => {
    if (!listingsData?.pages) return [];
    return listingsData.pages.flatMap(page => page.edges.map(edge => edge.node));
  }, [listingsData]);

  // Virtual row setup for table view
  const rowVirtualizer = useVirtualizer({
    count: allListings.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // Estimated row height
    overscan: 10 // Number of items to render outside viewport
  });

  // =============================================
  // SEARCH WITH DEBOUNCING
  // =============================================

  const debouncedSearch = useMemo(
    () => debounce((searchQuery) => {
      setFilter(prev => ({ ...prev, searchQuery }));
    }, 300),
    []
  );

  const handleSearch = useCallback((e) => {
    debouncedSearch(e.target.value);
  }, [debouncedSearch]);

  // =============================================
  // BATCH OPERATIONS
  // =============================================

  const handleBatchUpdate = async () => {
    const listingIds = Array.from(selectedListings);

    if (listingIds.length === 0) return;

    // Trigger sync for selected listings
    await triggerSync.mutateAsync({
      jobType: 'price_update',
      priority: 1,
      listingIds
    });

    setSelectedListings(new Set());
  };

  // =============================================
  // INFINITE SCROLL DETECTION
  // =============================================

  useEffect(() => {
    if (!parentRef.current) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = parentRef.current;

      // Load more when user scrolls to bottom
      if (scrollTop + clientHeight >= scrollHeight - 100 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };

    parentRef.current.addEventListener('scroll', handleScroll);
    return () => parentRef.current?.removeEventListener('scroll', handleScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // =============================================
  // RENDER FUNCTIONS
  // =============================================

  const renderStats = () => {
    if (!userStats) return null;

    const stats = userStats.getUserStats;
    const syncStatus = userStats.getSyncStatus;

    return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Total Listings</div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalListings}</div>
          <div className="text-xs text-gray-500">
            {stats.activeListings} active
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Total Value</div>
          <div className="text-2xl font-bold text-gray-900">
            ${stats.totalValue?.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">
            Avg: ${(stats.totalValue / stats.totalListings).toFixed(2)}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Price Reduction</div>
          <div className="text-2xl font-bold text-gray-900">{stats.reductionEnabledCount}</div>
          <div className="text-xs text-gray-500">
            {((stats.reductionEnabledCount / stats.totalListings) * 100).toFixed(0)}% enabled
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Sync Status</div>
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${
              syncStatus.isRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
            }`} />
            <span className="text-sm font-medium">
              {syncStatus.isRunning ? 'Syncing...' : 'Idle'}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            Queue: {syncStatus.queueLength} jobs
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Last Sync</div>
          <div className="text-sm font-bold text-gray-900">
            {stats.lastSync ? new Date(stats.lastSync).toLocaleTimeString() : 'Never'}
          </div>
          <button
            onClick={() => triggerSync.mutate({ jobType: 'full_sync', priority: 1 })}
            disabled={syncStatus.isRunning || triggerSync.isLoading}
            className="mt-2 text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {triggerSync.isLoading ? 'Triggering...' : 'Sync Now'}
          </button>
        </div>
      </div>
    );
  };

  const renderFilters = () => (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search listings..."
            onChange={handleSearch}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Status filter */}
        <select
          value={filter.status[0] || ''}
          onChange={(e) => setFilter(prev => ({
            ...prev,
            status: e.target.value ? [e.target.value] : []
          }))}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Ended">Ended</option>
          <option value="Draft">Draft</option>
        </select>

        {/* Price range */}
        <div className="flex gap-2 items-center">
          <input
            type="number"
            placeholder="Min $"
            value={filter.priceMin || ''}
            onChange={(e) => setFilter(prev => ({
              ...prev,
              priceMin: e.target.value ? parseFloat(e.target.value) : null
            }))}
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span>-</span>
          <input
            type="number"
            placeholder="Max $"
            value={filter.priceMax || ''}
            onChange={(e) => setFilter(prev => ({
              ...prev,
              priceMax: e.target.value ? parseFloat(e.target.value) : null
            }))}
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Sort */}
        <select
          value={`${sort.field}_${sort.direction}`}
          onChange={(e) => {
            const [field, direction] = e.target.value.split('_');
            setSort({ field, direction });
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="LAST_SYNCED_DESC">Recently Synced</option>
          <option value="PRICE_DESC">Price: High to Low</option>
          <option value="PRICE_ASC">Price: Low to High</option>
          <option value="CREATED_AT_DESC">Newest First</option>
          <option value="TITLE_ASC">Title A-Z</option>
        </select>

        {/* View mode toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded ${
              viewMode === 'grid' ? 'bg-white shadow' : ''
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 rounded ${
              viewMode === 'table' ? 'bg-white shadow' : ''
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Batch actions */}
      {selectedListings.size > 0 && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleBatchUpdate}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Sync Selected ({selectedListings.size})
          </button>
          <button
            onClick={() => setSelectedListings(new Set())}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
          >
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );

  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {allListings.map((listing) => (
        <div
          key={listing.id}
          className={`bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-4 cursor-pointer ${
            selectedListings.has(listing.id) ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => {
            setSelectedListings(prev => {
              const next = new Set(prev);
              if (next.has(listing.id)) {
                next.delete(listing.id);
              } else {
                next.add(listing.id);
              }
              return next;
            });
          }}
        >
          {/* Image */}
          {listing.primaryImageUrl && (
            <img
              src={listing.primaryImageUrl}
              alt={listing.title}
              className="w-full h-48 object-cover rounded-lg mb-3"
              loading="lazy"
            />
          )}

          {/* Title */}
          <h3 className="font-medium text-gray-900 truncate mb-2">
            {listing.title}
          </h3>

          {/* Price */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xl font-bold text-gray-900">
              ${listing.currentPrice}
            </span>
            {listing.originalPrice > listing.currentPrice && (
              <span className="text-sm text-gray-500 line-through">
                ${listing.originalPrice}
              </span>
            )}
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              listing.listingStatus === 'Active'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {listing.listingStatus}
            </span>

            {listing.priceReductionEnabled && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                -{listing.reductionPercentage}%
              </span>
            )}

            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              listing.syncStatus === 'synced'
                ? 'bg-green-100 text-green-800'
                : listing.syncStatus === 'error'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {listing.syncStatus}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateListing.mutate({
                  id: listing.id,
                  priceReductionEnabled: !listing.priceReductionEnabled
                });
              }}
              className="flex-1 text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200"
            >
              {listing.priceReductionEnabled ? 'Disable' : 'Enable'} Reduction
            </button>
          </div>
        </div>
      ))}

      {/* Loading indicator */}
      {isFetchingNextPage && (
        <div className="col-span-full text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      )}
    </div>
  );

  const renderTableView = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div
        ref={parentRef}
        className="h-[600px] overflow-auto"
      >
        <table className="min-w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={selectedListings.size === allListings.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedListings(new Set(allListings.map(l => l.id)));
                    } else {
                      setSelectedListings(new Set());
                    }
                  }}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reduction
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Sync
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              <td>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const listing = allListings[virtualRow.index];
                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      <table className="min-w-full">
                        <tbody>
                          <tr className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedListings.has(listing.id)}
                                onChange={() => {
                                  setSelectedListings(prev => {
                                    const next = new Set(prev);
                                    if (next.has(listing.id)) {
                                      next.delete(listing.id);
                                    } else {
                                      next.add(listing.id);
                                    }
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                                {listing.title}
                              </div>
                              <div className="text-sm text-gray-500">
                                {listing.category}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {listing.sku}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                ${listing.currentPrice}
                              </div>
                              {listing.originalPrice > listing.currentPrice && (
                                <div className="text-xs text-gray-500 line-through">
                                  ${listing.originalPrice}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {listing.quantityAvailable} / {listing.quantity}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                listing.listingStatus === 'Active'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {listing.listingStatus}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {listing.priceReductionEnabled ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  -{listing.reductionPercentage}%
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">Disabled</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(listing.lastSynced).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => {
                                  updateListing.mutate({
                                    id: listing.id,
                                    priceReductionEnabled: !listing.priceReductionEnabled
                                  });
                                }}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                {listing.priceReductionEnabled ? 'Disable' : 'Enable'}
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  // =============================================
  // MAIN RENDER
  // =============================================

  if (listingsError) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-red-800 font-medium">Error loading listings</h3>
            <p className="text-red-600 text-sm mt-1">{listingsError.message}</p>
            <button
              onClick={() => refetchListings()}
              className="mt-3 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Your eBay Listings</h1>
          <p className="text-gray-600 mt-1">
            Intelligent synchronization and price optimization
          </p>
        </div>

        {/* Stats Dashboard */}
        {renderStats()}

        {/* Filters */}
        {renderFilters()}

        {/* Listings */}
        {listingsLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : viewMode === 'grid' ? (
          renderGridView()
        ) : (
          renderTableView()
        )}

        {/* Load more indicator */}
        {hasNextPage && !isFetchingNextPage && (
          <div className="text-center mt-8">
            <button
              onClick={() => fetchNextPage()}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}