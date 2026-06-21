import React, { useState, useEffect } from 'react';
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
import { getReferralStats, submitAffiliateApplication } from '@/utils/referralApi';
import { supabase } from '@/lib/supabase/client';

const TEAL = '#14B8A6';

export default function AffiliateApplyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');
  const [howToPromote, setHowToPromote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [totalReferrals, setTotalReferrals] = useState(0);
  const [premiumConverts, setPremiumConverts] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [referralCodeId, setReferralCodeId] = useState('');

  useEffect(() => {
    const loadData = async () => {
      console.log('[AffiliateApply] Loading stats and pre-filling user data');
      try {
        const [stats, { data: { user } }] = await Promise.all([
          getReferralStats(),
          supabase.auth.getUser(),
        ]);

        setTotalReferrals(stats.totalReferrals);
        setPremiumConverts(stats.premiumConverts);
        setXpEarned(stats.xpEarned);

        if (user) {
          setEmail(user.email || '');

          const { data: rc } = await supabase
            .from('referral_codes')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (rc?.id) setReferralCodeId(rc.id);

          const { data: profile } = await supabase
            .from('users')
            .select('name')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.name) setFullName(profile.name);
        }
      } catch (e) {
        console.error('[AffiliateApply] Failed to load data:', e);
      }
    };
    loadData();
  }, []);

  const handleSubmit = async () => {
    console.log('[AffiliateApply] Submit button pressed');

    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number.');
      return;
    }
    if (!howToPromote.trim()) {
      Alert.alert('Required', 'Please describe how you plan to promote Macro Goal.');
      return;
    }
    if (howToPromote.trim().length < 50) {
      Alert.alert('Too Short', `Please write at least 50 characters (currently ${howToPromote.trim().length}).`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitAffiliateApplication({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        instagram: instagram.trim() || undefined,
        tiktok: tiktok.trim() || undefined,
        youtube: youtube.trim() || undefined,
        howTheyPlanToPromote: howToPromote.trim(),
        totalReferrals,
        totalPremium: premiumConverts,
        referralCodeId,
      });

      if (result.success) {
        console.log('[AffiliateApply] Application submitted successfully');
        Alert.alert(
          'Application Submitted!',
          "We'll review it within 2-3 business days.",
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        console.error('[AffiliateApply] Submission failed:', result.error);
        Alert.alert('Error', result.error || 'Failed to submit application. Please try again.');
      }
    } catch (e) {
      console.error('[AffiliateApply] Unexpected error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const bg = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#1A1C2E' : '#F0F2F7';
  const inputBorder = isDark ? colors.borderDark : colors.border;

  const charCount = howToPromote.trim().length;
  const charCountColor = charCount < 50 ? colors.error : TEAL;

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
              {'🌟 Affiliate Program Application'}
            </Text>
            <Text style={[styles.introBody, { color: mutedColor }]}>
              Fill out the form below and our team will review your application within 2-3 business days.
            </Text>
          </View>

          {/* Contact Info */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Contact Information</Text>

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>Full Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your full name"
              placeholderTextColor={mutedColor}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>Email *</Text>
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

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>Phone *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 (555) 000-0000"
              placeholderTextColor={mutedColor}
              keyboardType="phone-pad"
              returnKeyType="next"
            />
          </View>

          {/* Social Media */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Social Media (Optional)</Text>

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>Instagram Handle</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={instagram}
              onChangeText={setInstagram}
              placeholder="@yourhandle"
              placeholderTextColor={mutedColor}
              autoCapitalize="none"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>TikTok Handle</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={tiktok}
              onChangeText={setTiktok}
              placeholder="@yourhandle"
              placeholderTextColor={mutedColor}
              autoCapitalize="none"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: mutedColor }]}>YouTube Channel</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textColor }]}
              value={youtube}
              onChangeText={setYoutube}
              placeholder="youtube.com/yourchannel"
              placeholderTextColor={mutedColor}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>

          {/* Promotion Plan */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Promotion Plan</Text>
            <Text style={[styles.fieldLabel, { color: mutedColor }]}>
              How do you plan to promote Macro Goal? *
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: inputBg, borderColor: inputBorder, color: textColor },
              ]}
              value={howToPromote}
              onChangeText={setHowToPromote}
              placeholder="Describe your audience, platforms, and promotion strategy... (min 50 characters)"
              placeholderTextColor={mutedColor}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: charCountColor }]}>
              {charCount}
              {' / 50 min'}
            </Text>
          </View>

          {/* Stats */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Your Stats at Application</Text>
            <View style={styles.statsList}>
              <View style={styles.statsListRow}>
                <Ionicons name="people-outline" size={16} color={TEAL} />
                <Text style={[styles.statsListText, { color: textColor }]}>
                  {totalReferrals}
                  {' friends referred'}
                </Text>
              </View>
              <View style={styles.statsListRow}>
                <Ionicons name="star-outline" size={16} color={TEAL} />
                <Text style={[styles.statsListText, { color: textColor }]}>
                  {premiumConverts}
                  {' converted to premium'}
                </Text>
              </View>
              <View style={styles.statsListRow}>
                <Ionicons name="flash-outline" size={16} color={TEAL} />
                <Text style={[styles.statsListText, { color: textColor }]}>
                  {xpEarned.toLocaleString()}
                  {' XP earned'}
                </Text>
              </View>
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: TEAL, opacity: submitting ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Application</Text>
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
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  textArea: {
    minHeight: 120,
    paddingTop: spacing.sm,
  },
  charCount: {
    ...typography.small,
    textAlign: 'right',
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  statsList: {
    gap: spacing.sm,
  },
  statsListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statsListText: {
    ...typography.caption,
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
