const fetch = require('node-fetch');
const crypto = require('crypto');
const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

function decryptApiKey(encryptedKey) {
  if (!ENCRYPTION_KEY || !encryptedKey) return null;
  try {
    const parts = encryptedKey.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('🔍 keepa-fetch-product called');

    // 1. Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      console.log('❌ No auth header');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log('❌ Auth error:', authError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`✅ User authenticated: ${user.id}`);

    // 2. Parse and validate ASIN
    const { asin } = JSON.parse(event.body);
    console.log(`📦 Requested ASIN: ${asin}`);

    if (!asin) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ASIN is required' })
      };
    }

    // Validate ASIN format (B followed by 9 alphanumeric characters)
    if (!/^B[0-9A-Z]{9}$/.test(asin)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid ASIN format. Must be B followed by 9 characters.' })
      };
    }

    // 3. Get Keepa API key from user's database record
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('keepa_api_key')
      .eq('id', user.id)
      .single();

    if (userError) {
      throw new Error('Failed to retrieve user data');
    }

    const encryptedKey = userData?.keepa_api_key;
    if (!encryptedKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Keepa API key not configured. Please add your Keepa API key in settings.'
        })
      };
    }

    // Decrypt the API key
    const keepaApiKey = decryptApiKey(encryptedKey);
    if (!keepaApiKey) {
      console.error('Failed to decrypt Keepa API key');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to decrypt Keepa API key. Please re-save your API key in settings.'
        })
      };
    }

    // Add stats=0 to get full product data including description
    // stats=0 gives us access to description, features, and other detailed product info
    const keepaUrl = `https://api.keepa.com/product?key=${keepaApiKey}&domain=1&asin=${asin}&stats=0`;

    console.log(`Fetching Keepa data for ASIN: ${asin}`);
    console.log(`Keepa URL (masked): https://api.keepa.com/product?key=${keepaApiKey.substring(0, 8)}...&domain=1&asin=${asin}&stats=0`);
    const keepaResponse = await fetch(keepaUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'eBay-Price-Reducer/1.0'
      }
    });

    console.log(`Keepa API response status: ${keepaResponse.status}`);

    if (!keepaResponse.ok) {
      const errorText = await keepaResponse.text();
      console.error(`Keepa API error: ${keepaResponse.status} - ${errorText}`);
      console.error(`Keepa URL (masked key): https://api.keepa.com/product?key=***&domain=1&asin=${asin}&stats=0`);

      // Return more detailed error
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Keepa API request failed',
          keepaStatus: keepaResponse.status,
          keepaError: errorText,
          asin: asin,
          suggestion: keepaResponse.status === 400
            ? 'Check if your Keepa API key is valid and has sufficient tokens'
            : 'Keepa API is unavailable'
        })
      };
    }

    const keepaData = await keepaResponse.json();
    console.log(`Keepa response received for ${asin}:`, {
      hasProducts: !!keepaData.products,
      productsLength: keepaData.products?.length || 0,
      productTitle: keepaData.products?.[0]?.title?.substring(0, 50)
    });

    // 4. Validate Keepa response
    if (!keepaData.products || keepaData.products.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Product not found on Amazon/Keepa' })
      };
    }

    const product = keepaData.products[0];

    // DEBUG: Log raw Keepa product structure
    console.log('🔍 RAW KEEPA PRODUCT STRUCTURE:', {
      hasImages: !!product.images,
      imagesType: Array.isArray(product.images) ? 'array' : typeof product.images,
      imagesLength: product.images?.length || 0,
      firstImageStructure: product.images?.[0] ? Object.keys(product.images[0]) : [],
      firstImageSample: product.images?.[0],
      hasImagesCSV: !!product.imagesCSV,
      imagesCSVLength: product.imagesCSV?.length || 0,
      imagesCSVSample: product.imagesCSV?.substring(0, 200)
    });

    // 5. Transform to eBay-compatible format
    const ebayDraft = transformKeepaToEbay(product);

    // 6. Return both raw Keepa data and transformed draft
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        asin: asin,
        keepaData: product,
        ebayDraft: ebayDraft
      })
    };

  } catch (error) {
    console.error('❌ Keepa fetch error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch product data',
        message: error.message,
        details: error.stack
      })
    };
  }
};

