import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { listingsAPI, userAPI, supabase } from '../lib/supabase'
import apiService from '../services/api'
import { getActiveStrategies, getStrategyById, getStrategyDisplayName, getStrategyDisplayInfo } from '../data/strategies'
import { Search, X, AlertCircle, Plus, Filter, RefreshCw, Palmtree } from 'lucide-react'

// Helper functions for localStorage
const VALID_COLUMNS = [
  'image', 'title', 'quantity', 'currentPrice', 'minimumPrice',
  'priceReductionEnabled', 'strategy', 'listingAge', 'actions'
]

const getStoredColumnOrder = () => {
  try {
    const stored = localStorage.getItem('listings-column-order')
    if (stored) {
      const parsed = JSON.parse(stored)
      // Filter out invalid columns (like viewCount, watchCount, suggestedPrice)
      const filtered = parsed.filter(col => VALID_COLUMNS.includes(col))
      // If filtering removed columns, return default to ensure all valid columns are present
      if (filtered.length !== parsed.length || filtered.length !== VALID_COLUMNS.length) {
        return VALID_COLUMNS
      }
      return filtered
    }
  } catch (error) {
    console.warn('Failed to load column order from localStorage:', error)
  }
  return VALID_COLUMNS
}

const getStoredVisibleColumns = () => {
  try {
    const stored = localStorage.getItem('listings-visible-columns')
    if (stored) {
      const parsed = JSON.parse(stored)
      // Filter out invalid columns and create new object with only valid columns
      const filtered = {}
      let hasInvalidColumns = false

      for (const col of VALID_COLUMNS) {
        if (col in parsed) {
          filtered[col] = parsed[col]
        } else {
          filtered[col] = true // Default to visible if not in stored config
        }
      }

      // Check if there were any invalid columns in the stored config
      for (const col in parsed) {
        if (!VALID_COLUMNS.includes(col)) {
          hasInvalidColumns = true
          break
        }
      }

      // If we found invalid columns, clean up localStorage
      if (hasInvalidColumns) {
        localStorage.setItem('listings-visible-columns', JSON.stringify(filtered))
      }

      return filtered
    }
  } catch (error) {
    console.warn('Failed to load visible columns from localStorage:', error)
  }
  return {
    image: true,
    title: true,
    quantity: true,
    currentPrice: true,
    minimumPrice: true,
    priceReductionEnabled: true,
    strategy: true,
    listingAge: true,
    actions: true
  }
}

const getStoredItemsPerPage = () => {
  try {
    const stored = localStorage.getItem('listings-items-per-page')
    if (stored) {
      const value = parseInt(stored, 10)
      if ([10, 25, 50, 100].includes(value)) {
        return value
      }
    }
  } catch (error) {
    console.warn('Failed to load items per page from localStorage:', error)
  }
  return 25 // Default to 25 items per page
}

