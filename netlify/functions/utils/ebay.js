const axios = require('axios')
const xml2js = require('xml2js')

class EbayService {
  constructor() {
    this.config = {
      production: {
        tradingUrl: 'https://api.ebay.com/ws/api.dll',
        findingUrl: 'https://svcs.ebay.com/services/search/FindingService/v1',
        shoppingUrl: 'https://open.api.ebay.com/shopping'
      },
      sandbox: {
        tradingUrl: 'https://api.sandbox.ebay.com/ws/api.dll',
        findingUrl: 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1',
        shoppingUrl: 'https://open.api.sandbox.ebay.com/shopping'
      },
      credentials: {
        appId: process.env.EBAY_APP_ID,
        devId: process.env.EBAY_DEV_ID,
        certId: process.env.EBAY_CERT_ID,
        userToken: process.env.EBAY_USER_TOKEN,
        environment: process.env.EBAY_ENVIRONMENT || 'sandbox'
      }
    }

    this.parser = new xml2js.Parser({ explicitArray: false })
    this.builder = new xml2js.Builder()
  }

  getHeaders() {
    return {
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-DEV-NAME': this.config.credentials.devId,
      'X-EBAY-API-APP-NAME': this.config.credentials.appId,
      'X-EBAY-API-CERT-NAME': this.config.credentials.certId,
      'X-EBAY-API-SITEID': '0',
      'Content-Type': 'text/xml'
    }
  }

  getBaseUrl() {
    return this.config.credentials.environment === 'production'
      ? this.config.production
      : this.config.sandbox
  }

  buildTradingRequest(callName, requestData, userToken = null) {
    const token = userToken || this.config.credentials.userToken

    return `<?xml version="1.0" encoding="utf-8"?>
      <${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${token}</eBayAuthToken>
        </RequesterCredentials>
        ${requestData}
      </${callName}Request>`
  }

  async makeRequest(url, data, headers) {
    try {
      const response = await axios.post(url, data, { headers })
      return await this.parser.parseStringPromise(response.data)
    } catch (error) {
      console.error('eBay API request failed:', error)
      throw new Error(`eBay API error: ${error.message}`)
    }
  }

  async getSellerListings(userId = null, page = 1, perPage = 100, userToken = null) {
    const requestData = `
      <UserID>${userId || 'current_user'}</UserID>
      <ActiveList>
        <Include>true</Include>
        <ListingType>FixedPriceItem</ListingType>
        <Pagination>
          <EntriesPerPage>${perPage}</EntriesPerPage>
          <PageNumber>${page}</PageNumber>
        </Pagination>
      </ActiveList>
      <DetailLevel>ReturnAll</DetailLevel>
    `

    const xmlRequest = this.buildTradingRequest('GetMyeBaySelling', requestData, userToken)
    const headers = { ...this.getHeaders(), 'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling' }

    return await this.makeRequest(this.getBaseUrl().tradingUrl, xmlRequest, headers)
  }

  async getItemDetails(itemId, userToken = null) {
    const requestData = `
      <ItemID>${itemId}</ItemID>
      <DetailLevel>ReturnAll</DetailLevel>
    `

    const xmlRequest = this.buildTradingRequest('GetItem', requestData, userToken)
    const headers = { ...this.getHeaders(), 'X-EBAY-API-CALL-NAME': 'GetItem' }

    return await this.makeRequest(this.getBaseUrl().tradingUrl, xmlRequest, headers)
  }

  async updateItemPrice(itemId, newPrice, currency = 'USD', userToken = null) {
    const requestData = `
      <Item>
        <ItemID>${itemId}</ItemID>
        <StartPrice currencyID="${currency}">${newPrice}</StartPrice>
      </Item>
    `

    const xmlRequest = this.buildTradingRequest('ReviseItem', requestData, userToken)
    const headers = { ...this.getHeaders(), 'X-EBAY-API-CALL-NAME': 'ReviseItem' }

    return await this.makeRequest(this.getBaseUrl().tradingUrl, xmlRequest, headers)
  }

  async searchCompletedListings(keywords, categoryId = null, daysBack = 30) {
    const endTime = new Date()
    const startTime = new Date()
    startTime.setDate(startTime.getDate() - daysBack)

    const params = {
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': this.config.credentials.appId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': keywords,
      'itemFilter(0).name': 'EndTimeFrom',
      'itemFilter(0).value': startTime.toISOString(),
      'itemFilter(1).name': 'EndTimeTo',
      'itemFilter(1).value': endTime.toISOString(),
      'itemFilter(2).name': 'SoldItemsOnly',
      'itemFilter(2).value': 'true',
      'sortOrder': 'EndTimeSoonest'
    }

    if (categoryId) {
      params['categoryId'] = categoryId
    }

    try {
      const response = await axios.get(this.getBaseUrl().findingUrl, { params })
      return response.data
    } catch (error) {
      console.error('Failed to search completed listings:', error)
      throw new Error(`Market analysis failed: ${error.message}`)
    }
  }

  calculateSuggestedPrice(completedListings, currentPrice, reductionPercentage = 0.05) {
    if (!completedListings || !completedListings.findCompletedItemsResponse) {
      return currentPrice * (1 - reductionPercentage)
    }

    const items = completedListings.findCompletedItemsResponse[0].searchResult[0].item || []

    if (items.length === 0) {
      return currentPrice * (1 - reductionPercentage)
    }

    const soldPrices = items
      .filter(item => item.sellingStatus && item.sellingStatus[0].currentPrice)
      .map(item => parseFloat(item.sellingStatus[0].currentPrice[0].__value__))

    if (soldPrices.length === 0) {
      return currentPrice * (1 - reductionPercentage)
    }

    const averagePrice = soldPrices.reduce((sum, price) => sum + price, 0) / soldPrices.length
    const suggestedPrice = Math.min(averagePrice * 0.95, currentPrice * (1 - reductionPercentage))

    return Math.max(suggestedPrice, currentPrice * 0.7)
  }

  parseListingResponse(response) {
    try {
      const listings = []
      const activeList = response.GetMyeBaySellingResponse?.ActiveList?.ItemArray?.Item

      if (!activeList) return listings

      const items = Array.isArray(activeList) ? activeList : [activeList]

      items.forEach(item => {
        if (item && item.ItemID) {
          listings.push({
            ebay_item_id: item.ItemID,
            title: item.Title || '',
            description: item.Description || '',
            current_price: parseFloat(item.StartPrice?.__value__ || 0),
            original_price: parseFloat(item.StartPrice?.__value__ || 0),
            currency: item.StartPrice?.currencyID || 'USD',
            category: item.PrimaryCategory?.CategoryName || '',
            category_id: item.PrimaryCategory?.CategoryID || '',
            condition: item.ConditionDisplayName || '',
            image_urls: item.PictureDetails?.PictureURL ?
              (Array.isArray(item.PictureDetails.PictureURL) ?
                item.PictureDetails.PictureURL :
                [item.PictureDetails.PictureURL]) : [],
            quantity: parseInt(item.Quantity) >= 0 ? parseInt(item.Quantity) : 0,
            quantity_available: parseInt(item.QuantityAvailable) >= 0 ? parseInt(item.QuantityAvailable) : 0,
            listing_status: 'Active',
            start_time: item.ListingDetails?.StartTime || new Date().toISOString(),
            end_time: item.ListingDetails?.EndTime || null,
            view_count: parseInt(item.HitCount) || 0,
            watch_count: parseInt(item.WatchCount) || 0
          })
        }
      })

      return listings
    } catch (error) {
      console.error('Error parsing listing response:', error)
      return []
    }
  }
}

module.exports = EbayService