// API Service for eBay Price Reducer
// Connects frontend to Netlify Functions backend

import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Get authentication token from Supabase
  async getAuthToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  // Helper method for making requests with retry logic
  async request(endpoint, options = {}, retries = 3) {
    const url = `${this.baseURL}${endpoint}`;
    let lastError;

    // Get auth token
    const token = await this.getAuthToken();

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const config = {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers,
          },
          ...options,
        };

        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
          // Don't retry client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
          }

          // Retry server errors (5xx) and network errors
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        return data;
      } catch (error) {
        lastError = error;

        // Don't retry on abort or client errors
        if (error.name === 'AbortError' || error.message.includes('HTTP error!')) {
          throw error;
        }

        // Retry network errors
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.warn(`API request failed, retrying in ${delay}ms...`, error);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    logger.error(`API Error for ${endpoint} after ${retries} retries:`, lastError);
    throw lastError;
  }

  // Generic HTTP methods
  async get(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'GET',
      ...options
    });
  }

  async post(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    });
  }

  async put(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      ...options
    });
  }

  // Authentication & User Management
  async testEbayConnection() {
    return this.request('/test-ebay-connection', {
      method: 'GET'
    });
  }

  // Listings Management
  async getEbayListings(page = 1, limit = 100) {
    return this.request(`/get-ebay-listings?page=${page}&limit=${limit}`, {
      method: 'GET'
    });
  }

  async syncListings(userId) {
    return this.request('/sync-listings', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  async togglePriceReduction(itemId, userId, enabled) {
    return this.request('/toggle-price-reduction', {
      method: 'POST',
      body: JSON.stringify({ itemId, userId, enabled })
    });
  }

  async updateListingStrategy(listingId, strategyId, userId) {
    return this.request('/update-listing-strategy', {
      method: 'POST',
      body: JSON.stringify({ listingId, strategyId, userId })
    });
  }

  async updateItemPrice(itemId, newPrice) {
    return this.request('/update-item-price', {
      method: 'POST',
      body: JSON.stringify({ itemId, newPrice })
    });
  }

  // Price Reduction Engine
  async runPriceReduction() {
    return this.request('/price-reduction-engine', {
      method: 'POST'
    });
  }

  async manualPriceReduction(currentUserOnly = true) {
    return this.request(`/manual-price-reduction?currentUserOnly=${currentUserOnly}`, {
      method: 'POST'
    });
  }

  async getPriceChanges(days = 30, limit = 50) {
    return this.request(`/get-price-changes?days=${days}&limit=${limit}`, {
      method: 'GET'
    });
  }

  async getPriceReductionLogs(days = 10, limit = 100, type = null) {
    const typeParam = type ? `&type=${type}` : '';
    return this.request(`/get-price-reduction-logs?days=${days}&limit=${limit}${typeParam}`, {
      method: 'GET'
    });
  }

  // Market Analysis
  async analyzeMarket(itemId = null, keywords = null, categoryId = null) {
    return this.request('/market-analysis', {
      method: 'POST',
      body: JSON.stringify({ itemId, keywords, categoryId })
    });
  }

  // Notifications
  async sendNotification(userId, type, title, message, data = {}) {
    return this.request('/notification-service', {
      method: 'POST',
      body: JSON.stringify({ userId, type, title, message, data })
    });
  }

  // Scheduled Jobs (for admin/testing)
  async runScheduledJob(jobType = 'all') {
    return this.request(`/scheduled-jobs?job=${jobType}`, {
      method: 'POST'
    });
  }

  // Import existing listings (from the existing function)
  async importListings(userId, listings) {
    return this.request('/import-listings', {
      method: 'POST',
      body: JSON.stringify({ userId, listings })
    });
  }

  // Reduce specific price (from existing function)
  async reducePrice(itemId, userId, strategy = 'default') {
    return this.request('/reduce-price', {
      method: 'POST',
      body: JSON.stringify({ itemId, userId, strategy })
    });
  }

  // Monitor scheduled price reductions
  async monitorScheduledReductions() {
    return this.request('/scheduled-price-monitor', {
      method: 'GET'
    });
  }

  // eBay OAuth Management
  async getEbayAuthUrl() {
    return this.request('/ebay-oauth?action=auth-url', {
      method: 'GET'
    });
  }

  async getEbayConnectionStatus() {
    return this.request('/ebay-oauth?action=status', {
      method: 'GET'
    });
  }

  async disconnectEbayAccount() {
    return this.request('/ebay-oauth', {
      method: 'DELETE'
    });
  }
}

// Create and export a singleton instance
const apiService = new ApiService();

// Export individual methods for easier importing
export const {
  get,
  post,
  put,
  delete: deleteMethod,
  testEbayConnection,
  getEbayListings,
  syncListings,
  togglePriceReduction,
  updateItemPrice,
  runPriceReduction,
  analyzeMarket,
  sendNotification,
  runScheduledJob,
  importListings,
  reducePrice,
  monitorScheduledReductions,
  getEbayAuthUrl,
  getEbayConnectionStatus,
  disconnectEbayAccount
} = apiService;

// Export the full service as default
export default apiService;

// Helper function to handle API errors consistently
export const handleApiError = (error, defaultMessage = 'An error occurred') => {
  logger.error('API Error:', error);

  if (error.message) {
    return error.message;
  }

  return defaultMessage;
};

// Helper function to check if we're in demo mode
export const isDemoMode = () => {
  return import.meta.env.VITE_DEMO_MODE === 'true';
};