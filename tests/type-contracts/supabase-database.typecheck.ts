// Compile-only contract. This function is never invoked or bundled by the app.
// Run through the absolute application typecheck with the locked SDK installed.
import type { QueryData, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables, TablesInsert, TablesUpdate } from '../../lib/supabase/types';

type Assert<T extends true> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;

export type DatabaseContracts = [
  Assert<IsAny<Tables<'goals'>> extends false ? true : false>,
  Assert<IsNever<Tables<'goals'>> extends false ? true : false>,
  Assert<string extends keyof Database['public']['Tables'] ? false : true>,
  Assert<string extends keyof Database['public']['Functions'] ? false : true>,
  Assert<Tables<'goals'>['daily_calories'] extends number ? true : false>,
  Assert<null extends Tables<'goals'>['is_active'] ? true : false>,
];

export function checkDatabaseClientContract(client: SupabaseClient<Database>) {
  const meal: TablesInsert<'meals'> = {
    user_id: '00000000-0000-0000-0000-000000000001',
    date: '2026-11-07',
    meal_type: 'breakfast',
  };
  const goalUpdate: TablesUpdate<'goals'> = { daily_calories: 2000, fats_g: 65 };
  client.from('meals').insert(meal);
  client.from('goals').update(goalUpdate);
  client.from('saved_meals').select('id, name');
  client.from('saved_meal_items').select('id, calories');
  client.rpc('search_foods_ranked', { p_query: 'apple', p_limit: 5 });

  const mealsWithItems = client.from('meals').select('id, meal_items(calories, protein)');
  type MealWithItems = QueryData<typeof mealsWithItems>[number];
  const checkJoin = (row: MealWithItems): number =>
    row.meal_items.reduce((sum, item) => sum + item.calories + item.protein, 0);

  // @ts-expect-error Unknown relations must remain rejected by the SDK.
  client.from('__not_a_macrogoal_table__');
  // @ts-expect-error The real relation requires user_id, date, and meal_type.
  client.from('meals').insert({ date: '2026-11-07' });
  // @ts-expect-error Numeric macros must not silently accept arbitrary strings.
  client.from('goals').update({ daily_calories: 'two thousand' });
  // @ts-expect-error The real goals column is fats_g, not fat_g.
  client.from('goals').update({ fat_g: 65 });
  // @ts-expect-error Unknown RPCs must remain rejected by the SDK.
  client.rpc('__not_a_macrogoal_rpc__');
  // @ts-expect-error The search RPC requires a string query.
  client.rpc('search_foods_ranked', { p_query: 123 });
  return checkJoin;
}
