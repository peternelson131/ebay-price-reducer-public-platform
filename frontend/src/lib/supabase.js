import { createClient } from '@supabase/supabase-js'

// Real Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Demo mode configuration - ONLY enable if explicitly set to true
const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

// Check if we're in localStorage auth mode (no Supabase configured)
const isLocalStorageMode = !supabaseUrl || !supabaseAnonKey

// Initialize real Supabase client
let realSupabaseClient = null
if (!isDemoMode) {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('📦 Supabase not configured - using localStorage mode')
    // Using localStorage mode when Supabase is not configured
  } else {
    realSupabaseClient = createClient(supabaseUrl, supabaseAnonKey)
    console.log('🔌 Supabase client initialized with real configuration')
  }
} else {
  console.log('🎭 Demo mode explicitly enabled')
}

// Mock data for demo mode
const mockListings = [
  {
    id: '1',
    ebay_item_id: '123456789',
    title: 'Vintage Camera - Canon AE-1 35mm Film Camera',
    description: 'Classic film camera in excellent condition',
    current_price: 189.99,
    original_price: 229.99,
    currency: 'USD',
    category: 'Electronics',
    category_id: '625',
    condition: 'Used',
    image_urls: ['https://picsum.photos/300/300?random=1'],
    listing_format: 'FixedPriceItem',
    quantity: 1,
    quantity_available: 1,
    listing_status: 'Active',
    start_time: '2024-01-15T00:00:00Z',
    end_time: '2024-02-15T00:00:00Z',
    view_count: 45,
    watch_count: 8,
    price_reduction_enabled: true,
    reduction_strategy: 'fixed_percentage',
    reduction_percentage: 5,
    minimum_price: 150.00,
    reduction_interval: 7,
    last_price_reduction: '2024-01-20T00:00:00Z',
    next_price_reduction: '2024-01-27T00:00:00Z',
    market_average_price: 195.50,
    market_lowest_price: 175.00,
    market_highest_price: 225.00,
    market_competitor_count: 15,
    last_market_analysis: new Date().toISOString(),
    last_synced_with_ebay: new Date().toISOString(),
    created_at: '2024-01-15T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    ebay_item_id: '987654321',
    title: 'Apple iPhone 13 Pro - 128GB - Graphite (Unlocked)',
    description: 'iPhone in great condition with minor wear',
    current_price: 649.99,
    original_price: 749.99,
    currency: 'USD',
    category: 'Cell Phones & Smartphones',
    category_id: '9355',
    condition: 'Used',
    image_urls: ['https://picsum.photos/300/300?random=2'],
    listing_format: 'FixedPriceItem',
    quantity: 1,
    quantity_available: 1,
    listing_status: 'Active',
    start_time: '2024-01-10T00:00:00Z',
    end_time: '2024-02-10T00:00:00Z',
    view_count: 127,
    watch_count: 23,
    price_reduction_enabled: true,
    reduction_strategy: 'market_based',
    reduction_percentage: 3,
    minimum_price: 550.00,
    reduction_interval: 5,
    last_price_reduction: '2024-01-22T00:00:00Z',
    next_price_reduction: '2024-01-27T00:00:00Z',
    market_average_price: 675.00,
    market_lowest_price: 620.00,
    market_highest_price: 720.00,
    market_competitor_count: 28,
    last_market_analysis: new Date().toISOString(),
    last_synced_with_ebay: new Date().toISOString(),
    created_at: '2024-01-10T00:00:00Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    ebay_item_id: '456789123',
    title: 'Nike Air Jordan 1 Retro High OG - Size 10.5',
    description: 'Classic sneakers in good condition',
    current_price: 145.00,
    original_price: 180.00,
    currency: 'USD',
    category: 'Athletic Shoes',
    category_id: '15709',
    condition: 'Used',
    image_urls: ['https://picsum.photos/300/300?random=3'],
    listing_format: 'FixedPriceItem',
    quantity: 1,
    quantity_available: 1,
    listing_status: 'Active',
    start_time: '2024-01-12T00:00:00Z',
    end_time: '2024-02-12T00:00:00Z',
    view_count: 89,
    watch_count: 15,
    price_reduction_enabled: false,
    reduction_strategy: 'time_based',
    reduction_percentage: 7,
    minimum_price: 120.00,
    reduction_interval: 10,
    last_price_reduction: '2024-01-18T00:00:00Z',
    next_price_reduction: null,
    market_average_price: 155.00,
    market_lowest_price: 130.00,
    market_highest_price: 200.00,
    market_competitor_count: 12,
    last_market_analysis: new Date().toISOString(),
    last_synced_with_ebay: new Date().toISOString(),
    created_at: '2024-01-12T00:00:00Z',
    updated_at: new Date().toISOString(),
  }
]

