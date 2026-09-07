
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
import { toLocalDateString } from '@/utils/dateUtils';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { useChatbot, ChatMessage } from '@/hooks/useChatbot';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/lib/supabase/client';
import { addToDraft } from '@/utils/myMealsDraft';
import { useTranslation } from 'react-i18next';



// Quick action cards and craving chips are defined inside the component so they can use t()

// Generate a unique ID for each message
let messageIdCounter = 0;
const generateMessageId = () => {
  messageIdCounter += 1;
  return `msg-${Date.now()}-${messageIdCounter}-${Math.random().toString(36).substr(2, 9)}`;
};

// Extended message type with guaranteed ID
type MessageWithId = ChatMessage & { id: string; showUpgradeButton?: boolean };

type NutritionSource = {
  source_type: 'usda' | 'restaurant_official' | 'web_search' | 'gemini_estimate';
  source_name: string;
  source_url?: string;
  retrieval_date?: string;
  nutrition_match_confidence: 'high' | 'medium' | 'low';
};

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
  // Per-100g values for precise recalculation
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
  // Confidence dimensions
  id_confidence: 'high' | 'medium' | 'low';
  model_portion_confidence: 'high' | 'medium' | 'low';
  nutrition_confidence: 'high' | 'medium' | 'low';
  overall_confidence: 'high' | 'medium' | 'low';
  // Portion range
  grams_min?: number;
  grams_max?: number;
  // Nutrition provenance
  nutrition_source?: NutritionSource;
  // User verification
  scale_verified: boolean;
  // Preferred countable unit (e.g. "slice", "piece", "strip", "cup") — null if no natural unit
  preferred_unit: string | null;
  // Grams per 1 preferred_unit (e.g. 21 for a cheese slice). 0 if preferred_unit is null.
  unit_grams: number;
};

type PackagingCandidate = {
  name: string;
  brand: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
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
  scan_mode?: string;
  detected_restaurant?: string;
  packaging_ambiguous?: boolean;
  packaging_candidates?: PackagingCandidate[];
};

// Confidence helpers
const confidenceColor = (level: 'high' | 'medium' | 'low') => {
  if (level === 'high') return '#22c55e';
  if (level === 'medium') return '#f59e0b';
  return '#ef4444';
};

const confidenceEmoji = (level: 'high' | 'medium' | 'low') => {
  if (level === 'high') return '🟢';
  if (level === 'medium') return '🟡';
  return '🔴';
};

