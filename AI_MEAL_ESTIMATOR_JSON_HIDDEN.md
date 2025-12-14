
# AI Meal Estimator - JSON Hidden from Chat

## Summary

Successfully updated the AI Meal Estimator to hide JSON output from the visible chat while keeping it available for internal UI consumption.

## What Changed

### 1. Edge Function (`supabase/functions/chatbot/index.ts`)

**New Function: `extractJsonAndDescription()`**
- Extracts JSON from AI response (looks for code blocks or raw JSON)
- Separates the natural language description from the JSON
- Returns both separately

**Response Format Changed:**
```typescript
// OLD format
{
  message: "Full AI response with JSON and text",
  model: "...",
  duration_ms: 123
}

// NEW format
{
  message: "Only natural language description",  // Displayed in chat
  mealData: { ingredients: [...] },              // Used by UI (hidden)
  model: "...",
  duration_ms: 123
}
```

### 2. Hook (`hooks/useChatbot.ts`)

**Updated `ChatbotResult` type:**
```typescript
export type ChatbotResult = {
  message: string;
  mealData?: any;  // NEW: Structured meal data
  model: string;
  duration_ms: number;
};
```

**Added logging:**
- Now logs whether meal data was found in the response
- Helps with debugging

### 3. Chatbot Screen (`app/chatbot.tsx`)

**Removed:** `parseAIEstimate()` function (old text parsing logic)

**Added:** `parseMealData()` function
- Simpler function that just processes the pre-extracted JSON
- No longer needs to parse text or look for JSON patterns

**Updated message handling:**
```typescript
// Display only the natural language description
const assistantMessage: MessageWithId = {
  id: generateMessageId(),
  role: 'assistant',
  content: result.message,  // Only the description
  timestamp: Date.now(),
};

// Parse meal data separately (not displayed)
if (result.mealData) {
  const estimate = parseMealData(result.mealData, ...);
  setLatestEstimate(estimate);
}
```

## User Experience

### Before
User sees:
```
```json
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
```

A medium McFlurry from McDonald's contains around 510 calories...
```

### After
User sees:
```
A medium McFlurry from McDonald's contains around 510 calories, 12g protein, 70g carbs, 22g fat, and 1g fiber.
```

The JSON is still there internally, powering:
- Meal Totals card
- Ingredients list with checkboxes
- Quantity adjustments
- Macro calculations

## System Prompt

The AI is still instructed to provide both:
1. JSON in a code block (for data extraction)
2. Natural language explanation (for display)

Example prompt instruction:
```
You MUST respond in TWO parts:

1. First, provide a JSON object in a code block...
2. Then, provide a natural language explanation...
```

## Testing

To test:
1. Open AI Meal Estimator
2. Describe a meal (e.g., "medium McFlurry")
3. Verify:
   - ✅ Chat shows only natural language
   - ✅ No JSON, code blocks, or curly braces visible
   - ✅ Meal Totals card appears with correct values
   - ✅ Ingredients list appears with correct data
   - ✅ Can adjust quantities and toggle ingredients
   - ✅ Can log the meal successfully

## Edge Function Deployment

- **Function:** `chatbot`
- **Version:** 18
- **Status:** ACTIVE ✅
- **Deployed:** Successfully

## Benefits

1. **Cleaner UX:** Users see only human-readable text
2. **Same Functionality:** All features still work (totals, ingredients, logging)
3. **Better Separation:** Clear distinction between display and data
4. **More Robust:** JSON parsing happens server-side, reducing client errors
5. **Easier Debugging:** Separate logging for JSON extraction vs display

## Notes

- The AI might occasionally not provide JSON (e.g., for general questions)
- In that case, `mealData` will be `null` and no ingredient cards appear
- The natural language response is always displayed
- This is the expected behavior for non-meal-estimation queries
