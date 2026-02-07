
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './types';
import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

// CRITICAL: Use safe defaults for environment variables
const SUPABASE_URL = "https://esgptfiofoaeguslgvcq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZ3B0ZmlvZm9hZWd1c2xndmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDI4NjcsImV4cCI6MjA3OTExODg2N30.iC4P3lp4fJHLsYNWBwHwFwGP-WZuJONETOYd2q1lQWA";

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('[Supabase] ❌ CRITICAL: Missing Supabase credentials');
  console.error('[Supabase] URL:', SUPABASE_URL ? 'present' : 'MISSING');
  console.error('[Supabase] Key:', SUPABASE_PUBLISHABLE_KEY ? 'present' : 'MISSING');
}

console.log('[Supabase] ========================================');
console.log('[Supabase] STEP 1: VERIFY MOBILE IS USING CORRECT PROJECT');
console.log('[Supabase] ========================================');
console.log('[Supabase] Full URL:', SUPABASE_URL);
console.log('[Supabase] Anon Key (last 6 chars):', SUPABASE_PUBLISHABLE_KEY.slice(-6));
console.log('[Supabase] Project ID from URL:', SUPABASE_URL.split('//')[1]?.split('.')[0]);
console.log('[Supabase] ========================================');

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Enable deep link detection
  },
})

console.log('[Supabase] ✅ Client initialized successfully');

// Table name constants - USE THESE EVERYWHERE
export const TABLE_SAVED_MEALS = "saved_meals";
export const TABLE_SAVED_MEAL_ITEMS = "saved_meal_items";

console.log('[Supabase] Table constants defined:');
console.log('[Supabase]   - TABLE_SAVED_MEALS:', TABLE_SAVED_MEALS);
console.log('[Supabase]   - TABLE_SAVED_MEAL_ITEMS:', TABLE_SAVED_MEAL_ITEMS);

// Database initialization function
export async function initializeDatabase() {
  console.log('[Supabase] ========================================');
  console.log('[Supabase] STEP 2: VERIFY TABLES EXIST');
  console.log('[Supabase] ========================================');
  
  try {
    // Test if saved_meals table exists by trying to query it
    console.log('[Supabase] Testing if saved_meals table exists...');
    const { data: testMeals, error: mealsError } = await supabase
      .from(TABLE_SAVED_MEALS)
      .select('id')
      .limit(1);
    
    if (mealsError) {
      console.error('[Supabase] ❌ saved_meals table ERROR:', mealsError.message);
      console.error('[Supabase] Error code:', mealsError.code);
      
      if (mealsError.code === '42P01' || mealsError.message.includes('does not exist') || mealsError.message.includes('not found in the schema cache')) {
        console.error('[Supabase] ========================================');
        console.error('[Supabase] ❌ CRITICAL: saved_meals TABLE DOES NOT EXIST');
        console.error('[Supabase] ========================================');
        console.error('[Supabase] The saved_meals table is missing from the database.');
        console.error('[Supabase] You MUST run the migration SQL to create it.');
        console.error('[Supabase] ');
        console.error('[Supabase] TO FIX THIS:');
        console.error('[Supabase] 1. Go to Supabase Dashboard → SQL Editor');
        console.error('[Supabase] 2. Copy the SQL from MY_MEALS_TABLE_CREATION.sql');
        console.error('[Supabase] 3. Paste and run it');
        console.error('[Supabase] 4. Restart the app');
        console.error('[Supabase] ========================================');
        return false;
      }
    } else {
      console.log('[Supabase] ✅ saved_meals table exists');
    }
    
    // Test if saved_meal_items table exists
    console.log('[Supabase] Testing if saved_meal_items table exists...');
    const { data: testItems, error: itemsError } = await supabase
      .from(TABLE_SAVED_MEAL_ITEMS)
      .select('id')
      .limit(1);
    
    if (itemsError) {
      console.error('[Supabase] ❌ saved_meal_items table ERROR:', itemsError.message);
      console.error('[Supabase] Error code:', itemsError.code);
      
      if (itemsError.code === '42P01' || itemsError.message.includes('does not exist') || itemsError.message.includes('not found in the schema cache')) {
        console.error('[Supabase] ========================================');
        console.error('[Supabase] ❌ CRITICAL: saved_meal_items TABLE DOES NOT EXIST');
        console.error('[Supabase] ========================================');
        console.error('[Supabase] The saved_meal_items table is missing from the database.');
        console.error('[Supabase] You MUST run the migration SQL to create it.');
        console.error('[Supabase] ========================================');
        return false;
      }
    } else {
      console.log('[Supabase] ✅ saved_meal_items table exists');
    }
    
    console.log('[Supabase] ========================================');
    console.log('[Supabase] ✅ ALL TABLES VERIFIED');
    console.log('[Supabase] ========================================');
    return true;
  } catch (error) {
    console.error('[Supabase] ❌ Unexpected error during database initialization:', error);
    return false;
  }
}
