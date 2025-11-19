const { ApolloServer, gql } = require('apollo-server-lambda');
const DataLoader = require('dataloader');
const { createClient } = require('@supabase/supabase-js');

// =============================================
// CONFIGURATION
// =============================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// =============================================
// GRAPHQL SCHEMA
// =============================================

const typeDefs = gql`
  # Scalar types
  scalar DateTime
  scalar JSON

  # Main listing type
  type Listing {
    id: ID!
    userId: ID!
    ebayItemId: String
    sku: String!
    title: String!
    description: String
    category: String
    categoryId: String
    condition: String
    listingFormat: String
    listingStatus: String
    currentPrice: Float!
    originalPrice: Float
    currency: String
    minimumPrice: Float
    quantity: Int
    quantityAvailable: Int
    quantitySold: Int
    imageUrls: [String]
    primaryImageUrl: String
    priceReductionEnabled: Boolean
    reductionStrategy: String
    reductionPercentage: Float
    reductionInterval: Int
    lastPriceReduction: DateTime
    totalReductions: Int
    ebayAttributes: JSON
    lastSynced: DateTime
    syncStatus: String
    startTime: DateTime
    endTime: DateTime
    createdAt: DateTime
    updatedAt: DateTime

    # Relations
    priceHistory(limit: Int = 10): [PriceHistory]
    syncMetrics: SyncMetrics
  }

  # Price history type
  type PriceHistory {
    id: ID!
    listingId: ID!
    price: Float!
    previousPrice: Float
    changeType: String
    changeReason: String
    timestamp: DateTime!
  }

  # Sync metrics type
  type SyncMetrics {
    lastSyncDuration: Float
    apiCallsUsed: Int
    cacheHitRate: Float
    syncFrequency: String
  }

  # Listing connection for pagination
  type ListingConnection {
    edges: [ListingEdge]!
    pageInfo: PageInfo!
    totalCount: Int!
    aggregations: ListingAggregations
  }

  type ListingEdge {
    cursor: String!
    node: Listing!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # Aggregations
  type ListingAggregations {
    totalValue: Float
    averagePrice: Float
    totalQuantity: Int
    activeCount: Int
    categories: [CategoryCount]
    priceRanges: [PriceRange]
  }

  type CategoryCount {
    category: String!
    count: Int!
  }

  type PriceRange {
    min: Float!
    max: Float!
    count: Int!
  }

  # Filter inputs
  input ListingFilter {
    status: [String]
    categories: [String]
    priceMin: Float
    priceMax: Float
    priceReductionEnabled: Boolean
    searchQuery: String
    skus: [String]
  }

  input ListingSort {
    field: ListingSortField!
    direction: SortDirection!
  }

  enum ListingSortField {
    PRICE
    CREATED_AT
    UPDATED_AT
    TITLE
    QUANTITY
    LAST_SYNCED
  }

  enum SortDirection {
    ASC
    DESC
  }

  # Mutations input types
  input UpdateListingInput {
    id: ID!
    priceReductionEnabled: Boolean
    reductionStrategy: String
    reductionPercentage: Float
    minimumPrice: Float
    reductionInterval: Int
  }

  input CreateSyncJobInput {
    jobType: String!
    priority: Int
    listingIds: [ID]
  }

  # Subscription types
  type ListingUpdate {
    listing: Listing!
    updateType: String!
    previousValues: JSON
  }

  type PriceAlert {
    listing: Listing!
    oldPrice: Float!
    newPrice: Float!
    changePercentage: Float!
  }

  # Root types
  type Query {
    # Get single listing
    listing(id: ID!): Listing

    # Search listings with pagination
    searchListings(
      filter: ListingFilter
      sort: ListingSort
      first: Int
      after: String
      last: Int
      before: String
    ): ListingConnection!

    # Get price history for a listing
    getPriceHistory(
      listingId: ID!
      startDate: DateTime
      endDate: DateTime
      limit: Int
    ): [PriceHistory]!

    # Get user stats
    getUserStats: UserStats

    # Get sync status
    getSyncStatus: SyncStatus
  }

  type UserStats {
    totalListings: Int
    activeListings: Int
    totalValue: Float
    reductionEnabledCount: Int
    lastSync: DateTime
  }

  type SyncStatus {
    isRunning: Boolean
    lastRun: DateTime
    nextScheduled: DateTime
    queueLength: Int
  }

  type Mutation {
    # Update listing settings
    updateListing(input: UpdateListingInput!): Listing

    # Trigger sync
    triggerSync(input: CreateSyncJobInput!): SyncJob

    # Watch/unwatch listing
    watchListing(listingId: ID!, watch: Boolean!): Listing

    # Update price alert
    updatePriceAlert(
      listingId: ID!
      threshold: Float!
      enabled: Boolean!
    ): PriceAlertSettings
  }

  type SyncJob {
    id: ID!
    status: String!
    scheduledFor: DateTime!
  }

  type PriceAlertSettings {
    listingId: ID!
    threshold: Float!
    enabled: Boolean!
  }

  type Subscription {
    # Real-time listing updates
    listingUpdated(userId: ID!): ListingUpdate

    # Price drop alerts
    priceDropped(userId: ID!, threshold: Float): PriceAlert
  }
`;

