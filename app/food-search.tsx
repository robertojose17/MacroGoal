
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { type OpenFoodFactsProduct } from '@/utils/openFoodFacts';
import { ResultSource, SearchResultItem, buildResultItem, mergeProducts } from '@/utils/foodSearchUtils';
import { toLocalDateString } from '@/utils/dateUtils';
import { hybridSearch } from '@/utils/foodSearchHybrid';
import { logFoodUsage } from '@/utils/logFoodUsage';



// ─── Memoized row component ───────────────────────────────────────────────────

const SOURCE_BADGE: Record<ResultSource, string | null> = {
  local: '💾',
  supabase: null, // subtle check mark shown inline
  off: null,
};

const ResultRow = React.memo(
  ({
    item,
    isDark,
    onPress,
  }: {
    item: SearchResultItem;
    isDark: boolean;
    onPress: (item: SearchResultItem) => void;
  }) => {
    const productName = item.product.product_name || item.product.generic_name || 'Unknown Product';
    const brand = item.product.brands || '';
    const badge = SOURCE_BADGE[item.source];
    const isVerified = item.source === 'supabase';

    const handlePress = useCallback(() => {
      console.log('[FoodSearch] Product tapped:', productName, '| source:', item.source);
      onPress(item);
    }, [item, onPress, productName]);

    const caloriesDisplay = Math.round(item.displayCalories);
    const proteinDisplay = Math.round(isFinite(item.displayProtein) ? item.displayProtein : 0);
    const carbsDisplay = Math.round(isFinite(item.displayCarbs) ? item.displayCarbs : 0);
    const fatsDisplay = Math.round(isFinite(item.displayFats) ? item.displayFats : 0);

    return (
      <TouchableOpacity
        style={[styles.resultCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={styles.resultContent}>
          <View style={styles.resultInfo}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.productName, { color: isDark ? colors.textDark : colors.text }]}
                numberOfLines={2}
              >
                {productName}
              </Text>
              {isVerified && (
                <Text style={styles.verifiedBadge}>✓</Text>
              )}
              {badge && !isVerified && (
                <Text style={styles.cacheBadge}>{badge}</Text>
              )}
            </View>

            {brand ? (
              <Text
                style={[styles.productBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                numberOfLines={1}
              >
                {brand}
              </Text>
            ) : null}

            <Text
              style={[styles.productServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
            >
              per {item.servingText}
            </Text>

            {item.hasNutrition ? (
              <View style={styles.macrosRow}>
                <Text style={[styles.macroText, { color: colors.calories }]}>
                  {caloriesDisplay} cal
                </Text>
                <Text style={[styles.macroDivider, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  •
                </Text>
                <Text style={[styles.macroText, { color: colors.protein }]}>
                  P: {proteinDisplay}g
                </Text>
                <Text style={[styles.macroDivider, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  •
                </Text>
                <Text style={[styles.macroText, { color: colors.carbs }]}>
                  C: {carbsDisplay}g
                </Text>
                <Text style={[styles.macroDivider, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  •
                </Text>
                <Text style={[styles.macroText, { color: colors.fats }]}>
                  F: {fatsDisplay}g
                </Text>
              </View>
            ) : (
              <Text style={[styles.noNutritionText, { color: colors.warning || '#FF9500' }]}>
                Nutrition not available
              </Text>
            )}
          </View>

          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.item.product.code === next.item.product.code &&
    prev.item.source === next.item.source &&
    prev.isDark === next.isDark,
);

ResultRow.displayName = 'ResultRow';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FoodSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const mode = params.mode as string;
  const context = params.context as string;
  const returnTo = params.returnTo as string;
  const targetMealId = params.mealId as string;
  const planId = params.planId as string;

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false); // true while any stage is pending
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const searchInputRef = useRef<TextInput>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Accumulated results map for the current query (reset on new query)
  const resultsMapRef = useRef<Map<string, SearchResultItem>>(new Map());
  const currentQueryRef = useRef<string>('');

  useEffect(() => {
    console.log('[FoodSearch] Screen mounted, meal:', mealType, 'date:', date);
    const focusTimeout = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 300);
    return () => {
      console.log('[FoodSearch] Screen unmounting, cleaning up...');
      clearTimeout(focusTimeout);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      abortControllerRef.current?.abort();
    };
  }, [date, mealType]);

  const performSearch = useCallback((query: string) => {
    console.log('[FoodSearch] ========== PERFORMING HYBRID SEARCH ==========');
    console.log('[FoodSearch] Query:', query);

    // Abort any in-flight search
    if (abortControllerRef.current) {
      console.log('[FoodSearch] Aborting previous search');
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset state for new query
    currentQueryRef.current = query;
    resultsMapRef.current = new Map();
    setResults([]);
    setErrorMessage(null);
    setHasSearched(true);
    setIsSearching(true);

    hybridSearch(
      query,
      {
        onLocalCacheHit: (products) => {
          if (controller.signal.aborted) return;
          console.log('[FoodSearch] onLocalCacheHit —', products.length, 'products');
          const merged = mergeProducts(resultsMapRef.current, products, 'local', query);
          setResults(merged);
        },
        onSupabaseHit: (products) => {
          if (controller.signal.aborted) return;
          console.log('[FoodSearch] onSupabaseHit —', products.length, 'products');
          const merged = mergeProducts(resultsMapRef.current, products, 'supabase', query);
          setResults(merged);
        },
        onOpenFoodFactsHit: (products) => {
          if (controller.signal.aborted) return;
          console.log('[FoodSearch] onOpenFoodFactsHit —', products.length, 'products');
          const merged = mergeProducts(resultsMapRef.current, products, 'off', query);
          setResults(merged);
        },
        onError: (stage, error) => {
          if (controller.signal.aborted) return;
          console.warn('[FoodSearch] Search error at stage:', stage, error.message);
          // Only show error if we have no results at all
          setResults(prev => {
            if (prev.length === 0) {
              setErrorMessage('Connection issue. Please check your internet and try again.');
            }
            return prev;
          });
        },
        onComplete: () => {
          if (controller.signal.aborted) return;
          console.log('[FoodSearch] Search complete for query:', query);
          setIsSearching(false);
          // If still no results after all stages, show empty message
          setResults(prev => {
            if (prev.length === 0) {
              setErrorMessage(null); // let renderEmptyState handle it
            }
            return prev;
          });
        },
      },
      controller.signal,
    );
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length === 0) {
      console.log('[FoodSearch] Query empty — clearing results');
      abortControllerRef.current?.abort();
      resultsMapRef.current = new Map();
      setResults([]);
      setErrorMessage(null);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    if (trimmedQuery.length < 2) {
      console.log('[FoodSearch] Query too short (<2 chars)');
      abortControllerRef.current?.abort();
      resultsMapRef.current = new Map();
      setResults([]);
      setErrorMessage(null);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    console.log('[FoodSearch] Debouncing search for:', trimmedQuery);
    debounceTimerRef.current = setTimeout(() => {
      console.log('[FoodSearch] Debounce fired for:', trimmedQuery);
      performSearch(trimmedQuery);
    }, 350);
  }, [searchQuery, performSearch]);

  const handleRetry = useCallback(() => {
    console.log('[FoodSearch] Retry button pressed');
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery && trimmedQuery.length >= 2) {
      performSearch(trimmedQuery);
    }
  }, [searchQuery, performSearch]);

  const handleSelectProduct = useCallback(
    (item: SearchResultItem) => {
      console.log('[FoodSearch] Product selected:', item.product.product_name, '| source:', item.source);
      console.log('[FoodSearch] Navigating to food-details, context:', context, 'returnTo:', returnTo);
      if (item.source === 'supabase' && item.product.code) {
        console.log('[FoodSearch] Logging food usage for supabase product:', item.product.code);
        try {
          logFoodUsage(item.product.code).catch(() => {});
        } catch {
          // fire-and-forget, never block navigation
        }
      }
      router.push({
        pathname: '/food-details',
        params: {
          meal: mealType,
          date: date,
          offData: JSON.stringify(item.product),
          source: 'search',
          mode: mode,
          context: context,
          returnTo: returnTo,
          mealId: targetMealId,
          planId: planId,
        },
      });
    },
    [mealType, date, mode, context, returnTo, targetMealId, planId, router],
  );

  const renderResultItem = useCallback(
    ({ item }: { item: SearchResultItem }) => (
      <ResultRow item={item} isDark={isDark} onPress={handleSelectProduct} />
    ),
    [isDark, handleSelectProduct],
  );

  const keyExtractor = useCallback(
    (item: SearchResultItem, index: number) => item.product.code || `product-${index}`,
    [],
  );

  const renderFooter = useCallback(() => {
    if (!isSearching || results.length === 0) return null;
    return (
      <View style={styles.loadingMoreContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingMoreText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          Loading more...
        </Text>
      </View>
    );
  }, [isSearching, results.length, isDark]);

  const renderEmptyState = () => {
    if (isSearching && results.length === 0) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.lg }} />
          <Text style={[styles.emptyMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Searching...
          </Text>
        </View>
      );
    }

    if (errorMessage) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={[styles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Connection Issue
          </Text>
          <Text style={[styles.emptyMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {errorMessage}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={handleRetry}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (hasSearched && results.length === 0 && !isSearching) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={[styles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>
            No foods found
          </Text>
          <Text style={[styles.emptyMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Try a different search term
          </Text>
        </View>
      );
    }

    if (searchQuery.trim().length > 0 && searchQuery.trim().length < 2) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✏️</Text>
          <Text style={[styles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Keep typing...
          </Text>
          <Text style={[styles.emptyMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Enter at least 2 characters to search
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🍎</Text>
        <Text style={[styles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Search for foods
        </Text>
        <Text style={[styles.emptyMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          Start typing to search the food database
        </Text>
      </View>
    );
  };

  const titleText = mode === 'ingredient' ? 'Add Ingredient' : 'Search Food Library';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              console.log('[FoodSearch] Back button pressed');
              router.back();
            }}
            style={styles.backButton}
          >
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            {titleText}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputContainer,
              {
                backgroundColor: isDark ? colors.cardDark : colors.card,
                borderColor: isDark ? colors.borderDark : colors.border,
              },
            ]}
          >
            <IconSymbol
              ios_icon_name="magnifyingglass"
              android_material_icon_name="search"
              size={20}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: isDark ? colors.textDark : colors.text }]}
              placeholder="Search foods…"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              value={searchQuery}
              onChangeText={(text) => {
                console.log('[FoodSearch] Search input changed:', text);
                setSearchQuery(text);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  console.log('[FoodSearch] Clear search button pressed');
                  setSearchQuery('');
                }}
                style={styles.clearButton}
              >
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={20}
                  color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Subtle inline loading indicator — only shown when actively searching with no results yet */}
          {isSearching && results.length === 0 && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Searching...
              </Text>
            </View>
          )}
        </View>

        <FlatList
          data={results}
          renderItem={renderResultItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          windowSize={7}
          initialNumToRender={10}
          updateCellsBatchingPeriod={50}
          onEndReachedThreshold={0.5}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: spacing.xs,
  },
  clearButton: {
    padding: spacing.xs,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  loadingMoreText: {
    ...typography.caption,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  resultCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resultInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  productName: {
    ...typography.bodyBold,
    fontSize: 16,
    lineHeight: 20,
    flexShrink: 1,
  },
  verifiedBadge: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '700',
  },
  cacheBadge: {
    fontSize: 11,
  },
  productBrand: {
    ...typography.caption,
    fontSize: 13,
  },
  productServing: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  macrosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  macroText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  macroDivider: {
    ...typography.caption,
    fontSize: 13,
  },
  noNutritionText: {
    ...typography.caption,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl * 2,
  },
  emptyIcon: {
    fontSize: 80,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h2,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyMessage: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
