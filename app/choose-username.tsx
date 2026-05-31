
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { checkUsernameAvailability, setUsername } from '@/utils/username';

const USERNAME_REGEX = /^[a-z0-9][a-z0-9_.]{2,19}$/;
const ALLOWED_CHARS_REGEX = /[^a-z0-9_.]/g;

type CheckState = 'idle' | 'too_short' | 'invalid' | 'checking' | 'available' | 'taken' | 'reserved';

export default function ChooseUsernameScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [value, setValue] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [saving, setSaving] = useState(false);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardColor = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const textSecColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const inputBg = isDark ? '#2C2C2E' : '#F5F5F5';

  // Debounced availability check
  useEffect(() => {
    if (!value) {
      setCheckState('idle');
      return;
    }

    if (value.length < 3) {
      setCheckState('too_short');
      return;
    }

    if (!USERNAME_REGEX.test(value)) {
      setCheckState('invalid');
      return;
    }

    setCheckState('checking');

    const timer = setTimeout(async () => {
      console.log('[ChooseUsername] Debounced check for:', value);
      const result = await checkUsernameAvailability(value);
      if (result.available) {
        setCheckState('available');
      } else if (result.reason === 'reserved') {
        setCheckState('reserved');
      } else {
        setCheckState('taken');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [value]);

  const handleChangeText = useCallback((text: string) => {
    // Lowercase + strip disallowed chars
    const cleaned = text.toLowerCase().replace(ALLOWED_CHARS_REGEX, '');
    console.log('[ChooseUsername] Input changed:', cleaned);
    setValue(cleaned);
  }, []);

  const handleContinue = async () => {
    if (checkState !== 'available') return;
    console.log('[ChooseUsername] Continue pressed with username:', value);
    setSaving(true);
    const result = await setUsername(value);
    setSaving(false);

    if (result.ok) {
      console.log('[ChooseUsername] Username set successfully:', result.username);
      router.back();
    } else {
      console.warn('[ChooseUsername] Failed to set username, reason:', result.reason);
      if (result.reason === 'taken') {
        setCheckState('taken');
      } else if (result.reason === 'reserved') {
        setCheckState('reserved');
      } else {
        setCheckState('invalid');
      }
    }
  };

  // Pre-compute status message
  const statusMessage = (() => {
    switch (checkState) {
      case 'too_short': return 'Must be 3-20 characters.';
      case 'invalid': return 'Only lowercase letters, numbers, underscores, and periods.';
      case 'checking': return 'Checking...';
      case 'available': return `@${value} is available!`;
      case 'taken': return 'This username is already taken.';
      case 'reserved': return "This username isn't available.";
      default: return '';
    }
  })();

  const statusColor = (() => {
    switch (checkState) {
      case 'available': return '#22C55E';
      case 'taken':
      case 'reserved':
      case 'invalid': return colors.error;
      default: return textSecColor;
    }
  })();

  const isButtonEnabled = checkState === 'available' && !saving;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              console.log('[ChooseUsername] Back pressed');
              router.back();
            }}
            style={styles.backButton}
          >
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={textColor}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: textColor }]}>Choose Your Username</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Subtitle */}
          <Text style={[styles.subtitle, { color: textSecColor }]}>
            This is how friends will find you on Macro Goal. You can change it later in settings.
          </Text>

          {/* Input card */}
          <View style={[styles.inputCard, { backgroundColor: cardColor, borderColor }]}>
            <Text style={[styles.inputLabel, { color: textSecColor }]}>USERNAME</Text>
            <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor }]}>
              <Text style={[styles.atSymbol, { color: textSecColor }]}>@</Text>
              <TextInput
                style={[styles.textInput, { color: textColor }]}
                value={value}
                onChangeText={handleChangeText}
                placeholder="yourname"
                placeholderTextColor={textSecColor}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                autoFocus
              />
              {checkState === 'checking' && (
                <ActivityIndicator size="small" color={textSecColor} style={styles.inputSpinner} />
              )}
              {checkState === 'available' && (
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name="check_circle"
                  size={20}
                  color="#22C55E"
                />
              )}
            </View>

            {/* Status message */}
            {statusMessage !== '' && (
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusMessage}
              </Text>
            )}
          </View>

          {/* Rules hint */}
          <Text style={[styles.rulesText, { color: textSecColor }]}>
            3-20 characters. Letters, numbers, underscores, and periods only.
          </Text>
        </ScrollView>

        {/* CTA button */}
        <View style={[styles.footer, { backgroundColor: bgColor }]}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: isButtonEnabled ? colors.primary : (isDark ? '#2C2C2E' : colors.disabled) },
            ]}
            onPress={handleContinue}
            disabled={!isButtonEnabled}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[styles.continueButtonText, { color: isButtonEnabled ? '#FFFFFF' : textSecColor }]}>
                Continue
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
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
    fontSize: 20,
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  subtitle: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  inputCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    gap: spacing.xs,
  },
  atSymbol: {
    fontSize: 18,
    fontWeight: '600',
  },
  textInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    padding: 0,
  },
  inputSpinner: {
    marginLeft: spacing.xs,
  },
  statusText: {
    fontSize: 13,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  rulesText: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  continueButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
