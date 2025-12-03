
# AI Chatbot Integration Complete

## Overview
Successfully integrated an AI-powered chatbot using OpenRouter API into the Elite Macro Tracker app.

## What Was Added

### 1. Supabase Edge Function
- **Function Name**: `chatbot`
- **Location**: Deployed to Supabase Edge Functions
- **Purpose**: Handles secure server-side communication with OpenRouter API
- **Features**:
  - User authentication via Supabase Auth
  - Conversation history support
  - Configurable model, temperature, and max_tokens
  - Error handling and logging
  - Uses OPENROUTER_API_KEY environment variable

### 2. React Hook
- **File**: `hooks/useChatbot.ts`
- **Purpose**: Provides a clean interface for components to interact with the chatbot
- **Features**:
  - State management (idle, loading, success, error)
  - Message sending with conversation history
  - Abort capability for canceling requests
  - TypeScript types for type safety

### 3. Chatbot Screen
- **File**: `app/(tabs)/chatbot.tsx`
- **Purpose**: Full-featured chat interface
- **Features**:
  - Clean, modern chat UI with message bubbles
  - User and assistant message differentiation
  - Timestamp display
  - Loading indicator while waiting for responses
  - Keyboard-aware scrolling
  - Auto-scroll to latest message
  - Dark mode support
  - System message for context (nutrition assistant)

### 4. Navigation Integration
- **Updated Files**: 
  - `app/(tabs)/_layout.tsx`
  - `app/(tabs)/_layout.ios.tsx`
- **Changes**: Added "AI Chat" tab with sparkles icon
- **Position**: Between Home and Profile tabs

## How It Works

1. **User sends a message** in the chat interface
2. **Message is added** to local conversation history
3. **Hook calls** the Supabase Edge Function with:
   - System message (defines assistant role)
   - Full conversation history
   - New user message
4. **Edge Function**:
   - Authenticates the user
   - Calls OpenRouter API with the conversation
   - Returns the AI response
5. **Response is displayed** in the chat interface

## Configuration

### Environment Variables
The following environment variable must be set in Supabase:
- `OPENROUTER_API_KEY`: Your OpenRouter API key

### Model Configuration
Default model: `openai/gpt-4o-mini`
- Can be changed in the Edge Function
- Can be overridden per request via the hook

### System Prompt
The chatbot is configured as a nutrition and fitness assistant:
```
You are a helpful nutrition and fitness assistant for Elite Macro Tracker app. 
Provide concise, accurate advice about nutrition, meal planning, macros, and fitness. 
Be friendly and supportive.
```

## Usage

Users can access the chatbot in two ways:
1. **Main Navigation**: Tap the "AI Chat" tab in the bottom navigation
2. **Direct Access**: Navigate to the chatbot screen from anywhere in the app

## Features

### Conversation Management
- Full conversation history maintained
- Messages include timestamps
- Scrolls automatically to latest message

### User Experience
- Loading indicator while AI is thinking
- Error handling with user-friendly messages
- Disabled input while processing
- Character limit (500 chars) for messages
- Multiline input support

### Visual Design
- Message bubbles with different colors for user/assistant
- Timestamps in subtle gray
- Primary color for user messages
- Card color for assistant messages
- Smooth animations and transitions
- Dark mode support

## Technical Details

### API Communication
- Uses Supabase Functions client
- Authenticated requests only
- JSON request/response format
- Error handling at multiple levels

### Performance
- Efficient message rendering
- Optimized scrolling
- Abort capability to cancel long requests

### Security
- API key stored securely in Supabase
- Server-side API calls only
- User authentication required
- No API key exposure to client

## Future Enhancements

Possible improvements:
- Message persistence (save chat history to database)
- Multiple conversation threads
- Voice input support
- Image sharing in chat
- Suggested prompts/quick replies
- Export chat history
- Typing indicators
- Read receipts
- Message reactions

## Testing

To test the chatbot:
1. Launch the app
2. Tap the "AI Chat" tab
3. Type a message about nutrition or fitness
4. Wait for the AI response
5. Continue the conversation

Example prompts:
- "What are good sources of protein?"
- "How many calories should I eat to lose weight?"
- "What's a good macro split for muscle gain?"
- "Can you suggest a high-protein breakfast?"

## Notes

- The chatbot uses OpenRouter, which provides access to multiple AI models
- Conversation history is maintained in-memory (resets on app restart)
- The system prompt can be customized for different use cases
- Response time depends on OpenRouter API and selected model
