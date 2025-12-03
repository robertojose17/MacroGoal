
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { useChatbot, ChatMessage } from '@/hooks/useChatbot';
import { supabase } from '@/app/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';

// Generate a unique ID for each message
let messageIdCounter = 0;
const generateMessageId = () => {
  messageIdCounter += 1;
  return `msg-${Date.now()}-${messageIdCounter}-${Math.random().toString(36).substr(2, 9)}`;
};

// Extended message type with guaranteed ID
type MessageWithId = ChatMessage & { id: string };

type Ingredient = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  included: boolean;
  // Store original values for proper scaling
  originalQuantity: number;
  originalCalories: number;
  originalProtein: number;
  originalCarbs: number;
  originalFats: number;
  originalFiber: number;
};

type AIEstimate = {
  name: string;
  description?: string;
  ingredients: Ingredient[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  totalFiber: number;
};

export default function ChatbotScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Extract context from params (passed from Add Food screen)
  const mode = (params.mode as string) || 'diary';
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const returnTo = (params.returnTo as string) || undefined;
  const myMealId = (params.mealId as string) || undefined;

  // Check subscription status
  const { isSubscribed, loading: subscriptionLoading } = useSubscription();

  const [messages, setMessages] = useState<MessageWithId[]>([
    {
      id: generateMessageId(),
      role: 'assistant',
      content: 'Describe the meal you want me to estimate. The more details you include the more accurate your calories and macros will be.',
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [latestEstimate, setLatestEstimate] = useState<AIEstimate | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');

  const { sendMessage, loading } = useChatbot();

  // Setup and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Check subscription and redirect to paywall if not subscribed
  useEffect(() => {
    if (!subscriptionLoading && !isSubscribed) {
      console.log('[Chatbot] User is not subscribed, redirecting to paywall');
      Alert.alert(
        'Premium Feature',
        'AI Meal Estimator is a premium feature. Subscribe to unlock AI-powered meal estimation.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => router.back(),
          },
          {
            text: 'Subscribe',
            onPress: () => {
              router.replace('/paywall');
            },
          },
        ],
        { cancelable: false }
      );
    }
  }, [subscriptionLoading, isSubscribed, router]);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    if (!isMountedRef.current) return;
    
    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set new timeout
    scrollTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && scrollViewRef.current) {
        try {
          scrollViewRef.current.scrollToEnd({ animated: true });
        } catch (error) {
          console.warn('[ChatbotScreen] Error scrolling to bottom:', error);
        }
      }
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  /**
   * Parse AI response to extract ingredient-level estimates
   * First tries to parse JSON format, then falls back to text parsing
   */
  const parseAIEstimate = useCallback((content: string, userMessage: string): AIEstimate | null => {
    try {
      if (!content || typeof content !== 'string') {
        console.log('[Chatbot] Invalid content for parsing');
        return null;
      }

      console.log('[Chatbot] Parsing AI response for ingredient estimates');
      
      // Try to extract JSON from the response
      let jsonData = null;
      
      // Look for JSON block in markdown code fence
      const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        try {
          jsonData = JSON.parse(jsonBlockMatch[1].trim());
          console.log('[Chatbot] Found JSON in code block');
        } catch (e) {
          console.log('[Chatbot] Failed to parse JSON from code block');
        }
      }
      
      // Try to find raw JSON object
      if (!jsonData) {
        const jsonMatch = content.match(/\{[\s\S]*"ingredients"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            jsonData = JSON.parse(jsonMatch[0]);
            console.log('[Chatbot] Found raw JSON object');
          } catch (e) {
            console.log('[Chatbot] Failed to parse raw JSON');
          }
        }
      }
      
      // If we found JSON with ingredients, parse it
      if (jsonData && jsonData.ingredients && Array.isArray(jsonData.ingredients)) {
        console.log('[Chatbot] Parsing structured ingredient data');
        
        const ingredients: Ingredient[] = jsonData.ingredients.map((ing: any, index: number) => {
          const quantity = parseFloat(ing.quantity) || 1;
          const calories = parseFloat(ing.calories) || 0;
          const protein = parseFloat(ing.protein) || 0;
          const carbs = parseFloat(ing.carbs) || 0;
          const fats = parseFloat(ing.fats) || 0;
          const fiber = parseFloat(ing.fiber) || 0;
          
          return {
            id: `ing-${Date.now()}-${index}`,
            name: ing.name || 'Unknown ingredient',
            quantity,
            unit: ing.unit || 'serving',
            calories,
            protein,
            carbs,
            fats,
            fiber,
            included: true,
            // Store original values for proper scaling
            originalQuantity: quantity,
            originalCalories: calories,
            originalProtein: protein,
            originalCarbs: carbs,
            originalFats: fats,
            originalFiber: fiber,
          };
        });
        
        // Calculate totals
        const totals = ingredients.reduce((acc, ing) => ({
          calories: acc.calories + ing.calories,
          protein: acc.protein + ing.protein,
          carbs: acc.carbs + ing.carbs,
          fats: acc.fats + ing.fats,
          fiber: acc.fiber + ing.fiber,
        }), { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 });
        
        const mealName = userMessage && userMessage.length > 50 
          ? userMessage.substring(0, 47) + '...' 
          : userMessage || 'AI Estimated Meal';
        
        console.log('[Chatbot] Successfully parsed ingredients:', ingredients.length);
        
        return {
          name: mealName,
          description: content,
          ingredients,
          totalCalories: Math.round(totals.calories),
          totalProtein: Math.round(totals.protein * 10) / 10,
          totalCarbs: Math.round(totals.carbs * 10) / 10,
          totalFats: Math.round(totals.fats * 10) / 10,
          totalFiber: Math.round(totals.fiber * 10) / 10,
        };
      }
      
      // Fallback: Try to parse text-based format for single total
      console.log('[Chatbot] Falling back to text-based parsing');
      
      const caloriePatterns = [
        /calories?[:\s]+(\d+)/i,
        /(\d+)\s*cal/i,
        /(\d+)\s*kcal/i,
      ];
      
      const proteinPatterns = [
        /protein[:\s]+(\d+\.?\d*)\s*g/i,
        /(\d+\.?\d*)\s*g\s+protein/i,
      ];
      
      const carbsPatterns = [
        /carb(?:ohydrate)?s?[:\s]+(\d+\.?\d*)\s*g/i,
        /(\d+\.?\d*)\s*g\s+carb/i,
      ];
      
      const fatsPatterns = [
        /fats?[:\s]+(\d+\.?\d*)\s*g/i,
        /(\d+\.?\d*)\s*g\s+fat/i,
      ];
      
      const fiberPatterns = [
        /fiber[:\s]+(\d+\.?\d*)\s*g/i,
        /(\d+\.?\d*)\s*g\s+fiber/i,
      ];
      
      let calories = 0;
      let protein = 0;
      let carbs = 0;
      let fats = 0;
      let fiber = 0;
      
      for (const pattern of caloriePatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const parsed = parseFloat(match[1]);
          if (!isNaN(parsed) && parsed > 0) {
            calories = parsed;
            break;
          }
        }
      }
      
      for (const pattern of proteinPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const parsed = parseFloat(match[1]);
          if (!isNaN(parsed) && parsed >= 0) {
            protein = parsed;
            break;
          }
        }
      }
      
      for (const pattern of carbsPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const parsed = parseFloat(match[1]);
          if (!isNaN(parsed) && parsed >= 0) {
            carbs = parsed;
            break;
          }
        }
      }
      
      for (const pattern of fatsPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const parsed = parseFloat(match[1]);
          if (!isNaN(parsed) && parsed >= 0) {
            fats = parsed;
            break;
          }
        }
      }
      
      for (const pattern of fiberPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const parsed = parseFloat(match[1]);
          if (!isNaN(parsed) && parsed >= 0) {
            fiber = parsed;
            break;
          }
        }
      }
      
      if (calories > 0) {
        console.log('[Chatbot] Found single total estimate:', { calories, protein, carbs, fats, fiber });
        
        const mealName = userMessage && userMessage.length > 50 
          ? userMessage.substring(0, 47) + '...' 
          : userMessage || 'AI Estimated Meal';
        
        // Create a single "ingredient" representing the whole meal
        const singleIngredient: Ingredient = {
          id: `ing-${Date.now()}-0`,
          name: mealName,
          quantity: 1,
          unit: 'serving',
          calories,
          protein,
          carbs,
          fats,
          fiber,
          included: true,
          originalQuantity: 1,
          originalCalories: calories,
          originalProtein: protein,
          originalCarbs: carbs,
          originalFats: fats,
          originalFiber: fiber,
        };
        
        return {
          name: mealName,
          description: content,
          ingredients: [singleIngredient],
          totalCalories: Math.round(calories),
          totalProtein: Math.round(protein * 10) / 10,
          totalCarbs: Math.round(carbs * 10) / 10,
          totalFats: Math.round(fats * 10) / 10,
          totalFiber: Math.round(fiber * 10) / 10,
        };
      }
      
      console.log('[Chatbot] No valid estimate found in response');
      return null;
    } catch (error) {
      console.error('[Chatbot] Error parsing AI estimate:', error);
      return null;
    }
  }, []);

  const handleSend = async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput || loading) return;

    const userMessage: MessageWithId = {
      id: generateMessageId(),
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now(),
    };

    setLastUserMessage(trimmedInput);
    
    if (isMountedRef.current) {
      setMessages((prev) => [...prev, userMessage]);
      setInputText('');
    }

    try {
      // Enhanced system message requesting structured ingredient data
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `You are an AI Meal Estimator. Your job is to estimate calories and macronutrients for meals.

IMPORTANT: You MUST respond with a JSON object in this exact format:

\`\`\`json
{
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": number,
      "unit": "g" or "oz" or "cup" or "tbsp" or "serving",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number,
      "fiber": number
    }
  ]
}
\`\`\`

Break down the meal into individual ingredients with their estimated quantities and macros. Be specific and realistic with portions. If the user doesn't specify exact amounts, use typical serving sizes.

After the JSON, you can add a brief explanation if needed.`,
      };

      const validMessages = messages.filter((m) => {
        return m && typeof m === 'object' && m.role && m.content && m.role !== 'system';
      });

      const apiMessages: ChatMessage[] = [
        systemMessage,
        ...validMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
        {
          role: userMessage.role,
          content: userMessage.content,
          timestamp: userMessage.timestamp,
        },
      ];

      const result = await sendMessage({ messages: apiMessages });

      if (!isMountedRef.current) return;

      if (result && result.message && typeof result.message === 'string') {
        const assistantMessage: MessageWithId = {
          id: generateMessageId(),
          role: 'assistant',
          content: result.message,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        
        const estimate = parseAIEstimate(result.message, trimmedInput);
        if (estimate) {
          console.log('[Chatbot] Setting latest estimate with', estimate.ingredients.length, 'ingredients');
          setLatestEstimate(estimate);
        } else {
          console.log('[Chatbot] Could not parse estimate from response');
          // Show user-friendly error message
          Alert.alert(
            'Unable to Parse Response',
            'The AI response could not be parsed into ingredient data. Please try rephrasing your meal description or provide more details.',
            [{ text: 'OK' }]
          );
        }
      } else {
        const errorMessage: MessageWithId = {
          id: generateMessageId(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('[ChatbotScreen] Error in handleSend:', error);
      if (!isMountedRef.current) return;
      
      const errorMessage: MessageWithId = {
        id: generateMessageId(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  // Update ingredient quantity and recalculate totals
  const handleQuantityChange = useCallback((ingredientId: string, newQuantity: string) => {
    if (!latestEstimate) return;
    
    const quantity = parseFloat(newQuantity);
    if (isNaN(quantity) || quantity < 0) return;
    
    setLatestEstimate((prev) => {
      if (!prev) return prev;
      
      const updatedIngredients = prev.ingredients.map((ing) => {
        if (ing.id !== ingredientId) return ing;
        
        // Calculate ratio based on original quantity
        const ratio = quantity / ing.originalQuantity;
        
        // Scale all macros proportionally from original values
        return {
          ...ing,
          quantity,
          calories: Math.round(ing.originalCalories * ratio),
          protein: Math.round((ing.originalProtein * ratio) * 10) / 10,
          carbs: Math.round((ing.originalCarbs * ratio) * 10) / 10,
          fats: Math.round((ing.originalFats * ratio) * 10) / 10,
          fiber: Math.round((ing.originalFiber * ratio) * 10) / 10,
        };
      });
      
      // Recalculate totals from included ingredients only
      const totals = updatedIngredients
        .filter((ing) => ing.included)
        .reduce((acc, ing) => ({
          calories: acc.calories + ing.calories,
          protein: acc.protein + ing.protein,
          carbs: acc.carbs + ing.carbs,
          fats: acc.fats + ing.fats,
          fiber: acc.fiber + ing.fiber,
        }), { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 });
      
      return {
        ...prev,
        ingredients: updatedIngredients,
        totalCalories: Math.round(totals.calories),
        totalProtein: Math.round(totals.protein * 10) / 10,
        totalCarbs: Math.round(totals.carbs * 10) / 10,
        totalFats: Math.round(totals.fats * 10) / 10,
        totalFiber: Math.round(totals.fiber * 10) / 10,
      };
    });
  }, [latestEstimate]);

  // Toggle ingredient inclusion and recalculate totals
  const handleToggleIngredient = useCallback((ingredientId: string) => {
    if (!latestEstimate) return;
    
    setLatestEstimate((prev) => {
      if (!prev) return prev;
      
      const updatedIngredients = prev.ingredients.map((ing) => 
        ing.id === ingredientId ? { ...ing, included: !ing.included } : ing
      );
      
      // Recalculate totals from included ingredients only
      const totals = updatedIngredients
        .filter((ing) => ing.included)
        .reduce((acc, ing) => ({
          calories: acc.calories + ing.calories,
          protein: acc.protein + ing.protein,
          carbs: acc.carbs + ing.carbs,
          fats: acc.fats + ing.fats,
          fiber: acc.fiber + ing.fiber,
        }), { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 });
      
      return {
        ...prev,
        ingredients: updatedIngredients,
        totalCalories: Math.round(totals.calories),
        totalProtein: Math.round(totals.protein * 10) / 10,
        totalCarbs: Math.round(totals.carbs * 10) / 10,
        totalFats: Math.round(totals.fats * 10) / 10,
        totalFiber: Math.round(totals.fiber * 10) / 10,
      };
    });
  }, [latestEstimate]);

  const handleLogMeal = useCallback(async () => {
    if (!latestEstimate) return;
    
    // Check if at least one ingredient is included
    const includedIngredients = latestEstimate.ingredients.filter((ing) => ing.included);
    if (includedIngredients.length === 0) {
      Alert.alert('No Ingredients', 'Please include at least one ingredient to log this meal.');
      return;
    }
    
    try {
      console.log('[Chatbot] Logging meal with', includedIngredients.length, 'ingredients');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Chatbot] No user found');
        Alert.alert('Error', 'You must be logged in to add food');
        return;
      }

      console.log('[Chatbot] User ID:', user.id);

      // Get or create meal for the date
      console.log('[Chatbot] Looking for existing meal...');
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date)
        .eq('meal_type', mealType)
        .maybeSingle();

      let mealId = existingMeal?.id;

      if (!mealId) {
        console.log('[Chatbot] No existing meal found, creating new meal...');
        const { data: newMeal, error: mealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: date,
            meal_type: mealType,
          })
          .select()
          .single();

        if (mealError) {
          console.error('[Chatbot] Error creating meal:', mealError);
          Alert.alert('Error', `Failed to create meal: ${mealError.message}`);
          return;
        }

        mealId = newMeal.id;
        console.log('[Chatbot] New meal created:', mealId);
      } else {
        console.log('[Chatbot] Using existing meal:', mealId);
      }

      // Log each included ingredient as a separate food item
      let successCount = 0;
      let failedIngredients: string[] = [];

      for (const ingredient of includedIngredients) {
        try {
          console.log('[Chatbot] Creating food entry for ingredient:', ingredient.name);
          
          // Create food entry for this ingredient
          const foodPayload = {
            name: `${ingredient.name} (AI Estimated)`,
            serving_amount: ingredient.quantity,
            serving_unit: ingredient.unit,
            calories: ingredient.calories,
            protein: ingredient.protein,
            carbs: ingredient.carbs,
            fats: ingredient.fats,
            fiber: ingredient.fiber,
            user_created: true,
            created_by: user.id,
          };

          const { data: foodData, error: foodError } = await supabase
            .from('foods')
            .insert(foodPayload)
            .select()
            .single();

          if (foodError) {
            console.error('[Chatbot] Error creating food for ingredient:', ingredient.name, foodError);
            failedIngredients.push(ingredient.name);
            continue;
          }

          console.log('[Chatbot] Food created for ingredient:', foodData.id);

          // Create meal item for this ingredient
          const mealItemPayload = {
            meal_id: mealId,
            food_id: foodData.id,
            quantity: 1, // Quantity is already baked into the food entry
            calories: ingredient.calories,
            protein: ingredient.protein,
            carbs: ingredient.carbs,
            fats: ingredient.fats,
            fiber: ingredient.fiber,
            serving_description: `${ingredient.quantity} ${ingredient.unit}`,
            grams: ingredient.unit === 'g' ? ingredient.quantity : null,
          };

          const { data: mealItemData, error: mealItemError } = await supabase
            .from('meal_items')
            .insert(mealItemPayload)
            .select()
            .single();

          if (mealItemError) {
            console.error('[Chatbot] Error creating meal item for ingredient:', ingredient.name, mealItemError);
            failedIngredients.push(ingredient.name);
            continue;
          }

          console.log('[Chatbot] ✅ Meal item created for ingredient:', ingredient.name);
          successCount++;
        } catch (error) {
          console.error('[Chatbot] Unexpected error logging ingredient:', ingredient.name, error);
          failedIngredients.push(ingredient.name);
        }
      }

      // Show result to user
      if (successCount === includedIngredients.length) {
        console.log('[Chatbot] ✅ All ingredients logged successfully!');
        Alert.alert(
          'Success',
          `Added ${successCount} ingredient${successCount > 1 ? 's' : ''} to ${mealType}`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Navigate back to home/diary
                router.replace('/(tabs)/(home)/');
              },
            },
          ]
        );
      } else if (successCount > 0) {
        console.log(`[Chatbot] ⚠️ Partial success: ${successCount}/${includedIngredients.length} ingredients logged`);
        Alert.alert(
          'Partial Success',
          `Added ${successCount} of ${includedIngredients.length} ingredients. Failed: ${failedIngredients.join(', ')}`,
          [
            {
              text: 'OK',
              onPress: () => {
                router.replace('/(tabs)/(home)/');
              },
            },
          ]
        );
      } else {
        console.error('[Chatbot] ❌ Failed to log any ingredients');
        Alert.alert(
          'Error',
          'Failed to log ingredients. Please try again or use Quick Add manually.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[Chatbot] Error logging meal:', error);
      Alert.alert('Error', 'Failed to log meal. Please try again.');
    }
  }, [latestEstimate, mealType, date, mode, returnTo, myMealId, router]);

  const formatTime = useCallback((timestamp: number | undefined): string => {
    try {
      if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
        return '';
      }
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return '';
      }
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.warn('[ChatbotScreen] Error formatting time:', error);
      return '';
    }
  }, []);

  const validMessages = messages.filter((message) => {
    return message && typeof message === 'object' && message.content && message.id;
  });

  // Show loading while checking subscription
  if (subscriptionLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Checking subscription...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Don't render if not subscribed (will be redirected)
  if (!isSubscribed) {
    return null;
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <IconSymbol
            ios_icon_name="sparkles"
            android_material_icon_name="auto_awesome"
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
            AI Meal Estimator
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {validMessages.length > 0 ? (
            validMessages.map((message) => {
              const isUser = message.role === 'user';

              return (
                <View
                  key={message.id}
                  style={[
                    styles.messageWrapper,
                    isUser ? styles.userMessageWrapper : styles.assistantMessageWrapper,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isUser
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: isDark ? colors.cardDark : colors.card },
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        {
                          color: isUser ? '#FFFFFF' : isDark ? colors.textDark : colors.text,
                        },
                      ]}
                    >
                      {message.content}
                    </Text>
                    {message.timestamp && (
                      <Text
                        style={[
                          styles.messageTime,
                          {
                            color:
                              isUser
                                ? 'rgba(255, 255, 255, 0.7)'
                                : isDark
                                ? colors.textSecondaryDark
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        {formatTime(message.timestamp)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                No messages yet
              </Text>
            </View>
          )}
          
          {loading && (
            <View style={styles.loadingWrapper}>
              <View style={[styles.loadingBubble, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Analyzing meal...
                </Text>
              </View>
            </View>
          )}
          
          {/* Ingredient breakdown and totals - only show when we have a valid estimate */}
          {latestEstimate && !loading && (
            <View style={styles.estimateContainer}>
              {/* Totals Card */}
              <View style={[styles.totalsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                <Text style={[styles.totalsTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Meal Totals
                </Text>
                <View style={styles.totalsGrid}>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: colors.primary }]}>
                      {latestEstimate.totalCalories}
                    </Text>
                    <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      kcal
                    </Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {latestEstimate.totalProtein}g
                    </Text>
                    <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Protein
                    </Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {latestEstimate.totalCarbs}g
                    </Text>
                    <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Carbs
                    </Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {latestEstimate.totalFats}g
                    </Text>
                    <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Fats
                    </Text>
                  </View>
                </View>
              </View>

              {/* Ingredients List */}
              <View style={[styles.ingredientsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                <Text style={[styles.ingredientsTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Ingredients
                </Text>
                <Text style={[styles.ingredientsSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Adjust quantities or remove items before logging
                </Text>
                
                {latestEstimate.ingredients.map((ingredient, index) => (
                  <View
                    key={ingredient.id}
                    style={[
                      styles.ingredientRow,
                      { 
                        backgroundColor: isDark ? colors.backgroundDark : colors.background,
                        opacity: ingredient.included ? 1 : 0.5,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => handleToggleIngredient(ingredient.id)}
                      style={styles.ingredientCheckbox}
                    >
                      <IconSymbol
                        ios_icon_name={ingredient.included ? 'checkmark.circle.fill' : 'circle'}
                        android_material_icon_name={ingredient.included ? 'check_circle' : 'radio_button_unchecked'}
                        size={24}
                        color={ingredient.included ? colors.primary : (isDark ? colors.textSecondaryDark : colors.textSecondary)}
                      />
                    </TouchableOpacity>
                    
                    <View style={styles.ingredientContent}>
                      <Text style={[styles.ingredientName, { color: isDark ? colors.textDark : colors.text }]}>
                        {ingredient.name}
                      </Text>
                      
                      <View style={styles.ingredientQuantityRow}>
                        <TextInput
                          style={[
                            styles.quantityInput,
                            {
                              backgroundColor: isDark ? colors.cardDark : colors.card,
                              borderColor: isDark ? colors.borderDark : colors.border,
                              color: isDark ? colors.textDark : colors.text,
                            },
                          ]}
                          value={ingredient.quantity.toString()}
                          onChangeText={(text) => handleQuantityChange(ingredient.id, text)}
                          keyboardType="decimal-pad"
                          editable={ingredient.included}
                        />
                        <Text style={[styles.unitText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          {ingredient.unit}
                        </Text>
                      </View>
                      
                      <View style={styles.ingredientMacros}>
                        <Text style={[styles.macroText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          {ingredient.calories} kcal
                        </Text>
                        <Text style={[styles.macroDivider, { color: isDark ? colors.borderDark : colors.border }]}>
                          •
                        </Text>
                        <Text style={[styles.macroText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          P: {ingredient.protein}g
                        </Text>
                        <Text style={[styles.macroDivider, { color: isDark ? colors.borderDark : colors.border }]}>
                          •
                        </Text>
                        <Text style={[styles.macroText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          C: {ingredient.carbs}g
                        </Text>
                        <Text style={[styles.macroDivider, { color: isDark ? colors.borderDark : colors.border }]}>
                          •
                        </Text>
                        <Text style={[styles.macroText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          F: {ingredient.fats}g
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* Log Meal Button */}
              <TouchableOpacity
                style={[styles.logMealButton, { backgroundColor: colors.primary }]}
                onPress={handleLogMeal}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="plus.circle.fill"
                  android_material_icon_name="add_circle"
                  size={24}
                  color="#FFFFFF"
                />
                <Text style={styles.logMealButtonText}>Log this meal</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputContainer, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                color: isDark ? colors.textDark : colors.text,
              },
            ]}
            placeholder="Describe your meal..."
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!loading}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: inputText.trim() && !loading ? colors.primary : colors.border },
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading}
          >
            <IconSymbol
              ios_icon_name="arrow.up"
              android_material_icon_name="send"
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.body,
  },
  messageWrapper: {
    marginBottom: spacing.md,
    maxWidth: '80%',
  },
  userMessageWrapper: {
    alignSelf: 'flex-end',
  },
  assistantMessageWrapper: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.1)',
    elevation: 1,
  },
  messageText: {
    ...typography.body,
    lineHeight: 20,
  },
  messageTime: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  loadingWrapper: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  loadingBubble: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.body,
  },
  estimateContainer: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  totalsCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  totalsTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  totalsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  totalItem: {
    alignItems: 'center',
  },
  totalValue: {
    ...typography.h2,
    fontSize: 20,
    fontWeight: '700',
  },
  totalLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  ingredientsCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  ingredientsTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  ingredientsSubtitle: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  ingredientCheckbox: {
    marginRight: spacing.sm,
    paddingTop: 2,
  },
  ingredientContent: {
    flex: 1,
  },
  ingredientName: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  ingredientQuantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  quantityInput: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    minWidth: 60,
  },
  unitText: {
    ...typography.body,
    fontSize: 14,
  },
  ingredientMacros: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  macroText: {
    ...typography.caption,
    fontSize: 12,
  },
  macroDivider: {
    ...typography.caption,
    fontSize: 12,
  },
  logMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
    elevation: 3,
  },
  logMealButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    ...typography.body,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
