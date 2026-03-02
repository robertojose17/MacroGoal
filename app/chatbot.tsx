
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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { useChatbot, ChatMessage } from '@/hooks/useChatbot';
import { supabase } from '@/app/integrations/supabase/client';
import { addToDraft } from '@/utils/myMealsDraft';

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

  // CRITICAL: Extract context from params
  const context = (params.context as string) || undefined;
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const returnTo = (params.returnTo as string) || undefined;

  console.log('[Chatbot] ========== SCREEN LOADED ==========');
  console.log('[Chatbot] Context:', context);
  console.log('[Chatbot] Meal Type:', mealType);
  console.log('[Chatbot] Date:', date);
  console.log('[Chatbot] Return To:', returnTo);

  const [messages, setMessages] = useState<MessageWithId[]>([
    {
      id: generateMessageId(),
      role: 'assistant',
      content:
        'Describe your meal or take a photo! You can use text or a photo for the most accurate estimate.',
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // Base64 data URL
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

  // Request camera permissions
  const requestCameraPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need camera access to use this function', [
        { text: 'Close', style: 'cancel', onPress: () => {} },
        { text: 'Continue', onPress: () => ImagePicker.requestCameraPermissionsAsync() }
      ]);
      return false;
    }
    return true;
  }, []);

  // Request media library permissions
  const requestMediaLibraryPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Media library permission is required to select photos.');
      return false;
    }
    return true;
  }, []);

  // Convert image URI to base64 data URL
  const convertImageToBase64 = useCallback(async (uri: string): Promise<string> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('[Chatbot] Error converting image to base64:', error);
      throw error;
    }
  }, []);

  // Take photo
  const handleTakePhoto = useCallback(async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const base64 = await convertImageToBase64(result.assets[0].uri);
        setSelectedImage(base64);
      }
    } catch (error) {
      console.error('[Chatbot] Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  }, [requestCameraPermission, convertImageToBase64]);

  // Choose from gallery
  const handleChooseFromGallery = useCallback(async () => {
    try {
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const base64 = await convertImageToBase64(result.assets[0].uri);
        setSelectedImage(base64);
      }
    } catch (error) {
      console.error('[Chatbot] Error choosing photo:', error);
      Alert.alert('Error', 'Failed to choose photo');
    }
  }, [requestMediaLibraryPermission, convertImageToBase64]);

  // Handle photo selection
  const handleAddPhoto = useCallback(() => {
    Alert.alert('Add Photo', 'Choose how to add a photo of your meal', [
      {
        text: 'Take Photo',
        onPress: handleTakePhoto,
      },
      {
        text: 'Choose from Gallery',
        onPress: handleChooseFromGallery,
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }, [handleTakePhoto, handleChooseFromGallery]);

  // Remove selected photo
  const handleRemovePhoto = useCallback(() => {
    setSelectedImage(null);
  }, []);

  /**
   * Parse meal data from the Edge Function response
   */
  const parseMealData = useCallback((mealData: any, userMessage: string): AIEstimate | null => {
    try {
      if (!mealData || !mealData.ingredients || !Array.isArray(mealData.ingredients)) {
        console.log('[Chatbot] No valid meal data in response');
        return null;
      }

      console.log('[Chatbot] Parsing structured ingredient data');

      const ingredients: Ingredient[] = mealData.ingredients.map((ing: any, index: number) => {
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
      const totals = ingredients.reduce(
        (acc, ing) => ({
          calories: acc.calories + ing.calories,
          protein: acc.protein + ing.protein,
          carbs: acc.carbs + ing.carbs,
          fats: acc.fats + ing.fats,
          fiber: acc.fiber + ing.fiber,
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
      );

      const mealName =
        userMessage && userMessage.length > 50
          ? userMessage.substring(0, 47) + '...'
          : userMessage || 'AI Estimated Meal';

      console.log('[Chatbot] Successfully parsed ingredients:', ingredients.length);

      return {
        name: mealName,
        ingredients,
        totalCalories: Math.round(totals.calories),
        totalProtein: Math.round(totals.protein * 10) / 10,
        totalCarbs: Math.round(totals.carbs * 10) / 10,
        totalFats: Math.round(totals.fats * 10) / 10,
        totalFiber: Math.round(totals.fiber * 10) / 10,
      };
    } catch (error) {
      console.error('[Chatbot] Error parsing meal data:', error);
      return null;
    }
  }, []);

  const handleSend = useCallback(async () => {
    const trimmedInput = inputText.trim();

    // Check if we have either text or image
    if (!trimmedInput && !selectedImage) {
      Alert.alert('Input Required', 'Please provide a description or photo.');
      return;
    }

    if (loading) return;

    // Determine the display message
    let displayMessage = trimmedInput;
    if (!displayMessage && selectedImage) {
      displayMessage = '[Photo of meal]';
    } else if (displayMessage && selectedImage) {
      displayMessage = `${displayMessage} [with photo]`;
    }

    const userMessage: MessageWithId = {
      id: generateMessageId(),
      role: 'user',
      content: displayMessage,
      timestamp: Date.now(),
    };

    setLastUserMessage(trimmedInput || 'Photo of meal');

    if (isMountedRef.current) {
      setMessages((prev) => [...prev, userMessage]);
      setInputText('');
    }

    // Store the image for this request, then clear it
    const imageToSend = selectedImage;
    setSelectedImage(null);

    try {
      // Enhanced system message requesting structured ingredient data
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `You are an AI Meal Estimator. Your job is to estimate calories and macronutrients for meals based on text descriptions, photos, or both.

IMPORTANT: You MUST respond in TWO parts:

1. First, provide a JSON object in a code block with this exact format:

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

2. Then, provide a natural language explanation of the meal.

Example response:

\`\`\`json
{
  "ingredients": [
    {
      "name": "McFlurry (medium)",
      "quantity": 1,
      "unit": "serving",
      "calories": 510,
      "protein": 12,
      "carbs": 70,
      "fats": 22,
      "fiber": 1
    }
  ]
}
\`\`\`

A medium McFlurry from McDonald's contains around 510 calories, 12g protein, 70g carbs, 22g fat, and 1g fiber.

Break down the meal into individual ingredients with their estimated quantities and macros. Be specific and realistic with portions.

When analyzing photos:
- Identify all visible food items
- Estimate portion sizes based on visual cues (plate size, common serving sizes)
- Make reasonable assumptions about ingredients and preparation methods
- If the photo quality is poor or items are unclear, make your best educated guess

If the user provides both text and photo, use both sources to make the most accurate estimate possible.`,
      };

      const validMessages = messages.filter((m) => {
        return m && typeof m === 'object' && m.role && m.content && m.role !== 'system';
      });

      // Prepare the actual prompt to send to AI
      let actualPrompt = trimmedInput;
      if (!actualPrompt && imageToSend) {
        // Image-only: use default prompt
        actualPrompt =
          'Estimate calories and macronutrients (protein, carbs, fats, fiber) for this meal from the photo. Make reasonable assumptions about portion sizes and ingredients.';
      }

      const apiMessages: ChatMessage[] = [
        systemMessage,
        ...validMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
        {
          role: 'user',
          content: actualPrompt,
          timestamp: Date.now(),
        },
      ];

      // Send with images if available
      const result = await sendMessage({
        messages: apiMessages,
        images: imageToSend ? [imageToSend] : [],
      });

      if (!isMountedRef.current) return;

      if (result && result.message && typeof result.message === 'string') {
        // Display only the natural language description in the chat
        const assistantMessage: MessageWithId = {
          id: generateMessageId(),
          role: 'assistant',
          content: result.message,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Parse the meal data if available
        if (result.mealData) {
          const estimate = parseMealData(result.mealData, trimmedInput || 'Photo of meal');
          if (estimate) {
            console.log('[Chatbot] Setting latest estimate with', estimate.ingredients.length, 'ingredients');
            setLatestEstimate(estimate);
          } else {
            console.log('[Chatbot] Could not parse meal data');
          }
        } else {
          console.log('[Chatbot] No meal data in response');
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
  }, [inputText, selectedImage, loading, messages, sendMessage, parseMealData]);

  // Update ingredient quantity and recalculate totals
  const handleQuantityChange = useCallback(
    (ingredientId: string, newQuantity: string) => {
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
            protein: Math.round(ing.originalProtein * ratio * 10) / 10,
            carbs: Math.round(ing.originalCarbs * ratio * 10) / 10,
            fats: Math.round(ing.originalFats * ratio * 10) / 10,
            fiber: Math.round(ing.originalFiber * ratio * 10) / 10,
          };
        });

        // Recalculate totals from included ingredients only
        const totals = updatedIngredients
          .filter((ing) => ing.included)
          .reduce(
            (acc, ing) => ({
              calories: acc.calories + ing.calories,
              protein: acc.protein + ing.protein,
              carbs: acc.carbs + ing.carbs,
              fats: acc.fats + ing.fats,
              fiber: acc.fiber + ing.fiber,
            }),
            { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
          );

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
    },
    [latestEstimate]
  );

  // Toggle ingredient inclusion and recalculate totals
  const handleToggleIngredient = useCallback(
    (ingredientId: string) => {
      if (!latestEstimate) return;

      setLatestEstimate((prev) => {
        if (!prev) return prev;

        const updatedIngredients = prev.ingredients.map((ing) =>
          ing.id === ingredientId ? { ...ing, included: !ing.included } : ing
        );

        // Recalculate totals from included ingredients only
        const totals = updatedIngredients
          .filter((ing) => ing.included)
          .reduce(
            (acc, ing) => ({
              calories: acc.calories + ing.calories,
              protein: acc.protein + ing.protein,
              carbs: acc.carbs + ing.carbs,
              fats: acc.fats + ing.fats,
              fiber: acc.fiber + ing.fiber,
            }),
            { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
          );

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
    },
    [latestEstimate]
  );

  /**
   * CRITICAL FIX: Handle "Log This Meal" / "Add to My Meal" button
   * Branch based on context:
   * - my_meals_builder: Add ingredients to My Meal draft and navigate back to Create Meal screen
   * - meal_log (or undefined): Log ingredients to diary and navigate back to Foods tab
   * 
   * CRITICAL FIX FOR RECENT FOODS:
   * Store foods with per-100g nutrition values in the foods table
   * Store the actual quantity/serving in the meal_items table
   * This ensures foods appear correctly in Recent Foods
   * 
   * CRITICAL FIX FOR NAVIGATION:
   * Use router.back() instead of router.push() to close the AI Meal Estimator
   * and return to the existing Foods tab (previous screen)
   */
  const handleLogMeal = useCallback(async () => {
    if (!latestEstimate) return;

    console.log('[Chatbot] ========== HANDLE LOG MEAL ==========');
    console.log('[Chatbot] Context:', context);
    console.log('[Chatbot] Meal Type:', mealType);
    console.log('[Chatbot] Date:', date);

    // Check if at least one ingredient is included
    const includedIngredients = latestEstimate.ingredients.filter((ing) => ing.included);
    if (includedIngredients.length === 0) {
      Alert.alert('No Ingredients', 'Please include at least one ingredient to log this meal.');
      return;
    }

    // CRITICAL: Branch based on context
    if (context === 'my_meals_builder') {
      console.log('[Chatbot] ========== MY MEALS BUILDER CONTEXT ==========');
      console.log('[Chatbot] Adding', includedIngredients.length, 'ingredients to My Meal draft');

      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          console.error('[Chatbot] No user found');
          Alert.alert('Error', 'You must be logged in to add food');
          return;
        }

        console.log('[Chatbot] User ID:', user.id);

        // Add each included ingredient to the My Meal draft
        let successCount = 0;
        let failedIngredients: string[] = [];

        for (const ingredient of includedIngredients) {
          try {
            console.log('[Chatbot] Creating food entry for ingredient:', ingredient.name);

            // CRITICAL FIX: Convert to per-100g values for storage
            let per100gCalories, per100gProtein, per100gCarbs, per100gFats, per100gFiber;
            let servingGrams = 100; // Default to 100g

            if (ingredient.unit === 'g') {
              // If unit is grams, calculate per-100g
              const ratio = 100 / ingredient.quantity;
              per100gCalories = ingredient.calories * ratio;
              per100gProtein = ingredient.protein * ratio;
              per100gCarbs = ingredient.carbs * ratio;
              per100gFats = ingredient.fats * ratio;
              per100gFiber = ingredient.fiber * ratio;
              servingGrams = ingredient.quantity;
            } else {
              // For other units (serving, cup, etc.), store as-is
              // This is the nutrition for 1 serving
              per100gCalories = ingredient.calories;
              per100gProtein = ingredient.protein;
              per100gCarbs = ingredient.carbs;
              per100gFats = ingredient.fats;
              per100gFiber = ingredient.fiber;
              servingGrams = 100; // Default
            }

            const foodPayload = {
              name: `${ingredient.name} (AI Estimated)`,
              serving_amount: 100, // Always store as per-100g
              serving_unit: 'g',
              calories: per100gCalories,
              protein: per100gProtein,
              carbs: per100gCarbs,
              fats: per100gFats,
              fiber: per100gFiber,
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

            // Add to My Meal draft with the actual serving size
            await addToDraft({
              food_id: foodData.id,
              food_name: `${ingredient.name} (AI Estimated)`,
              food_brand: undefined,
              serving_amount: servingGrams,
              serving_unit: 'g',
              servings_count: 1,
              calories: ingredient.calories,
              protein: ingredient.protein,
              carbs: ingredient.carbs,
              fats: ingredient.fats,
              fiber: ingredient.fiber,
            });

            console.log('[Chatbot] ✅ Ingredient added to My Meal draft:', ingredient.name);
            successCount++;
          } catch (error) {
            console.error('[Chatbot] Unexpected error adding ingredient to draft:', ingredient.name, error);
            failedIngredients.push(ingredient.name);
          }
        }

        // Show result to user
        if (successCount === includedIngredients.length) {
          console.log('[Chatbot] ✅ All ingredients added to My Meal draft successfully!');
          Alert.alert(
            'Success',
            `Added ${successCount} ingredient${successCount > 1 ? 's' : ''} to your meal`,
            [
              {
                text: 'OK',
                onPress: () => {
                  console.log('[Chatbot] Navigating back to Create Meal screen');
                  router.back();
                },
              },
            ]
          );
        } else if (successCount > 0) {
          console.log(`[Chatbot] ⚠️ Partial success: ${successCount}/${includedIngredients.length} ingredients added`);
          Alert.alert(
            'Partial Success',
            `Added ${successCount} of ${includedIngredients.length} ingredients. Failed: ${failedIngredients.join(', ')}`,
            [
              {
                text: 'OK',
                onPress: () => {
                  console.log('[Chatbot] Navigating back to Create Meal screen');
                  router.back();
                },
              },
            ]
          );
        } else {
          console.error('[Chatbot] ❌ Failed to add any ingredients');
          Alert.alert('Error', 'Failed to add ingredients. Please try again.', [{ text: 'OK' }]);
        }
      } catch (error) {
        console.error('[Chatbot] Error adding ingredients to My Meal draft:', error);
        Alert.alert('Error', 'Failed to add ingredients. Please try again.');
      }
    } else {
      // MEAL LOG CONTEXT (default)
      console.log('[Chatbot] ========== MEAL LOG CONTEXT ==========');
      console.log('[Chatbot] Logging', includedIngredients.length, 'ingredients to diary');

      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          console.error('[Chatbot] No user found');
          Alert.alert('Error', 'You must be logged in to add food');
          return;
        }

        console.log('[Chatbot] User ID:', user.id);

        // CRITICAL: Validate mealType - if missing, throw error
        if (!mealType) {
          console.error('[Chatbot] ❌ CRITICAL ERROR: mealType is missing!');
          Alert.alert('Error', 'Meal type is missing. Please try again from the meal log screen.');
          return;
        }

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

            // CRITICAL FIX: Convert to per-100g values for storage
            let per100gCalories, per100gProtein, per100gCarbs, per100gFats, per100gFiber;
            let servingGrams = 100; // Default to 100g

            if (ingredient.unit === 'g') {
              // If unit is grams, calculate per-100g
              const ratio = 100 / ingredient.quantity;
              per100gCalories = ingredient.calories * ratio;
              per100gProtein = ingredient.protein * ratio;
              per100gCarbs = ingredient.carbs * ratio;
              per100gFats = ingredient.fats * ratio;
              per100gFiber = ingredient.fiber * ratio;
              servingGrams = ingredient.quantity;
            } else {
              // For other units (serving, cup, etc.), store as-is
              // This is the nutrition for 1 serving
              per100gCalories = ingredient.calories;
              per100gProtein = ingredient.protein;
              per100gCarbs = ingredient.carbs;
              per100gFats = ingredient.fats;
              per100gFiber = ingredient.fiber;
              servingGrams = 100; // Default
            }

            // Create food entry with per-100g values
            const foodPayload = {
              name: `${ingredient.name} (AI Estimated)`,
              serving_amount: 100, // Always store as per-100g
              serving_unit: 'g',
              calories: per100gCalories,
              protein: per100gProtein,
              carbs: per100gCarbs,
              fats: per100gFats,
              fiber: per100gFiber,
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

            // Create meal item with the actual serving size
            const mealItemPayload = {
              meal_id: mealId,
              food_id: foodData.id,
              quantity: 1, // Always 1 serving
              calories: ingredient.calories,
              protein: ingredient.protein,
              carbs: ingredient.carbs,
              fats: ingredient.fats,
              fiber: ingredient.fiber,
              serving_description: `${ingredient.quantity} ${ingredient.unit}`,
              grams: servingGrams,
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

        // Show result to user and navigate back
        if (successCount === includedIngredients.length) {
          console.log('[Chatbot] ✅ All ingredients logged successfully!');
          
          const mealLabels: Record<string, string> = {
            breakfast: 'Breakfast',
            lunch: 'Lunch',
            dinner: 'Dinner',
            snack: 'Snacks',
          };
          
          Alert.alert(
            'Success',
            `Added ${successCount} ingredient${successCount > 1 ? 's' : ''} to ${mealLabels[mealType] || mealType}`,
            [
              {
                text: 'OK',
                onPress: () => {
                  console.log('[Chatbot] ✅ CRITICAL FIX: Navigating back to close AI Meal Estimator');
                  router.back();
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
                  console.log('[Chatbot] ✅ CRITICAL FIX: Navigating back to close AI Meal Estimator');
                  router.back();
                },
              },
            ]
          );
        } else {
          console.error('[Chatbot] ❌ Failed to log any ingredients');
          Alert.alert('Error', 'Failed to log ingredients. Please try again or use Quick Add manually.', [
            { text: 'OK' },
          ]);
        }
      } catch (error) {
        console.error('[Chatbot] Error logging meal:', error);
        Alert.alert('Error', 'Failed to log meal. Please try again.');
      }
    }
  }, [latestEstimate, context, mealType, date, router]);

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

  // CRITICAL: Determine button text based on context
  const buttonText = context === 'my_meals_builder' ? 'Add to My Meal' : 'Log this meal';

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
                            color: isUser
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
                <Text
                  style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                >
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
                    <Text
                      style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                    >
                      kcal
                    </Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {latestEstimate.totalProtein}g
                    </Text>
                    <Text
                      style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                    >
                      Protein
                    </Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {latestEstimate.totalCarbs}g
                    </Text>
                    <Text
                      style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                    >
                      Carbs
                    </Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {latestEstimate.totalFats}g
                    </Text>
                    <Text
                      style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                    >
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
                <Text
                  style={[styles.ingredientsSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                >
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
                        color={
                          ingredient.included
                            ? colors.primary
                            : isDark
                            ? colors.textSecondaryDark
                            : colors.textSecondary
                        }
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
                        <Text
                          style={[styles.unitText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                        >
                          {ingredient.unit}
                        </Text>
                      </View>

                      <View style={styles.ingredientMacros}>
                        <Text
                          style={[styles.macroText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                        >
                          {ingredient.calories} kcal
                        </Text>
                        <Text style={[styles.macroDivider, { color: isDark ? colors.borderDark : colors.border }]}>
                          •
                        </Text>
                        <Text
                          style={[styles.macroText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                        >
                          P: {ingredient.protein}g
                        </Text>
                        <Text style={[styles.macroDivider, { color: isDark ? colors.borderDark : colors.border }]}>
                          •
                        </Text>
                        <Text
                          style={[styles.macroText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                        >
                          C: {ingredient.carbs}g
                        </Text>
                        <Text style={[styles.macroDivider, { color: isDark ? colors.borderDark : colors.border }]}>
                          •
                        </Text>
                        <Text
                          style={[styles.macroText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                        >
                          F: {ingredient.fats}g
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* Log Meal Button - CRITICAL: Dynamic text based on context */}
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
                <Text style={styles.logMealButtonText}>{buttonText}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <View style={[styles.inputContainer, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          {/* Image preview */}
          {selectedImage && (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
              <TouchableOpacity style={styles.removeImageButton} onPress={handleRemovePhoto}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={24}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TouchableOpacity
              style={[
                styles.photoButton,
                { backgroundColor: isDark ? colors.backgroundDark : colors.background },
              ]}
              onPress={handleAddPhoto}
              disabled={loading}
            >
              <IconSymbol
                ios_icon_name="camera.fill"
                android_material_icon_name="photo_camera"
                size={24}
                color={colors.primary}
              />
            </TouchableOpacity>

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
                {
                  backgroundColor:
                    (inputText.trim() || selectedImage) && !loading
                      ? colors.primary
                      : colors.border,
                },
              ]}
              onPress={handleSend}
              disabled={(!inputText.trim() && !selectedImage) || loading}
            >
              <IconSymbol ios_icon_name="arrow.up" android_material_icon_name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.error,
    borderRadius: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  photoButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