const mockUser = {
  id: 'demo-user-id',
  email: 'demo@example.com',
  name: 'Demo User'
}

const mockStrategies = [
  {
    id: '1',
    user_id: 'demo-user-id',
    name: 'Conservative Reduction',
    reduction_type: 'percentage',
    reduction_amount: 5,
    frequency_days: 7,
    active: true,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z'
  },
  {
    id: '2',
    user_id: 'demo-user-id',
    name: 'Aggressive Reduction',
    reduction_type: 'percentage',
    reduction_amount: 10,
    frequency_days: 3,
    active: true,
    created_at: '2024-01-16T00:00:00Z',
    updated_at: '2024-01-16T00:00:00Z'
  },
  {
    id: '3',
    user_id: 'demo-user-id',
    name: 'Fixed Dollar Drop',
    reduction_type: 'dollar',
    reduction_amount: 10.00,
    frequency_days: 5,
    active: true,
    created_at: '2024-01-17T00:00:00Z',
    updated_at: '2024-01-17T00:00:00Z'
  }
]

// Simulate network delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Log demo mode status
if (isDemoMode) {
  console.log('🎭 Running in DEMO MODE with mock data')
} else {
  console.log('Real Supabase mode - not implemented yet')
}

// Mock Supabase client for demo
const mockSupabase = {
  auth: {
    getUser: async () => {
      await delay(100)
      return { data: { user: mockUser }, error: null }
    },
    getSession: async () => {
      await delay(100)
      return { data: { session: { user: mockUser } }, error: null }
    },
    onAuthStateChange: (callback) => {
      setTimeout(() => callback('SIGNED_IN', { user: mockUser }), 100)
      return { data: { subscription: { unsubscribe: () => {} } } }
    },
    signUp: async (credentials) => {
      await delay(500)
      return { data: { user: mockUser }, error: null }
    },
    signInWithPassword: async (credentials) => {
      await delay(500)
      return { data: { user: mockUser }, error: null }
    },
    signOut: async () => {
      await delay(300)
      return { error: null }
    },
    resetPasswordForEmail: async (email) => {
      await delay(300)
      return { error: null }
    }
  }
}

const realSupabase = realSupabaseClient || {
  auth: {
    getUser: () => Promise.reject(new Error('Real Supabase not configured')),
    getSession: () => Promise.reject(new Error('Real Supabase not configured')),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  }
}

// Export the appropriate client
export const supabase = isDemoMode ? mockSupabase : realSupabase

