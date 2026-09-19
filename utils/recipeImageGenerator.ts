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
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZ3B0Zmlvb2ZhZWd1c2xndmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI0MjU2NTMsImV4cCI6MjA1ODAwMTY1M30.5omSMBLWMD5lFNMkMPSqHOBMpjHpDDa4434JHkpMpPk';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    } else {
      headers['Authorization'] = anonKey;
    }

    const res = await fetch(`${RECIPE_FINDER_URL}?type=generate-image&id=${recipeId}`, { headers });
    if (!res.ok) {
      console.warn('[RecipeImage] generate-image failed — status:', res.status, 'recipe:', recipeId);
      return null;
    }
    const data = await res.json();
    const imageUrl = data.image_url ?? null;
    console.log('[RecipeImage] Image generated successfully for recipe:', recipeId, '— url:', imageUrl);
    return imageUrl;
  } catch (e: any) {
    console.warn('[RecipeImage] generate-image error for recipe:', recipeId, '—', e?.message);
    return null;
  } finally {
    inFlight.delete(recipeId);
  }
}
