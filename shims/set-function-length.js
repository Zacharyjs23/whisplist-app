// Minimal shim for the 'set-function-length' package to unblock Metro web bundling.
// It returns the original function without attempting to modify `length`.
// This is sufficient for our usage where exact arity is not critical in the browser.
'use strict';

module.exports = function setFunctionLength(fn /*, length */) {
  return fn;
};

