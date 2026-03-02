
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import {
  getPublishConfig,
  validateBundleId,
  validateAppName,
  preparePublishPayload,
  PublishConfig,
} from '@/utils/publishConfig';

export default function PublishScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [appName, setAppName] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [version, setVersion] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; bundleId?: string }>({});

  useEffect(() => {
    // Load initial values from config
    try {
      const config = getPublishConfig();
      console.log('Initial config loaded:', config);
      
      // Set the values, ensuring they're never undefined
      setAppName(config.name || 'Elite Macro Tracker');
      setBundleId(config.bundleId || 'com.elitemacrotracker.app');
      setVersion(config.version || '1.0.0');
    } catch (error: any) {
      console.error('Error loading publish config:', error);
      
      // Set default values instead of showing error
      setAppName('Elite Macro Tracker');
      setBundleId('com.elitemacrotracker.app');
      setVersion('1.0.0');
      
      Alert.alert(
        'Configuration Warning',
        'Could not load configuration from app.json. Using default values. Please verify the app name and bundle ID before publishing.',
        [{ text: 'OK' }]
      );
    }
  }, []);

  const validateInputs = () => {
    console.log('Validating inputs:', { appName, bundleId });
    
    const newErrors: { name?: string; bundleId?: string } = {};

    // Validate app name
    if (!validateAppName(appName)) {
      newErrors.name = 'App name must be between 1 and 100 characters';
      console.log('App name validation failed');
    }

    // Validate bundle ID
    if (!validateBundleId(bundleId)) {
      newErrors.bundleId = 'Invalid bundle ID format (e.g., com.company.app)';
      console.log('Bundle ID validation failed');
    }

    setErrors(newErrors);
    const isValid = Object.keys(newErrors).length === 0;
    console.log('Validation result:', { isValid, errors: newErrors });
    
    return isValid;
  };

  const handlePublish = async () => {
    console.log('=== PUBLISH PROCESS STARTED ===');
    console.log('Current state:', {
      appName,
      bundleId,
      version,
      appNameType: typeof appName,
      bundleIdType: typeof bundleId,
    });
    
    // Validate inputs
    if (!validateInputs()) {
      Alert.alert('Validation Error', 'Please fix the errors before publishing.');
      return;
    }

    // Additional safety check - ensure values are not empty
    if (!appName || appName.trim() === '') {
      Alert.alert('Error', 'App name cannot be empty');
      return;
    }

    if (!bundleId || bundleId.trim() === '') {
      Alert.alert('Error', 'Bundle ID cannot be empty');
      return;
    }

    setIsPublishing(true);

    try {
      // Prepare the config with explicit string values
      const config: PublishConfig = {
        name: String(appName).trim(),
        bundleId: String(bundleId).trim(),
        version: String(version).trim(),
        platform: Platform.OS,
      };

      console.log('Config prepared:', config);

      // Prepare and validate the payload
      const payload = preparePublishPayload(config);

      console.log('=== PAYLOAD PREPARED ===');
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.log('Payload types:', {
        name: typeof payload.name,
        bundleId: typeof payload.bundleId,
        version: typeof payload.version,
        platform: typeof payload.platform,
      });

      // Verify that name and bundleId are strings and not empty
      if (typeof payload.name !== 'string' || payload.name === '') {
        throw new Error(`Invalid payload: name must be a non-empty string (got: ${typeof payload.name}, value: "${payload.name}")`);
      }

      if (typeof payload.bundleId !== 'string' || payload.bundleId === '') {
        throw new Error(`Invalid payload: bundleId must be a non-empty string (got: ${typeof payload.bundleId}, value: "${payload.bundleId}")`);
      }

      console.log('=== SENDING TO API ===');
      console.log('API URL: https://api.natively.dev/publish');
      console.log('Request body:', JSON.stringify(payload));

      // Make the API call to publish
      const response = await fetch('https://api.natively.dev/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('=== API RESPONSE ===');
      console.log('Status:', response.status);
      console.log('Status text:', response.statusText);

      const result = await response.json();
      console.log('Response body:', JSON.stringify(result, null, 2));

      if (!response.ok) {
        // Log the validation errors if present
        if (result.errors) {
          console.error('=== VALIDATION ERRORS ===');
          console.error(JSON.stringify(result.errors, null, 2));
        }
        throw new Error(result.message || 'Failed to publish app');
      }

      console.log('=== PUBLISH SUCCESS ===');
      Alert.alert(
        'Success',
        'Your app has been published successfully!',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error: any) {
      console.error('=== PUBLISH ERROR ===');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      Alert.alert(
        'Publish Failed',
        error.message || 'An error occurred while publishing your app. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
          Publish App
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.infoCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <IconSymbol
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.infoText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Before publishing, ensure your app name and bundle ID are correct. These values will be used to identify your app.
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              App Name *
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  color: isDark ? colors.textDark : colors.text,
                  borderColor: errors.name ? colors.error : (isDark ? colors.borderDark : colors.border),
                },
              ]}
              value={appName}
              onChangeText={(text) => {
                setAppName(text);
                if (errors.name) {
                  setErrors({ ...errors, name: undefined });
                }
              }}
              placeholder="Enter app name"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
            {errors.name && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {errors.name}
              </Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Bundle ID *
            </Text>
            <Text style={[styles.hint, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Format: com.company.appname
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  color: isDark ? colors.textDark : colors.text,
                  borderColor: errors.bundleId ? colors.error : (isDark ? colors.borderDark : colors.border),
                },
              ]}
              value={bundleId}
              onChangeText={(text) => {
                setBundleId(text.toLowerCase().replace(/\s/g, ''));
                if (errors.bundleId) {
                  setErrors({ ...errors, bundleId: undefined });
                }
              }}
              placeholder="com.company.appname"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors.bundleId && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {errors.bundleId}
              </Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Version
            </Text>
            <Text style={[styles.versionText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {version}
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Platform
            </Text>
            <Text style={[styles.versionText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}
            </Text>
          </View>
        </View>

        <View style={[styles.debugCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.debugTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Debug Info
          </Text>
          <Text style={[styles.debugText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Name type: {typeof appName}
          </Text>
          <Text style={[styles.debugText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            BundleId type: {typeof bundleId}
          </Text>
          <Text style={[styles.debugText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Name value: {appName || '(empty)'}
          </Text>
          <Text style={[styles.debugText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            BundleId value: {bundleId || '(empty)'}
          </Text>
          <Text style={[styles.debugText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Name isEmpty: {!appName || appName.trim() === '' ? 'YES' : 'NO'}
          </Text>
          <Text style={[styles.debugText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            BundleId isEmpty: {!bundleId || bundleId.trim() === '' ? 'YES' : 'NO'}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.publishButton,
            { backgroundColor: colors.primary },
            isPublishing && styles.publishButtonDisabled,
          ]}
          onPress={handlePublish}
          disabled={isPublishing}
        >
          {isPublishing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <IconSymbol
                ios_icon_name="arrow.up.circle.fill"
                android_material_icon_name="cloud_upload"
                size={24}
                color="#FFFFFF"
              />
              <Text style={styles.publishButtonText}>Publish App</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={[styles.warningCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={24}
            color={colors.accent}
          />
          <Text style={[styles.warningText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Make sure to test your app thoroughly before publishing. Once published, changes may take time to propagate.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h2,
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  infoCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  infoText: {
    ...typography.body,
    flex: 1,
  },
  formCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  errorText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  versionText: {
    ...typography.body,
    marginTop: spacing.xs,
  },
  debugCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  debugTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  debugText: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  publishButton: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 4,
  },
  publishButtonDisabled: {
    opacity: 0.6,
  },
  publishButtonText: {
    color: '#FFFFFF',
    ...typography.bodyBold,
    fontSize: 16,
  },
  warningCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  warningText: {
    ...typography.caption,
    flex: 1,
  },
});
