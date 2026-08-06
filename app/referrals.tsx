import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
  Animated,
  Clipboard,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getReferralStats, applyReferralCode } from '@/utils/referralApi';

const TEAL = '#14B8A6';
const GOLD = '#FFB547';
const AFFILIATE_THRESHOLD = 20;

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
}

export default function ReferralsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showPrompt } = useLocalSearchParams<{ showPrompt?: string }>();

  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [tier, setTier] = useState('user');
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [premiumConverts, setPremiumConverts] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [referralList, setReferralList] = useState<{ username: string; joinedAt: string }[]>([]);
  const [applicationStatus, setApplicationStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [copied, setCopied] = useState(false);

  // ── Enter referral code modal ──
  const [enterModalVisible, setEnterModalVisible] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  const loadStats = useCallback(async () => {
    console.log('[Referrals] Loading referral stats');
    setLoading(true);
    try {
      const stats = await getReferralStats();
      setCode(stats.code);
      setTier(stats.tier);
      setTotalReferrals(stats.totalReferrals);
      setPremiumConverts(stats.premiumConverts);
      setXpEarned(stats.xpEarned);
      setReferralList(stats.referrals);
      setApplicationStatus(stats.applicationStatus);

      const pct = Math.min(stats.totalReferrals / AFFILIATE_THRESHOLD, 1);
      Animated.timing(progressAnim, {
        toValue: pct,
        duration: 800,
        useNativeDriver: false,
      }).start();
    } catch (e) {
      console.error('[Referrals] Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  }, [progressAnim]);

  useFocusEffect(useCallback(() => {
    loadStats();
  }, [loadStats]));

  useEffect(() => {
    if (showPrompt === 'true') {
      console.log('[Referrals] showPrompt param detected, opening enter-code modal');
      setEnterModalVisible(true);
    }
  }, [showPrompt]);

  const handleSubmitReferralCode = async () => {
    const trimmed = referralInput.trim().toUpperCase();
    if (!trimmed) return;
    console.log('[Referrals] Submitting referral code:', trimmed);
    setSubmitting(true);
    try {
      const result = await applyReferralCode(trimmed);
      if (!result.success) {
        if (result.error === 'You have already used a referral code') {
          Alert.alert('Already Used', 'You have already entered a referral code.');
        } else if (result.error === 'Invalid referral code' || (result.error ?? '').includes('Invalid')) {
          Alert.alert('Invalid Code', 'That referral code was not found. Please check and try again.');
        } else if (result.error === "You can't use your own referral code") {
          Alert.alert('Invalid Code', 'You cannot use your own referral code.');
        } else {
          Alert.alert('Error', 'Could not apply the referral code. Please try again.');
        }
        return;
      }
      console.log('[Referrals] Referral code applied successfully');
      setEnterModalVisible(false);
      setReferralInput('');
      Alert.alert('Success! 🎉', 'Referral code applied. You both earned 1,000 XP!');
      loadStats();
    } catch (e) {
      console.error('[Referrals] Unexpected error submitting code:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!code) return;
    console.log('[Referrals] Copy code pressed:', code);
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!code) return;
    console.log('[Referrals] Share button pressed, code:', code);
    try {
      await Share.share({
        message: `I've been tracking my macros with Macro Goal. Join with my code ${code} and we both earn 1,000 XP 💪\n\nDownload the app: https://apps.apple.com/us/app/macro-goal/id6755788871`,
      });
      console.log('[Referrals] Share sheet opened successfully');
    } catch (e) {
      console.warn('[Referrals] Share failed:', e);
    }
  };

  const handleApplyAffiliate = () => {
    console.log('[Referrals] Apply for Affiliate Program pressed');
    router.push('/affiliate-apply');
  };

  const bg = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const remaining = Math.max(AFFILIATE_THRESHOLD - totalReferrals, 0);
  const showAffiliateQualified = totalReferrals >= AFFILIATE_THRESHOLD && applicationStatus === 'none';
  const showProgress = tier === 'user' && applicationStatus === 'none' && !showAffiliateQualified;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="people" size={22} color={TEAL} />
            <Text style={[styles.cardTitle, { color: textColor }]}>
              Invite Friends & Earn XP
            </Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: mutedColor }]}>
            Share your code — you both earn 1,000 XP instantly
          </Text>

          {code ? (
            <>
              <Text style={[styles.codeLabel, { color: mutedColor }]}>Your code:</Text>
              <View style={[styles.codeBox, { backgroundColor: isDark ? '#1A1C2E' : '#F0F2F7', borderColor: cardBorder }]}>
                <Text style={[styles.codeText, { color: TEAL }]}>{code}</Text>
                <TouchableOpacity onPress={handleCopy} style={styles.copyButton}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? TEAL : mutedColor} />
                  <Text style={[styles.copyLabel, { color: copied ? TEAL : mutedColor }]}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={[styles.codeLabel, { color: mutedColor }]}>Generating your code...</Text>
          )}

          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: TEAL }]}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            <Text style={styles.shareButtonText}>Share with Friends</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={[styles.statsRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: textColor }]}>{totalReferrals}</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Friends</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Invited</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: cardBorder }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: textColor }]}>{premiumConverts}</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Premium</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Converts</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: cardBorder }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: TEAL }]}>{xpEarned.toLocaleString()}</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>XP</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Earned</Text>
          </View>
        </View>

        {/* Progress to Affiliate */}
        {showProgress && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Progress to Affiliate Program</Text>
            <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2E3050' : '#E5E7EB' }]}>
              <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: TEAL }]} />
            </View>
            <View style={styles.progressLabelRow}>
              <Text style={[styles.progressCount, { color: textColor }]}>
                {totalReferrals}
                {' / '}
                {AFFILIATE_THRESHOLD}
                {' referrals'}
              </Text>
              <Text style={[styles.progressMuted, { color: mutedColor }]}>
                {remaining > 0 ? `${remaining} more to unlock` : 'Unlocked!'}
              </Text>
            </View>
          </View>
        )}

        {/* Affiliate Qualified Banner */}
        {showAffiliateQualified && (
          <View style={[styles.card, styles.affiliateBanner, { backgroundColor: cardBg, borderColor: GOLD }]}>
            <Text style={[styles.affiliateTitle, { color: textColor }]}>
              {'🌟 You Qualify!'}
            </Text>
            <Text style={[styles.affiliateBody, { color: mutedColor }]}>
              {'You\'ve referred 20+ friends. Apply for our Affiliate Program and earn real rewards.'}
            </Text>
            <TouchableOpacity
              style={[styles.affiliateButton, { backgroundColor: GOLD }]}
              onPress={handleApplyAffiliate}
              activeOpacity={0.85}
            >
              <Text style={styles.affiliateButtonText}>Apply for Affiliate Program</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Application Status */}
        {applicationStatus !== 'none' && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {applicationStatus === 'pending' && (
              <View style={styles.statusRow}>
                <Text style={styles.statusIcon}>{'⏳'}</Text>
                <View style={styles.statusTextBlock}>
                  <Text style={[styles.statusTitle, { color: textColor }]}>Application Under Review</Text>
                  <Text style={[styles.statusBody, { color: mutedColor }]}>
                    We'll get back to you within 2-3 business days.
                  </Text>
                </View>
              </View>
            )}
            {applicationStatus === 'approved' && (
              <View style={styles.statusRow}>
                <Text style={styles.statusIcon}>{'✅'}</Text>
                <View style={styles.statusTextBlock}>
                  <Text style={[styles.statusTitle, { color: TEAL }]}>You're an Affiliate!</Text>
                  <Text style={[styles.statusBody, { color: mutedColor }]}>
                    Check your email for next steps.
                  </Text>
                </View>
              </View>
            )}
            {applicationStatus === 'rejected' && (
              <View style={styles.statusRow}>
                <Text style={styles.statusIcon}>{'📋'}</Text>
                <View style={styles.statusTextBlock}>
                  <Text style={[styles.statusTitle, { color: textColor }]}>Application Reviewed</Text>
                  <Text style={[styles.statusBody, { color: mutedColor }]}>
                    We reviewed your application and will reach out if a spot opens up.
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* How It Works */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="trophy-outline" size={20} color={GOLD} />
            <Text style={[styles.cardTitle, { color: textColor }]}>How It Works</Text>
          </View>
          {[
            'Share your code with friends',
            'Your friend downloads Macro Goal',
            'They enter your code during signup',
            'You both earn 1,000 XP instantly 🎉',
          ].map((step, i) => (
            <View key={i} style={styles.howItWorksRow}>
              <View style={[styles.stepBadge, { backgroundColor: TEAL + '22' }]}>
                <Text style={[styles.stepNumber, { color: TEAL }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: textColor }]}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Friends List */}
        {referralList.length > 0 && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="list-outline" size={20} color={mutedColor} />
              <Text style={[styles.cardTitle, { color: textColor }]}>
                {'Friends You\'ve Invited'}
              </Text>
              <View style={[styles.countBadge, { backgroundColor: TEAL + '22' }]}>
                <Text style={[styles.countBadgeText, { color: TEAL }]}>{referralList.length}</Text>
              </View>
            </View>
            {referralList.map((r, i) => (
              <View
                key={i}
                style={[styles.friendRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}
              >
                <View style={[styles.friendAvatar, { backgroundColor: TEAL + '22' }]}>
                  <Ionicons name="person-outline" size={16} color={TEAL} />
                </View>
                <View style={styles.friendInfo}>
                  <Text style={[styles.friendName, { color: textColor }]}>
                    {'@'}
                    {r.username}
                  </Text>
                  <Text style={[styles.friendDate, { color: mutedColor }]}>
                    {'joined '}
                    {relativeTime(r.joinedAt)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Enter Referral Code Modal */}
      <Modal
        visible={enterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEnterModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="gift-outline" size={24} color={TEAL} />
              <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.primaryText }]}>
                Enter a Referral Code
              </Text>
            </View>
            <Text style={[styles.modalSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Got a code from a friend? Enter it below and you both earn 1,000 XP!
            </Text>
            <TextInput
              style={[styles.codeInput, { backgroundColor: isDark ? '#1A1C2E' : '#F0F2F7', borderColor: isDark ? colors.cardBorderDark : colors.cardBorder, color: isDark ? colors.textDark : colors.primaryText }]}
              placeholder="e.g. ABC123"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              value={referralInput}
              onChangeText={setReferralInput}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}
                onPress={() => {
                  console.log('[Referrals] Enter-code modal dismissed');
                  setEnterModalVisible(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.modalCancelText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Skip
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: TEAL, opacity: submitting ? 0.7 : 1 }]}
                onPress={handleSubmitReferralCode}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.modalSubmitText}>Apply Code</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...typography.bodyBold,
    flex: 1,
  },
  cardSubtitle: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  codeLabel: {
    ...typography.small,
    marginBottom: spacing.xs,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  codeText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  copyLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statDivider: {
    width: 1,
    marginVertical: spacing.sm,
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
  },
  statLabel: {
    ...typography.small,
    lineHeight: 16,
  },
  sectionTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressCount: {
    ...typography.caption,
    fontWeight: '600',
  },
  progressMuted: {
    ...typography.small,
  },
  affiliateBanner: {
    borderWidth: 2,
  },
  affiliateTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  affiliateBody: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  affiliateButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  affiliateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  statusIcon: {
    fontSize: 24,
  },
  statusTextBlock: {
    flex: 1,
  },
  statusTitle: {
    ...typography.bodyBold,
    marginBottom: 2,
  },
  statusBody: {
    ...typography.caption,
  },
  howItWorksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepText: {
    ...typography.caption,
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  friendAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    ...typography.caption,
    fontWeight: '600',
  },
  friendDate: {
    ...typography.small,
  },
  bottomSpacer: { height: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 2,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
