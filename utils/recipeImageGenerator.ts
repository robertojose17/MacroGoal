import { SUPABASE_ANON_KEY } from '@/lib/supabase/client';
import { supabase } from '@/lib/supabase/client';

const RECIPE_FINDER_URL = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/recipe-finder';

// In-memory set to avoid duplicate concurrent requests
const inFlight = new Set<string>();

export async function ensureRecipeImage(recipeId: string): Promise<string | null> {
  if (inFlight.has(recipeId)) return null;
  inFlight.add(recipeId);
  console.log('[RecipeImage] Generating image for recipe:', recipeId);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const anonKey = SUPABASE_ANON_KEY;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': session?.access_token ? `Bearer ${session.access_token}` : `Bearer ${anonKey}`,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${RECIPE_FINDER_URL}?type=generate-image&id=${recipeId}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn('[RecipeImage] generate-image failed — status:', res.status, 'recipe:', recipeId);
      return null;
    }
    const data = await res.json();
    const imageUrl = data.image_url ?? null;
    console.log('[RecipeImage] Image generated successfully for recipe:', recipeId, '— url:', imageUrl);
    return imageUrl;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.warn('[RecipeImage] generate-image timed out for recipe:', recipeId);
    } else {
      console.warn('[RecipeImage] generate-image error for recipe:', recipeId, '—', e?.message);
    }
    return null;
  } finally {
    inFlight.delete(recipeId);
  }
}
