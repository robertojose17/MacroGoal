
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { TouchableOpacity } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [deleting, setDeleting] = useState(false);

  console.log('[DeleteAccount] Screen loaded');

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you absolutely sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              console.log('[DeleteAccount] User confirmed account deletion');

              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert('Error', 'No user found');
                return;
              }

              console.log('[DeleteAccount] Deleting user data for:', user.id);

              // Delete user data from all tables
              // Note: This assumes RLS policies allow users to delete their own data
              await supabase.from('meal_items').delete().eq('user_id', user.id);
              await supabase.from('meals').delete().eq('user_id', user.id);
              await supabase.from('daily_summaries').delete().eq('user_id', user.id);
              await supabase.from('check_ins').delete().eq('user_id', user.id);
              await supabase.from('goals').delete().eq('user_id', user.id);
              await supabase.from('subscriptions').delete().eq('user_id', user.id);
              await supabase.from('users').delete().eq('id', user.id);

              console.log('[DeleteAccount] User data deleted, signing out');

              // Sign out the user
              await supabase.auth.signOut();

              Alert.alert(
                'Account Deleted',
                'Your account and all associated data have been permanently deleted.',
                [
                  {
                    text: 'OK',
                    onPress: () => router.replace('/auth/welcome'),
                  },
                ]
              );
            } catch (error: any) {
              console.error('[DeleteAccount] Error deleting account:', error);
              Alert.alert('Error', error.message || 'Failed to delete account. Please try again or contact support.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
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
          Delete Account
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.warningCard, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: colors.error }]}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={48}
            color={colors.error}
          />
          <Text style={[styles.warningTitle, { color: colors.error }]}>
            Warning: This Action is Permanent
          </Text>
          <Text style={[styles.warningText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Deleting your account will permanently remove all of your data, including:
          </Text>
          <View style={styles.listContainer}>
            <Text style={[styles.listItem, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              • Your profile and account information
            </Text>
            <Text style={[styles.listItem, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              • All food logs and nutrition data
            </Text>
            <Text style={[styles.listItem, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              • Weight tracking and progress photos
            </Text>
            <Text style={[styles.listItem, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              • Goals and daily targets
            </Text>
            <Text style={[styles.listItem, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              • Subscription information
            </Text>
          </View>
          <Text style={[styles.warningText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            This action cannot be undone. If you have an active subscription, please cancel it before deleting your account.
          </Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.infoTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Need Help?
          </Text>
          <Text style={[styles.infoText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            If you&apos;re experiencing issues with the app or have concerns about your data, please contact our support team before deleting your account. We&apos;re here to help!
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: colors.error }]}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <React.Fragment>
              <IconSymbol
                ios_icon_name="trash.fill"
                android_material_icon_name="delete"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.deleteButtonText}>Delete My Account</Text>
            </React.Fragment>
          )}
        </TouchableOpacity>
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
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  warningCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 2,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  warningTitle: {
    ...typography.h3,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  warningText: {
    ...typography.body,
    lineHeight: 22,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  listContainer: {
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  listItem: {
    ...typography.body,
    lineHeight: 24,
    marginBottom: spacing.xs,
  },
  infoCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  infoTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  infoText: {
    ...typography.body,
    lineHeight: 22,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