// Mock APIs for demo
const mockListingsAPI = {
  async getListings(filters = {}) {
    await delay(300)
    const { status = 'Active' } = filters

    let filteredListings = mockListings
    if (status !== 'all') {
      filteredListings = mockListings.filter(listing => listing.listing_status === status)
    }

    return filteredListings
  },

  async getListing(id) {
    await delay(200)
    const listing = mockListings.find(l => l.id === id)
    if (!listing) throw new Error('Listing not found')
    return listing
  },

  async updateListing(id, updates) {
    await delay(300)
    const listingIndex = mockListings.findIndex(l => l.id === id)
    if (listingIndex === -1) throw new Error('Listing not found')

    mockListings[listingIndex] = {
      ...mockListings[listingIndex],
      ...updates,
      updated_at: new Date().toISOString()
    }
    return mockListings[listingIndex]
  },

  async deleteListing(id) {
    await delay(200)
    const listingIndex = mockListings.findIndex(l => l.id === id)
    if (listingIndex === -1) throw new Error('Listing not found')
    mockListings.splice(listingIndex, 1)
  },

  async endListing(id) {
    await delay(500)
    const listing = mockListings.find(l => l.id === id)
    if (!listing) throw new Error('Listing not found')

    // In mock mode, just update the status
    listing.listing_status = 'Ended'
    listing.updated_at = new Date().toISOString()

    return { message: 'Listing ended successfully on eBay (mock)', listing }
  },

  async recordPriceReduction(listingId, newPrice, reason = 'manual') {
    await delay(400)
    const listing = mockListings.find(l => l.id === listingId)
    if (!listing) throw new Error('Listing not found')

    const nextReduction = new Date()
    nextReduction.setDate(nextReduction.getDate() + listing.reduction_interval)

    listing.current_price = newPrice
    listing.last_price_reduction = new Date().toISOString()
    listing.next_price_reduction = nextReduction.toISOString()
    listing.updated_at = new Date().toISOString()

    // Note: price_history table has been removed from database schema

    return listing
  },

  async createListing(listingData) {
    await delay(800)
    // In mock mode, just create a mock listing
    const newListing = {
      id: String(Date.now()),
      ebay_item_id: `mock-${Date.now()}`,
      ...listingData,
      listing_status: 'Active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    mockListings.push(newListing)
    return newListing
  }
}

const realListingsAPI = realSupabaseClient ? {
  async getListings(filters = {}) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { status = 'Active' } = filters

    let query = realSupabaseClient
      .from('listings')
      .select('*')
      .eq('user_id', user.id)

    // ALWAYS exclude hidden listings from all views
    // Hidden listings are those manually closed by the user
    query = query.eq('hidden', false)

    if (status !== 'all' && status !== 'Active') {
      // Filter by specific status (e.g., 'Ended')
      query = query.eq('listing_status', status)
    } else if (status === 'Active') {
      // Only show active listings
      query = query.eq('listing_status', 'Active')
    }
    // If status === 'all', show both Active and Ended (but not hidden)

    // Add default sort order to ensure consistent ordering
    query = query.order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) throw error

    return data || []
  },

  async getListing(id) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await realSupabaseClient
      .from('listings')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) throw error
    return data
  },

  async updateListing(id, updates) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await realSupabaseClient
      .from('listings')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async deleteListing(id) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { error } = await realSupabaseClient
      .from('listings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
  },

  async endListing(id) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    // Get session token for API call
    const { data: { session } } = await realSupabaseClient.auth.getSession()
    if (!session) throw new Error('No active session')

    // Call Netlify function to end listing on eBay
    const response = await fetch('/.netlify/functions/end-listing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ listingId: id })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to end listing')
    }

    return data
  },

  async recordPriceReduction(listingId, newPrice, reason = 'manual') {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    // Get session token for API call
    const { data: { session } } = await realSupabaseClient.auth.getSession()
    if (!session) throw new Error('No active session')

    // Call Netlify function to reduce price (which also updates eBay)
    const response = await fetch(`/.netlify/functions/reduce-price/${listingId}/reduce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ customPrice: newPrice })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reduce price')
    }

    return data.listing
  },

  async createListing(listingData) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    // Get session token for API call
    const { data: { session } } = await realSupabaseClient.auth.getSession()
    if (!session) throw new Error('No active session')

    // Call Netlify function to create listing on eBay
    const response = await fetch('/.netlify/functions/create-ebay-listing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(listingData)
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to create listing')
    }

    return data
  }
} : {
  getListings: () => Promise.reject(new Error('Real Supabase not configured')),
  getListing: () => Promise.reject(new Error('Real Supabase not configured')),
  updateListing: () => Promise.reject(new Error('Real Supabase not configured')),
  deleteListing: () => Promise.reject(new Error('Real Supabase not configured')),
  endListing: () => Promise.reject(new Error('Real Supabase not configured')),
  recordPriceReduction: () => Promise.reject(new Error('Real Supabase not configured')),
  createListing: () => Promise.reject(new Error('Real Supabase not configured'))
}

export const listingsAPI = isDemoMode ? mockListingsAPI : realListingsAPI

// Strategies API
const mockStrategiesAPI = {
  async getStrategies() {
    await delay(200)
    return [...mockStrategies]
  },

  async getStrategy(id) {
    await delay(150)
    const strategy = mockStrategies.find(s => s.id === id)
    if (!strategy) throw new Error('Strategy not found')
    return strategy
  },

  async createStrategy(strategyData) {
    await delay(300)
    const newStrategy = {
      id: String(Date.now()),
      user_id: mockUser.id,
      ...strategyData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    mockStrategies.push(newStrategy)
    return newStrategy
  },

  async updateStrategy(id, updates) {
    await delay(300)
    const strategyIndex = mockStrategies.findIndex(s => s.id === id)
    if (strategyIndex === -1) throw new Error('Strategy not found')

    mockStrategies[strategyIndex] = {
      ...mockStrategies[strategyIndex],
      ...updates,
      updated_at: new Date().toISOString()
    }
    return mockStrategies[strategyIndex]
  },

  async deleteStrategy(id) {
    await delay(200)
    const strategyIndex = mockStrategies.findIndex(s => s.id === id)
    if (strategyIndex === -1) throw new Error('Strategy not found')

    // Check if strategy is in use by any listings
    const listingUsingStrategy = mockListings.find(l => l.strategy_id === id)
    if (listingUsingStrategy) {
      throw new Error('Cannot delete strategy that is in use by listings')
    }

    mockStrategies.splice(strategyIndex, 1)
  }
}

const realStrategiesAPI = realSupabaseClient ? {
  async getStrategies() {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await realSupabaseClient
      .from('strategies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async getStrategy(id) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await realSupabaseClient
      .from('strategies')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) throw error
    return data
  },

  async createStrategy(strategyData) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await realSupabaseClient
      .from('strategies')
      .insert({
        user_id: user.id,
        ...strategyData
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateStrategy(id, updates) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await realSupabaseClient
      .from('strategies')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async deleteStrategy(id) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    // The RLS policy will prevent deletion if strategy is in use
    const { error } = await realSupabaseClient
      .from('strategies')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      // Provide user-friendly error message
      if (error.code === 'P0001') {
        throw new Error('Cannot delete strategy that is in use by listings')
      }
      throw error
    }
  }
} : {
  getStrategies: () => Promise.reject(new Error('Real Supabase not configured')),
  getStrategy: () => Promise.reject(new Error('Real Supabase not configured')),
  createStrategy: () => Promise.reject(new Error('Real Supabase not configured')),
  updateStrategy: () => Promise.reject(new Error('Real Supabase not configured')),
  deleteStrategy: () => Promise.reject(new Error('Real Supabase not configured'))
}

export const strategiesAPI = isDemoMode ? mockStrategiesAPI : realStrategiesAPI

// Note: priceHistoryAPI removed - price_history table has been dropped from database schema

// localStorage user API for when Supabase is not configured
const localStorageUserAPI = {
  async getProfile() {
    // Get user data from localStorage (set by App.jsx)
    const userData = localStorage.getItem('userData')
    if (!userData) {
      throw new Error('User not authenticated')
    }

    const user = JSON.parse(userData)

    // Get eBay connection status from localStorage
    const ebayConnectionData = localStorage.getItem('ebayConnection')
    const ebayConnection = ebayConnectionData ? JSON.parse(ebayConnectionData) : {}

    return {
      id: user.id || 'local-user-1',
      email: user.email || 'user@example.com',
      name: user.name || user.username || 'User',
      default_reduction_strategy: 'fixed_percentage',
      default_reduction_percentage: 5,
      default_reduction_interval: 7,
      ebay_refresh_token: ebayConnection.refresh_token || null,
      ebay_connection_status: ebayConnection.status || 'disconnected',
      ebay_connected_at: ebayConnection.connected_at || null,
      ebay_user_id: ebayConnection.user_id || null,
      ebay_refresh_token_expires_at: ebayConnection.refresh_token_expires_at || null,
      subscription_plan: 'free',
      listing_limit: 10,
      keepa_api_key: null
    }
  },

  async updateProfile(updates) {
    const userData = localStorage.getItem('userData')
    if (!userData) {
      throw new Error('User not authenticated')
    }

    const user = JSON.parse(userData)
    const updatedUser = { ...user, ...updates }
    localStorage.setItem('userData', JSON.stringify(updatedUser))

    // If updating eBay connection data, store separately
    if (updates.ebay_connection_status !== undefined ||
        updates.ebay_refresh_token !== undefined ||
        updates.ebay_connected_at !== undefined ||
        updates.ebay_user_id !== undefined ||
        updates.ebay_refresh_token_expires_at !== undefined) {
      const ebayConnection = {
        status: updates.ebay_connection_status,
        refresh_token: updates.ebay_refresh_token,
        connected_at: updates.ebay_connected_at,
        user_id: updates.ebay_user_id,
        refresh_token_expires_at: updates.ebay_refresh_token_expires_at
      }
      localStorage.setItem('ebayConnection', JSON.stringify(ebayConnection))
    }

    return updatedUser
  },

  async getAuthToken() {
    // Return a simple token for localStorage mode
    const userData = localStorage.getItem('userData')
    if (!userData) {
      throw new Error('User not authenticated')
    }
    return 'localStorage-auth-token-' + Date.now()
  }
}

const mockUserAPI = {
  async getProfile() {
    await delay(200)
    return {
      id: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      default_reduction_strategy: 'fixed_percentage',
      default_reduction_percentage: 5,
      default_reduction_interval: 7,
      ebay_refresh_token: null,
      ebay_connection_status: 'disconnected',
      ebay_connected_at: null,
      subscription_plan: 'free',
      listing_limit: 10,
      keepa_api_key: null // Add keepa_api_key field for mock
    }
  },

  async updateProfile(updates) {
    await delay(300)
    return { ...mockUser, ...updates }
  },

  async getAuthToken() {
    // Return a mock token for demo mode
    return 'mock-auth-token-' + Date.now()
  }
}

const realUserAPI = realSupabaseClient ? {
  async getProfile() {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    console.log('🔍 Getting profile for user:', user.id)

    // Try to get user profile from users table
    const { data, error } = await realSupabaseClient
      .from('users')
      .select(`
        id, email, name, created_at, updated_at,
        ebay_refresh_token, ebay_user_id, ebay_connection_status, ebay_connected_at, ebay_refresh_token_expires_at,
        default_reduction_strategy, default_reduction_percentage, default_reduction_interval,
        email_notifications, price_reduction_alerts,
        subscription_plan, subscription_active, subscription_expires_at, listing_limit,
        is_active, last_login, login_count,
        keepa_api_key
      `)
      .eq('id', user.id)
      .single()

    // If user profile exists in users table, return it
    if (!error && data) {
      console.log('✅ Found user profile in database:', data)
      return data
    }

    console.log('⚠️ User profile not found in database, creating profile:', error?.message)

    // If user doesn't exist in users table, create it
    const newUserProfile = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      // eBay credentials
      ebay_refresh_token: null,
      ebay_user_id: null,
      ebay_connection_status: 'disconnected',
      ebay_connected_at: null,
      ebay_refresh_token_expires_at: null,

      // User preferences with schema defaults
      default_reduction_strategy: 'fixed_percentage',
      default_reduction_percentage: 5,
      default_reduction_interval: 7,
      email_notifications: true,
      price_reduction_alerts: true,

      // Subscription info with schema defaults
      subscription_plan: 'free',
      subscription_active: true,
      subscription_expires_at: null,
      listing_limit: 10,

      // Account status with schema defaults
      is_active: true,
      last_login: null,
      login_count: 0,

      // Keepa integration
      keepa_api_key: null
    }

    const { data: insertedData, error: insertError } = await realSupabaseClient
      .from('users')
      .insert(newUserProfile)
      .select()
      .single()

    if (insertError) {
      console.error('❌ Error creating user profile:', insertError)
      // Return fallback profile even if insert fails
      return newUserProfile
    }

    console.log('✅ Created user profile:', insertedData)
    return insertedData
  },

  async updateProfile(updates) {
    const { data: { user } } = await realSupabaseClient.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    // First check if user exists in the users table
    const { data: existingUser } = await realSupabaseClient
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!existingUser) {
      throw new Error('User profile not found. Please complete your profile setup.')
    }

    const { data, error } = await realSupabaseClient
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select()

    if (error) throw error

    // Return the first (and should be only) updated record
    return data && data.length > 0 ? data[0] : null
  },

  async getAuthToken() {
    // Get the session token from Supabase auth
    const { data: { session } } = await realSupabaseClient.auth.getSession()
    if (!session?.access_token) throw new Error('No valid session')
    return session.access_token
  }
} : {
  getProfile: () => Promise.reject(new Error('Real Supabase not configured')),
  updateProfile: () => Promise.reject(new Error('Real Supabase not configured')),
  getAuthToken: () => Promise.reject(new Error('Real Supabase not configured'))
}

// Choose the appropriate API based on configuration
export const userAPI = isDemoMode ? mockUserAPI : (isLocalStorageMode ? localStorageUserAPI : realUserAPI)

// Debug logging
console.log('🔍 API Mode Debug:', {
  isDemoMode,
  isLocalStorageMode,
  hasSupabaseUrl: !!supabaseUrl,
  hasSupabaseKey: !!supabaseAnonKey,
  hasRealClient: !!realSupabaseClient,
  demoModeEnv: import.meta.env.VITE_DEMO_MODE,
  supabaseUrl: supabaseUrl?.substring(0, 30) + '...',
  usingAPI: isDemoMode ? 'mockUserAPI' : (isLocalStorageMode ? 'localStorageUserAPI' : 'realUserAPI')
})

const mockAuthAPI = {
  async signUp(email, password, userData = {}) {
    await delay(500)
    return { data: { user: mockUser }, error: null }
  },

  async signIn(email, password) {
    await delay(500)
    return { data: { user: mockUser }, error: null }
  },

  async signOut() {
    await delay(300)
    return { error: null }
  },

  async resetPassword(email) {
    await delay(300)
    return { error: null }
  },

  async updatePassword(newPassword) {
    await delay(300)
    return { error: null }
  }
}

const realAuthAPI = realSupabaseClient ? {
  signUp: async (email, password, userData = {}) => {
    return await realSupabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: userData
      }
    })
  },
  signIn: async (email, password) => {
    return await realSupabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    })
  },
  signOut: async () => {
    return await realSupabaseClient.auth.signOut()
  },
  resetPassword: async (email) => {
    return await realSupabaseClient.auth.resetPasswordForEmail(email)
  },
  updatePassword: async (newPassword) => {
    return await realSupabaseClient.auth.updateUser({ password: newPassword })
  }
} : {
  signUp: () => Promise.reject(new Error('Real Supabase not configured')),
  signIn: () => Promise.reject(new Error('Real Supabase not configured')),
  signOut: () => Promise.reject(new Error('Real Supabase not configured')),
  resetPassword: () => Promise.reject(new Error('Real Supabase not configured')),
  updatePassword: () => Promise.reject(new Error('Real Supabase not configured'))
}

export const authAPI = isDemoMode ? mockAuthAPI : realAuthAPI

// Table names (for compatibility)
export const TABLES = {
  USERS: 'users',
  LISTINGS: 'listings',
  STRATEGIES: 'strategies'
  // Note: PRICE_HISTORY, SYNC_ERRORS, MONITOR_JOBS tables have been dropped from database schema
}