// =============================================
// DATA LOADERS (Prevent N+1 Queries)
// =============================================

const createLoaders = (supabase, userId) => ({
  // Batch load listings by ID
  listingLoader: new DataLoader(async (ids) => {
    const { data } = await supabase
      .from('listings')
      .select('*')
      .in('id', ids)
      .eq('user_id', userId);

    const listingMap = {};
    data.forEach(listing => {
      listingMap[listing.id] = listing;
    });

    return ids.map(id => listingMap[id]);
  }),

  // Batch load price history
  priceHistoryLoader: new DataLoader(async (listingIds) => {
    const { data } = await supabase
      .from('price_history')
      .select('*')
      .in('listing_id', listingIds)
      .order('timestamp', { ascending: false });

    const historyMap = {};
    data.forEach(history => {
      if (!historyMap[history.listing_id]) {
        historyMap[history.listing_id] = [];
      }
      historyMap[history.listing_id].push(history);
    });

    return listingIds.map(id => historyMap[id] || []);
  }),

  // Batch load categories
  categoryLoader: new DataLoader(async (categoryIds) => {
    const { data } = await supabase
      .from('category_stats')
      .select('*')
      .in('category_id', categoryIds);

    const categoryMap = {};
    data.forEach(cat => {
      categoryMap[cat.category_id] = cat;
    });

    return categoryIds.map(id => categoryMap[id]);
  })
});

// =============================================
// RESOLVERS
// =============================================

