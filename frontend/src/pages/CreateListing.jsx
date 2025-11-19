import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function CreateListing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [asin, setAsin] = useState('');
  const [loading, setLoading] = useState(false);
  const [productData, setProductData] = useState(null);
  const [creating, setCreating] = useState(false);

  // User inputs
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState('1500'); // NEW_OTHER = eBay condition ID 1500

  const handleFetchProduct = async () => {
    if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) {
      alert('Please enter a valid Amazon ASIN (e.g., B0088PUEPK)');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/keepa-fetch-product', { asin });
      setProductData(response.data);

      // Pre-fill with empty price for user to set
      setPrice('');
      setQuantity('1');

    } catch (error) {
      console.error('Error fetching product:', error);
      alert(error.response?.data?.error || 'Failed to fetch product data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateListing = async () => {
    if (!price || parseFloat(price) <= 0) {
      alert('Please enter a valid price');
      return;
    }

    if (!quantity || parseInt(quantity) <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    setCreating(true);
    try {
      const listingPayload = {
        title: productData.ebayDraft.title,
        description: productData.ebayDraft.description,
        price: parseFloat(price),
        quantity: parseInt(quantity),
        condition: condition,
        images: productData.ebayDraft.images,
        aspects: productData.ebayDraft.aspects
      };

      const response = await api.post('/create-ebay-listing', listingPayload);

      // Show appropriate message based on whether it was updated or created
      const message = response.data.wasUpdated
        ? `✅ Listing Updated!\n\nThis item was already listed on eBay and has been updated with your new price and quantity.\n\neBay Item ID: ${response.data.listingId}\n\nView on eBay: ${response.data.viewUrl}`
        : `✅ New Listing Created!\n\nYour item has been successfully listed on eBay!\n\neBay Item ID: ${response.data.listingId}\n\nView on eBay: ${response.data.viewUrl}`;

      alert(message);

      // Navigate to listings page
      navigate('/listings');

    } catch (error) {
      console.error('Error creating listing:', error);
      const errorMsg = error.response?.data?.error || 'Failed to create listing';
      const missingAspects = error.response?.data?.missingAspects;

      if (missingAspects) {
        alert(`Missing required fields: ${missingAspects.join(', ')}\n\nPlease ensure the product has all required information.`);
      } else {
        alert(errorMsg);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create eBay Listing from Amazon ASIN</h1>

      {/* ASIN Input */}
      <div className="mb-6 bg-white p-6 rounded shadow">
        <label className="block text-sm font-medium mb-2">
          Amazon ASIN
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            className="flex-1 border rounded px-3 py-2"
            value={asin}
            onChange={(e) => setAsin(e.target.value.toUpperCase())}
            placeholder="B0088PUEPK"
            maxLength="10"
          />
          <button
            onClick={handleFetchProduct}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Fetching...' : 'Fetch Product'}
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Enter an Amazon ASIN to fetch product information from Keepa
        </p>
      </div>

      {/* Product Preview */}
      {productData && (
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-2xl font-bold mb-4">{productData.ebayDraft.title}</h2>

          {/* Images */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Images ({productData.ebayDraft.images.length})</h3>
            <div className="flex gap-2 overflow-x-auto">
              {productData.ebayDraft.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`Product ${idx + 1}`}
                  className="w-32 h-32 object-cover border rounded"
                />
              ))}
            </div>
          </div>

          {/* Description Preview */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Description</h3>
            <div
              className="border rounded p-4 max-h-64 overflow-y-auto bg-gray-50"
              dangerouslySetInnerHTML={{ __html: productData.ebayDraft.description }}
            />
          </div>

          {/* Item Specifics */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Item Specifics</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(productData.ebayDraft.aspects).map(([key, values]) => (
                <div key={key} className="border rounded p-3 bg-gray-50">
                  <div className="text-sm font-medium text-gray-700">{key}</div>
                  <div className="text-sm">{values.join(', ')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* User Inputs */}
          <div className="border-t pt-6">
            <h3 className="text-xl font-semibold mb-4">Listing Details</h3>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full border rounded px-3 py-2"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="29.99"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  className="w-full border rounded px-3 py-2"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Condition</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                >
                  <option value="1000">New</option>
                  <option value="1500">New (Other)</option>
                  <option value="1750">New with Defects</option>
                  <option value="2500">Seller Refurbished</option>
                  <option value="2750">Like New</option>
                  <option value="3000">Used</option>
                  <option value="7000">For Parts or Not Working</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Note: Not all conditions are valid for all categories. Invalid selections will be auto-corrected.
                </p>
              </div>
            </div>

            <button
              onClick={handleCreateListing}
              disabled={creating || !price || !quantity}
              className="w-full bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 disabled:bg-gray-400 font-semibold"
            >
              {creating ? 'Creating Listing...' : 'Create eBay Listing'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
