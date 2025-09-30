'use strict';

// Minimal no-op shim for react-native-purchases to allow bundling
// when the native module isn't installed. All methods resolve safely.

const Purchases = {
  async configure(/* { apiKey, appUserID } */) {
    return;
  },
  async getCustomerInfo() {
    return { entitlements: { active: {} } };
  },
  async getOfferings() {
    return { current: { availablePackages: [] } };
  },
  async purchaseProduct(/* productId */) {
    return { customerInfo: { entitlements: { active: {} } } };
  },
  async restorePurchases() {
    return { customerInfo: { entitlements: { active: {} } } };
  },
  addCustomerInfoUpdateListener(/* listener */) {
    // No-op
  },
};

module.exports = Purchases;
module.exports.default = Purchases;

