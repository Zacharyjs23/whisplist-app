const fs = require('fs');
const path = require('path');
const assert = require('assert');

const podfilePath = path.join(__dirname, '..', 'ios', 'Podfile');
const content = fs.readFileSync(podfilePath, 'utf8');
const expected = "File.join(__dir__, '..', 'Podfile.properties.json')";
assert(
  content.includes(expected),
  `Expected Podfile to load properties using ${expected}`
);
console.log('Podfile test passed');
