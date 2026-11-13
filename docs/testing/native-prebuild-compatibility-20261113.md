# Native dependency contract review, 2026-11-13

## Corrected prebuild resolution

The former global `@expo/prebuild-config: 57.0.17` override violated both installed consumers' declared ranges. The override/resolution was removed rather than broadening their ranges.

| Consumer | Installed | Declared prebuild range | Actual resolved prebuild |
| --- | --- | --- | --- |
| `@expo/cli` | 54.0.27 | ^54.0.9 | 54.0.9 |
| `expo-splash-screen` | 31.0.13 | ^54.0.8 | 54.0.9 |

Both consumers now resolve the same installed implementation. The dependency owner reports resolution with the declared pnpm 10.21.0 and a successful frozen installation with lifecycle scripts disabled. This review independently checks installed resolution, not that earlier install command's execution.

`tests/native-prebuild-contract.test.cjs` verifies both consumer ranges, shared resolution, removal of the override, and the installed/declared/bundled contracts for React, SecureStore and Crypto. It uses the installed CLI's declared semver dependency. No network, generation or native build is required by these tests.

## TDEE dependencies matching installed Expo 54.0.37 metadata

| Package | Installed | Expo bundled expectation |
| --- | --- | --- |
| React | 19.1.0 | 19.1.0 |
| Expo SecureStore | 15.0.8 | ~15.0.8 |
| Expo Crypto | 15.0.9 | ~15.0.9 |

Earlier source inspection confirmed the used SecureStore methods, SHA-256 and randomUUID APIs exist. That is not proof of native linking, effective Android backup exclusions, keychain behavior, process-kill recovery or a device installation.

## Remaining release differences, not silently fixed

| Package | Installed | Expo bundled expectation |
| --- | --- | --- |
| expo-router | 5.1.11 | ~6.0.24 |
| react-native | 0.81.4 | 0.81.5 |
| @react-native-community/datetimepicker | 8.6.0 | 8.4.4 |
| react-native-gesture-handler | 2.32.0 | ~2.28.0 |
| react-native-safe-area-context | 5.9.1 | ~5.6.0 |
| react-native-worklets | 0.8.0 | 0.5.1 |
| react-native-maps | 1.29.11 | 1.20.1 |
| react-native-svg | 15.15.5 | 15.12.1 |
| react-native-webview | 13.17.0 | 13.15.0 |

Prioritize Router's major-version alignment and React Native's patch alignment before native release validation. Existing Router 5.1.11 does expose the synchronous callback/cleanup useFocusEffect contract used by TDEE; no missing hook API was found. Alignment still needs navigation/auth/focus regression coverage.

These nine differences are against Expo's installed compatibility metadata, not nine reproduced build failures. In particular, the installed Worklets 0.8.x and Reanimated 4.1.x compatibility matrices explicitly include RN 0.81 and each other. Reanimated 4.1.7 satisfies Expo's ~4.1.1 range; its Babel plugin delegates to the installed Worklets plugin.

The peer-installed `@react-native/metro-config` 0.87.1 also deserves review when aligning the dependency tree. The app's Metro configuration uses Expo Metro 54.0.17; this audit did not establish that Metro 0.87 participates in the native bundle.

Passing these focal tests is not a full dependency, native build, account E2E or clinical validation. No TestFlight, build, deployment, recommendation activation or account mutation is part of this review.

## Consolidated verification

Declared pnpm 10.21.0 resolved and installed the official dependency with `--frozen-lockfile --ignore-scripts`. All importer specifiers and versions remain byte-equivalent as parsed data; only one package was added (prebuild 54.0.9), five obsolete entries were removed, and two consumers were redirected. The discarded pnpm 11 resolution was not used.

Maintained CI: **403/403 pass, zero skips**. Absolute app types: **5 existing diagnostics / 391 roots**, not a pass. There was no native build, environment creation or deployment.