export default function ChatbotScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const QUICK_ACTION_CARDS = [
    t('chatbot.whatDidYouEat'),
    t('chatbot.helpProtein'),
    t('chatbot.suggestSnack'),
    t('chatbot.postWorkout'),
    t('chatbot.lastMealCalories'),
  ];

  const CRAVING_CHIPS = [
    t('chatbot.cravingSweet'),
    t('chatbot.reallyHungry'),
    t('chatbot.wantQuick'),
    t('chatbot.lowCalorie'),
    t('chatbot.highProtein'),
  ];
  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // CRITICAL: Extract context from params
  const context = (params.context as string) || undefined;
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const returnTo = (params.returnTo as string) || undefined;
  const isMealEstimator = (params.source as string) === 'meal-estimator';

  console.log('[Chatbot] ========== SCREEN LOADED ==========');
  console.log('[Chatbot] Context:', context);
  console.log('[Chatbot] Meal Type:', mealType);
  console.log('[Chatbot] Date:', date);
  console.log('[Chatbot] Return To:', returnTo);
  console.log('[Chatbot] isMealEstimator:', isMealEstimator);

  const [messages, setMessages] = useState<MessageWithId[]>([
    {
      id: generateMessageId(),
      role: 'assistant',
      content: t('chatbot.welcomeMessage'),
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [latestEstimate, setLatestEstimate] = useState<AIEstimate | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');
  const [expandedConfidenceId, setExpandedConfidenceId] = useState<string | null>(null);

  const { sendMessage, loading } = useChatbot();
  const { isPremium, loading: premiumLoading } = usePremium();

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
      Alert.alert(t('chatbot.permissionRequired'), t('chatbot.cameraPermissionMessage'), [
        { text: t('common.close'), style: 'cancel', onPress: () => {} },
        { text: t('common.connect'), onPress: () => ImagePicker.requestCameraPermissionsAsync() }
      ]);
      return false;
    }
    return true;
  }, []);

  // Request media library permissions
  const requestMediaLibraryPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('chatbot.permissionRequired'), t('chatbot.libraryPermissionMessage'));
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

  // Take photo — appends to selectedImages (max 3)
  const handleTakePhoto = useCallback(async () => {
    if (selectedImages.length >= 3) {
      Alert.alert(t('chatbot.addPhoto'), 'You can add up to 3 photos.');
      return;
    }
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
        console.log('[Chatbot] Photo taken, converting to base64');
        const base64 = await convertImageToBase64(result.assets[0].uri);
        setSelectedImages((prev) => [...prev, base64].slice(0, 3));
        console.log('[Chatbot] Photo added, total images:', selectedImages.length + 1);
      }
    } catch (error) {
      console.error('[Chatbot] Error taking photo:', error);
      Alert.alert(t('common.error'), t('chatbot.failedToTakePhoto'));
    }
  }, [requestCameraPermission, convertImageToBase64, selectedImages.length]);

  // Choose from gallery — appends to selectedImages (max 3)
  const handleChooseFromGallery = useCallback(async () => {
    if (selectedImages.length >= 3) {
      Alert.alert(t('chatbot.addPhoto'), 'You can add up to 3 photos.');
      return;
    }
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
        console.log('[Chatbot] Gallery image selected, converting to base64');
        const base64 = await convertImageToBase64(result.assets[0].uri);
        setSelectedImages((prev) => [...prev, base64].slice(0, 3));
        console.log('[Chatbot] Gallery image added, total images:', selectedImages.length + 1);
      }
    } catch (error) {
      console.error('[Chatbot] Error choosing photo:', error);
      Alert.alert(t('common.error'), t('chatbot.failedToChoosePhoto'));
    }
  }, [requestMediaLibraryPermission, convertImageToBase64, selectedImages.length]);

  // Handle photo selection
  const handleAddPhoto = useCallback(() => {
    console.log('[Chatbot] Add photo button pressed');
    Alert.alert(t('chatbot.addPhoto'), t('chatbot.choosePhotoSource'), [
      {
        text: t('chatbot.takePhoto'),
        onPress: handleTakePhoto,
      },
      {
        text: t('chatbot.chooseFromGallery'),
        onPress: handleChooseFromGallery,
      },
      {
        text: t('chatbot.cancel'),
        style: 'cancel',
      },
    ]);
  }, [handleTakePhoto, handleChooseFromGallery]);

  // Remove a specific photo by index
  const handleRemovePhoto = useCallback((index: number) => {
    console.log('[Chatbot] Remove photo at index:', index);
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Send a quick action or craving chip as a message
  const handleQuickSend = useCallback(
    (text: string) => {
      console.log('[Chatbot] Quick chip tapped:', text);
      setInputText(text);
      // Use a small timeout so inputText state is set before handleSend reads it
      setTimeout(() => {
        setInputText('');
        if (loading) return;

        if (!isPremium && !premiumLoading) {
          console.log('[Chatbot] Premium gate triggered via quick chip');
          const userMsg: MessageWithId = {
            id: generateMessageId(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
          };
          const gateMsg: MessageWithId = {
            id: generateMessageId(),
            role: 'assistant',
            content: t('chatbot.premiumGateMessage'),
            timestamp: Date.now(),
            showUpgradeButton: true,
          };
          setMessages((prev) => [...prev, userMsg, gateMsg]);
          return;
        }

        const userMessage: MessageWithId = {
          id: generateMessageId(),
          role: 'user',
          content: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);
        setLastUserMessage(text);

        // Fire the actual AI request
        const systemMessage: ChatMessage = {
          role: 'system',
          content: `You are a nutrition expert. Answer the user's question concisely and helpfully.`,
        };
        sendMessage({
          messages: [
            systemMessage,
            { role: 'user', content: text, timestamp: Date.now() },
          ],
          images: [],
          source: 'chatbot',
        }).then((result) => {
          if (!isMountedRef.current) return;
          if (result && result.message) {
            setMessages((prev) => [
              ...prev,
              {
                id: generateMessageId(),
                role: 'assistant',
                content: result.message,
                timestamp: Date.now(),
              },
            ]);
          }
        }).catch((err) => {
          console.error('[Chatbot] Quick chip send error:', err);
        });
      }, 0);
    },
    [loading, isPremium, premiumLoading, sendMessage]
  );

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
        const gramsFromAI = parseFloat(ing.quantity) || 100;
        const calories_per_100g = parseFloat(ing.calories_per_100g) || 0;
        const protein_per_100g = parseFloat(ing.protein_per_100g) || 0;
        const carbs_per_100g = parseFloat(ing.carbs_per_100g) || 0;
        const fat_per_100g = parseFloat(ing.fat_per_100g) || 0;
        const fiber_per_100g = parseFloat(ing.fiber_per_100g) || 0;

        // New fields: preferred_unit and unit_grams
        const preferred_unit: string | null = ing.preferred_unit || null;
        const unit_grams: number = parseFloat(ing.unit_grams) || 0;

        // Determine display unit and quantity
        let unit: string;
        let quantity: number;
        if (preferred_unit && unit_grams > 0) {
          unit = preferred_unit;
          quantity = Math.max(1, Math.round(gramsFromAI / unit_grams));
        } else {
          unit = ing.unit || 'g';
          quantity = gramsFromAI;
        }

        // Calculate actual macros from per-100g values and grams
        const gramsForCalc = unit === 'g' ? quantity : (unit_grams > 0 ? quantity * unit_grams : gramsFromAI);
        const ratio = gramsForCalc / 100;

        const calories = parseFloat(ing.calories) || Math.round(calories_per_100g * ratio);
        const protein = parseFloat(ing.protein) || Math.round(protein_per_100g * ratio * 10) / 10;
        const carbs = parseFloat(ing.carbs) || Math.round(carbs_per_100g * ratio * 10) / 10;
        const fats = parseFloat(ing.fats) || Math.round(fat_per_100g * ratio * 10) / 10;
        const fiber = parseFloat(ing.fiber) || Math.round(fiber_per_100g * ratio * 10) / 10;

        console.log('[Chatbot] Parsed ingredient:', ing.name, '| unit:', unit, '| quantity:', quantity, '| preferred_unit:', preferred_unit, '| unit_grams:', unit_grams);

        return {
          id: `ing-${Date.now()}-${index}`,
          name: ing.name || 'Unknown ingredient',
          quantity,
          unit,
          calories,
          protein,
          carbs,
          fats,
          fiber,
          included: true,
          calories_per_100g,
          protein_per_100g,
          carbs_per_100g,
          fat_per_100g,
          fiber_per_100g,
          id_confidence: ing.id_confidence || 'medium',
          model_portion_confidence: ing.model_portion_confidence || 'medium',
          nutrition_confidence: ing.nutrition_confidence || 'medium',
          overall_confidence: ing.overall_confidence || 'medium',
          grams_min: ing.grams_min,
          grams_max: ing.grams_max,
          nutrition_source: ing.nutrition_source,
          scale_verified: false,
          preferred_unit,
          unit_grams,
        };
      });

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
        scan_mode: mealData.scan_mode,
        detected_restaurant: mealData.detected_restaurant,
        packaging_ambiguous: mealData.packaging_ambiguous,
        packaging_candidates: mealData.packaging_candidates,
      };
    } catch (error) {
      console.error('[Chatbot] Error parsing meal data:', error);
      return null;
    }
  }, []);

  const handleSend = useCallback(async () => {
    const trimmedInput = inputText.trim();

    // Check if we have either text or images
    if (!trimmedInput && selectedImages.length === 0) {
      Alert.alert(t('chatbot.inputRequired'), t('chatbot.inputRequiredMessage'));
      return;
    }

    if (loading) return;

    // Determine the display message
    let displayMessage = trimmedInput;
    if (!displayMessage && selectedImages.length > 0) {
      displayMessage = t('chatbot.photoOfMeal');
    } else if (displayMessage && selectedImages.length > 0) {
      displayMessage = `${displayMessage} ${t('chatbot.withPhoto')}`;
    }

    // Premium gate — check on every message send
    if (!isPremium && !premiumLoading) {
      console.log('[Chatbot] Premium gate triggered — user is not premium');
      const userMsg: MessageWithId = {
        id: generateMessageId(),
        role: 'user',
        content: displayMessage,
        timestamp: Date.now(),
      };
      const gateMsg: MessageWithId = {
        id: generateMessageId(),
        role: 'assistant',
        content: t('chatbot.premiumGateMessage'),
        timestamp: Date.now(),
        showUpgradeButton: true,
      };
      setMessages((prev) => [...prev, userMsg, gateMsg]);
      setInputText('');
      return;
    }

    console.log('[Chatbot] Sending message to backend — isPremium:', isPremium, 'premiumLoading:', premiumLoading);
    console.log('[Chatbot] isMealEstimator:', isMealEstimator, 'images count:', selectedImages.length);

    const userMessage: MessageWithId = {
      id: generateMessageId(),
      role: 'user',
      content: displayMessage,
      timestamp: Date.now(),
    };

    setLastUserMessage(trimmedInput || t('chatbot.photoOfMeal'));

    if (isMountedRef.current) {
      setMessages((prev) => [...prev, userMessage]);
      setInputText('');
    }

    // Store images for this request, then clear
    const imagesToSend = [...selectedImages];
    setSelectedImages([]);

    try {
      const validMessages = messages.filter((m) => {
        return m && typeof m === 'object' && m.role && m.content && m.role !== 'system';
      });

      let apiMessages: ChatMessage[];

      if (isMealEstimator) {
        const systemMessage: ChatMessage = {
          role: 'system',
          content: `You are an expert nutrition analyst with vision capabilities and real-time web search access.

CRITICAL: You MUST ALWAYS respond with ONLY a JSON code block. No introductory text, no explanations before the JSON, no prose paragraphs. Your ENTIRE response must be:

1. A JSON code block (required, always first)
2. Optionally, a single SHORT sentence after the JSON block (max 1 line) mentioning the data source

NEVER write paragraphs, bullet lists, or explanations before or instead of the JSON.

## SCAN MODE — detect automatically:
- PLATE/RESTAURANT: Identify each dish component separately
- PACKAGED PRODUCT: Read the nutrition label if visible; otherwise use brand database
- TEXT DESCRIPTION: Parse the described foods

## NUTRITION RESOLUTION (in order):
1. Official restaurant/brand data (search web if needed)
2. USDA FoodData Central
3. Web search for nutrition data
4. Gemini knowledge estimate (mark confidence accordingly)

## REQUIRED JSON FORMAT:
\`\`\`json
{
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": number,
      "unit": "g",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number,
      "fiber": number,
      "calories_per_100g": number,
      "protein_per_100g": number,
      "carbs_per_100g": number,
      "fats_per_100g": number,
      "preferred_unit": "slice" or "piece" or "strip" or "egg" or "cup" or "tbsp" or null,
      "unit_grams": number,
      "confidence_portion": "high" or "medium" or "low",
      "confidence_nutrition": "high" or "medium" or "low",
      "confidence_id": "high" or "medium" or "low",
      "nutrition_source": "official" or "usda" or "web_search" or "estimate",
      "scale_verified": false
    }
  ]
}
\`\`\`

Rules:
- "quantity" is always in grams initially
- "preferred_unit": natural countable unit (slice=21g, large egg=50g, bacon strip=8g, oreo=11g, tbsp peanut butter=16g). null for rice/sauce/liquids.
- "unit_grams": grams per 1 preferred_unit. 0 if preferred_unit is null.
- All per_100g fields are REQUIRED — calculate them as: value / quantity * 100
- Break complex meals into individual ingredients
- Round all numbers to nearest integer
- Do NOT include citation markers like [1], [2], [3] in any text`,
        };

        let actualPrompt = trimmedInput;
        if (!actualPrompt && imagesToSend.length > 0) {
          actualPrompt = 'Analyze this meal photo. Return ONLY the JSON code block with nutritional breakdown. No introductory text.';
        }

        apiMessages = [
          systemMessage,
          ...validMessages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
          {
            role: 'user' as const,
            content: actualPrompt,
            timestamp: Date.now(),
          },
        ];
      } else {
        // Standard chatbot mode: send full system prompt
        const systemMessage: ChatMessage = {
          role: 'system',
          content: `You are a nutrition expert with real-time internet access. Your job is to provide accurate nutritional data for meals.

STEP 1 — SEARCH FIRST:
If the user mentions any specific restaurant, fast food chain, brand, or named menu item (e.g. "McDonald's Big Mac", "Starbucks Caramel Macchiato", "Chipotle chicken burrito bowl"), you MUST search the internet for the EXACT nutritional data from that restaurant's official menu or a reliable nutrition database. Use the most current data available. Do not guess or estimate for named products — find the real numbers.

STEP 2 — ESTIMATE IF GENERIC:
If the food is generic or homemade (e.g. "grilled chicken with rice", "a bowl of oatmeal"), provide an accurate, educated estimate based on standard USDA portion sizes and common cooking methods. Be realistic — do not over or underestimate.

STEP 3 — FORMAT YOUR RESPONSE:
Always respond in TWO parts:

1. A JSON code block with this exact format:

\`\`\`json
{
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": number,
      "unit": "g",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fats": number,
      "fiber": number,
      "preferred_unit": string or null,
      "unit_grams": number
    }
  ]
}
\`\`\`

Where:
- "quantity" is always in grams
- "preferred_unit" is the most natural countable unit for this food (e.g. "slice", "piece", "strip", "cup", "egg", "cookie", "tbsp"). Use null for foods with no natural countable unit (rice, sauce, liquid, mixed dishes).
- "unit_grams" is grams per 1 preferred_unit. Use 0 if preferred_unit is null. Examples: cheese slice=21, large egg=50, bacon strip=8, oreo cookie=11, tbsp peanut butter=16.

2. A brief natural language explanation mentioning whether the data came from an official source or is an estimate.

Break complex meals into individual ingredients. Be specific with portions. Round all numbers to the nearest integer.

Do NOT include citation markers, reference numbers, or footnotes such as [1], [2], [3], [4] etc. in your response. Write in plain prose only.`,
        };

        let actualPrompt = trimmedInput;
        if (!actualPrompt && imagesToSend.length > 0) {
          actualPrompt =
            'You are a precise nutrition expert with extensive knowledge of restaurant menus, fast food chains, and branded food products worldwide. When the user mentions a specific restaurant (McDonalds, Chipotle, Subway, etc.), brand, or menu item, use the ACTUAL nutritional data for that specific product — not a generic estimate. If the item is generic or homemade, provide a reasonable estimate based on standard portions.';
        }

        apiMessages = [
          systemMessage,
          ...validMessages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
          {
            role: 'user' as const,
            content: actualPrompt,
            timestamp: Date.now(),
          },
        ];
      }

      console.log('[Chatbot] Calling sendMessage with source:', isMealEstimator ? 'meal-estimator' : 'chatbot');

      // Send with images if available
      const result = await sendMessage({
        messages: apiMessages,
        images: imagesToSend,
        source: isMealEstimator ? 'meal-estimator' : 'chatbot',
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
          content: t('chatbot.errorMessage'),
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
        content: t('chatbot.errorMessage'),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  }, [inputText, selectedImages, loading, messages, sendMessage, parseMealData, isPremium, premiumLoading, isMealEstimator]);

  // Update ingredient quantity using per-100g values when available
  const handleQuantityChange = useCallback(
    (ingredientId: string, newQuantity: string) => {
      if (!latestEstimate) return;
      const quantity = parseFloat(newQuantity);
      if (isNaN(quantity) || quantity < 0) return;

      setLatestEstimate((prev) => {
        if (!prev) return prev;

        const updatedIngredients = prev.ingredients.map((ing) => {
          if (ing.id !== ingredientId) return ing;

          let calories, protein, carbs, fats, fiber;

          if (ing.unit === 'g' && ing.calories_per_100g > 0) {
            // Use per-100g values for precise recalculation
            const ratio = quantity / 100;
            calories = Math.round(ing.calories_per_100g * ratio);
            protein = Math.round(ing.protein_per_100g * ratio * 10) / 10;
            carbs = Math.round(ing.carbs_per_100g * ratio * 10) / 10;
            fats = Math.round(ing.fat_per_100g * ratio * 10) / 10;
            fiber = Math.round(ing.fiber_per_100g * ratio * 10) / 10;
          } else if (ing.unit !== 'g' && ing.unit_grams > 0 && ing.calories_per_100g > 0) {
            // Convert preferred_unit quantity to grams first, then use per-100g
            const gramsEquivalent = quantity * ing.unit_grams;
            const ratio = gramsEquivalent / 100;
            calories = Math.round(ing.calories_per_100g * ratio);
            protein = Math.round(ing.protein_per_100g * ratio * 10) / 10;
            carbs = Math.round(ing.carbs_per_100g * ratio * 10) / 10;
            fats = Math.round(ing.fat_per_100g * ratio * 10) / 10;
            fiber = Math.round(ing.fiber_per_100g * ratio * 10) / 10;
          } else {
            // Fallback: proportional scaling from original
            const originalQty = ing.quantity || 1;
            const ratio = quantity / originalQty;
            calories = Math.round(ing.calories * ratio);
            protein = Math.round(ing.protein * ratio * 10) / 10;
            carbs = Math.round(ing.carbs * ratio * 10) / 10;
            fats = Math.round(ing.fats * ratio * 10) / 10;
            fiber = Math.round(ing.fiber * ratio * 10) / 10;
          }

          return { ...ing, quantity, calories, protein, carbs, fats, fiber };
        });

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

  // Handle unit switch — convert quantity and recalculate macros
  const handleUnitChange = useCallback(
    (ingredientId: string, newUnit: string, newUnitGrams: number) => {
      console.log('[Chatbot] Unit changed for ingredient:', ingredientId, '→', newUnit, '(gramsPerUnit:', newUnitGrams, ')');
      if (!latestEstimate) return;

      setLatestEstimate((prev) => {
        if (!prev) return prev;

        const updatedIngredients = prev.ingredients.map((ing) => {
          if (ing.id !== ingredientId) return ing;

          const oldUnit = ing.unit;
          if (oldUnit === newUnit) return ing;

          // Convert quantity when switching units
          // First get current grams
          let currentGrams: number;
          if (oldUnit === 'g') {
            currentGrams = ing.quantity;
          } else if (oldUnit === 'oz') {
            currentGrams = ing.quantity * 28.35;
          } else {
            // preferred_unit
            currentGrams = ing.quantity * (ing.unit_grams > 0 ? ing.unit_grams : 1);
          }

          let newQuantity: number;
          if (newUnit === 'g') {
            newQuantity = Math.round(currentGrams);
          } else if (newUnit === 'oz') {
            newQuantity = Math.round((currentGrams / 28.35) * 10) / 10;
          } else {
            // preferred_unit
            const ugrams = newUnitGrams > 0 ? newUnitGrams : 1;
            newQuantity = Math.round((currentGrams / ugrams) * 10) / 10;
          }
          if (newQuantity <= 0) newQuantity = 1;

          // Recalculate macros
          let gramsForCalc: number;
          if (newUnit === 'g') {
            gramsForCalc = newQuantity;
          } else if (newUnit === 'oz') {
            gramsForCalc = newQuantity * 28.35;
          } else {
            gramsForCalc = newQuantity * (newUnitGrams > 0 ? newUnitGrams : 1);
          }

          let calories, protein, carbs, fats, fiber;
          if (ing.calories_per_100g > 0) {
            const ratio = gramsForCalc / 100;
            calories = Math.round(ing.calories_per_100g * ratio);
            protein = Math.round(ing.protein_per_100g * ratio * 10) / 10;
            carbs = Math.round(ing.carbs_per_100g * ratio * 10) / 10;
            fats = Math.round(ing.fat_per_100g * ratio * 10) / 10;
            fiber = Math.round(ing.fiber_per_100g * ratio * 10) / 10;
          } else {
            const originalQty = ing.quantity || 1;
            const ratio = newQuantity / originalQty;
            calories = Math.round(ing.calories * ratio);
            protein = Math.round(ing.protein * ratio * 10) / 10;
            carbs = Math.round(ing.carbs * ratio * 10) / 10;
            fats = Math.round(ing.fats * ratio * 10) / 10;
            fiber = Math.round(ing.fiber * ratio * 10) / 10;
          }

          // Keep unit_grams in sync: if switching back to preferred_unit, restore original unit_grams
          const updatedUnitGrams = newUnit === ing.preferred_unit ? ing.unit_grams : newUnitGrams;

          return { ...ing, unit: newUnit, quantity: newQuantity, unit_grams: updatedUnitGrams, calories, protein, carbs, fats, fiber };
        });

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

  // Toggle scale_verified for an ingredient
  const handleScaleVerify = useCallback((ingredientId: string) => {
    console.log('[Chatbot] Scale verify toggled for ingredient:', ingredientId);
    setLatestEstimate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ingredients: prev.ingredients.map((ing) =>
          ing.id === ingredientId ? { ...ing, scale_verified: !ing.scale_verified } : ing
        ),
      };
    });
  }, []);

  // Select a packaging candidate and apply its per-100g values to all ingredients
  const handleSelectCandidate = useCallback((candidate: PackagingCandidate) => {
    console.log('[Chatbot] Packaging candidate selected:', candidate.brand, candidate.name);
    setLatestEstimate((prev) => {
      if (!prev) return prev;

      const updatedIngredients = prev.ingredients.map((ing) => {
        const ratio = ing.unit === 'g' ? ing.quantity / 100 : 1;
        return {
          ...ing,
          calories_per_100g: candidate.calories_per_100g,
          protein_per_100g: candidate.protein_per_100g,
          carbs_per_100g: candidate.carbs_per_100g,
          fat_per_100g: candidate.fat_per_100g,
          fiber_per_100g: candidate.fiber_per_100g,
          calories: Math.round(candidate.calories_per_100g * ratio),
          protein: Math.round(candidate.protein_per_100g * ratio * 10) / 10,
          carbs: Math.round(candidate.carbs_per_100g * ratio * 10) / 10,
          fats: Math.round(candidate.fat_per_100g * ratio * 10) / 10,
          fiber: Math.round(candidate.fiber_per_100g * ratio * 10) / 10,
        };
      });

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
        packaging_ambiguous: false,
      };
    });
  }, []);

  /**
   * CRITICAL FIX: Handle "Log This Meal" / "Add to My Meal" button
   * Branch based on context:
   * - my_meals_builder: Add ingredients to My Meal draft and navigate back to Create Meal screen
   * - meal_log (or undefined): Log ingredients to diary and navigate back to Foods tab
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
      Alert.alert(t('chatbot.noIngredients'), t('chatbot.noIngredientsMessage'));
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
          Alert.alert(t('common.error'), t('common.loggedIn'));
          return;
        }

        console.log('[Chatbot] User ID:', user.id);

        // Add each included ingredient to the My Meal draft
        let successCount = 0;
        let failedIngredients: string[] = [];

        for (const ingredient of includedIngredients) {
          try {
            console.log('[Chatbot] Creating food entry for ingredient:', ingredient.name);

            // Use per-100g values if available, otherwise calculate from current values
            let per100gCalories, per100gProtein, per100gCarbs, per100gFats, per100gFiber;
            let servingGrams = 100;

            // Convert current quantity to grams
            const currentGrams = ingredient.unit === 'g'
              ? ingredient.quantity
              : ingredient.unit_grams > 0
                ? ingredient.quantity * ingredient.unit_grams
                : ingredient.quantity;

            if (ingredient.calories_per_100g > 0) {
              per100gCalories = ingredient.calories_per_100g;
              per100gProtein = ingredient.protein_per_100g;
              per100gCarbs = ingredient.carbs_per_100g;
              per100gFats = ingredient.fat_per_100g;
              per100gFiber = ingredient.fiber_per_100g;
            } else {
              // Fallback: calculate from current values
              const ratio = 100 / currentGrams;
              per100gCalories = ingredient.calories * ratio;
              per100gProtein = ingredient.protein * ratio;
              per100gCarbs = ingredient.carbs * ratio;
              per100gFats = ingredient.fats * ratio;
              per100gFiber = ingredient.fiber * ratio;
            }
            servingGrams = currentGrams;

            const foodPayload = {
              name: `${ingredient.name} (AI Estimated)`,
              serving_amount: 100,
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
            t('common.success'),
            t('chatbot.addedIngredientsToMeal', { count: successCount }),
            [
              {
                text: t('common.ok'),
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
            t('chatbot.partialSuccess'),
            t('chatbot.partialSuccessAddMessage', { count: successCount, total: includedIngredients.length, failed: failedIngredients.join(', ') }),
            [
              {
                text: t('common.ok'),
                onPress: () => {
                  console.log('[Chatbot] Navigating back to Create Meal screen');
                  router.back();
                },
              },
            ]
          );
        } else {
          console.error('[Chatbot] ❌ Failed to add any ingredients');
          Alert.alert(t('common.error'), t('chatbot.failedToAddIngredients'), [{ text: t('common.ok') }]);
        }
      } catch (error) {
        console.error('[Chatbot] Error adding ingredients to My Meal draft:', error);
        Alert.alert(t('common.error'), t('chatbot.failedToAddIngredients'));
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
          Alert.alert(t('common.error'), t('common.loggedIn'));
          return;
        }

        console.log('[Chatbot] User ID:', user.id);

        // CRITICAL: Validate mealType - if missing, throw error
        if (!mealType) {
          console.error('[Chatbot] ❌ CRITICAL ERROR: mealType is missing!');
          Alert.alert(t('common.error'), t('chatbot.mealTypeMissing'));
          return;
        }

        // Log each included ingredient as a separate food item
        let successCount = 0;
        let failedIngredients: string[] = [];

        for (const ingredient of includedIngredients) {
          try {
            console.log('[Chatbot] Creating food entry for ingredient:', ingredient.name);

            // Use per-100g values if available, otherwise calculate from current values
            let per100gCalories, per100gProtein, per100gCarbs, per100gFats, per100gFiber;
            let servingGrams = 100;

            // Convert current quantity to grams
            const currentGrams = ingredient.unit === 'g'
              ? ingredient.quantity
              : ingredient.unit_grams > 0
                ? ingredient.quantity * ingredient.unit_grams
                : ingredient.quantity;

            if (ingredient.calories_per_100g > 0) {
              per100gCalories = ingredient.calories_per_100g;
              per100gProtein = ingredient.protein_per_100g;
              per100gCarbs = ingredient.carbs_per_100g;
              per100gFats = ingredient.fat_per_100g;
              per100gFiber = ingredient.fiber_per_100g;
            } else {
              const ratio = 100 / currentGrams;
              per100gCalories = ingredient.calories * ratio;
              per100gProtein = ingredient.protein * ratio;
              per100gCarbs = ingredient.carbs * ratio;
              per100gFats = ingredient.fats * ratio;
              per100gFiber = ingredient.fiber * ratio;
            }
            servingGrams = currentGrams;

            // Create food entry with per-100g values
            const foodPayload = {
              name: `${ingredient.name} (AI Estimated)`,
              serving_amount: 100,
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

            // Log via RPC (atomic upsert meal + insert meal_item)
            console.log('[Chatbot] Calling log_food RPC for ingredient:', ingredient.name, 'date:', date, 'mealType:', mealType);
            const { data: rpcData, error: rpcError } = await supabase.rpc('log_food', {
              p_user_id: user.id,
              p_date: date,
              p_meal_type: mealType,
              p_food_id: foodData.id,
              p_food_item_id: null,
              p_quantity: 1,
              p_calories: ingredient.calories,
              p_protein: ingredient.protein,
              p_carbs: ingredient.carbs,
              p_fats: ingredient.fats,
              p_fiber: ingredient.fiber,
              p_serving_description: `${ingredient.quantity} ${ingredient.unit}`,
              p_grams: servingGrams,
              p_logged_at: new Date().toISOString(),
            });

            if (rpcError) {
              console.error('[Chatbot] Error calling log_food RPC for ingredient:', ingredient.name, rpcError);
              failedIngredients.push(ingredient.name);
              continue;
            }

            console.log('[Chatbot] ✅ log_food RPC success for ingredient:', ingredient.name, 'meal_id:', rpcData?.meal_id, 'meal_item_id:', rpcData?.meal_item_id);
            // AI-estimated foods are user_created — do not affect catalog popularity
            console.log('[Chatbot] Skipping logFoodUsage for AI-estimated ingredient:', ingredient.name);

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
            breakfast: t('common.breakfast'),
            lunch: t('common.lunch'),
            dinner: t('common.dinner'),
            snack: t('common.snack'),
          };
          
          Alert.alert(
            t('common.success'),
            t('chatbot.addedIngredientsToLog', { count: successCount, meal: mealLabels[mealType] || mealType }),
            [
              {
                text: t('common.ok'),
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
            t('chatbot.partialSuccess'),
            t('chatbot.partialSuccessAddMessage', { count: successCount, total: includedIngredients.length, failed: failedIngredients.join(', ') }),
            [
              {
                text: t('common.ok'),
                onPress: () => {
                  console.log('[Chatbot] ✅ CRITICAL FIX: Navigating back to close AI Meal Estimator');
                  router.back();
                },
              },
            ]
          );
        } else {
          console.error('[Chatbot] ❌ Failed to log any ingredients');
          Alert.alert(t('common.error'), t('chatbot.failedToLogIngredients'), [
            { text: t('common.ok') },
          ]);
        }
      } catch (error) {
        console.error('[Chatbot] Error logging meal:', error);
        Alert.alert(t('common.error'), t('chatbot.failedToLogMeal'));
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
  const buttonText = context === 'my_meals_builder' ? t('chatbot.addToMyMeal') : t('chatbot.logThisMeal');

  // Show quick action cards only in the welcome/empty state (just the initial greeting)
  const isWelcomeState = validMessages.length === 1 && validMessages[0].role === 'assistant';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
        <TouchableOpacity onPress={() => {
          console.log('[Chatbot] Back button pressed');
          router.back();
        }} style={styles.backButton}>
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
            {t('chatbot.title')}
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
                    {message.showUpgradeButton && (
                      <TouchableOpacity
                        style={styles.goPremiumButton}
                        onPress={() => {
                          console.log('[Chatbot] Go Premium button pressed — navigating to /subscription');
                          router.push('/subscription');
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.goPremiumButtonText}>{t('chatbot.upgrade')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('chatbot.noMessages')}
              </Text>
            </View>
          )}

          {/* Quick action cards — welcome state only */}
          {isWelcomeState && !loading && !isMealEstimator && (
            <View style={styles.quickActionsContainer}>
              <Text style={[styles.quickActionsLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('chatbot.tryAsking')}
              </Text>
              <View style={styles.quickActionsGrid}>
                {QUICK_ACTION_CARDS.map((card) => (
                  <TouchableOpacity
                    key={card}
                    style={[styles.quickActionChip, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border }]}
                    onPress={() => handleQuickSend(card)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickActionChipText, { color: isDark ? colors.textDark : colors.text }]}>
                      {card}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {loading && (
            <View style={styles.loadingWrapper}>
              <View style={[styles.loadingBubble, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                >
                  {t('chatbot.analyzingMeal')}
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
                  {t('chatbot.mealTotals')}
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
                      {t('common.protein')}
                    </Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {latestEstimate.totalCarbs}g
                    </Text>
                    <Text
                      style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                    >
                      {t('common.carbs')}
                    </Text>
                  </View>
                  <View style={styles.totalItem}>
                    <Text style={[styles.totalValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {latestEstimate.totalFats}g
                    </Text>
                    <Text
                      style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                    >
                      {t('common.fats')}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Ingredients List */}
              <View style={[styles.ingredientsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                <Text style={[styles.ingredientsTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('chatbot.ingredients')}
                </Text>
                <Text
                  style={[styles.ingredientsSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                >
                  {t('chatbot.adjustQuantities')}
                </Text>

                {latestEstimate.ingredients.map((ingredient) => {
                  const confidenceEmojiVal = confidenceEmoji(ingredient.overall_confidence);
                  const isExpanded = expandedConfidenceId === ingredient.id;
                  const scaleVerifiedColor = ingredient.scale_verified
                    ? '#22c55e'
                    : isDark
                    ? colors.textSecondaryDark
                    : colors.textSecondary;
                  const scaleVerifiedText = ingredient.scale_verified ? '✓ Weight verified' : 'Verify weight';
                  const confidenceToggleText = isExpanded ? '▲ Hide details' : '▼ Why this estimate?';
                  const gramsRangeText = ingredient.grams_min && ingredient.grams_max
                    ? `Range: ${ingredient.grams_min}–${ingredient.grams_max}g`
                    : null;
                  const sourceUrl = ingredient.nutrition_source?.source_url ?? null;
                  const sourceName = ingredient.nutrition_source?.source_name ?? null;
                  const confidenceDetailText = `🔍 ID: ${ingredient.id_confidence} · ⚖️ Portion: ${ingredient.model_portion_confidence} · 📊 Nutrition: ${ingredient.nutrition_confidence}`;

                  // Build unit options for this ingredient
                  const unitOptions: { key: string; label: string; gramsPerUnit: number }[] = [];
                  if (ingredient.preferred_unit && ingredient.unit_grams > 0 && ingredient.preferred_unit !== 'g' && ingredient.preferred_unit !== 'oz') {
                    unitOptions.push({ key: ingredient.preferred_unit, label: ingredient.preferred_unit, gramsPerUnit: ingredient.unit_grams });
                  }
                  unitOptions.push({ key: 'g', label: 'g', gramsPerUnit: 1 });
                  unitOptions.push({ key: 'oz', label: 'oz', gramsPerUnit: 28.35 });

                  const quantityDisplay = Number.isInteger(ingredient.quantity)
                    ? ingredient.quantity.toString()
                    : ingredient.quantity.toFixed(1);

                  return (
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
                        onPress={() => {
                          console.log('[Chatbot] Toggle ingredient:', ingredient.name);
                          handleToggleIngredient(ingredient.id);
                        }}
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
                        {/* Name row with confidence emoji */}
                        <View style={styles.ingredientNameRow}>
                          <Text style={[styles.ingredientName, { color: isDark ? colors.textDark : colors.text, flex: 1 }]}>
                            {ingredient.name}
                          </Text>
                          <Text style={{ fontSize: 16 }}>{confidenceEmojiVal}</Text>
                        </View>

                        {/* Quantity row: qty  unit▾ */}
                        <View style={styles.ingredientQuantityRow}>
                          <TextInput
                            style={[
                              styles.quantityInput,
                              {
                                borderColor: isDark ? colors.borderDark : colors.border,
                                color: isDark ? colors.textDark : colors.text,
                                backgroundColor: isDark ? colors.cardDark : colors.card,
                              },
                            ]}
                            value={quantityDisplay}
                            onChangeText={(val) => {
                              console.log('[Chatbot] Quantity text changed for', ingredient.name, ':', val);
                              handleQuantityChange(ingredient.id, val);
                            }}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                          />

                          <TouchableOpacity
                            style={[styles.unitPill, { borderColor: isDark ? colors.borderDark : colors.border, backgroundColor: isDark ? colors.cardDark : colors.card }]}
                            onPress={() => {
                              console.log('[Chatbot] Unit picker pressed for', ingredient.name, 'current unit:', ingredient.unit);
                              Alert.alert(
                                'Select unit',
                                undefined,
                                [
                                  ...unitOptions.map((opt) => ({
                                    text: opt.key === ingredient.unit ? `✓ ${opt.label}` : opt.label,
                                    onPress: () => {
                                      console.log('[Chatbot] Unit selected for', ingredient.name, '→', opt.key);
                                      handleUnitChange(ingredient.id, opt.key, opt.gramsPerUnit);
                                    },
                                  })),
                                  { text: 'Cancel', style: 'cancel' as const },
                                ]
                              );
                            }}
                          >
                            <Text style={[styles.unitPillText, { color: isDark ? colors.textDark : colors.text }]}>
                              {ingredient.unit}
                            </Text>
                            <Text style={[styles.unitPillChevron, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>▾</Text>
                          </TouchableOpacity>
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

                        {/* Nutrition source label */}
                        {sourceName !== null && (
                          <Text style={[styles.sourceLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                            {'📊 '}
                            {sourceName}
                          </Text>
                        )}

                        {/* "Why this estimate?" toggle */}
                        <TouchableOpacity
                          onPress={() => {
                            console.log('[Chatbot] Confidence toggle for ingredient:', ingredient.name);
                            setExpandedConfidenceId(isExpanded ? null : ingredient.id);
                          }}
                        >
                          <Text style={{ color: colors.primary, fontSize: 12 }}>
                            {confidenceToggleText}
                          </Text>
                        </TouchableOpacity>

                        {/* Expanded confidence detail */}
                        {isExpanded && (
                          <View style={styles.confidenceDetail}>
                            <Text style={styles.confidenceDetailText}>
                              {confidenceDetailText}
                            </Text>
                            {gramsRangeText !== null && (
                              <Text style={styles.confidenceDetailText}>
                                {gramsRangeText}
                              </Text>
                            )}
                            {sourceUrl !== null && (
                              <Text style={styles.confidenceDetailText} numberOfLines={1}>
                                {'Source: '}
                                {sourceUrl}
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Scale verified toggle */}
                        <TouchableOpacity
                          style={styles.scaleVerifyButton}
                          onPress={() => handleScaleVerify(ingredient.id)}
                        >
                          <IconSymbol
                            ios_icon_name={ingredient.scale_verified ? 'checkmark.seal.fill' : 'checkmark.seal'}
                            android_material_icon_name={ingredient.scale_verified ? 'verified' : 'verified_outlined'}
                            size={16}
                            color={scaleVerifiedColor}
                          />
                          <Text style={{ fontSize: 12, color: scaleVerifiedColor }}>
                            {scaleVerifiedText}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Packaging ambiguity selector */}
              {latestEstimate.packaging_ambiguous && latestEstimate.packaging_candidates && (
                <View style={[styles.ambiguityCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                  <Text style={[styles.ambiguityTitle, { color: isDark ? colors.textDark : colors.text }]}>
                    🔍 Multiple products found — which one?
                  </Text>
                  {latestEstimate.packaging_candidates.map((candidate, idx) => {
                    const candidateLabel = `${candidate.brand} ${candidate.name}`;
                    const candidateMacroText = `${candidate.calories_per_100g} kcal/100g · P:${candidate.protein_per_100g}g · C:${candidate.carbs_per_100g}g · F:${candidate.fat_per_100g}g`;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.candidateRow, { borderColor: isDark ? colors.borderDark : colors.border }]}
                        onPress={() => {
                          console.log('[Chatbot] Packaging candidate selected:', candidateLabel);
                          handleSelectCandidate(candidate);
                        }}
                      >
                        <Text style={[styles.candidateName, { color: isDark ? colors.textDark : colors.text }]}>
                          {candidateLabel}
                        </Text>
                        <Text style={[styles.candidateMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          {candidateMacroText}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Log Meal Button - CRITICAL: Dynamic text based on context */}
              <TouchableOpacity
                style={[styles.logMealButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  console.log('[Chatbot] Log meal button pressed, context:', context);
                  handleLogMeal();
                }}
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

        {/* Craving chips — always visible above input, hidden in meal estimator mode */}
        {!isMealEstimator && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.cravingChipsScroll, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
            contentContainerStyle={styles.cravingChipsContent}
          >
            {CRAVING_CHIPS.map((chip) => (
              <TouchableOpacity
                key={chip}
                style={[styles.cravingChip, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border }]}
                onPress={() => handleQuickSend(chip)}
                activeOpacity={0.7}
              >
                <Text style={[styles.cravingChipText, { color: isDark ? colors.textDark : colors.text }]}>
                  {chip}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={[styles.inputContainer, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          {/* Multi-image thumbnails */}
          {selectedImages.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageThumbnailsScroll}>
              {selectedImages.map((img, idx) => (
                <View key={idx} style={styles.imageThumbnailWrapper}>
                  <Image source={{ uri: img }} style={styles.imageThumbnail} resizeMode="cover" />
                  <TouchableOpacity style={styles.removeThumbnailButton} onPress={() => handleRemovePhoto(idx)}>
                    <IconSymbol
                      ios_icon_name="xmark.circle.fill"
                      android_material_icon_name="cancel"
                      size={20}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                </View>
              ))}
              {selectedImages.length < 3 && (
                <TouchableOpacity
                  style={[styles.addMorePhotoButton, { borderColor: colors.primary }]}
                  onPress={handleAddPhoto}
                >
                  <IconSymbol
                    ios_icon_name="plus"
                    android_material_icon_name="add"
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={{ color: colors.primary, fontSize: 11, marginTop: 2 }}>Add</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
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
              placeholder={t('chatbot.placeholder')}
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
                    (inputText.trim() || selectedImages.length > 0) && !loading
                      ? colors.primary
                      : colors.border,
                },
              ]}
              onPress={() => {
                console.log('[Chatbot] Send button pressed, text length:', inputText.trim().length, 'images:', selectedImages.length);
                handleSend();
              }}
              disabled={(!inputText.trim() && selectedImages.length === 0) || loading}
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
  ingredientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  ingredientName: {
    ...typography.bodyBold,
  },
  ingredientQuantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: 6,
  },
  quantityInput: {
    flex: 1,
    minWidth: 80,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    textAlign: 'center',
  },
  unitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    gap: 3,
    marginLeft: 2,
  },
  unitPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  unitPillChevron: {
    fontSize: 10,
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
  sourceLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  confidenceDetail: {
    marginTop: 4,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  confidenceDetailText: {
    fontSize: 11,
    marginBottom: 2,
  },
  scaleVerifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  ambiguityCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  ambiguityTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  candidateRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  candidateName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  candidateMacros: {
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
  imageThumbnailsScroll: {
    marginBottom: 8,
  },
  imageThumbnailWrapper: {
    position: 'relative',
    marginRight: 8,
  },
  imageThumbnail: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  removeThumbnailButton: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  addMorePhotoButton: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
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
  goPremiumButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  goPremiumButtonText: {
    ...typography.bodyBold,
    color: '#FFFFFF',
    fontSize: 14,
  },
  quickActionsContainer: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  quickActionsLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickActionChip: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  quickActionChipText: {
    ...typography.body,
    fontSize: 14,
  },
  cravingChipsScroll: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cravingChipsContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  cravingChip: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  cravingChipText: {
    ...typography.caption,
    fontSize: 13,
  },
});
