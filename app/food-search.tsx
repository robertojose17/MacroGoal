
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { searchOpenFoodFacts, OpenFoodFactsProduct, extractServingSize, extractNutrition } from '@/utils/openFoodFacts';

interface SearchResultItem {
  product: OpenFoodFactsProduct;
  displayCalories: number;
  displayProtein: number;
  displayCarbs: number;
  displayFats: number;
  displayFiber: number;
  servingText: string;
  hasNutrition: boolean;
}

// OPTIMIZATION: In-memory cache for search results
// Stores last N queries to avoid redundant API calls
const CACHE_SIZE = 20;
const searchCache = new Map<string, SearchResultItem[]>();

// OPTIMIZATION: Helper to manage cache
function getCachedResults(query: string): SearchResultItem[] | null {
  const cached = searchCache.get(query.toLowerCase().trim());
  if (cached) {
    console.log('[FoodSearch] 🎯 Cache HIT for query:', query);
  }
  return cached || null;
}

function setCachedResults(query: string, results: SearchResultItem[]): void {
  const key = query.toLowerCase().trim();
  
  // Limit cache size (LRU-style: delete oldest when full)
  if (searchCache.size >= CACHE_SIZE) {
    const firstKey = searchCache.keys().next().value;
    searchCache.delete(firstKey);
    console.log('[FoodSearch] Cache full, evicted oldest entry');
  }
  
  searchCache.set(key, results);
  console.log('[FoodSearch] 💾 Cached results for query:', query, '(cache size:', searchCache.size, ')');
}