/**
 * Transform Keepa product data to eBay-compatible format
 */
function transformKeepaToEbay(keepaProduct) {
  // Extract ALL available images - prefer new 'images' field over deprecated 'imagesCSV'
  // Get all size variants, prioritizing higher quality (hiRes > large > medium > small)
  const images = [];

  if (keepaProduct.images && Array.isArray(keepaProduct.images)) {
    // Use new images array (preferred method) - get ALL size variants
    keepaProduct.images.forEach(imgObj => {
      if (imgObj) {
        // Keepa API returns: l (large), m (medium)
        // Prioritize large over medium for best quality
        const imageVariant = imgObj.l || imgObj.m;
        if (imageVariant) {
          images.push(`https://m.media-amazon.com/images/I/${imageVariant}`);
        }
      }
    });
  } else if (keepaProduct.imagesCSV) {
    // Fallback to deprecated imagesCSV
    const imageFilenames = keepaProduct.imagesCSV.split(',');
    imageFilenames.forEach(filename => {
      const trimmed = filename.trim();
      if (trimmed) {
        images.push(`https://m.media-amazon.com/images/I/${trimmed}`);
      }
    });
  }

  // DEBUG: Log image extraction results
  console.log('🔍 IMAGE EXTRACTION RESULTS:', {
    extractedCount: images.length,
    extractedImages: images,
    usedImagesArray: !!keepaProduct.images,
    usedImagesCSV: !!keepaProduct.imagesCSV && !keepaProduct.images,
    imagesArrayLength: keepaProduct.images?.length || 0,
    imagesCsvCount: keepaProduct.imagesCSV?.split(',').length || 0
  });

  // Build description from Keepa data - use Amazon description directly
  const description = buildDescription(keepaProduct);

  // Extract item specifics/aspects
  const aspects = buildAspects(keepaProduct);

  // Trim all aspect values to eBay's 65 character limit
  const trimmedAspects = {};
  for (const [key, values] of Object.entries(aspects)) {
    if (Array.isArray(values)) {
      trimmedAspects[key] = values.map(v => v.substring(0, 65));
    }
  }

  // DEBUG: Log final ebayDraft being returned
  console.log('🔍 EBAY DRAFT IMAGES FINAL:', {
    imageCount: images.length,
    images: images
  });

  return {
    title: keepaProduct.title ? keepaProduct.title.substring(0, 80) : '', // eBay 80 char limit
    description: description,
    brand: keepaProduct.brand || '',
    model: keepaProduct.model || '',
    images: images, // Include all images (eBay accepts up to 12)
    aspects: trimmedAspects,
    // These will be set by user:
    // - price
    // - quantity
    // - condition
    // - sku (auto-generated)
  };
}

/**
 * Build HTML description from Keepa product data
 * Uses Amazon's description directly without modification
 */
function buildDescription(product) {
  // Use Amazon's description directly if available
  if (product.description) {
    return product.description;
  }

  // Fallback: build description from features if no main description exists
  let html = '';

  if (product.features && product.features.length > 0) {
    html += '<h3>Product Features</h3><ul>';
    product.features.forEach(feature => {
      html += `<li>${escapeHtml(feature)}</li>`;
    });
    html += '</ul>';
  }

  // Add specifications as supplementary info
  const hasSpecs = product.itemWeight || product.itemHeight ||
                   product.itemLength || product.itemWidth;

  if (hasSpecs) {
    html += '<h3>Specifications</h3><ul>';
    if (product.itemWeight) html += `<li>Weight: ${escapeHtml(product.itemWeight)}</li>`;
    if (product.itemHeight) html += `<li>Height: ${escapeHtml(product.itemHeight)}</li>`;
    if (product.itemLength) html += `<li>Length: ${escapeHtml(product.itemLength)}</li>`;
    if (product.itemWidth) html += `<li>Width: ${escapeHtml(product.itemWidth)}</li>`;
    html += '</ul>';
  }

  return html || 'Product information available upon request.';
}

