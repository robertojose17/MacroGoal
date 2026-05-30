# Expo Go Testing Mode

This project has HealthKit (iOS) and Health Connect (Android) integration for step tracking. These require a native build and CANNOT run in Expo Go.

## Current state: HEALTH PLUGINS DISABLED for Expo Go testing

The following items have been TEMPORARILY removed from `app.json`:

### Android permission (in `expo.android.permissions`)
- `"android.permission.health.READ_STEPS"`

### Plugins (in `expo.plugins`)
- `["@kingstinct/react-native-healthkit", { "NSHealthShareUsageDescription": "Macro Goal reads your step count to award XP for staying active.", "NSHealthUpdateUsageDescription": "Macro Goal does not write to Health." }]`
- `"expo-health-connect"`

## Mock steps in `utils/healthKit.ts`

The constant `MOCK_STEPS` at the top of `utils/healthKit.ts` is set to `8500`, which makes `useSteps()` return mock data without touching native modules. Set it to `null` to use real health data (only works after restoring the plugins below and running a native build).

## How to restore for native builds (production / EAS)

When you want to ship a real build:

1. Open `app.json` and put back the two plugin entries (in `expo.plugins` array, in the same order they appeared before — after `./plugins/withFollyCoroutineFix`):

```json
[
  "@kingstinct/react-native-healthkit",
  {
    "NSHealthShareUsageDescription": "Macro Goal reads your step count to award XP for staying active.",
    "NSHealthUpdateUsageDescription": "Macro Goal does not write to Health."
  }
],
"expo-health-connect"
```

2. Put back the Android permission in `expo.android.permissions`:

```json
"android.permission.health.READ_STEPS"
```

3. Open `utils/healthKit.ts` and change `const MOCK_STEPS: number | null = 8500;` to `const MOCK_STEPS: number | null = null;`

4. Run `eas build` as usual. HealthKit / Health Connect will work in the production build.
