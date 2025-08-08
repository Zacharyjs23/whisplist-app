#!/usr/bin/env node

/**
 * Script to remove invalid EAS projectId from app.json and run `eas init`.
 * If EAS CLI is not logged in, `eas init` will fail and show an error message.
 */
const fs = require('fs');
const { execSync } = require('child_process');
const logger = require('../helpers/logger');

const APP_JSON = 'app.json';

function cleanProjectId() {
  const raw = fs.readFileSync(APP_JSON, 'utf8');
  const appJson = JSON.parse(raw);

  const projectId = appJson.expo?.extra?.eas?.projectId;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId || '',
    );

  if (projectId && !isUuid) {
    delete appJson.expo.extra.eas.projectId;
    if (Object.keys(appJson.expo.extra.eas).length === 0) {
      delete appJson.expo.extra.eas;
    }
    fs.writeFileSync(APP_JSON, JSON.stringify(appJson, null, 2));
    logger.log('Removed invalid eas.projectId from app.json');
  }
}

function runEasInit() {
  try {
    execSync('eas init', { stdio: 'inherit' });
  } catch (err) {
    logger.error('`eas init` failed:', err.message);
  }
}

cleanProjectId();
runEasInit();
