import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import apiService, { handleApiError, isDemoMode } from '../api'

// Mock fetch globally
global.fetch = vi.fn()

describe('ApiService', () => {
  beforeEach(() => {
    fetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('request method', () => {
    it('should make successful API requests', async () => {
      const mockResponse = { success: true, data: 'test data' }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await apiService.request('/test-endpoint')

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/test-endpoint',
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
      expect(result).toEqual(mockResponse)
    })

    it('should handle HTTP errors', async () => {
      const mockErrorResponse = { error: 'Not found' }
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => mockErrorResponse
      })

      await expect(apiService.request('/non-existent')).rejects.toThrow('Not found')
    })

    it('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(apiService.request('/test-endpoint')).rejects.toThrow('Network error')
    })

    it('should include custom headers', async () => {
      const mockResponse = { success: true }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.request('/test-endpoint', {
        headers: {
          'Authorization': 'Bearer token123'
        }
      })

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/test-endpoint',
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123'
          }
        }
      )
    })

    it('should handle POST requests with body', async () => {
      const mockResponse = { success: true }
      const requestBody = { userId: '123', enabled: true }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.request('/test-endpoint', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/test-endpoint',
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    })
  })

  describe('testEbayConnection', () => {
    it('should call the correct endpoint', async () => {
      const mockResponse = { connected: true }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await apiService.testEbayConnection()

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/test-ebay-connection',
        expect.objectContaining({
          method: 'GET'
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getEbayListings', () => {
    it('should call with default pagination', async () => {
      const mockResponse = { listings: [] }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.getEbayListings()

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/get-ebay-listings?page=1&limit=100',
        expect.objectContaining({
          method: 'GET'
        })
      )
    })

    it('should call with custom pagination', async () => {
      const mockResponse = { listings: [] }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.getEbayListings(2, 50)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/get-ebay-listings?page=2&limit=50',
        expect.objectContaining({
          method: 'GET'
        })
      )
    })
  })

  describe('syncListings', () => {
    it('should send userId in request body', async () => {
      const mockResponse = { synced: 10 }
      const userId = 'user123'

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.syncListings(userId)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/sync-listings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ userId })
        })
      )
    })
  })

  describe('togglePriceReduction', () => {
    it('should send correct parameters', async () => {
      const mockResponse = { success: true }
      const itemId = 'item123'
      const userId = 'user123'
      const enabled = true

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.togglePriceReduction(itemId, userId, enabled)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/toggle-price-reduction',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ itemId, userId, enabled })
        })
      )
    })
  })

  describe('updateItemPrice', () => {
    it('should send itemId and newPrice', async () => {
      const mockResponse = { success: true }
      const itemId = 'item123'
      const newPrice = 29.99

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.updateItemPrice(itemId, newPrice)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/update-item-price',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ itemId, newPrice })
        })
      )
    })
  })

  describe('runPriceReduction', () => {
    it('should call the price reduction engine', async () => {
      const mockResponse = { processed: 5 }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.runPriceReduction()

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/price-reduction-engine',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })
  })

  describe('analyzeMarket', () => {
    it('should send analysis parameters', async () => {
      const mockResponse = { analysis: {} }
      const itemId = 'item123'
      const keywords = 'test keywords'
      const categoryId = 'cat456'

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.analyzeMarket(itemId, keywords, categoryId)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/market-analysis',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ itemId, keywords, categoryId })
        })
      )
    })

    it('should handle null parameters', async () => {
      const mockResponse = { analysis: {} }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.analyzeMarket()

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/market-analysis',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ itemId: null, keywords: null, categoryId: null })
        })
      )
    })
  })

  describe('sendNotification', () => {
    it('should send notification data', async () => {
      const mockResponse = { sent: true }
      const userId = 'user123'
      const type = 'info'
      const title = 'Test Title'
      const message = 'Test message'
      const data = { extra: 'data' }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.sendNotification(userId, type, title, message, data)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/notification-service',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ userId, type, title, message, data })
        })
      )
    })

    it('should use default empty object for data', async () => {
      const mockResponse = { sent: true }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.sendNotification('user123', 'info', 'Title', 'Message')

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/notification-service',
        expect.objectContaining({
          body: JSON.stringify({
            userId: 'user123',
            type: 'info',
            title: 'Title',
            message: 'Message',
            data: {}
          })
        })
      )
    })
  })

  describe('runScheduledJob', () => {
    it('should call with default job type', async () => {
      const mockResponse = { executed: true }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.runScheduledJob()

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/scheduled-jobs?job=all',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    it('should call with custom job type', async () => {
      const mockResponse = { executed: true }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.runScheduledJob('price-reduction')

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/scheduled-jobs?job=price-reduction',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })
  })

  describe('importListings', () => {
    it('should send userId and listings', async () => {
      const mockResponse = { imported: 5 }
      const userId = 'user123'
      const listings = [{ id: '1' }, { id: '2' }]

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.importListings(userId, listings)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/import-listings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ userId, listings })
        })
      )
    })
  })

  describe('reducePrice', () => {
    it('should send price reduction parameters', async () => {
      const mockResponse = { reduced: true }
      const itemId = 'item123'
      const userId = 'user123'
      const strategy = 'aggressive'

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.reducePrice(itemId, userId, strategy)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/reduce-price',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ itemId, userId, strategy })
        })
      )
    })

    it('should use default strategy', async () => {
      const mockResponse = { reduced: true }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.reducePrice('item123', 'user123')

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/reduce-price',
        expect.objectContaining({
          body: JSON.stringify({
            itemId: 'item123',
            userId: 'user123',
            strategy: 'default'
          })
        })
      )
    })
  })
})

describe('handleApiError', () => {
  it('should return error message from error object', () => {
    const error = new Error('Custom error message')
    const result = handleApiError(error)
    expect(result).toBe('Custom error message')
  })

  it('should return default message when no error message', () => {
    const error = {}
    const result = handleApiError(error, 'Default message')
    expect(result).toBe('Default message')
  })

  it('should return default fallback when no custom default provided', () => {
    const error = {}
    const result = handleApiError(error)
    expect(result).toBe('An error occurred')
  })

  it('should log error to console', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation()
    const error = new Error('Test error')

    handleApiError(error)

    expect(consoleSpy).toHaveBeenCalledWith('API Error:', error)
    consoleSpy.mockRestore()
  })
})

describe('isDemoMode', () => {
  const originalEnv = import.meta.env

  beforeEach(() => {
    // Reset import.meta.env
    import.meta.env = { ...originalEnv }
  })

  afterEach(() => {
    import.meta.env = originalEnv
  })

  it('should return true when no SUPABASE_URL is set', () => {
    import.meta.env.VITE_SUPABASE_URL = undefined
    expect(isDemoMode()).toBe(true)
  })

  it('should return true when SUPABASE_URL contains placeholder', () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://your-project-id.supabase.co'
    expect(isDemoMode()).toBe(true)
  })

  it('should return false when SUPABASE_URL is properly configured', () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://real-project-id.supabase.co'
    expect(isDemoMode()).toBe(false)
  })
})