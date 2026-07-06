
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/lib/supabase/client';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { toLocalDateString } from '@/utils/dateUtils';

/**
 * AI Meal Estimator Screen
 * 
 * This screen allows users to describe their meal in text and get AI-powered
 * nutrition estimates. Premium feature — non-subscribers are redirected to the
 * subscription screen.
 * 
 * NOTE: All voice/microphone/transcription functionality has been removed.
 * Users can only input meal descriptions via text.
 */

const MEAL_LABEL_MAP: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

function getSmartMealType(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'snack';
}

export default function AIMealEstimatorScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPremium, loading: premiumLoading } = usePremium();

  const params = useLocalSearchParams<{
    meal?: string;
    date?: string;
    context?: string;
    returnTo?: string;
  }>();

  const currentMeal = params.meal || getSmartMealType();
  const currentDate = params.date || toLocalDateString(new Date());
  const mealLabel = MEAL_LABEL_MAP[currentMeal] ?? 'Meal';

  const [mealDescription, setMealDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { isRecording, isTranscribing, startRecording, stopRecordingAndTranscribe } = useVoiceRecorder({
    onTranscription: (text) => {
      console.log('[AIMealEstimator] Voice transcription received:', text);
      setMealDescription(text);
    },
    onError: (message) => Alert.alert('Error de voz', message),
  });

  // --- Premium gate ---
  if (premiumLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.gateLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isPremium) {
    console.log('[AIMealEstimator] Non-premium user attempted access — showing paywall');
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.header, { backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>AI Meal Estimator</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.gateContainer}>
          <View style={[styles.gateIconCircle, { backgroundColor: colors.primary + '20' }]}>
            <IconSymbol
              ios_icon_name="star.fill"
              android_material_icon_name="star"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.gateTitle, { color: colors.text }]}>Premium Feature</Text>
          <Text style={[styles.gateMessage, { color: colors.grey }]}>
            AI Meal Estimator is a premium feature. Describe any meal and get instant calorie and macro estimates — no barcode needed.
          </Text>
          <TouchableOpacity
            style={[styles.gateButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[AIMealEstimator] User tapped Upgrade to Premium');
              router.push('/subscription');
            }}
          >
            <IconSymbol
              ios_icon_name="star.fill"
              android_material_icon_name="star"
              size={18}
              color="#FFFFFF"
            />
            <Text style={styles.gateButtonText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.gateBackButton}
            onPress={() => {
              console.log('[AIMealEstimator] Non-premium user tapped Go Back');
              router.back();
            }}
          >
            <Text style={[styles.gateBackText, { color: colors.grey }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  // --- End premium gate ---

  const handleLogMeal = async () => {
    console.log('[AIMealEstimator] handleLogMeal pressed — meal:', currentMeal, 'date:', currentDate);
    setIsLogging(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      // 1. Insert into foods table
      console.log('[AIMealEstimator] Inserting food record for:', mealDescription.trim());
      const { data: food, error: foodError } = await supabase
        .from('foods')
        .insert({
          name: mealDescription.trim(),
          brand: 'AI Estimate',
          serving_amount: 1,
          serving_unit: 'serving',
          calories: result.calories,
          protein: result.protein,
          carbs: result.carbs,
          fats: result.fats,
          fiber: 0,
          user_created: true,
        })
        .select()
        .single();
      if (foodError) throw foodError;
      console.log('[AIMealEstimator] Food inserted, id:', food.id);

      // 2. Log via RPC (atomic upsert meal + insert meal_item)
      console.log('[AIMealEstimator] Calling log_food RPC for date:', currentDate, 'type:', currentMeal, 'food_id:', food.id);
      const { data: rpcData, error: rpcError } = await supabase.rpc('log_food', {
        p_user_id: user.id,
        p_date: currentDate,
        p_meal_type: currentMeal,
        p_food_id: food.id,
        p_food_item_id: null,
        p_quantity: 1,
        p_calories: result.calories,
        p_protein: result.protein,
        p_carbs: result.carbs,
        p_fats: result.fats,
        p_fiber: 0,
        p_serving_description: '1 serving',
        p_grams: 1,
        p_logged_at: new Date().toISOString(),
      });
      if (rpcError) throw rpcError;
      console.log('[AIMealEstimator] log_food RPC success, meal_id:', rpcData?.meal_id, 'meal_item_id:', rpcData?.meal_item_id);

      Alert.alert(
        'Added!',
        `"${mealDescription.trim()}" has been added to your ${mealLabel}.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to log meal. Please try again.');
      console.error('[AIMealEstimator] handleLogMeal error:', err);
    } finally {
      setIsLogging(false);
    }
  };

  const handleAnalyze = async () => {
    if (!mealDescription.trim()) {
      Alert.alert('Error', 'Please describe your meal');
      return;
    }

    console.log('[AIMealEstimator] Analyzing meal:', mealDescription.trim());
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('estimate-meal', {
        body: { description: mealDescription.trim() },
      });

      if (error || !data) {
        throw new Error('Failed to analyze meal. Please try again.');
      }

      console.log('[AIMealEstimator] Result received:', data);
      setResult({
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fats: data.fats,
      });
    } catch (error) {
      console.error('[AIMealEstimator] Error analyzing meal:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to analyze meal');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol 
            ios_icon_name="chevron.left" 
            android_material_icon_name="arrow-back" 
            size={24} 
            color={colors.text} 
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          AI Meal Estimator
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.infoCard, { backgroundColor: colors.backgroundAlt }]}>
          <IconSymbol
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.infoText, { color: colors.text }]}>
            Describe your meal and get instant nutrition estimates powered by AI
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>
          Describe your meal
        </Text>
        
        <View style={styles.inputWrapper}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundAlt,
                color: colors.text,
                borderColor: isRecording ? '#FF3B30' : colors.grey,
              },
            ]}
            placeholder="e.g., Grilled chicken breast with rice and broccoli"
            placeholderTextColor={colors.grey}
            value={mealDescription}
            onChangeText={setMealDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.micButton, { backgroundColor: isRecording ? '#FF3B3015' : colors.primary + '15' }]}
            onPress={() => {
              if (isRecording) {
                console.log('[AIMealEstimator] Mic button pressed — stopping recording');
                stopRecordingAndTranscribe();
              } else {
                console.log('[AIMealEstimator] Mic button pressed — starting recording');
                startRecording();
              }
            }}
            disabled={isAnalyzing || isTranscribing}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol
                ios_icon_name={isRecording ? 'stop.circle.fill' : 'mic.fill'}
                android_material_icon_name={isRecording ? 'stop_circle' : 'mic'}
                size={22}
                color={isRecording ? '#FF3B30' : colors.primary}
              />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.analyzeButton, isAnalyzing && styles.analyzeButtonDisabled]}
          onPress={handleAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.analyzeButtonText}>Analyze Meal</Text>
          )}
        </TouchableOpacity>

        {result && (
          <>
            <View style={[styles.resultCard, { backgroundColor: colors.backgroundAlt }]}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                Estimated Nutrition
              </Text>
              <View style={styles.macroRow}>
                <Text style={[styles.macroLabel, { color: colors.grey }]}>
                  Calories
                </Text>
                <Text style={[styles.macroValue, { color: colors.text }]}>
                  {result.calories} kcal
                </Text>
              </View>
              <View style={styles.macroRow}>
                <Text style={[styles.macroLabel, { color: colors.grey }]}>
                  Protein
                </Text>
                <Text style={[styles.macroValue, { color: colors.text }]}>
                  {result.protein}g
                </Text>
              </View>
              <View style={styles.macroRow}>
                <Text style={[styles.macroLabel, { color: colors.grey }]}>
                  Carbs
                </Text>
                <Text style={[styles.macroValue, { color: colors.text }]}>
                  {result.carbs}g
                </Text>
              </View>
              <View style={styles.macroRow}>
                <Text style={[styles.macroLabel, { color: colors.grey }]}>
                  Fats
                </Text>
                <Text style={[styles.macroValue, { color: colors.text }]}>
                  {result.fats}g
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.logButton, isLogging && styles.analyzeButtonDisabled]}
              onPress={handleLogMeal}
              disabled={isLogging}
            >
              {isLogging ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.analyzeButtonText}>
                  Add to {mealLabel}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
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
    paddingVertical: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: typography.sm,
    lineHeight: 20,
  },
  label: {
    fontSize: typography.md,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.md,
    minHeight: 120,
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  micButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  analyzeButtonDisabled: {
    opacity: 0.6,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: typography.md,
    fontWeight: '600',
  },
  resultCard: {
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  logButton: {
    backgroundColor: '#10B981',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  resultTitle: {
    fontSize: typography.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  macroLabel: {
    fontSize: typography.md,
  },
  macroValue: {
    fontSize: typography.md,
    fontWeight: '500',
  },
  gateLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  gateIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  gateTitle: {
    fontSize: typography.xl,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  gateMessage: {
    fontSize: typography.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  gateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    width: '100%',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  gateButtonText: {
    color: '#FFFFFF',
    fontSize: typography.md,
    fontWeight: '700',
  },
  gateBackButton: {
    paddingVertical: spacing.sm,
  },
  gateBackText: {
    fontSize: typography.md,
    textDecorationLine: 'underline',
  },
});
