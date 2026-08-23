import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  getAdminDashboard,
  adminApproveApplication,
  adminRejectApplication,
  adminCreateAppleCode,
  adminCreatePayout,
  adminMarkPayoutPaid,
} from '@/utils/affiliateApi';

const BLUE = '#3b82f6';
const GREEN = '#22c55e';
const RED = '#ef4444';
const GOLD = '#FFB547';

type TabKey = 'applications' | 'affiliates' | 'payouts' | 'transactions';

function formatMoney(amount: number | undefined | null): string {
  const n = Number(amount) || 0;
  return '$' + n.toFixed(2);
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
    case 'available': return GREEN;
    case 'payment_processing': return BLUE;
    case 'paid': return '#6b7280';
    case 'approved': return GREEN;
    case 'active': return GREEN;
    case 'activating': return BLUE;
    case 'failed': return RED;
    case 'rejected': return RED;
    case 'suspended': return RED;
    case 'processing': return BLUE;
    case 'refunded':
    case 'reversed': return RED;
    default: return '#6b7280';
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function AffiliateAdminScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activeTab, setActiveTab] = useState<TabKey>('applications');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Reject modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Mark paid modal
  const [markPaidModalVisible, setMarkPaidModalVisible] = useState(false);
  const [markPaidPayoutId, setMarkPaidPayoutId] = useState<string | null>(null);
  const [paypalTxnId, setPaypalTxnId] = useState('');
  const [paypalNote, setPaypalNote] = useState('');

  // Plan selection modal (for approve flow)
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly' | 'both'>('both');

  // Transaction filter
  const [txFilter, setTxFilter] = useState<string>('all');

  const loadDashboard = useCallback(async () => {
    console.log('[AffiliateAdmin] Loading admin dashboard');
    try {
      const data = await getAdminDashboard();
      setDashboard(data);
    } catch (e) {
      console.error('[AffiliateAdmin] Failed to load dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadDashboard();
  }, [loadDashboard]));

  const handleRefresh = () => {
    console.log('[AffiliateAdmin] Pull-to-refresh triggered');
    setRefreshing(true);
    loadDashboard();
  };

  const setLoaderFor = (id: string, val: boolean) => {
    setActionLoading(prev => ({ ...prev, [id]: val }));
  };

  const handleApprove = (applicationId: string) => {
    console.log('[AffiliateAdmin] Approve button pressed:', applicationId);
    setPendingApproveId(applicationId);
    setSelectedPlan('both');
    setPlanModalVisible(true);
  };

  const handleApproveConfirm = async () => {
    if (!pendingApproveId) return;
    const applicationId = pendingApproveId;
    const plan = selectedPlan;
    console.log('[AffiliateAdmin] Approve confirmed:', { applicationId, plan });
    setPlanModalVisible(false);
    setPendingApproveId(null);
    setLoaderFor(applicationId, true);
    try {
      const result = await adminApproveApplication(applicationId);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to approve application.');
        return;
      }
      console.log('[AffiliateAdmin] Application approved, triggering Apple code creation with plan:', plan);
      if (result.profile?.id) {
        const codeResult = await adminCreateAppleCode(result.profile.id, false, plan);
        console.log('[AffiliateAdmin] Apple code creation result:', codeResult);
        if (codeResult.status === 'partial_failed') {
          const annualOk = codeResult.annual?.success;
          const monthlyOk = codeResult.monthly?.success;
          const msg = !annualOk
            ? 'Monthly code created but annual failed.'
            : 'Annual code created but monthly failed.';
          const failedPlan: 'annual' | 'monthly' = !annualOk ? 'annual' : 'monthly';
          const profileId = result.profile.id;
          Alert.alert(
            'Partial Success',
            msg + ' You can retry the failed plan from the Affiliates tab.',
            [
              { text: 'OK' },
              {
                text: 'Retry Now',
                onPress: () => {
                  console.log('[AffiliateAdmin] Retry partial failure pressed, plan:', failedPlan);
                  handleRetryApple(profileId, failedPlan);
                },
              },
            ],
          );
          loadDashboard();
          return;
        }
      }
      Alert.alert('Approved!', 'Application approved and Apple code creation triggered.');
      loadDashboard();
    } catch (e) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoaderFor(applicationId, false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingId) return;
    console.log('[AffiliateAdmin] Reject application confirmed:', rejectingId, 'notes:', rejectNotes);
    setLoaderFor(rejectingId, true);
    setRejectModalVisible(false);
    try {
      const result = await adminRejectApplication(rejectingId, rejectNotes.trim() || undefined);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to reject application.');
        return;
      }
      Alert.alert('Rejected', 'Application has been rejected.');
      loadDashboard();
    } catch (e) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoaderFor(rejectingId, false);
      setRejectingId(null);
      setRejectNotes('');
    }
  };

  const handleRetryApple = async (profileId: string, plan: 'annual' | 'monthly' | 'both' = 'both') => {
    console.log('[AffiliateAdmin] Retry Apple code pressed for profile:', profileId, 'plan:', plan);
    setLoaderFor('apple_' + profileId, true);
    try {
      const result = await adminCreateAppleCode(profileId, true, plan);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to retry Apple code creation.');
        return;
      }
      Alert.alert('Retried', 'Apple code creation has been retried.');
      loadDashboard();
    } catch (e) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoaderFor('apple_' + profileId, false);
    }
  };

  const handleCreatePayout = async (profileId: string, commissionIds: string[]) => {
    console.log('[AffiliateAdmin] Create payout pressed for profile:', profileId, 'commissions:', commissionIds.length);
    setLoaderFor('payout_' + profileId, true);
    try {
      const result = await adminCreatePayout(profileId, commissionIds);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to create payout.');
        return;
      }
      Alert.alert('Payout Created', 'Payout has been created successfully.');
      loadDashboard();
    } catch (e) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoaderFor('payout_' + profileId, false);
    }
  };

  const handleMarkPaidConfirm = async () => {
    if (!markPaidPayoutId || !paypalTxnId.trim()) {
      Alert.alert('Required', 'Please enter the PayPal transaction ID.');
      return;
    }
    console.log('[AffiliateAdmin] Mark payout paid confirmed:', markPaidPayoutId, 'txn:', paypalTxnId);
    setMarkPaidModalVisible(false);
    setLoaderFor('markpaid_' + markPaidPayoutId, true);
    try {
      const result = await adminMarkPayoutPaid(markPaidPayoutId, paypalTxnId.trim(), paypalNote.trim() || undefined);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to mark payout as paid.');
        return;
      }
      Alert.alert('Marked Paid', 'Payout has been marked as paid.');
      loadDashboard();
    } catch (e) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoaderFor('markpaid_' + markPaidPayoutId, false);
      setMarkPaidPayoutId(null);
      setPaypalTxnId('');
      setPaypalNote('');
    }
  };

  const bg = isDark ? '#0d0d0d' : colors.primaryBackground;
  const cardBg = isDark ? '#1a1a1a' : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#111' : '#F0F2F7';

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'applications', label: 'Applications' },
    { key: 'affiliates', label: 'Affiliates' },
    { key: 'payouts', label: 'Payouts' },
    { key: 'transactions', label: 'Transactions' },
  ];

  const applications: any[] = dashboard?.applications ?? [];
  const affiliates: any[] = dashboard?.affiliates ?? [];
  const payouts: any[] = dashboard?.payouts ?? [];
  const allTransactions: any[] = dashboard?.transactions ?? [];

  const filteredTransactions = txFilter === 'all'
    ? allTransactions
    : allTransactions.filter((t: any) => t.status === txFilter);

  const affiliatesWithAvailableBalance = affiliates.filter((a: any) => (a.earnings_available ?? 0) > 0);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['bottom']}>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { backgroundColor: cardBg, borderBottomColor: cardBorder }]}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
              onPress={() => {
                console.log('[AffiliateAdmin] Tab pressed:', tab.key);
                setActiveTab(tab.key);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: isActive ? BLUE : mutedColor }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BLUE} />
        }
      >

        {/* ── Applications Tab ── */}
        {activeTab === 'applications' && (
          <>
            {applications.length === 0 ? (
              <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.emptyText, { color: mutedColor }]}>No applications yet</Text>
              </View>
            ) : (
              applications.map((app: any) => {
                const sc = statusColor(app.status);
                const sl = statusLabel(app.status);
                const isLoading = actionLoading[app.id];
                return (
                  <View key={app.id} style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={styles.appHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.appName, { color: textColor }]}>{app.full_name}</Text>
                        <Text style={[styles.appEmail, { color: mutedColor }]}>{app.email}</Text>
                        {app.instagram_handle ? (
                          <Text style={[styles.appSocial, { color: mutedColor }]}>{app.instagram_handle}</Text>
                        ) : null}
                        {app.desired_code ? (
                          <Text style={[styles.appCode, { color: BLUE }]}>
                            {'Code: '}
                            {app.desired_code}
                          </Text>
                        ) : null}
                        <Text style={[styles.appDate, { color: mutedColor }]}>{formatDate(app.created_at)}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                        <Text style={[styles.statusBadgeText, { color: sc }]}>{sl}</Text>
                      </View>
                    </View>

                    {app.status === 'pending' && (
                      <View style={styles.appActions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: GREEN, opacity: isLoading ? 0.6 : 1 }]}
                          onPress={() => handleApprove(app.id)}
                          disabled={isLoading}
                          activeOpacity={0.85}
                        >
                          {isLoading ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <Text style={styles.actionBtnText}>Approve</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: RED, opacity: isLoading ? 0.6 : 1 }]}
                          onPress={() => {
                            console.log('[AffiliateAdmin] Reject button pressed for application:', app.id);
                            setRejectingId(app.id);
                            setRejectNotes('');
                            setRejectModalVisible(true);
                          }}
                          disabled={isLoading}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.actionBtnText}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── Affiliates Tab ── */}
        {activeTab === 'affiliates' && (
          <>
            {affiliates.length === 0 ? (
              <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.emptyText, { color: mutedColor }]}>No approved affiliates yet</Text>
              </View>
            ) : (
              affiliates.map((aff: any) => {
                const appleStatus = aff.apple_code_status ?? 'unknown';
                const asc = statusColor(appleStatus);
                const asl = statusLabel(appleStatus);
                const isRetrying = actionLoading['apple_' + aff.id];
                const planType: string = aff.plan_type ?? 'both';
                const planLabel = planType === 'annual' ? 'Annual' : planType === 'monthly' ? 'Monthly' : 'Both';
                const planColor = planType === 'annual' ? BLUE : planType === 'monthly' ? GREEN : GOLD;
                // Detect per-plan partial failures
                const annualFailed = aff.annual_code_status === 'failed';
                const monthlyFailed = aff.monthly_code_status === 'failed';
                return (
                  <View key={aff.id} style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <View style={styles.affHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.affCodeRow}>
                          <Text style={[styles.affCode, { color: BLUE }]}>{aff.affiliate_code}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: asc + '22' }]}>
                            <Text style={[styles.statusBadgeText, { color: asc }]}>{asl}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: planColor + '22' }]}>
                            <Text style={[styles.statusBadgeText, { color: planColor }]}>{planLabel}</Text>
                          </View>
                        </View>
                        <Text style={[styles.affEmail, { color: mutedColor }]}>{aff.email}</Text>
                        <Text style={[styles.affRate, { color: mutedColor }]}>
                          {'Commission: '}
                          {aff.commission_rate ?? 50}
                          {'%'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.affEarningsRow}>
                      <View style={styles.affEarningsCell}>
                        <Text style={[styles.affEarningsLabel, { color: mutedColor }]}>Pending</Text>
                        <Text style={[styles.affEarningsValue, { color: GOLD }]}>{formatMoney(aff.earnings_pending)}</Text>
                      </View>
                      <View style={styles.affEarningsCell}>
                        <Text style={[styles.affEarningsLabel, { color: mutedColor }]}>Available</Text>
                        <Text style={[styles.affEarningsValue, { color: GREEN }]}>{formatMoney(aff.earnings_available)}</Text>
                      </View>
                      <View style={styles.affEarningsCell}>
                        <Text style={[styles.affEarningsLabel, { color: mutedColor }]}>Paid</Text>
                        <Text style={[styles.affEarningsValue, { color: BLUE }]}>{formatMoney(aff.earnings_paid)}</Text>
                      </View>
                    </View>

                    {appleStatus === 'failed' && !annualFailed && !monthlyFailed && (
                      <TouchableOpacity
                        style={[styles.retryBtn, { backgroundColor: GOLD + '22', borderColor: GOLD, opacity: isRetrying ? 0.6 : 1 }]}
                        onPress={() => handleRetryApple(aff.id)}
                        disabled={isRetrying}
                        activeOpacity={0.85}
                      >
                        {isRetrying ? (
                          <ActivityIndicator size="small" color={GOLD} />
                        ) : (
                          <Text style={[styles.retryBtnText, { color: GOLD }]}>Retry Apple Code</Text>
                        )}
                      </TouchableOpacity>
                    )}
                    {annualFailed && (
                      <TouchableOpacity
                        style={[styles.retryBtn, { backgroundColor: RED + '22', borderColor: RED, opacity: isRetrying ? 0.6 : 1, marginBottom: 6 }]}
                        onPress={() => {
                          console.log('[AffiliateAdmin] Retry annual code pressed for profile:', aff.id);
                          handleRetryApple(aff.id, 'annual');
                        }}
                        disabled={isRetrying}
                        activeOpacity={0.85}
                      >
                        {isRetrying ? (
                          <ActivityIndicator size="small" color={RED} />
                        ) : (
                          <Text style={[styles.retryBtnText, { color: RED }]}>Retry Annual Code</Text>
                        )}
                      </TouchableOpacity>
                    )}
                    {monthlyFailed && (
                      <TouchableOpacity
                        style={[styles.retryBtn, { backgroundColor: RED + '22', borderColor: RED, opacity: isRetrying ? 0.6 : 1 }]}
                        onPress={() => {
                          console.log('[AffiliateAdmin] Retry monthly code pressed for profile:', aff.id);
                          handleRetryApple(aff.id, 'monthly');
                        }}
                        disabled={isRetrying}
                        activeOpacity={0.85}
                      >
                        {isRetrying ? (
                          <ActivityIndicator size="small" color={RED} />
                        ) : (
                          <Text style={[styles.retryBtnText, { color: RED }]}>Retry Monthly Code</Text>
                        )}
                      </TouchableOpacity>
                    )}
                    {appleStatus === 'activating' && (
                      <View style={styles.activatingRow}>
                        <ActivityIndicator size="small" color={BLUE} />
                        <Text style={[styles.activatingText, { color: BLUE }]}>Activating with Apple...</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── Payouts Tab ── */}
        {activeTab === 'payouts' && (
          <>
            {/* Affiliates with available balance */}
            {affiliatesWithAvailableBalance.length > 0 && (
              <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="cash-outline" size={18} color={GREEN} />
                  <Text style={[styles.cardTitle, { color: textColor }]}>Ready to Pay Out</Text>
                </View>
                {affiliatesWithAvailableBalance.map((aff: any) => {
                  const availableCommissions = (aff.commissions ?? []).filter((c: any) => c.status === 'available');
                  const commissionIds = availableCommissions.map((c: any) => c.id);
                  const isCreating = actionLoading['payout_' + aff.id];
                  return (
                    <View key={aff.id} style={[styles.payoutAffRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.payoutAffCode, { color: BLUE }]}>{aff.affiliate_code}</Text>
                        <Text style={[styles.payoutAffPaypal, { color: mutedColor }]}>{aff.paypal_email || 'No PayPal email'}</Text>
                        <Text style={[styles.payoutAffAmount, { color: GREEN }]}>{formatMoney(aff.earnings_available)}</Text>
                        <Text style={[styles.payoutAffCommCount, { color: mutedColor }]}>
                          {commissionIds.length}
                          {' available commissions'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.createPayoutBtn, { backgroundColor: GREEN, opacity: isCreating ? 0.6 : 1 }]}
                        onPress={() => handleCreatePayout(aff.id, commissionIds)}
                        disabled={isCreating || commissionIds.length === 0}
                        activeOpacity={0.85}
                      >
                        {isCreating ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <Text style={styles.createPayoutBtnText}>Create Payout</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Existing payouts */}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="list-outline" size={18} color={mutedColor} />
                <Text style={[styles.cardTitle, { color: textColor }]}>All Payouts</Text>
              </View>
              {payouts.length === 0 ? (
                <Text style={[styles.emptyText, { color: mutedColor }]}>No payouts yet</Text>
              ) : (
                payouts.map((payout: any) => {
                  const sc = statusColor(payout.status);
                  const sl = statusLabel(payout.status);
                  const isMarkingPaid = actionLoading['markpaid_' + payout.id];
                  return (
                    <View key={payout.id} style={[styles.payoutRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.payoutCode, { color: BLUE }]}>{payout.affiliate_code}</Text>
                        <Text style={[styles.payoutDate, { color: mutedColor }]}>{formatDate(payout.created_at)}</Text>
                        <Text style={[styles.payoutAmount, { color: textColor }]}>{formatMoney(payout.amount)}</Text>
                        {payout.paypal_transaction_id ? (
                          <Text style={[styles.payoutTxn, { color: mutedColor }]}>
                            {'Txn: '}
                            {payout.paypal_transaction_id}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.payoutRight}>
                        <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                          <Text style={[styles.statusBadgeText, { color: sc }]}>{sl}</Text>
                        </View>
                        {payout.status === 'processing' && (
                          <TouchableOpacity
                            style={[styles.markPaidBtn, { backgroundColor: BLUE, opacity: isMarkingPaid ? 0.6 : 1 }]}
                            onPress={() => {
                              console.log('[AffiliateAdmin] Mark Paid pressed for payout:', payout.id);
                              setMarkPaidPayoutId(payout.id);
                              setPaypalTxnId('');
                              setPaypalNote('');
                              setMarkPaidModalVisible(true);
                            }}
                            disabled={isMarkingPaid}
                            activeOpacity={0.85}
                          >
                            {isMarkingPaid ? (
                              <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                              <Text style={styles.markPaidBtnText}>Mark Paid</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}

        {/* ── Transactions Tab ── */}
        {activeTab === 'transactions' && (
          <>
            {/* Filter row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterRow}
              contentContainerStyle={styles.filterRowContent}
            >
              {['all', 'needs_review', 'pending', 'available', 'paid'].map(f => {
                const isActive = txFilter === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterChip, isActive && { backgroundColor: BLUE }]}
                    onPress={() => {
                      console.log('[AffiliateAdmin] Transaction filter changed:', f);
                      setTxFilter(f);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterChipText, { color: isActive ? '#FFF' : mutedColor }]}>
                      {f === 'all' ? 'All' : statusLabel(f)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {filteredTransactions.length === 0 ? (
                <Text style={[styles.emptyText, { color: mutedColor }]}>No transactions</Text>
              ) : (
                filteredTransactions.map((tx: any, i: number) => {
                  const sc = statusColor(tx.status);
                  const sl = statusLabel(tx.status);
                  return (
                    <View key={tx.id || i} style={[styles.txRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txCode, { color: BLUE }]}>{tx.affiliate_code}</Text>
                        <Text style={[styles.txDate, { color: mutedColor }]}>{formatDate(tx.created_at)}</Text>
                        <Text style={[styles.txAmount, { color: textColor }]}>
                          {formatMoney(tx.purchase_amount)}
                          {' → '}
                          {formatMoney(tx.commission_amount)}
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
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Reject Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Reject Application</Text>
            <Text style={[styles.modalSubtitle, { color: mutedColor }]}>
              Optionally add notes for the applicant.
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textColor }]}
              placeholder="Admin notes (optional)"
              placeholderTextColor={mutedColor}
              value={rejectNotes}
              onChangeText={setRejectNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: cardBorder, borderWidth: 1 }]}
                onPress={() => {
                  console.log('[AffiliateAdmin] Reject modal cancelled');
                  setRejectModalVisible(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.modalBtnText, { color: mutedColor }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: RED }]}
                onPress={handleRejectConfirm}
                activeOpacity={0.85}
              >
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Plan Selection Modal */}
      <Modal
        visible={planModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPlanModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Select Plan</Text>
            <Text style={[styles.modalSubtitle, { color: mutedColor }]}>
              Which plan should this affiliate's code apply to?
            </Text>
            {(['both', 'annual', 'monthly'] as const).map(plan => {
              const labels: Record<string, string> = {
                both: 'Both (Annual + Monthly)',
                annual: 'Annual only',
                monthly: 'Monthly only',
              };
              const isSelected = selectedPlan === plan;
              return (
                <TouchableOpacity
                  key={plan}
                  style={[
                    styles.planOption,
                    {
                      borderColor: isSelected ? BLUE : cardBorder,
                      backgroundColor: isSelected ? BLUE + '18' : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    console.log('[AffiliateAdmin] Plan option selected:', plan);
                    setSelectedPlan(plan);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.planRadio, { borderColor: isSelected ? BLUE : mutedColor }]}>
                    {isSelected && <View style={[styles.planRadioInner, { backgroundColor: BLUE }]} />}
                  </View>
                  <Text style={[styles.planOptionText, { color: isSelected ? BLUE : textColor }]}>
                    {labels[plan]}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: cardBorder, borderWidth: 1 }]}
                onPress={() => {
                  console.log('[AffiliateAdmin] Plan modal cancelled');
                  setPlanModalVisible(false);
                  setPendingApproveId(null);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.modalBtnText, { color: mutedColor }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: GREEN }]}
                onPress={handleApproveConfirm}
                activeOpacity={0.85}
              >
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mark Paid Modal */}
      <Modal
        visible={markPaidModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMarkPaidModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Mark Payout as Paid</Text>
            <Text style={[styles.modalSubtitle, { color: mutedColor }]}>
              Enter the PayPal transaction ID to confirm payment.
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textColor }]}
              placeholder="PayPal Transaction ID *"
              placeholderTextColor={mutedColor}
              value={paypalTxnId}
              onChangeText={setPaypalTxnId}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textColor, marginTop: spacing.sm }]}
              placeholder="Note (optional)"
              placeholderTextColor={mutedColor}
              value={paypalNote}
              onChangeText={setPaypalNote}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: cardBorder, borderWidth: 1 }]}
                onPress={() => {
                  console.log('[AffiliateAdmin] Mark paid modal cancelled');
                  setMarkPaidModalVisible(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.modalBtnText, { color: mutedColor }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: BLUE }]}
                onPress={handleMarkPaidConfirm}
                activeOpacity={0.85}
              >
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    borderBottomWidth: 1,
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: spacing.md,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginRight: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
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
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  // Applications
  appHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  appName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  appEmail: {
    fontSize: 13,
    marginBottom: 2,
  },
  appSocial: {
    fontSize: 13,
    marginBottom: 2,
  },
  appCode: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  appDate: {
    fontSize: 12,
  },
  appActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Affiliates
  affHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  affCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  affCode: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  affEmail: {
    fontSize: 13,
    marginBottom: 2,
  },
  affRate: {
    fontSize: 13,
  },
  affEarningsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  affEarningsCell: {
    flex: 1,
    alignItems: 'center',
  },
  affEarningsLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  affEarningsValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  activatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  activatingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Payouts
  payoutAffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  payoutAffCode: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  payoutAffPaypal: {
    fontSize: 12,
    marginBottom: 2,
  },
  payoutAffAmount: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  payoutAffCommCount: {
    fontSize: 12,
  },
  createPayoutBtn: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  createPayoutBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  payoutCode: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  payoutDate: {
    fontSize: 12,
    marginBottom: 2,
  },
  payoutAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  payoutTxn: {
    fontSize: 11,
  },
  payoutRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  markPaidBtn: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markPaidBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // Transactions
  filterRow: {
    flexGrow: 0,
    marginBottom: spacing.sm,
  },
  filterRowContent: {
    gap: spacing.xs,
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  txCode: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  txDate: {
    fontSize: 11,
    marginBottom: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: spacing.md,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    minHeight: 44,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  bottomSpacer: { height: 20 },
  // Plan selection
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  planRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  planOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
