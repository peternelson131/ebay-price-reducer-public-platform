/**
 * Validates eBay business policy ID format and existence
 */
class SettingsValidator {
  constructor(ebayClient) {
    this.ebayClient = ebayClient;
  }

  /**
   * Validate SKU prefix format
   * Must be alphanumeric with hyphens or underscores only
   */
  validateSkuPrefix(prefix) {
    if (!prefix) return { valid: true }; // Optional field

    if (typeof prefix !== 'string') {
      return { valid: false, error: 'SKU prefix must be a string' };
    }

    if (prefix.length > 20) {
      return { valid: false, error: 'SKU prefix cannot exceed 20 characters' };
    }

    const skuPrefixRegex = /^[A-Z0-9_-]+$/i;
    if (!skuPrefixRegex.test(prefix)) {
      return {
        valid: false,
        error: 'SKU prefix must contain only alphanumeric characters, hyphens, or underscores'
      };
    }

    return { valid: true };
  }

  /**
   * Validate location address completeness
   */
  validateLocation(location) {
    if (!location) return { valid: true }; // Optional field

    if (!location.address) {
      return { valid: false, error: 'Location must include an address object' };
    }

    const requiredFields = ['addressLine1', 'city', 'stateOrProvince', 'postalCode', 'country'];
    const missingFields = [];

    for (const field of requiredFields) {
      if (!location.address[field] || location.address[field].trim() === '') {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return {
        valid: false,
        error: `Missing required address fields: ${missingFields.join(', ')}`,
        missingFields
      };
    }

    // Validate country code is 2 characters
    if (location.address.country.length !== 2) {
      return {
        valid: false,
        error: 'Country code must be exactly 2 characters (e.g., "US")'
      };
    }

    return { valid: true };
  }

  /**
   * Validate fulfillment policy ID exists
   */
  async validateFulfillmentPolicyId(policyId, marketplaceId = 'EBAY_US') {
    if (!policyId) return { valid: true }; // Optional field

    try {
      const policies = await this.ebayClient.getFulfillmentPolicies(marketplaceId);
      const exists = policies.fulfillmentPolicies?.some(
        p => p.fulfillmentPolicyId === policyId
      );

      if (!exists) {
        return {
          valid: false,
          error: 'Fulfillment policy ID does not exist in your eBay account',
          availablePolicies: policies.fulfillmentPolicies || []
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to validate fulfillment policy: ${error.message}`
      };
    }
  }

  /**
   * Validate payment policy ID exists
   */
  async validatePaymentPolicyId(policyId, marketplaceId = 'EBAY_US') {
    if (!policyId) return { valid: true }; // Optional field

    try {
      const policies = await this.ebayClient.getPaymentPolicies(marketplaceId);
      const exists = policies.paymentPolicies?.some(
        p => p.paymentPolicyId === policyId
      );

      if (!exists) {
        return {
          valid: false,
          error: 'Payment policy ID does not exist in your eBay account',
          availablePolicies: policies.paymentPolicies || []
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to validate payment policy: ${error.message}`
      };
    }
  }

  /**
   * Validate return policy ID exists
   */
  async validateReturnPolicyId(policyId, marketplaceId = 'EBAY_US') {
    if (!policyId) return { valid: true }; // Optional field

    try {
      const policies = await this.ebayClient.getReturnPolicies(marketplaceId);
      const exists = policies.returnPolicies?.some(
        p => p.returnPolicyId === policyId
      );

      if (!exists) {
        return {
          valid: false,
          error: 'Return policy ID does not exist in your eBay account',
          availablePolicies: policies.returnPolicies || []
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to validate return policy: ${error.message}`
      };
    }
  }

  /**
   * Validate item condition value
   */
  validateCondition(condition) {
    if (!condition) return { valid: true }; // Optional field

    const validConditions = [
      'NEW',
      'NEW_OTHER',
      'NEW_WITH_DEFECTS',
      'MANUFACTURER_REFURBISHED',
      'CERTIFIED_REFURBISHED',
      'LIKE_NEW',
      'USED_EXCELLENT',
      'USED_VERY_GOOD',
      'USED_GOOD',
      'USED_ACCEPTABLE',
      'FOR_PARTS_OR_NOT_WORKING'
    ];

    if (!validConditions.includes(condition)) {
      return {
        valid: false,
        error: `Invalid condition. Must be one of: ${validConditions.join(', ')}`,
        validConditions
      };
    }

    return { valid: true };
  }

  /**
   * Validate all settings at once
   * Returns object with validation results for each field
   */
  async validateAllSettings(settings) {
    const results = {
      valid: true,
      errors: {},
      warnings: {}
    };

    // Validate SKU prefix
    const skuPrefixResult = this.validateSkuPrefix(settings.skuPrefix);
    if (!skuPrefixResult.valid) {
      results.valid = false;
      results.errors.skuPrefix = skuPrefixResult.error;
    }

    // Validate location
    const locationResult = this.validateLocation(settings.defaultLocation);
    if (!locationResult.valid) {
      results.valid = false;
      results.errors.defaultLocation = locationResult.error;
    }

    // Validate condition
    const conditionResult = this.validateCondition(settings.defaultCondition);
    if (!conditionResult.valid) {
      results.valid = false;
      results.errors.defaultCondition = conditionResult.error;
    }

    // Validate policy IDs (async) - treat as warnings, not errors
    // This allows users to manually enter policy IDs without blocking save
    if (this.ebayClient) {
      const [fulfillmentResult, paymentResult, returnResult] = await Promise.all([
        this.validateFulfillmentPolicyId(settings.defaultFulfillmentPolicyId),
        this.validatePaymentPolicyId(settings.defaultPaymentPolicyId),
        this.validateReturnPolicyId(settings.defaultReturnPolicyId)
      ]);

      if (!fulfillmentResult.valid) {
        results.warnings.defaultFulfillmentPolicyId = fulfillmentResult.error;
      }

      if (!paymentResult.valid) {
        results.warnings.defaultPaymentPolicyId = paymentResult.error;
      }

      if (!returnResult.valid) {
        results.warnings.defaultReturnPolicyId = returnResult.error;
      }
    }

    return results;
  }
}

module.exports = { SettingsValidator };
