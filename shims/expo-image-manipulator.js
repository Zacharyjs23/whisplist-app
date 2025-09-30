'use strict';

// Lightweight shim for expo-image-manipulator to avoid requiring the native module
// in environments where it isn't installed. It preserves the API surface used
// in the app and simply returns the original URI.

const SaveFormat = {
  JPEG: 'jpeg',
  PNG: 'png',
};

async function manipulateAsync(uri /*, actions, options */) {
  return { uri };
}

const mod = { SaveFormat, manipulateAsync };
module.exports = mod;
module.exports.default = mod;