const resolvers = {
  Query: {
    // Get single listing
    listing: async (_, { id }, { loaders }) => {
      return loaders.listingLoader.load(id);
    },

    // Search listings with advanced filtering and pagination
    searchListings: async (_, args, { supabase, userId }) => {
      const {
        filter = {},
        sort = { field: 'CREATED_AT', direction: 'DESC' },
        first,
        after,
        last,
        before
      } = args;

      let query = supabase
        .from('listings')
        .select('*, price_history(*)', { count: 'exact' })
        .eq('user_id', userId)
        .is('archived_at', null);

      // Apply filters
      if (filter.status?.length > 0) {
        query = query.in('listing_status', filter.status);
      }

      if (filter.categories?.length > 0) {
        query = query.in('category_id', filter.categories);
      }

      if (filter.priceMin !== undefined) {
        query = query.gte('current_price', filter.priceMin);
      }

      if (filter.priceMax !== undefined) {
        query = query.lte('current_price', filter.priceMax);
      }

      if (filter.priceReductionEnabled !== undefined) {
        query = query.eq('price_reduction_enabled', filter.priceReductionEnabled);
      }

      if (filter.searchQuery) {
        query = query.textSearch('title', filter.searchQuery);
      }

      if (filter.skus?.length > 0) {
        query = query.in('sku', filter.skus);
      }

      // Apply sorting
      const sortField = sort.field.toLowerCase().replace('_', '');
      const sortOrder = sort.direction === 'DESC' ? { ascending: false } : { ascending: true };
      query = query.order(sortField, sortOrder);

      // Apply cursor-based pagination
      const limit = first || last || 20;
      query = query.limit(limit);

      if (after) {
        const cursor = Buffer.from(after, 'base64').toString('utf-8');
        query = query.gt('id', cursor);
      }

      if (before) {
        const cursor = Buffer.from(before, 'base64').toString('utf-8');
        query = query.lt('id', cursor);
      }

      const { data: listings, count, error } = await query;

      if (error) {
        throw error;
      }

      // Build connection response
      const edges = listings.map(listing => ({
        cursor: Buffer.from(listing.id).toString('base64'),
        node: listing
      }));

      // Calculate aggregations
      const aggregations = await calculateAggregations(supabase, userId, filter);

      return {
        edges,
        pageInfo: {
          hasNextPage: edges.length === limit,
          hasPreviousPage: !!after || !!before,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: count,
        aggregations
      };
    },

    // Get price history
    getPriceHistory: async (_, { listingId, startDate, endDate, limit = 100 }, { supabase }) => {
      let query = supabase
        .from('price_history')
        .select('*')
        .eq('listing_id', listingId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (startDate) {
        query = query.gte('timestamp', startDate);
      }

      if (endDate) {
        query = query.lte('timestamp', endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data;
    },

    // Get user stats
    getUserStats: async (_, __, { supabase, userId }) => {
      const { data, error } = await supabase
        .from('user_listing_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        throw error;
      }

      return {
        totalListings: data.total_listings,
        activeListings: data.active_listings,
        totalValue: data.avg_price * data.total_listings,
        reductionEnabledCount: data.reduction_enabled,
        lastSync: data.last_sync
      };
    },

    // Get sync status
    getSyncStatus: async (_, __, { supabase, userId }) => {
      const { data: jobs } = await supabase
        .from('sync_queue')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['pending', 'processing']);

      const isRunning = jobs?.some(j => j.status === 'processing') || false;
      const lastRun = jobs?.find(j => j.completed_at)?.completed_at;
      const nextScheduled = jobs?.find(j => j.status === 'pending')?.scheduled_for;

      return {
        isRunning,
        lastRun,
        nextScheduled,
        queueLength: jobs?.length || 0
      };
    }
  },

  Mutation: {
    // Update listing settings
    updateListing: async (_, { input }, { supabase, userId }) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('listings')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    // Trigger sync
    triggerSync: async (_, { input }, { supabase, userId }) => {
      const { data, error } = await supabase
        .from('sync_queue')
        .insert({
          user_id: userId,
          job_type: input.jobType,
          priority: input.priority || 5,
          payload: { listing_ids: input.listingIds },
          scheduled_for: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        id: data.id,
        status: data.status,
        scheduledFor: data.scheduled_for
      };
    }
  },

  Listing: {
    // Resolve price history using DataLoader
    priceHistory: async (parent, { limit = 10 }, { loaders }) => {
      const history = await loaders.priceHistoryLoader.load(parent.id);
      return history.slice(0, limit);
    },

    // Resolve sync metrics
    syncMetrics: async (parent, _, { supabase }) => {
      const { data } = await supabase
        .from('sync_metrics')
        .select('*')
        .eq('metadata->>listing_id', parent.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (!data) return null;

      return {
        lastSyncDuration: data.value,
        apiCallsUsed: data.metadata?.api_calls || 0,
        cacheHitRate: data.metadata?.cache_hit_rate || 0,
        syncFrequency: calculateSyncFrequency(parent.last_synced)
      };
    }
  },

  // Custom scalar resolvers
  DateTime: {
    serialize: (value) => value, // Assuming ISO string format
    parseValue: (value) => value,
    parseLiteral: (ast) => ast.value
  },

  JSON: {
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: (ast) => JSON.parse(ast.value)
  }
};

// =============================================
// HELPER FUNCTIONS
// =============================================

// Calculate aggregations for listings
async function calculateAggregations(supabase, userId, filter) {
  // Base query for aggregations
  let query = supabase
    .from('listings')
    .select('current_price, quantity, category, listing_status')
    .eq('user_id', userId)
    .is('archived_at', null);

  // Apply same filters as main query
  if (filter.status?.length > 0) {
    query = query.in('listing_status', filter.status);
  }

  if (filter.categories?.length > 0) {
    query = query.in('category_id', filter.categories);
  }

  const { data } = await query;

  if (!data) {
    return null;
  }

  // Calculate aggregations
  const totalValue = data.reduce((sum, l) => sum + (l.current_price * l.quantity), 0);
  const averagePrice = data.reduce((sum, l) => sum + l.current_price, 0) / data.length;
  const totalQuantity = data.reduce((sum, l) => sum + l.quantity, 0);
  const activeCount = data.filter(l => l.listing_status === 'Active').length;

  // Category counts
  const categoryCounts = {};
  data.forEach(l => {
    if (l.category) {
      categoryCounts[l.category] = (categoryCounts[l.category] || 0) + 1;
    }
  });

  const categories = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    count
  }));

  // Price ranges
  const priceRanges = [
    { min: 0, max: 25, count: 0 },
    { min: 25, max: 50, count: 0 },
    { min: 50, max: 100, count: 0 },
    { min: 100, max: 500, count: 0 },
    { min: 500, max: Infinity, count: 0 }
  ];

  data.forEach(l => {
    const range = priceRanges.find(r => l.current_price >= r.min && l.current_price < r.max);
    if (range) {
      range.count++;
    }
  });

  return {
    totalValue,
    averagePrice,
    totalQuantity,
    activeCount,
    categories,
    priceRanges: priceRanges.filter(r => r.count > 0)
  };
}

// Calculate sync frequency label
function calculateSyncFrequency(lastSynced) {
  if (!lastSynced) return 'Never';

  const hours = (Date.now() - new Date(lastSynced).getTime()) / (1000 * 60 * 60);

  if (hours < 1) return 'Real-time';
  if (hours < 6) return 'Frequent';
  if (hours < 24) return 'Daily';
  if (hours < 168) return 'Weekly';
  return 'Infrequent';
}

// =============================================
// APOLLO SERVER SETUP
// =============================================

const createContext = async ({ event }) => {
  // Get auth token from headers
  const token = event.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new Error('Authentication required');
  }

  // Initialize Supabase client with user token
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Get user
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid authentication token');
  }

  // Create loaders for this request
  const loaders = createLoaders(supabase, user.id);

  return {
    supabase,
    userId: user.id,
    loaders
  };
};

// Create Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: createContext,

  // Performance optimizations
  persistedQueries: {
    cache: true,
    ttl: 300 // 5 minutes
  },

  // Security
  validationRules: [
    require('graphql-depth-limit')(5), // Max query depth
    require('graphql-query-complexity').createComplexityLimitRule(1000) // Max complexity
  ],

  // Caching
  cacheControl: {
    defaultMaxAge: 60, // 1 minute default cache
    calculateHttpHeaders: true
  },

  // Monitoring
  plugins: [
    {
      requestDidStart() {
        return {
          willSendResponse(requestContext) {
            // Log query performance
            const duration = Date.now() - requestContext.request.http.body.startTime;
            console.log(`Query completed in ${duration}ms`);
          }
        };
      }
    }
  ]
});

// Export handler
exports.handler = server.createHandler({
  cors: {
    origin: '*',
    credentials: true
  }
});