/**
 * Build item aspects object from Keepa data
 */
function buildAspects(product) {
  const aspects = {};

  // EXISTING DIRECT MAPPINGS
  if (product.brand) aspects.Brand = [product.brand];
  if (product.model) aspects.Model = [product.model];
  if (product.color) aspects.Color = [product.color];
  if (product.size) aspects.Size = [product.size];
  if (product.manufacturer) aspects.Manufacturer = [product.manufacturer];

  // MPN - prefer partNumber over model
  if (product.partNumber) {
    aspects.MPN = [product.partNumber];
  } else if (product.model) {
    aspects.MPN = [product.model];
  }

  // NEW DIRECT MAPPINGS
  if (product.style) aspects.Style = [product.style];
  if (product.pattern) aspects.Pattern = [product.pattern];

  // ARRAY SELECTIONS (use first value)
  if (product.upcList && product.upcList.length > 0) {
    aspects.UPC = [product.upcList[0]];
  }
  if (product.eanList && product.eanList.length > 0) {
    aspects.EAN = [product.eanList[0]];
  }
  if (product.materials && product.materials.length > 0) {
    aspects.Material = [product.materials[0]];
  }

  // DEPARTMENT MAPPING from productGroup
  if (product.productGroup) {
    const department = mapProductGroupToDepartment(product.productGroup);
    if (department) aspects.Department = department;
  }

  // EXTRACT FROM TITLE (sleeve length, fit, size type)
  if (product.title) {
    const extractedAspects = extractAspectsFromText(product.title);
    Object.assign(aspects, extractedAspects);
  }

  return aspects;
}

/**
 * Map Keepa productGroup to eBay Department
 */
function mapProductGroupToDepartment(productGroup) {
  const departmentMap = {
    'Apparel': 'Unisex',
    'Men': 'Men',
    'Women': 'Women',
    'Baby Products': 'Baby',
    'Shoes': 'Unisex',
    'Sports': 'Unisex',
    'Sporting Goods': 'Unisex'
  };
  return departmentMap[productGroup] ? [departmentMap[productGroup]] : null;
}

/**
 * Extract aspects from product title using pattern matching
 */
function extractAspectsFromText(text) {
  const aspects = {};

  // Sleeve Length
  if (/short\s+sleeve/i.test(text)) {
    aspects['Sleeve Length'] = ['Short Sleeve'];
  } else if (/long\s+sleeve/i.test(text)) {
    aspects['Sleeve Length'] = ['Long Sleeve'];
  } else if (/sleeveless/i.test(text)) {
    aspects['Sleeve Length'] = ['Sleeveless'];
  } else if (/3\/4\s+sleeve|three[\s-]quarter/i.test(text)) {
    aspects['Sleeve Length'] = ['3/4 Sleeve'];
  }

  // Size Type
  if (/plus[\s-]size/i.test(text)) {
    aspects['Size Type'] = ['Plus'];
  } else if (/petite/i.test(text)) {
    aspects['Size Type'] = ['Petite'];
  } else if (/big[\s&]+tall/i.test(text)) {
    aspects['Size Type'] = ['Big & Tall'];
  } else if (/regular/i.test(text)) {
    aspects['Size Type'] = ['Regular'];
  }

  // Fit
  if (/slim[\s-]fit/i.test(text)) {
    aspects.Fit = ['Slim'];
  } else if (/regular[\s-]fit/i.test(text)) {
    aspects.Fit = ['Regular'];
  } else if (/relaxed[\s-]fit/i.test(text)) {
    aspects.Fit = ['Relaxed'];
  } else if (/loose[\s-]fit/i.test(text)) {
    aspects.Fit = ['Loose'];
  } else if (/athletic[\s-]fit/i.test(text)) {
    aspects.Fit = ['Athletic'];
  }

  // Color extraction from text (common colors)
  const colorMatch = text.match(/\b(black|white|blue|red|green|yellow|orange|purple|pink|brown|gray|grey|beige|navy|light\s+\w+|dark\s+\w+)\b/i);
  if (colorMatch) {
    aspects.Color = [colorMatch[0]];
  }

  return aspects;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
