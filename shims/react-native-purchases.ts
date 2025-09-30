const warned = new Set<string>();

function warnOnce(method: string) {
  if (__DEV__ && !warned.has(method)) {
    console.warn(
      `[RevenueCat disabled] ${method} called, but react-native-purchases is not installed. Install the package to enable iOS subscriptions.`,
    );
    warned.add(method);
  }
}

const emptyCustomerInfo = Object.freeze({ entitlements: { active: {} } });

const PurchasesStub = {
  isStub: true,
  async configure() {
    warnOnce('configure');
  },
  async getCustomerInfo() {
    warnOnce('getCustomerInfo');
    return emptyCustomerInfo;
  },
  addCustomerInfoUpdateListener(listener?: () => void) {
    warnOnce('addCustomerInfoUpdateListener');
    return () => {
      if (typeof listener === 'function') {
        try {
          listener();
        } catch {
          // ignore listener teardown errors
        }
      }
    };
  },
  async getOfferings() {
    warnOnce('getOfferings');
    return null;
  },
  async purchaseProduct() {
    warnOnce('purchaseProduct');
    throw new Error('RevenueCat is not available');
  },
  async restorePurchases() {
    warnOnce('restorePurchases');
    return emptyCustomerInfo;
  },
  async setDebugLogsEnabled() {
    warnOnce('setDebugLogsEnabled');
  },
};

export default PurchasesStub;
