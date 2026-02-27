'use strict';

const AndroidImportance = {
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
  MAX: 5,
};

const SchedulableTriggerInputTypes = {
  CALENDAR: 'calendar',
};

const DEFAULT_PERMISSIONS = {
  status: 'denied',
  granted: false,
  canAskAgain: true,
  expires: 'never',
};

function setNotificationHandler() {
  return;
}

async function getPermissionsAsync() {
  return DEFAULT_PERMISSIONS;
}

async function requestPermissionsAsync() {
  return DEFAULT_PERMISSIONS;
}

async function getExpoPushTokenAsync() {
  return { data: '' };
}

async function setNotificationChannelAsync() {
  return;
}

function addNotificationResponseReceivedListener() {
  return {
    remove() {
      return;
    },
  };
}

async function scheduleNotificationAsync() {
  return `web-notification-${Date.now()}`;
}

async function cancelScheduledNotificationAsync() {
  return;
}

const mod = {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
  setNotificationChannelAsync,
  addNotificationResponseReceivedListener,
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
};

module.exports = mod;
module.exports.default = mod;