export default function Listings() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Active')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [visibleColumns, setVisibleColumns] = useState(getStoredVisibleColumns())
  const [columnOrder, setColumnOrder] = useState(getStoredColumnOrder())
  const [draggedColumn, setDraggedColumn] = useState(null)
  const [filters, setFilters] = useState([])
  const [notification, setNotification] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(getStoredItemsPerPage())
  const [isSyncing, setIsSyncing] = useState(false)
  const queryClient = useQueryClient()

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const handleSyncEbay = async () => {
    setIsSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        showNotification('error', 'Please log in to sync listings')
        return
      }

      const response = await fetch('/.netlify/functions/sync-ebay-listings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Sync failed')
      }

      if (data.success && data.summary) {
        const { totalImported, totalUpdated } = data.summary
        showNotification('success', `Synced ${totalImported} listings (${totalUpdated} updated)`)
        // Refresh the listings data
        queryClient.invalidateQueries(['listings'])
      } else {
        showNotification('success', 'Sync completed')
        queryClient.invalidateQueries(['listings'])
      }
    } catch (error) {
      console.error('Sync error:', error)
      showNotification('error', `Sync failed: ${error.message}`)
    } finally {
      setIsSyncing(false)
    }
  }

  // Save column order to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('listings-column-order', JSON.stringify(columnOrder))
    } catch (error) {
      console.warn('Failed to save column order to localStorage:', error)
    }
  }, [columnOrder])

  // Save visible columns to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('listings-visible-columns', JSON.stringify(visibleColumns))
    } catch (error) {
      console.warn('Failed to save visible columns to localStorage:', error)
    }
  }, [visibleColumns])

  // Save items per page to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('listings-items-per-page', itemsPerPage.toString())
    } catch (error) {
      console.warn('Failed to save items per page to localStorage:', error)
    }
  }, [itemsPerPage])

  // Reset to page 1 when filters, search, or status changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filters, status])

  const { data: listings, isLoading, error, refetch } = useQuery(
    ['listings', { status }],
    () => listingsAPI.getListings({ status }),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch on mount if data exists
      staleTime: 6 * 60 * 60 * 1000, // Consider data fresh for 6 hours (matches scheduled sync interval)
      cacheTime: 12 * 60 * 60 * 1000, // Keep cached data for 12 hours
      retry: 1, // Only retry once on failure
      refetchInterval: false, // Disable automatic polling (use scheduled sync instead)
      refetchIntervalInBackground: false,
      refetchOnReconnect: 'always' // Refetch when network reconnects
    }
  )

  const { data: userProfile, isLoading: isUserLoading } = useQuery(
    ['userProfile'],
    () => userAPI.getProfile(),
    {
      retry: 1,
      refetchOnWindowFocus: false
    }
  )

  // Fetch active strategies
  const { data: strategies = [], isLoading: isStrategiesLoading } = useQuery(
    ['strategies', 'active'],
    () => getActiveStrategies(),
    {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
      cacheTime: 30 * 60 * 1000 // Keep cached data for 30 minutes
    }
  )

  // Fetch vacation mode status
  const { data: vacationMode, isLoading: isVacationLoading } = useQuery(
    ['vacationMode'],
    async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false
      const { data } = await supabase
        .from('users')
        .select('vacation_mode')
        .eq('id', user.id)
        .single()
      return data?.vacation_mode || false
    },
    {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000
    }
  )

  // Toggle vacation mode mutation
  const toggleVacationMutation = useMutation(
    async (newValue) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { error } = await supabase
        .from('users')
        .update({ 
          vacation_mode: newValue,
          vacation_mode_since: newValue ? new Date().toISOString() : null
        })
        .eq('id', user.id)
      if (error) throw error
      return newValue
    },
    {
      onSuccess: (newValue) => {
        queryClient.setQueryData(['vacationMode'], newValue)
        showNotification('success', newValue 
          ? '🏖️ Vacation mode ON - price reductions paused'
          : '✅ Vacation mode OFF - price reductions will resume'
        )
      },
      onError: (error) => {
        showNotification('error', `Failed to toggle vacation mode: ${error.message}`)
      }
    }
  )

  // Removed: Manual price reduction feature
  // const reducePriceMutation = useMutation(...)

  const endListingMutation = useMutation(listingsAPI.endListing, {
    onSuccess: () => {
      showNotification('success', 'Listing closed successfully')
      queryClient.invalidateQueries('listings')
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to close listing')
    }
  })

  const updateMinimumPriceMutation = useMutation(
    ({ listingId, minimumPrice }) => listingsAPI.updateListing(listingId, { minimum_price: minimumPrice }),
    {
      onMutate: async ({ listingId, minimumPrice }) => {
        // Cancel outgoing refetches
        await queryClient.cancelQueries(['listings', { status }])

        // Snapshot previous value
        const previousListings = queryClient.getQueryData(['listings', { status }])

        // Optimistically update
        queryClient.setQueryData(['listings', { status }], (old) => {
          if (!old) return old
          return old.map(listing =>
            listing.id === listingId
              ? { ...listing, minimum_price: minimumPrice }
              : listing
          )
        })

        return { previousListings }
      },
      onSuccess: () => {
        showNotification('success', 'Minimum price updated')
      },
      onError: (error, variables, context) => {
        // Rollback on error
        if (context?.previousListings) {
          queryClient.setQueryData(['listings', { status }], context.previousListings)
        }
        showNotification('error', error.message || 'Failed to update minimum price')
      },
      onSettled: () => {
        // Refetch in background to ensure data consistency
        queryClient.invalidateQueries(['listings', { status }])
      }
    }
  )

  const updateStrategyMutation = useMutation(
    ({ listingId, strategyId }) => listingsAPI.updateListing(listingId, {
      strategy_id: strategyId || null
    }),
    {
      onMutate: async ({ listingId, strategyId }) => {
        await queryClient.cancelQueries(['listings', { status }])
        const previousListings = queryClient.getQueryData(['listings', { status }])

        queryClient.setQueryData(['listings', { status }], (old) => {
          if (!old) return old
          return old.map(listing =>
            listing.id === listingId
              ? { ...listing, strategy_id: strategyId }
              : listing
          )
        })

        return { previousListings }
      },
      onSuccess: (data) => {
        const strategyName = data.strategy_id
          ? strategies.find(s => s.id === data.strategy_id)?.name || 'selected strategy'
          : 'No strategy';
        showNotification('success', `Strategy updated to ${strategyName}`)
      },
      onError: (error, variables, context) => {
        if (context?.previousListings) {
          queryClient.setQueryData(['listings', { status }], context.previousListings)
        }
        showNotification('error', error.message || 'Failed to update strategy')
      },
      onSettled: () => {
        queryClient.invalidateQueries(['listings', { status }])
      }
    }
  )

  const togglePriceReductionMutation = useMutation(
    ({ listingId, enabled }) => listingsAPI.updateListing(listingId, { enable_auto_reduction: enabled }),
    {
      onMutate: async ({ listingId, enabled }) => {
        await queryClient.cancelQueries(['listings', { status }])
        const previousListings = queryClient.getQueryData(['listings', { status }])

        queryClient.setQueryData(['listings', { status }], (old) => {
          if (!old) return old
          return old.map(listing =>
            listing.id === listingId
              ? { ...listing, enable_auto_reduction: enabled }
              : listing
          )
        })

        return { previousListings }
      },
      onSuccess: (data, { enabled }) => {
        showNotification('success', `Price reduction ${enabled ? 'enabled' : 'disabled'}`)
      },
      onError: (error, variables, context) => {
        if (context?.previousListings) {
          queryClient.setQueryData(['listings', { status }], context.previousListings)
        }
        showNotification('error', error.message || 'Failed to update price reduction status')
      },
      onSettled: () => {
        queryClient.invalidateQueries(['listings', { status }])
      }
    }
  )


  const handleDeleteListing = (listingId) => {
    if (window.confirm('Are you sure you want to close this listing? This will mark it as closed in your local database.')) {
      endListingMutation.mutate(listingId)
    }
  }

  const handleBulkCloseSoldOut = async () => {
    // In "Ended" view: close all ended listings
    // In other views: close only sold-out listings (quantity = 0)
    const listingsToClose = status === 'Ended'
      ? sortedAndFilteredListings
      : sortedAndFilteredListings.filter(listing => listing.quantity_available === 0)

    if (listingsToClose.length === 0) {
      showNotification('info', 'No listings to close')
      return
    }

    const listingType = status === 'Ended' ? 'ended' : 'sold-out'
    const confirmMessage = `Close ${listingsToClose.length} ${listingType} listing(s)? This will mark them as closed in your local database.`
    if (!window.confirm(confirmMessage)) {
      return
    }

    setNotification({ type: 'info', message: `Closing ${listingsToClose.length} listings...` })

    let successCount = 0
    let alreadyClosedCount = 0
    let failCount = 0
    const errors = []

    for (const listing of listingsToClose) {
      try {
        const response = await listingsAPI.endListing(listing.id)

        // Check if it was already closed
        if (response?.message?.toLowerCase().includes('already')) {
          alreadyClosedCount++
        } else {
          successCount++
        }
      } catch (error) {
        console.error(`Failed to close listing ${listing.id}:`, error)
        failCount++

        // Store error details for reporting
        const errorMsg = error.message || 'Unknown error'
        errors.push({
          sku: listing.ebay_sku || listing.ebay_item_id,
          error: errorMsg
        })
      }
    }

    // Refetch listings to update UI
    queryClient.invalidateQueries('listings')

    // Show final notification with detailed results
    const totalProcessed = successCount + alreadyClosedCount
    if (failCount === 0) {
      if (alreadyClosedCount > 0) {
        showNotification('success',
          `Successfully processed ${totalProcessed} listing(s) (${successCount} closed, ${alreadyClosedCount} already closed on eBay)`
        )
      } else {
        showNotification('success', `Successfully closed ${successCount} listing(s)`)
      }
    } else {
      const failedSkus = errors.slice(0, 3).map(e => e.sku).join(', ')
      const moreText = errors.length > 3 ? ` and ${errors.length - 3} more` : ''
      showNotification('warning',
        `Closed ${totalProcessed} listing(s), ${failCount} failed. Failed: ${failedSkus}${moreText}. Check console for details.`
      )
      console.error('Failed listings:', errors)
    }
  }

  const handleMinimumPriceUpdate = (listingId, value) => {
    const minimumPrice = parseFloat(value)
    if (!isNaN(minimumPrice) && minimumPrice >= 0) {
      updateMinimumPriceMutation.mutate({ listingId, minimumPrice })
    }
  }

  const handleStrategyUpdate = (listingId, strategyId) => {
    updateStrategyMutation.mutate({
      listingId,
      strategyId: strategyId || null
    })
  }

  const handleTogglePriceReduction = (listing) => {
    // Prevent enabling price reduction if minimum price is not set
    if (!listing.enable_auto_reduction && (!listing.minimum_price || listing.minimum_price <= 0)) {
      showNotification('error', 'Please set a minimum price before enabling price reduction')
      return
    }

    if (!userProfile?.id) {
      showNotification('error', 'User not authenticated')
      return
    }

    togglePriceReductionMutation.mutate({
      listingId: listing.id,
      enabled: !listing.enable_auto_reduction
    })
  }


  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const toggleColumnVisibility = (column) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }))
  }

  const handleDragStart = (e, column) => {
    setDraggedColumn(column)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, targetColumn) => {
    e.preventDefault()

    if (draggedColumn && draggedColumn !== targetColumn) {
      const newOrder = [...columnOrder]
      const draggedIndex = newOrder.indexOf(draggedColumn)
      const targetIndex = newOrder.indexOf(targetColumn)

      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedColumn)

      setColumnOrder(newOrder)
    }
    setDraggedColumn(null)
  }

  const handleDragEnd = () => {
    setDraggedColumn(null)
  }

  const calculateListingAge = (createdAt) => {
    const now = new Date()
    const created = new Date(createdAt)
    const diffTime = Math.abs(now - created)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return `${diffDays} days`
  }

  // First, filter listings without sorting
  const filteredListings = useMemo(() => {
    let filtered = listings || []

    // Use empty array if no listings
    if (!filtered) {
      filtered = []
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(listing => {
        const strategy = getStrategyDisplayInfo(listing, strategies)
        const strategyName = strategy ? strategy.name : ''

        return (
          listing.title?.toLowerCase().includes(searchLower) ||
          listing.ebay_sku?.toLowerCase().includes(searchLower) ||
          listing.current_price?.toString().includes(searchLower) ||
          listing.original_price?.toString().includes(searchLower) ||
          listing.quantity_available?.toString().includes(searchLower) ||
          listing.minimum_price?.toString().includes(searchLower) ||
          strategyName.toLowerCase().includes(searchLower) ||
          listing.id?.toLowerCase().includes(searchLower)
        )
      })
    }

    // Apply filters
    if (filters.length > 0) {
      filtered = filtered.filter(listing => {
        return filters.every(filter => {
          if (!filter.field || !filter.value) return true

          let listingValue
          if (filter.field === 'strategy') {
            // Handle "No Strategy" filter
            if (filter.value === 'none') {
              return !listing.strategy_id
            }
            listingValue = listing.strategy_id
          } else if (filter.field === 'listing_age') {
            const created = new Date(listing.created_at || new Date())
            const now = new Date()
            listingValue = Math.ceil((now - created) / (1000 * 60 * 60 * 24))
          } else if (filter.field === 'enable_auto_reduction') {
            listingValue = listing.enable_auto_reduction?.toString()
          } else {
            listingValue = listing[filter.field]
          }

          const filterValue = filter.value
          const numericListingValue = parseFloat(listingValue)
          const numericFilterValue = parseFloat(filterValue)

          switch (filter.operator) {
            case 'equals':
              return filter.field === 'sku'
                ? listingValue?.toLowerCase().includes(filterValue.toLowerCase())
                : listingValue?.toString() === filterValue
            case 'contains':
              return listingValue?.toLowerCase().includes(filterValue.toLowerCase())
            case 'greater_than':
              return !isNaN(numericListingValue) && !isNaN(numericFilterValue) && numericListingValue > numericFilterValue
            case 'less_than':
              return !isNaN(numericListingValue) && !isNaN(numericFilterValue) && numericListingValue < numericFilterValue
            case 'greater_than_equal':
              return !isNaN(numericListingValue) && !isNaN(numericFilterValue) && numericListingValue >= numericFilterValue
            case 'less_than_equal':
              return !isNaN(numericListingValue) && !isNaN(numericFilterValue) && numericListingValue <= numericFilterValue
            default:
              return true
          }
        })
      })
    }

    return filtered
  }, [listings, searchTerm, filters, strategies])

  // Then, apply sorting ONLY when sortConfig changes (user clicks column header)
  const sortedAndFilteredListings = useMemo(() => {
    // If no sort is active, return filtered listings as-is (preserve original order)
    if (!sortConfig.key) return filteredListings

    // Apply sorting only when user explicitly sorts via column header click
    return [...filteredListings].sort((a, b) => {
      let aValue = a[sortConfig.key]
      let bValue = b[sortConfig.key]

      if (sortConfig.key === 'current_price' || sortConfig.key === 'original_price') {
        aValue = parseFloat(aValue)
        bValue = parseFloat(bValue)
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }, [filteredListings, sortConfig])

  // Pagination calculations
  const totalItems = sortedAndFilteredListings.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedListings = sortedAndFilteredListings.slice(startIndex, endIndex)

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = []
    const maxPagesToShow = 5

    if (totalPages <= maxPagesToShow) {
      // Show all pages if total is less than max
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Always show first page
      pages.push(1)

      // Calculate range around current page
      let start = Math.max(2, currentPage - 1)
      let end = Math.min(totalPages - 1, currentPage + 1)

      // Adjust if at the beginning
      if (currentPage <= 3) {
        end = 4
      }

      // Adjust if at the end
      if (currentPage >= totalPages - 2) {
        start = totalPages - 3
      }

      // Add ellipsis if needed
      if (start > 2) {
        pages.push('...')
      }

      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      // Add ellipsis if needed
      if (end < totalPages - 1) {
        pages.push('...')
      }

      // Always show last page
      pages.push(totalPages)
    }

    return pages
  }

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      // Scroll to top of listings
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleItemsPerPageChange = (value) => {
    const newValue = parseInt(value, 10)
    setItemsPerPage(newValue)
    setCurrentPage(1) // Reset to first page when changing items per page
  }

  // Filter configuration
  const filterOptions = [
    { key: 'strategy', label: 'Strategy', type: 'select', options: [
      { value: 'none', label: 'No Strategy' },
      ...strategies.map(s => ({ value: s.id, label: s.name }))
    ]},
    { key: 'current_price', label: 'Current Price', type: 'number' },
    { key: 'original_price', label: 'Original Price', type: 'number' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'minimum_price', label: 'Minimum Price', type: 'number' },
    { key: 'listing_age', label: 'Listing Age (days)', type: 'number' },
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'enable_auto_reduction', label: 'Monitoring Status', type: 'select', options: [
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Paused' }
    ]}
  ]

  const addFilter = () => {
    const newFilter = {
      id: Date.now(),
      field: '',
      operator: 'equals',
      value: ''
    }
    setFilters([...filters, newFilter])
  }

  const updateFilter = (id, updates) => {
    setFilters(filters.map(filter =>
      filter.id === id ? { ...filter, ...updates } : filter
    ))
  }

  const removeFilter = (id) => {
    setFilters(filters.filter(filter => filter.id !== id))
  }

  const clearAllFilters = () => {
    setFilters([])
  }

  // Column configuration
  const getColumnConfig = (column) => {
    const configs = {
      image: { label: 'Image', sortable: false, width: 'min-w-[80px] w-20' },
      title: { label: 'Title', sortable: true, sortKey: 'title', width: 'min-w-[200px]' },
      quantity: { label: 'Qty', sortable: true, sortKey: 'quantity', width: 'min-w-[60px] w-16' },
      currentPrice: { label: 'Current Price', sortable: true, sortKey: 'current_price', width: 'min-w-[100px] w-28' },
      minimumPrice: { label: 'Min Price', sortable: false, width: 'min-w-[90px] w-24' },
      priceReductionEnabled: { label: 'Price Reduction', sortable: true, sortKey: 'enable_auto_reduction', width: 'min-w-[120px] w-32' },
      strategy: { label: 'Strategy', sortable: false, width: 'min-w-[140px] w-40' },
      listingAge: { label: 'Age', sortable: true, sortKey: 'created_at', width: 'min-w-[70px] w-20' },
      actions: { label: 'Actions', sortable: false, width: 'min-w-[120px] w-32' }
    }
    return configs[column] || { label: column, sortable: false }
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading listings...</div>
  }

  if (error) {
    const errorMessage = error?.message || 'Unknown error occurred'
    const isEbayConnectionError = errorMessage.includes('eBay account not connected')
    const isAuthError = errorMessage.includes('Authentication') || errorMessage.includes('log in')
    const isServiceError = errorMessage.includes('service') || errorMessage.includes('unavailable')

    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <svg className="w-6 h-6 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h3 className="text-lg font-medium text-red-800">Unable to Load Listings</h3>
          </div>

          <p className="text-red-700 mb-4">{errorMessage}</p>

          <div className="space-y-3">
            {isEbayConnectionError && (
              <button
                onClick={handleConnectEbay}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Connect eBay Account
              </button>
            )}

            {isAuthError && (
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Refresh Page
              </button>
            )}

            {isServiceError && (
              <div className="text-sm text-red-600">
                <p>This is usually temporary. Please try again in a few minutes.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Try Again
                </button>
              </div>
            )}

            {!isEbayConnectionError && !isAuthError && !isServiceError && (
              <div className="text-sm text-red-600">
                <p>If this problem persists, please contact support.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Notification Banner */}
      {notification && (
        <div className={`rounded-lg p-3 border ${
          notification.type === 'success'
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-error/10 border-error/30 text-error'
        }`}>
          <div className="flex">
            <div>
              {notification.message}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Your eBay Listings</h1>
        <p className="text-text-secondary">Manage and monitor your eBay listing prices</p>
      </div>

      {/* Search Box */}
      <div className="bg-dark-surface rounded-lg border border-dark-border p-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-text-tertiary" strokeWidth={1.5} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-dark-border rounded-lg bg-dark-bg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            placeholder="Search listings by title, SKU, price, quantity, strategy, or any data..."
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <X className="h-5 w-5 text-text-tertiary hover:text-text-primary transition-colors" strokeWidth={1.5} />
            </button>
          )}
        </div>
        {searchTerm && (
          <div className="mt-2 text-sm text-text-secondary">
            {totalItems} listing{totalItems !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {/* Controls Row */}
      <div className="space-y-4 lg:space-y-0 lg:flex lg:justify-between lg:items-center">
        {/* Status Filter */}
        <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
          {['Active'].map((statusOption) => (
            <button
              key={statusOption}
              onClick={() => setStatus(statusOption)}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex-shrink-0 transition-colors ${
                status === statusOption
                  ? 'bg-accent text-white'
                  : 'bg-dark-surface text-text-secondary border border-dark-border hover:bg-dark-hover hover:text-text-primary'
              }`}
            >
              {statusOption === 'all' ? 'All' : statusOption}
            </button>
          ))}

          {/* Sync eBay Button */}
          <button
            onClick={handleSyncEbay}
            disabled={isSyncing}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex-shrink-0 transition-colors flex items-center gap-2 ${
              isSyncing
                ? 'bg-accent/50 text-white cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent-hover'
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} strokeWidth={2} />
            <span>{isSyncing ? 'Syncing...' : 'Sync eBay'}</span>
          </button>

          {/* Vacation Mode Toggle */}
          <button
            onClick={() => toggleVacationMutation.mutate(!vacationMode)}
            disabled={toggleVacationMutation.isLoading || isVacationLoading}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex-shrink-0 transition-colors flex items-center gap-2 ${
              vacationMode
                ? 'bg-warning/20 text-warning border border-warning/30 hover:bg-warning/30'
                : 'bg-dark-surface text-text-secondary border border-dark-border hover:bg-dark-hover hover:text-text-primary'
            }`}
            title={vacationMode ? 'Click to resume price reductions' : 'Click to pause price reductions'}
          >
            <Palmtree className="h-4 w-4" strokeWidth={2} />
            <span>{vacationMode ? 'Vacation: ON' : 'Vacation: OFF'}</span>
          </button>

          {/* Bulk Close Button - Show when closeable listings exist */}
          {(() => {
            const closeableListings = status === 'Ended'
              ? sortedAndFilteredListings // All ended listings
              : sortedAndFilteredListings.filter(l => l.quantity_available === 0); // Only sold-out in other views

            const buttonText = status === 'Ended'
              ? `Close All Ended (${closeableListings.length})`
              : `Close All Sold-Out (${closeableListings.length})`;

            return closeableListings.length > 0 && (
              <button
                onClick={handleBulkCloseSoldOut}
                className="bg-error/10 text-error border border-error/30 px-3 py-2 rounded-lg text-sm font-medium hover:bg-error/20 flex items-center gap-1 flex-shrink-0 transition-colors"
                title={status === 'Ended' ? 'Close all ended listings' : 'Close all sold-out listings'}
              >
                <span>{buttonText}</span>
              </button>
            );
          })()}
        </div>

        {/* Filter and Column Controls */}
        <div className="flex flex-wrap gap-2 justify-center lg:justify-end">
          {/* Add Filter Button */}
          <button
            onClick={addFilter}
            className="bg-success/10 text-success border border-success/30 px-3 py-2 rounded-lg text-sm hover:bg-success/20 flex items-center space-x-1.5 flex-shrink-0 transition-colors"
          >
            <Filter className="h-4 w-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Add Filter</span>
          </button>

          {/* Clear Filters Button */}
          {filters.length > 0 && (
            <button
              onClick={clearAllFilters}
              className="bg-error/10 text-error border border-error/30 px-3 py-2 rounded-lg text-sm hover:bg-error/20 flex-shrink-0 transition-colors"
            >
              <span className="hidden sm:inline">Clear All ({filters.length})</span>
              <span className="sm:hidden">Clear ({filters.length})</span>
            </button>
          )}

          {/* Column Visibility Controls - Hidden on mobile since mobile uses cards */}
          <div className="hidden lg:block relative">
            <details className="relative">
              <summary className="bg-dark-surface border border-dark-border text-text-secondary px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-dark-hover hover:text-text-primary transition-colors">
                Manage Columns
              </summary>
              <div className="absolute right-0 mt-2 w-48 bg-dark-surface rounded-lg border border-dark-border shadow-xl z-10">
                <div className="p-2">
                  {Object.entries(visibleColumns).map(([column, visible]) => (
                    <label key={column} className="flex items-center space-x-2 p-2 rounded hover:bg-dark-hover cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => toggleColumnVisibility(column)}
                        className="rounded bg-dark-bg border-dark-border text-accent focus:ring-accent"
                      />
                      <span className="text-sm text-text-primary capitalize">{column.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Active Filters */}
      {filters.length > 0 && (
        <div className="bg-dark-surface rounded-lg border border-dark-border p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Active Filters</h3>
          <div className="space-y-3">
            {filters.map((filter) => {
              const filterOption = filterOptions.find(opt => opt.key === filter.field)
              const isNumeric = filterOption?.type === 'number'
              const isSelect = filterOption?.type === 'select'

              return (
                <div key={filter.id} className="p-3 bg-dark-bg rounded-lg border border-dark-border">
                  <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 sm:items-center">
                    {/* Field Selection */}
                    <select
                      value={filter.field}
                      onChange={(e) => updateFilter(filter.id, { field: e.target.value, operator: 'equals', value: '' })}
                      className="text-sm border border-dark-border rounded-lg px-2 py-1.5 bg-dark-surface text-text-primary w-full sm:w-auto focus:ring-2 focus:ring-accent focus:border-transparent"
                    >
                      <option value="">Select Field</option>
                      {filterOptions.map(option => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>

                    {/* Operator Selection (for numeric fields) */}
                    {filter.field && isNumeric && (
                      <select
                        value={filter.operator}
                        onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                        className="text-sm border border-dark-border rounded-lg px-2 py-1.5 bg-dark-surface text-text-primary w-full sm:w-auto focus:ring-2 focus:ring-accent focus:border-transparent"
                      >
                        <option value="equals">=</option>
                        <option value="greater_than">&gt;</option>
                        <option value="less_than">&lt;</option>
                        <option value="greater_than_equal">≥</option>
                        <option value="less_than_equal">≤</option>
                      </select>
                    )}

                    {/* Operator Selection (for text fields) */}
                    {filter.field && !isNumeric && !isSelect && (
                      <select
                        value={filter.operator}
                        onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                        className="text-sm border border-dark-border rounded-lg px-2 py-1.5 bg-dark-surface text-text-primary w-full sm:w-auto focus:ring-2 focus:ring-accent focus:border-transparent"
                      >
                        <option value="equals">Equals</option>
                        <option value="contains">Contains</option>
                      </select>
                    )}

                    {/* Value Input */}
                    {filter.field && (
                      <>
                        {isSelect ? (
                          <select
                            value={filter.value}
                            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                            className="text-sm border border-dark-border rounded-lg px-2 py-1.5 bg-dark-surface text-text-primary w-full sm:w-auto focus:ring-2 focus:ring-accent focus:border-transparent"
                          >
                            <option value="">Select Value</option>
                            {filterOption.options?.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={isNumeric ? 'number' : 'text'}
                            value={filter.value}
                            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                            placeholder={`Enter ${filterOption?.label.toLowerCase()}`}
                            className="text-sm border border-dark-border rounded-lg px-2 py-1.5 bg-dark-surface text-text-primary placeholder-text-tertiary w-full sm:w-auto focus:ring-2 focus:ring-accent focus:border-transparent"
                          />
                        )}
                      </>
                    )}

                    {/* Remove Filter Button */}
                    <button
                      onClick={() => removeFilter(filter.id)}
                      className="text-error hover:text-error text-sm p-2 hover:bg-error/10 rounded-lg flex-shrink-0 self-center sm:self-auto transition-colors"
                      aria-label="Remove filter"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pagination Controls - Top */}
      {totalItems > 0 && (
        <div className="bg-dark-surface rounded-lg border border-dark-border p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Items per page selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="items-per-page" className="text-sm text-text-secondary">
                Show:
              </label>
              <select
                id="items-per-page"
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(e.target.value)}
                className="border border-dark-border rounded-lg px-2 py-1 text-sm bg-dark-bg text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span className="text-sm text-text-secondary">per page</span>
            </div>

            {/* Page info */}
            <div className="text-sm text-text-secondary text-center sm:text-left">
              Showing {totalItems === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + paginatedListings.length, totalItems)} of {totalItems} listings
            </div>

            {/* Page navigation */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1 justify-center sm:justify-end">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    currentPage === 1
                      ? 'bg-dark-bg text-text-tertiary cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  }`}
                >
                  Previous
                </button>

                {getPageNumbers().map((page, index) => (
                  page === '...' ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-text-tertiary">
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                        currentPage === page
                          ? 'bg-accent text-white'
                          : 'bg-dark-bg text-text-secondary hover:bg-dark-hover hover:text-text-primary'
                      }`}
                    >
                      {page}
                    </button>
                  )
                ))}

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    currentPage === totalPages
                      ? 'bg-dark-bg text-text-tertiary cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  }`}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Card View (visible on small screens) */}
      <div className="lg:hidden space-y-4">
        {paginatedListings.map((listing) => (
          <div key={listing.id} className="bg-dark-surface rounded-lg border border-dark-border p-4">
            <div className="flex items-start space-x-4">
              <img
                src={listing.image_url || '/placeholder-image.jpg'}
                alt={listing.title}
                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-text-primary truncate">{listing.title}</h3>
                {listing.ebay_sku && (
                  <p className="text-xs text-text-tertiary mt-1">SKU: {listing.ebay_sku}</p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-text-tertiary">Current Price:</span>
                    <div className="font-bold text-success">${listing.current_price}</div>
                  </div>
                  <div>
                    <span className="text-text-tertiary">Quantity:</span>
                    <div className="font-medium text-text-primary">{listing.listing_status === 'Ended' ? 0 : (listing.quantity_available ?? 0)}</div>
                  </div>
                  <div>
                    <span className="text-text-tertiary">Age:</span>
                    <div className="font-medium text-text-primary">{calculateListingAge(listing.created_at || new Date())}</div>
                  </div>
                </div>


                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-tertiary">Minimum Price:</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={listing.minimum_price || ''}
                      onBlur={(e) => handleMinimumPriceUpdate(listing.id, e.target.value)}
                      className="w-24 px-2 py-1 text-sm border border-dark-border rounded-lg bg-dark-bg text-text-primary placeholder-text-tertiary"
                      placeholder="Set min"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-tertiary">Price Reduction:</span>
                    <div className="flex items-center">
                      <label
                        className={`relative inline-flex items-center ${
                          (!listing.minimum_price || listing.minimum_price <= 0) && !listing.enable_auto_reduction
                            ? 'cursor-not-allowed'
                            : 'cursor-pointer'
                        }`}
                        title={(!listing.minimum_price || listing.minimum_price <= 0) && !listing.enable_auto_reduction
                          ? 'Set a minimum price before enabling price reduction'
                          : ''}
                      >
                        <input
                          type="checkbox"
                          checked={listing.enable_auto_reduction}
                          onChange={() => handleTogglePriceReduction(listing)}
                          disabled={togglePriceReductionMutation.isLoading}
                          className="sr-only"
                        />
                        <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                          listing.enable_auto_reduction ? 'bg-accent' : 'bg-dark-border'
                        }`}>
                          <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ease-in-out ${
                            listing.enable_auto_reduction ? 'translate-x-5' : 'translate-x-0'
                          }`}></div>
                        </div>
                      </label>
                      <span className={`ml-2 text-xs ${
                        listing.enable_auto_reduction ? 'text-success font-medium' : 'text-text-tertiary'
                      }`}>
                        {listing.enable_auto_reduction ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-tertiary">Strategy:</span>
                    <select
                      value={listing.strategy_id || listing.reduction_strategy || ''}
                      onChange={(e) => handleStrategyUpdate(listing.id, e.target.value)}
                      className="text-sm border border-dark-border rounded-lg px-2 py-1 max-w-32 bg-dark-bg text-text-primary"
                    >
                      <option value="">No Strategy</option>
                      {strategies.map((strategy) => (
                        <option key={strategy.id} value={strategy.id}>
                          {strategy.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={listing.ebay_url || `https://www.ebay.com/itm/${listing.ebay_item_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-accent/10 text-accent border border-accent/30 px-3 py-1 rounded-lg text-xs hover:bg-accent/20 inline-block text-center transition-colors"
                    title="Open this listing on eBay in a new tab"
                  >
                    View on eBay
                  </a>
                  <button
                    onClick={() => handleDeleteListing(listing.id)}
                    disabled={endListingMutation.isLoading}
                    className="bg-error/10 text-error border border-error/30 px-3 py-1 rounded-lg text-xs hover:bg-error/20 disabled:opacity-50 transition-colors"
                    title="Close this listing"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {totalItems === 0 && (
          <div className="text-center py-12 bg-dark-surface rounded-lg border border-dark-border">
            <div className="text-text-tertiary">
              No listings found.
            </div>
          </div>
        )}
      </div>

      {/* Desktop Table View (visible on large screens) */}
      <div className="hidden lg:block bg-dark-surface rounded-lg border border-dark-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-auto divide-y divide-dark-border">
            <thead className="bg-dark-bg">
              <tr>
                {columnOrder.map((column) => {
                  if (!visibleColumns[column]) return null
                  const config = getColumnConfig(column)

                  return (
                    <th
                      key={column}
                      draggable
                      onDragStart={(e) => handleDragStart(e, column)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, column)}
                      onDragEnd={handleDragEnd}
                      className={`px-2 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider ${
                        config.sortable ? 'cursor-pointer hover:bg-dark-hover hover:text-text-secondary' : ''
                      } ${draggedColumn === column ? 'opacity-50' : ''} ${config.width || ''} select-none transition-colors`}
                      onClick={config.sortable ? () => handleSort(config.sortKey) : undefined}
                    >
                      <div className="flex items-center space-x-1 min-w-0">
                        <span className="flex-shrink-0 text-text-tertiary">⋮⋮</span>
                        <span className="break-words leading-tight">{config.label}</span>
                        {config.sortable && sortConfig.key === config.sortKey && (
                          <span className="flex-shrink-0 text-accent">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="bg-dark-surface divide-y divide-dark-border">
              {paginatedListings.map((listing) => (
                <tr key={listing.id} className="hover:bg-dark-hover transition-colors">
                  {columnOrder.map((column) => {
                    if (!visibleColumns[column]) return null

                    const renderCell = () => {
                      switch (column) {
                        case 'image':
                          return (
                            <img
                              src={listing.image_url || '/placeholder-image.jpg'}
                              alt={listing.title}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                          )
                        case 'title':
                          return (
                            <div className="max-w-xs">
                              <div className="text-sm font-medium text-text-primary truncate">
                                {listing.title}
                              </div>
                              {listing.ebay_sku && (
                                <div className="text-xs text-text-tertiary mt-1">
                                  SKU: {listing.ebay_sku}
                                </div>
                              )}
                            </div>
                          )
                        case 'quantity':
                          return (
                            <div className="text-sm text-text-primary">
                              {listing.listing_status === 'Ended' ? 0 : (listing.quantity_available ?? 0)}
                            </div>
                          )
                        case 'currentPrice':
                          return (
                            <div className="text-sm font-bold text-green-600">${listing.current_price}</div>
                          )
                        case 'minimumPrice':
                          return (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={listing.minimum_price || ''}
                              onBlur={(e) => handleMinimumPriceUpdate(listing.id, e.target.value)}
                              className="w-20 px-2 py-1 text-sm border border-dark-border rounded-lg bg-dark-bg text-text-primary placeholder-text-tertiary"
                              placeholder="Set min"
                            />
                          )
                        case 'priceReductionEnabled':
                          return (
                            <div className="flex items-center">
                              <label
                                className={`relative inline-flex items-center ${
                                  (!listing.minimum_price || listing.minimum_price <= 0) && !listing.enable_auto_reduction
                                    ? 'cursor-not-allowed'
                                    : 'cursor-pointer'
                                }`}
                                title={(!listing.minimum_price || listing.minimum_price <= 0) && !listing.enable_auto_reduction
                                  ? 'Set a minimum price before enabling price reduction'
                                  : ''}
                              >
                                <input
                                  type="checkbox"
                                  checked={listing.enable_auto_reduction}
                                  onChange={() => handleTogglePriceReduction(listing)}
                                  disabled={togglePriceReductionMutation.isLoading}
                                  className="sr-only"
                                />
                                <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                                  listing.enable_auto_reduction ? 'bg-accent' : 'bg-dark-border'
                                }`}>
                                  <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 ease-in-out ${
                                    listing.enable_auto_reduction ? 'translate-x-5' : 'translate-x-0'
                                  }`}></div>
                                </div>
                              </label>
                              <span className={`ml-2 text-xs ${
                                listing.enable_auto_reduction ? 'text-success font-medium' : 'text-text-tertiary'
                              }`}>
                                {listing.enable_auto_reduction ? 'Active' : 'Paused'}
                              </span>
                            </div>
                          )
                        case 'strategy':
                          const currentStrategy = getStrategyDisplayInfo(listing, strategies)
                          return (
                            <select
                              value={listing.strategy_id || listing.reduction_strategy || ''}
                              onChange={(e) => handleStrategyUpdate(listing.id, e.target.value)}
                              className="text-sm border border-dark-border rounded-lg px-2 py-1 min-w-40 bg-dark-bg text-text-primary"
                            >
                              <option value="">No Strategy</option>
                              {strategies.map((strategy) => (
                                <option key={strategy.id} value={strategy.id}>
                                  {strategy.name}
                                </option>
                              ))}
                            </select>
                          )
                        case 'listingAge':
                          return (
                            <div className="text-sm text-text-primary">
                              {calculateListingAge(listing.created_at || new Date())}
                            </div>
                          )
                        case 'actions':
                          return (
                            <div className="flex space-x-1">
                              <a
                                href={listing.ebay_url || `https://www.ebay.com/itm/${listing.ebay_item_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-accent/10 text-accent border border-accent/30 px-2 py-1 rounded-lg text-xs hover:bg-accent/20 transition-colors"
                                title="Open this listing on eBay in a new tab"
                              >
                                View
                              </a>
                              <button
                                onClick={() => handleDeleteListing(listing.id)}
                                disabled={endListingMutation.isLoading}
                                className="bg-error/10 text-error border border-error/30 px-2 py-1 rounded-lg text-xs hover:bg-error/20 disabled:opacity-50 transition-colors"
                                title="Close this listing"
                              >
                                Close
                              </button>
                            </div>
                          )
                        default:
                          return null
                      }
                    }

                    const config = getColumnConfig(column)
                    return (
                      <td
                        key={column}
                        className={`px-2 py-3 ${column === 'actions' ? 'whitespace-nowrap text-sm font-medium' : 'whitespace-nowrap'} ${config.width || ''}`}
                      >
                        {renderCell()}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(!listings || listings.length === 0) && (
          <div className="text-center py-12">
            <div className="text-gray-500">
              No listings found.
            </div>
          </div>
        )}

        {/* Pagination Controls - Bottom (Desktop) */}
        {totalItems > 0 && totalPages > 1 && (
          <div className="mt-4 flex justify-center">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded text-sm ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Previous
              </button>

              {getPageNumbers().map((page, index) => (
                page === '...' ? (
                  <span key={`ellipsis-bottom-${index}`} className="px-2 text-gray-500">
                    ...
                  </span>
                ) : (
                  <button
                    key={`bottom-${page}`}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {page}
                  </button>
                )
              ))}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded text-sm ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls - Bottom (Mobile) */}
      {totalItems > 0 && totalPages > 1 && (
        <div className="lg:hidden flex justify-center">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-3 py-1 rounded text-sm ${
                currentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Previous
            </button>

            {getPageNumbers().map((page, index) => (
              page === '...' ? (
                <span key={`ellipsis-mobile-${index}`} className="px-2 text-gray-500">
                  ...
                </span>
              ) : (
                <button
                  key={`mobile-${page}`}
                  onClick={() => handlePageChange(page)}
                  className={`px-3 py-1 rounded text-sm ${
                    currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {page}
                </button>
              )
            ))}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-3 py-1 rounded text-sm ${
                currentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}