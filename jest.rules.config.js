/**
 * Node-only Jest config to run Firestore security rules tests without jest-expo.
 * Transforms Firebase ESM packages in node_modules via babel-jest.
 */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(firebase|@firebase)/)'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

