# eBay API to Database Field Mapping

## Data Flow Architecture

```
eBay APIs → Netlify Function → Supabase Database → Frontend Display
```

## API Endpoints Used

### 1. **Inventory API** - `GET /sell/inventory/v1/inventory_item`
- **Purpose**: Retrieve product details and stock information
- **Pagination**: limit=100, offset for pagination

### 2. **Offer API** - `GET /sell/inventory/v1/offer?sku={sku}`
- **Purpose**: Retrieve pricing and listing status for each SKU

## Field Mapping

| Database Column | eBay API Source | API Field Path | Notes |
|-----------------|-----------------|----------------|-------|
| **sku** | Inventory API | `inventoryItems[].sku` | Unique identifier |
| **title** | Inventory API | `inventoryItems[].product.title` | Product name |
| **quantity** | Inventory API | `inventoryItems[].availability.shipToLocationAvailability.quantity` | Available stock |
| **image_urls** | Inventory API | `inventoryItems[].product.imageUrls[]` | Array of image URLs |
| **current_price** | Offer API | `offers[0].pricingSummary.price.value` | Current listing price |
| **listing_id** | Offer API | `offers[0].listingId` or `offers[0].offerId` | eBay listing identifier |
| **status** | Offer API | `offers[0].status` | PUBLISHED, UNPUBLISHED, etc. |
| **created_at** | Offer API | `offers[0].createdDate` | Listing creation date |
| **marketplace_id** | Offer API | `offers[0].marketplaceId` | EBAY_US, EBAY_UK, etc. |
| **minimum_price** | User Input | N/A | Set by user in app |
| **price_reduction_enabled** | User Input | N/A | Toggle in app |
| **reduction_strategy** | User Input | N/A | Selected in app |
| **suggested_price** | Calculated | N/A | Based on strategy |
| **user_id** | Auth Context | `authUser.id` | From Supabase auth |

## Data Types

```javascript
// eBay Inventory Item Structure
{
  sku: "string",
  product: {
    title: "string",
    imageUrls: ["string"],
    description: "string"
  },
  availability: {
    shipToLocationAvailability: {
      quantity: number
    }
  }
}

// eBay Offer Structure
{
  offerId: "string",
  sku: "string",
  status: "PUBLISHED" | "UNPUBLISHED",
  pricingSummary: {
    price: {
      value: "string", // e.g., "99.99"
      currency: "USD"
    }
  },
  listingId: "string",
  createdDate: "ISO 8601 timestamp",
  marketplaceId: "string"
}

// Database Listing Structure
{
  id: "uuid",
  user_id: "uuid",
  sku: "string",
  title: "string",
  quantity: number,
  current_price: number,
  minimum_price: number,
  image_urls: ["string"],
  listing_id: "string",
  status: "string",
  marketplace_id: "string",
  price_reduction_enabled: boolean,
  reduction_strategy: "string",
  suggested_price: number,
  created_at: "timestamp",
  updated_at: "timestamp"
}
```

## Authentication Flow

1. **User Authentication**: Verify Supabase JWT token
2. **Get User Credentials**: Fetch user's eBay app credentials from database
3. **Decrypt Refresh Token**: Use AES-256-CBC to decrypt stored refresh token
4. **Get Access Token**: Exchange refresh token for temporary access token
5. **API Calls**: Use access token for Inventory and Offer API calls

## Error Handling

- **401 Unauthorized**: Invalid or expired Supabase token
- **400 Bad Request**: Missing eBay credentials or refresh token
- **500 Server Error**: eBay API failure or decryption error

## Rate Limits

- eBay Inventory API: 5,000 calls per day
- eBay Offer API: 5,000 calls per day
- Implement pagination for large inventories

## Implementation Notes

1. **Bulk Processing**: Process inventory items in batches to avoid timeouts
2. **Caching**: Consider caching access tokens (valid for 2 hours)
3. **Incremental Updates**: Track last sync time for delta updates
4. **Error Recovery**: Implement retry logic for transient failures
5. **Logging**: Log all API calls for debugging and monitoring