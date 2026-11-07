import type { Tables, TablesInsert, TablesUpdate } from '../../lib/supabase/types';
import type { OpenFoodFactsProduct } from '../../utils/openFoodFacts';
import { createManualRecoverySave } from '../../utils/manualRecoverySave';
import { buildSyntheticOffData } from '../../utils/servingParser';
import { foodJsonSnapshot, savedMealForFoodDetails, savedMealFoodUpdate } from '../../utils/foodPersistence';

type ManualFoodPayload = Pick<Tables<'foods'>, 'name' | 'brand' | 'serving_amount' | 'serving_unit' | 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber' | 'user_created' | 'created_by'>;
export async function checkFoodPersistenceContracts(food: Tables<'foods'>, saved: Tables<'saved_meal_items'>, catalog: Tables<'food_items'>) {
  const result = await createManualRecoverySave<ManualFoodPayload, Tables<'foods'>>()('owner', food, {
    async insert(payload) {
      const insert: TablesInsert<'foods'> = payload;
      return {data: {...food, ...insert}};
    },
    async read() { return {data: food}; },
  });
  const id: string = result.id;
  const name: string = result.name;
  const nullableBrand: string | null = result.brand;
  const display = savedMealForFoodDetails(saved);
  const nullableFat: number | null = display.fats;
  const update: TablesUpdate<'saved_meal_items'> = savedMealFoodUpdate({quantity:0.5,grams:79,servingDescription:'0.5 cup (79 g)',calories:103,protein:2,carbs:22,fats:0.3,fiber:0});
  // Only adapter-supported fields are provided: arbitrary JSONB nutriments need runtime validation.
  const {nutriments: _nutriments, ...columns} = catalog;
  const product: OpenFoodFactsProduct = buildSyntheticOffData(columns);
  const diarySnapshot: TablesUpdate<'meal_items'> = {off_data: foodJsonSnapshot(product)};
  return {id, name, nullableBrand, nullableFat, update, diarySnapshot};
}
