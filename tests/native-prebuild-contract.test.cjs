'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const projectRequire = createRequire(path.join(root, 'package.json'));
const cliRequire = createRequire(projectRequire.resolve('@expo/cli/package.json'));
// Use the range evaluator declared by the installed CLI, not a new dependency.
const semver = cliRequire('semver');
const bundled = projectRequire('expo/bundledNativeModules.json');

for (const consumer of ['@expo/cli', 'expo-splash-screen']) {
  test(`${consumer} resolves prebuild satisfying its own declared dependency`, () => {
    const consumerRequire = createRequire(projectRequire.resolve(`${consumer}/package.json`));
    const manifest = consumerRequire('./package.json');
    const range = manifest.dependencies['@expo/prebuild-config'];
    const resolved = consumerRequire('@expo/prebuild-config/package.json');
    assert.equal(typeof range, 'string');
    assert.ok(semver.validRange(range), `Invalid prebuild dependency range: ${range}`);
    assert.ok(semver.satisfies(resolved.version, range),
      `${consumer}@${manifest.version} expects ${range}, resolves ${resolved.version}`);
  });
}

test('CLI and SplashScreen resolve the same compatible prebuild implementation', () => {
  const splashRequire = createRequire(projectRequire.resolve('expo-splash-screen/package.json'));
  assert.equal(fs.realpathSync(cliRequire.resolve('@expo/prebuild-config/package.json')),
    fs.realpathSync(splashRequire.resolve('@expo/prebuild-config/package.json')));
});

for (const name of ['expo-secure-store', 'expo-crypto', 'react']) {
  test(`${name} installed and declared versions support the bundled Expo contract`, () => {
    const installed = projectRequire(`${name}/package.json`).version;
    const declared = projectRequire('./package.json').dependencies[name];
    const expected = bundled[name];
    assert.equal(typeof expected, 'string');
    assert.ok(semver.satisfies(installed, expected), `${name}@${installed} does not satisfy Expo ${expected}`);
    assert.ok(semver.satisfies(installed, declared), `${name}@${installed} does not satisfy package.json ${declared}`);
  });
}

test('the rejected cross-SDK prebuild override is absent from package-manager configuration', () => {
  const manifest = projectRequire('./package.json');
  assert.equal(manifest.resolutions?.['@expo/prebuild-config'], undefined);
  assert.equal(manifest.pnpm?.overrides?.['@expo/prebuild-config'], undefined);
  const workspace = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  assert.doesNotMatch(workspace, /^\s*['"]?@expo\/prebuild-config['"]?\s*:/m);
});
