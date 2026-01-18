
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { supabase } from '@/app/integrations/supabase/client';

type CheckInType = 'weight' | 'steps' | 'gym';

interface CheckIn {
  id: string;
  date: string;
  weight: number | null;
  steps: number | null;
  steps_goal: number | null;
  went_to_gym: boolean;
  photo_url: string | null;
  notes: string | null;
}

export default function CheckInsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedType, setSelectedType] = useState<CheckInType>('weight');
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);

  const loadCheckIns = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[CheckIns] No user found');
        setLoading(false);
        return;
      }

      setUser(authUser);

      // Load user profile to get preferred units
      const { data: userData } = await supabase
        .from('users')
        .select('preferred_units')
        .eq('id', authUser.id)
        .maybeSingle();

      if (userData) {
        setUser({ ...authUser, ...userData });
      }

      console.log('[CheckIns] Loading check-ins for user:', authUser.id);

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .eq('user_id', authUser.id)
        .order('date', { ascending: false });

      if (error) {
        console.error('[CheckIns] Error loading check-ins:', error);
        Alert.alert('Error', 'Failed to load check-ins');
      } else {
        console.log('[CheckIns] Loaded', data?.length || 0, 'check-ins');
        setCheckIns(data || []);
      }
    } catch (error) {
      console.error('[CheckIns] Error in loadCheckIns:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[CheckIns] Screen focused, loading data');
      loadCheckIns();
    }, [loadCheckIns])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadCheckIns();
  };

  const handleNewCheckIn = () => {
    router.push({
      pathname: '/check-in-form',
      params: { type: selectedType },
    });
  };

  const handleViewCheckIn = (checkIn: CheckIn) => {
    // For all check-in types, navigate directly to the edit form
    // This provides a consistent tap-to-edit experience across Weight, Steps, and Gym
    router.push({
      pathname: '/check-in-form',
      params: { checkInId: checkIn.id, type: selectedType },
    });
  };

  const handleDeleteCheckIn = async (checkIn: CheckIn) => {
    try {
      console.log('[CheckIns] Deleting check-in:', checkIn.id);
      
      const { error } = await supabase
        .from('check_ins')
        .delete()
        .eq('id', checkIn.id);

      if (error) {
        console.error('[CheckIns] Error deleting check-in:', error);
        Alert.alert('Error', 'Failed to delete check-in');
      } else {
        console.log('[CheckIns] ✅ Check-in deleted successfully');
        // Reload the list
        loadCheckIns();
      }
    } catch (error) {
      console.error('[CheckIns] Error in handleDeleteCheckIn:', error);
      Alert.alert('Error', 'An error occurred while deleting');
    }
  };

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (checkDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined 
      });
    }
  };

  const formatWeight = (weight: number | null) => {
    if (!weight) return 'N/A';
    const units = user?.preferred_units || 'metric';
    console.log('[CheckIns] ⚖️ Formatting weight:', weight, 'kg, units:', units);
    
    if (units === 'imperial') {
      const lbs = Math.round(weight * 2.20462);
      console.log('[CheckIns] ⚖️ Converted to:', lbs, 'lbs');
      return `${lbs} lbs`;
    }
    return `${Math.round(weight)} kg`;
  };

  const getFilteredCheckIns = () => {
    return checkIns.filter(checkIn => {
      switch (selectedType) {
        case 'weight':
          return checkIn.weight !== null;
        case 'steps':
          return checkIn.steps !== null;
        case 'gym':
          return checkIn.went_to_gym !== null && checkIn.went_to_gym !== false;
        default:
          return false;
      }
    });
  };

  const filteredCheckIns = getFilteredCheckIns();

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading check-ins...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
          Check-Ins
        </Text>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmentedControlContainer}>
        <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <TouchableOpacity
            style={[
              styles.segment,
              selectedType === 'weight' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setSelectedType('weight')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: selectedType === 'weight' ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) },
              ]}
            >
              Weight
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segment,
              selectedType === 'steps' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setSelectedType('steps')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: selectedType === 'steps' ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) },
              ]}
            >
              Steps
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segment,
              selectedType === 'gym' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setSelectedType('gym')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: selectedType === 'gym' ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) },
              ]}
            >
              Gym
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* New Check-In Button */}
        <TouchableOpacity
          style={[styles.newButton, { backgroundColor: colors.primary }]}
          onPress={handleNewCheckIn}
          activeOpacity={0.8}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={24}
            color="#FFFFFF"
          />
          <Text style={styles.newButtonText}>
            New {selectedType === 'weight' ? 'Weight' : selectedType === 'steps' ? 'Steps' : 'Gym'} Check-In
          </Text>
        </TouchableOpacity>

        {/* Check-Ins List */}
        {filteredCheckIns.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <IconSymbol
              ios_icon_name={
                selectedType === 'weight' ? 'scalemass' :
                selectedType === 'steps' ? 'figure.walk' :
                'dumbbell.fill'
              }
              android_material_icon_name={
                selectedType === 'weight' ? 'monitor_weight' :
                selectedType === 'steps' ? 'directions_walk' :
                'fitness_center'
              }
              size={48}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
            <Text style={[styles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>
              No {selectedType === 'weight' ? 'Weight' : selectedType === 'steps' ? 'Steps' : 'Gym'} Check-Ins Yet
            </Text>
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {selectedType === 'weight' && 'Track your weight progress over time.'}
              {selectedType === 'steps' && 'Log your daily steps and goals.'}
              {selectedType === 'gym' && 'Record your gym workouts.'}
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: colors.primary }]}
              onPress={handleNewCheckIn}
            >
              <Text style={styles.emptyButtonText}>Create Your First Check-In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.checkInsList}>
            {filteredCheckIns.map((checkIn, index) => (
              <React.Fragment key={checkIn.id}>
                <SwipeToDeleteRow
                  onDelete={() => handleDeleteCheckIn(checkIn)}
                >
                  <TouchableOpacity
                    style={[
                      styles.checkInRow,
                      { backgroundColor: isDark ? colors.cardDark : colors.card }
                    ]}
                    onPress={() => handleViewCheckIn(checkIn)}
                    activeOpacity={0.6}
                  >
                    <View style={styles.checkInRowContent}>
                      <Text style={[styles.checkInRowDate, { color: isDark ? colors.textDark : colors.text }]}>
                        {formatDate(checkIn.date)}
                      </Text>
                      <Text style={[styles.checkInRowSeparator, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        —
                      </Text>
                      <Text style={[styles.checkInRowValue, { color: isDark ? colors.textDark : colors.text }]}>
                        {selectedType === 'weight' && checkIn.weight && formatWeight(checkIn.weight)}
                        {selectedType === 'steps' && checkIn.steps !== null && `${checkIn.steps.toLocaleString()} steps`}
                        {selectedType === 'gym' && checkIn.went_to_gym && 'Workout: Yes'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </SwipeToDeleteRow>
              </React.Fragment>
            ))}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h2,
  },
  segmentedControlContainer: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: 4,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
    elevation: 3,
  },
  newButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  emptyTitle: {
    ...typography.h3,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  checkInsList: {
    gap: spacing.xs,
  },
  checkInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  checkInRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  checkInRowDate: {
    fontSize: 15,
    fontWeight: '500',
    minWidth: 80,
  },
  checkInRowSeparator: {
    fontSize: 15,
    fontWeight: '400',
  },
  checkInRowValue: {
    fontSize: 15,
    fontWeight: '400',
    flex: 1,
  },
  bottomSpacer: {
    height: 40,
  },
});