// OPTIMIZATION: Memoized row component to prevent unnecessary re-renders
const ResultRow = React.memo(({ 
  item, 
  isDark, 
  onPress 
}: { 
  item: SearchResultItem; 
  isDark: boolean; 
  onPress: (item: SearchResultItem) => void;
}) => {
  const productName = item.product.product_name || item.product.generic_name || 'Unknown Product';
  const brand = item.product.brands || '';
  
  // OPTIMIZATION: Use useCallback to prevent inline function recreation
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);
  
  return (
    <TouchableOpacity
      style={[styles.resultCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.resultContent}>
        <View style={styles.resultInfo}>
          <Text style={[styles.productName, { color: isDark ? colors.textDark : colors.text }]} numberOfLines={2}>
            {productName}
          </Text>
          
          {brand && (
            <Text style={[styles.productBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]} numberOfLines={1}>
              {brand}
            </Text>
          )}
          
          <Text style={[styles.productServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            per {item.servingText}
          </Text>
          
          {item.hasNutrition ? (
            <View style={styles.macrosRow}>
              <Text style={[styles.macroText, { color: colors.calories }]}>
                {Math.round(item.displayCalories)} cal
              </Text>
              <Text style={[styles.macroDivider, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                •
              </Text>
              <Text style={[styles.macroText, { color: colors.protein }]}>
                P: {item.displayProtein.toFixed(1)}g
              </Text>
              <Text style={[styles.macroDivider, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                •
              </Text>
              <Text style={[styles.macroText, { color: colors.carbs }]}>
                C: {item.displayCarbs.toFixed(1)}g
              </Text>
              <Text style={[styles.macroDivider, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                •
              </Text>
              <Text style={[styles.macroText, { color: colors.fats }]}>
                F: {item.displayFats.toFixed(1)}g
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
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if item or isDark changes
  return prevProps.item.product.code === nextProps.item.product.code && 
         prevProps.isDark === nextProps.isDark;
});

ResultRow.displayName = 'ResultRow';

export default function FoodSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const mode = params.mode as string;
  const context = params.context as string;
  const returnTo = params.returnTo as string;
  const targetMealId = params.mealId as string;

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // OPTIMIZATION: Request ID for stale response protection
  const requestIdRef = useRef<number>(0);
  const searchInputRef = useRef<TextInput>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // OPTIMIZATION: Performance timing logs
  const timingRef = useRef<{ [key: string]: number }>({});

  const logTiming = useCallback((label: string) => {
    const now = Date.now();
    timingRef.current[label] = now;
    
    // Calculate delta from previous step
    const keys = Object.keys(timingRef.current);
    if (keys.length > 1) {
      const prevKey = keys[keys.length - 2];
      const prevTime = timingRef.current[prevKey];
      const delta = now - prevTime;
      console.log(`[FoodSearch] ⏱️ ${label} (+${delta}ms from ${prevKey})`);
    } else {
      console.log(`[FoodSearch] ⏱️ ${label}`);
    }
  }, []);

  useEffect(() => {
    console.log('[FoodSearch] Screen mounted, meal:', mealType, 'date:', date);
    console.log('[FoodSearch] Platform:', Platform.OS);
    
    // Auto-focus the search input with delay for mobile stability
    const focusTimeout = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 300);

    // Cleanup on unmount
    return () => {
      console.log('[FoodSearch] Screen unmounting, cleaning up...');
      
      // Clear focus timeout
      clearTimeout(focusTimeout);
      
      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [date, mealType]);

  useEffect(() => {
    logTiming('(a) Input changed');
    console.log('[FoodSearch] Query changed:', searchQuery, 'length:', searchQuery.length);
    
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      console.log('[FoodSearch] Clearing previous debounce timer');
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmedQuery = searchQuery.trim();

    // OPTIMIZATION: If query is empty, immediately clear results (no request)
    if (trimmedQuery.length === 0) {
      console.log('[FoodSearch] Query empty, clearing results immediately');
      setResults([]);
      setErrorMessage(null);
      setHasSearched(false);
      setLoading(false);
      timingRef.current = {};
      return;
    }

    // OPTIMIZATION: Require at least 2 characters before searching
    if (trimmedQuery.length < 2) {
      console.log('[FoodSearch] Query too short (<2 chars), clearing results');
      setResults([]);
      setErrorMessage(null);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    // OPTIMIZATION: Check cache first for progressive typing
    // If user types "chi" -> "chip", we can reuse cached "chi" results while fetching "chip"
    const cachedResults = getCachedResults(trimmedQuery);
    if (cachedResults) {
      console.log('[FoodSearch] Using cached results immediately');
      setResults(cachedResults);
      setErrorMessage(null);
      setHasSearched(true);
      setLoading(false);
      // Still trigger search in background to ensure fresh results
    }

    // OPTIMIZATION: Debounce search (350ms for optimal mobile performance)
    console.log('[FoodSearch] Setting debounce timer (350ms) for:', trimmedQuery);
    debounceTimerRef.current = setTimeout(() => {
      logTiming('(b) Debounce triggered');
      console.log('[FoodSearch] Debounce timer fired for:', trimmedQuery);
      performSearch(trimmedQuery);
    }, 350);
  }, [searchQuery, logTiming, performSearch]);

  const performSearch = useCallback(async (query: string) => {
    logTiming('(c) Request start');
    console.log('[FoodSearch] ========== PERFORMING SEARCH ==========');
    console.log('[FoodSearch] Query:', query);
    console.log('[FoodSearch] Platform:', Platform.OS);
    
    // OPTIMIZATION: Increment request ID for stale response protection
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    console.log('[FoodSearch] Request ID:', currentRequestId);
    
    console.log('[FoodSearch] Setting loading = true');
    setLoading(true);
    setErrorMessage(null);
    setHasSearched(true);

    try {
      // OPTIMIZATION: Check cache before making API call
      const cachedResults = getCachedResults(query);
      if (cachedResults) {
        console.log('[FoodSearch] ✅ Returning cached results (no API call)');
        
        // Check if this is still the latest request
        if (currentRequestId !== requestIdRef.current) {
          console.log('[FoodSearch] 🚫 Ignoring cached results (stale request ID)');
          return;
        }
        
        setResults(cachedResults);
        setLoading(false);
        logTiming('(d) Results set (from cache)');
        return;
      }

      // Call OpenFoodFacts search
      console.log('[FoodSearch] Calling searchOpenFoodFacts...');
      
      const result = await searchOpenFoodFacts(query);
      
      logTiming('(c.1) Request end');
      console.log('[FoodSearch] Search completed');
      console.log('[FoodSearch] Response status:', result.status);
      console.log('[FoodSearch] Products count:', result.products.length);
      
      // OPTIMIZATION: Check if this is still the latest request (stale response protection)
      if (currentRequestId !== requestIdRef.current) {
        console.log('[FoodSearch] 🚫 Ignoring stale search results (request ID:', currentRequestId, 'vs latest:', requestIdRef.current, ')');
        return;
      }

      // Check for errors
      if (result.status !== 200 && result.status !== 0) {
        console.log('[FoodSearch] Non-200 status returned:', result.status);
        setResults([]);
        setErrorMessage(`Connection issue (status: ${result.status}). Please try again.`);
        setLoading(false);
        return;
      }

      if (result.status === 0) {
        console.log('[FoodSearch] Network error (status: 0)');
        setResults([]);
        setErrorMessage('Connection issue. Please check your internet and try again.');
        setLoading(false);
        return;
      }

      if (result.products.length === 0) {
        console.log('[FoodSearch] No products returned');
        setResults([]);
        setErrorMessage('No foods found. Try a different search term.');
        setLoading(false);
        return;
      }

      // OPTIMIZATION: Limit initial results to 30 for faster rendering
      const limitedProducts = result.products.slice(0, 30);
      console.log('[FoodSearch] Limited products to', limitedProducts.length, 'for faster rendering');

      // Transform products into display items
      console.log('[FoodSearch] Transforming products...');
      const items: SearchResultItem[] = limitedProducts.map((product) => {
        const servingInfo = extractServingSize(product);
        const nutrition = extractNutrition(product);
        
        // Calculate nutrition for default serving
        const multiplier = servingInfo.grams / 100;
        const displayCalories = nutrition.calories * multiplier;
        const displayProtein = nutrition.protein * multiplier;
        const displayCarbs = nutrition.carbs * multiplier;
        const displayFats = nutrition.fat * multiplier;
        const displayFiber = nutrition.fiber * multiplier;
        
        // Check if product has nutrition data
        const hasNutrition = nutrition.calories > 0 || nutrition.protein > 0 || nutrition.carbs > 0 || nutrition.fat > 0;
        
        return {
          product,
          displayCalories,
          displayProtein,
          displayCarbs,
          displayFats,
          displayFiber,
          servingText: servingInfo.displayText,
          hasNutrition,
        };
      });

      logTiming('(d) Results transformed');
      console.log('[FoodSearch] ✅ Transformed', items.length, 'items for display');
      
      // OPTIMIZATION: Cache the results
      setCachedResults(query, items);
      
      setResults(items);
      setLoading(false);
      logTiming('(e) Results setState complete');
    } catch (error) {
      // Check if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        console.log('[FoodSearch] 🚫 Ignoring error from stale request (ID:', currentRequestId, ')');
        return;
      }

      console.error('[FoodSearch] ❌ Error in performSearch:', error);
      if (error instanceof Error) {
        console.error('[FoodSearch] Error message:', error.message);
        console.error('[FoodSearch] Error stack:', error.stack);
      }
      setResults([]);
      setErrorMessage('Connection issue. Please check your internet and try again.');
    } finally {
      // CRITICAL: Always clear loading state in finally block
      console.log('[FoodSearch] Setting loading = false (finally block)');
      setLoading(false);
    }
  }, [logTiming]);

  const handleRetry = useCallback(() => {
    console.log('[FoodSearch] Retry button pressed');
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery && trimmedQuery.length >= 2) {
      performSearch(trimmedQuery);
    }
  }, [searchQuery, performSearch]);

  // OPTIMIZATION: Memoize handleSelectProduct to prevent recreation
  const handleSelectProduct = useCallback((item: SearchResultItem) => {
    console.log('[FoodSearch] Product selected:', item.product.product_name);
    console.log('[FoodSearch] Context:', context);
    
    // Navigate to Food Details screen
    const detailsParams: any = {
      meal: mealType,
      date: date,
      offData: JSON.stringify(item.product),
      source: 'search',
    };
    
    if (mode === 'my_meal_builder' || context === 'my_meal_builder') {
      detailsParams.mode = mode;
      detailsParams.context = context;
      detailsParams.returnTo = returnTo;
      detailsParams.mealId = targetMealId;
    }
    
    router.push({
      pathname: '/food-details',
      params: detailsParams,
    });
  }, [mealType, date, mode, context, returnTo, targetMealId, router]);

  // OPTIMIZATION: Memoize renderItem to prevent recreation
  const renderResultItem = useCallback(({ item }: { item: SearchResultItem }) => {
    return <ResultRow item={item} isDark={isDark} onPress={handleSelectProduct} />;
  }, [isDark, handleSelectProduct]);

  // OPTIMIZATION: Memoize keyExtractor
  const keyExtractor = useCallback((item: SearchResultItem, index: number) => {
    return item.product.code || `product-${index}`;
  }, []);

  // OPTIMIZATION: Memoize onListRenderComplete callback
  const onListRenderComplete = useCallback(() => {
    logTiming('(f) List render complete');
  }, [logTiming]);

  const renderEmptyState = () => {
    if (loading) {
      return null;
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

    if (hasSearched && results.length === 0) {
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
          Start typing to search the OpenFoodFacts database
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
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
            Search Food Library
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchContainer}>
          <View style={[styles.searchInputContainer, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border }]}>
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
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={20}
                  color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          {loading && (
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // OPTIMIZATION: Mobile-specific FlatList performance settings
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          windowSize={7}
          initialNumToRender={10}
          updateCellsBatchingPeriod={50}
          // OPTIMIZATION: Track when list render completes
          onEndReachedThreshold={0.5}
          onLayout={onListRenderComplete}
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
  productName: {
    ...typography.bodyBold,
    fontSize: 16,
    lineHeight: 20,
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
