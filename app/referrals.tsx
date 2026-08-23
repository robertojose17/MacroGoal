import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
  Clipboard,
  TextInput,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getAffiliateStats, updatePaypalEmail } from '@/utils/affiliateApi';

const BLUE = '#3b82f6';
const GOLD = '#FFB547';

function formatMoney(amount: number | undefined | null): string {
  const n = Number(amount) || 0;
  return '$' + n.toFixed(2);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'needs_review': return '#f97316';
    case 'pending': return GOLD;
    case 'available': return '#22c55e';
    case 'payment_processing': return BLUE;
    case 'paid': return '#6b7280';
    case 'refunded':
    case 'reversed':
    case 'rejected': return '#ef4444';
    default: return '#6b7280';
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ReferralsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const [copied, setCopied] = useState(false);

  // PayPal edit state
  const [editingPaypal, setEditingPaypal] = useState(false);
  const [paypalInput, setPaypalInput] = useState('');
  const [savingPaypal, setSavingPaypal] = useState(false);

  const loadData = useCallback(async () => {
    console.log('[Referrals] Loading affiliate stats');
    try {
      const data = await getAffiliateStats();
      setStats(data);
      if (data?.paypal_email) setPaypalInput(data.paypal_email);
    } catch (e) {
      console.error('[Referrals] Failed to load stats:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const handleRefresh = () => {
    console.log('[Referrals] Pull-to-refresh triggered');
    setRefreshing(true);
    loadData();
  };

  const handleCopy = () => {
    const code = stats?.affiliate_code;
    if (!code) return;
    console.log('[Referrals] Copy code pressed:', code);
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const code = stats?.affiliate_code;
    const redemptionUrl = stats?.redemption_url;
    if (!code) return;
    console.log('[Referrals] Share Link pressed, code:', code);
    try {
      const message = redemptionUrl
        ? `Use my affiliate code ${code} to get a discount on Macro Goal Premium! ${redemptionUrl}`
        : `Use my affiliate code ${code} on Macro Goal! Download: https://apps.apple.com/us/app/macro-goal/id6755788871`;
      await Share.share({ message });
      console.log('[Referrals] Share sheet opened');
    } catch (e) {
      console.warn('[Referrals] Share failed:', e);
    }
  };

  const handleSavePaypal = async () => {
    const email = paypalInput.trim();
    if (!isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid PayPal email address.');
      return;
    }
    console.log('[Referrals] Save PayPal email pressed:', email);
    setSavingPaypal(true);
    try {
      const result = await updatePaypalEmail(email);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to save PayPal email.');
        return;
      }
      console.log('[Referrals] PayPal email saved successfully');
      setStats((prev: any) => prev ? { ...prev, paypal_email: email } : prev);
      setEditingPaypal(false);
      Alert.alert('Saved!', 'Your PayPal email has been updated.');
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSavingPaypal(false);
    }
  };

  const bg = isDark ? '#0d0d0d' : colors.primaryBackground;
  const cardBg = isDark ? '#1a1a1a' : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#111' : '#F0F2F7';

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  const affiliateCode = stats?.affiliate_code ?? '';
  const appleStatus = stats?.apple_code_status ?? 'unknown';
  const commissionRate = stats?.commission_rate ?? 50;
  const commissionRateChangeDate = stats?.commission_rate_change_date ?? null;
  const redemptionUrl = stats?.redemption_url ?? null;
  const paypalEmail = stats?.paypal_email ?? null;
  const showPaypalInput = !paypalEmail || editingPaypal;

  const earningsPending = stats?.earnings_pending ?? 0;
  const earningsAvailable = stats?.earnings_available ?? 0;
  const earningsPaid = stats?.earnings_paid ?? 0;
  const earningsReversed = stats?.earnings_reversed ?? 0;

  const commissions: any[] = stats?.commissions ?? [];
  const payouts: any[] = stats?.payouts ?? [];

  const appleStatusColor =
    appleStatus === 'active' ? '#22c55e' :
    appleStatus === 'failed' ? '#ef4444' :
    GOLD;
  const appleStatusLabel =
    appleStatus === 'active' ? 'Active' :
    appleStatus === 'failed' ? 'Failed' :
    'Activating';

  const commissionRateChangeDateFormatted = commissionRateChangeDate ? formatDate(commissionRateChangeDate) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BLUE} />
        }
      >

        {/* ── Header ── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.dashboardTitle, { color: textColor }]}>Affiliate Dashboard</Text>

          {/* Code badge */}
          <View style={styles.codeBadgeRow}>
            <View style={[styles.codeBadge, { backgroundColor: BLUE + '22', borderColor: BLUE + '44' }]}>
              <Text style={[styles.codeBadgeText, { color: BLUE }]}>{affiliateCode}</Text>
            </View>
            <View style={[styles.appleStatusBadge, { backgroundColor: appleStatusColor + '22' }]}>
              <View style={[styles.appleStatusDot, { backgroundColor: appleStatusColor }]} />
              <Text style={[styles.appleStatusText, { color: appleStatusColor }]}>{appleStatusLabel}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
              onPress={handleCopy}
              activeOpacity={0.8}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? '#22c55e' : mutedColor} />
              <Text style={[styles.actionBtnText, { color: copied ? '#22c55e' : textColor }]}>
                {copied ? 'Copied!' : 'Copy Code'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: BLUE, borderColor: BLUE }]}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={16} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Share Link</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Commission Rate ── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="trending-up-outline" size={18} color={BLUE} />
            <Text style={[styles.cardTitle, { color: textColor }]}>Commission Rate</Text>
          </View>
          <Text style={[styles.commissionRateValue, { color: BLUE }]}>
            {commissionRate}
            {'% commission'}
          </Text>
          {commissionRateChangeDateFormatted ? (
            <Text style={[styles.commissionRateNote, { color: mutedColor }]}>
              {'Changes to 20% on '}
              {commissionRateChangeDateFormatted}
            </Text>
          ) : null}
          <Text style={[styles.commissionRateNote, { color: mutedColor }]}>35-day pending period</Text>
        </View>

        {/* ── Earnings Grid ── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="wallet-outline" size={18} color={BLUE} />
            <Text style={[styles.cardTitle, { color: textColor }]}>Earnings</Text>
          </View>
          <View style={styles.earningsGrid}>
            <View style={[styles.earningsCell, { backgroundColor: GOLD + '18', borderColor: GOLD + '44' }]}>
              <Text style={[styles.earningsCellLabel, { color: GOLD }]}>Pending</Text>
              <Text style={[styles.earningsCellValue, { color: GOLD }]}>{formatMoney(earningsPending)}</Text>
            </View>
            <View style={[styles.earningsCell, { backgroundColor: '#22c55e18', borderColor: '#22c55e44' }]}>
              <Text style={[styles.earningsCellLabel, { color: '#22c55e' }]}>Available</Text>
              <Text style={[styles.earningsCellValue, { color: '#22c55e' }]}>{formatMoney(earningsAvailable)}</Text>
            </View>
            <View style={[styles.earningsCell, { backgroundColor: BLUE + '18', borderColor: BLUE + '44' }]}>
              <Text style={[styles.earningsCellLabel, { color: BLUE }]}>Paid</Text>
              <Text style={[styles.earningsCellValue, { color: BLUE }]}>{formatMoney(earningsPaid)}</Text>
            </View>
            <View style={[styles.earningsCell, { backgroundColor: '#ef444418', borderColor: '#ef444444' }]}>
              <Text style={[styles.earningsCellLabel, { color: '#ef4444' }]}>Reversed</Text>
              <Text style={[styles.earningsCellValue, { color: '#ef4444' }]}>{formatMoney(earningsReversed)}</Text>
            </View>
          </View>
        </View>

        {/* ── PayPal ── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={{ fontSize: 18 }}>{'💳'}</Text>
            <Text style={[styles.cardTitle, { color: textColor }]}>PayPal Payout Account</Text>
          </View>
          {showPaypalInput ? (
            <>
              <TextInput
                style={[styles.paypalInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textColor }]}
                placeholder="your@paypal.com"
                placeholderTextColor={mutedColor}
                value={paypalInput}
                onChangeText={setPaypalInput}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.paypalButtonRow}>
                {editingPaypal && (
                  <TouchableOpacity
                    style={[styles.paypalCancelBtn, { borderColor: cardBorder }]}
                    onPress={() => {
                      console.log('[Referrals] PayPal edit cancelled');
                      setEditingPaypal(false);
                      setPaypalInput(paypalEmail || '');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.paypalCancelText, { color: mutedColor }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.paypalSaveBtn, { backgroundColor: BLUE, opacity: savingPaypal ? 0.7 : 1 }]}
                  onPress={handleSavePaypal}
                  disabled={savingPaypal}
                  activeOpacity={0.85}
                >
                  {savingPaypal
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={styles.paypalSaveText}>Save PayPal Email</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.paypalSavedRow}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={[styles.paypalSavedEmail, { color: textColor }]}>{paypalEmail}</Text>
              <TouchableOpacity
                onPress={() => {
                  console.log('[Referrals] Edit PayPal email pressed');
                  setEditingPaypal(true);
                  setPaypalInput(paypalEmail || '');
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.paypalEditLink, { color: BLUE }]}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={[styles.paypalNote, { color: mutedColor }]}>Required to receive payouts</Text>
        </View>

        {/* ── Transaction History ── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="receipt-outline" size={18} color={mutedColor} />
            <Text style={[styles.cardTitle, { color: textColor }]}>Transaction History</Text>
          </View>
          {commissions.length === 0 ? (
            <Text style={[styles.emptyText, { color: mutedColor }]}>No transactions yet</Text>
          ) : (
            commissions.map((item: any, i: number) => {
              const sc = statusColor(item.status);
              const sl = statusLabel(item.status);
              const purchaseAmt = formatMoney(item.purchase_amount);
              const commAmt = formatMoney(item.commission_amount);
              const commPct = item.commission_rate ? `${item.commission_rate}%` : '—';
              const dateStr = formatDate(item.created_at);
              return (
                <View
                  key={item.id || i}
                  style={[styles.txRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}
                >
                  <View style={styles.txLeft}>
                    <Text style={[styles.txDate, { color: mutedColor }]}>{dateStr}</Text>
                    <Text style={[styles.txAmount, { color: textColor }]}>{purchaseAmt}</Text>
                    <Text style={[styles.txCommission, { color: mutedColor }]}>
                      {commPct}
                      {' → '}
                      {commAmt}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                    <Text style={[styles.statusBadgeText, { color: sc }]}>{sl}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Payout History ── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="cash-outline" size={18} color={BLUE} />
            <Text style={[styles.cardTitle, { color: textColor }]}>Payout History</Text>
          </View>
          {payouts.length === 0 ? (
            <Text style={[styles.emptyText, { color: mutedColor }]}>No payouts yet</Text>
          ) : (
            payouts.map((payout: any, i: number) => {
              const sc = statusColor(payout.status);
              const sl = statusLabel(payout.status);
              const amt = formatMoney(payout.amount);
              const dateStr = formatDate(payout.created_at);
              return (
                <View
                  key={payout.id || i}
                  style={[styles.txRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}
                >
                  <View style={styles.txLeft}>
                    <Text style={[styles.txDate, { color: mutedColor }]}>{dateStr}</Text>
                    <Text style={[styles.txAmount, { color: textColor }]}>{amt}</Text>
                    {payout.paypal_transaction_id ? (
                      <Text style={[styles.txCommission, { color: mutedColor }]}>
                        {'Txn: '}
                        {payout.paypal_transaction_id}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                    <Text style={[styles.statusBadgeText, { color: sc }]}>{sl}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  dashboardTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  codeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  codeBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  codeBadgeText: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 3,
  },
  appleStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  appleStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  appleStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  commissionRateValue: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  commissionRateNote: {
    fontSize: 13,
    marginTop: 2,
  },
  earningsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  earningsCell: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  earningsCellLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  earningsCellValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  paypalInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  paypalButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  paypalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  paypalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  paypalSaveBtn: {
    flex: 2,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paypalSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  paypalSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  paypalSavedEmail: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  paypalEditLink: {
    fontSize: 14,
    fontWeight: '700',
  },
  paypalNote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  txLeft: {
    flex: 1,
    gap: 2,
  },
  txDate: {
    fontSize: 11,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  txCommission: {
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  bottomSpacer: { height: 20 },
});
