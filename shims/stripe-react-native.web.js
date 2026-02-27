'use strict';

const React = require('react');

const WEB_NOT_SUPPORTED = 'Stripe native payments are not supported on web.';

function StripeProvider(props) {
  return props && props.children ? props.children : null;
}

function buildUnsupportedResult() {
  return { error: { message: WEB_NOT_SUPPORTED } };
}

function useStripe() {
  return {
    initPaymentSheet: async () => buildUnsupportedResult(),
    presentPaymentSheet: async () => buildUnsupportedResult(),
  };
}

function CardField() {
  return React.createElement(React.Fragment, null);
}

const mod = {
  StripeProvider,
  useStripe,
  CardField,
};

module.exports = mod;
module.exports.default = mod;
