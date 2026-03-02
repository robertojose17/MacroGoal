
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface PublishConfig {
  name: string;
  bundleId: string;
  version: string;
  platform: string;
}

/**
 * Get the publish configuration from the app config
 * Ensures all required fields are present and valid
 */
export function getPublishConfig(): PublishConfig {
  const expoConfig = Constants.expoConfig;

  console.log('Loading publish config from Constants.expoConfig:', {
    hasExpoConfig: !!expoConfig,
    name: expoConfig?.name,
    iosBundleId: expoConfig?.ios?.bundleIdentifier,
    androidPackage: expoConfig?.android?.package,
  });

  // Get app name with fallback
  let name = expoConfig?.name || '';
  
  // If still empty, try to get from manifest
  if (!name || name.trim() === '') {
    // @ts-expect-error - accessing manifest for fallback
    name = Constants.manifest?.name || Constants.manifest2?.name || '';
  }

  // Final fallback to a default value
  if (!name || name.trim() === '') {
    name = 'Elite Macro Tracker';
    console.warn('Using default app name:', name);
  }

  // Get bundle ID based on platform with fallback
  let bundleId = '';
  if (Platform.OS === 'ios') {
    bundleId = expoConfig?.ios?.bundleIdentifier || '';
  } else if (Platform.OS === 'android') {
    bundleId = expoConfig?.android?.package || '';
  } else {
    // For web or other platforms, try both
    bundleId = expoConfig?.ios?.bundleIdentifier || expoConfig?.android?.package || '';
  }

  // Final fallback to a default value
  if (!bundleId || bundleId.trim() === '') {
    bundleId = 'com.elitemacrotracker.app';
    console.warn('Using default bundle ID:', bundleId);
  }

  // Get version with fallback
  let version = expoConfig?.version || '';
  if (!version || version.trim() === '') {
    version = '1.0.0';
    console.warn('Using default version:', version);
  }

  const config = {
    name: name.trim(),
    bundleId: bundleId.trim(),
    version: version.trim(),
    platform: Platform.OS,
  };

  console.log('Loaded publish config:', config);

  return config;
}

/**
 * Validate bundle ID format
 */
export function validateBundleId(bundleId: string | undefined | null): boolean {
  if (!bundleId || typeof bundleId !== 'string') {
    return false;
  }
  
  const trimmed = bundleId.trim();
  if (trimmed === '') {
    return false;
  }

  // Bundle ID should be in format: com.company.app
  // Must start with a letter, contain only lowercase letters, numbers, and dots
  // Must have at least two segments separated by dots
  const bundleIdRegex = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i;
  return bundleIdRegex.test(trimmed);
}

/**
 * Validate app name
 */
export function validateAppName(name: string | undefined | null): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const trimmed = name.trim();
  // App name should not be empty and should be reasonable length
  return trimmed.length > 0 && trimmed.length <= 100;
}

/**
 * Validate the entire publish configuration
 */
export function validatePublishConfig(config: PublishConfig): {
  isValid: boolean;
  errors: { [key: string]: string };
} {
  const errors: { [key: string]: string } = {};

  if (!validateAppName(config.name)) {
    errors.name = 'App name must be between 1 and 100 characters';
  }

  if (!validateBundleId(config.bundleId)) {
    errors.bundleId = 'Invalid bundle ID format (e.g., com.company.app)';
  }

  if (!config.version || config.version.trim() === '') {
    errors.version = 'Version is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Prepare the publish payload
 * Ensures all fields are strings and properly formatted
 * This function guarantees that name and bundleId will NEVER be undefined
 */
export function preparePublishPayload(config: PublishConfig): {
  name: string;
  bundleId: string;
  version: string;
  platform: string;
} {
  // First, ensure all values are strings (never undefined or null)
  const safeConfig: PublishConfig = {
    name: config.name || '',
    bundleId: config.bundleId || '',
    version: config.version || '1.0.0',
    platform: config.platform || Platform.OS,
  };

  // Validate the config
  const validation = validatePublishConfig(safeConfig);
  if (!validation.isValid) {
    const errorMessages = Object.values(validation.errors).join(', ');
    throw new Error(`Invalid publish configuration: ${errorMessages}`);
  }

  // Return the payload with all fields guaranteed to be non-empty strings
  const payload = {
    name: String(safeConfig.name).trim(),
    bundleId: String(safeConfig.bundleId).trim(),
    version: String(safeConfig.version).trim(),
    platform: String(safeConfig.platform),
  };

  // Final safety check - this should never happen if validation passed
  if (!payload.name || !payload.bundleId) {
    throw new Error('Critical error: name or bundleId is empty after validation');
  }

  console.log('Prepared publish payload:', payload);
  console.log('Payload types:', {
    name: typeof payload.name,
    bundleId: typeof payload.bundleId,
    version: typeof payload.version,
    platform: typeof payload.platform,
  });

  return payload;
}
