#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');

// EAS may append --platform <platform> as extra args to prebuildCommand.
// We handle it here by detecting the platform from env or args.
// Extra args passed by EAS after the script name land in process.argv but are ignored.
const platform = process.env.EAS_BUILD_PLATFORM || 'ios';

console.log(`[run-prebuild] Running expo prebuild for platform: ${platform}`);
execSync(`npx expo prebuild --platform ${platform}`, { stdio: 'inherit' });

console.log('[run-prebuild] Running patch-folly (post-prebuild)...');
execSync('node scripts/patch-folly.js', { stdio: 'inherit' });
