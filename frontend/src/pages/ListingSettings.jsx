import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function ListingSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState({});
  const [availablePolicies, setAvailablePolicies] = useState({
    fulfillment: [],
    payment: [],
    return: []
  });
  const [location, setLocation] = useState({
    addressLine1: '',
    city: '',
    stateOrProvince: '',
    postalCode: '',
    country: 'US'
  });
  const [skuPrefix, setSkuPrefix] = useState('');
  const [ebayConnected, setEbayConnected] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/listing-settings');

      setSettings(response.currentSettings || {});
      setAvailablePolicies(response.availablePolicies || {});
      setEbayConnected(response.ebayConnected || false);

      if (response.currentSettings?.defaultLocation?.address) {
        setLocation(response.currentSettings.defaultLocation.address);
      }

      if (response.currentSettings?.skuPrefix) {
        setSkuPrefix(response.currentSettings.skuPrefix);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Don't show alert on initial load - just set error state
      setError('Unable to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setValidationErrors({});

      const newSettings = {
        defaultFulfillmentPolicyId: settings.defaultFulfillmentPolicyId,
        defaultPaymentPolicyId: settings.defaultPaymentPolicyId,
        defaultReturnPolicyId: settings.defaultReturnPolicyId,
        defaultCondition: settings.defaultCondition || 'NEW_OTHER',
        skuPrefix: skuPrefix || '',
        defaultLocation: {
          address: location
        }
      };

      await api.put('/listing-settings', newSettings);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);

      if (error.validationErrors) {
        setValidationErrors(error.validationErrors);
        setError('Please fix the validation errors below.');
      } else {
        setError('Failed to save settings. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/listing-settings/validate');

      if (response.valid) {
        alert('All settings are valid!');
      } else {
        const errorMessages = Object.entries(response.errors)
          .map(([field, message]) => `- ${field}: ${message}`)
          .join('\n');

        setError(`Validation failed:\n${errorMessages}`);
      }
    } catch (error) {
      console.error('Error validating settings:', error);
      setError('Failed to validate settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Listing Creation Settings</h1>

      {/* Info Message */}
      {!ebayConnected && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-blue-800">
                You can configure your listing settings manually. Connect your eBay account to see available policies for reference.
              </p>
              <a href="/account?tab=integrations" className="text-sm text-blue-600 underline mt-2 inline-block">
                Go to Account → Integrations to connect eBay
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Policy */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Payment Policy ID
        </label>
        <input
          type="text"
          className={`w-full border rounded px-3 py-2 ${
            validationErrors.defaultPaymentPolicyId ? 'border-red-500' : ''
          }`}
          value={settings.defaultPaymentPolicyId || ''}
          onChange={(e) => {
            setSettings({ ...settings, defaultPaymentPolicyId: e.target.value });
            setValidationErrors({ ...validationErrors, defaultPaymentPolicyId: undefined });
          }}
          placeholder="e.g., 123456789012"
        />
        {validationErrors.defaultPaymentPolicyId && (
          <p className="text-sm text-red-600 mt-1">
            {validationErrors.defaultPaymentPolicyId}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Find your policy IDs in eBay Seller Hub → Business Policies → Payment Policies
        </p>
        {availablePolicies.payment.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-blue-600 cursor-pointer">Available policies</summary>
            <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc">
              {availablePolicies.payment.map(policy => (
                <li key={policy.paymentPolicyId}>
                  {policy.name}: <code className="bg-gray-100 px-1 rounded">{policy.paymentPolicyId}</code>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Shipping/Fulfillment Policy */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Shipping Policy ID
        </label>
        <input
          type="text"
          className={`w-full border rounded px-3 py-2 ${
            validationErrors.defaultFulfillmentPolicyId ? 'border-red-500' : ''
          }`}
          value={settings.defaultFulfillmentPolicyId || ''}
          onChange={(e) => {
            setSettings({ ...settings, defaultFulfillmentPolicyId: e.target.value });
            setValidationErrors({ ...validationErrors, defaultFulfillmentPolicyId: undefined });
          }}
          placeholder="e.g., 123456789012"
        />
        {validationErrors.defaultFulfillmentPolicyId && (
          <p className="text-sm text-red-600 mt-1">
            {validationErrors.defaultFulfillmentPolicyId}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Find your policy IDs in eBay Seller Hub → Business Policies → Shipping Policies
        </p>
        {availablePolicies.fulfillment.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-blue-600 cursor-pointer">Available policies</summary>
            <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc">
              {availablePolicies.fulfillment.map(policy => (
                <li key={policy.fulfillmentPolicyId}>
                  {policy.name}: <code className="bg-gray-100 px-1 rounded">{policy.fulfillmentPolicyId}</code>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Return Policy */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Return Policy ID
        </label>
        <input
          type="text"
          className={`w-full border rounded px-3 py-2 ${
            validationErrors.defaultReturnPolicyId ? 'border-red-500' : ''
          }`}
          value={settings.defaultReturnPolicyId || ''}
          onChange={(e) => {
            setSettings({ ...settings, defaultReturnPolicyId: e.target.value });
            setValidationErrors({ ...validationErrors, defaultReturnPolicyId: undefined });
          }}
          placeholder="e.g., 123456789012"
        />
        {validationErrors.defaultReturnPolicyId && (
          <p className="text-sm text-red-600 mt-1">
            {validationErrors.defaultReturnPolicyId}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Find your policy IDs in eBay Seller Hub → Business Policies → Return Policies
        </p>
        {availablePolicies.return.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-blue-600 cursor-pointer">Available policies</summary>
            <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc">
              {availablePolicies.return.map(policy => (
                <li key={policy.returnPolicyId}>
                  {policy.name}: <code className="bg-gray-100 px-1 rounded">{policy.returnPolicyId}</code>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Default Condition */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Condition
        </label>
        <select
          className={`w-full border rounded px-3 py-2 ${
            validationErrors.defaultCondition ? 'border-red-500' : ''
          }`}
          value={settings.defaultCondition || 'NEW_OTHER'}
          onChange={(e) => {
            setSettings({ ...settings, defaultCondition: e.target.value });
            setValidationErrors({ ...validationErrors, defaultCondition: undefined });
          }}
        >
          <option value="NEW_OTHER">New Open Box</option>
          <option value="NEW">New</option>
          <option value="LIKE_NEW">Like New</option>
          <option value="USED_EXCELLENT">Used - Excellent</option>
          <option value="USED_VERY_GOOD">Used - Very Good</option>
          <option value="USED_GOOD">Used - Good</option>
        </select>
        {validationErrors.defaultCondition && (
          <p className="text-sm text-red-600 mt-1">
            {validationErrors.defaultCondition}
          </p>
        )}
      </div>

      {/* SKU Prefix Configuration */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          SKU Prefix (Optional)
        </label>
        <input
          type="text"
          value={skuPrefix}
          onChange={(e) => {
            setSkuPrefix(e.target.value.toUpperCase());
            setValidationErrors({ ...validationErrors, skuPrefix: undefined });
          }}
          placeholder="PETE-"
          maxLength={20}
          className={`w-full max-w-xs border rounded px-3 py-2 ${
            validationErrors.skuPrefix ? 'border-red-500' : ''
          }`}
        />
        {validationErrors.skuPrefix && (
          <p className="text-sm text-red-600 mt-1">
            {validationErrors.skuPrefix}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          This prefix will appear at the beginning of all auto-generated SKUs.
          Example: "PETE-a7b3c4d5-3f2a1b4c"
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Leave blank to use default "SKU-" prefix.
        </p>
      </div>

      {/* Shipping Location */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Default Shipping Location</h2>

        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Address Line 1</label>
          <input
            type="text"
            className={`w-full border rounded px-3 py-2 ${
              validationErrors.defaultLocation ? 'border-red-500' : ''
            }`}
            value={location.addressLine1}
            onChange={(e) => {
              setLocation({ ...location, addressLine1: e.target.value });
              setValidationErrors({ ...validationErrors, defaultLocation: undefined });
            }}
            placeholder="123 Main St"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input
              type="text"
              className={`w-full border rounded px-3 py-2 ${
                validationErrors.defaultLocation ? 'border-red-500' : ''
              }`}
              value={location.city}
              onChange={(e) => {
                setLocation({ ...location, city: e.target.value });
                setValidationErrors({ ...validationErrors, defaultLocation: undefined });
              }}
              placeholder="San Francisco"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">State</label>
            <input
              type="text"
              className={`w-full border rounded px-3 py-2 ${
                validationErrors.defaultLocation ? 'border-red-500' : ''
              }`}
              value={location.stateOrProvince}
              onChange={(e) => {
                setLocation({ ...location, stateOrProvince: e.target.value });
                setValidationErrors({ ...validationErrors, defaultLocation: undefined });
              }}
              placeholder="CA"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Postal Code</label>
            <input
              type="text"
              className={`w-full border rounded px-3 py-2 ${
                validationErrors.defaultLocation ? 'border-red-500' : ''
              }`}
              value={location.postalCode}
              onChange={(e) => {
                setLocation({ ...location, postalCode: e.target.value });
                setValidationErrors({ ...validationErrors, defaultLocation: undefined });
              }}
              placeholder="94105"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Country</label>
            <input
              type="text"
              className={`w-full border rounded px-3 py-2 ${
                validationErrors.defaultLocation ? 'border-red-500' : ''
              }`}
              value={location.country}
              onChange={(e) => {
                setLocation({ ...location, country: e.target.value });
                setValidationErrors({ ...validationErrors, defaultLocation: undefined });
              }}
              placeholder="US"
              maxLength="2"
            />
          </div>
        </div>
        {validationErrors.defaultLocation && (
          <p className="text-sm text-red-600 mt-2">
            {validationErrors.defaultLocation}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {/* Validation Check Button - only show if eBay connected */}
        {ebayConnected && (
          <button
            onClick={handleValidate}
            disabled={loading}
            className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700 disabled:bg-gray-400"
          >
            {loading ? 'Checking...' : 'Validate Settings'}
          </button>
        )}

        {/* Save Button - always enabled */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
