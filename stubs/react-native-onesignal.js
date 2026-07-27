// Stub for react-native-onesignal — used by Metro extraNodeModules when the
// real native module is not linked (Expo Go, web preview).
// Matches the shape expected by both default imports and named imports.
// ZERO re-exports of the real package.
'use strict';

const noOp = function() {};
const noOpAsync = async function() { return false; };

const LogLevel = {
  Verbose: 0,
  Debug: 1,
  Info: 2,
  Warn: 3,
  Error: 4,
  None: 5,
};

const OneSignal = {
  initialize: noOp,
  login: noOp,
  logout: noOp,
  Debug: {
    setLogLevel: noOp,
  },
  Notifications: {
    getPermissionAsync: noOpAsync,
    requestPermission: noOpAsync,
    addEventListener: noOp,
    removeEventListener: noOp,
  },
  User: {
    addEmail: noOp,
    addTag: noOp,
    addTags: noOp,
    removeTag: noOp,
  },
};

module.exports = {
  default: OneSignal,
  OneSignal: OneSignal,
  LogLevel: LogLevel,
};
