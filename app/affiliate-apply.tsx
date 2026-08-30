import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase/client';
import { checkCodeAvailability, submitAffiliateApplication } from '@/utils/affiliateApi';
import { useTranslation } from 'react-i18next';

const BLUE = '#3b82f6';

export default function AffiliateApplyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [desiredCode, setDesiredCode] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [termsChecked, setTermsChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Code availability state
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');
  const [codeError, setCodeError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      console.log('[AffiliateApply] Loading user data for pre-fill');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setEmail(user.email || '');
        const { data: profile } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();
        if (profile?.name) setFullName(profile.name);
      } catch (e) {
        console.error('[AffiliateApply] Failed to load user data:', e);
      }
    };
    loadUserData();
  }, []);

  const handleCodeChange = (text: string) => {
    const normalized = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setDesiredCode(normalized);
    setCodeStatus('idle');
    setCodeError('');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (normalized.length < 3) {
      if (normalized.length > 0) {
        setCodeStatus('error');
        setCodeError(t('affiliateApply.codeMinLength'));
      }
      return;
    }

    setCodeStatus('checking');
    debounceRef.current = setTimeout(async () => {
      console.log('[AffiliateApply] Checking code availability:', normalized);
      const result = await checkCodeAvailability(normalized);
      if (result.error && !result.available) {
        setCodeStatus('error');
        setCodeError(result.error);
      } else if (result.available) {
        setCodeStatus('available');
      } else {
        setCodeStatus('taken');
      }
    }, 600);
  };

  const handleSubmit = async () => {
    console.log('[AffiliateApply] Submit button pressed');

    if (!fullName.trim()) {
      Alert.alert(t('affiliateApply.requiredTitle'), t('affiliateApply.enterFullName'));
      return;
    }
    if (!email.trim()) {
      Alert.alert(t('affiliateApply.requiredTitle'), t('affiliateApply.enterEmail'));
      return;
    }
    if (!socialHandle.trim()) {
      Alert.alert(t('affiliateApply.requiredTitle'), t('affiliateApply.enterSocialHandle'));
      return;
    }
    if (!desiredCode || desiredCode.length < 3) {
      Alert.alert(t('affiliateApply.requiredTitle'), t('affiliateApply.enterAffiliateCode'));
      return;
    }
    if (codeStatus === 'taken') {
      Alert.alert(t('affiliateApply.codeTakenTitle'), t('affiliateApply.codeTakenMessage'));
      return;
    }
    if (codeStatus === 'checking') {
      Alert.alert(t('affiliateApply.pleaseWaitTitle'), t('affiliateApply.checkingCodeMessage'));
      return;
    }
    if (!paypalEmail.trim()) {
      Alert.alert(t('affiliateApply.requiredTitle'), t('affiliateApply.enterPaypalEmail'));
      return;
    }
    if (!termsChecked) {
      Alert.alert(t('affiliateApply.requiredTitle'), t('affiliateApply.acceptTerms'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitAffiliateApplication({
        fullName: fullName.trim(),
        email: email.trim(),
        socialHandle: socialHandle.trim(),
        desiredCode: desiredCode.trim(),
        paypalEmail: paypalEmail.trim(),
        termsAccepted: termsChecked,
      });

      if (result.success) {
        console.log('[AffiliateApply] Application submitted successfully');
        Alert.alert(
          t('affiliateApply.submittedTitle'),
          t('affiliateApply.submittedMessage'),
          [{ text: t('affiliateApply.ok'), onPress: () => router.back() }]
        );
      } else {
        console.error('[AffiliateApply] Submission failed:', result.error);
        Alert.alert(t('affiliateApply.errorTitle'), result.error || t('affiliateApply.failedToSubmit'));
      }
    } catch (e) {
      console.error('[AffiliateApply] Unexpected error:', e);
      Alert.alert(t('affiliateApply.errorTitle'), t('affiliateApply.somethingWentWrong'));
    } finally {
      setSubmitting(false);
    }
  };

  const bg = isDark ? '#0d0d0d' : colors.primaryBackground;
  const cardBg = isDark ? '#1a1a1a' : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#111' : '#F0F2F7';
  const inputBorder = isDark ? colors.borderDark : colors.border;

  const codeStatusColor =
    codeStatus === 'available' ? '#22c55e' :
    codeStatus === 'taken' || codeStatus === 'error' ? colors.error :
    mutedColor;

  const codeStatusText =
    codeStatus === 'available' ? t('affiliateApply.codeAvailable') :
    codeStatus === 'taken' ? t('affiliateApply.codeTaken') :
    codeStatus === 'checking' ? t('affiliateApply.codeChecking') :
    codeStatus === 'error' ? codeError :
    '';

  const codeBorderColor =
    codeStatus === 'available' ? '#22c55e' :
    codeStatus === 'taken' || codeStatus === 'error' ? colors.error :
    inputBorder;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Intro */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.introTitle, { color: textColor }]}>
              {t('affiliateApply.introTitle')}
            </Text>
            <Text style={[styles.introBody, { color: mutedColor }]}>
              {t('affiliateApply.introBody')}
            </Text>
          </View>

          {/* Contact Info */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>{t('affiliateApply.contactInfoTitle')}</Text>

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>{t('affiliateApply.fullNameLabel')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder={t('affiliateApply.fullNamePlaceholder')}
              placeholderTextColor={mutedColor}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>{t('affiliateApply.emailLabel')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={mutedColor}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>

          {/* Social & Code */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>{t('affiliateApply.affiliateDetailsTitle')}</Text>

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>{t('affiliateApply.socialHandleLabel')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={socialHandle}
              onChangeText={setSocialHandle}
              placeholder={t('affiliateApply.socialHandlePlaceholder')}
              placeholderTextColor={mutedColor}
              autoCapitalize="none"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>{t('affiliateApply.desiredCodeLabel')}</Text>
            <Text style={[styles.fieldHint, { color: mutedColor }]}>
              {t('affiliateApply.desiredCodeHint')}
            </Text>
            <View style={styles.codeInputRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.codeInput,
                  { backgroundColor: inputBg, borderColor: codeBorderColor, color: textColor },
                ]}
                value={desiredCode}
                onChangeText={handleCodeChange}
                placeholder="e.g. MARIAFIT"
                placeholderTextColor={mutedColor}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
                returnKeyType="next"
              />
              {codeStatus === 'checking' && (
                <ActivityIndicator size="small" color={BLUE} style={styles.codeSpinner} />
              )}
            </View>
            {codeStatusText !== '' && (
              <Text style={[styles.codeStatusText, { color: codeStatusColor }]}>
                {codeStatusText}
              </Text>
            )}
          </View>

          {/* PayPal */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>{t('affiliateApply.payoutInfoTitle')}</Text>

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>{t('affiliateApply.paypalEmailLabel')}</Text>
            <Text style={[styles.fieldHint, { color: mutedColor }]}>
              {t('affiliateApply.paypalEmailHint')}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={paypalEmail}
              onChangeText={setPaypalEmail}
              placeholder="your@paypal.com"
              placeholderTextColor={mutedColor}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="done"
            />
          </View>

          {/* Terms */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>{t('affiliateApply.termsTitle')}</Text>
            <Text style={[styles.termsBody, { color: mutedColor }]}>
              {t('affiliateApply.termsSummary')}
            </Text>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => {
                const next = !termsChecked;
                console.log('[AffiliateApply] Terms checkbox toggled:', next);
                setTermsChecked(next);
              }}
              activeOpacity={0.7}
            >
              <View style={[
                styles.checkbox,
                { borderColor: termsChecked ? BLUE : mutedColor },
                termsChecked && { backgroundColor: BLUE },
              ]}>
                {termsChecked && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </View>
              <Text style={[styles.checkboxLabel, { color: textColor }]}>
                {t('affiliateApply.termsCheckboxLabel')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: BLUE, opacity: submitting ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>{t('affiliateApply.submitButton')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  introBody: {
    ...typography.caption,
  },
  sectionTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    ...typography.small,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  codeInputRow: {
    position: 'relative',
  },
  codeInput: {
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 16,
  },
  codeSpinner: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  codeStatusText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  termsBody: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  submitButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomSpacer: { height: 20 },
});
